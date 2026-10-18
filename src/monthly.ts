import type { Bi } from "./bi";
import type { Workspace } from "./model";
import { isBlank } from "./core";

/* ------------------------------------------------------------------ *
 * What Odelia did this month, measured, never invented (the way Alven
 * puts "71% / 391% / 20%" on the product, but each number from the
 * workspace's own records and each one opening the list behind it).
 *
 * The same definitions run in two places: here, for the sample workspace
 * and as the reference; and in the database (odelia_month_detail in the
 * 20261017200000_odelia_metrics migration), for an account, Headquarters
 * and the Placetta team. The end-to-end test checks the two agree.
 *
 *   plan        the first plan: from the signup press to the plan on Home (firstPlan.ms, measured once by Home)
 *   first reply the median time from a request to Odelia's first words (agent_runs: created_at to first_text_at)
 *   job done    the median time from a request to the finished answer (agent_runs: created_at to done_at)
 *   mapped      permits in the plan (every application)
 *   filled      applications with every line of the form filled
 *   waiting     approvals waiting for the person now, and how long the oldest has waited (kept as asked: Approval.at)
 *   submitted   filings that went to the agency this month
 *   approved    filings the agency approved this month
 *   renewals    renewals on Deadlines whose date hasn't passed: caught before they lapse
 * Hours saved is left out on purpose: nothing in docs/ documents a time per task to derive it from, and an estimate
 * without one would be invented.
 * ------------------------------------------------------------------ */

export type RunTime = { id: string; prompt: string; created_at: string; first_ms: number | null; done_ms: number | null };
export type Item = { id: string; title: Bi; at?: string | null; date?: string; status?: string };
export type MonthMetrics = {
  month: string;
  plan_ms: number | null; plan_at: string | null; plan_apps: number | null;
  runs: RunTime[]; median_first_ms: number | null; median_done_ms: number | null;
  mapped: Item[]; filled: Item[]; waiting: Item[]; submitted: Item[]; approved: Item[]; renewals: Item[];
};
/** A filing as the account's server keeps it (src/cloud/api.ts Filing), only what the numbers need. */
export type FilingLite = { id: string; app_id: string; title: Bi; status: string; submitted_at: string | null; decided_at: string | null };
/** A run as agent_runs keeps it, or as this browser timed it (Workspace.runs). */
export type RunRow = { id: string; prompt: string; created_at: string; first_text_at?: string | null; done_at?: string | null; status?: string };

/** The middle value (the mean of the two middle ones for an even count), in whole milliseconds; null for none. The
 *  database's percentile_cont(0.5) gives the same. */
export function median(xs: number[]): number | null {
  const v = xs.filter(x => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return Math.round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
}
const ms = (from: string, to?: string | null) => (to ? Date.parse(to) - Date.parse(from) : NaN);
/** The first day of a date's month, YYYY-MM-01. */
export const monthOf = (day: string) => day.slice(0, 7) + "-01";
const inMonth = (iso: string | null | undefined, month: string) => !!iso && iso.slice(0, 7) === month.slice(0, 7);

/** This month's numbers for one workspace. runs: the account's agent_runs (or this browser's own timings); filings: the
 *  account's filings. Without filings (the sample), submissions and approvals come from the audit trail. */
export function monthMetrics(w: Workspace, o: { today: string; runs?: RunRow[]; filings?: FilingLite[] }): MonthMetrics {
  const month = monthOf(o.today);
  const fp = w.firstPlan;
  const runs: RunTime[] = (o.runs ?? w.runs ?? []).filter(r => inMonth(r.created_at, month))
    .map(r => ({ id: r.id, prompt: r.prompt.slice(0, 120), created_at: r.created_at, first_ms: Number.isFinite(ms(r.created_at, r.first_text_at)) ? ms(r.created_at, r.first_text_at) : null, done_ms: (r.status ?? "done") === "done" && Number.isFinite(ms(r.created_at, r.done_at)) ? ms(r.created_at, r.done_at) : null }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const asked = new Map<string, string>();
  for (const a of w.audit) if (a.action.en === "Asked for approval" && !asked.has(a.object.en)) asked.set(a.object.en, a.at);   // newest first
  const appOf = (id?: string) => w.apps.find(a => a.id === id);
  const fromAudit = (match: (x: Workspace["audit"][number]) => boolean) => w.audit.filter(x => inMonth(x.at, month) && match(x)).map(x => ({ id: x.id, title: x.object, at: x.at }));
  return {
    month,
    plan_ms: typeof fp?.ms === "number" ? fp.ms : null, plan_at: fp?.at ?? null, plan_apps: fp?.apps ?? null,
    runs, median_first_ms: median(runs.map(r => r.first_ms ?? NaN)), median_done_ms: median(runs.map(r => r.done_ms ?? NaN)),
    mapped: w.apps.map(a => ({ id: a.id, title: a.name, status: a.status })),
    filled: w.apps.filter(a => a.fields.length > 0 && a.fields.every(f => !isBlank(f.value))).map(a => ({ id: a.id, title: a.name, status: a.status })),
    waiting: w.approvals.filter(a => a.kind !== "pay").map(a => ({ id: a.id, title: a.title, at: a.at ?? asked.get(appOf(a.app)?.name.en ?? "") ?? null })),
    submitted: o.filings ? o.filings.filter(f => inMonth(f.submitted_at, month)).map(f => ({ id: f.id, title: f.title, at: f.submitted_at }))
      : fromAudit(x => /^Submitted/.test(x.action.en) && (x.actor === "agent" || x.actor === "team")),
    approved: o.filings ? o.filings.filter(f => f.status === "accepted" && inMonth(f.decided_at, month)).map(f => ({ id: f.id, title: f.title, at: f.decided_at }))
      : fromAudit(x => x.actor === "agency" && /^(Approved|Issued)$/.test(x.action.en)),
    renewals: w.deadlines.filter(d => d.kind === "renewal" && d.date >= o.today).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({ id: d.id, title: d.title, date: d.date })),
  };
}

/** Whether there's anything to show: a card with only zeros says nothing. */
export const anything = (m: MonthMetrics) => m.plan_ms != null || m.runs.length > 0 || m.mapped.length > 0 || m.submitted.length > 0 || m.approved.length > 0;

/** Headquarters and the Placetta team: the same numbers across workspaces (one row each), with the medians taken over
 *  every run, not over each workspace's median. */
export type MonthRow = { workspace_id: string; name: string; brand?: string | null; plan_ms: number | null; runs: number; median_first_ms: number | null; median_done_ms: number | null;
  mapped: number; filled: number; waiting: number; oldest_waiting_at: string | null; submitted: number; approved: number; renewals: number };
export type MonthAcross = { month: string; workspaces: number; totals: Omit<MonthRow, "workspace_id" | "name" | "brand"> & { median_plan_ms: number | null }; rows: MonthRow[] };
