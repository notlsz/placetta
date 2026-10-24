// node --experimental-strip-types --test test/reroute.test.ts (no browser needed)
// When the agency's site keeps failing before anything was submitted, the worker hands the filing back marked
// "portal_failed": the file function's sweep then sends it another way the agency takes, or the team files it
// (supabase/functions/file reroute). A run that may have pressed submit is never marked that way.
import { test } from "node:test";
import assert from "node:assert";
import { Worker, type Config } from "../src/run.ts";
import type { Store } from "../src/store.ts";
import type { Filing, LogEntry } from "../src/types.ts";

const b = (s: string) => ({ en: s, zh: s });
class Mem implements Store {
  f: Filing = { id: "f1", workspace_id: "w", app_id: "llc", title: b("LLC"), status: "in_progress", channel: "portal", agent_state: "running", agent_log: [],
    handoff_url: null, submit_clicked_at: null, attempts: 3, confirmation_number: null, payload: { official: "test-llc", fields: [] } };
  tasks: string[] = [];
  async claim() { return null; }
  async reload() { return this.f; }
  async step(_f: Filing, e: LogEntry | null, patch: Record<string, unknown> = {}) {
    if (e) this.f.agent_log = [...this.f.agent_log, e];
    Object.assign(this.f, patch);
    return { ...this.f };
  }
  async login() { return null; }
  async skill() { return null; }
  async saveSkill() {}
  async skillFailed() { return { disabled: false }; }
  async selfFiled() { return 99; }
  async download() { return new Uint8Array(); }
  async saveDoc() { return null; }
  async saveProof() { return null; }
  async teamTask(_f: Filing | null, kind: string, title: string) { this.tasks.push(`${kind}: ${title}`); }
  async notify() {}
}
const worker = (store: Mem) => new Worker({
  store, model: { next: async () => { throw new Error("no model in this test"); } } as unknown as Config["model"],
  open: async () => { throw new Error("the agency's site is down"); }, portalOf: () => "agency.example.gov",
  dryRun: false, twoKey: 0, maxSteps: 5, maxMs: 1000, holdMs: 0, pollMs: 0,
});

test("the third failure on the agency's site hands it back marked for another way", async () => {
  const s = new Mem();
  await worker(s).run(s.f);
  const last = s.f.agent_log.at(-1)!;
  assert.equal(last.kind, "handoff");
  assert.equal(last.ref, "portal_failed");
  assert.match(last.en, /Odelia tries another way the agency takes, or gives it to you to send/);
  assert.equal(s.f.channel, "team");
  assert.equal(s.f.agent_state, "handoff");
  assert.deepEqual(s.tasks, []);
});

test("before the third, it tries the site again", async () => {
  const s = new Mem();
  s.f.attempts = 1;
  await worker(s).run(s.f);
  assert.equal(s.f.agent_log.at(-1)?.kind, "retry");
  assert.equal(s.f.agent_state, "queued");
});

test("after a submit was pressed, never another way: it is checked with the agency first", async () => {
  const s = new Mem();
  // pressed submit, then the run died: the reload sees it
  s.reload = async () => ({ ...s.f, submit_clicked_at: "2026-10-21T00:00:00Z" });
  await worker(s).run(s.f);
  const last = s.f.agent_log.at(-1)!;
  assert.equal(last.kind, "handoff");
  assert.notEqual(last.ref, "portal_failed");
  assert.ok(s.tasks[0].startsWith("check_agency"));
});
