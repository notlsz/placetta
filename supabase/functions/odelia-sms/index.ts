// odelia-sms: texting Odelia. People text Placetta's number (ODELIA_NUMBER) from the phone they verified in Settings,
// and Odelia works on it as them, in their workspace, and texts the answer back (agent-run, channel "sms").
//
// POST, signed by Telnyx (telnyx-signature-ed25519)      message.received webhooks from the messaging profile
// POST {action: "line"}                                    anyone: whether texting is set up, and Odelia's number
// POST {action: "send_code", code_id}                      the database (phone_link_start, monitor key): text a code
// POST {action: "flush"}                                   pg_cron every 10 minutes (monitor key): the outbox
//
// Inbound: STOP, START and HELP follow the carriers' rules (Telnyx answers them when the profile has auto-responses;
// otherwise this does). A number nobody verified gets one text explaining how to link it, then nothing for 90 days.
// A verified number starts a run as that person in the workspace they used last ("switch to <name>" changes it);
// "On it." goes out only if the run takes more than 8 seconds. Nothing is filed, paid, sent or deleted by text: the
// reply carries a link to the approval in the app.
// Outbox: what the monitor and finished runs want to tell people, held for quiet hours (9pm to 8am theirs by
// default), at most one call (odelia-voice dials) and three texts a day; pending items go out together in one text.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  appLink, appOrigin, BLOCKED_BY_STOP, inboundFlood, inQuietHours, KEYWORD_REPLY, keyword, type Lang, localMinutes, LIMITS, normalizePhone, odeliaNumber,
  pickWorkspace, prettyPhone, randomCode, SAY, sendSms, smsReady, splitSms, strangerMayGetReply, switchTarget, underDailyLimit, verifyTelnyx, voiceReady,
} from "../_shared/odelia.ts";
import { currentWorkspace, type Link, linkByNumber, linkOf, logMessage, textUser } from "../_shared/odelia_db.ts";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
const env = (k: string) => Deno.env.get(k);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACK_AFTER_MS = 8000;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });
const bg = (p: Promise<unknown>) => { const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime; if (rt) rt.waitUntil(p); else void p; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function monitorKeyOk(key: string | null) {
  if (!key) return false;
  const { data } = await admin.rpc("monitor_key_ok", { p_key: key });
  return data === true;
}
let selfKey: string | null = null;
async function monitorKey() {
  if (!selfKey) { const { data } = await admin.rpc("monitor_key"); selfKey = typeof data === "string" ? data : ""; }
  return selfKey;
}
const internal = async (fn: string, body: Record<string, unknown>) =>
  fetch(`${SUPABASE_URL}/functions/v1/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": await monitorKey() }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });

/** A text to a number with no verified link (keyword replies, the one explanation for strangers), logged without a person. */
async function textNumber(to: string, text: string, userId: string | null = null) {
  const r = await sendSms(env, to, text);
  if (r.ok) await logMessage(admin, { user_id: userId, direction: "out", channel: "sms", kind: "system", body: userId ? text : "", provider_id: r.id });
  else console.error("odelia text", r.status, r.code, r.detail);
  return r.ok;
}

/* ------------------------------ inbound texts ------------------------------ */

type Inbound = { id?: string; from?: { phone_number?: string }; to?: { phone_number?: string }[]; text?: string; media?: unknown[]; autoresponse_type?: string | null };

async function inbound(p: Inbound, logId: number) {
  const now = new Date();
  const from = normalizePhone(p.from?.phone_number)!;
  const text = String(p.text ?? "").trim().slice(0, 1600);
  const link = await linkByNumber(admin, from);
  const lang: Lang = link?.lang ?? (/[㐀-鿿]/.test(text) ? "zh" : "en");
  // Telnyx answers STOP, START and HELP itself when the messaging profile has auto-responses; then it says so here.
  const telnyxAnswered = typeof p.autoresponse_type === "string" && p.autoresponse_type.length > 0;

  const kw = keyword(text);
  if (kw === "stop") {
    if (link) {
      await admin.from("phone_links").update({ opted_out_at: now.toISOString(), updated_at: now.toISOString() }).eq("user_id", link.user_id);
      await admin.from("odelia_outbox").update({ dropped_at: now.toISOString(), note: "opted_out" }).eq("user_id", link.user_id).is("sent_at", null).is("dropped_at", null);
    } else await admin.from("odelia_strangers").upsert({ number: from, opted_out_at: now.toISOString(), last_at: now.toISOString() }, { onConflict: "number" });
    if (!telnyxAnswered) await textNumber(from, KEYWORD_REPLY.stop[lang], link?.user_id ?? null);
    return;
  }
  if (kw === "start") {
    if (link) await admin.from("phone_links").update({ opted_out_at: null, updated_at: now.toISOString() }).eq("user_id", link.user_id);
    else await admin.from("odelia_strangers").update({ opted_out_at: null }).eq("number", from);
    if (!telnyxAnswered) await textNumber(from, KEYWORD_REPLY.start[lang], link?.user_id ?? null);
    return;
  }
  if (kw === "help") {
    if (!telnyxAnswered) await textNumber(from, KEYWORD_REPLY.help[lang], link?.user_id ?? null);
    return;
  }

  // A number nobody verified: one explanation, then nothing.
  if (!link) {
    const { data: s } = await admin.from("odelia_strangers").select("replied_at, opted_out_at, messages").eq("number", from).maybeSingle();
    const reply = !s?.opted_out_at && strangerMayGetReply(s?.replied_at as string | null, now);
    await admin.from("odelia_strangers").upsert({ number: from, last_at: now.toISOString(), messages: Number(s?.messages ?? 0) + 1, ...(reply ? { replied_at: now.toISOString() } : {}) }, { onConflict: "number" });
    if (reply) await textNumber(from, SAY.stranger[lang]);
    return;
  }
  // They texted STOP earlier: only START turns texts back on.
  if (link.opted_out_at) return;

  const since = new Date(now.getTime() - 3600e3).toISOString();
  const { count } = await admin.from("odelia_messages").select("id", { count: "exact", head: true }).eq("user_id", link.user_id).eq("direction", "in").eq("channel", "sms").gt("created_at", since);
  if (inboundFlood((count ?? 1) - 1)) {
    if ((count ?? 0) - 1 === LIMITS.inboundPerHour) await textUser(admin, env, { link, segments: [SAY.flood[lang]], kind: "system" });
    return;
  }

  const { ws, all } = await currentWorkspace(admin, link);
  if (!ws) { await textUser(admin, env, { link, segments: [SAY.noWorkspace[lang]], kind: "system" }); return; }
  await admin.from("odelia_messages").update({ workspace_id: ws.id }).eq("id", logId);

  const target = switchTarget(text);
  if (target && all.length) {
    const hit = pickWorkspace(all, target);
    if (hit) {
      await admin.from("phone_links").update({ last_workspace_id: hit.id, updated_at: now.toISOString() }).eq("user_id", link.user_id);
      await textUser(admin, env, { link, workspace_id: hit.id, segments: [SAY.switched[lang](hit.name)], kind: "system" });
    } else await textUser(admin, env, { link, workspace_id: ws.id, segments: splitSms(SAY.whichWs[lang](all.map((w) => w.name).slice(0, 8)), { max: 1 }), kind: "system" });
    return;
  }
  const hasMedia = Array.isArray(p.media) && p.media.length > 0;
  if (!text) { if (hasMedia) await textUser(admin, env, { link, workspace_id: ws.id, segments: [SAY.picture[lang]], kind: "system" }); return; }

  await startRun(link, ws.id, text + (hasMedia ? (lang === "zh" ? "\n\n（对方还发了一张图片，短信中无法查看。）" : "\n\n(They also sent a picture, which you can't see by text.)") : ""), logId);
}

/** The recent text conversation in this workspace (the last 12 hours), as turns for the agent. */
async function history(link: Link, ws: string, beforeId: number) {
  const { data } = await admin.from("odelia_messages").select("id, direction, kind, body").eq("user_id", link.user_id).eq("workspace_id", ws).eq("channel", "sms")
    .in("kind", ["chat", "reply"]).lt("id", beforeId).gt("created_at", new Date(Date.now() - 12 * 3600e3).toISOString()).order("id", { ascending: false }).limit(8);
  return (data ?? []).reverse().map((m) => ({ role: m.direction === "in" ? "user" : "assistant", content: String(m.body ?? "") }));
}

async function startRun(link: Link, ws: string, prompt: string, logId: number) {
  const lang = link.lang;
  const res = await internal("agent-run", { action: "start_as", user_id: link.user_id, workspace_id: ws, prompt, channel: "sms", reply_to: link.number, lang, history: await history(link, ws, logId) }).catch(() => null);
  if (!res || res.status !== 202) {
    const code = res?.status;
    await textUser(admin, env, { link, workspace_id: ws, kind: "system", segments: [code === 409 ? SAY.busy[lang] : code === 402 ? SAY.noPlan[lang] : code === 403 ? SAY.noWorkspace[lang] : SAY.failed[lang]] });
    return;
  }
  const { id } = await res.json() as { id: string };
  await admin.from("odelia_messages").update({ run_id: id }).eq("id", logId);
  // Only say "On it." when the answer isn't back within 8 seconds.
  await sleep(ACK_AFTER_MS);
  const { data: run } = await admin.from("agent_runs").select("status").eq("id", id).maybeSingle();
  if (run?.status !== "running") return;
  const { count } = await admin.from("odelia_messages").select("id", { count: "exact", head: true }).eq("run_id", id).eq("direction", "out");
  if (!count) await textUser(admin, env, { link, workspace_id: ws, segments: [SAY.ack[lang]], kind: "ack", run_id: id });
}

async function webhook(req: Request) {
  const raw = await req.text();
  const ok = await verifyTelnyx(raw, req.headers.get("telnyx-signature-ed25519") ?? "", req.headers.get("telnyx-timestamp") ?? "", env("TELNYX_PUBLIC_KEY") ?? "");
  if (!ok) return fail(401, "unauthorized", "Bad webhook signature.");
  let ev: { event_type?: string; payload?: Inbound };
  try { ev = JSON.parse(raw)?.data ?? {}; } catch { return fail(400, "bad_request", "Send JSON."); }
  if (ev.event_type !== "message.received") return json(200, { ok: true });   // delivery receipts and the like
  const p = ev.payload ?? {};
  const from = normalizePhone(p.from?.phone_number);
  const to = normalizePhone(p.to?.[0]?.phone_number);
  if (!from || !p.id || (odeliaNumber(env) && to && to !== odeliaNumber(env))) return json(200, { ok: true });
  // Logging first, keyed on Telnyx's message id, makes a retried webhook a no-op.
  const link = await linkByNumber(admin, from);
  const logId = await logMessage(admin, { user_id: link?.user_id ?? null, direction: "in", channel: "sms", kind: "chat", body: link ? String(p.text ?? "").slice(0, 2000) : "", provider_id: String(p.id) });
  if (logId === null) return json(200, { ok: true, duplicate: true });
  bg(inbound(p, logId).catch((e) => console.error("inbound", String(e).slice(0, 200))));
  return json(200, { ok: true });
}

/* ------------------------------ verification codes ------------------------------ */

async function sendCode(codeId: string) {
  if (!UUID.test(codeId)) return fail(400, "bad_request", "code_id is required.");
  const code = randomCode(6);
  // The database keeps only a hash; the code itself exists here and in the text.
  const { data: c, error } = await admin.rpc("phone_code_set", { p_id: codeId, p_code: code });
  if (error || !c) return fail(404, "not_found", "That code request is gone.");
  const row = c as { user_id: string; number: string; lang: Lang | null };
  const setError = (e: string | null) => admin.from("phone_links").update({ last_error: e, updated_at: new Date().toISOString() }).eq("user_id", row.user_id);
  if (!smsReady(env)) { await setError("not_configured"); return fail(503, "not_configured", "Texting isn't set up: set TELNYX_API_KEY, TELNYX_PUBLIC_KEY, ODELIA_NUMBER and TELNYX_MESSAGING_PROFILE_ID."); }
  const lang: Lang = row.lang === "zh" ? "zh" : "en";
  const r = await sendSms(env, row.number, SAY.code[lang](code));
  if (!r.ok) { await setError(r.code === BLOCKED_BY_STOP ? "opted_out" : "send_failed"); return fail(502, "upstream_error", "Couldn't send the code."); }
  await setError(null);
  await logMessage(admin, { user_id: row.user_id, direction: "out", channel: "sms", kind: "code", body: lang === "zh" ? "已发送验证码" : "Sent a verification code", provider_id: r.id });
  return json(200, { ok: true });
}

/* ------------------------------ the outbox ------------------------------ */

type Outbox = { id: string; user_id: string; workspace_id: string | null; kind: "text" | "call"; urgent: boolean; body: string; link: string | null; created_at: string };

/** Anything that waited more than 48 hours is stale: drop it. */
const expireOld = (now: Date) => admin.from("odelia_outbox").update({ dropped_at: now.toISOString(), note: "expired" }).is("sent_at", null).is("dropped_at", null)
  .lt("created_at", new Date(now.getTime() - LIMITS.maxQueuedHours * 3600e3).toISOString());

export async function flush(now = new Date()) {
  await expireOld(now);
  const { data } = await admin.from("odelia_outbox").select("id, user_id, workspace_id, kind, urgent, body, link, created_at").is("sent_at", null).is("dropped_at", null)
    .order("urgent", { ascending: false }).order("created_at").limit(500);
  const byUser = new Map<string, Outbox[]>();
  for (const r of (data ?? []) as Outbox[]) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  const mark = (ids: string[], o: Record<string, unknown>) => (ids.length ? admin.from("odelia_outbox").update(o).in("id", ids) : Promise.resolve());
  let texts = 0, calls = 0;

  for (const [uid, items] of byUser) {
    const link = await linkOf(admin, uid);
    if (!link?.verified_at || link.opted_out_at || (!link.texts_on && !link.calls_on)) { await mark(items.map((i) => i.id), { dropped_at: now.toISOString(), note: "no_phone" }); continue; }
    if (inQuietHours(now, link.tz, link.quiet_start, link.quiet_end)) continue;   // held until their morning
    // their own day so far
    const dayStart = new Date(now.getTime() - localMinutes(now, link.tz) * 60e3).toISOString();
    const sentToday = async (channel: "sms" | "voice") => {
      const { count } = await admin.from("odelia_messages").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("direction", "out").eq("channel", channel).in("kind", ["update", "urgent"]).gte("created_at", dayStart);
      return count ?? 0;
    };
    let rest = items;
    // At most one call a day, only for urgent items, only if they want calls and voice is set up.
    const call = items.find((i) => i.kind === "call" && i.urgent);
    if (call && link.calls_on && voiceReady(env) && underDailyLimit("call", await sentToday("voice"))) {
      const { count: live } = await admin.from("odelia_calls").select("call_control_id", { count: "exact", head: true }).eq("user_id", uid).is("ended_at", null).gt("created_at", new Date(now.getTime() - 15 * 60e3).toISOString());
      if (!live) {
        const res = await internal("odelia-voice", { action: "dial", outbox_id: call.id }).catch(() => null);
        if (res?.ok) { calls++; rest = items.filter((i) => i.id !== call.id); }
      }
    }
    if (!rest.length) continue;
    if (!link.texts_on) { await mark(rest.filter((i) => !i.urgent).map((i) => i.id), { dropped_at: now.toISOString(), note: "texts_off" }); continue; }
    if (!underDailyLimit("text", await sentToday("sms"))) {
      // Over today's three: the routine ones go (they'd be stale tomorrow), urgent ones wait for tomorrow.
      await mark(rest.filter((i) => !i.urgent).map((i) => i.id), { dropped_at: now.toISOString(), note: "daily_limit" });
      continue;
    }
    // Claim them first, so a second sweep running at the same moment can't send them again.
    const { data: claimed } = await admin.from("odelia_outbox").update({ sent_at: now.toISOString() }).in("id", rest.map((i) => i.id)).is("sent_at", null).is("dropped_at", null).select("id");
    const mine = new Set((claimed ?? []).map((c) => c.id as string));
    rest = rest.filter((i) => mine.has(i.id));
    if (!rest.length) continue;
    // Everything waiting goes out together, as one text.
    const lang = link.lang;
    const origin = appOrigin(env);
    const one = rest.length === 1 ? rest[0] : null;
    const tail = one?.link || appLink(origin, rest[0].workspace_id);
    const body = one ? one.body
      : lang === "zh" ? `快哉：有 ${rest.length} 件事需要您处理。${rest.slice(0, 4).map((i) => i.body.replace(/^快哉：/, "")).join("；")}`
      : `Placetta: ${rest.length} things need you. ${rest.slice(0, 4).map((i) => i.body.replace(/^Placetta: /, "")).join("; ")}`;
    const r = await textUser(admin, env, { link, workspace_id: rest[0].workspace_id, segments: splitSms(body, { max: 1, lang, tail: tail || undefined }), kind: rest.some((i) => i.urgent) ? "urgent" : "update" });
    if (r.ok) texts++;
    else if (r.code === "opted_out" || r.code === BLOCKED_BY_STOP) await mark(rest.map((i) => i.id), { sent_at: null, dropped_at: now.toISOString(), note: "opted_out" });
    else await mark(rest.map((i) => i.id), { sent_at: null });   // try again at the next sweep
  }
  return { users: byUser.size, texts, calls };
}

/* ------------------------------ requests ------------------------------ */

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  if (req.headers.get("telnyx-signature-ed25519")) return await webhook(req);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Send JSON."); }
  // Public: whether texting and calls are set up, and the number to save. No secrets.
  if (body.action === "line") {
    const n = odeliaNumber(env);
    return json(200, { configured: smsReady(env), voice: voiceReady(env), number: n, display: n ? prettyPhone(n) : null });
  }
  if (!(await monitorKeyOk(req.headers.get("x-monitor-key")))) return fail(401, "unauthorized", "unauthorized");
  if (body.action === "send_code") return await sendCode(String(body.code_id ?? ""));
  if (body.action === "flush") {
    if (!smsReady(env)) { await expireOld(new Date()); return fail(503, "not_configured", "Texting isn't set up."); }
    return json(200, { ok: true, ...(await flush()) });
  }
  return fail(400, "bad_request", "Unknown action.");
}

if (import.meta.main) Deno.serve(handle);
