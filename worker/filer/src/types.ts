// Shapes shared by the portal worker.

export type Bi = { en: string; zh: string };
export type LogEntry = { at?: string; en: string; zh: string; kind: string; ref?: string };

export type Payload = {
  official?: string;
  form?: Bi;
  fields?: { id?: string; label: Bi; value: string }[];
  attachments?: { name: string; path: string }[];
  pdf_path?: string;
};

export type Filing = {
  id: string; workspace_id: string; app_id: string; title: Bi; status: string; payload: Payload;
  channel: string | null; agent_state: string | null; agent_log: LogEntry[]; handoff_url: string | null;
  submit_clicked_at: string | null; attempts: number; confirmation_number: string | null;
};

export type Login = { username: string; password: string; host: string };

/** One recorded action. Values are never recorded: only which payload field (by English label) supplied one. */
export type Act =
  | { action: "fill"; selector: string; field?: string; login?: "username" | "password" }
  | { action: "select"; selector: string; field?: string; option?: string }
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
  | { kind: "handoff"; reason: string; message: Bi; trace: TraceStep[]; task?: "handoff" | "review" | "check_agency" }
  | { kind: "review"; message: Bi; trace: TraceStep[] };
