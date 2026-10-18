// Store bots under a chief of staff: when the main Odelia splits a request across stores (split_job in src/live.ts),
// each store's part becomes its own run on the server, linked to the run that split it (agent_runs.parent_run). They
// start side by side, but never more than the workspace's parallel cap at once: the rest wait as 'queued' and start
// as others finish. The run that split them waits ('waiting') and is woken when the last of them finishes, to write
// the one summary. Plain logic over a table, so the tests can stand in for the database (scripts/extreme-test.ts), like
// lease.ts.
import { stamp } from "./lease.ts";

/** A store's part to start: its job, its store, and what its bot is asked. */
export type Kid = { job: string; store: string; prompt: string; title?: { en: string; zh: string } };
/** The runs table as the store bots use it. */
export type FamilyDb = {
  /** Task runs in the workspace that are running with a heartbeat newer than `fresh` (a run nobody works is stale). */
  running(ws: string, fresh: string): Promise<number>;
  /** Queued runs in the workspace, oldest first. */
  queued(ws: string, limit: number): Promise<string[]>;
  /** Inserts the store runs, all queued, linked to the parent run; their ids, in order. */
  insert(parent: string, kids: Kid[]): Promise<string[]>;
  /** Updates a run only while the conditions hold: the number of rows changed. */
  update(id: string, fields: Record<string, unknown>, where: { status?: string; heartbeat_at?: string }): Promise<number>;
  /** A run's store runs and their statuses. */
  children(parent: string): Promise<{ id: string; status: string }[]>;
};
/** A store run to start now, with the ticket only the instance started for it can claim it with (lease.ts). */
export type Started = { id: string; ticket: string };

const OPEN = new Set(["running", "queued"]);
/** Store runs still working or waiting their turn. */
export const stillOpen = (kids: { status: string }[]) => kids.filter((k) => OPEN.has(k.status)).length;

/**
 * Starts queued runs in the workspace while it has room under the cap, oldest first. Each start is conditional (only a
 * run still queued is taken, so two callers never start the same one), and counted again after it's taken: a start that
 * raced another caller past the cap is put back in the queue. The runs to start now.
 */
export async function fill(db: FamilyDb, ws: string, cap: number, staleMs: number, now = Date.now): Promise<Started[]> {
  const out: Started[] = [];
  for (let guard = 0; guard < 50; guard++) {
    const fresh = () => new Date(now() - staleMs).toISOString();
    if ((await db.running(ws, fresh())) >= cap) break;
    const [next] = await db.queued(ws, 1);
    if (!next) break;
    const ticket = stamp(now());
    if (!(await db.update(next, { status: "running", heartbeat_at: ticket }, { status: "queued" }))) continue;   // someone else took it
    if ((await db.running(ws, fresh())) > cap) {
      // another caller started one at the same moment: this one waits its turn again
      await db.update(next, { status: "queued" }, { status: "running", heartbeat_at: ticket });
      break;
    }
    out.push({ id: next, ticket });
  }
  return out;
}

/** Inserts one queued run per store and starts as many as the cap allows now. The started runs, and the store jobs
 *  that started and that wait their turn. */
export async function spawn(db: FamilyDb, o: { ws: string; parent: string; cap: number; staleMs: number; now?: () => number }, kids: Kid[]) {
  const ids = await db.insert(o.parent, kids);
  const started = await fill(db, o.ws, o.cap, o.staleMs, o.now);
  const go = new Set(started.map((s) => s.id));
  return {
    runs: started,
    started: kids.filter((_, i) => go.has(ids[i])).map((k) => k.job),
    queued: kids.filter((_, i) => !go.has(ids[i])).map((k) => k.job),
    ids,
  };
}

/** Wakes a waiting run once none of its store runs is still working or queued: the ticket to resume it with, or null
 *  when it isn't time (or another caller already woke it). */
export async function wake(db: FamilyDb, parent: string, now = Date.now): Promise<string | null> {
  if (stillOpen(await db.children(parent))) return null;
  const ticket = stamp(now());
  return (await db.update(parent, { status: "running", heartbeat_at: ticket }, { status: "waiting" })) ? ticket : null;
}
