// odelia-mail: emailing Odelia. Owners write, or forward an agency's letter, to ODELIA_EMAIL from the address they sign
// in with; she works on it as them, in their workspace, and answers by email in the same thread (agent-run, channel
// "email"). Photos and PDFs attached go into Documents and she reads them.
//
// POST, Authorization: Basic (Postmark inbound webhook, POSTMARK_INBOUND_AUTH)      the best way in
// POST, signed (Standard Webhooks, RESEND_WEBHOOK_SECRET), {type: "email.received"} the free way in (Resend)
//
// Only mail from a Placetta account's own address, and only when the receiving provider vouches for it (Resend's own
// DMARC or aligned DKIM result, or for Postmark a DKIM signature by that domain that we verify on the raw message;
// see mail.ts): a From line, and any header the sender writes, can be forged. Unknown senders get nothing back (no backscatter);
// unverified mail from a real account gets one note a day saying why. Auto-replies, bounces and lists are dropped.
// Nothing is filed, paid, sent or deleted by email: the answer links to the approval in the app.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { appLink, appOrigin, type Lang, SAY } from "../_shared/odelia.ts";
import { currentWorkspace, DOC_TYPES, type Link, logMessage, storeDocs } from "../_shared/odelia_db.ts";
import { fetchResend, type InMail, isForward, mailBody, mailReady, odeliaEmail, parsePostmark, postmarkAuthOk, replySubject, sendMail, senderVerified, verifyStandardWebhook } from "../_shared/mail.ts";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
const env = (k: string) => Deno.env.get(k);

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });
const bg = (p: Promise<unknown>) => { const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime; if (rt) rt.waitUntil(p); else void p; };

