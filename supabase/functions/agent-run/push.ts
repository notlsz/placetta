/* Live updates for the app: each time agent-run saves a run's progress (a step done, a tool call, the words so far), it
   also sends it on the run's private Supabase Realtime channel ("run:<id>"), so the app shows it at once instead of
   asking every 300 ms to 1.5 s. Only members of the run's workspace can listen (the policy on realtime.messages,
   migration 20261023090000_run_push). The saved row stays the truth: the app keeps polling, more slowly, and a push
   that fails or arrives late changes nothing. Fire and forget: a push never slows or fails a run. */

export type Push = {
  /** Steps from `from` on, and the words so far, as saved at `at` (the row's updated_at, so the app never lets an
   *  older poll undo a newer push). */
  progress(steps: unknown[], draft: string | null, at: string): void;
  /** The run stopped working (done, waiting, paused for a fresh instance, failed, stopped): the app reads the row now. */
  end(status: string): void;
};

/** Broadcasts bigger than this go by polling only (Realtime's message limit is far above it; this keeps pushes cheap). */
export const PUSH_MAX = 64_000;

/** start: the steps the run already had when this instance picked it up (the app has those from the row). */
export function pusher(url: string, key: string, runId: string, start = 0, f: typeof fetch = fetch): Push {
  let sent = start, lastDraft: string | null = null;
  const send = (event: string, payload: Record<string, unknown>) => {
    if (!url || !key) return;
    const body = JSON.stringify({ messages: [{ topic: `run:${runId}`, event, payload, private: true }] });
    if (body.length > PUSH_MAX) return;
    try {
      void f(`${url}/realtime/v1/api/broadcast`, { method: "POST", headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` }, body })
        .then(r => r.body?.cancel(), () => undefined);
    } catch { /* polling still has it */ }
  };
  return {
    progress(steps, draft, at) {
      const fresh = steps.slice(sent);
      if (!fresh.length && draft === lastDraft) return;
      send("progress", { from: sent, steps: fresh, draft, at });
      sent = steps.length; lastDraft = draft;
    },
    end(status) { send("end", { status }); },
  };
}
