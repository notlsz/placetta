// Shapes shared by the portal worker.
import type { CardPart } from "./card.ts";

export type Bi = { en: string; zh: string };
export type LogEntry = { at?: string; en: string; zh: string; kind: string; ref?: string; value?: string };   // value: what was entered, sensitive numbers masked

export type Payload = {
  official?: string;
  form?: Bi;
  fields?: { id?: string; label: Bi; value: string }[];
  attachments?: { name: string; path: string }[];
  pdf_path?: string;
  signature?: { name: string; title?: string };
};

export type Filing = {
  id: string; workspace_id: string; app_id: string; title: Bi; status: string; payload: Payload;
  channel: string | null; agent_state: string | null; agent_log: LogEntry[]; handoff_url: string | null;
  submit_clicked_at: string | null; attempts: number; confirmation_number: string | null;
};

export type Login = { username: string; password: string; host: string };

/** One recorded action. Values are never recorded: only which payload field (by English label, and for a taught
 *  playbook its fact key too) supplied one. A step a taught playbook can't fill from what the customer approved says
 *  why instead: `person` (an SSN, the owner's card, a code: always the person's) or `ask` (nothing approved answers it).
 *  `card` is a line of Placetta's own single-use card for the agency's fee (card.ts): typed only with fee authority,
 *  its value never recorded. */
export type Act =
  | { action: "fill"; selector: string; field?: string; fact?: string; login?: "username" | "password"; person?: string; ask?: boolean; card?: CardPart }
  | { action: "select"; selector: string; field?: string; fact?: string; option?: string; ask?: boolean; /** No to an optional-information question (run.ts answerNo checked it first) */ optOut?: boolean }
  | { action: "check"; selector: string; on: boolean }
  | { action: "click"; selector: string; submit?: boolean }
  | { action: "upload"; selector: string; attachment: string };

export type TraceStep = Act & { url: string; heading: string; at: number; handback?: boolean };

export type Skill = {
  id?: string; key: string; name: string; enabled: boolean; uses: number; fails_in_a_row: number;
  last_seconds: number | null; best_seconds: number | null;
  body: { version: number; steps: TraceStep[]; confirm?: { pattern: string } };
};

/** How a run ended. */
export type Result =
  | { kind: "submitted"; confirmation: string; summary: string; trace: TraceStep[]; seconds: number; replayed: boolean }
  | { kind: "needs_you"; reason: string; message: Bi; trace: TraceStep[] }
  | { kind: "handoff"; reason: string; message: Bi; trace: TraceStep[]; task?: "handoff" | "review" | "check_agency" | "first_run" | "captcha_unanswered" }
  | { kind: "review"; message: Bi; trace: TraceStep[] }
  | { kind: "stopped"; trace: TraceStep[] }
  /** Inside a run only (run.ts makeAccount): the business's account is made; the filing carries on signed in. */
  | { kind: "account_made"; trace: TraceStep[] };
