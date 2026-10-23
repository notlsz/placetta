// odelia-voice: calling Odelia, and Odelia calling you.
//
// The talking is done by a Telnyx AI Assistant (TELNYX_ASSISTANT_ID) started on the call with Call Control: Telnyx
// streams speech to text, runs the model and speaks, with barge-in and turn-taking on its side, so a turn doesn't wait
// on a webhook round trip to us. Each call gets its own instructions, greeting, voice and tools: the tools are webhooks
// back to this function, carrying a token signed for that one call. Everything the assistant knows about the account
// comes from here, and only once the caller is verified.
//
// POST, signed by Telnyx                      Call Control webhooks (call.initiated, call.answered, call.speak.ended,
//                                             call.machine.detection.ended, call.conversation.ended, call.hangup)
// POST ?tool=<name>, x-odelia-call: <token>   the assistant's tools: verify_code, workspace_details, start_task, send_text
// POST {action: "dial", outbox_id}            odelia-sms's outbox (monitor key): call an owner about something urgent
//
// Inbound: the caller is the person whose verified number it is. Telnyx's STIR/SHAKEN attestation "A" (validated) is
// enough; anything less gets a 4-digit code texted to the number on file, which the caller must say before Odelia
// discusses the account. Fast answers come from a small read-only summary of the workspace; real work starts a
// background run (agent-run, channel "voice") whose answer is texted. Nothing is filed, paid, sent or deleted by voice.
// English or Mandarin, by the language they use in the app. Silence, hangups and errors end with a short apology and,
// when it helps, a text.
//
// The voice brain is swappable (_shared/voice_brain.ts). Telnyx stays the carrier for every call; with OpenAI set up
// (OPENAI_API_KEY, OPENAI_SIP_PROJECT, OPENAI_WEBHOOK_SECRET) Placetta answers or dials on Telnyx, checks who it is,
// then bridges the call to OpenAI's SIP endpoint with a signed X-Placetta-Call header; OpenAI's webhook
// (realtime.call.incoming) is accepted here with the session Placetta decides, and its tools come back to ?mcp=1.
// Without OpenAI the Telnyx AI Assistant talks, as before. Agency status calls, phone interpreting, recordings and
// their transcripts live in ./calls.ts.
//
// POST, Standard Webhooks signed by OpenAI   realtime.call.incoming: accept with the call's session, or reject
// POST ?mcp=1, x-odelia-call: <token>         the brain's tools over MCP (JSON-RPC)
// POST {action: "agency_call" | "interpret_call" | "purge_recordings"} (monitor key): see ./calls.ts
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  appLink, appOrigin, callerAttested, clientState, type Lang, normalizePhone, odeliaNumber, randomCode, readClientState, SAY, signCallToken, splitSms, spokenDigits, telnyx,
  verifyCallToken, verifyTelnyx, voiceReady, workspaceBrief,
} from "../_shared/odelia.ts";
import { currentWorkspace, type Link, linkByNumber, linkOf, logMessage, mayUseAgent, textUser } from "../_shared/odelia_db.ts";
import { priceFacts } from "../../../src/pricing.ts";
import { verifyLinq as verifyStandardWebhook } from "../_shared/linq.ts";
import { OWNER_TOOLS, SEND_TEXT_TOOL, VERIFY_TOOL, mcpAnswer, sipToken } from "../_shared/voice_calls.ts";
import { pickBrain, sessionConfig, type SessionSpec } from "../_shared/voice_brain.ts";
import { redactForVoice } from "../_shared/voice_rules.ts";
import { agencyCall, agencyToolCall, bridgeToBrain, callsEvent, interpretCall, ownerCallStarted, purgeRecordings, setupCalls, specForToken, type SpecWithBrain } from "./calls.ts";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
const env = (k: string) => Deno.env.get(k);
const SELF = `${SUPABASE_URL}/functions/v1/odelia-voice`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// One-line goodbyes said without the assistant (Call Control speak).
const VOICE: Record<Lang, string> = { en: env("ODELIA_VOICE_EN") ?? "AWS.Polly.Joanna-Neural", zh: env("ODELIA_VOICE_ZH") ?? "AWS.Polly.Zhiyu-Neural" };
// The assistant's own voice: Telnyx's Qwen3 TTS speaks Mandarin natively and is inside the $0.05 a minute.
const ASSISTANT_VOICE: Record<Lang, string> = { en: env("ODELIA_ASSISTANT_VOICE_EN") ?? VOICE.en, zh: env("ODELIA_ASSISTANT_VOICE_ZH") ?? "Telnyx.Qwen3TTS.Delta" };
const SPEAK_LANG: Record<Lang, string> = { en: "en-US", zh: "cmn-CN" };
const STT_MODEL = env("ODELIA_STT_MODEL");
const MAX_TOOL_CALLS = 40, MAX_CODE_TRIES = 3, MAX_CALL_TEXTS = 3;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });
const bg = (p: Promise<unknown>) => { const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime; if (rt) rt.waitUntil(p); else void p; };

let selfKey: string | null = null;
async function monitorKey() {
  if (!selfKey) { const { data } = await admin.rpc("monitor_key"); selfKey = typeof data === "string" ? data : ""; }
  return selfKey;
}
async function monitorKeyOk(key: string | null) {
  if (!key) return false;
  const { data } = await admin.rpc("monitor_key_ok", { p_key: key });
  return data === true;
}
const cmd = (ccid: string, action: string, body: Record<string, unknown>) => telnyx(env, `/calls/${encodeURIComponent(ccid)}/actions/${action}`, body);

