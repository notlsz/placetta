// Sending email, by one of three providers, chosen with one setting:
//
//   EMAIL_PROVIDER=ses|resend|postmark   the provider, when set (if its keys are missing, nothing is sent and it says so)
//   unset: Amazon SES when its keys are set; else Postmark for Odelia's own mail and Resend for Placetta's notices (as
//   before SES), else whichever of the two is set.
//
//   Amazon SES   AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY, AWS_SES_REGION (us-east-1), AWS_SES_CONFIGURATION_SET
//                (optional). SES v2 SendEmail with a raw MIME message (mime.ts), signed with SigV4 (sigv4.ts).
//   Postmark     POSTMARK_SERVER_TOKEN
//   Resend       RESEND_API_KEY
//
// Every send can be given the suppression list (suppression.ts): an address that hard-bounced or complained is never
// mailed again, by any provider. Pure apart from the fetch it's given; tested in email_test.ts.
import { awsFetch } from "./sigv4.ts";
import { buildMime, type OutFile } from "./mime.ts";

export type Env = (k: string) => string | undefined;
export type Provider = "ses" | "postmark" | "resend";
export type Purpose = "odelia" | "system";
export type MailResult = { ok: boolean; status: number; id?: string; detail?: string; provider?: Provider; suppressed?: string[] };
export type Email = {
  from: string; to: string[]; subject: string; text: string; html?: string;
  replyTo?: string; headers?: Record<string, string>; attachments?: OutFile[];
};
/** Which of these addresses are on the suppression list. */
export type Suppressed = (emails: string[]) => Promise<Set<string>>;

const val = (env: Env, k: string) => (env(k) ?? "").trim();
export const sesRegion = (env: Env) => (val(env, "AWS_SES_REGION") || "us-east-1").toLowerCase();
export const sesReady = (env: Env) => !!(val(env, "AWS_SES_ACCESS_KEY_ID") && val(env, "AWS_SES_SECRET_ACCESS_KEY"));

/** The provider that sends, or null when none is set up. */
export function emailProvider(env: Env, purpose: Purpose = "system"): Provider | null {
  const has: Record<Provider, boolean> = { ses: sesReady(env), postmark: !!val(env, "POSTMARK_SERVER_TOKEN"), resend: !!val(env, "RESEND_API_KEY") };
  const want = val(env, "EMAIL_PROVIDER").toLowerCase();
  if (want) return (want === "ses" || want === "postmark" || want === "resend") && has[want] ? want : null;
  if (has.ses) return "ses";
  const order: Provider[] = purpose === "odelia" ? ["postmark", "resend"] : ["resend", "postmark"];
  return order.find((p) => has[p]) ?? null;
}
/** Placetta's own notices (team alerts, digests, reminders) need a provider and MAIL_FROM. */
export const systemMailReady = (env: Env) => !!emailProvider(env, "system") && !!val(env, "MAIL_FROM");

const lower = (s: string) => String(s ?? "").trim().toLowerCase();
const addr = (s: string) => lower(/<([^<>\s]+@[^<>\s]+)>/.exec(s)?.[1] ?? s);
const b64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const clean = (s: string) => String(s ?? "").replace(/[\r\n]+/g, " ").trim();

/** Sends one email. Never throws. */
export async function sendEmail(env: Env, m: Email, o: { f?: typeof fetch; purpose?: Purpose; suppressed?: Suppressed } = {}): Promise<MailResult> {
  const provider = emailProvider(env, o.purpose ?? "system");
  if (!provider) return { ok: false, status: 503, detail: "not_configured" };
  const f = o.f ?? fetch;
  let to = [...new Set(m.to.map(clean).filter((x) => /@/.test(x)))];
  let dropped: string[] = [];
  if (o.suppressed && to.length) {
    try {
      const hit = await o.suppressed(to.map(addr));
      dropped = to.filter((x) => hit.has(addr(x)));
      to = to.filter((x) => !hit.has(addr(x)));
    } catch (e) { console.error("suppression lookup", String(e).slice(0, 120)); }
  }
  if (!to.length) return { ok: false, status: 422, detail: dropped.length ? "suppressed" : "no_recipient", provider, suppressed: dropped };
  const subject = clean(m.subject).slice(0, 300);
  const files = (m.attachments ?? []).map((a) => ({ name: clean(a.name).replace(/"/g, " ").slice(0, 150), data: a.content, type: a.type }));
  try {
    let res: Response;
    if (provider === "ses") {
      const raw = buildMime({ from: m.from, to, subject, text: m.text, html: m.html, replyTo: m.replyTo, headers: m.headers, attachments: files.map((x) => ({ name: x.name, content: x.data, type: x.type })) });
      const cs = val(env, "AWS_SES_CONFIGURATION_SET");
      const body = JSON.stringify({
        // Reply-To and the threading headers ride in the raw message itself
        FromEmailAddress: clean(m.from), Destination: { ToAddresses: to },
        Content: { Raw: { Data: b64(new TextEncoder().encode(raw)) } }, ...(cs ? { ConfigurationSetName: cs } : {}),
      });
      const region = sesRegion(env);
      res = await awsFetch({ method: "POST", url: `https://email.${region}.amazonaws.com/v2/email/outbound-emails`, region, service: "ses", headers: { "content-type": "application/json" }, body },
        { accessKeyId: val(env, "AWS_SES_ACCESS_KEY_ID"), secretAccessKey: val(env, "AWS_SES_SECRET_ACCESS_KEY") }, f);
    } else if (provider === "postmark") {
      res = await f("https://api.postmarkapp.com/email", { method: "POST", headers: { "X-Postmark-Server-Token": val(env, "POSTMARK_SERVER_TOKEN"), "Content-Type": "application/json", Accept: "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ From: m.from, To: to.join(", "), Subject: subject, TextBody: m.text, ...(m.html ? { HtmlBody: m.html } : {}), MessageStream: "outbound", ...(m.replyTo ? { ReplyTo: m.replyTo } : {}),
          Headers: Object.entries(m.headers ?? {}).map(([Name, Value]) => ({ Name, Value })),
          ...(files.length ? { Attachments: files.map((x) => ({ Name: x.name, Content: b64(x.data), ContentType: x.type })) } : {}) }) });
    } else {
      res = await f("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${val(env, "RESEND_API_KEY")}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ from: m.from, to, subject, text: m.text, ...(m.html ? { html: m.html } : {}), ...(m.replyTo ? { reply_to: m.replyTo } : {}), ...(m.headers ? { headers: m.headers } : {}),
          ...(files.length ? { attachments: files.map((x) => ({ filename: x.name, content: b64(x.data), content_type: x.type })) } : {}) }) });
    }
    const j = await res.json().catch(() => ({})) as { MessageId?: string; MessageID?: string; id?: string; Message?: string; message?: string };
    return res.ok ? { ok: true, status: res.status, id: String(j.MessageId ?? j.MessageID ?? j.id ?? ""), provider, ...(dropped.length ? { suppressed: dropped } : {}) }
      : { ok: false, status: res.status, detail: String(j.Message ?? j.message ?? "").slice(0, 200), provider };
  } catch (e) { return { ok: false, status: 502, detail: String(e).slice(0, 200), provider }; }
}
