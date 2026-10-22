// Types for agent.js (the agent's core, bundled from src/ by scripts/build-agent.mjs). Kept by hand: the shapes the
// function relies on. The source of truth is src/core.ts, src/live.ts and src/serverRun.ts.
export type Bi = { en: string; zh: string };
/** A step, or a moment of the replay (src/core.ts Step, src/replay.ts): when, which bot, which job, and what happened. */
export type Step = { state: string; label: Bi; tool?: string; at?: string; bot?: string; job?: string; kind?: string; [k: string]: unknown };
export type Reply = { text: Bi[]; approvals?: string[]; apps?: string[]; files?: string[]; sources?: { title: string; url: string }[]; forms?: FilledNote[]; [k: string]: unknown };
export type Audit = { id: string; at: string; actor: "you" | "agent" | "agency" | "team" | "placetta"; action: Bi; object: Bi; detail?: Bi };
export type Workspace = { audit: Audit[]; meta?: { city?: string; region?: string; what?: string; entity?: string }; [k: string]: unknown };
export type Turn = { role: "user" | "assistant"; content: string };
export type RunState = { messages: { role: string; content: unknown }[]; rounds: number; plainSms?: boolean; spent?: number; events?: number[]; toolCalls?: number; toolErrors?: number; trace?: unknown[]; [k: string]: unknown };
export type Block = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; citations?: { url?: string; title?: string }[] };
/** What a model call is for; the server routes each role to its own model (../_shared/llm.ts). */
export type Role = "plan" | "review" | "extract" | "translate" | "draft" | "short" | "watch" | "deep";
export type Send = (body: Record<string, unknown>, deep: boolean, role?: Role, onText?: (text: string) => void) => Promise<{ content: Block[]; stop_reason: string }>;
export type Services = {
  filings(): { app_id: string; status: string; confirmation_number: string | null; submitted_at: string | null; updated_at: string; note: string | null; payment_url: string | null; agent_state?: string | null; channel?: string | null; agent_log?: { en: string; zh: string; kind: string }[];
    receipt_path?: string | null; decided_at?: string | null; customer_paid_at?: string | null }[];
  connected(): string[];
  integration<T>(action: string, body: Record<string, unknown>): Promise<T>;
  saveFile(file: File, appId?: string): Promise<{ path: string }>;
  readFile(path: string): Promise<Blob>;
  me?: string;
  setting?(key: string, value: string): string;
  network?(keys: string[]): Promise<Lesson[]>;
  /** Connected apps' tools (src/mcp.ts McpTool), from integrations mcp_tools. */
  mcpTools?(): Promise<Record<string, unknown>[]>;
  /** Store bots (split_job): start one run per store job; which started now and which wait their turn. */
  split?(o: { parent: string; children: { job: string; store: string; title: Bi; prompt: string }[] }): Promise<{ started: string[]; queued: string[] }>;
  /** An agency's PDF by its file name, for filling it on the server (src/forms/fill.ts); null to use the bundle's own. */
  formPdf?(file: string): Promise<Uint8Array | null>;
  /** Team review: the workspace's comments, for read_comments (src/live.ts AgentComment). */
  comments?(item?: { kind: "app" | "doc" | "job"; id: string }): Promise<{ id: string; item: { kind: "app" | "doc" | "job"; id: string }; by: string; hq: boolean; text: string; at: string; resolved: boolean }[]>;
};
/** What a store's bot came back with, for the run that split the work. */
export type ChildResult = { job: string; store: string; status: string; reply: string };
export declare function normalizeState(name: string, s: Record<string, unknown>): Workspace;
/** A filing as the filings table has it (src/finish.ts FilingRow), newest first by approval. */
export type FilingRow = { app_id: string; status: string; confirmation_number?: string | null; receipt_path?: string | null; submitted_at?: string | null; decided_at?: string | null; channel?: string | null; note?: string | null; payment_url?: string | null; customer_paid_at?: string | null };
/** Each application's latest filing onto it, as the record the proof loop reads; the same workspace when nothing changed. */
export declare function stampFilings(w: Workspace, rows: FilingRow[]): Workspace;
/** Renewals for what the agencies approved, every open job against its proof, and the report on each job just done;
 *  the same workspace when nothing changed. */
