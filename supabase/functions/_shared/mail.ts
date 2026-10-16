// Email Odelia: owners write or forward to ODELIA_EMAIL (an agency's letter, an inspector's notice) and she answers by
// email. Two ways in, one handling; pure or takes its fetch, so it's unit tested in mail_test.ts.
//
//   Postmark (best: $16.50 a month for 10,000 on Pro, inbound included, and it strips the quoted reply for us)
//     POST, Authorization: Basic (the user:pass in the inbound webhook URL, POSTMARK_INBOUND_AUTH)
//     {MessageID, FromFull: {Email, Name}, To, Subject, TextBody, StrippedTextReply, Headers: [{Name, Value}],
//      Attachments: [{Name, Content (base64), ContentType, ContentLength}], RawEmail (with RawEmailEnabled on)}
//   Resend (free: 3,000 a month counting both ways; RESEND_API_KEY already sends sign-in mail)
//     POST, Standard Webhooks (RESEND_WEBHOOK_SECRET), {type: "email.received", data: {email_id, from, to, subject}}
//     then GET /emails/receiving/{id} for text, headers and authentication ({spf, dkim, dmarc}, set by Resend's own
//     receiving server), and GET /emails/receiving/{id}/attachments for download URLs
//
// Email's From line can be forged, and so can any header the sender writes: Authentication-Results, ARC, X-Spam-Tests.
// So Odelia trusts only what the receiving provider itself establishes. Resend: its authentication field says DMARC
// passed, or DKIM passed for the From domain. Postmark: it gives no authentication result the sender can't also write
// (its spam headers are skipped on some mail, and then a forged one would stand alone), so we verify the DKIM signature
// on the raw message ourselves (dkim.ts). Anything else is unverified: no run starts, and the owner gets a note.
import { verifyLinq as verifyStandardWebhook } from "./linq.ts";
import { dohTxt, type TxtLookup, verifyDkim } from "./dkim.ts";

export { verifyStandardWebhook };
export type Env = (k: string) => string | undefined;
export type InFile = { name: string; mime: string; bytes?: Uint8Array; url?: string; size: number };
/** What the receiving provider gives us to check the sender with: Postmark's raw message (null when RawEmailEnabled is
 *  off), or Resend's own authentication results (null on mail received before Resend added them). */
export type MailAuth = { provider: "postmark"; raw: string | null } | { provider: "resend"; result: { spf?: string; dkim?: string; dmarc?: string } | null };
export type InMail = { id: string; from: string; name: string; to: string[]; subject: string; text: string; headers: Record<string, string[]>; files: InFile[]; auth: MailAuth };

export const odeliaEmail = (env: Env) => (env("ODELIA_EMAIL") || "").trim().toLowerCase();
export const mailInReady = (env: Env) => !!odeliaEmail(env) && !!(env("POSTMARK_INBOUND_AUTH") || (env("RESEND_WEBHOOK_SECRET") && env("RESEND_API_KEY")));
export const mailOutReady = (env: Env) => !!odeliaEmail(env) && !!(env("POSTMARK_SERVER_TOKEN") || env("RESEND_API_KEY"));
export const mailReady = (env: Env) => mailInReady(env) && mailOutReady(env);

const lower = (s: unknown) => String(s ?? "").trim().toLowerCase();
/** The address out of "Mei Chen <mei@goldenox.com>". */
export function addressOf(s: unknown): string {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(String(s ?? "")) ?? /([^\s<>",;]+@[^\s<>",;]+)/.exec(String(s ?? ""));
  return m ? lower(m[1]) : "";
}
function headerMap(list: { Name?: string; Value?: string; name?: string; value?: string }[] | Record<string, string | string[]> | null | undefined) {
  const out: Record<string, string[]> = {};
  const add = (k: string, v: string) => { const key = lower(k); (out[key] ??= []).push(String(v)); };
  if (Array.isArray(list)) for (const h of list) add(h.Name ?? h.name ?? "", h.Value ?? h.value ?? "");
  else for (const [k, v] of Object.entries(list ?? {})) for (const x of Array.isArray(v) ? v : [v]) add(k, x);
  return out;
}

/* ------------------------------ who really sent it ------------------------------ */

export type Verdict = { ok: boolean; why: string };
/**
 * Whether the receiving provider vouches that this mail is from `m.from`. Resend: its own DMARC pass, or its DKIM pass
 * (which it reports only when the signing domain matches the From domain). Postmark: a DKIM signature on the raw
 * message that we verify ourselves, by the From domain or a parent of it. Headers in the message are never trusted,
 * because the sender writes them; ARC is ignored. SPF alone isn't enough: it checks the envelope sender, not the From
 * line people see. Anything we can't confirm is a no.
 */
