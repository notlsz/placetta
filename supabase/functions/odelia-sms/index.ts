// odelia-sms: texting Odelia. People text Odelia from the phone they verified in Settings, and Odelia works on it as
// them, in their workspace, and texts the answer back (agent-run, channel "sms"). Two ways in, same handling:
//   iMessage through Linq (LINQ_NUMBERS), falling back to RCS and SMS for Android, when Linq is set up
//   SMS through Telnyx (ODELIA_NUMBER)
//
// POST, signed by Linq (webhook-signature, Standard Webhooks) message.received from the Linq webhook subscription
// POST, signed by Telnyx (telnyx-signature-ed25519)      message.received webhooks from the messaging profile
// POST {action: "line"}                                    anyone: whether texting is set up, and Odelia's number
// POST {action: "send_code", code_id}                      the database (phone_link_start, monitor key): text a code
// POST {action: "flush"}                                   pg_cron every 10 minutes (monitor key): the outbox, and
//                                                          each iMessage line's reputation from Linq
//
// Inbound: STOP, START and HELP follow the carriers' rules (Telnyx answers them when the profile has auto-responses;
// otherwise this does). A number nobody verified gets one text explaining how to link it, then nothing for 90 days.
// A verified number starts a run as that person in the workspace they used last ("switch to <name>" changes it);
// On iMessage the typing bubble shows while Odelia works; "On it." goes out only if the run takes more than 8 seconds. Nothing is filed, paid, sent or deleted by text: the
// reply carries a link to the approval in the app.
// Outbox: what the monitor and finished runs want to tell people, held for quiet hours (9pm to 8am theirs by
// default), at most one call (odelia-voice dials) and three texts a day; pending items go out together in one text.
// iMessage lines are kept healthy the way Lindy learned to after Apple banned its own line: people spread across lines,
// replies always on the line they wrote to, at most LIMITS.newChatsPerLine new conversations a line a day (only the
// verification code starts one), outbound paused on a line Linq scores CRITICAL, and the team told when a line slips.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  appLink, appOrigin, BLOCKED_BY_STOP, inboundFlood, inQuietHours, KEYWORD_REPLY, keyword, type Lang, localMinutes, LIMITS, normalizePhone, odeliaNumber,
  pickWorkspace, prettyPhone, randomCode, SAY, smsReady, splitSms, strangerMayGetReply, switchTarget, underDailyLimit, verifyTelnyx, voiceReady,
} from "../_shared/odelia.ts";
import { currentWorkspace, criticalLines, forgetCriticalLines, type Link, linkByNumber, linkOf, logMessage, sendText, textingReady, textUser } from "../_shared/odelia_db.ts";
import { hashLine, linqLineHealth, linqLines, linqReady, linqTyping, parseLinq, verifyLinq, type LinqEvent } from "../_shared/linq.ts";

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

/** A text to a number with no verified link (keyword replies, the one explanation for strangers), logged without a
 *  person; back on the line they wrote to. `courtesy` is the one reply to STOP, which Linq would otherwise hold back. */
async function textNumber(to: string, text: string, userId: string | null = null, via: Via = {}, courtesy = false) {
  const r = await sendText(admin, env, { to, text, line: via.line, reply: true, courtesy });
  if (r.ok) await logMessage(admin, { user_id: userId, direction: "out", channel: "sms", kind: "system", body: userId ? text : "", provider_id: r.id, line: r.line, service: r.service });
  else console.error("odelia text", r.status, r.code, r.detail);
  return r.ok;
}

/* ------------------------------ inbound texts ------------------------------ */

type Inbound = { id?: string; from?: { phone_number?: string }; to?: { phone_number?: string }[]; text?: string; media?: unknown[]; autoresponse_type?: string | null };
/** How a text came in: the iMessage line and conversation (Linq), or nothing (Telnyx). */
type Via = { line?: string | null; chat?: string | null };

