// voice: the app's side of talking with Odelia. Every action needs the person's session and their access to the
// workspace (members, admins and owners act; viewers only list and listen).
//
// POST {action: "session", workspace_id, mode: "talk"|"interpreter"|"rehearse", lang, filing_id?}
//   A short-lived key for the browser to talk to the voice brain directly (WebRTC to OpenAI's Realtime), with the session
//   (instructions, voice, turn-taking, tools) set here on the server. The browser never sees the instructions or the
//   model. "talk": Odelia, with the workspace and three tools the app answers (start_task, call_agency, hand_to_team).
//   "interpreter": the phone on the counter between a Chinese-speaking owner and an English-speaking clerk.
//   "rehearse": try an agency call live, with the person playing the clerk: nothing is dialed or written.
// POST {action: "end", workspace_id, call_id, seconds, transcript}   the session's transcript, its price and summary
// POST {action: "tool", workspace_id, call_id, name, args}           a tool the brain called in a "talk" session
// POST {action: "agency_call" | "interpret_call", workspace_id, filing_id, lang}   Odelia phones the agency (odelia-voice)
// GET-like {action: "list", workspace_id, filing_id?}                 Calls: every conversation, newest first
// POST {action: "media", workspace_id, call_id}                       a signed link to the recording, 10 minutes
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { accessRpc, WORKS } from "../_shared/access.ts";
import { type Lang, workspaceBrief } from "../_shared/odelia.ts";
import { browserConnect, perMinute, pickBrain, sessionConfig, type SessionSpec, type Surface } from "../_shared/voice_brain.ts";
import { AGENCY_TOOLS, planAgencyCall, type FilingRow, type TeamNumber } from "../_shared/voice_calls.ts";
import { disclosure, redactForVoice } from "../_shared/voice_rules.ts";
import { bilingualTranscript, GLOSSARY, interpreterGreeting, interpreterInstructions, registryTerms } from "../_shared/interpreter.ts";
import { zdrAllows } from "../_shared/zdr.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
const env = (k: string) => Deno.env.get(k);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Why a session can't start, and what to do instead. */
const REFUSE: Record<string, { en: string; zh: string; status: number }> = {
  not_configured: { status: 503, en: "Talking with Odelia isn't set up on the server yet. Type to her instead, or use the microphone in the message box.", zh: "服务器尚未开通语音对话。请改为打字，或使用输入框里的麦克风。" },
  plan_required: { status: 402, en: "Talking with Odelia is part of a Placetta plan. Pick one in Settings; typing works meanwhile.", zh: "语音对话是快哉方案的功能。请在设置中选择方案；在此之前可以打字。" },
  entry_ended: { status: 402, en: "Your entry plan has ended. Move to a yearly plan to keep talking with Odelia.", zh: "入门方案已结束。升级为年度方案即可继续语音对话。" },
  over_budget: { status: 402, en: "This period's Odelia allowance is used up. Add a pack in Settings, or type: typing costs far less.", zh: "本期 Odelia 额度已用完。请在设置中加购，或改为打字。" },
  voice_budget: { status: 402, en: "Voice has used its share of this period's allowance. Type to Odelia, or add a pack in Settings.", zh: "本期语音额度已用完。请改为打字，或在设置中加购。" },
  rate_limited: { status: 429, en: "That's a lot of talking for one hour. Type to Odelia, or try again in a little while.", zh: "这一小时语音用得较多。请改为打字，或稍后再试。" },
};

async function authed(req: Request, body: Record<string, unknown>) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data } = await admin.auth.getUser(jwt);
  const user = data?.user;
  if (!user) return { error: fail(401, "unauthorized", "Sign in again.") };
  const ws = String(body.workspace_id ?? "");
  if (!UUID.test(ws)) return { error: fail(400, "bad_request", "workspace_id is required.") };
  const { data: role, error } = await accessRpc(admin, ws, user.id, jwt);
  const access = error ? "none" : String(role);
  if (access === "mfa_required") return { error: fail(401, "mfa_required", "Finish two-step sign-in to continue.") };
  if (access === "sso_required") return { error: fail(401, "sso_required", "Your company requires single sign-on. Sign in with SSO to continue.") };
  if (!WORKS.has(access) && access !== "viewer" && access !== "staff") return { error: fail(403, "forbidden", "This isn't your workspace.") };
  return { user, ws, access, acts: WORKS.has(access) };
}

