// Types for opening.js (bundled from src/smart.ts by scripts/build-agent.mjs). Kept by hand: what the monitor uses.
type Bi = { en: string; zh: string };
export type OpeningPath = {
  verdict: "on_track" | "tight" | "late" | "no_date" | "not_mapped" | "open";
  landing: string | null; slack: number | null;
  blocker?: { app: string; name: Bi; status: string; on: "you" | "odelia" | "team" | "agency" | "someone_else"; why: Bi };
  guessed: number;
  basis: { measured: number; published: number; guessed: number };
};
export declare function openingPath(s: Record<string, unknown>, w: Record<string, unknown>, today: string, ev?: { submitted?: Record<string, string>; stats?: { form: string; n: number; median_days: number; p90_days: number; rejected_pct: number }[] }): OpeningPath;
export declare function openingLine(p: OpeningPath): Bi | null;
export declare function normalizeState(name: string, s: Record<string, unknown>): Record<string, unknown> & { stores?: Record<string, unknown>[] };
export declare function publishedDays(takes?: Bi): number | null;
export type Routine = { id: string; title: Bi; prompt: string; every: "daily" | "weekly" | "monthly"; day?: number; from: string; paused?: boolean; last?: string; created: string };
export declare function runsOn(r: Routine, day: string): boolean;
/** A filing as the filings table has it (src/finish.ts FilingRow), newest first by approval. */
export type FilingRow = { app_id: string; status: string; confirmation_number?: string | null; receipt_path?: string | null; submitted_at?: string | null; decided_at?: string | null; channel?: string | null; note?: string | null; payment_url?: string | null; customer_paid_at?: string | null };
type Ws = Record<string, unknown>;
export declare function stampFilings<W extends Ws>(w: W, rows: FilingRow[]): W;
export declare function finishWork<W extends Ws>(w: W, now?: string): W;
/** Jobs Odelia stopped partway and picks back up on her own, with the prompt that carries on. */
export declare function resumable(w: Ws, now?: number, lang?: "en" | "zh"): { job: string; prompt: string; title: Bi }[];
export declare const MAX_RESUMES: number;
/** The morning digest's line about the approvals waiting, and how many share one tap. */
export declare function approvalsLine(w: Ws, today: string, o: { account: boolean; filings: boolean }): { title: Bi; body: Bi } | null;
export declare function overdue(submittedAt: string | null | undefined, agencyDays: number | null, today: string): { waited: number; usual: number } | null;
/** Appeals (src/appeals): the playbook for a denied application at an address, and its deadline. */
export type AppealRule = { days: number | null; unit: "calendar" | "business" | "months"; from: "decision" | "day_after"; trigger: Bi; says: string; section: string; verified: { on: string; source: string } | null; roll?: boolean; holidays?: "core" | "TX" | "NY"; atLeast?: boolean; cutoff?: string; mail?: { days: number; says: string; section: string; verified: { on: string; source: string } | null }; check?: string[] };
export type AppealPlaybook = { id: string; name: Bi; body: Bi; tz: string; deadline: AppealRule; counsel: { advised: boolean; why: Bi }; sources: string[] };
export declare function appealFor(app: { name?: Bi; agency?: Bi }, address: string, said?: string): AppealPlaybook | null;
export declare function deadlineFor(rule: AppealRule, decided: string, tz: string, opts?: { served?: "mail" | "hand" | "email" | "unknown" }): { date: string; legal: string; days: number; unit: string; counted: string; verified: boolean; tz: string; rule: string; section: string; trigger: string; atLeast: boolean; cutoff?: string; mailed?: number } | null;
export declare function daysLeft(date: string, today: string): number;
export declare const NOT_A_LAW_FIRM: Bi;