async function inbound(p: Inbound, logId: number, via: Via = {}) {
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
    if (!telnyxAnswered) await textNumber(from, KEYWORD_REPLY.stop[lang], link?.user_id ?? null, via, true);
    return;
  }
  if (kw === "start") {
    if (link) await admin.from("phone_links").update({ opted_out_at: null, updated_at: now.toISOString() }).eq("user_id", link.user_id);
    else await admin.from("odelia_strangers").update({ opted_out_at: null }).eq("number", from);
    if (!telnyxAnswered) await textNumber(from, KEYWORD_REPLY.start[lang], link?.user_id ?? null, via);
    return;
  }
  if (kw === "help") {
    if (!telnyxAnswered) await textNumber(from, KEYWORD_REPLY.help[lang], link?.user_id ?? null, via);
    return;
  }

  // A number nobody verified: one explanation, then nothing.
  if (!link) {
    const { data: s } = await admin.from("odelia_strangers").select("replied_at, opted_out_at, messages").eq("number", from).maybeSingle();
    const reply = !s?.opted_out_at && strangerMayGetReply(s?.replied_at as string | null, now);
    await admin.from("odelia_strangers").upsert({ number: from, last_at: now.toISOString(), messages: Number(s?.messages ?? 0) + 1, ...(reply ? { replied_at: now.toISOString() } : {}) }, { onConflict: "number" });
    if (reply) await textNumber(from, SAY.stranger[lang], null, via);
    return;
  }
  // They texted STOP earlier: only START turns texts back on.
  if (link.opted_out_at) return;
  // Answers go back on the line they wrote to, and so does everything after.
  if (via.line && via.line !== link.line) {
    await admin.from("phone_links").update({ line: via.line, updated_at: now.toISOString() }).eq("user_id", link.user_id);
    link.line = via.line;
  }

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
  // Photos and PDFs they text (an inspection report, a permit, a lease page) go into Documents, and Odelia reads them.
  const media = Array.isArray(p.media) ? (p.media as Media[]) : [];
  const saved = media.length ? await saveMedia(media, ws.id, link.user_id, lang) : [];
  const skipped = media.length - saved.length;
  if (!text && !saved.length) { if (media.length) await textUser(admin, env, { link, workspace_id: ws.id, segments: [SAY.picture[lang]], kind: "system" }); return; }
  const names = saved.map((f) => f.name).join(", ");
  const note = saved.length
    ? (lang === "zh"
      ? `\n\n（对方通过短信发来 ${saved.length} 个文件，已存入“文件”：${names}。请用 review_documents 读取这些文件名${text ? "，再回答上面的问题" : "，并告诉对方你读到了什么、有什么要做的"}。只说文件里写明的内容。）`
      : `\n\n(They texted ${saved.length} file${saved.length === 1 ? "" : "s"}, now saved in Documents: ${names}. Read ${saved.length === 1 ? "it" : "them"} with review_documents using those names${text ? ", then answer what they asked" : ", then tell them what it is and anything they need to do"}. Only say what the document itself says.)`)
    : "";
  const lost = skipped > 0 ? (lang === "zh" ? `\n\n（另有 ${skipped} 个附件无法打开，只支持照片和 PDF。）` : `\n\n(${skipped} other attachment${skipped === 1 ? "" : "s"} couldn't be opened; only photos and PDFs work by text.)`) : "";
  const ask = text || (lang === "zh" ? "我发了一个文件给你。" : "I sent you a file.");
  if (!text) await admin.from("odelia_messages").update({ body: ask }).eq("id", logId);
  await startRun(link, ws.id, ask + note + lost, logId, via);
}

type Media = { url?: string; content_type?: string; size?: number };
const MEDIA_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };
const MEDIA_MAX = 10 * 1024 * 1024;

/** Downloads up to 5 photos or PDFs from the text, stores each in the workspace's Documents (storage, the documents table
 *  and the workspace's own list), and returns what was saved. Anything else, or anything too big, is skipped. */
async function saveMedia(media: Media[], ws: string, uid: string, lang: "en" | "zh") {
  const out: { name: string; path: string; size: number; mime: string }[] = [];
  const stamp = new Date().toISOString().slice(0, 10);
  for (const [i, m] of media.slice(0, 5).entries()) {
    const mime = String(m.content_type ?? "").toLowerCase().split(";")[0].trim();
    const ext = MEDIA_TYPES[mime];
    if (!ext || !m.url || (m.size ?? 0) > MEDIA_MAX) continue;
    let host = "";
    try { const u = new URL(m.url); if (u.protocol !== "https:") continue; host = u.hostname; } catch { continue; }
    try {
      // Telnyx's own media links take the API key; any other host (Linq's are presigned) gets no credentials.
      const key = env("TELNYX_API_KEY");
      const res = await fetch(m.url, { headers: key && /(^|\.)telnyx\.com$/i.test(host) ? { Authorization: `Bearer ${key}` } : {} });
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length || bytes.length > MEDIA_MAX) continue;
      const name = `${lang === "zh" ? "短信" : "Text"} ${stamp} ${i + 1}.${ext}`;
      const path = `${ws}/sms/${crypto.randomUUID()}/${name.replace(/\s+/g, "-")}`;
      const up = await admin.storage.from("documents").upload(path, new Blob([bytes], { type: mime }), { contentType: mime, upsert: false });
      if (up.error) continue;
      const { error } = await admin.from("documents").insert({ workspace_id: ws, name, path, size: bytes.length, mime, source: "customer", uploaded_by: uid });
      if (error) { await admin.storage.from("documents").remove([path]); continue; }
      out.push({ name, path, size: bytes.length, mime });
    } catch (e) { console.error("media", String(e).slice(0, 160)); }
  }
  if (out.length) {
    // The workspace's own list of documents is what the agent reads from.
    const { data } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
    const state = (data?.state ?? {}) as { docs?: unknown[] };
    const docs = Array.isArray(state.docs) ? state.docs : [];
    const at = new Date().toISOString();
    const added = out.map((f) => ({ id: "d-" + crypto.randomUUID().slice(0, 8), name: f.name, kind: f.mime === "application/pdf" ? "pdf" : "jpg", size: f.size, by: "you", at, tag: { en: "Texted", zh: "短信发送" }, path: f.path }));
    await admin.from("workspaces").update({ state: { ...state, docs: [...added, ...docs] } }).eq("id", ws);
  }
  return out;
}

