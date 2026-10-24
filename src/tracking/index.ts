/* Status tracking: how often each filing with an agency is checked, when to escalate, and what counts as a change.

   What it copies, and from where:
     cadence      Vanta's automated tests run on a schedule, not once a quarter. Every application submitted, in
                  progress or waiting on the business is checked daily; so is anything holding up an opening date or
                  with a deadline in the next 30 days, whatever its stage.
     cost         a check that needs only code (the city's open data, ../filingPlaybooks/status.ts) runs every day for
                  nothing. A page is fetched and compared by its content hash, Visualping/Distill style: the model
                  reads it only when it changed. A filing with no lookup in code is Odelia's to check, and those back
                  off while nothing moves (1, 1, 2, 4, 7 days), except while hot, when they stay daily.
     escalation   Zendesk's and Linear's SLA badges: on track, at risk (80% of the agency's published time used), and
                  breached. Past the published time with no movement for ESCALATE_AFTER days, it escalates once a
                  fortnight: an Update for the owner, a task for the team, and Odelia drafts the status inquiry.
     notify       Stripe's and GitHub's "only on change": a check that finds nothing new is a line on the timeline
                  ("last checked 2 hours ago"), never a message.
   Pure functions: the monitor, the app and the tests share them. */
import type { Bi } from "../bi";

export const TRACKED = new Set(["submitted", "needs_info", "in_progress"]);
const FINAL = new Set(["accepted", "rejected", "canceled"]);
/** A deadline this close makes a filing hot: checked daily whatever its status. */
export const HOT_DAYS = 30;
/** Days between model checks while nothing moves (not hot). */
export const BACKOFF = [1, 1, 2, 4, 7];
/** Days between tries when the agency's site or feed fails. */
export const ERROR_BACKOFF = [1, 2, 4, 7];
/** Past the agency's published time, this many days with no movement escalates. */
export const ESCALATE_AFTER = 7;
/** An escalation repeats at most this often. */
export const ESCALATE_EVERY = 14;

export type CheckKind = "open_data" | "page" | "model";
export type Tracking = {
  last_checked_at?: string | null; next_check_at?: string | null; unchanged_checks?: number | null; check_errors?: number | null;
  last_hash?: string | null; agency_status?: string | null; agency_norm?: string | null; agency_status_at?: string | null; last_movement_at?: string | null; escalated_at?: string | null;
};

const DAY = 864e5;
const days = (from: string, to: string) => Math.floor((Date.parse(to) - Date.parse(from)) / DAY);

/** Why a filing is hot, if it is: it sets the opening date (critical), or a deadline on it is within HOT_DAYS. */
export function hotReason(appId: string, state: unknown, today: string): "opening" | "deadline" | null {
  const st = (state ?? {}) as { apps?: { id?: unknown; critical?: unknown }[]; deadlines?: { app?: unknown; date?: unknown; kind?: unknown }[] };
  if ((st.apps ?? []).some((a) => a?.id === appId && a.critical === true)) return "opening";
  const soon = (st.deadlines ?? []).some((d) => d?.app === appId && typeof d.date === "string" && d.kind !== "renewal"
    && d.date >= today && days(today + "T00:00:00Z", d.date + "T00:00:00Z") <= HOT_DAYS);
  return soon ? "deadline" : null;
}

/** Whether a filing is tracked at all: with the agency or the business, or hot and not finished. */
export const inScope = (status: string, hot: boolean) => TRACKED.has(status) || (hot && !FINAL.has(status));

/* Good standing after approval. Vanta's tests keep running after the audit ("Real-time monitoring of controls via
   automated tests", vanta.com/features); an approved license here was checked until it was issued, then never again.
   Now a license the agency publishes by number in open data is read once a week after approval, so a revocation, a
   cancellation or a lapse on the agency's own record reaches the owner (and the status page) without anyone looking. */