async function filingOf(ws: string, id: unknown): Promise<(FilingRow & { app_id: string }) | null> {
  if (!UUID.test(String(id ?? ""))) return null;
  const { data } = await admin.from("filings").select("id, workspace_id, app_id, title, agency, status, confirmation_number, submitted_at, payload").eq("id", String(id)).eq("workspace_id", ws).maybeSingle();
  return (data as FilingRow & { app_id: string } | null) ?? null;
}

/* ------------------------------ a session in the app ------------------------------ */

const APP_TOOLS: SessionSpec["tools"] = [
  { name: "start_task", description: "Start real work (mapping a store, preparing or renewing an application, drafting a letter, researching a rule). It appears in the chat and runs like a typed request.", properties: { request: { type: "string", description: "What they want done, in their words, with every detail" } }, required: ["request"] },
  { name: "call_agency", description: "Ask the agency by phone about one filing's status. Odelia calls the agency's official line during its hours.", properties: { filing: { type: "string", description: "The filing's name as they said it" } }, required: ["filing"] },
  { name: "hand_to_team", description: "Hand the conversation to a person on the Placetta team.", properties: { reason: { type: "string" } }, required: ["reason"] },
];

function talkInstructions(lang: Lang, business: string, brief: string) {
  return [
    `You are Odelia, the AI compliance agent at Placetta (快哉), talking with someone at ${business} in the Placetta app. You get business licenses, permits and registrations done and keep them current. You are an AI and say so if asked.`,
    `Speak ${lang === "zh" ? "Mandarin Chinese (普通话)" : "English"} unless they switch. Keep each turn to one to three short spoken sentences, one question at a time, no lists, no links read out. If they talk over you, stop and listen.`,
    "Answer from the workspace summary below. For real work, call start_task with their request in their words; it shows in the chat and they approve anything final there. To ask an agency about a filing by phone, call call_agency. If they want a person, call hand_to_team.",
    "You never file, pay, send, delete or approve anything by voice, and you never take or say Social Security, ITIN, bank or card numbers: those happen in the app with their approval.",
    `Workspace (read only, JSON):\n${brief}`,
  ].join("\n\n");
}

