/* Measured outcomes (migration 20261105091400_outcomes.sql): the shapes the team's Outcomes page reads, and the export.
   Every number comes with the sample it was measured on (n). Browser-safe: no prompt, tool or vendor detail. */

/** A number and the count of filings behind it. */
export type Measured = { n: number; value?: number | null; mean?: number | null; median?: number | null; pct?: number | null };

export type FlyBucket = { bucket: "1" | "2-4" | "5-9" | "10+"; n: number; median_cost_usd: number | null; median_days: number | null; median_team_minutes: number | null; human_free_pct: number | null };
export type Baseline = { form: string; kind: "expediter" | "consultant" | "diy"; provider: string; price_usd: number | null; days: number | null; days_unit: "calendar" | "business" | null; hours: number | null; note: string | null; source_url: string; read_on: string };

export type OutcomeMetrics = {
  rules: { touch_minutes: Record<"approval" | "upload" | "hand_back" | "answer", number>; public_min_n: number; agency_min_n: number; team_hour_usd: number };
  probe_filings_left_out: number;
  licenses_approved: Measured;
  median_days: Measured;
  by_agency: { agency: string | null; n: number; median_days: number | null }[];
  human_free: Measured & { unattended_pct: number | null };
  owner_touches: Measured & { hours_mean: number | null; by_kind: { approvals: number | null; uploads: number | null; hand_backs: number | null; answers: number | null } };
  team_minutes: Measured;
  ai_usd: Measured & { other_per_license: number | null };
  rejections: { n: number; rejected: number | null; returned: number | null; resubmissions: number | null };
  price: { n: number; mean_price_usd: number | null; mean_agency_fee_usd: number | null };
  margin: { n: number; per_license_mean: number | null; revenue: number; stripe: number | null; ai: number | null; browser: number | null; telephony: number | null; team: number | null; total: number | null; pct: number | null };
  renewals: { n: number; on_time_pct: number | null };
  workspaces: { n: number; retained_pct: number | null };
  flywheel: FlyBucket[];
  first_vs_tenth: { form: string; first_cost: number; first_days: number | null; first_team: number; tenth_cost: number; tenth_days: number | null; tenth_team: number }[];
  scripts: { name: string; key: string; uses: number; best_seconds: number | null }[];
  playbooks: { official: string; host: string; runs: number; successes: number; status: string }[];
  rejection_reasons: { form: string; reason: string; seen: number }[];
  baseline: Baseline[];
};

/** One real filing's outcome, as the export carries it (no business name; the workspace as a short one-way key). */
export type OutcomeRow = {
  filing: string; workspace: string; form: string | null; agency: string | null; status: string; channel: string | null;
  submitted_at: string | null; decided_at: string | null; days_to_approval: number | null; form_seq: number | null;
  owner_touches: number; owner_hours: number; team_minutes: number; human_free: boolean; rejections: number; resubmissions: number;
  price_usd: number | null; agency_fee_usd: number | null; ai_usd: number; browser_usd: number; telephony_usd: number; stripe_usd: number; team_usd: number;
};

export const EXPORT_COLUMNS: (keyof OutcomeRow)[] = [
  "filing", "workspace", "form", "agency", "status", "channel", "submitted_at", "decided_at", "days_to_approval", "form_seq",
  "owner_touches", "owner_hours", "team_minutes", "human_free", "rejections", "resubmissions", "price_usd", "agency_fee_usd",
  "ai_usd", "browser_usd", "telephony_usd", "stripe_usd", "team_usd",
];

/** A CSV cell: quoted when it holds a comma, a quote or a line break; a leading =, +, - or @ is neutralized so a
 *  spreadsheet never runs it as a formula. */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The export: one line per filing, then the summary with each number's sample size. */
export function outcomesCsv(rows: OutcomeRow[], m: OutcomeMetrics | null): string {
  const lines = [EXPORT_COLUMNS.join(","), ...rows.map(r => EXPORT_COLUMNS.map(c => csvCell(r[c])).join(","))];
  if (m) {
    lines.push("", "metric,value,n");
    const add = (k: string, v: unknown, n: number) => lines.push([k, v, n].map(csvCell).join(","));
    add("licenses_approved", m.licenses_approved.value, m.licenses_approved.n);
    add("median_days_to_approval", m.median_days.value, m.median_days.n);
    add("pct_filed_with_no_human", m.human_free.pct, m.human_free.n);
    add("owner_touches_per_license", m.owner_touches.mean, m.owner_touches.n);
    add("owner_hours_per_license", m.owner_touches.hours_mean, m.owner_touches.n);
    add("team_minutes_per_license", m.team_minutes.mean, m.team_minutes.n);
    add("ai_usd_per_license", m.ai_usd.mean, m.ai_usd.n);
    add("gross_margin_usd_per_license", m.margin.per_license_mean, m.margin.n);
    add("gross_margin_pct", m.margin.pct, m.margin.n);
    add("renewed_on_time_pct", m.renewals.on_time_pct, m.renewals.n);
    add("workspaces_retained_pct", m.workspaces.retained_pct, m.workspaces.n);
    for (const b of m.flywheel) add(`flywheel_${b.bucket}_median_cost_usd`, b.median_cost_usd, b.n);
    for (const b of m.flywheel) add(`flywheel_${b.bucket}_median_days`, b.median_days, b.n);
  }
  return lines.join("\n") + "\n";
}

/** A number for a tile: a dash when nothing was measured. */
export function shown(v: number | null | undefined, unit = "", digits = 1): string {
  if (v == null || !Number.isFinite(Number(v))) return "-";
  const x = Number(v), r = Math.round(x * 10 ** digits) / 10 ** digits;
  return unit === "$" ? "$" + r.toLocaleString("en-US", { minimumFractionDigits: Math.abs(x) < 1 ? 2 : 0, maximumFractionDigits: Math.abs(x) < 1 ? 4 : 2 })
    : `${r.toLocaleString("en-US")}${unit}`;
}