/** Days between good-standing checks of an approved license. */
export const STANDING_EVERY = 7;
/** An approved filing watched for good standing: approved, its number on file, and its agency's record readable in code. */
export const inStanding = (status: string, number: string | null | undefined, lookupKind: string | null | undefined) =>
  status === "accepted" && !!String(number ?? "").trim() && lookupKind === "open_data";
/** What the agency's record says that takes a license out of good standing. */
export const OUT_OF_STANDING = new Set(["expired", "denied", "withdrawn", "suspended"]);
/** A good-standing check notifies only when the record leaves good standing, or comes back to it. */
export function standingChange(prevNorm: string | null | undefined, next: { norm: string }): "lost" | "back" | null {
  const bad = OUT_OF_STANDING.has(next.norm), wasBad = !!prevNorm && OUT_OF_STANDING.has(prevNorm);
  if (bad && !wasBad) return "lost";
  if (!bad && wasBad && (next.norm === "issued" || next.norm === "approved")) return "back";
  return null;
}

/** Whether its check is due now. */
export const due = (t: Tracking | null | undefined, now: number) => !t?.next_check_at || Date.parse(t.next_check_at) <= now;

/** When the next check runs, after this one. */
export function nextCheckAt(now: number, o: { kind: CheckKind; hot: boolean; changed: boolean; error: boolean; unchanged: number; errors: number; standing?: boolean }): string {
  const n = o.error ? ERROR_BACKOFF[Math.min(Math.max(o.errors - 1, 0), ERROR_BACKOFF.length - 1)]
    : o.standing ? STANDING_EVERY
    : o.changed || o.kind !== "model" || o.hot ? 1
    : BACKOFF[Math.min(o.unchanged, BACKOFF.length - 1)];
  // a few minutes early, so tomorrow's daily run (which starts at the same time) always finds it due
  return new Date(now + n * DAY - 15 * 60e3).toISOString();
}

export type Sla = { state: "on_track" | "at_risk" | "breached"; waited: number; usual: number; stalled: number };
/** The SLA badge: days with the agency against its published time, and days since anything moved. */
export function sla(submittedAt: string | null | undefined, usualDays: number | null, today: string, lastMovement?: string | null): Sla | null {
  if (!submittedAt || !usualDays) return null;
  const t = today + "T12:00:00Z";
  const waited = days(submittedAt, t), stalled = days(lastMovement && lastMovement > submittedAt ? lastMovement : submittedAt, t);
  return { state: waited > usualDays ? "breached" : waited >= usualDays * 0.8 ? "at_risk" : "on_track", waited, usual: usualDays, stalled };
}

/** Escalate now: past the published time, nothing moved for ESCALATE_AFTER days, and not escalated in the last fortnight. */
export function escalate(s: Sla | null, escalatedAt: string | null | undefined, today: string): boolean {
  if (!s || s.state !== "breached" || s.stalled < ESCALATE_AFTER) return false;
  return !escalatedAt || days(escalatedAt, today + "T12:00:00Z") >= ESCALATE_EVERY;
}

/* ------------------------------ change detection ------------------------------ */

