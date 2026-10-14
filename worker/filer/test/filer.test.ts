// npm test (needs a Chromium: npx playwright-core install chromium, or CHROMIUM_PATH)
import { test, after } from "node:test";
import assert from "node:assert";
import { openBrowser } from "../src/main.ts";
import type { Model, StepInput, ToolCall } from "../src/model.ts";
import { portalKey, Worker } from "../src/run.ts";
import type { Store } from "../src/store.ts";
import type { Filing, LogEntry, Skill } from "../src/types.ts";
import { startPortal, type Variant } from "./portal/server.ts";

const b = (s: string) => ({ en: s, zh: s });
const VALUES: [string, string][] = [["Legal name", "Acme Noodles LLC"], ["Business address", "1 Main St, San Jose, CA"], ["Owner name", "Li Wei"], ["Title", "Manager"], ["Activity", "Restaurant"]];
const filing = (): Filing => ({ id: "f1", workspace_id: "w", app_id: "llc", title: b("LLC"), status: "in_progress", channel: "portal", agent_state: "running", agent_log: [],
  handoff_url: null, submit_clicked_at: null, attempts: 1, confirmation_number: null,
  payload: { official: "test-llc", fields: VALUES.map(([l, v]) => ({ label: b(l), value: v })), attachments: [{ name: "articles.pdf", path: "w/articles.pdf" }] } });

class Mem implements Store {
  f = filing(); skills = new Map<string, Skill>(); tasks: string[] = []; docs: string[] = []; proofs: string[] = []; filed = 99; queuedOnPoll = false; stopAfter = 0; steps = 0;
  async claim() { return this.f.agent_state === "queued" ? { ...this.f, agent_state: "running" } : null; }
  async reload() { return this.f; }
  async step(_f: Filing, e: LogEntry | null, patch: Record<string, unknown> = {}) {
    if (this.f.status === "canceled" && "submit_clicked_at" in patch) throw new Error("filing_stopped");
    if (e) this.f.agent_log = [...this.f.agent_log, e];
    if (this.stopAfter && ++this.steps === this.stopAfter) this.f.status = "canceled";
    for (const [k, v] of Object.entries(patch)) if (!(k === "submit_clicked_at" && this.f.submit_clicked_at)) (this.f as unknown as Record<string, unknown>)[k] = v;
    return { ...this.f };
  }
  async login() { return { username: "demo", password: "s3cret", host: "127.0.0.1" }; }
  async skill(k: string) { return this.skills.get(k) ?? null; }
  async saveSkill(s: Skill) { this.skills.set(s.key, s); }
  async skillFailed() { return { disabled: false }; }
  async selfFiled() { return this.filed; }
  async download() { return new TextEncoder().encode("%PDF-1.4 test"); }
  async saveDoc(_f: Filing, name: string) { this.docs.push(name); return `w/receipts/${name}`; }
  async saveProof(_f: Filing, name: string) { this.proofs.push(name); return `w/proof/${name}`; }
  async teamTask(_f: Filing | null, kind: string) { this.tasks.push(kind); }
  async notify() {}
  async takeHeld() { return this.queuedOnPoll; }
}

/** A stand-in for Claude: fills each empty field from the approved values, then continues. */
class Scripted implements Model {
  calls = 0; first: ToolCall[] = [];
  async next(i: StepInput): Promise<ToolCall> {
    this.calls++;
    if (this.first.length) return this.first.shift()!;
    const s = i.state, p = i.filing.payload;
    const m = /Confirmation number: (\S+)/.exec(s.text);
    if (m) return { name: "done", input: { confirmation_number: m[1], summary: "Filed" } };
    for (const c of s.controls) {
      if (c.type === "password" && !c.value) return { name: "fill_login", input: { selector: c.selector, which: "password" } };
      if (c.label === "Username" && !c.value) return { name: "fill_login", input: { selector: c.selector, which: "username" } };
      if (c.type === "file" && !i.recent.some((r) => r.startsWith("upload"))) return { name: "upload", input: { selector: c.selector, attachment: "articles.pdf" } };
      const v = p.fields?.find((f) => f.label.en === c.label)?.value;
      if (v && c.value !== v) return c.tag === "select" ? { name: "select", input: { selector: c.selector, option: v } } : { name: "fill", input: { selector: c.selector, value: v } };
    }
    return { name: "click", input: { selector: s.buttons[0].selector } };
  }
}

const worker = (store: Mem, model: Model, url: string, extra = {}) => new Worker({ store, model, open: openBrowser, portalOf: () => "127.0.0.1", startUrl: () => url + "/",
  dryRun: false, twoKey: 10, maxSteps: 80, maxMs: 120000, holdMs: 300, pollMs: 100, ...extra });
const portals: { close(): Promise<void> }[] = [];
const portal = async (v: Variant = {}) => { const p = await startPortal(v); portals.push(p); return p; };
after(async () => { for (const p of portals) await p.close(); });

