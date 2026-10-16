// The lease on an agent run: one instance works a run at a time. The run's heartbeat_at holds a value only the
// instance working it knows; every write that instance makes is conditional on that value still being there and puts
// a new one in its place. Another instance (a duplicated "continue", or the watchdog) can take the run only by
// bringing the ticket the last holder left on a hand-over, or once the holder has gone quiet for the stale time. A
// holder whose write finds a different value has lost the run and stops without saving or answering anything.
// No schema change: heartbeat_at already exists, and conditional updates do the rest. Tested in lease_test.ts, with
// saveOnto below: how a run saves its changes onto a workspace other jobs and people are changing too.

/** A heartbeat value nobody else will write: now, with random microseconds (Postgres keeps six digits). */
export const stamp = (at = Date.now()) => new Date(at).toISOString().replace(/Z$/, String(Math.floor(Math.random() * 1000)).padStart(3, "0") + "Z");

export type LeasedRun = { status: string; attempts: number; heartbeat_at: string };
/** The runs table as the lease uses it, so tests can stand in for the database. */
export type RunsTable<R extends LeasedRun> = {
  read(id: string): Promise<R | null>;
  /** Updates the run where every condition holds: the number of rows changed, or null when the database didn't answer. */
  update(id: string, fields: Record<string, unknown>, where: { heartbeat_at?: string; heartbeat_before?: string; status?: string }): Promise<number | null>;
};

export type Lease = {
  readonly lost: boolean;
  /** Saves fields onto the run only while this instance still holds it (and, with running, only while the run is
   *  still running), renewing the lease. Whether it was saved. */
  write(fields: Record<string, unknown>, o?: { running?: boolean }): Promise<boolean>;
  /** Saves fields and leaves the run to whoever brings the ticket this returns (null when it couldn't). */
  release(fields: Record<string, unknown>): Promise<string | null>;
};

export function leaseOn<R extends LeasedRun>(table: RunsTable<R>, id: string, held: string): Lease {
  let lost = false, released = false, chain: Promise<unknown> = Promise.resolve();
  // One write at a time, each conditional on the value the one before left.
  const write = (fields: Record<string, unknown>, o: { running?: boolean } = {}, next = stamp()) => {
    const p = chain.then(async () => {
      // After a release nothing more is written: a late renewal would replace the ticket the next instance brings.
      if (lost || released) return false;
      const n = await table.update(id, { ...fields, heartbeat_at: next }, { heartbeat_at: held, ...(o.running ? { status: "running" } : {}) });
      if (n === null) return false;   // no answer from the database: the lease may well still be ours
      if (n > 0) { held = next; return true; }
      // Nothing matched. Without a status condition that can only mean someone else holds the run now; with one, the
      // run may just have been stopped, and either way this instance is done with it.
      lost = true;
      return false;
    });
    chain = p.catch(() => undefined);
    return p;
  };
  return {
    get lost() { return lost; },
    write: (fields, o) => write(fields, o),
    async release(fields) {
      const ticket = stamp();
      const p = write(fields, {}, ticket);
      // Queued writes after this one are dropped; it's the last.
      chain = chain.then(() => { released = true; });
      return (await p) ? ticket : null;
    },
  };
}

/**
 * Saves changes onto the newest copy of a workspace: read it, apply the changes, and write it back only if nobody
 * saved in between (write compares the version it read). On a clash it reads again and re-applies, up to `tries`
 * times, then throws: it never writes over someone else's save. Returns what was saved.
 */
export async function saveOnto<W>(o: {
  read: () => Promise<{ w: W; version: string } | null>;
  /** Writes w if the workspace is still at version: true when saved, false when someone saved first. */
  write: (w: W, version: string) => Promise<boolean>;
  tries: number;
  pause?: (attempt: number) => Promise<void>;
}, change: (w: W) => W): Promise<W> {
  for (let attempt = 0; attempt < o.tries; attempt++) {
    const fresh = await o.read();
    if (!fresh) throw Object.assign(new Error("The workspace is gone."), { code: "save_failed" });
    const w = change(fresh.w);
    if (await o.write(w, fresh.version)) return w;
    await (o.pause ?? ((n: number) => new Promise((r) => setTimeout(r, 120 * 2 ** Math.min(n, 4) + Math.random() * 300))))(attempt);
  }
  throw Object.assign(new Error("Couldn't save the work: the workspace kept changing."), { code: "save_failed" });
}

/**
 * Takes a run to work on, or null when it isn't ours to take: it's finished, someone else holds it, or another
 * instance took it first. With a ticket (a new run, or a hand-over) the run must still carry that exact value; without
 * one (the watchdog), its holder must have been quiet for staleMs.
 */
export async function claim<R extends LeasedRun>(table: RunsTable<R>, runId: string, ticket: string | null, staleMs: number, now = Date.now()): Promise<{ run: R; lease: Lease } | null> {
  const run = await table.read(runId);
  if (!run || run.status !== "running") return null;
  if (!ticket && !(Date.parse(run.heartbeat_at) < now - staleMs)) return null;
  const mine = stamp(now);
  const n = await table.update(runId, { attempts: run.attempts + 1, heartbeat_at: mine },
    ticket ? { heartbeat_at: ticket, status: "running" } : { heartbeat_at: run.heartbeat_at, heartbeat_before: new Date(now - staleMs).toISOString(), status: "running" });
  if (!n) return null;
  return { run: { ...run, attempts: run.attempts + 1, heartbeat_at: mine }, lease: leaseOn(table, runId, mine) };
}