type Call = {
  call_control_id: string; user_id: string | null; workspace_id: string | null; direction: "in" | "out"; number: string | null; attestation: string | null;
  verified_at: string | null; lang: Lang; outbox_id: string | null; tool_calls: number; texts: number; code_tries: number; answered_at: string | null; ended_at: string | null;
};
const callOf = async (ccid: string) => ((await admin.from("odelia_calls").select("*").eq("call_control_id", ccid).maybeSingle()).data as Call | null);

/* ------------------------------ what she says ------------------------------ */

const LINES = {
  stranger: { en: "Hi, this is Odelia from Placetta. I don't recognize this number. To call me, link your phone in Placetta, under Settings, Text and call Odelia. Goodbye.", zh: "您好，我是快哉的 Odelia。我不认识这个号码。如需给我打电话，请在快哉的设置中打开“发短信或致电 Odelia”，关联您的手机。再见。" },
  noAccess: { en: "Hi, it's Odelia from Placetta. Your number is linked, but I can't open a workspace for you right now. Please check the Placetta app. Goodbye.", zh: "您好，我是快哉的 Odelia。您的号码已关联，但我现在无法打开您的工作区。请查看快哉应用。再见。" },
  sorry: { en: "Hi, it's Odelia from Placetta. I'm sorry, I can't talk right now. I'll text you instead, so just reply there. Goodbye.", zh: "您好，我是快哉的 Odelia。抱歉，我现在无法通话。我会给您发短信，直接回复就可以。再见。" },
  unverifiable: { en: "Hi, it's Odelia from Placetta. I couldn't confirm it's you on this call, so please use the Placetta app or text me. Goodbye.", zh: "您好，我是快哉的 Odelia。这通电话无法确认是您本人，请使用快哉应用或给我发短信。再见。" },
  idle: { en: "I'll let you go. Text me anytime. Goodbye.", zh: "那我先挂了，有需要随时发短信给我。再见。" },
};

export function greeting(lang: Lang, name: string | null, mode: "verified" | "code" | "outbound", business: string) {
  if (lang === "zh") {
    // Every call opens by saying Odelia is an AI and the call is recorded and transcribed (California's bot and recording rules, the FCC's AI-voice ruling).
    const hi = `您好${name ? `，${name}` : ""}，我是快哉的 AI 助理 Odelia。本次通话会录音和转录，以便为您办理；如您不同意录音请直接说。`;
    return mode === "code" ? `${hi}为了保护您的账户，我刚把 4 位验证码发到了您账户上的手机号。请告诉我验证码。`
      : mode === "outbound" ? `${hi}我打电话是为了${business}的一件急事。现在方便说两句吗？` : `${hi}有什么可以帮您？`;
  }
  const hi = `Hi${name ? ` ${name}` : ""}, it's Odelia, Placetta's AI assistant. This call is recorded and transcribed so I can help; say so if you'd rather it isn't.`;
  return mode === "code" ? `${hi} To keep your account safe, I just texted a 4-digit code to the phone number on your account. What's the code?`
    : mode === "outbound" ? `${hi} I'm calling about something urgent at ${business}. Is now a good time?` : `${hi} What can I do for you?`;
}

function instructions(o: { lang: Lang; name: string | null; business: string; verified: boolean; brief: string; outbound?: string; today: string }) {
  return [
    `You are Odelia, the AI compliance agent at Placetta (快哉), on a phone call${o.name ? ` with ${o.name}` : ""} about ${o.business}. You get business licenses, permits and registrations done and keep them current. If asked, say plainly that you are an AI. Today is ${o.today}.`,
    `Speak ${o.lang === "zh" ? "Mandarin Chinese (普通话)" : "English"} unless they switch languages. Keep each turn to one to three short spoken sentences. No lists, no markdown, and don't read out links. Ask one question at a time. If they talk over you, stop and listen.`,
    o.verified
      ? "Answer from the workspace summary below. If something isn't in it, call workspace_details. If it still isn't there, say you'll look into it and call start_task."
      : "First verify the caller. Ask for the 4-digit code just texted to the phone number on file, and call verify_code with the digits they say. Until verify_code returns ok, say nothing about the business, its stores, licenses, filings or account, and call no other tool. If verify_code says no tries are left, apologize, suggest the Placetta app or texting this number, say goodbye and call hangup. Once verified, answer from the workspace verify_code returns.",
    "For real work (mapping a new store, drafting a letter, preparing or renewing an application, researching a rule), call start_task with what they want in their own words and every detail they gave, then tell them you're on it and will text them when it's done.",
    "On a call you never file, pay, send an email, delete or approve anything, and you never take Social Security, ITIN, bank or card numbers. Those happen in the Placetta app with their approval: offer to text them the link with send_text.",
    `If asked what Placetta costs: ${priceFacts("simple")} ${priceFacts("legacy")} Say the numbers plainly, one or two at a time.`,
    "If they want something in writing (an address, a date, a confirmation number, a link to the app), use send_text.",
    "If they want the agency asked about a filing's status by phone, call call_agency with the filing as they named it; you call only the agency's official line, in its hours. If they'd rather talk to a person, or something is beyond you, call hand_to_team. If they say not to record the call, call recording_refused and carry on.",
    "If you hear nothing for a while, ask once whether they're still there. When they're done, say a short goodbye and call hangup. If a tool fails, apologize in one sentence and offer to text instead.",
    o.outbound ? `You called them about this: ${o.outbound} Tell them in one or two sentences, answer their questions, and offer to start on it with start_task.` : "",
    o.verified ? `Workspace (read only, JSON):\n${o.brief}` : "",
  ].filter(Boolean).join("\n\n");
}