let selfKey: string | null = null;
async function monitorKey() {
  if (!selfKey) { const { data } = await admin.rpc("monitor_key"); selfKey = typeof data === "string" ? data : ""; }
  return selfKey;
}
const internal = async (fn: string, body: Record<string, unknown>) =>
  fetch(`${SUPABASE_URL}/functions/v1/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": await monitorKey() }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });

const MAIL_SAY = {
  unverified: {
    en: "I got an email from your address, but I couldn't verify that you really sent it, so I haven't acted on it. Ask me in Placetta, or by text, instead.",
    zh: "我收到了一封来自您邮箱的邮件，但无法验证它确实是您本人发出的，所以没有处理。请在快哉中或通过短信问我。",
  },
  files: { en: "Emailed", zh: "邮件发送" },
};

/** Mail no person wrote: auto-replies, bounces, mailing lists, and our own. */
function automated(m: InMail): boolean {
  const h = (k: string) => (m.headers[k] ?? []).join(" ").toLowerCase();
  return (h("auto-submitted") !== "" && h("auto-submitted") !== "no") || /\b(bulk|junk|list|auto_reply)\b/.test(h("precedence")) || !!m.headers["list-id"] || !!m.headers["x-autoreply"] || !!m.headers["x-autorespond"]
    || /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)@/.test(m.from) || m.from === odeliaEmail(env);
}

async function reply(to: string, lang: Lang, m: InMail, text: string, o: { uid: string | null; ws?: string | null; kind: "system" | "reply"; footer?: string }) {
  const body = mailBody(text, o.footer);
  const r = await sendMail(env, { to, subject: replySubject(m.subject), text: body.text, html: body.html, inReplyTo: m.id.replace(/^mail:/, "") });
  if (r.ok) await logMessage(admin, { user_id: o.uid, workspace_id: o.ws ?? null, direction: "out", channel: "email", kind: o.kind, body: body.text, provider_id: r.id ? `mail:${r.id}` : null });
  else console.error("odelia mail", r.status, r.detail);
  return r.ok;
}

export async function received(m: InMail) {
  const me = odeliaEmail(env);
  if (!m.to.includes(me) || automated(m)) return { ok: true, skipped: "not_for_odelia" };
  const { data: uid } = await admin.rpc("user_by_email", { p_email: m.from });
  const user = typeof uid === "string" ? uid : null;
  // Logged first (keyed on the Message-ID, so a redelivery is a no-op), but without its words until the sender checks out:
  // a forged mail's text never shows up as something the account holder said.
  const logId = await logMessage(admin, { user_id: user, direction: "in", channel: "email", kind: "chat", body: "", provider_id: m.id, subject: null });
  if (logId === null) return { ok: true, duplicate: true };
  if (!user) return { ok: true, skipped: "unknown_sender" };   // no backscatter to strangers or spoofed addresses

  const { data: pl } = await admin.from("phone_links").select("lang, last_workspace_id").eq("user_id", user).maybeSingle();
  const lang: Lang = pl?.lang === "zh" || (!pl && /[㐀-鿿]/.test(m.subject + m.text)) ? "zh" : "en";
  const verdict = await senderVerified(m);
  if (!verdict.ok) {
    // Fail closed: no run starts as this person. A missing raw message means Postmark's RawEmailEnabled is off, which
    // stops every email, so it's logged loudly for whoever runs Placetta.
    if (verdict.why === "postmark_raw_missing") console.error("odelia mail: Postmark isn't sending RawEmail; turn on RawEmailEnabled for the inbound server");
    else console.warn("odelia mail unverified", verdict.why);
    // One note a day, claimed before it's sent so two such mails at once can't both send one.
    const day = new Date().toISOString().slice(0, 10);
    const noteId = await logMessage(admin, { user_id: user, direction: "out", channel: "email", kind: "system", body: MAIL_SAY.unverified[lang], provider_id: `mail-unverified:${user}:${day}` });
    if (noteId !== null) {
      const body = mailBody(MAIL_SAY.unverified[lang]);
      const r = await sendMail(env, { to: m.from, subject: replySubject(m.subject), text: body.text, html: body.html, inReplyTo: m.id.replace(/^mail:/, "") });
      if (!r.ok) await admin.from("odelia_messages").delete().eq("id", noteId);
    }
    return { ok: true, skipped: "unverified" };
  }
  await admin.from("odelia_messages").update({ body: m.text.slice(0, 2000), subject: m.subject || null }).eq("id", logId);

  const link = { user_id: user, last_workspace_id: (pl?.last_workspace_id as string | null) ?? null } as Link;
  const { ws } = await currentWorkspace(admin, link);
  if (!ws) { await reply(m.from, lang, m, SAY.noWorkspace[lang], { uid: user, kind: "system" }); return { ok: true, skipped: "no_workspace" }; }
  await admin.from("odelia_messages").update({ workspace_id: ws.id }).eq("id", logId);

  // Photos and PDFs attached go into Documents.
  const files: { name: string; mime: string; bytes: Uint8Array }[] = [];
  for (const f of m.files.slice(0, 5)) {
    if (!DOC_TYPES[f.mime]) continue;
    let bytes = f.bytes;
    if (!bytes && f.url?.startsWith("https://")) { try { const r = await fetch(f.url, { signal: AbortSignal.timeout(20000) }); if (r.ok) bytes = new Uint8Array(await r.arrayBuffer()); } catch { /* skipped */ } }
    if (bytes?.length) files.push({ name: f.name.slice(0, 120), mime: f.mime, bytes });
  }
  const saved = files.length ? await storeDocs(admin, ws.id, user, files, { folder: "email", tag: MAIL_SAY.files }) : [];
  const other = m.files.length - saved.length;
  const names = saved.map((f) => f.name).join(", ");
  const words = m.text || (lang === "zh" ? "（邮件正文为空）" : "(no message)");
  const ask = (isForward(m.subject) ? (lang === "zh" ? `我转发了一封邮件给你（主题：${m.subject}）：\n\n` : `I forwarded you an email (subject: ${m.subject}):\n\n`) : m.subject ? (lang === "zh" ? `主题：${m.subject}\n\n` : `Subject: ${m.subject}\n\n`) : "") + words
    + (saved.length ? (lang === "zh" ? `\n\n（对方通过邮件发来 ${saved.length} 个附件，已存入“文件”：${names}。请用 review_documents 读取，只说文件里写明的内容。）` : `\n\n(They emailed ${saved.length} attachment${saved.length === 1 ? "" : "s"}, now saved in Documents: ${names}. Read ${saved.length === 1 ? "it" : "them"} with review_documents using those names. Only say what the documents themselves say.)`) : "")
    + (other > 0 ? (lang === "zh" ? `\n\n（另有 ${other} 个附件未保存，只支持照片和 PDF。）` : `\n\n(${other} other attachment${other === 1 ? "" : "s"} weren't saved; only photos and PDFs are.)`) : "");

  const res = await internal("agent-run", { action: "start_as", user_id: user, workspace_id: ws.id, prompt: ask.slice(0, 4000), channel: "email", reply_to: m.from, lang }).catch(() => null);
  if (!res || res.status !== 202) {
    const code = res?.status;
    await reply(m.from, lang, m, code === 409 ? SAY.busy[lang] : code === 402 ? SAY.noPlan[lang] : code === 403 ? SAY.noWorkspace[lang] : SAY.failed[lang], { uid: user, ws: ws.id, kind: "system", footer: appLink(appOrigin(env), ws.id) || undefined });
    return { ok: true, skipped: "not_started" };
  }
  const { id } = await res.json() as { id: string };
  await admin.from("odelia_messages").update({ run_id: id }).eq("id", logId);
  return { ok: true, run: id };
}

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  if (!mailReady(env)) return fail(503, "not_configured", "Email isn't set up: set ODELIA_EMAIL and Postmark (POSTMARK_INBOUND_AUTH, POSTMARK_SERVER_TOKEN) or Resend (RESEND_WEBHOOK_SECRET, RESEND_API_KEY).");
  const raw = await req.text();
  let m: InMail | null = null;
  if (req.headers.get("webhook-signature")) {
    const h = (k: string) => req.headers.get(k) ?? "";
    if (!(await verifyStandardWebhook(raw, { id: h("webhook-id"), timestamp: h("webhook-timestamp"), signature: h("webhook-signature") }, env("RESEND_WEBHOOK_SECRET") ?? ""))) return fail(401, "unauthorized", "Bad webhook signature.");
    try { m = await fetchResend(env, JSON.parse(raw)); } catch (e) { console.error("resend fetch", String(e).slice(0, 160)); return fail(502, "upstream_error", "Couldn't read the email."); }
    if (!m) return json(200, { ok: true, skipped: "not_inbound" });
  } else if (postmarkAuthOk(req.headers.get("authorization") ?? "", env("POSTMARK_INBOUND_AUTH") ?? "")) {
    try { m = parsePostmark(JSON.parse(raw)); } catch { return fail(400, "bad_request", "Send JSON."); }
    if (!m) return json(200, { ok: true, skipped: "unreadable" });
  } else return fail(401, "unauthorized", "unauthorized");
  // Answer the webhook now; the work (files, starting the run) carries on.
  const mail = m;
  bg(received(mail).catch((e) => console.error("mail", String(e).slice(0, 200))));
  return json(200, { ok: true });
}

if (import.meta.main) Deno.serve(handle);
