// The renewal notice (Cal. Bus. & Prof. Code § 17602(b), and the yearly reminder AB 2863 adds; src/contract.ts): 15 to
// 45 days before a yearly plan renews, the owners get what it is, what it will charge, how to cancel online in one click,
// and what Placetta delivered this past year, from the value report's own lines (src/value.ts). Once per renewal (the
// billing row's renewal_notice_for is the claim), never after auto-renew is off, never for a workspace its
// headquarters pays for (headquarters' own plan is billed to headquarters).
import { noticeDue, renewalNotice, yearUsd } from "../../../src/contract.ts";
import { headline, valueReport, type ValueFiling } from "../../../src/value.ts";

export type RenewalRow = {
  workspace_id: string; current_period_end: string | null; subscription_status: string | null; subscription_plan: string | null;
  paid_locations: number | null; auto_renew: boolean | null; renewal_notice_for: string | null; hq_paid_by: string | null; subscription_id: string | null;
};
type Bi = { en: string; zh: string };
type State = { business?: Bi; apps?: unknown; stores?: unknown; deadlines?: unknown; docs?: unknown } | null;
type FilingRow = { workspace_id: string; app_id: string; status: string; submitted_at?: string | null; decided_at?: string | null; payload?: { official?: string } | null };

/** The workspaces whose renewal notice goes out today. */
export function dueNotices(rows: RenewalRow[], today: string): RenewalRow[] {
  return rows.filter((r) => r.subscription_id && !r.hq_paid_by && (r.subscription_status === "active" || r.subscription_status === "trialing")
    && noticeDue(r.current_period_end, today, r.renewal_notice_for, r.auto_renew !== false));
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);

/** One notice, built from the workspace's own records. Medians are left out here: the email only says what the
 *  workspace's own filings show, and the app's report adds the network comparison. */
export function noticeFor(r: RenewalRow, name: string, state: State, filings: FilingRow[], today: string, cancelUrl: string) {
  const st = state ?? {};
  const report = valueReport({
    business: st.business ?? { en: name, zh: name },
    apps: arr<{ id: string; name: Bi; official?: string }>(st.apps).filter((a) => a && typeof a.id === "string").map((a) => ({ id: a.id, name: a.name ?? { en: a.id, zh: a.id }, official: a.official })),
    stores: arr<{ id: string; name: Bi; stage: string; apps?: string[]; notices?: [] }>(st.stores).filter((s) => s && typeof s.id === "string"),
    deadlines: arr<{ id: string; date: string; kind: string; app?: string }>(st.deadlines).filter((d) => d && typeof d.date === "string"),
    docs: arr<{ id: string }>(st.docs),
    filings: filings.filter((f) => f.workspace_id === r.workspace_id).map((f): ValueFiling => ({ app: f.app_id, status: f.status, submitted: f.submitted_at, decided: f.decided_at, official: f.payload?.official ?? null })),
    medians: [],
  }, today);
  const tier = r.subscription_plan === "pro" ? "pro" as const : "essentials" as const;
  const locations = Math.max(1, r.paid_locations ?? 1);
  return renewalNotice({ business: name, renewsOn: String(r.current_period_end).slice(0, 10), yearUsd: yearUsd({ years: 1, tier, locations }), locations, tier, delivered: headline(report.brand), cancelUrl });
}