export async function senderVerified(m: Pick<InMail, "from" | "auth">, o: { txt?: TxtLookup; now?: number } = {}): Promise<Verdict> {
  if (!m.from || !m.auth) return { ok: false, why: "no_auth" };
  if (m.auth.provider === "resend") {
    const r = m.auth.result;
    if (!r) return { ok: false, why: "resend_no_auth" };
    if (lower(r.dmarc) === "pass") return { ok: true, why: "resend_dmarc_pass" };
    if (lower(r.dkim) === "pass") return { ok: true, why: "resend_dkim_pass" };
    return { ok: false, why: "resend_not_passed" };
  }
  if (m.auth.provider === "postmark") {
    if (!m.auth.raw) return { ok: false, why: "postmark_raw_missing" };
    try {
      const r = await verifyDkim(m.auth.raw, m.from, { txt: o.txt ?? dohTxt, now: o.now });
      return { ok: r.ok, why: r.ok ? "postmark_dkim_pass" : "postmark_" + r.why };
    } catch (e) { return { ok: false, why: "postmark_error:" + String(e).slice(0, 80) }; }
  }
  return { ok: false, why: "unknown_provider" };
}

/* ------------------------------ the two ways in ------------------------------ */

/** Postmark's inbound webhook: Basic auth from the URL it was given. */
export function postmarkAuthOk(authorization: string, expected: string): boolean {
  if (!expected || !/^Basic\s+/i.test(authorization)) return false;
  let got = ""; try { got = atob(authorization.replace(/^Basic\s+/i, "").trim()); } catch { return false; }
  if (got.length !== expected.length) return false;
  let d = 0; for (let i = 0; i < got.length; i++) d |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return d === 0;
}
type Postmark = { MessageID?: string; FromFull?: { Email?: string; Name?: string }; From?: string; FromName?: string; To?: string; ToFull?: { Email?: string }[]; OriginalRecipient?: string;
  Subject?: string; TextBody?: string; HtmlBody?: string; StrippedTextReply?: string; Headers?: { Name: string; Value: string }[]; Attachments?: { Name?: string; Content?: string; ContentType?: string; ContentLength?: number }[];
  RawEmail?: string };
export function parsePostmark(p: Postmark): InMail | null {
  const from = addressOf(p.FromFull?.Email ?? p.From);
  const headers = headerMap(p.Headers ?? []);
  const id = String(headers["message-id"]?.[0] ?? p.MessageID ?? "").trim();
  if (!from || !id) return null;
  const to = [...(p.ToFull ?? []).map((t) => lower(t.Email)), ...String(p.To ?? "").split(",").map(addressOf), lower(p.OriginalRecipient)].filter(Boolean);
  // A forward (an agency's letter) is the point of the mail, so it's kept whole; a reply loses the quoted thread.
  const body = p.TextBody || htmlToText(p.HtmlBody ?? "");
  const text = isForward(p.Subject) ? body : p.StrippedTextReply?.trim() ? p.StrippedTextReply : stripQuoted(body);
  const files = (p.Attachments ?? []).map((a) => {
    let bytes: Uint8Array | undefined;
    try { bytes = Uint8Array.from(atob(String(a.Content ?? "")), (c) => c.charCodeAt(0)); } catch { bytes = undefined; }
    return { name: String(a.Name ?? "attachment"), mime: lower(a.ContentType).split(";")[0], bytes, size: Number(a.ContentLength ?? bytes?.length ?? 0) };
  });
  return { id: `mail:${id}`, from, name: String(p.FromFull?.Name ?? p.FromName ?? ""), to: [...new Set(to)], subject: String(p.Subject ?? "").slice(0, 300), text: text.trim().slice(0, 6000), headers, files,
    auth: { provider: "postmark", raw: typeof p.RawEmail === "string" && p.RawEmail ? p.RawEmail : null } };
}