/** A page's text as a person reads it, without what changes on every load (times, tokens, counters), so its hash moves
 *  only when what it says moves. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<input[^>]*type=["']?hidden[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, "\"")
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b/gi, " ")
    .replace(/\b(page (generated|rendered|loaded)|last (refreshed|updated)|as of)\b[^.\n]{0,40}/gi, " ")
    .replace(/\b[0-9a-f]{16,}\b/gi, " ")
    .replace(/\s+/g, " ").trim();
}

/** SHA-256 of a string, hex. */
export async function hashOf(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** What notifies the owner: a status that means something different from the last one seen. The first sighting sets
 *  the baseline and notifies only when it is news on its own (approved, issued, denied, a request, expired). */
export function realChange(prevNorm: string | null | undefined, prevStatus: string | null | undefined, next: { status: string; norm: string }): boolean {
  if (!prevStatus) return ["approved", "issued", "denied", "needs_info", "expired", "suspended"].includes(next.norm);
  return next.norm !== prevNorm || (next.norm === "unknown" && next.status.trim().toLowerCase() !== prevStatus.trim().toLowerCase());
}

/* ------------------------------ words ------------------------------ */

export const NORM_WORDS: Record<string, Bi> = {
  received: { en: "Received", zh: "已受理" }, in_review: { en: "In review", zh: "审核中" }, needs_info: { en: "Needs something from you", zh: "需要补充材料" },
  approved: { en: "Approved", zh: "已批准" }, issued: { en: "Issued", zh: "已发证" }, denied: { en: "Denied", zh: "被拒" },
  withdrawn: { en: "Withdrawn", zh: "已撤回" }, expired: { en: "Expired", zh: "已过期" }, suspended: { en: "Suspended", zh: "已暂停" }, unknown: { en: "Status changed", zh: "状态有变化" },
};

/* ------------------------------ the agency's expiration date ------------------------------ */

/** What the agency's own record says about when a license expires, against the renewal on the workspace's calendar.
 *  The agency's date governs: a calendar counted from a published cycle can be off by the agency's own term (Texas
 *  aligns a new license to the owner's existing ones; New York issues for set terms). Returns what to tell the owner,
 *  or null when they agree or the record has no date. */
export function expiryDrift(agencyExpires: string | null | undefined, calendar: string | null | undefined, today: string):
  { kind: "none_on_calendar" | "differs"; agency: string; calendar: string | null } | null {
  if (!agencyExpires || !/^\d{4}-\d{2}-\d{2}$/.test(agencyExpires) || agencyExpires < today) return null;
  if (!calendar) return { kind: "none_on_calendar", agency: agencyExpires, calendar: null };
  return calendar === agencyExpires ? null : { kind: "differs", agency: agencyExpires, calendar };
}

/** "2 hours ago" / "2 小时前", for "last checked". */
export function ago(iso: string | null | undefined, now: number, lang: "en" | "zh"): string {
  if (!iso) return lang === "zh" ? "尚未检查" : "not checked yet";
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60e3));
  if (m < 1) return lang === "zh" ? "刚刚" : "just now";
  if (m < 60) return lang === "zh" ? `${m} 分钟前` : `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === "zh" ? `${h} 小时前` : `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return lang === "zh" ? `${d} 天前` : `${d} day${d === 1 ? "" : "s"} ago`;
}

/* ------------------------------ cost ------------------------------ */

/** The cost of a model status check: one background run that reads one agency page and answers in a line. Priced at the
 *  measured cost of a chat turn on the default route (docs/UNIT-ECONOMICS.md, "One chat turn on an open store": 2 model
 *  calls, $0.0128 on Gemini 3.8 Flash with its cache, $0.0405 on Anthropic only). A check in code costs nothing. */
export const MODEL_CHECK_USD = { default: 0.0128, anthropic: 0.0405 };

/** A store-month of status checks, est.: filings in flight, the share whose agency has a lookup in code, how many changes
 *  a filing sees in a month (each one read by the model when it came from a page), and the share of model-only filings
 *  that are hot (daily) versus backing off. */
export function checksPerStoreMonth(o: { inFlight: number; codeShare: number; changesPerMonth: number; hotShare: number; route?: "default" | "anthropic" }) {
  const price = MODEL_CHECK_USD[o.route ?? "default"];
  const code = o.inFlight * o.codeShare, model = o.inFlight - code;
  // backing off from 1 day to 7 while nothing moves: 1+1+2+4+7 covers 15 days in 5 checks, then one a week
  const backoffChecks = 5 + Math.ceil((30 - 15) / 7);
  // each change restarts the back-off at daily: about two more checks per change on a filing that isn't hot
  const modelChecks = model * (o.hotShare * 30 + (1 - o.hotShare) * Math.min(30, backoffChecks + 2 * o.changesPerMonth));
  const checks = code * 30 + modelChecks;
  const usd = modelChecks * price;
  return { checks: Math.round(checks), modelChecks: Math.round(modelChecks * 10) / 10, usd: Math.round(usd * 100) / 100, perCheck: checks ? Math.round((usd / checks) * 10000) / 10000 : 0 };
}
