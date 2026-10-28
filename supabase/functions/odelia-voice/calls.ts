// odelia-voice's newer calls: Odelia calling an agency about a filing, a call bridged to a speech-to-speech brain,
// interpreting on a three-way call, and what every call leaves behind (the recording, only with consent; its
// transcript; the summary; the actions). The decisions are in _shared/voice_calls.ts and _shared/voice_rules.ts, where
// they're tested; this file is the wiring to Telnyx, OpenAI, Groq and the database.
//
// Telnyx Call Control (developers.telnyx.com): POST /calls (to may be a SIP URI; custom_headers go on the INVITE),
// /calls/{id}/actions/{bridge|record_start|record_stop|record_pause|record_resume|send_dtmf|hangup|speak|
// ai_assistant_start|ai_assistant_stop|transcription_start|transcription_stop}, POST /conferences and
// /conferences/{id}/actions/join. Webhooks: call.answered, call.hangup, call.recording.saved (recording_urls.wav),
// call.transcription (transcription_data: transcript, is_final), call.speak.ended.
//
// Agency calls park the brain while on hold (_shared/voice_hold.ts): the brain's leg is let go, the recording paused,
// and a Soniox transcription of the agency's side listens for a person; then the re-entry line is spoken and a brain
// leg dialed again with the call's context. The hold machine's state is voice_calls.hold, changed only by compare and
// set on its version, since Telnyx's webhooks arrive in parallel.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { clientState, normalizePhone, odeliaNumber, signCallToken, telnyx, type TelnyxResult, voiceReady } from "../_shared/odelia.ts";
import { linkOf } from "../_shared/odelia_db.ts";
import { AGENCY_TOOLS, agencyTool, type FilingRow, planAgencyCall, type TeamNumber } from "../_shared/voice_calls.ts";
import { type BrainId, callCost, failoverBrain, type Lang, type TtsId, openAiSipUri, perMinute, phoneReady, pickBrain, pickTts, sessionConfig, type SessionSpec, type Surface } from "../_shared/voice_brain.ts";
import { callLimits, carrierTimeLimitSecs, type HoldCmd, type HoldCtx, type HoldEvent, type HoldState, holdStep, holdSttCommand, holdSummary, newHold, pastLimit, retryAfterMs, WRAP_LINE } from "../_shared/voice_hold.ts";
import { agencyOpen, callRecordingAllowed, commitmentsSaid, mergeTurns, type Seg, splitStereoWav } from "../_shared/voice_rules.ts";
import { GLOSSARY, interpreterGreeting, interpreterInstructions, registryTerms } from "../_shared/interpreter.ts";
import { AGENCY_LINES, lineForForm } from "../_shared/agency_phones.ts";

