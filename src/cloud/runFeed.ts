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