/** The recent text conversation in this workspace (the last 12 hours), as turns for the agent. */
async function history(link: Link, ws: string, beforeId: number) {
  const { data } = await admin.from("odelia_messages").select("id, direction, kind, body").eq("user_id", link.user_id).eq("workspace_id", ws).eq("channel", "sms")
    .in("kind", ["chat", "reply"]).lt("id", beforeId).gt("created_at", new Date(Date.now() - 12 * 3600e3).toISOString()).order("id", { ascending: false }).limit(8);
  // An empty turn (a photo with no words) would make the model refuse the whole conversation, so it's left out, and the
  // turns are merged so they still alternate.
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of (data ?? []).reverse()) {
    const content = String(m.body ?? "").trim();
    if (!content) continue;
    const role = m.direction === "in" ? "user" as const : "assistant" as const;
    const last = turns.at(-1);
    if (last?.role === role) last.content += "\n\n" + content; else turns.push({ role, content });
  }
  while (turns[0]?.role === "assistant") turns.shift();
  return turns;
}

async function startRun(link: Link, ws: string, prompt: string, logId: number, via: Via = {}) {
  const lang = link.lang;
  if (via.chat) bg(linqTyping(env, via.chat));
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

/** Linq: iMessage (and RCS or SMS when the phone can't do iMessage) to one of Odelia's lines. */
async function linqWebhook(req: Request) {
  const raw = await req.text();
  const h = (k: string) => req.headers.get(k) ?? "";
  const ok = await verifyLinq(raw, { id: h("webhook-id"), timestamp: h("webhook-timestamp"), signature: h("webhook-signature") }, env("LINQ_WEBHOOK_SECRET") ?? "");
  if (!ok) return fail(401, "unauthorized", "Bad webhook signature.");
  let ev: LinqEvent;
  try { ev = JSON.parse(raw) ?? {}; } catch { return fail(400, "bad_request", "Send JSON."); }
  const m = parseLinq(ev);
  if ("skip" in m) return json(200, { ok: true, skipped: m.skip });
  const lines = linqLines(env);
  if (m.to && lines.length && !lines.includes(m.to)) return json(200, { ok: true, skipped: "other_line" });
  const line = m.to ?? lines[0] ?? null;
  // Logging first, keyed on Linq's message id, makes a redelivered webhook a no-op.
  const link = await linkByNumber(admin, m.from);
  const logId = await logMessage(admin, { user_id: link?.user_id ?? null, direction: "in", channel: "sms", kind: "chat", body: link ? m.text.slice(0, 2000) : "", provider_id: m.id, line, service: m.service });
  if (logId === null) return json(200, { ok: true, duplicate: true });
  const p: Inbound = { id: m.id, from: { phone_number: m.from }, to: line ? [{ phone_number: line }] : [], text: m.text, media: m.media };
  bg(inbound(p, logId, { line, chat: m.chat }).catch((e) => console.error("inbound", String(e).slice(0, 200))));
  return json(200, { ok: true });
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
  if (!textingReady(env)) { await setError("not_configured"); return fail(503, "not_configured", "Texting isn't set up: set LINQ_API_KEY, LINQ_WEBHOOK_SECRET and LINQ_NUMBERS for iMessage, or TELNYX_API_KEY, TELNYX_PUBLIC_KEY, ODELIA_NUMBER and TELNYX_MESSAGING_PROFILE_ID for SMS."); }
  const lang: Lang = row.lang === "zh" ? "zh" : "en";
  // A code is the one text that can start a conversation, so it's what each line's daily cap of new ones counts.
  let line: string | null = null;
  if (linqReady(env)) {
    const { data: l } = await admin.from("phone_links").select("line").eq("user_id", row.user_id).maybeSingle();
    line = await codeLine(row.number, (l?.line as string | null) ?? null);
    if (!line && !smsReady(env)) { await setError("line_busy"); return fail(503, "line_busy", "Every iMessage line has started as many new conversations as it safely can today."); }
  }
  const r = await sendText(admin, env, { to: row.number, text: SAY.code[lang](code), line, smsOnly: linqReady(env) && !line, key: `code:${codeId}` });
  if (!r.ok) { await setError(r.code === BLOCKED_BY_STOP ? "opted_out" : "send_failed"); return fail(502, "upstream_error", "Couldn't send the code."); }
  await setError(null);
  if (r.line) await admin.from("phone_links").update({ line: r.line, updated_at: new Date().toISOString() }).eq("user_id", row.user_id);
  await logMessage(admin, { user_id: row.user_id, direction: "out", channel: "sms", kind: "code", body: lang === "zh" ? "已发送验证码" : "Sent a verification code", provider_id: r.id, line: r.line, service: r.service });
  return json(200, { ok: true });
}

/** The line to text a code from: theirs if they have one, else their assigned one, else the least used today; never a
 *  CRITICAL line or one that has already started LIMITS.newChatsPerLine conversations today (UTC). Null: none left. */
async function codeLine(number: string, stored: string | null): Promise<string | null> {
  const bad = await criticalLines(admin);
  const lines = linqLines(env).filter((l) => !bad.has(l));
  if (!lines.length) return null;
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const { data } = await admin.from("odelia_messages").select("line").eq("direction", "out").eq("kind", "code").in("line", lines).gte("created_at", day.toISOString());
  const used = new Map<string, number>();
  for (const r of data ?? []) used.set(String(r.line), (used.get(String(r.line)) ?? 0) + 1);
  const open = (l: string) => (used.get(l) ?? 0) < LIMITS.newChatsPerLine;
  const first = stored && lines.includes(stored) ? stored : hashLine(lines, number);
  if (first && open(first)) return first;
  return lines.filter(open).sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0))[0] ?? null;
}