async function session(req: Request, body: Record<string, unknown>) {
  const a = await authed(req, body);
  if ("error" in a) return a.error!;
  if (!a.acts) return fail(403, "forbidden", "View-only access can listen to calls but not start one. Ask an owner for member access.");
  const mode = body.mode === "interpreter" ? "interpreter" : body.mode === "rehearse" ? "rehearse" : "talk";
  const lang: Lang = body.lang === "zh" ? "zh" : "en";
  const surface: Surface = mode === "interpreter" ? "app_interpreter" : mode === "rehearse" ? "rehearse" : "app_talk";
  const pick = pickBrain({ surface, lang: mode === "interpreter" ? "zh" : lang, env });
  const key = env("OPENAI_API_KEY");
  if (!key || (pick.brain !== "openai" && pick.brain !== "openai_mini") || !zdrAllows(env, "openai")) return fail(503, "not_configured", REFUSE.not_configured[lang]);
  const usd = perMinute({ brain: pick.brain, surface });
  const filing = body.filing_id ? await filingOf(a.ws, body.filing_id) : null;
  if (body.filing_id && !filing) return fail(404, "not_found", lang === "zh" ? "没有找到这份申请。" : "That filing wasn't found.");
  const { data: g } = await admin.rpc("voice_gate", { ws: a.ws, uid: a.user.id, p_kind: surface, p_filing: filing?.id ?? null, p_usd_per_min: usd });
  const gate = (g ?? { ok: false, code: "over_budget" }) as { ok: boolean; code?: string; max_minutes?: number; retry_after?: number };
  if (!gate.ok) { const r = REFUSE[gate.code ?? "over_budget"] ?? REFUSE.over_budget; return fail(r.status, gate.code ?? "over_budget", r[lang]); }

  const { data: w } = await admin.from("workspaces").select("name, state").eq("id", a.ws).maybeSingle();
  const business = String(w?.name ?? "");
  let spec: SessionSpec;
  if (mode === "interpreter") {
    const { data: fs } = await admin.from("filings").select("title, agency").eq("workspace_id", a.ws).limit(30);
    const terms = [...registryTerms((fs ?? []) as { title: { en: string; zh: string } }[]), ...GLOSSARY];
    spec = { lang: "zh", interpret: true, client: true, tools: [], instructions: interpreterInstructions({ business, terms, place: "counter" }), greeting: interpreterGreeting(business), terms: terms.flatMap((t) => t.en).slice(0, 80), toolUrl: "", token: "" };
  } else if (mode === "rehearse") {
    if (!filing) return fail(400, "bad_request", lang === "zh" ? "请选择要演练的申请。" : "Pick the filing to rehearse.");
    const { data: team } = await admin.from("agency_phone_numbers").select("agency_key, number, tz");
    const plan = planAgencyCall({ filing, business, lang, now: new Date(), env, team: (team ?? []) as TeamNumber[], rehearse: true });
    if (!plan.ok) return fail(409, plan.code, plan.say[lang]);
    spec = { ...plan.spec, client: true, tools: AGENCY_TOOLS, toolUrl: "", token: "",
      instructions: `${plan.spec.instructions}\n\nThis is a rehearsal in the Placetta app: the person you're talking to plays the agency's clerk. Run the call exactly as you would for real.` };
  } else {
    const [{ data: filings }, { data: updates }] = await Promise.all([
      admin.from("filings").select("title, status, confirmation_number, updated_at").eq("workspace_id", a.ws).neq("status", "canceled").order("updated_at", { ascending: false }).limit(12),
      admin.from("updates").select("title, created_at").eq("workspace_id", a.ws).order("created_at", { ascending: false }).limit(6),
    ]);
    const brief = redactForVoice(workspaceBrief({ name: business, state: w?.state ?? {}, filings: filings ?? [], updates: updates ?? [], lang, today: new Date().toISOString().slice(0, 10) }));
    spec = { lang, client: true, tools: APP_TOOLS, instructions: talkInstructions(lang, business, brief), greeting: disclosure(lang, { business, to: "owner" }) + (lang === "zh" ? "有什么可以帮您？" : " What can I do for you?"), terms: [business, "Placetta", "Odelia"], toolUrl: "", token: "" };
  }
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 120 }, session: sessionConfig(pick.brain, spec, env) }), signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  const j = res?.ok ? await res.json().catch(() => null) as { value?: string } | null : null;
  if (!j?.value) { console.error("realtime client secret", res?.status); return fail(502, "upstream_error", lang === "zh" ? "语音服务没有响应，请再试一次，或改为打字。" : "The voice service didn't answer. Try again, or type instead."); }
  const { data: row } = await admin.from("voice_calls").insert({ workspace_id: a.ws, user_id: a.user.id, filing_id: filing?.id ?? null, kind: surface, direction: "app", brain: pick.brain, lang, status: "live", answered_at: new Date().toISOString(), consent: "none" }).select("id").single();
  return json(200, { call_id: row?.id, secret: j.value, connect: browserConnect(pick.brain), max_minutes: gate.max_minutes ?? 10 });
}

/* ------------------------------ after a session, tools, calls ------------------------------ */

type Line = { who?: string; at?: number; text?: string; translated?: string };
async function end(req: Request, body: Record<string, unknown>) {
  const a = await authed(req, body);
  if ("error" in a) return a.error!;
  const id = String(body.call_id ?? "");
  if (!UUID.test(id)) return fail(400, "bad_request", "call_id is required.");
  const { data: row } = await admin.from("voice_calls").select("id, workspace_id, user_id, filing_id, kind, brain, priced_at").eq("id", id).eq("workspace_id", a.ws).eq("user_id", a.user.id).maybeSingle();
  if (!row || row.priced_at || !String(row.kind).startsWith("app_") && row.kind !== "rehearse") return fail(404, "not_found", "That conversation isn't open.");
  const lines = (Array.isArray(body.transcript) ? body.transcript : []).slice(0, 600) as Line[];
  const clean = (s: unknown) => redactForVoice(String(s ?? "").replace(/[\u0000-\u0008\u000B-\u001F]/g, " ").slice(0, 2000));
  const transcript = row.kind === "app_interpreter"
    ? bilingualTranscript(lines.map((l) => ({ at: Number(l.at) || 0, said: clean(l.text), translated: clean(l.translated) })))
    : lines.map((l) => ({ who: l.who === "odelia" ? "odelia" : "owner", at: Number(l.at) || 0, text: clean(l.text) })).filter((l) => l.text);
  const secs = Math.max(0, Math.min(Number(body.seconds) || 0, 3600));
  const n = transcript.length, mins = Math.max(1, Math.round(secs / 60));
  const summary = row.kind === "app_interpreter"
    ? { en: `Interpreted at the counter, ${mins} min, ${n} lines in English and Chinese.`, zh: `现场翻译 ${mins} 分钟，共 ${n} 句中英对照。` }
    : row.kind === "rehearse" ? { en: `Rehearsed the agency call, ${mins} min. Nothing was dialed or saved to the filing.`, zh: `演练机构通话 ${mins} 分钟，未拨出电话，也未写入申请。` }
    : { en: `Talked with Odelia, ${mins} min.`, zh: `与 Odelia 语音对话 ${mins} 分钟。` };
  await admin.from("voice_calls").update({ transcript, summary, status: "ended", ended_at: new Date().toISOString() }).eq("id", id);
  await admin.rpc("voice_finish", { p_call: id, p_seconds: secs, p_cost: Math.round(Math.ceil(secs / 60) * perMinute({ brain: row.brain, surface: row.kind }) * 10000) / 10000 });
  if (row.kind === "app_interpreter" && row.filing_id) {
    // the bilingual transcript is attached to the filing, on its timeline
    await admin.from("filing_events").insert({ workspace_id: a.ws, filing_id: row.filing_id, kind: "note", source: "odelia", call_id: id, confidence: 1,
      title: { en: `Interpreted conversation at the counter, ${mins} min`, zh: `现场翻译对话 ${mins} 分钟` }, dedupe: `call:${id}` });
  }
  return json(200, { ok: true, summary });
}

