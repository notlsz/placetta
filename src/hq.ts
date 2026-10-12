import type { Bi } from "./bi";

/* Headquarters: what a franchisee shares with its brand's headquarters. The server (hq_stores, in the
   20261012230000_headquarters migration) reads each shared workspace and returns only this: per store, its stage,
   address and the counts below. Never documents, form fields, logins, chats, memory or staff names. */

export type HqStatus = "current" | "due" | "overdue";
export type HqItem = { kind: "permit" | "due" | "renewal"; title: Bi; date: string };
export type HqStore = {
  id: string;
  name: Bi;
  stage: "open" | "opening";
  address: string;
  planned_open: string | null;
  projected_open: string | null;
  opened: string | null;
  grade: "A" | "B" | "C" | "P" | null;
  /** licenses current: permits more than 30 days from expiry, plus approved licenses for a store still opening */
  current: number;
  /** items due or expiring today to 30 days out */
  due_30: number;
  /** items past their date */
  overdue: number;
  /** applications not yet approved */
  pending: number;
  status: HqStatus;
  /** the earliest item: an overdue one first */
  next: HqItem | null;
};
/** One franchisee (a workspace) that shared its stores with this headquarters email. */
export type HqRow = { workspace_id: string; name: string; brand: string | null; stores: HqStore[] };
/** A headquarters email a workspace shares with. */
export type HqLink = { id: string; hq_email: string; brand: string | null; created_at: string };

export type HqLine = HqStore & { franchisee: string; brand: string | null; workspace_id: string };

/** Every store across every franchisee, worst first: overdue, then due soon, then by the next date. */
export function hqLines(rows: HqRow[]): HqLine[] {
  const rank: Record<HqStatus, number> = { overdue: 0, due: 1, current: 2 };
  return rows.flatMap(r => (Array.isArray(r.stores) ? r.stores : []).map(s => ({ ...s, franchisee: r.name, brand: r.brand, workspace_id: r.workspace_id })))
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.next?.date ?? "9999").localeCompare(b.next?.date ?? "9999") || a.franchisee.localeCompare(b.franchisee));
}

/** The four numbers at the top: stores, fully current, due in 30 days, overdue (each store counted once, by its worst). */
export function hqTotals(lines: HqLine[]) {
  return {
    stores: lines.length,
    current: lines.filter(l => l.status === "current").length,
    due: lines.filter(l => l.status === "due").length,
    overdue: lines.filter(l => l.status === "overdue").length,
    opening: lines.filter(l => l.stage === "opening").length,
  };
}

/** The brand to show: the one every link names, if they agree. */
export function hqBrand(rows: HqRow[]): string | null {
  const names = [...new Set(rows.map(r => r.brand).filter((x): x is string => !!x))];
  return names.length === 1 ? names[0] : null;
}
