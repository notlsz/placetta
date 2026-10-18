// Types for agent.js (the agent's core, bundled from src/ by scripts/build-agent.mjs). Kept by hand: the shapes the
// function relies on. The source of truth is src/core.ts, src/live.ts and src/serverRun.ts.
export type Bi = { en: string; zh: string };
export type Step = { state: string; label: Bi; tool?: string };
export type Reply = { text: Bi[]; approvals?: string[]; apps?: string[]; files?: string[]; sources?: { title: string; url: string }[]; [k: string]: unknown };
export type Audit = { id: string; at: string; actor: "you" | "agent" | "agency" | "team" | "placetta"; action: Bi; object: Bi; detail?: Bi };
export type Workspace = { audit: Audit[]; meta?: { city?: string; region?: string; what?: string; entity?: string }; [k: string]: unknown };
export type Turn = { role: "user" | "assistant"; content: string };
export type RunState = { messages: { role: string; content: unknown }[]; rounds: number; plainSms?: boolean; spent?: number; toolCalls?: number; toolErrors?: number; [k: string]: unknown };
export type Block = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; citations?: { url?: string; title?: string }[] };
/** What a model call is for; the server routes each role to its own model (../_shared/llm.ts). */
export type Role = "plan" | "review" | "extract" | "translate" | "draft" | "short" | "watch" | "deep";
export type Send = (body: Record<string, unknown>, deep: boolean, role?: Role, onText?: (text: string) => void) => Promise<{ content: Block[]; stop_reason: string }>;
export type Services = {
  filings(): { app_id: string; status: string; confirmation_number: string | null; submitted_at: string | null; updated_at: string; note: string | null; payment_url: string | null; agent_state?: string | null; channel?: string | null; agent_log?: { en: string; zh: string; kind: string }[] }[];
  connected(): string[];
  integration<T>(action: string, body: Record<string, unknown>): Promise<T>;
  saveFile(file: File, appId?: string): Promise<{ path: string }>;
  readFile(path: string): Promise<Blob>;
  me?: string;
  setting?(key: string, value: string): string;
  network?(keys: string[]): Promise<Lesson[]>;
  /** Connected apps' tools (src/mcp.ts McpTool), from integrations mcp_tools. */
  mcpTools?(): Promise<Record<string, unknown>[]>;
};
export declare function normalizeState(name: string, s: Record<string, unknown>): Workspace;
export declare function stripState(w: Workspace): Record<string, unknown>;
export declare function startState(history: Turn[], prompt: string): RunState;
export declare function runRounds(o: {
  state: RunState; ws: () => Workspace; apply: (p: (w: Workspace) => Workspace) => void; step: (s: Step) => void; draft?: (text: string) => void;
  send: Send; lang: "en" | "zh"; deep: boolean; account: boolean; svc?: Services; files?: Map<string, File>; signal: AbortSignal; until: number;
  round?: (state: RunState) => Promise<void>;
  research?: boolean; maxRounds?: number;
  channel?: Channel;
  /** Who asked from outside the app (their number or address), shown on a change card for a business fact. */
  sender?: string;
  /** The main loop's role: plan (default), short for a text, call or chat bot, watch for background checks. */
  role?: Role;
  /** Whose memory the run reads: the person who asked. */
  me?: string;
  /** Business rules (src/businessRules.ts): a message a rule asks to deliver, through the business's own channels. */
  notify?: (n: Notice) => void;
}): Promise<{ reply: Reply } | { paused: RunState }>;
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
