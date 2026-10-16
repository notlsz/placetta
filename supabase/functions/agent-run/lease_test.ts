// Run: deno test supabase/functions/agent-run/lease_test.ts
// The run lease and the workspace save, against an in-memory table that applies each conditional update atomically,
// the way Postgres does.
import { deepStrictEqual as assertEquals, ok as assert, rejects } from "node:assert";
import { claim, type LeasedRun, type RunsTable, saveOnto, stamp } from "./lease.ts";

type Row = LeasedRun & { id: string; [k: string]: unknown };
const STALE = 180_000;

function table(rows: Row[], o: { down?: () => boolean } = {}) {
  const db = new Map(rows.map((r) => [r.id, { ...r }]));
  const writes: { fields: Record<string, unknown>; where: Record<string, unknown> }[] = [];
  const t: RunsTable<Row> = {
    async read(id) { await Promise.resolve(); const r = db.get(id); return r ? { ...r } : null; },
    async update(id, fields, where) {
      await Promise.resolve();
      if (o.down?.()) return null;
      writes.push({ fields, where });
      const r = db.get(id);
      if (!r) return 0;
      if (where.heartbeat_at !== undefined && r.heartbeat_at !== where.heartbeat_at) return 0;
      if (where.heartbeat_before !== undefined && !(Date.parse(r.heartbeat_at) < Date.parse(where.heartbeat_before))) return 0;
      if (where.status !== undefined && r.status !== where.status) return 0;
      Object.assign(r, fields);
      return 1;
    },
  };
  return { t, db, writes };
}
const fresh = (over: Partial<Row> = {}): Row => ({ id: "r1", status: "running", attempts: 0, heartbeat_at: stamp(), ...over });

Deno.test("stamps are unique enough to stand for one holder", () => {
  const s = new Set(Array.from({ length: 200 }, () => stamp(1_700_000_000_000)));
  assert(s.size > 150, "random microseconds");
  assert(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(stamp()), "six fractional digits, as Postgres keeps them");
});

Deno.test("a new run is taken once: a duplicated start or continue with the same ticket finds it taken", async () => {
  const ticket = stamp();
  const { t, db } = table([fresh({ heartbeat_at: ticket })]);
  const [a, b] = await Promise.all([claim(t, "r1", ticket, STALE), claim(t, "r1", ticket, STALE)]);
  assert(!!a !== !!b, "exactly one of two racing instances gets the run");
  assertEquals(db.get("r1")!.attempts, 1);
  assertEquals(await claim(t, "r1", ticket, STALE), null, "a late duplicate gets nothing");
  assertEquals(await claim(t, "r1", null, STALE), null, "nor does the watchdog while the holder is alive");
});

Deno.test("the watchdog takes only a quiet run, and only one watchdog does", async () => {
  const now = Date.now();
  const { t } = table([fresh({ heartbeat_at: new Date(now - 60_000).toISOString() }), fresh({ id: "r2", heartbeat_at: new Date(now - STALE - 1000).toISOString() }), fresh({ id: "r3", status: "done", heartbeat_at: new Date(0).toISOString() })]);
  assertEquals(await claim(t, "r1", null, STALE, now), null, "a run whose holder spoke a minute ago");
  assertEquals(await claim(t, "r3", null, STALE, now), null, "a finished run");
  const [a, b] = await Promise.all([claim(t, "r2", null, STALE, now), claim(t, "r2", null, STALE, now)]);
  assert(!!a !== !!b, "two watchdogs at once: one wins");
  assertEquals(await claim(t, "r2", "not-the-ticket", STALE, now), null, "a wrong ticket gets nothing");
});

Deno.test("a hand-over: the ticket passes the run on, and the instance that left can't write any more", async () => {
  const start = stamp();
  const { t, db } = table([fresh({ heartbeat_at: start })]);
  const first = (await claim(t, "r1", start, STALE))!;
  assert(await first.lease.write({ steps: [1] }), "the holder saves");
  const ticket = (await first.lease.release({ state: { rounds: 3 } }))!;
  assertEquals([db.get("r1")!.heartbeat_at, (db.get("r1")!.state as { rounds: number }).rounds], [ticket, 3]);
  assertEquals(await first.lease.write({}), false, "a late renewal from the instance that left writes nothing");
  assertEquals(db.get("r1")!.heartbeat_at, ticket, "so the ticket still opens the run");
  // the continue with the ticket, twice (a retried request): one instance
  const [a, b] = await Promise.all([claim(t, "r1", ticket, STALE), claim(t, "r1", ticket, STALE)]);
  const second = (a ?? b)!;
  assert(second && !(a && b));
  assertEquals(await first.lease.write({ steps: [2] }), false, "the old instance's writes still fail once the next one has it");
  assert(await second.lease.write({ steps: [3] }));
  assertEquals(db.get("r1")!.steps, [3]);
});

