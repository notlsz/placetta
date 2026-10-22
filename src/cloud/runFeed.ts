/* A server run as the app follows it: pushed updates (supabase/functions/agent-run/push.ts) and polled rows merged into
   one view, so each step shows once, in order, and an older poll never puts back words a newer push already replaced.
   Pure, shared by both of App.tsx's run followers and tested in scripts/agent-test.ts. */

import type { Step } from "../core";

export type RunFeed = { shown: number; draft: string; at: string };
export type Pushed = { from: number; steps: Step[]; draft: string | null; at: string };
export const startFeed = (): RunFeed => ({ shown: 0, draft: "", at: "" });

/** What's new: the steps not shown yet and the words when they changed. A push that skipped steps this view doesn't
 *  have (one was too big to push) adds nothing: the next poll brings them. */
export function merge(f: RunFeed, u: Pushed): { feed: RunFeed; steps: Step[]; draft?: string; gap: boolean } {
  if (u.from > f.shown) return { feed: f, steps: [], gap: true };
  const steps = u.steps.slice(f.shown - u.from);
  const newer = !f.at || !u.at || u.at >= f.at;
  const draft = newer && u.draft && u.draft !== f.draft ? u.draft : undefined;
  return { feed: { shown: f.shown + steps.length, draft: draft ?? f.draft, at: newer && u.at ? u.at : f.at }, steps, ...(draft ? { draft } : {}), gap: false };
}

/** A polled row as an update from step 0. */
export const fromRow = (r: { steps: Step[]; draft: string | null; updated_at: string }): Pushed => ({ from: 0, steps: r.steps, draft: r.draft, at: r.updated_at });

/** How long to wait before the next poll: slow while pushes arrive, quick while words stream without them. */
export const pollDelay = (live: boolean, moved: boolean) => (live ? 4000 : moved ? 300 : 700);

/** A sleep that a push can cut short (the run ended, or a step needs the row). */
export function napper() {
  let wake: (() => void) | null = null;
  return {
    nap: (ms: number) => new Promise<void>(res => { const t = setTimeout(() => { wake = null; res(); }, ms); wake = () => { clearTimeout(t); wake = null; res(); }; }),
    wake: () => wake?.(),
  };
}

/* ------------------------------ smooth words, elapsed time ------------------------------ */
// The server saves the words every 300 ms, so they arrive in bursts. Claude and ChatGPT show a stream as an even flow
// of text; this reveals each burst over the time until the next one instead of all at once. Pure, so it is tested.

/** How many characters to show after dt ms, given how many are shown and how many have arrived. A new answer (the
 *  arrived text no longer starts with the shown text) starts over; a big backlog is caught up within about 600 ms so
 *  the words never trail far behind; reduced motion shows everything at once. */
export function reveal(shown: string, arrived: string, dt: number, o: { reduced?: boolean } = {}): string {
  if (o.reduced || !arrived) return arrived;
  const base = arrived.startsWith(shown) ? shown.length : 0;
  const left = arrived.length - base;
  if (left <= 0) return arrived.slice(0, base);
  // at least 60 characters a second, and fast enough to clear the backlog in 600 ms
  const rate = Math.max(60, left / 0.6) / 1000;
  let n = Math.min(arrived.length, base + Math.max(1, Math.round(rate * dt)));
  // never stop inside a surrogate pair (an emoji, a rare character)
  if (n < arrived.length && /[\uD800-\uDBFF]/.test(arrived[n - 1])) n += 1;
  return arrived.slice(0, n);
}

/** Seconds as people say them: 8s, 1m 05s, 1h 02m (8秒, 1分05秒, 1小时02分). */
export function elapsed(ms: number, zh = false): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  if (s < 60) return zh ? `${s}秒` : `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return zh ? `${m}分${p(s % 60)}秒` : `${m}m ${p(s % 60)}s`;
  return zh ? `${Math.floor(m / 60)}小时${p(m % 60)}分` : `${Math.floor(m / 60)}h ${p(m % 60)}m`;
}

/** How long each step took: from its own time to the next step's (the last one, to now while it runs). */
export function stepTimes(steps: { at?: string }[], now: number, running: boolean): (number | null)[] {
  return steps.map((s, i) => {
    const a = s.at ? Date.parse(s.at) : NaN;
    const nx = steps[i + 1]?.at ? Date.parse(steps[i + 1].at!) : running && i === steps.length - 1 ? now : NaN;
    return Number.isFinite(a) && Number.isFinite(nx) && nx >= a ? nx - a : null;
  });
}