/** Each iMessage line's reputation from Linq, kept in odelia_lines; the team hears when one slips or recovers. */
export async function lineHealth(now = new Date()) {
  const health = await linqLineHealth(env);
  if (!health) return { lines: 0 };
  const { data: old } = await admin.from("odelia_lines").select("number, reputation");
  const before = new Map((old ?? []).map((r) => [String(r.number), String(r.reputation)]));
  for (const h of health) {
    const was = before.get(h.number);
    await admin.from("odelia_lines").upsert({ number: h.number, reputation: h.reputation, doc_url: h.doc_url ?? null, checked_at: now.toISOString(), ...(was !== h.reputation ? { changed_at: now.toISOString() } : {}) }, { onConflict: "number" });
    if (was !== h.reputation && h.reputation !== "HEALTHY") {
      await admin.from("team_tasks").upsert({ kind: "line_health", filing_id: null, workspace_id: null, title: `iMessage line ${prettyPhone(h.number)} is ${h.reputation === "CRITICAL" ? "critical: outbound paused on it" : "at risk: slow its sending"}`,
        detail: { number: h.number, reputation: h.reputation, was: was ?? null, doc_url: h.doc_url ?? null }, dedupe: `line_health:${h.number}:${h.reputation}:${now.toISOString().slice(0, 10)}` }, { onConflict: "dedupe", ignoreDuplicates: true });
    }
  }
  forgetCriticalLines();
  return { lines: health.length, critical: health.filter((h) => h.reputation === "CRITICAL").length };
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
  if (req.headers.get("webhook-signature")) return await linqWebhook(req);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Send JSON."); }
  // Public: whether texting and calls are set up, and the number to save. No secrets.
  if (body.action === "line") {
    // With iMessage the number to save is the first iMessage line (Settings shows each person their own once linked).
    // Calls go to Telnyx's number, unless the iMessage lines forward calls there (LINQ_FORWARDS_CALLS), then it's one number.
    const imessage = linqReady(env);
    const n = imessage ? linqLines(env)[0] : odeliaNumber(env);
    const callN = voiceReady(env) ? (imessage && env("LINQ_FORWARDS_CALLS") === "1" ? n : odeliaNumber(env)) : null;
    return json(200, { configured: textingReady(env), imessage, voice: voiceReady(env), number: n, display: n ? prettyPhone(n) : null,
      call_number: callN, call_display: callN ? prettyPhone(callN) : null });
  }
  if (!(await monitorKeyOk(req.headers.get("x-monitor-key")))) return fail(401, "unauthorized", "unauthorized");
  if (body.action === "send_code") return await sendCode(String(body.code_id ?? ""));
  if (body.action === "flush") {
    if (!textingReady(env)) { await expireOld(new Date()); return fail(503, "not_configured", "Texting isn't set up."); }
    const lines = linqReady(env) ? await lineHealth().catch((e) => { console.error("line health", String(e).slice(0, 160)); return null; }) : null;
    return json(200, { ok: true, ...(await flush()), ...(lines ? { lines } : {}) });
  }
  return fail(400, "bad_request", "Unknown action.");
}

if (import.meta.main) Deno.serve(handle);
