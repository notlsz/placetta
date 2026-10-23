// odelia-voice's newer calls: Odelia calling an agency about a filing, a call bridged to a speech-to-speech brain,
// interpreting on a three-way call, and what every call leaves behind (the recording, only with consent; its
// transcript; the summary; the actions). The decisions are in _shared/voice_calls.ts and _shared/voice_rules.ts, where
// they're tested; this file is the wiring to Telnyx, OpenAI, Groq and the database.
//
// Telnyx Call Control (developers.telnyx.com): POST /calls (to may be a SIP URI; custom_headers go on the INVITE),
// /calls/{id}/actions/{bridge|record_start|record_stop|send_dtmf|hangup|ai_assistant_start}, POST /conferences and
// /conferences/{id}/actions/join. Webhooks: call.answered, call.hangup, call.recording.saved (recording_urls.wav).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { clientState, normalizePhone, odeliaNumber, signCallToken, telnyx, type TelnyxResult, voiceReady } from "../_shared/odelia.ts";
import { linkOf } from "../_shared/odelia_db.ts";
import { AGENCY_TOOLS, agencyTool, type FilingRow, planAgencyCall, type TeamNumber } from "../_shared/voice_calls.ts";
import { type BrainId, type Lang, type TtsId, openAiSipUri, perMinute, phoneReady, pickBrain, sessionConfig, type SessionSpec, type Surface } from "../_shared/voice_brain.ts";
import { agencyOpen, commitmentsSaid, mergeTurns, type Seg, splitStereoWav } from "../_shared/voice_rules.ts";
import { GLOSSARY, interpreterGreeting, interpreterInstructions, registryTerms } from "../_shared/interpreter.ts";
import { AGENCY_LINES, lineForForm } from "../_shared/agency_phones.ts";

