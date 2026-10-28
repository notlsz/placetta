// The wake ping: when a filing is queued for an agency's website and the portal worker is asleep (Render's free plan),
// the file function and its sweep send POST <FILER_URL>/wake with FILER_SECRET in x-filer-secret (worker/filer/src/wake.ts
// checks it). The database hands out the right to ping (filer_wake_claim, 20261102090300_filer_wake.sql): at most one
// ping every 30 seconds across every instance of the function, and none while the worker beats. The request itself is
// what wakes a sleeping service, so a ping that times out still counts as sent; the heartbeat says whether it worked.
// No filing, workspace or customer detail goes in it: the URL, the header and an empty body.

export type WakeDeps = {
  /** filer_wake_claim: true when this call may ping now. */
  claim(): Promise<boolean>;
  fetch: typeof fetch;
  /** How long to wait for the answer. Short: Render holds the request while the service starts, and the start goes on
   *  without us. */
  timeoutMs?: number;
};

export type WakeOutcome = "not_set_up" | "not_needed" | "sent" | "woke";

export async function pingWorker(cfg: { url: string; secret: string } | null, d: WakeDeps): Promise<WakeOutcome> {
  if (!cfg) return "not_set_up";
  const may = await d.claim().catch(() => false);
  if (!may) return "not_needed";
  try {
    const r = await d.fetch(cfg.url, { method: "POST", headers: { "x-filer-secret": cfg.secret }, redirect: "manual", signal: AbortSignal.timeout(d.timeoutMs ?? 4000) });
    await r.body?.cancel().catch(() => undefined);
    return r.status === 202 ? "woke" : "sent";
  } catch {
    return "sent";   // timed out or refused: the request reached the host (or didn't); the heartbeat decides
  }
}