/** Their first name: from the account, or else from the workspace's Context (the owner or contact they named). */
async function firstName(uid: string, ws?: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(uid);
  const m = (data?.user?.user_metadata ?? {}) as { full_name?: string; name?: string; first_name?: string };
  let n = String(m.first_name ?? m.full_name ?? m.name ?? "").trim().split(/\s+/)[0];
  if (!n && ws) {
    const { data: w } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
    const facts = ((w?.state as { facts?: { label?: { en?: string }; value?: { en?: string } }[] } | null)?.facts ?? []);
    const f = facts.find((x) => /^(owner|contact name|responsible person)/i.test(x.label?.en ?? "") && !/^you\b/i.test(x.value?.en ?? ""));
    n = String(f?.value?.en ?? "").trim().split(/[\s,]+/)[0];
  }
  return n && n.length <= 40 && /^[\p{L}'-]+$/u.test(n) ? n : null;
}

async function briefFor(ws: string, lang: Lang) {
  const [{ data: w }, { data: filings }, { data: updates }] = await Promise.all([
    admin.from("workspaces").select("name, state").eq("id", ws).maybeSingle(),
    admin.from("filings").select("title, status, confirmation_number, updated_at").eq("workspace_id", ws).neq("status", "canceled").order("updated_at", { ascending: false }).limit(12),
    admin.from("updates").select("title, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(6),
  ]);
  return workspaceBrief({ name: String(w?.name ?? ""), state: w?.state ?? {}, filings: filings ?? [], updates: updates ?? [], lang, today: new Date().toISOString().slice(0, 10) });
}

/** The assistant for one call: per-call instructions, greeting, voice, speech recognition and tools that call back here. */
async function assistantFor(o: { ccid: string; lang: Lang; name: string | null; ws: { id: string; name: string }; verified: boolean; outbound?: string }) {
  const token = await signCallToken(await monitorKey(), o.ccid, Math.floor(Date.now() / 1000) + 2 * 3600);
  const headers = [{ name: "x-odelia-call", value: token }];
  const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({
    type: "webhook", timeout_ms: name === "workspace_details" || name === "verify_code" ? 6000 : 10000,
    webhook: { name, description, url: `${SELF}?tool=${name}`, method: "POST", headers, body_parameters: { type: "object", properties, required } },
  });
  const tools = [
    ...(o.verified ? [] : [tool("verify_code", "Check the 4-digit code the caller says. Returns ok and the workspace summary when it matches.", { code: { type: "string", description: "The digits the caller said, digits only, e.g. 4721" } }, ["code"])]),
    tool("workspace_details", "Read the business's current workspace summary again: stores, applications and their status, deadlines, filings, approvals waiting and recent updates.", {}, []),
    tool("start_task", "Start real work in the background (mapping a store, drafting a letter, preparing an application, researching a rule). The result is texted to them.", { request: { type: "string", description: "What they want done, in their words, with every detail they gave" } }, ["request"]),
    tool("send_text", "Text the caller on their verified number: something in writing they asked for, or a link to the Placetta app.", { message: { type: "string", description: "The text to send, plain, under 300 characters" }, app_link: { type: "boolean", description: "Add a link to their workspace in the app" } }, ["message"]),
    ...(o.verified ? [
      tool("call_agency", "Ask the agency by phone about one filing's status (Odelia calls the agency's official line during its hours).", { filing: { type: "string", description: "The filing's name as the caller said it" } }, ["filing"]),
      tool("hand_to_team", "Hand the conversation to a person on the Placetta team.", { reason: { type: "string" } }, ["reason"]),
    ] : []),
    tool("recording_refused", "The caller doesn't want the call recorded.", {}, []),
    { type: "hangup", hangup: { description: "Hang up the call, after saying goodbye." } },
  ];
  const brief = o.verified ? redactForVoice(await briefFor(o.ws.id, o.lang)) : "";
  const model = env("ODELIA_VOICE_MODEL");
  return {
    id: env("TELNYX_ASSISTANT_ID"),
    ...(model ? { model } : {}),
    instructions: instructions({ lang: o.lang, name: o.name, business: o.ws.name, verified: o.verified, brief, outbound: o.outbound, today: new Date().toISOString().slice(0, 10) }),
    greeting: greeting(o.lang, o.name, o.outbound ? "outbound" : o.verified ? "verified" : "code", o.ws.name),
    voice_settings: { voice: ASSISTANT_VOICE[o.lang] },
    transcription: transcriptionFor(o.lang, o.ws.name),
    tools,
  };
}

/** The same conversation for a speech-to-speech brain (OpenAI over SIP): the same instructions, greeting and tools,
 *  served over MCP with the same per-call token. */
async function ownerSpec(o: { ccid: string; lang: Lang; name: string | null; ws: { id: string; name: string }; verified: boolean; outbound?: string }): Promise<SessionSpec> {
  const brief = o.verified ? redactForVoice(await briefFor(o.ws.id, o.lang)) : "";
  const rec = OWNER_TOOLS_REC;
  return {
    lang: o.lang,
    instructions: instructions({ lang: o.lang, name: o.name, business: o.ws.name, verified: o.verified, brief, outbound: o.outbound, today: new Date().toISOString().slice(0, 10) }),
    greeting: greeting(o.lang, o.name, o.outbound ? "outbound" : o.verified ? "verified" : "code", o.ws.name),
    tools: o.verified ? [...OWNER_TOOLS, SEND_TEXT_TOOL, rec] : [VERIFY_TOOL, rec],
    toolUrl: `${SELF}?mcp=1`,
    token: await signCallToken(await monitorKey(), o.ccid, Math.floor(Date.now() / 1000) + 2 * 3600),
    terms: [o.ws.name, "Placetta", "Odelia", "permit", "license", "health inspection", "certificate of occupancy", "EIN", "DBA", "sales tax"],
  };
}
const OWNER_TOOLS_REC = { name: "recording_refused", description: "The caller doesn't want the call recorded.", properties: {}, required: [] as string[] };

/**
 * Speech recognition for one call. Owners mix the two languages ("我的 health permit 什么时候到期"), so Mandarin calls use
 * Soniox pinned to Chinese and English, which handles both in one sentence; English calls use Deepgram Nova-3. Each
 * falls back to the other mid-call if its provider fails. Deepgram Flux, Telnyx's turn-taking default, has no Chinese.
 * The business's name and the words of the trade are boosted so they come through spelled right.
 */
export function transcriptionFor(lang: Lang, business: string) {
  const terms = [business, "Placetta", "Odelia", "permit", "license", "health inspection", "certificate of occupancy", "EIN", "DBA", "sales tax", "sign permit", "food handler"]
    .map((t) => t.replace(/[,{}]/g, " ").trim()).filter(Boolean).join(",").slice(0, 900);
  const soniox = { model: "soniox/stt-rt-v5", settings: { language_hints: lang === "zh" ? ["zh", "en"] : ["en", "zh"], context: terms, enable_endpoint_detection: true, max_endpoint_delay_ms: 1000 } };
  const nova = { model: "deepgram/nova-3", language: lang, settings: { keyterm: terms } };
  if (STT_MODEL) return { model: STT_MODEL, language: lang };
  return lang === "zh" ? { ...soniox, fallback_models: [nova] } : { ...nova, fallback_models: [soniox] };
}

/** Say one line without the assistant, then hang up (client_state "bye" makes call.speak.ended hang up). */
const sayAndHangUp = (ccid: string, lang: Lang, text: string) =>
  cmd(ccid, "speak", { payload: text, payload_type: "text", voice: VOICE[lang], language: SPEAK_LANG[lang], client_state: clientState({ k: "bye" }), command_id: `bye-${ccid}`.slice(0, 120) });

/* ------------------------------ call events ------------------------------ */

type CallPayload = {
  call_control_id?: string; from?: string; to?: string; direction?: "incoming" | "outgoing"; client_state?: string;
  shaken_stir_attestation?: string; shaken_stir_validated?: boolean; result?: string; hangup_cause?: string; reason?: string | null;
};

async function incoming(p: CallPayload) {
  const ccid = p.call_control_id!;
  const from = normalizePhone(p.from);
  const link = from ? await linkByNumber(admin, from) : null;
  const lang: Lang = link?.lang ?? "en";
  const answerThen = (k: string, extra: Record<string, unknown> = {}) => cmd(ccid, "answer", { client_state: clientState({ k, l: lang, ...extra }), command_id: `answer-${ccid}`.slice(0, 120) });
  if (!voiceReady(env)) { await answerThen("sorry", { t: link ? 1 : 0 }); return; }
  if (!link) { await answerThen("stranger"); return; }
  const { ws } = await currentWorkspace(admin, link);
  if (!ws || (await mayUseAgent(admin, ws.id, link.user_id)) !== "ok") { await answerThen("noaccess"); return; }

  // STIR/SHAKEN "A", validated: the carrier vouches the caller owns this number. Anything less (including no
  // validation result at all): a code texted to the number on file. The database caps wrong tries and codes per number
  // per hour across calls (phone_code_issue, phone_code_check), so calling again doesn't buy more guesses.
  const verified = callerAttested(p);
  await admin.from("odelia_calls").upsert({ call_control_id: ccid, user_id: link.user_id, workspace_id: ws.id, direction: "in", number: from, attestation: p.shaken_stir_attestation ?? null, verified_at: verified ? new Date().toISOString() : null, lang }, { onConflict: "call_control_id" });
  await admin.from("phone_links").update({ last_workspace_id: ws.id }).eq("user_id", link.user_id);
  if (!verified) {
    const code = randomCode(4);
    const { error } = await admin.rpc("phone_code_issue", { p_user: link.user_id, p_purpose: "call", p_number: from, p_code: code, p_minutes: 10 });
    if (error) console.error("call code refused:", /phone_rate_limited|phone_busy/.exec(error.message ?? "")?.[0] ?? error.code);
    const sent = !error && (await textUser(admin, env, { link, workspace_id: ws.id, segments: [SAY.callCode[lang](code)], kind: "code", logBody: lang === "zh" ? "已发送通话验证码" : "Sent a call code" })).ok;
    if (!sent) { await answerThen("unverifiable"); return; }
  }
  const pick = pickBrain({ surface: "owner_phone", lang, env });
  await ownerCallStarted({ ccid, workspace_id: ws.id, user_id: link.user_id, number: from, brain: pick.brain, lang, direction: "in" });
  if (pick.brain !== "telnyx") {
    // answered on Telnyx, then bridged to the speech-to-speech brain once the line is up (call.answered, k "bridge")
    const b = await cmd(ccid, "answer", { client_state: clientState({ k: "bridge", l: lang }), command_id: `answer-${ccid}`.slice(0, 120) });
    if (b.ok) return;
    console.error("answer for bridge", b.status, b.code, b.detail);
  }
  const assistant = await assistantFor({ ccid, lang, name: await firstName(link.user_id, ws?.id), ws, verified });
  const r = await cmd(ccid, "answer", { assistant, client_state: clientState({ k: "talk", l: lang }), command_id: `answer-${ccid}`.slice(0, 120) });
  if (!r.ok) {
    console.error("answer with assistant", r.status, r.code, r.detail);
    await cmd(ccid, "answer", { client_state: clientState({ k: "sorry", l: lang, t: 1 }), command_id: `answer2-${ccid}`.slice(0, 120) });
  }
}

/** Their urgent item didn't get through by voice: text it instead (this one doesn't count against the daily texts). */
async function textInstead(call: Call) {
  if (!call.user_id || !call.outbox_id) return;
  const [{ data: o }, link] = await Promise.all([admin.from("odelia_outbox").select("body, link, workspace_id").eq("id", call.outbox_id).maybeSingle(), linkOf(admin, call.user_id)]);
  if (!o || !link?.verified_at || !link.texts_on) return;
  const already = await admin.from("odelia_messages").select("id", { count: "exact", head: true }).eq("user_id", call.user_id).eq("kind", "missed").eq("channel", "sms").gt("created_at", call.answered_at ?? new Date(Date.now() - 3600e3).toISOString());
  if (already.count) return;
  const text = `${SAY.missed[link.lang]} ${o.body}`;
  await textUser(admin, env, { link, workspace_id: o.workspace_id, segments: splitSms(text, { max: 1, lang: link.lang, tail: o.link || appLink(appOrigin(env), o.workspace_id) || undefined }), kind: "missed" });
}

async function event(type: string, p: CallPayload) {
  const ccid = p.call_control_id;
  if (!ccid) return;
  const cs = readClientState(p.client_state);
  const lang: Lang = cs.l === "zh" ? "zh" : "en";

  if (type === "call.initiated" && p.direction === "incoming") return await incoming(p);
  // agency calls, the legs bridged to a brain, interpreter legs, recordings: ./calls.ts
  if (await callsEvent(type, p, cs)) return;

  if (type === "call.answered") {
    await admin.from("odelia_calls").update({ answered_at: new Date().toISOString() }).eq("call_control_id", ccid).is("answered_at", null);
    if (cs.k === "stranger") await sayAndHangUp(ccid, "en", LINES.stranger.en);
    else if (cs.k === "noaccess") await sayAndHangUp(ccid, lang, LINES.noAccess[lang]);
    else if (cs.k === "unverifiable") await sayAndHangUp(ccid, lang, LINES.unverifiable[lang]);
    else if (cs.k === "bridge") {
      const call = await callOf(ccid);
      if (call) await bridgeToBrain({ peer: ccid, token: ccid, lang: call.lang, record: true });
    }
    else if (cs.k === "talk") await cmd(ccid, "record_start", { format: "wav", channels: "dual", play_beep: false, client_state: clientState({ k: "rec", l: lang }) });
    else if (cs.k === "sorry") {
      await sayAndHangUp(ccid, lang, LINES.sorry[lang]);
      const from = normalizePhone(p.from), link = cs.t && from ? await linkByNumber(admin, from) : null;
      if (link) await textUser(admin, env, { link, segments: [SAY.callSorry[link.lang]], kind: "system" });
    }
    return;   // outbound calls wait for answering-machine detection; inbound assistants start on their own
  }

  if (type === "call.speak.ended" && cs.k === "bye") { await cmd(ccid, "hangup", { command_id: `hangup-${ccid}`.slice(0, 120) }); return; }

  if (type === "call.machine.detection.ended") {
    const call = await callOf(ccid);
    if (!call || call.direction !== "out" || !call.user_id || !call.workspace_id) return;
    if (p.result === "machine") { await cmd(ccid, "hangup", {}); await textInstead(call); return; }
    const [{ data: o }, { data: w }] = await Promise.all([
      admin.from("odelia_outbox").select("body").eq("id", call.outbox_id ?? "").maybeSingle(),
      admin.from("workspaces").select("id, name").eq("id", call.workspace_id).maybeSingle(),
    ]);
    if (!w) { await cmd(ccid, "hangup", {}); return; }
    const pick = pickBrain({ surface: "owner_phone", lang: call.lang, env });
    await ownerCallStarted({ ccid, workspace_id: w.id, user_id: call.user_id, number: call.number, brain: pick.brain, lang: call.lang, direction: "out" });
    if (pick.brain !== "telnyx" && (await bridgeToBrain({ peer: ccid, token: ccid, lang: call.lang, record: true })).ok) return;
    const assistant = await assistantFor({ ccid, lang: call.lang, name: await firstName(call.user_id, w.id), ws: { id: w.id, name: String(w.name ?? "") }, verified: true, outbound: String(o?.body ?? "") });
    const r = await cmd(ccid, "ai_assistant_start", { assistant, client_state: clientState({ k: "talk", l: call.lang }) });
    if (r.ok) await cmd(ccid, "record_start", { format: "wav", channels: "dual", play_beep: false, client_state: clientState({ k: "rec", l: call.lang }) });
    if (!r.ok) { console.error("assistant start", r.status, r.code, r.detail); await sayAndHangUp(ccid, call.lang, LINES.sorry[call.lang]); await textInstead(call); }
    return;
  }

  if (type === "call.conversation.ended") {
    // The assistant stopped (silence, its time limit, an error) but the line is still open: close it kindly.
    const call = await callOf(ccid);
    if (call && !call.ended_at) await sayAndHangUp(ccid, call.lang, /error|fail/i.test(String(p.reason ?? "")) ? LINES.sorry[call.lang] : LINES.idle[call.lang]);
    return;
  }

  if (type === "call.hangup") {
    const call = await callOf(ccid);
    if (!call || call.ended_at) return;
    const now = new Date();
    await admin.from("odelia_calls").update({ ended_at: now.toISOString() }).eq("call_control_id", ccid);
    if (!call.user_id) return;
    const mins = call.answered_at ? Math.max(1, Math.round((now.getTime() - Date.parse(call.answered_at)) / 60e3)) : 0;
    const body = call.direction === "out" && !mins
      ? (call.lang === "zh" ? "Odelia 来电，未接通" : "Odelia called, no answer")
      : call.lang === "zh" ? `${call.direction === "in" ? "您来电" : "Odelia 来电"}，${mins} 分钟` : `${call.direction === "in" ? "You called" : "Odelia called"}, ${mins} min`;
    await logMessage(admin, { user_id: call.user_id, workspace_id: call.workspace_id, direction: call.direction, channel: "voice", kind: "call", body, provider_id: `call:${ccid}` });
    if (call.direction === "out" && !mins) await textInstead(call);
  }
}

/* ------------------------------ the assistant's tools ------------------------------ */

async function runTool(name: string, call: Call, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const notVerified = { ok: false, result: "The caller isn't verified yet. Ask for the 4-digit code and call verify_code first." };
  if (name === "verify_code") {
    if (call.verified_at) return { ok: true, result: "Already verified." };
    if (call.code_tries >= MAX_CODE_TRIES || !call.user_id) return { ok: false, tries_left: 0, result: "No tries left. Apologize, suggest the Placetta app or texting this number, say goodbye and hang up." };
    const code = spokenDigits(body.code);
    const { data: res } = await admin.rpc("phone_code_check", { p_user: call.user_id, p_purpose: "call", p_code: code, p_number: call.number });
    const tries = call.code_tries + 1;
    if (res === "ok") {
      await admin.from("odelia_calls").update({ verified_at: new Date().toISOString(), code_tries: tries }).eq("call_control_id", call.call_control_id);
      return { ok: true, result: "Verified. You can discuss the account now. Ask how you can help.", workspace: call.workspace_id ? await briefFor(call.workspace_id, call.lang) : "" };
    }
    await admin.from("odelia_calls").update({ code_tries: tries }).eq("call_control_id", call.call_control_id);
    const left = res === "locked" || res === "expired" ? 0 : Math.max(0, MAX_CODE_TRIES - tries);
    return { ok: false, tries_left: left, result: left ? "That code doesn't match. Ask them to say it again, digit by digit." : "No tries left. Apologize, suggest the Placetta app or texting this number, say goodbye and hang up." };
  }
  if (!call.verified_at || !call.user_id || !call.workspace_id) return notVerified;
  if (name === "workspace_details") return { ok: true, workspace: await briefFor(call.workspace_id, call.lang) };
  if (name === "start_task") {
    const request = String(body.request ?? "").trim().slice(0, 2000);
    if (!request) return { ok: false, result: "Ask what they want done." };
    const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-run`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": await monitorKey() },
      body: JSON.stringify({ action: "start_as", user_id: call.user_id, workspace_id: call.workspace_id, prompt: request, channel: "voice", reply_to: call.number, lang: call.lang }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (res?.status === 202) return { ok: true, result: "Started. Tell them you're on it and will text them when it's done." };
    if (res?.status === 409) return { ok: false, result: "You're still working on their last request. Tell them you'll text when that's done, then you can start this one." };
    if (res?.status === 402) return { ok: false, result: "This workspace has no plan, so you can't start work. Tell them to open Placetta to start one." };
    return { ok: false, result: "Couldn't start it. Apologize and suggest texting the request instead." };
  }
  if (name === "send_text") {
    if (call.texts >= MAX_CALL_TEXTS) return { ok: false, result: "You've already texted them several times on this call. Tell them it's in their texts." };
    const link = await linkOf(admin, call.user_id);
    if (!link?.verified_at || link.number !== call.number) return { ok: false, result: "Their number isn't linked anymore." };
    const message = String(body.message ?? "").trim().slice(0, 600);
    if (!message) return { ok: false, result: "Nothing to send." };
    const tail = body.app_link === true ? appLink(appOrigin(env), call.workspace_id) : "";
    const r = await textUser(admin, env, { link: link as Link, workspace_id: call.workspace_id, segments: splitSms(message, { max: 2, lang: call.lang, tail: tail || undefined }), kind: "reply" });
    await admin.from("odelia_calls").update({ texts: call.texts + 1 }).eq("call_control_id", call.call_control_id);
    return r.ok ? { ok: true, result: "Texted." } : { ok: false, result: r.code === "opted_out" ? "They turned off texts from you (STOP). They can text START to turn them back on." : "The text didn't go through. Apologize." };
  }
  if (name === "call_agency") return await agencyCallFromOwner(call, String(body.filing ?? ""));
  if (name === "hand_to_team") {
    await admin.from("team_tasks").upsert({ kind: "handoff", workspace_id: call.workspace_id, title: `Odelia handed a phone call to the team: ${String(body.reason ?? "").slice(0, 200)}`,
      detail: { call: call.call_control_id, reason: String(body.reason ?? "").slice(0, 500) }, dedupe: `voice-handoff:${call.call_control_id}` }, { onConflict: "dedupe", ignoreDuplicates: true });
    return { ok: true, result: "The Placetta team has it and will call or text them back within one business day. Tell them so." };
  }
  if (name === "recording_refused") {
    await cmd(call.call_control_id, "record_stop", {});
    await admin.from("voice_calls").update({ consent: "refused" }).eq("call_control_id", call.call_control_id);
    return { ok: true, result: "Recording stopped. Tell them that's fine and carry on." };
  }
  return { ok: false, result: "Unknown tool." };
}

/** "Can you call the city about my building permit?": the filing they mean, then the agency call (./calls.ts). */
async function agencyCallFromOwner(call: Call, named: string): Promise<Record<string, unknown>> {
  const { data } = await admin.from("filings").select("id, title, status").eq("workspace_id", call.workspace_id!).in("status", ["submitted", "needs_info", "in_progress"]).order("updated_at", { ascending: false }).limit(20);
  const list = (data ?? []) as { id: string; title: { en?: string; zh?: string } | null }[];
  const words = named.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 2);
  const hits = list.filter((f) => { const t = `${f.title?.en ?? ""} ${f.title?.zh ?? ""}`.toLowerCase(); return words.some((w) => t.includes(w)) || (!!named.trim() && t.includes(named.trim().toLowerCase())); });
  const one = hits.length === 1 ? hits[0] : list.length === 1 ? list[0] : null;
  if (!one) return { ok: false, result: list.length ? `Ask which one: ${list.slice(0, 5).map((f) => f.title?.[call.lang] || f.title?.en).join("; ")}.` : "Nothing is with an agency right now, so there's nothing to ask them. Tell them so." };
  const r = await agencyCall({ workspace_id: call.workspace_id!, filing_id: one.id, user_id: call.user_id!, lang: call.lang });
  return r.ok ? { ok: true, result: "Odelia is calling the agency now. Tell them the answer will be on the filing's timeline and you'll text them." } : { ok: false, result: `Tell them: ${r.say[call.lang]}` };
}

async function tool(req: Request, name: string) {
  const ccid = await verifyCallToken(await monitorKey(), req.headers.get("x-odelia-call") ?? "");
  if (!ccid) return fail(401, "unauthorized", "unauthorized");
  if (ccid.startsWith("agency:")) return json(200, await agencyToolCall(ccid.slice(7), name, await req.json().catch(() => ({}))));
  const call = await callOf(ccid);
  if (!call || call.ended_at) return json(200, { ok: false, result: "The call has ended." });
  if (call.tool_calls >= MAX_TOOL_CALLS) return json(200, { ok: false, result: "That's a lot on one call. Offer to text them instead." });
  await admin.from("odelia_calls").update({ tool_calls: call.tool_calls + 1 }).eq("call_control_id", ccid);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  try {
    return json(200, await runTool(name, call, body));
  } catch (e) {
    console.error("tool", name, String(e).slice(0, 200));
    return json(200, { ok: false, result: "Something went wrong. Apologize briefly and offer to text instead." });
  }
}

/* ------------------------------ calling out ------------------------------ */

async function dial(outboxId: string) {
  if (!UUID.test(outboxId)) return fail(400, "bad_request", "outbox_id is required.");
  if (!voiceReady(env)) return fail(503, "not_configured", "Calls aren't set up: set TELNYX_VOICE_CONNECTION_ID and TELNYX_ASSISTANT_ID.");
  const { data: o } = await admin.from("odelia_outbox").select("id, user_id, workspace_id, body").eq("id", outboxId).is("sent_at", null).is("dropped_at", null).maybeSingle();
  if (!o) return fail(404, "not_found", "Nothing to call about.");
  const link = await linkOf(admin, o.user_id);
  if (!link?.verified_at || !link.calls_on) return fail(409, "not_allowed", "They don't take calls.");
  // Claim it, so two sweeps at once can't both call.
  const { data: claimed } = await admin.from("odelia_outbox").update({ sent_at: new Date().toISOString() }).eq("id", o.id).is("sent_at", null).select("id");
  if (!claimed?.length) return fail(409, "busy", "Already being called.");
  const r = await telnyx(env, "/calls", {
    connection_id: env("TELNYX_VOICE_CONNECTION_ID"), to: link.number, from: odeliaNumber(env), webhook_url: SELF,
    client_state: clientState({ k: "out", l: link.lang }), timeout_secs: 30, time_limit_secs: 900, answering_machine_detection: "detect", command_id: `dial-${o.id}`,
  });
  const ccid = typeof r.data?.call_control_id === "string" ? r.data.call_control_id : "";
  if (!r.ok || !ccid) {
    console.error("dial", r.status, r.code, r.detail);
    await admin.from("odelia_outbox").update({ sent_at: null }).eq("id", o.id);   // the sweep texts it instead
    return fail(502, "upstream_error", "Couldn't place the call.");
  }
  // We dialed the number they verified, so the person who answers is treated as them.
  await admin.from("odelia_calls").insert({ call_control_id: ccid, user_id: o.user_id, workspace_id: o.workspace_id, direction: "out", number: link.number, verified_at: new Date().toISOString(), lang: link.lang, outbox_id: o.id });
  await logMessage(admin, { user_id: o.user_id, workspace_id: o.workspace_id, direction: "out", channel: "voice", kind: "urgent", body: String(o.body).slice(0, 600) });
  return json(200, { ok: true });
}

/* ------------------------------ the brain's tools over MCP, and OpenAI's call webhook ------------------------------ */

async function mcp(req: Request): Promise<Response> {
  const id = await verifyCallToken(await monitorKey(), req.headers.get("x-odelia-call") ?? "");
  if (!id) return fail(401, "unauthorized", "unauthorized");
  const msg = await req.json().catch(() => null) as Parameters<typeof mcpAnswer>[0] | null;
  if (!msg || typeof msg !== "object") return json(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  const spec = await specForToken(id);
  if (!spec) return json(200, { jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32001, message: "The call has ended." } });
  const out = await mcpAnswer(msg, spec.tools, async (name, args) => {
    if (id.startsWith("agency:")) return await agencyToolCall(id.slice(7), name, args);
    const call = await callOf(id);
    if (!call || call.ended_at) return { ok: false, result: "The call has ended." };
    if (call.tool_calls >= MAX_TOOL_CALLS) return { ok: false, result: "That's a lot on one call. Offer to text them instead." };
    await admin.from("odelia_calls").update({ tool_calls: call.tool_calls + 1 }).eq("call_control_id", id);
    try { return await runTool(name, call, args); } catch (e) { console.error("tool", name, String(e).slice(0, 200)); return { ok: false, result: "Something went wrong. Apologize briefly and offer to text instead." }; }
  });
  return out ? json(200, out) : new Response(null, { status: 202 });
}

/** A member (owner, admin or member) of the workspace, with a plan: who an agency call may be placed for. */
async function isMember(ws: string, uid: string) {
  return UUID.test(ws) && UUID.test(uid) && (await mayUseAgent(admin, ws, uid)) === "ok";
}

/** Accept the call at OpenAI with the session Placetta decided for it, or turn it away when the token was not ours. */
async function acceptOrReject(callId: string, spec: SpecWithBrain | null) {
  const key = env("OPENAI_API_KEY") ?? "";
  const url = `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}`;
  const post = (path: string, body: unknown) => fetch(`${url}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!spec) { await post("reject", { status_code: 603 }); return; }
  const r = await post("accept", sessionConfig(spec.brain, spec, env));
  if (!r.ok) console.error("openai accept", r.status, (await r.text()).slice(0, 200));
}

setupCalls({ admin, env, self: SELF, monitorKey, cmd, ownerSpec: async (ccid) => {
  const call = await callOf(ccid);
  if (!call || call.ended_at || !call.workspace_id || !call.user_id) return null;
  const { data: w } = await admin.from("workspaces").select("id, name").eq("id", call.workspace_id).maybeSingle();
  if (!w) return null;
  const o = call.outbox_id ? (await admin.from("odelia_outbox").select("body").eq("id", call.outbox_id).maybeSingle()).data : null;
  return { ...(await ownerSpec({ ccid, lang: call.lang, name: await firstName(call.user_id, w.id), ws: { id: w.id, name: String(w.name ?? "") }, verified: !!call.verified_at, outbound: o ? String(o.body ?? "") : undefined })), brain: pickBrain({ surface: "owner_phone", lang: call.lang, env }).brain };
} });

/* ------------------------------ requests ------------------------------ */

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  const toolName = new URL(req.url).searchParams.get("tool");
  if (toolName) return await tool(req, toolName);
  if (new URL(req.url).searchParams.get("mcp")) return await mcp(req);
  if (req.headers.get("webhook-signature")) {
    // OpenAI's Realtime webhook (Standard Webhooks): a call bridged by Placetta is ringing at OpenAI
    const raw = await req.text();
    const ok = await verifyStandardWebhook(raw, { id: req.headers.get("webhook-id") ?? "", timestamp: req.headers.get("webhook-timestamp") ?? "", signature: req.headers.get("webhook-signature") ?? "" }, env("OPENAI_WEBHOOK_SECRET") ?? "");
    if (!ok) return fail(401, "unauthorized", "Bad webhook signature.");
    let ev: Parameters<typeof sipToken>[0];
    try { ev = JSON.parse(raw); } catch { return fail(400, "bad_request", "Send JSON."); }
    const got = sipToken(ev);
    if (!got) return json(200, { ok: true });
    const id = await verifyCallToken(await monitorKey(), got.token);
    const spec = id ? await specForToken(id) : null;
    bg(acceptOrReject(got.callId, spec).catch((e) => console.error("openai accept", String(e).slice(0, 200))));
    return json(200, { ok: true });
  }
  if (req.headers.get("telnyx-signature-ed25519")) {
    const raw = await req.text();
    const ok = await verifyTelnyx(raw, req.headers.get("telnyx-signature-ed25519") ?? "", req.headers.get("telnyx-timestamp") ?? "", env("TELNYX_PUBLIC_KEY") ?? "");
    if (!ok) return fail(401, "unauthorized", "Bad webhook signature.");
    let ev: { event_type?: string; payload?: CallPayload };
    try { ev = JSON.parse(raw)?.data ?? {}; } catch { return fail(400, "bad_request", "Send JSON."); }
    // Answer Telnyx right away; the commands go out in the background.
    bg(event(String(ev.event_type ?? ""), ev.payload ?? {}).catch((e) => console.error("call event", ev.event_type, String(e).slice(0, 200))));
    return json(200, { ok: true });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Send JSON."); }
  if (!(await monitorKeyOk(req.headers.get("x-monitor-key")))) return fail(401, "unauthorized", "unauthorized");
  if (body.action === "dial") return await dial(String(body.outbox_id ?? ""));
  if (body.action === "agency_call" || body.action === "interpret_call") {
    // the person the call is for must still be a member of the workspace the filing is in, whoever asked
    const ws = String(body.workspace_id ?? ""), uid = String(body.user_id ?? "");
    if (!(await isMember(ws, uid))) return fail(403, "forbidden", "Not a member of that workspace.");
    const o = { workspace_id: ws, filing_id: String(body.filing_id ?? ""), user_id: uid };
    const r = body.action === "agency_call" ? await agencyCall({ ...o, lang: body.lang === "zh" ? "zh" : "en" }) : await interpretCall(o);
    return json(r.ok ? 200 : 409, r);
  }
  if (body.action === "purge_recordings") return json(200, await purgeRecordings());
  return fail(400, "bad_request", "Unknown action.");
}

if (import.meta.main) Deno.serve(handle);