export type SpecWithBrain = SessionSpec & { brain: BrainId; tts?: TtsId };
type Deps = {
  admin: SupabaseClient; env: (k: string) => string | undefined; self: string; monitorKey: () => Promise<string>;
  cmd: (ccid: string, action: string, body: Record<string, unknown>) => Promise<TelnyxResult>;
  ownerSpec: (ccid: string) => Promise<SpecWithBrain | null>;
  /** An owner's call whose speech-to-speech brain failed: Telnyx's own assistant takes it (the last brain in the list). */
  ownerFallback?: (ccid: string) => Promise<boolean>;
};
let D: Deps;
export const setupCalls = (d: Deps) => { D = d; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exp = () => Math.floor(Date.now() / 1000) + 2 * 3600;

type Row = {
  id: string; workspace_id: string; user_id: string | null; filing_id: string | null; kind: Surface; direction: string; brain: BrainId; agency_key: string | null; number: string | null;
  lang: Lang; status: string; call_control_id: string | null; provider_call_id: string | null; consent: string; recording_path: string | null; transcript: unknown[]; summary: { en: string; zh?: string } | null;
  actions: Record<string, unknown>[]; flags: unknown[]; started_at: string; answered_at: string | null; ended_at: string | null; priced_at: string | null;
  hold: HoldState | null; held_seconds: number; talk_seconds: number; holds: number; outcome: string | null; retry_at: string | null; retried_at: string | null; retry_of: string | null;
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

/** Whether a call with this person on it may be recorded (voice_rules.ts callRecordingAllowed): in California, or where
 *  nothing says where, only with their opt-in; elsewhere announced at the start. Any failure: not recorded. */
export async function mayRecordCall(ws: string | null | undefined, uid: string | null | undefined): Promise<boolean> {
  if (!ws || !uid) return false;
  const { data, error } = await D.admin.rpc("recording_policy_for", { p_ws: ws, p_uid: uid });
  if (error) { console.error("recording policy", error.code ?? "error"); return false; }
  return callRecordingAllowed(data);
}
/** The decision made when the call started, kept on its row: "announced" is recorded, anything else isn't. */
export async function callRecorded(ccid: string): Promise<boolean> {
  const { data } = await D.admin.from("voice_calls").select("consent").eq("call_control_id", ccid).maybeSingle();
  return (data as { consent?: string } | null)?.consent === "announced";
}

/** An owner's call, in voice_calls so it shows in Calls and can be played back (only when record: see mayRecordCall). */
export async function ownerCallStarted(o: { ccid: string; workspace_id: string; user_id: string; number: string | null; brain: BrainId; lang: Lang; direction: "in" | "out"; record: boolean }) {
  await D.admin.from("voice_calls").upsert({ call_control_id: o.ccid, workspace_id: o.workspace_id, user_id: o.user_id, kind: "owner_phone", direction: o.direction, brain: o.brain,
    number: o.number, lang: o.lang, status: "live", consent: o.record ? "announced" : "none" }, { onConflict: "call_control_id", ignoreDuplicates: true });
}

/**
 * A second leg from Placetta's Telnyx number to OpenAI's SIP endpoint, carrying the call's signed token in
 * X-Placetta-Call; when it answers it's bridged to the caller (or joined to the interpreter's conference). OpenAI's
 * webhook arrives meanwhile and is accepted with the session for that token.
 */
export async function bridgeToBrain(o: { peer: string; token: string; lang: Lang; record: boolean; conference?: string; v?: string; n?: number }): Promise<{ ok: boolean }> {
  const project = D.env("OPENAI_SIP_PROJECT");
  if (!project) return { ok: false };
  const r = await telnyx(D.env, "/calls", {
    connection_id: D.env("TELNYX_SIP_CONNECTION_ID") ?? D.env("TELNYX_VOICE_CONNECTION_ID"), to: openAiSipUri(project), from: odeliaNumber(D.env), webhook_url: D.self,
    custom_headers: [{ name: "X-Placetta-Call", value: await signCallToken(await D.monitorKey(), o.token, exp()) }],
    // v: the agency call this leg serves, so its events reach the hold machine; n: a new leg after each hold or failover
    client_state: clientState({ k: "ai", peer: o.peer, r: o.record ? 1 : 0, l: o.lang, ...(o.conference ? { conf: o.conference } : {}), ...(o.v ? { v: o.v } : {}) }), timeout_secs: 20,
    command_id: `ai-${o.peer}${o.n ? `-${o.n}` : ""}`.slice(0, 120),
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

async function filingAndBusiness(filingId: string, ws: string): Promise<{ f: FilingRow & { app_id: string }; business: string; team: TeamNumber[] } | null> {
  if (!UUID.test(filingId) || !UUID.test(ws)) return null;
  const { data: f } = await D.admin.from("filings").select("id, workspace_id, app_id, title, agency, status, confirmation_number, submitted_at, payload").eq("id", filingId).eq("workspace_id", ws).maybeSingle();
  if (!f) return null;
  const [{ data: w }, { data: team }] = await Promise.all([
    D.admin.from("workspaces").select("name").eq("id", f.workspace_id).maybeSingle(),
    D.admin.from("agency_phone_numbers").select("agency_key, number, tz"),
  ]);
  return { f: f as FilingRow & { app_id: string }, business: String(w?.name ?? ""), team: (team ?? []) as TeamNumber[] };
}

/** Place a status call: every check in planAgencyCall, then the caps (voice_gate), then the dial. The caller (the voice
 *  function or a tool on a call) has already checked that the person may act in this workspace. */
export async function agencyCall(o: { workspace_id: string; filing_id: string; user_id: string; lang: Lang; retry_of?: string }): Promise<Out> {
  const got = await filingAndBusiness(o.filing_id, o.workspace_id);
  if (!got || !UUID.test(o.user_id)) return { ok: false, code: "bad", say: NO.bad };
  const plan = planAgencyCall({ filing: got.f, business: got.business, lang: o.lang, now: new Date(), env: D.env, team: got.team });
  if (!plan.ok) return plan;
  if (!voiceReady(D.env) && !phoneReady(plan.brain, D.env)) return { ok: false, code: "not_configured", say: NO.not_configured };
  const { data: g } = await D.admin.rpc("voice_gate", { ws: got.f.workspace_id, uid: o.user_id, p_kind: "agency_phone", p_filing: got.f.id, p_usd_per_min: plan.usdPerMin });
  const gate = (g ?? { ok: false, code: "over_budget" }) as { ok: boolean; code?: string; max_minutes?: number };
  if (!gate.ok) return { ok: false, code: gate.code ?? "over_budget", say: NO[gate.code ?? "over_budget"] ?? NO.over_budget };
  // up to VOICE_HOLD_MAX_MIN on hold (the brain parked) and VOICE_TALK_MAX_MIN talking (never past what the allowance
  // pays for); Telnyx's own time limit is the backstop behind both
  const limits = callLimits(D.env, gate.max_minutes ?? null);
  const { data: row } = await D.admin.from("voice_calls").insert({ workspace_id: got.f.workspace_id, user_id: o.user_id, filing_id: got.f.id, kind: "agency_phone", direction: "out",
    brain: plan.brain, agency_key: plan.line.key, number: plan.line.number, lang: o.lang, status: "dialing", consent: "announced",
    hold: { ...newHold(limits, Date.now()), tried: [plan.brain] }, ...(o.retry_of && UUID.test(o.retry_of) ? { retry_of: o.retry_of } : {}) }).select("id").single();
  const id = String(row?.id ?? "");
  const r = await telnyx(D.env, "/calls", {
    connection_id: D.env("TELNYX_VOICE_CONNECTION_ID"), to: plan.line.number, from: odeliaNumber(D.env), webhook_url: D.self,
    client_state: clientState({ k: "agency", v: id, l: o.lang }), timeout_secs: 45, time_limit_secs: carrierTimeLimitSecs(limits), command_id: `agency-${id}`,
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
  const got = await filingAndBusiness(row.filing_id, row.workspace_id);
  if (!got) return null;
  // the hours were checked when it was dialed; rebuild the session as of then
  const plan = planAgencyCall({ filing: got.f, business: got.business, lang: row.lang, now: new Date(row.started_at), env: D.env, team: got.team });
  if (!plan.ok) return null;
  const h = row.hold;
  // after a hold or a failover the brain joins a call under way: what was just said for it, and what happened so far
  const resume = h?.joined && (h.holds > 0 || h.failovers > 0) ? { said: h.said ?? null, context: resumeContext(row, h) } : undefined;
  const tts = row.brain === "telnyx" ? (plan.tts ?? pickTts(row.lang, D.env)) : undefined;
  return { ...plan.spec, ...(resume ? { resume } : {}), brain: row.brain, ...(tts ? { tts } : {}), toolUrl: `${D.self}${row.brain === "telnyx" ? "" : "?mcp=1"}`, token: await signCallToken(await D.monitorKey(), `agency:${id}`, exp()) };
}

/** What the brain needs to pick a call back up: how long it waited, keys pressed, and what it already did. Only Placetta's
 *  own records; what was heard on hold isn't passed on as instructions (it's data, and mostly music). */
function resumeContext(row: Row, h: HoldState): string {
  const done = row.actions.filter((a) => a.kind === "timeline" || a.kind === "approval" || a.kind === "team")
    .map((a) => String((a.title as { en?: string } | undefined)?.en ?? a.kind)).slice(-5);
  return [
    `So far: on hold ${Math.round(h.heldMs / 60e3)} min in all${h.presses.length ? `; keys pressed on the hold menu: ${h.presses.join(", ")}` : ""}.`,
    done.length ? `Already done on this call: ${done.join("; ")}. Don't log or ask those again unless the person says something new.` : "Nothing is logged yet: identify the filing, ask its status, and recap, as in your steps.",
    "If this is a new person, they may need the confirmation number again.",
  ].join(" ");
}

/** One tool the brain used on an agency call: decided by agencyTool, applied here. */
export async function agencyToolCall(id: string, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const row = await rowById(id);
  if (!row || row.ended_at || !row.filing_id || !row.call_control_id) return { ok: false, result: "The call has ended." };
  if (!AGENCY_TOOLS.some((t) => t.name === name)) return { ok: false, result: "That isn't something Odelia can do on this call." };
  const { data: f } = await D.admin.from("filings").select("app_id").eq("id", row.filing_id).maybeSingle();
  const line = row.agency_key ? AGENCY_LINES[row.agency_key] : null;
  const agency = line ? (row.lang === "zh" ? line.agency.zh : line.agency.en) : "The agency";
  const { effects, reply } = agencyTool(name, args, { agency, now: new Date(), lang: row.lang, menu: line?.menu?.digits ?? null });
  for (const e of effects) {
    if (e.kind === "dtmf") await D.cmd(row.call_control_id, "send_dtmf", { digits: e.digits, duration_millis: 250 });
    if (e.kind === "hold") { await holdEvent(row.id, { type: "brain_hold", at: Date.now() }); await addAction(row, { kind: "hold", heard: e.heard.slice(0, 120) }); }
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

/* ------------------------------ hold parking (voice_hold.ts decides; this applies it) ------------------------------ */

const SPEAK: Record<Lang, { voice: string; language: string }> = {
  en: { voice: "AWS.Polly.Joanna-Neural", language: "en-US" }, zh: { voice: "AWS.Polly.Zhiyu-Neural", language: "cmn-CN" },
};
const speakVoice = (lang: Lang) => ({ voice: D.env(`ODELIA_VOICE_${lang.toUpperCase()}`) ?? SPEAK[lang].voice, language: SPEAK[lang].language });

/** Change a call's hold state only if nobody else changed it since it was read (webhooks arrive in parallel). */
async function casHold(row: Row, next: HoldState): Promise<boolean> {
  const { data } = await D.admin.from("voice_calls").update({ hold: next }).eq("id", row.id).eq("hold->>v", String(row.hold?.v ?? 0)).select("id");
  return !!data?.length;
}
async function patchHold(id: string, fn: (h: HoldState, row: Row) => HoldState | null): Promise<{ row: Row; before: HoldState; after: HoldState } | null> {
  for (let i = 0; i < 4; i++) {
    const row = await rowById(id);
    if (!row?.hold) return null;
    const after = fn(row.hold, row);
    if (!after) return null;
    if (await casHold(row, { ...after, v: row.hold.v + 1 })) return { row, before: row.hold, after: { ...after, v: row.hold.v + 1 } };
  }
  console.error("hold state busy", id);
  return null;
}

async function holdCtx(row: Row): Promise<HoldCtx> {
  const got = row.filing_id ? await filingAndBusiness(row.filing_id, row.workspace_id) : null;
  const conf = got?.f.confirmation_number;
  const title = (row.lang === "zh" ? got?.f.title?.zh : got?.f.title?.en) || got?.f.title?.en || (row.lang === "zh" ? "申请" : "the application");
  return { lang: row.lang, business: got?.business ?? "", about: conf ? `${row.lang === "zh" ? "申请" : "application"} ${conf}` : title, recorded: row.consent === "announced" };
}

/** One event on an agency call through the hold machine, and its commands sent to Telnyx. */
export async function holdEvent(id: string, ev: HoldEvent): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const row = await rowById(id);
    if (!row?.hold || !row.call_control_id || (row.ended_at && ev.type !== "hangup")) return;
    const ctx = await holdCtx(row);
    const { state, cmds } = holdStep(row.hold, ev, ctx);
    if (state === row.hold) return;
    // most lines heard on hold change nothing (interim results, music read as words): no write, so parallel webhooks don't
    // fight over the row; the clock is kept by `since`, so nothing is lost
    const same = (h: HoldState) => JSON.stringify({ ...h, v: 0, since: 0, heldMs: 0, talkMs: 0 });
    if (!cmds.length && same(state) === same(row.hold)) return;
    // the re-entry line plays before the brain is bridged in, so the person hears all of it
    const next = cmds.some((c) => c.kind === "speak" && !c.then) ? { ...state, wire: { speaking: true, pending_ai: null } } : state;
    if (!(await casHold(row, next))) continue;
    await applyHold({ ...row, hold: next }, cmds, ctx);
    return;
  }
  console.error("hold state busy", id, ev.type);
}

async function applyHold(row: Row, cmds: HoldCmd[], ctx: HoldCtx) {
  const ccid = row.call_control_id!;
  const h = row.hold!;
  for (const c of cmds) {
    try {
      if (c.kind === "detach_brain") {
        // the brain's leg ends (OpenAI stops billing); for Telnyx's engine, its assistant stops. The leg's hangup event
        // finds the call parked and leaves the agency's line up.
        if (row.brain === "telnyx") await D.cmd(ccid, "ai_assistant_stop", {});
        else if (row.provider_call_id) await D.cmd(row.provider_call_id, "hangup", { command_id: `park-${row.id}-${h.v}` });
      }
      if (c.kind === "record_pause") await D.cmd(ccid, "record_pause", {});
      if (c.kind === "record_resume") await D.cmd(ccid, "record_resume", {});
      if (c.kind === "stt_start") await D.cmd(ccid, "transcription_start", { ...holdSttCommand(row.lang, D.env), client_state: clientState({ k: "hold", v: row.id }), command_id: `stt-${row.id}-${h.v}` });
      if (c.kind === "stt_stop") await D.cmd(ccid, "transcription_stop", {});
      if (c.kind === "dtmf") await D.cmd(ccid, "send_dtmf", { digits: c.digits, duration_millis: 250 });
      if (c.kind === "speak") {
        await D.cmd(ccid, "speak", { payload: c.text, payload_type: "text", ...speakVoice(row.lang),
          client_state: clientState(c.then === "hangup" ? { k: "bye", l: row.lang } : { k: "reentry", v: row.id }), command_id: `say-${row.id}-${h.v}` });
      }
      if (c.kind === "hangup") await D.cmd(ccid, "hangup", {});
      if (c.kind === "attach_brain") await attachBrain(row, c.failover === true, ctx);
    } catch (e) { console.error("hold command", c.kind, String(e).slice(0, 160)); }
  }
}

/** Bring a brain onto the agency's line: the same one after a hold, the next in the list after a failure. */
async function attachBrain(row: Row, failover: boolean, ctx: HoldCtx) {
  const ccid = row.call_control_id!;
  let brain: BrainId | null = row.brain;
  if (failover) {
    brain = failoverBrain({ surface: "agency_phone", tried: (row.hold?.tried ?? [row.brain]) as BrainId[], env: D.env });
    if (!brain) {
      await D.cmd(ccid, "speak", { payload: WRAP_LINE[ctx.lang], payload_type: "text", ...speakVoice(row.lang), client_state: clientState({ k: "bye", l: row.lang }) });
      await addFlag(row, "every voice brain failed on this call");
      return;
    }
    await D.admin.from("voice_calls").update({ brain }).eq("id", row.id);
    await patchHold(row.id, (h) => ({ ...h, tried: [...(h.tried ?? []), brain!] }));
    await addAction(row, { kind: "failover", brain });
  }
  if (brain === "telnyx") {
    const spec = await agencySpec(row.id);
    const r = spec ? await D.cmd(ccid, "ai_assistant_start", { assistant: sessionConfig("telnyx", spec, D.env, spec.tts), client_state: clientState({ k: "agency_talk", v: row.id }) }) : { ok: false };
    await holdEvent(row.id, { type: r.ok ? "brain_attached" : "brain_lost", at: Date.now() });
    return;
  }
  const b = await bridgeToBrain({ peer: ccid, token: `agency:${row.id}`, lang: row.lang, record: false, v: row.id, n: (row.hold?.v ?? 0) + 1 });
  if (!b.ok) await holdEvent(row.id, { type: "brain_lost", at: Date.now() });
}

/** Calls past a limit (hold or talk) wrapped up, and retries that are due placed: the per-minute sweep while either is due
 *  (pg_cron, migration 20261105090700). */
export async function holdSweep(now = Date.now()): Promise<{ wrapped: number; retried: number }> {
  let wrapped = 0, retried = 0;
  const { data: live } = await D.admin.from("voice_calls").select("id, hold").eq("kind", "agency_phone").in("status", ["live"]).not("hold", "is", null).limit(200);
  for (const r of (live ?? []) as { id: string; hold: HoldState }[]) {
    if (pastLimit(r.hold, now)) { await holdEvent(r.id, { type: "tick", at: now }); wrapped++; }
  }
  const { data: due } = await D.admin.from("voice_calls").select("id, workspace_id, filing_id, user_id, lang, retry_of").eq("outcome", "retry").is("retried_at", null).lte("retry_at", new Date(now).toISOString()).limit(20);
  for (const r of (due ?? []) as { id: string; workspace_id: string; filing_id: string | null; user_id: string | null; lang: Lang; retry_of: string | null }[]) {
    const { data: claimed } = await D.admin.from("voice_calls").update({ retried_at: new Date(now).toISOString() }).eq("id", r.id).is("retried_at", null).select("id");
    if (!claimed?.length || !r.filing_id || !r.user_id) continue;
    const root = r.retry_of ?? r.id;
    const { count } = await D.admin.from("voice_calls").select("id", { count: "exact", head: true }).eq("retry_of", root);
    if ((count ?? 0) >= 2) continue;   // two retries after the first call; then the daily status check carries on
    const out = await agencyCall({ workspace_id: r.workspace_id, filing_id: r.filing_id, user_id: r.user_id, lang: r.lang, retry_of: root });
    if (out.ok) { retried++; continue; }
    // closed or rate limited: try again in an hour (the hours check and the caps decide again then)
    if (out.code === "closed" || out.code === "rate_limited" || out.code === "dial_failed")
      await D.admin.from("voice_calls").update({ retried_at: null, retry_at: new Date(now + 3600e3).toISOString() }).eq("id", r.id);
  }
  return { wrapped, retried };
}

/* ------------------------------ interpreting on a three-way call ------------------------------ */

/** Odelia calls the owner, then the agency's official line, and interprets between them in one conference. Needs the
 *  speech-to-speech brain on SIP; without it, the app's Interpreter (phone on the counter) is the way. */
export async function interpretCall(o: { workspace_id: string; filing_id: string; user_id: string }): Promise<Out> {
  const got = await filingAndBusiness(o.filing_id, o.workspace_id);
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
    brain: pick.brain, agency_key: line.key, number: line.number, lang: "zh", status: "dialing", consent: (await mayRecordCall(got.f.workspace_id, o.user_id)) ? "announced" : "none" }).select("id").single();
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
  return { brain: row.brain, lang: "zh", interpret: true, tools: [], instructions: interpreterInstructions({ business, terms, place }), greeting: interpreterGreeting(business, place === "phone" && row.consent === "announced"),
    terms: terms.flatMap((t) => t.en).slice(0, 80), toolUrl: `${D.self}?mcp=1`, token: await signCallToken(await D.monitorKey(), `interp:${id}`, exp()) };
}

/* ------------------------------ call events ------------------------------ */

type P = { call_control_id?: string; recording_urls?: { wav?: string; mp3?: string }; public_recording_urls?: { wav?: string; mp3?: string }; channels?: string;
  transcription_data?: { transcript?: string; is_final?: boolean; confidence?: number }; hangup_cause?: string };
/** Telnyx events for the calls this file places. Returns true when it handled the event entirely. */
export async function callsEvent(type: string, p: P, cs: Record<string, unknown>): Promise<boolean> {
  const ccid = p.call_control_id;
  if (!ccid) return false;
  const k = String(cs.k ?? "");
  // the hold listener: one line heard on the agency's side while the brain is parked
  if (type === "call.transcription" && k === "hold") {
    const t = p.transcription_data;
    if (t?.transcript) await holdEvent(String(cs.v ?? ""), { type: "heard", at: Date.now(), text: String(t.transcript), final: t.is_final !== false });
    return true;
  }
  // the re-entry line finished: a brain leg that answered meanwhile is bridged in now
  if (type === "call.speak.ended" && k === "reentry") {
    const done = await patchHold(String(cs.v ?? ""), (h) => ({ ...h, wire: { speaking: false, pending_ai: null } }));
    const pending = done?.before.wire?.pending_ai;
    if (done && pending) { await D.cmd(ccid, "bridge", { call_control_id: pending }); await holdEvent(done.row.id, { type: "brain_attached", at: Date.now() }); }
    return true;
  }
  if (type === "call.answered") {
    if (k === "ai") {
      const peer = String(cs.peer ?? "");
      if (cs.v) {
        // an agency call's brain leg: wait for the re-entry line if it's still playing
        const waited = await patchHold(String(cs.v), (h) => (h.wire?.speaking ? { ...h, wire: { speaking: true, pending_ai: ccid } } : null));
        if (waited) return true;
        await D.cmd(peer, "bridge", { call_control_id: ccid });
        await holdEvent(String(cs.v), { type: "brain_attached", at: Date.now() });
        return true;
      }
      if (cs.conf) await telnyx(D.env, `/conferences/${encodeURIComponent(String(cs.conf))}/actions/join`, { call_control_id: ccid });
      else await D.cmd(peer, "bridge", { call_control_id: ccid });
      if (cs.r) await recordStart(peer);
      return true;
    }
    if (k === "agency") {
      const row = await rowById(String(cs.v ?? ""));
      if (!row) { await D.cmd(ccid, "hangup", {}); return true; }
      const at = Date.now();
      await D.admin.from("voice_calls").update({ status: "live", answered_at: new Date(at).toISOString() }).eq("id", row.id);
      // the call's clock starts when the agency answers
      if (row.hold) await patchHold(row.id, (h) => ({ ...h, since: at }));
      await recordStart(ccid);
      const spec = await agencySpec(row.id);
      if (!spec) { await D.cmd(ccid, "hangup", {}); return true; }
      if (row.brain === "telnyx") await D.cmd(ccid, "ai_assistant_start", { assistant: sessionConfig("telnyx", spec, D.env, spec.tts), client_state: clientState({ k: "agency_talk", v: row.id }) });
      else if (!(await bridgeToBrain({ peer: ccid, token: `agency:${row.id}`, lang: row.lang, record: false, v: row.id })).ok) {
        // the brain's leg couldn't be placed: the next brain, or a polite goodbye (holdEvent brain_lost decides)
        await holdEvent(row.id, { type: "brain_lost", at: Date.now() });
      }
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
        // the owner is on this call: recorded only as decided when it was placed (mayRecordCall), and then announced
        if (row.consent === "announced") await recordStart(ccid);
      }
      return true;
    }
    return false;
  }
  if (type === "call.recording.saved") { await saveRecording(ccid, p); return true; }
  if (type === "call.hangup") {
    if (k === "ai" && cs.v) {
      // an agency call's brain leg ended. Parked on purpose, an older leg, or the call already over: nothing to do. Otherwise
      // the brain failed mid-call: the next brain picks the call up (holdEvent brain_lost).
      const row = await rowById(String(cs.v));
      if (!row?.hold || row.ended_at || row.hold.phase === "parked" || row.hold.phase === "ended" || (row.provider_call_id && row.provider_call_id !== ccid)) return true;
      await holdEvent(row.id, { type: "brain_lost", at: Date.now() });
      return true;
    }
    if (k === "ai") {
      // an owner's brain leg: a normal end ends the call; a failure hands the caller to Telnyx's assistant when it's set up
      const failed = !!p.hangup_cause && p.hangup_cause !== "normal_clearing";
      if (cs.peer && !cs.conf && !(failed && D.ownerFallback && await D.ownerFallback(String(cs.peer)).catch(() => false))) await D.cmd(String(cs.peer), "hangup", {});
      return true;
    }
    const row = await rowByCall(ccid);
    if (row && !row.priced_at) {
      const now = Date.now();
      const secs = row.answered_at ? Math.max(0, Math.round((now - Date.parse(row.answered_at)) / 1000)) : 0;
      // an agency call: minutes with the brain on at the brain's rate, minutes parked at the carrier's (voice_hold.ts)
      const h = row.hold && row.answered_at ? holdStep(row.hold, { type: "hangup", at: now }, await holdCtx(row)).state : null;
      const talkSecs = h ? Math.round(h.talkMs / 1000) : secs, heldSecs = h ? Math.round(h.heldMs / 1000) : 0;
      const cost = callCost({ brain: row.brain, surface: row.kind, recorded: row.consent !== "refused", talkSecs, heldSecs, holds: h?.holds ?? 0 });
      if (h) {
        await D.admin.from("voice_calls").update({ hold: h, held_seconds: heldSecs, talk_seconds: talkSecs, holds: h.holds, outcome: h.outcome ?? "done",
          ...(h.outcome === "retry" ? { retry_at: new Date(now + retryAfterMs(h)).toISOString() } : {}),
          ...(h.wrap && !row.summary ? { summary: holdSummary(h) } : {}) }).eq("id", row.id);
        if (h.wrap) await addAction(row, { kind: "wrap", reason: h.wrap.reason, title: holdSummary(h) });
      } else await D.admin.from("voice_calls").update({ talk_seconds: secs }).eq("id", row.id);
      await D.admin.rpc("voice_finish", { p_call: row.id, p_seconds: secs, p_cost: cost });
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
  // someone objected, or the call was never to be recorded: the file stays unfetched at Telnyx, which deletes it with the call
  if (row.consent !== "announced") return;
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