Deno.test("a holder that went quiet loses the run to the watchdog, and stops", async () => {
  const start = stamp();
  const { t, db } = table([fresh({ heartbeat_at: start })]);
  const slow = (await claim(t, "r1", start, STALE))!;
  // its model call ran long and nothing renewed the lease: the watchdog takes over
  const later = Date.now() + STALE + 5000;
  const dog = (await claim(t, "r1", null, STALE, later))!;
  assert(dog, "the watchdog takes the quiet run");
  assertEquals(await slow.lease.write({ status: "done", reply: "twice" }, { running: true }), false, "the slow instance can't finish it");
  assert(slow.lease.lost);
  assertEquals(db.get("r1")!.reply, undefined, "and no answer was recorded from it");
  assert(await dog.lease.write({ status: "done", reply: "once" }, { running: true }), "the holder finishes");
  assertEquals(await dog.lease.write({ status: "done", reply: "again" }, { running: true }), false, "finishing twice doesn't: the run isn't running any more");
});

Deno.test("finish answers only when its update marked the run done", async () => {
  const start = stamp();
  const { t, db } = table([fresh({ heartbeat_at: start })]);
  const h = (await claim(t, "r1", start, STALE))!;
  assert(await h.lease.write({ steps: ["working"] }), "steps save while it runs");
  db.get("r1")!.status = "stopped";   // the person pressed Stop
  assert(await h.lease.write({ steps: ["stopped"], draft: null }), "the clean-up after a stop still saves");
  assertEquals(await h.lease.write({ status: "done" }, { running: true }), false, "but the run isn't marked done, so nothing is sent");
  assertEquals(db.get("r1")!.status, "stopped");
});

Deno.test("a database that doesn't answer isn't a lost lease", async () => {
  let down = false;
  const start = stamp();
  const { t } = table([fresh({ heartbeat_at: start })], { down: () => down });
  const h = (await claim(t, "r1", start, STALE))!;
  down = true;
  assertEquals(await h.lease.write({ steps: [1] }), false);
  assert(!h.lease.lost, "it may still be ours");
  down = false;
  assert(await h.lease.write({ steps: [2] }), "and when the database is back, it is");
});

Deno.test("writes go one at a time, each on the value the one before left", async () => {
  const start = stamp();
  const { t, writes } = table([fresh({ heartbeat_at: start })]);
  const h = (await claim(t, "r1", start, STALE))!;
  const results = await Promise.all([h.lease.write({ a: 1 }), h.lease.write({ b: 2 }), h.lease.write({ c: 3 })]);
  assertEquals(results, [true, true, true], "a flush and a round save at once don't trip over each other");
  // writes[0] is the claim; each later write is conditional on the value the write before it left
  const chainOk = writes.length === 4 && writes.slice(1).every((w, i) => w.where.heartbeat_at === writes[i].fields.heartbeat_at);
  assert(chainOk, "each write is conditional on the previous one's value");
});

Deno.test("saving onto a busy workspace: re-applies on a clash, never writes over someone else's save, and gives up", async () => {
  // someone saves between every read and write: the save fails after the tries, and every write was conditional
  let version = 0;
  const attempts: string[] = [];
  const busy = { read: async () => ({ w: { n: version }, version: String(version) }), write: async (_w: { n: number }, v: string) => { attempts.push(v); version++; return false; }, tries: 4, pause: async () => {} };
  await rejects(saveOnto(busy, (w) => ({ n: w.n + 100 })), (e: Error & { code?: string }) => e.code === "save_failed");
  assertEquals(attempts, ["0", "1", "2", "3"], "four tries, each against the version it read");
  // one clash, then it goes through, with the change re-applied to the newest copy
  let clash = true, saved: { n: number } | null = null, v = 7;
  const once = { read: async () => ({ w: { n: v }, version: String(v) }), write: async (w: { n: number }, ver: string) => { if (clash) { clash = false; v = 8; return false; } if (ver !== String(v)) return false; saved = w; return true; }, tries: 4, pause: async () => {} };
  assertEquals(await saveOnto(once, (w) => ({ n: w.n + 1 })), { n: 9 });
  assertEquals(saved, { n: 9 }, "applied onto the copy someone else saved, not over it");
  await rejects(saveOnto({ read: async () => null, write: async () => true, tries: 3 }, (w) => w), /gone/, "a workspace that's gone fails the save");
});
