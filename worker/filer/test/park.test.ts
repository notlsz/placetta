// npm test (needs a Chromium): the rehearsal on San Francisco's New Business Registration. A control already set isn't
// set again (no log line, no progress), a repeat goes to the stronger model then a person, and a run waiting on a
// person parks: its slot goes to the next filing.
import { test, after } from "node:test";
import assert from "node:assert";
import { openBrowser } from "../src/main.ts";
import type { Model, StepInput, ToolCall } from "../src/model.ts";
import { ParkLot, Worker } from "../src/run.ts";
import type { Store } from "../src/store.ts";
import type { Filing, LogEntry } from "../src/types.ts";
import { startPortal } from "./portal/server.ts";

const b = (s: string) => ({ en: s, zh: s });
const VALUES: [string, string][] = [["Legal name", "Acme Noodles LLC"], ["Business address", "1 Main St, San Jose, CA"], ["Owner name", "Li Wei"], ["Title", "Manager"], ["Activity", "Restaurant"]];
const filing = (id: string, state = "running"): Filing => ({ id, workspace_id: "w-" + id, app_id: "llc", title: b("LLC"), status: "in_progress", channel: "portal", agent_state: state, agent_log: [],
  handoff_url: null, submit_clicked_at: null, attempts: 1, confirmation_number: null,
  payload: { official: "test-llc", fields: VALUES.map(([l, v]) => ({ label: b(l), value: v })), attachments: [{ name: "articles.pdf", path: "w/articles.pdf" }] } } as Filing);

/** Several filings, claimed in order, each step written to its own filing. */
class Many implements Store {
  fs: Filing[] = []; claimedAt = new Map<string, number>(); askedAt = new Map<string, number>();
  get(id: string) { return this.fs.find((f) => f.id === id)!; }
  async claim() {
    const f = this.fs.find((x) => x.agent_state === "queued");
    if (!f) return null;
    f.agent_state = "running"; this.claimedAt.set(f.id, Date.now());
    return { ...f };
  }
  async reload(id: string) { return { ...this.get(id) }; }
  async step(f0: Filing, e: LogEntry | null, patch: Record<string, unknown> = {}) {
    const f = this.get(f0.id);
    if (e) { f.agent_log = [...f.agent_log, e]; if (e.kind === "need_person") this.askedAt.set(f.id, Date.now()); }
    for (const [k, v] of Object.entries(patch)) if (!(k === "submit_clicked_at" && f.submit_clicked_at)) (f as unknown as Record<string, unknown>)[k] = v;
    return { ...f };
  }
  async login() { return { username: "demo", password: "s3cret", host: "127.0.0.1" }; }
  async skill() { return null; }
  async saveSkill() {}
  async skillFailed() { return { disabled: false }; }
  async selfFiled() { return 99; }
  async download() { return new TextEncoder().encode("%PDF-1.4 test"); }
  async saveDoc(_f: Filing, name: string) { return `w/receipts/${name}`; }
  async saveProof(_f: Filing, name: string) { return `w/proof/${name}`; }
  async teamTask() {}
  async notify() {}
  async takeHeld() { return false; }
}

/** Claude's stand-in: fills each field that isn't set yet from the approved values, then continues. */
class Scripted implements Model {
  calls = 0; first: ToolCall[] = []; notes: string[] = [];
  /** stuck: on the Activity page, select Activity again and again (the log's "Filled Organization Type" 10 times). */
  stuck = false; escalations: boolean[] = []; strong = false;
  async next(i: StepInput): Promise<ToolCall> {
    this.calls++;
    if (i.note) this.notes.push(i.note);
    if (this.first.length) return this.first.shift()!;
    const s = i.state, p = i.filing.payload;
    const m = /Confirmation number: (\S+)/.exec(s.text);
    if (m) return { name: "done", input: { confirmation_number: m[1], summary: "Filed" } };
    const act = s.controls.find((c) => c.label === "Activity");
    if (this.stuck && !this.strong && act) return { name: "select", input: { selector: act.selector, option: "Restaurant" } };
    for (const c of s.controls) {
      if (c.type === "password" && !c.value) return { name: "fill_login", input: { selector: c.selector, which: "password" } };
      if (c.label === "Username" && !c.value) return { name: "fill_login", input: { selector: c.selector, which: "username" } };
      if (c.type === "file" && !i.recent.some((r) => r.startsWith("upload"))) return { name: "upload", input: { selector: c.selector, attachment: "articles.pdf" } };
      const v = p.fields?.find((f) => f.label.en === c.label)?.value;
      if (v && c.value !== v) return c.tag === "select" ? { name: "select", input: { selector: c.selector, option: v } } : { name: "fill", input: { selector: c.selector, value: v } };
    }
    return { name: "click", input: { selector: s.buttons[0]?.selector ?? s.links[0].selector } };
  }
}
class Strong extends Scripted { escalate(on: boolean) { this.escalations.push(on); this.strong = on; } }