export declare function finishWork(w: Workspace, now?: string): Workspace;
export declare function stripState(w: Workspace): Record<string, unknown>;
export declare function startState(history: Turn[], prompt: string): RunState;
export declare function runRounds(o: {
  state: RunState; ws: () => Workspace; apply: (p: (w: Workspace) => Workspace) => void; step: (s: Step) => void; draft?: (text: string) => void;
  send: Send; lang: "en" | "zh"; deep: boolean; account: boolean; svc?: Services; files?: Map<string, File>; signal: AbortSignal; until: number;
  round?: (state: RunState) => Promise<void>;
  research?: boolean; maxRounds?: number; maxTokens?: number;
  channel?: Channel;
  /** Who asked from outside the app (their number or address), shown on a change card for a business fact. */
  sender?: string;
  /** The main loop's role: plan (default), short for a text, call or chat bot, watch for background checks. */
  role?: Role;
  /** Whose memory the run reads: the person who asked. */
  me?: string;
  /** The run's id: the jobs it works link to it, for their replay. */
  runId?: string;
  /** A store's bot: the store's job and the store it works. */
  child?: { job: string; store: string };
  /** The stores' bots this run started: how many are still open, and what each came back with. */
  family?: { pending(): Promise<number>; results(): Promise<ChildResult[]> };
  /** Business rules (src/businessRules.ts): a message a rule asks to deliver, through the business's own channels. */
  notify?: (n: Notice) => void;
  /** Who the run acts for (src/security/policy.ts): the person and their role now, or the system. */
  actor?: Actor;
  /** The workspace's id: a tool call naming another workspace or its files is refused. */
  workspaceId?: string;
  /** Each tool call: actor, role, a hash of the input and the decision. */
  log?: (e: ToolLog) => void;
  /** The optional model check for untrusted text in the grey zone. */
  classify?: (text: string) => Promise<boolean>;
  /** Agent memory (src/odeliaMemory/context.ts RunMemory). */
  memory?: RunMemory;
}): Promise<{ reply: Reply } | { paused: RunState } | { waiting: RunState; reply?: Reply }>;

// Agent memory (src/odeliaMemory/)
export type MemSettings = { enabled: boolean; suggest: boolean; allowLast4: boolean; cap: number };
export type AgentMemory = { settings: MemSettings; items: Record<string, unknown>[]; briefs: Record<string, unknown>[]; conflicts: Record<string, unknown>[] };
export type PastRun = { id: string; prompt: string; reply?: string; at: string };
export type RunMemory = { memory: AgentMemory; me?: string; temporary?: boolean; past?: (q: string) => Promise<PastRun[]> | PastRun[]; names?: Record<string, string>; processors?: Record<string, unknown> | false };
/** What a run left for memory, in its state (RunState.mem). */
export type RunMemoryOut = { suggested: unknown[]; remembered: unknown[]; forget: string[]; proposals: unknown[]; flushed: string[]; command?: "remember" | "forget"; note?: string };
/** The prompt cache over a run (RunState.cache). */
export type CacheStats = { calls: number; hits: number; input: number; read: number; write: number; output: number; prefix?: string; prefixChanged?: number };
export type MemoryRow = Record<string, unknown> & { id: string };
export type MemoryDb = {
  settings(): Promise<{ enabled: boolean; suggest: boolean; allow_last4: boolean; cap: number } | null>;
  items(): Promise<MemoryRow[]>;
  briefs(): Promise<Record<string, unknown>[]>;
  proposals(): Promise<Record<string, unknown>[]>;
  conflicts(): Promise<Record<string, unknown>[]>;
  insert(rows: MemoryRow[]): Promise<void>;
  touch(id: string, seen: number, lastSeen: string): Promise<void>;
  remove(ids: string[]): Promise<void>;
  close(id: string, validTo: string, supersededBy: string): Promise<void>;
  propose(rows: Record<string, unknown>[]): Promise<void>;
  conflict(rows: Record<string, unknown>[]): Promise<void>;
};
export declare const MEMORY_COLS: string;
export declare function loadMemory(db: MemoryDb, me?: string): Promise<AgentMemory>;
export declare function saveRun(db: MemoryDb, o: { ws: string; memory: AgentMemory; out: RunMemoryOut; w: Workspace; now: string;
  run: { id: string; prompt: string; channel?: string | null; created_by?: string | null; no_memory?: boolean; store?: string | null };
  reply: string; messages: { role: string; content: unknown }[]; role?: string; ask?: (prompt: string) => Promise<string> }): Promise<Record<string, number>>;
/** What a business rule asks the server to tell someone (src/businessRules.ts). */
export type Notice = { rule: string; key: string; via: "email" | "text" | "slack" | "lark" | "wechat"; to?: string; text: Bi };
export type Channel = "app" | "sms" | "voice" | "email" | "slack" | "lark" | "wechat";
export declare function channelHint(channel: Channel | undefined, plainSms?: boolean): string;

