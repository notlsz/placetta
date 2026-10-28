// Addresses Placetta never mails again: an address that bounced for good (no such mailbox, no such domain) or whose
// owner marked our mail as spam. Kept in public.email_suppressions (migration 20261104090000), read by every send
// (email.ts), and fed by Amazon SES's bounce and complaint notifications over SNS (odelia-mail). A soft bounce (a full
// mailbox, a server down for a while) is not suppressed: SES retries those itself.
import type { Suppressed } from "./email.ts";

export type Suppression = { email: string; reason: "bounce" | "complaint"; detail: string };
/** What an SES notification (identity notifications use notificationType; configuration set events use eventType) says. */
export type SesEvent =
  | { kind: "received" }
  | { kind: "suppress"; list: Suppression[] }
  | { kind: "ignore"; why: string };

const lower = (s: unknown) => String(s ?? "").trim().toLowerCase();
const isEmail = (s: string) => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/.test(s) && s.length <= 320;

export function sesEvent(n: unknown): SesEvent {
  const o = (n && typeof n === "object" ? n : {}) as Record<string, unknown>;
  const type = lower(o.notificationType ?? o.eventType);
  if (type === "received") return { kind: "received" };
  if (type === "bounce") {
    const b = (o.bounce ?? {}) as { bounceType?: string; bounceSubType?: string; bouncedRecipients?: { emailAddress?: string; diagnosticCode?: string }[] };
    if (lower(b.bounceType) !== "permanent") return { kind: "ignore", why: `bounce_${lower(b.bounceType) || "unknown"}` };
    const list = (b.bouncedRecipients ?? []).map((r) => ({ email: lower(r.emailAddress), reason: "bounce" as const, detail: `${b.bounceSubType ?? ""} ${r.diagnosticCode ?? ""}`.trim().slice(0, 300) })).filter((r) => isEmail(r.email));
    return list.length ? { kind: "suppress", list } : { kind: "ignore", why: "bounce_no_recipients" };
  }
  if (type === "complaint") {
    const c = (o.complaint ?? {}) as { complaintFeedbackType?: string; complaintSubType?: string; complainedRecipients?: { emailAddress?: string }[] };
    if (lower(c.complaintFeedbackType) === "not-spam") return { kind: "ignore", why: "complaint_not_spam" };
    const list = (c.complainedRecipients ?? []).map((r) => ({ email: lower(r.emailAddress), reason: "complaint" as const, detail: String(c.complaintFeedbackType ?? c.complaintSubType ?? "").slice(0, 300) })).filter((r) => isEmail(r.email));
    return list.length ? { kind: "suppress", list } : { kind: "ignore", why: "complaint_no_recipients" };
  }
  return { kind: "ignore", why: type ? `type_${type}` : "no_type" };
}

// deno-lint-ignore no-explicit-any
type Db = { from(t: string): any };   // a supabase-js client, as the service role

/** The suppression list as a lookup for sendEmail. */
export const suppressedIn = (db: Db): Suppressed => async (emails) => {
  const list = [...new Set(emails.map(lower).filter(Boolean))];
  if (!list.length) return new Set();
  const { data, error } = await db.from("email_suppressions").select("email").in("email", list);
  if (error) throw new Error(error.message ?? "suppression lookup failed");
  return new Set(((data ?? []) as { email: string }[]).map((r) => lower(r.email)));
};

/** Adds addresses to the list (again is fine: the reason and time are refreshed). */
export async function suppress(db: Db, list: Suppression[], provider = "ses"): Promise<number> {
  if (!list.length) return 0;
  const at = new Date().toISOString();
  const { error } = await db.from("email_suppressions").upsert(list.map((s) => ({ email: s.email, reason: s.reason, provider, detail: s.detail || null, last_at: at })), { onConflict: "email" });
  if (error) { console.error("suppress", error.message); return 0; }
  return list.length;
}