const RESEND = "https://api.resend.com";
/** Resend's webhook says a mail arrived; its content comes from the API. Null when it isn't an inbound mail. */
export async function fetchResend(env: Env, ev: { type?: string; data?: { email_id?: string } }, f: typeof fetch = fetch): Promise<InMail | null> {
  if (ev.type !== "email.received" || !ev.data?.email_id) return null;
  const id = encodeURIComponent(ev.data.email_id);
  const get = async (path: string) => {
    const res = await f(`${RESEND}${path}`, { headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}` }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`resend ${res.status}`);
    return await res.json();
  };
  const m = await get(`/emails/receiving/${id}`) as { id: string; from: string; to?: string[]; received_for?: string[]; subject?: string; text?: string | null; html?: string | null; headers?: Record<string, string> | null; message_id?: string; attachments?: unknown[];
    authentication?: { spf?: string; dkim?: string; dmarc?: string } | null };
  const files: InFile[] = [];
  if (m.attachments?.length) {
    const list = await get(`/emails/receiving/${id}/attachments`) as { data?: { filename?: string; content_type?: string; size?: number; download_url?: string; content_disposition?: string }[] };
    for (const a of list.data ?? []) if (a.download_url && a.content_disposition !== "inline") files.push({ name: String(a.filename ?? "attachment"), mime: lower(a.content_type).split(";")[0], url: a.download_url, size: Number(a.size ?? 0) });
  }
  const headers = headerMap(m.headers ?? {});
  return {
    id: `mail:${String(m.message_id ?? headers["message-id"]?.[0] ?? m.id).trim()}`, from: addressOf(m.from), name: /^\s*"?([^"<]+?)"?\s*</.exec(String(m.from ?? ""))?.[1] ?? "",
    to: [...new Set([...(m.to ?? []), ...(m.received_for ?? [])].map(addressOf).filter(Boolean))], subject: String(m.subject ?? "").slice(0, 300),
    text: (isForward(m.subject) ? (m.text || htmlToText(m.html ?? "")) : stripQuoted(m.text || htmlToText(m.html ?? ""))).trim().slice(0, 6000), headers, files,
    auth: { provider: "resend", result: m.authentication && typeof m.authentication === "object" ? m.authentication : null },
  };
}

/* ------------------------------ text ------------------------------ */

export const isForward = (subject: unknown) => /^\s*(fwd?|fw|转发|轉寄)\s*[:：]/i.test(String(subject ?? ""));
/** Their words without the quoted thread below: cut at "On … wrote:", Outlook's header block, Chinese mail clients'
 *  发件人 block, or the first run of ">" lines. */
export function stripQuoted(text: string): string {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((l, i) =>
    /^\s*On .{3,200} wrote:\s*$/.test(l) || (/^\s*On .{3,120}$/.test(l) && /wrote:\s*$/.test(lines[i + 1] ?? "")) ||
    /^\s*-{2,}\s*(Original Message|Forwarded message|原始邮件|转发的邮件)\s*-{2,}/i.test(l) ||
    /^\s*(From|发件人|寄件者)\s*[:：]\s*\S/.test(l) && /^\s*(Sent|Date|发送时间|日期|To|收件人)\s*[:：]/.test(lines[i + 1] ?? "") ||
    /^\s*>/.test(l) && /^\s*>/.test(lines[i + 1] ?? ""));
  // A forwarded message inside is kept: it's what they want read.
  const forwarded = /^\s*-{2,}\s*(Forwarded message|转发的邮件)/i.test(lines[cut] ?? "");
  return (cut > 0 && !forwarded ? lines.slice(0, cut) : lines).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function htmlToText(html: string): string {
  return String(html ?? "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** The agent's answer as an email: markdown marks dropped, paragraphs kept, links clickable in the HTML part. */
export function mailBody(answer: string, footer?: string): { text: string; html: string } {
  const text = String(answer ?? "").replace(/```[a-z]*\n?([\s\S]*?)```/gi, "$1").replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/(\*\*|__)(.+?)\1/g, "$2").replace(/`([^`]+)`/g, "$1").replace(/^[ \t]*#{1,6}[ \t]+/gm, "").replace(/^[ \t]*[*+][ \t]+/gm, "- ").replace(/\s*[—–]\s*/g, ", ").trim()
    + (footer ? `\n\n${footer}` : "");
  const html = text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>").replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`)}</p>`).join("");
  return { text, html: `<div style="font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1f">${html}</div>` };
}
export const replySubject = (s: string) => (/^\s*(re|回复)\s*[:：]/i.test(s) ? s : `Re: ${s || "Your note"}`).slice(0, 300);

/* ------------------------------ sending ------------------------------ */

export type MailResult = { ok: boolean; status: number; id?: string; detail?: string };
/** One email from Odelia, threaded under theirs. Postmark when it's set up, else Resend. */
export async function sendMail(env: Env, o: { to: string; subject: string; text: string; html: string; inReplyTo?: string }, f: typeof fetch = fetch): Promise<MailResult> {
  if (!mailOutReady(env)) return { ok: false, status: 503, detail: "not_configured" };
  const from = `${env("ODELIA_EMAIL_NAME") || "Odelia (Placetta)"} <${odeliaEmail(env)}>`;
  const thread = o.inReplyTo ? { "In-Reply-To": o.inReplyTo, References: o.inReplyTo } : {};
  try {
    const pm = env("POSTMARK_SERVER_TOKEN");
    const res = pm
      ? await f("https://api.postmarkapp.com/email", { method: "POST", headers: { "X-Postmark-Server-Token": pm, "Content-Type": "application/json", Accept: "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ From: from, To: o.to, Subject: o.subject, TextBody: o.text, HtmlBody: o.html, MessageStream: "outbound", Headers: Object.entries(thread).map(([Name, Value]) => ({ Name, Value })) }) })
      : await f(`${RESEND}/emails`, { method: "POST", headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ from, to: [o.to], subject: o.subject, text: o.text, html: o.html, headers: thread }) });
    const j = await res.json().catch(() => ({})) as { MessageID?: string; id?: string; Message?: string; message?: string };
    return res.ok ? { ok: true, status: res.status, id: String(j.MessageID ?? j.id ?? "") } : { ok: false, status: res.status, detail: String(j.Message ?? j.message ?? "").slice(0, 200) };
  } catch (e) { return { ok: false, status: 502, detail: String(e).slice(0, 200) }; }
}
