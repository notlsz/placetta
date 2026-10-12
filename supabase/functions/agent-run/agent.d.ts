// Types for agent.js (the agent's core, bundled from src/ by scripts/build-agent.mjs). Kept by hand: the shapes the
// function relies on. The source of truth is src/core.ts, src/live.ts and src/serverRun.ts.
export type Bi = { en: string; zh: string };
export type Step = { state: string; label: Bi; tool?: string };
export type Reply = { text: Bi[]; approvals?: string[]; apps?: string[]; files?: string[]; sources?: { title: string; url: string }[]; [k: string]: unknown };
export type Audit = { id: string; at: string; actor: "you" | "agent" | "agency" | "team" | "placetta"; action: Bi; object: Bi; detail?: Bi };
export type Workspace = { audit: Audit[]; meta?: { city?: string; region?: string; what?: string; entity?: string }; [k: string]: unknown };
export type Turn = { role: "user" | "assistant"; content: string };
export type RunState = { messages: { role: string; content: unknown }[]; rounds: number; [k: string]: unknown };
export type Block = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; citations?: { url?: string; title?: string }[] };
export type Send = (body: Record<string, unknown>, deep: boolean) => Promise<{ content: Block[]; stop_reason: string }>;
export type Services = {
  filings(): { app_id: string; status: string; confirmation_number: string | null; submitted_at: string | null; updated_at: string; note: string | null; payment_url: string | null }[];
  connected(): string[];
  integration<T>(action: string, body: Record<string, unknown>): Promise<T>;
  saveFile(file: File, appId?: string): Promise<{ path: string }>;
  readFile(path: string): Promise<Blob>;
};
export declare function normalizeState(name: string, s: Record<string, unknown>): Workspace;
export declare function stripState(w: Workspace): Record<string, unknown>;
export declare function startState(history: Turn[], prompt: string): RunState;
export declare function runRounds(o: {
  state: RunState; ws: () => Workspace; apply: (p: (w: Workspace) => Workspace) => void; step: (s: Step) => void; draft?: (text: string) => void;
  send: Send; lang: "en" | "zh"; deep: boolean; account: boolean; svc?: Services; files?: Map<string, File>; signal: AbortSignal; until: number;
  round?: (state: RunState) => Promise<void>;
  channel?: Channel;
}): Promise<{ reply: Reply } | { paused: RunState }>;
export type Channel = "app" | "sms" | "voice";
export declare function channelHint(channel: Channel | undefined): string;