test("fills and submits, saves the confirmation, then replays from the skill with no model calls", async () => {
  const p = await portal(), store = new Mem(), m1 = new Scripted();
  const r = await worker(store, m1, p.url).run(store.f);
  assert.equal(r?.kind, "submitted");
  assert.equal(store.f.status, "submitted");
  assert.equal(store.f.confirmation_number, "CA-10001");
  assert.ok(store.docs.includes("confirmation.png"));
  assert.ok(store.f.submit_clicked_at);
  const skill = store.skills.get(portalKey("127.0.0.1", "test-llc"))!;
  assert.ok(skill.body.steps.length > 5 && !JSON.stringify(skill).includes("s3cret") && !JSON.stringify(skill).includes("Acme"));
  const again = new Mem(); again.skills = store.skills; const m2 = new Scripted();
  const r2 = await worker(again, m2, p.url).run(again.f);
  assert.equal(r2?.kind, "submitted");
  assert.equal(m2.calls, 0);
  assert.ok(r2 && r2.kind === "submitted" && r2.replayed);
  assert.equal(p.submissions, 2);
});

test("stops at a CAPTCHA with needs_you and never solves it", async () => {
  const p = await portal({ captcha: true }), store = new Mem();
  const r = await worker(store, new Scripted(), p.url).run(store.f);
  assert.equal(r?.kind, "needs_you");
  assert.equal(store.f.agent_state, "needs_you");
  assert.equal(p.submissions, 0);
});

test("stops at card fields with needs_you", async () => {
  const p = await portal({ pay: true }), store = new Mem();
  const r = await worker(store, new Scripted(), p.url).run(store.f);
  assert.equal(r?.kind, "needs_you");
  assert.ok(store.f.agent_log.some((e) => e.ref === "payment"));
  assert.equal(p.submissions, 0);
});

test("refuses a value that isn't in the payload", async () => {
  const p = await portal(), store = new Mem(), m = new Scripted();
  m.first = [{ name: "fill_login", input: { selector: "label:Username", which: "username" } }, { name: "fill", input: { selector: "label:Password", value: "EVIL" } }];
  await worker(store, m, p.url).run(store.f);
  assert.ok(store.f.agent_log.some((e) => e.kind === "refused"));
});

test("doesn't submit when the review page differs", async () => {
  const p = await portal({ alter: true }), store = new Mem();
  const r = await worker(store, new Scripted(), p.url).run(store.f);
  assert.equal(r?.kind, "handoff");
  assert.equal(p.submissions, 0);
  assert.equal(store.f.submit_clicked_at, null);
});

test("doesn't submit twice when a run is killed after submit_clicked_at", async () => {
  const p = await portal(), store = new Mem();
  await worker(store, new Scripted(), p.url, { beforeSubmitClick: async () => { throw new Error("killed"); } }).run(store.f);
  assert.ok(store.f.submit_clicked_at);
  assert.equal(store.f.agent_state, "handoff");
  assert.ok(store.tasks.includes("check_agency"));
  const r = await worker(store, new Scripted(), p.url).run({ ...store.f, agent_state: "running" });
  assert.equal(r, null);
  assert.equal(p.submissions, 0);
});

test("dry run and two-key stop at the review page", async () => {
  const p = await portal(), store = new Mem(); store.filed = 0;
  const r = await worker(store, new Scripted(), p.url).run(store.f);
  assert.equal(r?.kind, "review");
  assert.ok(store.tasks.includes("review") && store.docs.includes("review-page.png"));
  assert.equal(p.submissions, 0);
});

test("shows each page with what was entered, sensitive numbers masked", async () => {
  const p = await portal(), store = new Mem(), m = new Scripted();
  await worker(store, m, p.url).run(store.f);
  const pages = store.f.agent_log.filter((e) => e.kind === "page");
  assert.ok(pages.length >= 2 && pages.every((e) => e.ref?.startsWith("w/proof/")), JSON.stringify(pages));
  assert.equal(store.proofs.length, pages.length);
  const fill = store.f.agent_log.find((e) => e.kind === "fill" && e.en === "Filled Legal name");
  assert.equal(fill?.value, "Acme Noodles LLC");
  const { shown } = await import("../src/run.ts");
  assert.equal(shown("Federal EIN", "12-3456789"), "•••6789");
  assert.equal(shown("SSN of owner", "123-45-6789"), "•••6789");
  assert.equal(shown("Owner name", "Li Wei"), "Li Wei");
});

test("a stop before submit ends the run and nothing reaches the agency", async () => {
  const p = await portal(), store = new Mem(), m = new Scripted();
  store.stopAfter = 4;
  const r = await worker(store, m, p.url).run(store.f);
  assert.equal(r?.kind, "stopped");
  assert.equal(p.submissions, 0);
  assert.equal(store.f.submit_clicked_at, null);
  assert.ok(!store.f.agent_log.some((e) => e.kind === "retry"), "a stopped run isn't retried");
});