// The network (src/learning.ts)
export type Lesson = { id: string; kind: "place" | "agency" | "form" | "pitfall"; key: string; text: Bi; source_url?: string | null; businesses: number; confirms: number; contradicts: number; wins: number; losses: number };
export type NewLesson = { kind: Lesson["kind"]; key: string; text: Bi; source_url?: string; official: boolean };
export type Evidence = { jobs: unknown[]; learned_here: unknown[]; applications: unknown[]; official_sources: unknown[]; answer: string };
export declare const DISTILL_SYSTEM: string;
export declare function distillPrompt(evidence: unknown, existing: Lesson[], keys: string[]): string;
export declare function parseDistill(text: string, o: { keys: string[]; existing: string[]; w?: Workspace; max?: number }): { confirm: string[]; contradict: string[]; fresh: NewLesson[] };
export declare function lessonKeys(w: Workspace): string[];
export declare function lessonsBrief(ls: Lesson[], lang: "en" | "zh"): string;
export declare function runEvidence(w: Workspace, o: { started: string; reply: string; sources: { url: string; title?: string }[]; asked?: string }): Evidence;
export declare function worthLearning(ev: Evidence): boolean;
export declare function filingEvidence(f: { title?: Bi | null; agency?: Bi | null; status: string; note?: string | null; days?: number | null; form?: string | null }): unknown;
export declare function rank(ls: Lesson[]): Lesson[];
export declare function agencyKey(agency: string): string;

// Memory that acts (src/recall.ts)
export type Recall = { id: string; kind: "preference" | "person" | "constraint" | "date" | "vendor"; text: Bi; source: string; at: string; status: "saved" | "suggested"; via?: string; [k: string]: unknown };
export type MemoryBook = { settings: { searchChats: boolean; generate: boolean; sensitive: boolean }; files: unknown[]; items?: Recall[] };
export declare function recallFrom(said: string, o: { ask?: (prompt: string) => Promise<unknown>; today?: string; at?: string; prior?: string; via?: string; book?: MemoryBook }): Promise<Recall[]>;
export declare function keepRecall(me: string, items: Recall[], today?: string): (w: Workspace) => Workspace;
export declare function chipsOf(items: Recall[]): { id: string; text: Bi; suggested?: boolean }[];

// What Odelia did this month (src/monthly.ts)
export type MetricItem = { id: string; title: Bi; at?: string | null; date?: string; status?: string };
export type MonthMetrics = { month: string; plan_ms: number | null; plan_at: string | null; plan_apps: number | null; runs: { id: string; prompt: string; created_at: string; first_ms: number | null; done_ms: number | null }[];
  median_first_ms: number | null; median_done_ms: number | null; mapped: MetricItem[]; filled: MetricItem[]; waiting: MetricItem[]; submitted: MetricItem[]; approved: MetricItem[]; renewals: MetricItem[] };
export declare function monthMetrics(w: Workspace, o: { today: string; runs?: { id: string; prompt: string; created_at: string; first_text_at?: string | null; done_at?: string | null; status?: string }[]; filings?: { id: string; app_id: string; title: Bi; status: string; submitted_at: string | null; decided_at: string | null }[] }): MonthMetrics;

// The agencies' own forms (src/forms/fill.ts, readback.ts, versions.ts)
export type Field = { id: string; label: Bi; value: string; from?: Bi; quote?: string };
export type LoadPdf = (file: string) => Promise<Uint8Array | null>;
export type Wrote = { kind: "text" | "check" | "radio" | "choice" | "draw"; id: string | null; ok?: boolean; name?: string; v?: string; at?: { page: number; x: number; y: number; w?: number; size?: number } };
export type Filled = { pdf: Uint8Array; wrote: Wrote[]; values: Record<string, string>; skipped: string[] };
export type ReadBack = { ok: boolean; checked: number; issues: { id: string; kind: "missing" | "wrong" | "overflow" | "characters" | "secret"; want: string; got?: string }[] };
/** A filled form a reply hands back (src/core.ts FilledNote). */
export type FilledNote = { app: string; form: string; title: Bi; version: number; changed: number; filled: number; doc?: string; path?: string; ok: boolean; problem?: Bi; link?: string };
export declare const appPdf: LoadPdf;
export declare function pdfFile(formId: string): string | null;
export declare function fillForm(formId: string, fields: Field[], load?: LoadPdf): Promise<Filled | null>;
export declare function readBack(formId: string, f: Filled): Promise<ReadBack>;
export declare function answersHash(a: { fields: Field[] }): string;

// Odelia's shield (src/security)
export type Actor = { id: string | null; role: "owner" | "admin" | "member" | "viewer" | "staff" | "system" };
export type ToolLog = { at: string; run?: string; tool: string; scope: string | null; actor: string | null; role: Actor["role"]; input_hash: string; decision: "allow" | "deny" | "error"; code?: string; reason?: string };
export declare const CLASSIFIER_SYSTEM: string;
export declare function classifierPrompt(text: string): string;
export declare function parseClassifier(answer: string): boolean;