/** A tool the brain called in an app session, answered by the server with the person's own access. */
async function tool(req: Request, body: Record<string, unknown>) {
  const a = await authed(req, body);
  if ("error" in a) return a.error!;
  if (!a.acts) return fail(403, "forbidden", "View-only access can't start work.");
  const id = String(body.call_id ?? ""), name = String(body.name ?? ""), args = (body.args && typeof body.args === "object" ? body.args : {}) as Record<string, unknown>;
  const { data: row } = await admin.from("voice_calls").select("id, kind, lang, ended_at").eq("id", UUID.test(id) ? id : "00000000-0000-0000-0000-000000000000").eq("workspace_id", a.ws).eq("user_id", a.user.id).maybeSingle();
  if (!row || row.ended_at || row.kind !== "app_talk") return fail(404, "not_found", "That conversation isn't open.");
  const lang: Lang = row.lang === "zh" ? "zh" : "en";
  const note = async (act: Record<string, unknown>) => {
    const { data: cur } = await admin.from("voice_calls").select("actions").eq("id", id).maybeSingle();
    await admin.from("voice_calls").update({ actions: [...((cur?.actions as unknown[]) ?? []), { at: new Date().toISOString(), ...act }].slice(-40) }).eq("id", id);
  };
  if (name === "start_task") {
    // the app sends it as a typed request; the server only records that the conversation started it
    const request = String(args.request ?? "").trim().slice(0, 2000);
    if (!request) return json(200, { ok: false, result: "Ask what they want done." });
    await note({ kind: "task", title: { en: `Started: ${request.slice(0, 120)}`, zh: `已启动：${request.slice(0, 120)}` } });
    return json(200, { ok: true, start: request, result: "Started in the chat. Tell them you're on it." });
  }
  if (name === "hand_to_team") {
    await admin.from("team_tasks").upsert({ kind: "handoff", workspace_id: a.ws, title: `Odelia handed an app conversation to the team: ${String(args.reason ?? "").slice(0, 200)}`, detail: { call: id }, dedupe: `voice-handoff:${id}` }, { onConflict: "dedupe", ignoreDuplicates: true });
    await note({ kind: "team", title: { en: "Handed to the Placetta team", zh: "已交给快哉团队" } });
    return json(200, { ok: true, result: "The Placetta team has it and will reply in the app within one business day. Tell them so." });
  }
  if (name === "call_agency") {
    const named = String(args.filing ?? "").toLowerCase();
    const { data } = await admin.from("filings").select("id, title").eq("workspace_id", a.ws).in("status", ["submitted", "needs_info", "in_progress"]).limit(20);
    const list = (data ?? []) as { id: string; title: { en?: string; zh?: string } | null }[];
    const hits = list.filter((f) => named.split(/\s+/).filter((x) => x.length > 2).some((x) => `${f.title?.en ?? ""} ${f.title?.zh ?? ""}`.toLowerCase().includes(x)));
    const one = hits.length === 1 ? hits[0] : list.length === 1 ? list[0] : null;
    if (!one) return json(200, { ok: false, result: list.length ? `Ask which one: ${list.slice(0, 5).map((f) => f.title?.[lang] || f.title?.en).join("; ")}.` : "Nothing is with an agency right now. Tell them so." });
    const r = await viaOdeliaVoice("agency_call", { workspace_id: a.ws, filing_id: one.id, user_id: a.user.id, lang });
    if (r.ok) await note({ kind: "agency_call", title: { en: `Calling the agency about ${one.title?.en ?? "the filing"}`, zh: `正在致电机构询问${one.title?.zh ?? "申请"}` } });
    return json(200, r.ok ? { ok: true, result: "Odelia is calling the agency now; the answer will be on the filing's timeline." } : { ok: false, result: `Tell them: ${r.say?.[lang] ?? "the call couldn't be placed."}` });
  }
  return json(200, { ok: false, result: "That isn't available in the app." });
}