export type SpecWithBrain = SessionSpec & { brain: BrainId; tts?: TtsId };
type Deps = {
  admin: SupabaseClient; env: (k: string) => string | undefined; self: string; monitorKey: () => Promise<string>;
  cmd: (ccid: string, action: string, body: Record<string, unknown>) => Promise<TelnyxResult>;
  ownerSpec: (ccid: string) => Promise<SpecWithBrain | null>;
};
let D: Deps;
export const setupCalls = (d: Deps) => { D = d; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exp = () => Math.floor(Date.now() / 1000) + 2 * 3600;

type Row = {
  id: string; workspace_id: string; user_id: string | null; filing_id: string | null; kind: Surface; direction: string; brain: BrainId; agency_key: string | null; number: string | null;
  lang: Lang; status: string; call_control_id: string | null; provider_call_id: string | null; consent: string; recording_path: string | null; transcript: unknown[]; summary: { en: string; zh?: string } | null;
  actions: Record<string, unknown>[]; flags: unknown[]; started_at: string; answered_at: string | null; ended_at: string | null; priced_at: string | null;
};
const rowById = async (id: string) => UUID.test(id) ? ((await D.admin.from("voice_calls").select("*").eq("id", id).maybeSingle()).data as Row | null) : null;
const rowByCall = async (ccid: string) => ((await D.admin.from("voice_calls").select("*").or(`call_control_id.eq.${ccid},provider_call_id.eq.${ccid}`).limit(1).maybeSingle()).data as Row | null);
const addAction = async (r: Row, a: Record<string, unknown>) => {
  const fresh = await rowById(r.id);
  await D.admin.from("voice_calls").update({ actions: [...(fresh?.actions ?? []), { at: new Date().toISOString(), ...a }].slice(-40) }).eq("id", r.id);
};
const addFlag = async (r: Row, why: string) => {
  const fresh = await rowById(r.id);
  await D.admin.from("voice_calls").update({ flags: [...(fresh?.flags ?? []), why].slice(-20) }).eq("id", r.id);
};
async function teamTask(r: Row, kind: "handoff" | "check_agency" | "review", title: string, detail: unknown, key: string) {
  await D.admin.from("team_tasks").upsert({ kind, filing_id: r.filing_id, workspace_id: r.workspace_id, title: title.slice(0, 300), detail, dedupe: `voice:${key}:${r.id}` }, { onConflict: "dedupe", ignoreDuplicates: true });
}

/* ------------------------------ owner calls and the bridge to a brain ------------------------------ */

/** An owner's call, in voice_calls so it shows in Calls and can be played back. */
export async function ownerCallStarted(o: { ccid: string; workspace_id: string; user_id: string; number: string | null; brain: BrainId; lang: Lang; direction: "in" | "out" }) {
  await D.admin.from("voice_calls").upsert({ call_control_id: o.ccid, workspace_id: o.workspace_id, user_id: o.user_id, kind: "owner_phone", direction: o.direction, brain: o.brain,
    number: o.number, lang: o.lang, status: "live", consent: "announced" }, { onConflict: "call_control_id", ignoreDuplicates: true });
}

/**
 * A second leg from Placetta's Telnyx number to OpenAI's SIP endpoint, carrying the call's signed token in
 * X-Placetta-Call; when it answers it's bridged to the caller (or joined to the interpreter's conference). OpenAI's
 * webhook arrives meanwhile and is accepted with the session for that token.
 */
export async function bridgeToBrain(o: { peer: string; token: string; lang: Lang; record: boolean; conference?: string }): Promise<{ ok: boolean }> {
  const project = D.env("OPENAI_SIP_PROJECT");
  if (!project) return { ok: false };
  const r = await telnyx(D.env, "/calls", {
    connection_id: D.env("TELNYX_SIP_CONNECTION_ID") ?? D.env("TELNYX_VOICE_CONNECTION_ID"), to: openAiSipUri(project), from: odeliaNumber(D.env), webhook_url: D.self,
    custom_headers: [{ name: "X-Placetta-Call", value: await signCallToken(await D.monitorKey(), o.token, exp()) }],
    client_state: clientState({ k: "ai", peer: o.peer, r: o.record ? 1 : 0, l: o.lang, ...(o.conference ? { conf: o.conference } : {}) }), timeout_secs: 20, command_id: `ai-${o.peer}`.slice(0, 120),
  });
  const ai = typeof r.data?.call_control_id === "string" ? r.data.call_control_id : "";
  if (!r.ok || !ai) { console.error("bridge to brain", r.status, r.code, r.detail); return { ok: false }; }
  if (!o.conference) await D.admin.from("voice_calls").update({ provider_call_id: ai }).eq("call_control_id", o.peer);
  return { ok: true };
}

const recordStart = (ccid: string) => D.cmd(ccid, "record_start", { format: "wav", channels: "dual", play_beep: false, client_state: clientState({ k: "rec" }) });

/** The session for a token: an owner's call, an agency call, or an interpreter session. Null once the call has ended. */
export async function specForToken(id: string): Promise<SpecWithBrain | null> {
  if (id.startsWith("agency:")) return await agencySpec(id.slice(7));
  if (id.startsWith("interp:")) return await interpSpec(id.slice(7), "phone");
  return await D.ownerSpec(id);
}

/* ------------------------------ Odelia calls an agency ------------------------------ */

type Said = { en: string; zh: string };
type Out = { ok: true; call_id: string } | { ok: false; code: string; say: Said };
const NO: Record<string, Said> = {
  bad: { en: "That filing wasn't found.", zh: "没有找到这份申请。" },
  not_configured: { en: "Calls aren't set up yet, so Odelia can't phone the agency. The daily status check keeps watching the filing.", zh: "通话功能尚未开通，Odelia 暂时无法致电机构。每日状态检查会继续跟进。" },
  plan_required: { en: "Calling agencies is part of a Placetta plan. Pick a plan in Settings to turn it on.", zh: "致电机构是快哉方案的功能。请在设置中选择方案开通。" },
  entry_ended: { en: "Your entry plan has ended. Move to a yearly plan to keep calling agencies.", zh: "入门方案已结束。升级为年度方案即可继续致电机构。" },
  over_budget: { en: "This period's Odelia allowance is used up. Add a pack in Settings; the daily status check carries on meanwhile.", zh: "本期 Odelia 额度已用完。请在设置中加购；每日状态检查会继续进行。" },
  voice_budget: { en: "Calls have used their share of this period's allowance. Odelia will keep checking online; add a pack in Settings to call again.", zh: "本期通话额度已用完。Odelia 会继续在网上查询；在设置中加购即可再次通话。" },
  rate_limited: { en: "Odelia has already called about this today. She'll try again tomorrow, or ask the team in the app.", zh: "Odelia 今天已为此致电过。她明天会再试，或在应用中询问团队。" },
  dial_failed: { en: "The call didn't go through. Odelia will try again in the next business hours.", zh: "电话没有接通。Odelia 会在下一个办公时间再试。" },
};

async function filingAndBusiness(filingId: string): Promise<{ f: FilingRow & { app_id: string }; business: string; team: TeamNumber[] } | null> {
  if (!UUID.test(filingId)) return null;
  const { data: f } = await D.admin.from("filings").select("id, workspace_id, app_id, title, agency, status, confirmation_number, submitted_at, payload").eq("id", filingId).maybeSingle();
  if (!f) return null;
  const [{ data: w }, { data: team }] = await Promise.all([
    D.admin.from("workspaces").select("name").eq("id", f.workspace_id).maybeSingle(),
    D.admin.from("agency_phone_numbers").select("agency_key, number, tz"),
  ]);
  return { f: f as FilingRow & { app_id: string }, business: String(w?.name ?? ""), team: (team ?? []) as TeamNumber[] };
}

/** Place a status call: every check in planAgencyCall, then the caps (voice_gate), then the dial. The caller (the voice
 *  function or a tool on a call) has already checked that the person may act in this workspace. */
export async function agencyCall(o: { filing_id: string; user_id: string; lang: Lang }): Promise<Out> {
  const got = await filingAndBusiness(o.filing_id);
  if (!got || !UUID.test(o.user_id)) return { ok: false, code: "bad", say: NO.bad };
  const plan = planAgencyCall({ filing: got.f, business: got.business, lang: o.lang, now: new Date(), env: D.env, team: got.team });
  if (!plan.ok) return plan;
  if (!voiceReady(D.env) && !phoneReady(plan.brain, D.env)) return { ok: false, code: "not_configured", say: NO.not_configured };
  const { data: g } = await D.admin.rpc("voice_gate", { ws: got.f.workspace_id, uid: o.user_id, p_kind: "agency_phone", p_filing: got.f.id, p_usd_per_min: plan.usdPerMin });
  const gate = (g ?? { ok: false, code: "over_budget" }) as { ok: boolean; code?: string; max_minutes?: number };
  if (!gate.ok) return { ok: false, code: gate.code ?? "over_budget", say: NO[gate.code ?? "over_budget"] ?? NO.over_budget };
  const { data: row } = await D.admin.from("voice_calls").insert({ workspace_id: got.f.workspace_id, user_id: o.user_id, filing_id: got.f.id, kind: "agency_phone", direction: "out",
    brain: plan.brain, agency_key: plan.line.key, number: plan.line.number, lang: o.lang, status: "dialing", consent: "announced" }).select("id").single();
  const id = String(row?.id ?? "");
  const r = await telnyx(D.env, "/calls", {
    connection_id: D.env("TELNYX_VOICE_CONNECTION_ID"), to: plan.line.number, from: odeliaNumber(D.env), webhook_url: D.self,
    client_state: clientState({ k: "agency", v: id, l: o.lang }), timeout_secs: 45, time_limit_secs: Math.max(60, (gate.max_minutes ?? 15) * 60), command_id: `agency-${id}`,
  });
  const ccid = typeof r.data?.call_control_id === "string" ? r.data.call_control_id : "";
  if (!r.ok || !ccid) {
    console.error("agency dial", r.status, r.code, r.detail);
    await D.admin.from("voice_calls").update({ status: "failed", ended_at: new Date().toISOString() }).eq("id", id);
    return { ok: false, code: "dial_failed", say: NO.dial_failed };
  }
  await D.admin.from("voice_calls").update({ call_control_id: ccid }).eq("id", id);
  return { ok: true, call_id: id };
}

async function agencySpec(id: string): Promise<SpecWithBrain | null> {
  const row = await rowById(id);
  if (!row || row.ended_at || !row.filing_id) return null;
  const got = await filingAndBusiness(row.filing_id);
  if (!got) return null;
  // the hours were checked when it was dialed; rebuild the session as of then
  const plan = planAgencyCall({ filing: got.f, business: got.business, lang: row.lang, now: new Date(row.started_at), env: D.env, team: got.team });
  if (!plan.ok) return null;
  return { ...plan.spec, brain: row.brain, ...(plan.tts ? { tts: plan.tts } : {}), toolUrl: `${D.self}${row.brain === "telnyx" ? "" : "?mcp=1"}`, token: await signCallToken(await D.monitorKey(), `agency:${id}`, exp()) };
}

/** One tool the brain used on an agency call: decided by agencyTool, applied here. */
export async function agencyToolCall(id: string, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const row = await rowById(id);
  if (!row || row.ended_at || !row.filing_id || !row.call_control_id) return { ok: false, result: "The call has ended." };
  if (!AGENCY_TOOLS.some((t) => t.name === name)) return { ok: false, result: "That isn't something Odelia can do on this call." };
  const { data: f } = await D.admin.from("filings").select("app_id").eq("id", row.filing_id).maybeSingle();
  const line = row.agency_key ? AGENCY_LINES[row.agency_key] : null;
  const agency = line ? (row.lang === "zh" ? line.agency.zh : line.agency.en) : "The agency";
  const { effects, reply } = agencyTool(name, args, { agency, now: new Date(), lang: row.lang });
  for (const e of effects) {
    if (e.kind === "dtmf") await D.cmd(row.call_control_id, "send_dtmf", { digits: e.digits, duration_millis: 250 });
    if (e.kind === "event" || e.kind === "recap") {
      // one event a call (filing_events_once): the first of log_status and save_recap wins
      const ins = await D.admin.from("filing_events").insert({ workspace_id: row.workspace_id, filing_id: row.filing_id, ...e.event, call_id: row.id, dedupe: `call:${row.id}` });
      if (ins.error && ins.error.code !== "23505") console.error("call event", ins.error.code);
      const norm = e.kind === "event" ? e.norm : e.recap.status;
      await D.admin.from("filing_tracking").upsert({ filing_id: row.filing_id, workspace_id: row.workspace_id, agency_status: e.event.status, agency_norm: norm, agency_status_at: new Date().toISOString(), last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "filing_id" });
      if (e.escalate) await teamTask(row, "handoff", `Agency call: ${e.event.title.en}`, { call: row.id }, "escalate");
      await addAction(row, { kind: "timeline", title: e.event.title });
    }
    if (e.kind === "recap") await D.admin.from("voice_calls").update({ summary: { en: e.recap.summary_en || e.event.title.en, zh: e.recap.summary_zh || e.event.title.zh } }).eq("id", row.id);
    if (e.kind === "owner") {
      await D.admin.from("updates").upsert({ workspace_id: row.workspace_id, kind: "filing", app_id: f?.app_id ?? null, title: e.title, body: { en: "Odelia didn't agree to anything on the call. Decide in the app, and Odelia or the team will answer the agency.", zh: "Odelia 在通话中没有答应任何事。请在应用中决定，Odelia 或团队会回复机构。" },
        dedupe: `needs_you:call:${row.id}:${e.commit}` }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
      await addAction(row, { kind: "approval", title: e.title });
    }
    if (e.kind === "team") { await teamTask(row, "handoff", `Agency call needs the team: ${e.reason}`, { call: row.id, reason: e.reason }, "team"); await addAction(row, { kind: "team", title: { en: "Handed to the Placetta team", zh: "已交给快哉团队" } }); }
    if (e.kind === "stop_recording") { await D.cmd(row.call_control_id, "record_stop", {}); await D.admin.from("voice_calls").update({ consent: "refused" }).eq("id", row.id); }
    if (e.kind === "flag") { await addFlag(row, e.why); await teamTask(row, "check_agency", `Agency call: something said on the line read like instructions to an AI (${e.why})`, { call: row.id }, "flag"); }
  }
  return { ok: true, result: reply };
}

/* ------------------------------ interpreting on a three-way call ------------------------------ */

/** Odelia calls the owner, then the agency's official line, and interprets between them in one conference. Needs the
 *  speech-to-speech brain on SIP; without it, the app's Interpreter (phone on the counter) is the way. */
export async function interpretCall(o: { filing_id: string; user_id: string }): Promise<Out> {
  const got = await filingAndBusiness(o.filing_id);
  if (!got || !UUID.test(o.user_id)) return { ok: false, code: "bad", say: NO.bad };
  const pick = pickBrain({ surface: "interpreter_phone", lang: "zh", env: D.env });
  if (pick.brain === "telnyx" || !phoneReady(pick.brain, D.env)) return { ok: false, code: "not_configured", say: { en: "Interpreting on a phone call needs the speech-to-speech voice, which isn't set up yet. Use Interpreter in the app, with the phone on the counter.", zh: "电话三方翻译需要语音模型，尚未开通。请在应用中使用“翻译”，把手机放在柜台上。" } };
  const line = lineForForm(got.f.payload?.official);
  if (!line) return { ok: false, code: "no_line", say: { en: "Placetta doesn't have this agency's official line, so Odelia can't bring them on the call. Use Interpreter in the app when you're there in person.", zh: "快哉没有这家机构的官方电话，无法拉入通话。到现场时请在应用中使用“翻译”。" } };
  const open = agencyOpen(new Date(), line);
  if (!open.open) return { ok: false, code: "closed", say: { en: `${line.agency.en} is closed right now. Try again in their business hours.`, zh: `${line.agency.zh}现在不在办公时间，请在办公时间再试。` } };
  const link = await linkOf(D.admin, o.user_id);
  const owner = link?.verified_at ? normalizePhone(link.number) : null;
  if (!owner) return { ok: false, code: "no_phone", say: { en: "Link your phone in Settings, Text and call Odelia, so Odelia can call you into the conversation.", zh: "请在设置的“发短信或致电 Odelia”中关联手机，Odelia 才能把您拉入通话。" } };
  const usd = perMinute({ brain: pick.brain, surface: "interpreter_phone", recorded: true });
  const { data: g } = await D.admin.rpc("voice_gate", { ws: got.f.workspace_id, uid: o.user_id, p_kind: "interpreter_phone", p_filing: got.f.id, p_usd_per_min: usd });
  const gate = (g ?? { ok: false, code: "over_budget" }) as { ok: boolean; code?: string };
  if (!gate.ok) return { ok: false, code: gate.code ?? "over_budget", say: NO[gate.code ?? "over_budget"] ?? NO.over_budget };
  const { data: row } = await D.admin.from("voice_calls").insert({ workspace_id: got.f.workspace_id, user_id: o.user_id, filing_id: got.f.id, kind: "interpreter_phone", direction: "out",
    brain: pick.brain, agency_key: line.key, number: line.number, lang: "zh", status: "dialing", consent: "announced" }).select("id").single();
  const id = String(row?.id ?? "");
  const r = await telnyx(D.env, "/calls", { connection_id: D.env("TELNYX_VOICE_CONNECTION_ID"), to: owner, from: odeliaNumber(D.env), webhook_url: D.self,
    client_state: clientState({ k: "interp", v: id, leg: "owner" }), timeout_secs: 30, time_limit_secs: 1800, command_id: `interp-owner-${id}` });
  const ccid = typeof r.data?.call_control_id === "string" ? r.data.call_control_id : "";
  if (!r.ok || !ccid) { await D.admin.from("voice_calls").update({ status: "failed", ended_at: new Date().toISOString() }).eq("id", id); return { ok: false, code: "dial_failed", say: NO.dial_failed }; }
  await D.admin.from("voice_calls").update({ call_control_id: ccid }).eq("id", id);
  return { ok: true, call_id: id };
}

/** The interpreter's session: the glossary plus the filing's own names from the registry. */
export async function interpSpec(id: string, place: "phone" | "counter"): Promise<SpecWithBrain | null> {
  const row = await rowById(id);
  if (!row || row.ended_at) return null;
  const { data: w } = await D.admin.from("workspaces").select("name").eq("id", row.workspace_id).maybeSingle();
  const { data: fs } = await D.admin.from("filings").select("title, agency").eq("workspace_id", row.workspace_id).limit(30);
  const terms = [...registryTerms((fs ?? []) as { title: { en: string; zh: string } }[]), ...GLOSSARY];
  const business = String(w?.name ?? "");
  return { brain: row.brain, lang: "zh", interpret: true, tools: [], instructions: interpreterInstructions({ business, terms, place }), greeting: interpreterGreeting(business),
    terms: terms.flatMap((t) => t.en).slice(0, 80), toolUrl: `${D.self}?mcp=1`, token: await signCallToken(await D.monitorKey(), `interp:${id}`, exp()) };
}

/* ------------------------------ call events ------------------------------ */

type P = { call_control_id?: string; recording_urls?: { wav?: string; mp3?: string }; public_recording_urls?: { wav?: string; mp3?: string }; channels?: string };
/** Telnyx events for the calls this file places. Returns true when it handled the event entirely. */
export async function callsEvent(type: string, p: P, cs: Record<string, unknown>): Promise<boolean> {
  const ccid = p.call_control_id;
  if (!ccid) return false;
  const k = String(cs.k ?? "");
  if (type === "call.answered") {
    if (k === "ai") {
      const peer = String(cs.peer ?? "");
      if (cs.conf) await telnyx(D.env, `/conferences/${encodeURIComponent(String(cs.conf))}/actions/join`, { call_control_id: ccid });
      else await D.cmd(peer, "bridge", { call_control_id: ccid });
      if (cs.r) await recordStart(peer);
      return true;
    }
    if (k === "agency") {
      const row = await rowById(String(cs.v ?? ""));
      if (!row) { await D.cmd(ccid, "hangup", {}); return true; }
      await D.admin.from("voice_calls").update({ status: "live", answered_at: new Date().toISOString() }).eq("id", row.id);
      await recordStart(ccid);
      const spec = await agencySpec(row.id);
      if (!spec) { await D.cmd(ccid, "hangup", {}); return true; }
      if (row.brain === "telnyx") await D.cmd(ccid, "ai_assistant_start", { assistant: sessionConfig("telnyx", spec, D.env, spec.tts), client_state: clientState({ k: "agency_talk", v: row.id }) });
      else if (!(await bridgeToBrain({ peer: ccid, token: `agency:${row.id}`, lang: row.lang, record: false })).ok) await D.cmd(ccid, "hangup", {});
      return true;
    }
    if (k === "interp") {
      const row = await rowById(String(cs.v ?? ""));
      if (!row) { await D.cmd(ccid, "hangup", {}); return true; }
      await addAction(row, { kind: "leg", ccid });
      if (cs.leg === "owner") {
        await D.admin.from("voice_calls").update({ status: "live", answered_at: new Date().toISOString() }).eq("id", row.id);
        const c = await telnyx(D.env, "/conferences", { call_control_id: ccid, name: `interp-${row.id}`, beep_enabled: "never" });
        const conf = typeof c.data?.id === "string" ? c.data.id : "";
        if (!conf) { await D.cmd(ccid, "hangup", {}); return true; }
        await D.admin.from("voice_calls").update({ provider_call_id: conf }).eq("id", row.id);
        await bridgeToBrain({ peer: ccid, token: `interp:${row.id}`, lang: "zh", record: false, conference: conf });
        await telnyx(D.env, "/calls", { connection_id: D.env("TELNYX_VOICE_CONNECTION_ID"), to: row.number, from: odeliaNumber(D.env), webhook_url: D.self,
          client_state: clientState({ k: "interp", v: row.id, leg: "agency", conf }), timeout_secs: 45, time_limit_secs: 1800, command_id: `interp-agency-${row.id}` });
      } else if (cs.conf) {
        await telnyx(D.env, `/conferences/${encodeURIComponent(String(cs.conf))}/actions/join`, { call_control_id: ccid });
        await recordStart(ccid);
      }
      return true;
    }
    return false;
  }
  if (type === "call.recording.saved") { await saveRecording(ccid, p); return true; }
  if (type === "call.hangup") {
    const row = await rowByCall(ccid);
    if (k === "ai") { if (cs.peer && !cs.conf) await D.cmd(String(cs.peer), "hangup", {}); return true; }
    if (row && !row.priced_at) {
      const secs = row.answered_at ? Math.max(0, Math.round((Date.now() - Date.parse(row.answered_at)) / 1000)) : 0;
      const cost = (Math.ceil(secs / 60) * perMinute({ brain: row.brain, surface: row.kind, recorded: row.consent !== "refused" })) + (row.kind === "agency_phone" ? 0.002 : 0);
      await D.admin.rpc("voice_finish", { p_call: row.id, p_seconds: secs, p_cost: Math.round(cost * 10000) / 10000 });
      // the other legs: the brain's (a call id) and, for an interpreter call, everyone in the conference
      if (row.provider_call_id && row.kind !== "interpreter_phone") await D.cmd(row.provider_call_id, "hangup", {});
      for (const a of row.actions) if (a.kind === "leg" && a.ccid !== ccid) await D.cmd(String(a.ccid), "hangup", {});
      if (!row.summary && row.kind !== "agency_phone") {
        const n = row.actions.filter((a) => a.kind !== "leg").length;
        await D.admin.from("voice_calls").update({ summary: { en: `${row.kind === "interpreter_phone" ? "Interpreted call" : row.direction === "in" ? "You called Odelia" : "Odelia called you"}, ${Math.max(1, Math.round(secs / 60))} min${n ? `; ${n} thing${n === 1 ? "" : "s"} started` : ""}.`,
          zh: `${row.kind === "interpreter_phone" ? "翻译通话" : row.direction === "in" ? "您致电 Odelia" : "Odelia 致电您"}，${Math.max(1, Math.round(secs / 60))} 分钟${n ? `；启动了 ${n} 件事` : ""}。` } }).eq("id", row.id);
      }
    }
    return ["agency", "agency_talk", "interp"].includes(k);
  }
  return false;
}

/* ------------------------------ the recording and its transcript ------------------------------ */

/** A finished recording: kept only when nobody objected, in the workspace's own folder of the private bucket, then
 *  transcribed side by side (Telnyx records the far end on the first channel and Placetta's side on the second). */
async function saveRecording(ccid: string, p: P) {
  const row = await rowByCall(ccid);
  if (!row) return;
  if (row.consent === "refused") return;   // someone objected: the file stays unfetched at Telnyx, which deletes it with the call
  const url = p.recording_urls?.wav ?? p.public_recording_urls?.wav;
  if (!url || !/^https:\/\//.test(url)) return;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!res?.ok) { console.error("recording fetch", res?.status); return; }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const path = `${row.workspace_id}/${row.id}.wav`;
  const up = await D.admin.storage.from("call-recordings").upload(path, bytes, { contentType: "audio/wav", upsert: true });
  if (up.error) { console.error("recording upload", up.error.message); return; }
  await D.admin.from("voice_calls").update({ recording_path: path }).eq("id", row.id);
  const sides = splitStereoWav(bytes);
  if (!sides || !D.env("GROQ_API_KEY")) return;
  const [far, ours] = await Promise.all(sides.map((b) => whisper(b)));
  const other = row.kind === "agency_phone" ? "agency" : row.kind === "interpreter_phone" ? "clerk" : "owner";
  const turns = mergeTurns({ who: other, segs: far }, { who: "odelia", segs: ours });
  const promised = commitmentsSaid(turns.filter((t) => t.who === "odelia").map((t) => t.text));
  await D.admin.from("voice_calls").update({ transcript: turns.slice(0, 2000) }).eq("id", row.id);
  if (promised.length) {
    await addFlag(row, `Odelia may have agreed to something: ${promised[0].slice(0, 160)}`);
    await teamTask(row, "review", "On a call, Odelia's words read like a commitment for the business. Listen back and correct it with the agency if needed.", { call: row.id, lines: promised.slice(0, 3) }, "commit");
  }
}

/** One side of a call, transcribed by Whisper large v3 turbo on Groq ($0.04 an hour), with each segment's start time. */
async function whisper(wav: Uint8Array): Promise<Seg[]> {
  if (wav.length > 24 * 1024 * 1024) return [];
  const form = new FormData();
  form.set("model", D.env("STT_MODEL") ?? "whisper-large-v3-turbo"); form.set("response_format", "verbose_json"); form.set("temperature", "0");
  form.set("file", new File([wav as BlobPart], "side.wav", { type: "audio/wav" }));
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${D.env("GROQ_API_KEY")}` }, body: form, signal: AbortSignal.timeout(60000) }).catch(() => null);
  if (!res?.ok) { console.error("whisper", res?.status); return []; }
  const j = await res.json().catch(() => ({})) as { segments?: { start?: number; text?: string }[] };
  return (j.segments ?? []).map((s) => ({ start: Number(s.start ?? 0), text: String(s.text ?? "") }));
}

/** Recordings past their workspace's retention (queued by retention_purge), deleted from storage. */
export async function purgeRecordings(): Promise<{ removed: number }> {
  const { data } = await D.admin.from("voice_purge").select("path").limit(100);
  const paths = (data ?? []).map((r) => String(r.path));
  if (!paths.length) return { removed: 0 };
  const { error } = await D.admin.storage.from("call-recordings").remove(paths);
  if (error) { console.error("purge recordings", error.message); return { removed: 0 }; }
  await D.admin.from("voice_purge").delete().in("path", paths);
  return { removed: paths.length };
}
