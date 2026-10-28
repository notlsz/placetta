// What odelia-mail does with a POST from Amazon SNS: Amazon SES's inbound mail, bounces and complaints. Kept apart from
// the function so it can be tested whole (ses_inbound_test.ts): verify (sns.ts), confirm our own subscription, suppress
// hard bounces and complaints, or hand a received mail on. Anything that doesn't verify does nothing at all.
import { type Env, fetchSesS3, type InMail, mailInReady, parseSes, sesRaw } from "./mail.ts";
import { confirmSubscription, type FetchCert, verifySns } from "./sns.ts";
import { sesEvent, type Suppression } from "./suppression.ts";

export type SnsRoute = { status: number; body: Record<string, unknown>; mail?: InMail };
export type SnsDeps = { suppress: (list: Suppression[]) => Promise<number>; f?: typeof fetch; fetchCert?: FetchCert; now?: number };

export async function routeSns(raw: string, env: Env, d: SnsDeps): Promise<SnsRoute> {
  const v = await verifySns(raw, env, { fetchCert: d.fetchCert, now: d.now });
  if (!v.ok) { console.warn("sns refused", v.why); return { status: 403, body: { error: { code: "forbidden", message: "Not a message from our SNS topic." } } }; }
  const m = v.msg;
  if (m.Type === "SubscriptionConfirmation") {
    const confirmed = await confirmSubscription(m, env, d.f);
    return { status: confirmed ? 200 : 502, body: { ok: confirmed, confirmed } };
  }
  if (m.Type !== "Notification") return { status: 200, body: { ok: true, skipped: m.Type } };
  let note: Record<string, unknown>;
  try { note = JSON.parse(m.Message); } catch { return { status: 200, body: { ok: true, skipped: "not_ses" } }; }
  const ev = sesEvent(note);
  if (ev.kind === "suppress") return { status: 200, body: { ok: true, suppressed: await d.suppress(ev.list) } };
  if (ev.kind === "ignore") return { status: 200, body: { ok: true, skipped: ev.why } };
  if (!mailInReady(env)) return { status: 503, body: { error: { code: "not_configured", message: "Email isn't set up: set ODELIA_EMAIL." } } };
  let rawMail = sesRaw(note);
  if (!rawMail) {
    try { rawMail = await fetchSesS3(env, note, d.f); } catch (e) { console.error("ses s3", String(e).slice(0, 160)); return { status: 502, body: { error: { code: "upstream_error", message: "Couldn't read the email." } } }; }
  }
  const mail = parseSes(note, rawMail);
  if (!mail) return { status: 200, body: { ok: true, skipped: "unreadable" } };
  return { status: 200, body: { ok: true }, mail };
}
