/* A run's trace for the team (the Replay on Agent health): every model call and tool call with when it started, how
   long it took, and for model calls the model, tokens, prompt-cache reads and writes and the price. Recorded by
   runRounds (src/serverRun.ts) on the run's state, so it survives a hand-over to a fresh instance, and saved on
   agent_runs.trace when the run ends. No prompt or tool input is kept: names and numbers only. */

import { cacheUse } from "./odeliaMemory/cache";

export type Span = {
  k: "model" | "tool";
  /** The tool's name, or the model call's role (plan, short, review...). */
  n: string;
  /** Milliseconds from the run's start, and how long it took. */
  at: number; ms: number;
  model?: string; in?: number; out?: number; read?: number; write?: number; usd?: number;
  ok?: boolean;
};
export const MAX_SPANS = 150;

export function addSpan(list: Span[], s: Span): Span[] {
  if (list.length < MAX_SPANS) list.push(s);
  return list;
}

/** A model call's span from what the transport gave back (agent-run adds model and usd to its answer). */
export function modelSpan(role: string, at: number, ms: number, data: { usage?: unknown; model?: unknown; usd?: unknown }, ok = true): Span {
  const u = cacheUse(data.usage as Record<string, unknown> | undefined);
  return { k: "model", n: role, at, ms, ...(typeof data.model === "string" ? { model: data.model.slice(0, 60) } : {}), in: u.input, out: u.output, read: u.read, write: u.write,
    ...(typeof data.usd === "number" && Number.isFinite(data.usd) ? { usd: Math.round(data.usd * 1e6) / 1e6 } : {}), ...(ok ? {} : { ok: false }) };
}

/** The totals the trace page shows above the spans. hit: the share of prompt tokens served from the cache. */
export function totals(spans: Span[]) {
  const m = spans.filter(s => s.k === "model"), t = spans.filter(s => s.k === "tool");
  const sum = (xs: Span[], f: (s: Span) => number | undefined) => xs.reduce((a, s) => a + (f(s) ?? 0), 0);
  const prompt = sum(m, s => s.in) + sum(m, s => s.read) + sum(m, s => s.write);
  const end = spans.reduce((a, s) => Math.max(a, s.at + s.ms), 0);
  return {
    calls: m.length, tools: t.length, tool_errors: t.filter(s => s.ok === false).length,
    model_ms: sum(m, s => s.ms), tool_ms: sum(t, s => s.ms), wall_ms: end,
    in: sum(m, s => s.in), out: sum(m, s => s.out), read: sum(m, s => s.read), write: sum(m, s => s.write),
    usd: Math.round(sum(m, s => s.usd) * 1e6) / 1e6, hit: prompt ? Math.round((1000 * sum(m, s => s.read)) / prompt) / 10 : null,
    slowest: [...spans].sort((a, b) => b.ms - a.ms).slice(0, 3).map(s => s.n),
  };
}