const portals: { close(): Promise<void> }[] = [];
after(async () => { for (const p of portals) await p.close(); });
const cfg = (store: Store, model: Model, url: string, extra = {}) => ({ store, model, open: openBrowser, portalOf: () => "127.0.0.1", startUrl: () => url + "/",
  dryRun: false, twoKey: 10, maxSteps: 80, maxMs: 120000, holdMs: 400, pollMs: 100, ...extra });

const filled = (f: Filing, label: string) => f.agent_log.filter((e) => e.kind === "fill" && e.en === `Filled ${label}`).length;

test("a select already set to the approved value is a no-op; two of the same on one page go to a person", async () => {
  const p = await startPortal(); portals.push(p);
  const store = new Many(); store.fs.push(filing("f1")); const m = new Scripted(); m.stuck = true;
  const r = await new Worker(cfg(store, m, p.url)).run(store.get("f1"));
  const f = store.get("f1");
  assert.equal(r?.kind, "needs_you");
  assert.equal(filled(f, "Activity"), 1, "set once, logged once");
  assert.ok(f.agent_log.some((e) => e.kind === "need_person" && e.ref === "question"), "stuck goes to a person");
  assert.ok(m.notes.some((n) => /Already set on this page to the approved values.*Activity/.test(n)), "the model is told what's already set");
  assert.ok(m.calls < 20, `no long loop of model calls (${m.calls})`);
  assert.equal(p.submissions, 0);
});

test("with a stronger model to hand, a repeat goes to it first, and the filing still goes through", async () => {
  const p = await startPortal(); portals.push(p);
  const store = new Many(); store.fs.push(filing("f1")); const m = new Strong(); m.stuck = true;
  const r = await new Worker(cfg(store, m, p.url)).run(store.get("f1"));
  assert.equal(r?.kind, "submitted");
  assert.equal(filled(store.get("f1"), "Activity"), 1);
  assert.deepEqual(m.escalations.slice(0, 2), [true, false], "escalated, then back to the usual model once it moved on");
});

test("one slot, two queued filings: the first parks on need_person and the second starts within a poll interval; I've done it resumes the first on the same browser", async () => {
  const p = await startPortal(); portals.push(p);
  const store = new Many(); store.fs.push(filing("f1", "queued"), filing("f2", "queued"));
  const opened: string[] = [];
  const open = async (host?: string) => { const s = await openBrowser(host); opened.push(host ?? ""); return s; };
  const lot = new ParkLot();
  const m1 = new Scripted();
  m1.first = [{ name: "fill_login", input: { selector: "label:Username", which: "username" } }, { name: "need_person", input: { reason: "question", message: "Which activity is right?" } }];
  const models = [m1, new Scripted()];
  // one slot: the worker's loop, one filing at a time
  const slot = async () => { const m = models.shift() ?? new Scripted(); return await new Worker({ ...cfg(store, m, p.url, { holdMs: 30_000 }), open, park: lot }).once(); };
  try {
    assert.ok(await slot());
    const f1 = store.get("f1");
    assert.equal(f1.agent_state, "needs_you", "the filing is the person's");
    assert.ok(lot.has("f1"), "its browser is kept");
    assert.equal((f1 as unknown as { provider_ref: unknown }).provider_ref, null, "nothing holds it from being claimed again");
    assert.ok(f1.submit_clicked_at === null);
    assert.ok(await slot());
    assert.ok(store.claimedAt.get("f2")! - store.askedAt.get("f1")! < 100, "the second started within a poll interval");
    assert.equal(store.get("f2").status, "submitted");
    // "I've done it": the file function queues it again
    store.get("f1").agent_state = "queued";
    assert.ok(await slot());
    assert.equal(store.get("f1").status, "submitted");
    assert.equal(opened.length, 2, "the first filing resumed on its kept browser");
    assert.ok(!lot.has("f1"));
    assert.equal(p.submissions, 2);
  } finally { lot.closeAll(); }
});