async function viaOdeliaVoice(action: string, payload: Record<string, unknown>): Promise<{ ok: boolean; call_id?: string; say?: { en: string; zh: string } }> {
  const { data: key } = await admin.rpc("monitor_key");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/odelia-voice`, { method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": String(key ?? "") },
    body: JSON.stringify({ action, ...payload }), signal: AbortSignal.timeout(15000) }).catch(() => null);
  return (await res?.json().catch(() => null)) ?? { ok: false, say: { en: "The call couldn't be placed. Try again later.", zh: "电话没能拨出，请稍后再试。" } };
}

async function phone(req: Request, body: Record<string, unknown>, action: "agency_call" | "interpret_call") {
  const a = await authed(req, body);
  if ("error" in a) return a.error!;
  if (!a.acts) return fail(403, "forbidden", "View-only access can't place calls.");
  const f = await filingOf(a.ws, body.filing_id);
  if (!f) return fail(404, "not_found", "That filing wasn't found.");
  const r = await viaOdeliaVoice(action, { workspace_id: a.ws, filing_id: f.id, user_id: a.user.id, lang: body.lang === "zh" ? "zh" : "en" });
  return json(200, r);   // a refusal is an answer: it says what happens instead
}

async function list(req: Request, body: Record<string, unknown>) {
  const a = await authed(req, body);
  if ("error" in a) return a.error!;
  let q = admin.from("voice_calls").select("id, kind, direction, filing_id, lang, status, consent, recording_path, transcript, summary, actions, flags, started_at, ended_at, seconds, agency_key")
    .eq("workspace_id", a.ws).neq("kind", "rehearse").order("started_at", { ascending: false }).limit(50);
  if (body.filing_id && UUID.test(String(body.filing_id))) q = q.eq("filing_id", String(body.filing_id));
  const { data } = await q;
  // what the browser gets: no brain, no number, no cost; whether there is a recording, not where
  return json(200, { calls: (data ?? []).map(({ recording_path, actions, ...c }) => ({ ...c, recorded: !!recording_path, actions: (actions as { kind?: string }[]).filter((x) => x.kind !== "leg") })) });
}

async function media(req: Request, body: Record<string, unknown>) {
  const a = await authed(req, body);
  if ("error" in a) return a.error!;
  const id = String(body.call_id ?? "");
  if (!UUID.test(id)) return fail(400, "bad_request", "call_id is required.");
  const { data: row } = await admin.from("voice_calls").select("recording_path").eq("id", id).eq("workspace_id", a.ws).maybeSingle();
  // the path is always under this workspace's own folder; checked again so a row can never hand out another's file
  if (!row?.recording_path || !String(row.recording_path).startsWith(`${a.ws}/`)) return fail(404, "not_found", "There's no recording of this call (nobody recorded it, or it's past the workspace's retention).");
  const { data, error } = await admin.storage.from("call-recordings").createSignedUrl(String(row.recording_path), 600);
  if (error || !data?.signedUrl) return fail(502, "upstream_error", "The recording couldn't be opened. Try again.");
  return json(200, { url: data.signedUrl, expires_in: 600 });
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Send JSON."); }
  switch (body.action) {
    case "session": return await session(req, body);
    case "end": return await end(req, body);
    case "tool": return await tool(req, body);
    case "agency_call": return await phone(req, body, "agency_call");
    case "interpret_call": return await phone(req, body, "interpret_call");
    case "list": return await list(req, body);
    case "media": return await media(req, body);
  }
  return fail(400, "bad_request", "Unknown action.");
}

if (import.meta.main) Deno.serve(handle);
