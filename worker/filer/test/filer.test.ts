// npm test (needs a Chromium: npx playwright-core install chromium, or CHROMIUM_PATH)
import { test, after } from "node:test";
import assert from "node:assert";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openBrowser } from "../src/main.ts";
import type { Model, StepInput, ToolCall } from "../src/model.ts";
import type { Playbook } from "../src/playbooks.ts";
import { assertFresh, portalKey, type Session, Worker } from "../src/run.ts";
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
  tenant?: string;
  async login(_f: Filing, _host: string, tenant?: string) { this.tenant = tenant; return { username: "demo", password: "s3cret", host: "127.0.0.1" }; }
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
  calls = 0; first: ToolCall[] = []; guide: string[] = [];
  async next(i: StepInput): Promise<ToolCall> {
    this.calls++;
    if (i.guide) this.guide = i.guide;
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
    return { name: "click", input: { selector: s.buttons[0]?.selector ?? s.links[0].selector } };
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

test("a recorded step whose selector drifted is found again by its words: still no model calls, drift goes to the team, the skill learns the new selector", async () => {
  const p = await portal(), store = new Mem();
  assert.equal((await worker(store, new Scripted(), p.url).run(store.f))?.kind, "submitted");
  const key = portalKey("127.0.0.1", "test-llc"), skill = store.skills.get(key)!;
  const i = skill.body.steps.findIndex((s) => s.selector === "label:Legal name");
  assert.ok(i >= 0, "the recording has the Legal name step");
  skill.body.steps[i] = { ...skill.body.steps[i], selector: "label:LEGAL NAME:" };   // what an old recording of a relabelled page looks like
  const again = new Mem(); again.skills = store.skills; const m2 = new Scripted();
  const r = await worker(again, m2, p.url).run(again.f);
  assert.equal(r?.kind, "submitted");
  assert.equal(m2.calls, 0, "healed without asking the model");
  assert.ok(again.f.agent_log.some((e) => e.kind === "drift" && /LEGAL NAME: -> label:Legal name/.test(e.ref ?? "")));
  assert.ok(again.tasks.includes("selector_drift"), "the team is told the recording drifted");
  assert.ok(again.skills.get(key)!.body.steps.some((s) => s.selector === "label:Legal name"), "the saved skill has the selector that worked");
  assert.ok(again.f.agent_log.some((e) => e.kind === "receipt_check" && /confirmation number shown by the agency yes/.test(e.en)), "the receipt checklist is in the log");
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

/* ---------------- playbooks written from a portal's published guide ---------------- */

const steps = { start: "http://127.0.0.1/", steps: [{ page: "Business", do: "fill" as const, note: "Legal name and business address." }] };
const playbook = (over: Partial<Playbook> = {}): Playbook => ({
  host: "127.0.0.1", name: "Test portal", guides: ["https://agency.gov/guide.pdf"], read: "2026-10-18", verified: null,
  forms: { "test-llc": steps }, final: [{ page: "Review", button: "Continue" }], pay: ["Pay Fees"], receipt: ["Receipt"], ...over,
});
const withPlaybook = (pb: Playbook) => ({ playbookOf: (_h: string, official: string) => (pb.forms[official] ? { playbook: pb, form: pb.forms[official] } : null) });
const VERIFIED = { on: "2026-10-20", by: "staff@placetta", filing: "f0" };

test("a playbook that hasn't had its supervised first run is refused unless FILER_ALLOW_UNVERIFIED=1", async () => {
  const p = await portal(), store = new Mem();
  let opened = false;
  const r = await worker(store, new Scripted(), p.url, { ...withPlaybook(playbook()), open: async () => { opened = true; return openBrowser(); } }).run(store.f);
  assert.equal(r, null);
  assert.equal(opened, false, "no browser is opened");
  assert.equal(store.f.agent_state, "handoff");
  assert.ok(store.tasks.includes("first_run"));
  assert.ok(store.f.agent_log.some((e) => e.ref === "unverified_playbook" && e.zh.length > 0));
  assert.equal(p.submissions, 0);
});

test("with FILER_ALLOW_UNVERIFIED=1 the first run follows the guide and stops at the review page for the team, then submits once approved", async () => {
  const p = await portal(), store = new Mem(), m = new Scripted();   // store.filed is 99: the two-key period is over
  const r = await worker(store, m, p.url, { ...withPlaybook(playbook({ final: [{ page: "Review", button: "Submit filing" }] })), allowUnverified: true }).run(store.f);
  assert.equal(r?.kind, "review");
  assert.ok(store.tasks.includes("review") && store.docs.includes("review-page.png"));
  assert.ok(store.f.agent_log.some((e) => e.kind === "playbook"));
  assert.ok(m.guide.some((l) => l.startsWith("Published guide for Test portal")), "the model reads the guide's steps");
  assert.equal(p.submissions, 0);
  // The team approved the review page: the next run submits.
  const again = new Mem(); again.f.agent_log = [{ en: "", zh: "", kind: "two_key_ok" }];
  const r2 = await worker(again, new Scripted(), p.url, { ...withPlaybook(playbook()), allowUnverified: true }).run(again.f);
  assert.equal(r2?.kind, "submitted");
  assert.equal(p.submissions, 1);
});

test("the guide's send button gets the final-submit guard even when it only says Continue", async () => {
  const p = await portal({ neutral: true }), store = new Mem(); store.filed = 0;
  const r = await worker(store, new Scripted(), p.url, withPlaybook(playbook({ verified: VERIFIED }))).run(store.f);
  assert.equal(r?.kind, "review");
  assert.equal(p.submissions, 0);
  assert.equal(store.f.submit_clicked_at, null);
});

test("a submit that is a link gets the same guard as a submit button", async () => {
  const p = await portal({ link: true }), store = new Mem(); store.filed = 0;
  const r = await worker(store, new Scripted(), p.url).run(store.f);
  assert.equal(r?.kind, "review");
  assert.equal(p.submissions, 0);
});

test("the page the guide names for the agency's fee goes to the person, even with no card fields", async () => {
  const p = await portal({ feePage: true }), store = new Mem();
  const r = await worker(store, new Scripted(), p.url, withPlaybook(playbook({ verified: VERIFIED, final: [{ page: "Review", button: "Submit filing" }] }))).run(store.f);
  assert.equal(r?.kind, "needs_you");
  assert.ok(store.f.agent_log.some((e) => e.kind === "need_person" && e.ref === "payment"));
  assert.ok(store.f.submit_clicked_at, "the application went in before the fee page");
});

test("a sign-in on another host the destination names is allowed; without it the run never leaves the portal", async () => {
  const p = await portal({ signInHost: "localhost" }), store = new Mem();
  const r = await worker(store, new Scripted(), p.url, { routeOf: () => ({ alsoOn: ["localhost"], tenant: "/dallastx" }) }).run(store.f);
  assert.equal(r?.kind, "submitted");
  assert.equal(store.tenant, "/dallastx", "the saved login is looked up with the agency's path");
  const p2 = await portal({ signInHost: "localhost" }), store2 = new Mem();
  const r2 = await worker(store2, new Scripted(), p2.url).run(store2.f);
  assert.notEqual(r2?.kind, "submitted");
  assert.equal(p2.submissions, 0);
});

test("zero data retention: when required and Anthropic (or the filer's model) isn't listed, the model refuses before sending anything", async () => {
  const { FilerModel } = await import("../src/model.ts");
  const { Router } = await import("../src/llm.ts");
  const env = (e: Record<string, string>) => (k: string) => e[k];
  const realFetch = globalThis.fetch;
  let sent = 0;
  globalThis.fetch = (async () => { sent++; return new Response("{}", { status: 500 }); }) as typeof fetch;
  try {
    const m = new FilerModel(new Router({ env: env({ ANTHROPIC_API_KEY: "k", GEMINI_API_KEY: "g", GEMINI_PAID: "1", OPENROUTER_API_KEY: "o", FILER_MODELS: "anthropic:claude-sonnet-5-5,gemini,openrouter", AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "anthropic:claude-opus-5-5" }) }));
    await assert.rejects(m.next({} as StepInput), /Zero data retention is required/);
    assert.equal(sent, 0);
    assert.equal(m.calls, 0);
  } finally { globalThis.fetch = realFetch; }
});

/* ------------------------------ failover between model vendors ------------------------------ */

/** The worker with a real router (llm.ts) whose fetch is mocked: Anthropic answers with its usage limit, Gemini answers
 *  with the choice a scripted model makes for the page, so the run, its guards and its final submit are the real ones. */
async function failoverWorker(first: ToolCall[] = []) {
  const { FilerModel } = await import("../src/model.ts");
  const { Router } = await import("../src/llm.ts");
  const brain = new Scripted(); brain.first = first;
  let seen: StepInput | null = null;
  const asked: string[] = [];
  const f = (async (url: string) => {
    asked.push(new URL(url).hostname);
    if (url.includes("api.anthropic.com")) return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC." } }), { status: 400 });
    const c = await brain.next(seen!);
    return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: c.name, args: c.input } }] }, finishReason: "STOP" }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const env = (k: string) => ({ ANTHROPIC_API_KEY: "sk-ant-k", GEMINI_API_KEY: "AIza-k", GEMINI_PAID: "1", FILER_MODELS: "anthropic:claude-sonnet-5-5,gemini:gemini-3.8-flash" } as Record<string, string>)[k];
  class Seen extends FilerModel { override next(i: StepInput) { seen = i; return super.next(i); } }
  return { model: new Seen(new Router({ env, fetch: f, log: () => undefined })), asked };
}

test("failover: with Anthropic at its usage limit, Gemini files the form through the same guards and the same final submit", async () => {
  const realErr = console.error; console.error = () => undefined;
  try {
    const p = await portal(), store = new Mem(), { model, asked } = await failoverWorker();
    const r = await worker(store, model, p.url).run(store.f);
    assert.equal(r?.kind, "submitted");
    assert.equal(store.f.confirmation_number, "CA-10001");
    assert.equal(p.submissions, 1, "submitted once");
    assert.equal(asked[0], "api.anthropic.com", "Anthropic is asked first");
    assert.equal(asked.filter((h) => h === "api.anthropic.com").length, 1, "then sits out its limit instead of being asked every step");
    assert.ok(asked.slice(1).every((h) => h === "generativelanguage.googleapis.com"));
  } finally { console.error = realErr; }
});

test("failover: a value Gemini chose that isn't approved is refused exactly as Claude's would be", async () => {
  const realErr = console.error; console.error = () => undefined;
  try {
    const p = await portal(), store = new Mem();
    const { model } = await failoverWorker([{ name: "fill_login", input: { selector: "label:Username", which: "username" } }, { name: "fill", input: { selector: "label:Password", value: "EVIL" } }]);
    await worker(store, model, p.url).run(store.f);
    assert.ok(store.f.agent_log.some((e) => e.kind === "refused"));
  } finally { console.error = realErr; }
});

/* ------------------------------ the model cascade (cascade.ts) ------------------------------ */

/** The scripted filer as a tiered model: records which tier answered each page; on its first look at the second page
 *  the fast tier asks for a person, which goes up to the strong tier. */
class Tiered extends Scripted {
  tiered = true; tiers: { heading: string; tier: string }[] = []; askedOnce = false;
  ledger: { tier: "fast" | "strong"; model: string; input: number; output: number; cache_read: number; cache_write: number; usd: number }[] = [];
  override async next(i: StepInput): Promise<ToolCall> {
    const tier = i.tier ?? "fast";
    this.tiers.push({ heading: i.state.headings[0] ?? i.state.title, tier });
    this.ledger.push({ tier, model: tier === "fast" ? "anthropic:claude-haiku-5-5" : "anthropic:claude-opus-5-5", input: 1500, output: 250, cache_read: 1500, cache_write: 0, usd: tier === "fast" ? 0.0003 : 0.03 });
    if (tier === "fast" && !this.askedOnce && /Owner/.test(i.state.headings[0] ?? i.state.title)) { this.askedOnce = true; this.calls++; return { name: "need_person", input: { reason: "unsure", message: "Which owner?" } }; }
    return super.next(i);
  }
  take() { const l = this.ledger; this.ledger = []; return l; }
}

test("the cascade on a whole run: routine pages fast, the review page strong, a fast need_person re-asked of the strong model; guards unchanged", async () => {
  const p = await portal(), store = new Mem(), m = new Tiered();
  const r = await worker(store, m, p.url).run(store.f);
  assert.equal(r?.kind, "submitted");
  assert.equal(p.submissions, 1, "submitted once, through the same final-submit guard");
  const review = m.tiers.filter((t) => /Review/.test(t.heading));
  assert.ok(review.length > 0 && review.every((t) => t.tier === "strong"), "the review page and its final submit: the strong model");
  const owner = m.tiers.filter((t) => /Owner/.test(t.heading));
  assert.deepEqual(owner.slice(0, 2).map((t) => t.tier), ["fast", "strong"], "need_person from the fast model goes to the strong one, not the owner");
  assert.ok(!store.f.agent_log.some((e) => e.kind === "need_person"), "the strong model carried on; nobody was asked");
  assert.ok(m.tiers.filter((t) => t.tier === "fast").length > m.tiers.filter((t) => t.tier === "strong").length, "most steps are fast");
  // the filing log: one quiet line with the counts by tier, and no model, token or price (docs/SECURITY.md)
  const line = store.f.agent_log.find((e) => e.ref === "ai");
  assert.ok(line && line.kind === "quiet" && /routine steps/.test(line.en) && /本次运行/.test(line.zh));
  assert.ok(!/claude|haiku|opus|\$|token/i.test(JSON.stringify(store.f.agent_log)), "nothing about models or money in what the customer's app reads");
});

test("the run's ledger goes to filer_runs (provider, tier, model, tokens, cost) before the run's token ends", async () => {
  const p = await portal(), store = new Mem() as Mem & { usage?: unknown; ended?: boolean };
  (store as unknown as { runUsage: (u: unknown) => Promise<void> }).runUsage = async (u) => { store.usage = u; };
  const m = new Tiered();
  const open = async (h?: string) => ({ ...(await openBrowser(h)), provider: "local" as const });
  await worker(store, m, p.url, { open }).run(store.f);
  const u = store.usage as { provider: string; calls: number; usd: number; by_tier: Record<string, { calls: number }>; steps: { tier: string; model: string }[] };
  assert.equal(u.provider, "local");
  assert.ok(u.calls > 5 && u.usd > 0);
  assert.ok(u.by_tier.fast.calls > 0 && u.by_tier.strong.calls > 0);
  assert.ok(u.steps.some((s) => s.model === "anthropic:claude-opus-5-5" && s.tier === "strong"));
});

/* ------------------------------ isolation between runs ------------------------------ */

/** Opens a real browser like the worker does, and keeps what the test needs to look at afterwards. */
const tracked = () => {
  const seen: { session: Session; cookiesAtStart: number }[] = [];
  return {
    seen,
    open: async (): Promise<Session> => {
      const s = await openBrowser();
      seen.push({ session: s, cookiesAtStart: (await s.page.context().cookies()).length });
      return s;
    },
  };
};

test("each run: its own new browser and its own folder, both gone when it ends; nothing carries to the next customer", async () => {
  const p = await portal(), root = await mkdtemp(join(tmpdir(), "filer-iso-"));
  const t = tracked(), during: string[][] = [];
  const a = new Mem();
  a.download = async () => { during.push(await readdir(root)); return new TextEncoder().encode("%PDF-1.4 test"); };
  // the first customer's run leaves a cookie in its browser
  const leaveCookie = async () => {
    const s = await t.open();
    s.page.on("load", () => { void s.page.context().addCookies([{ name: "sid", value: "customer-a", url: p.url }]).catch(() => undefined); });
    return s;
  };
  assert.equal((await worker(a, new Scripted(), p.url, { open: leaveCookie, tmpRoot: root }).run(a.f))?.kind, "submitted");
  assert.equal(during.length, 1);
  assert.equal(during[0].length, 1, "the upload was written inside this run's own folder");
  assert.match(during[0][0], /^filer-f1-/);
  assert.deepEqual(await readdir(root), [], "the folder is deleted when the run ends");
  assert.equal(t.seen[0].session.browser.isConnected(), false, "the browser is closed when the run ends");

  const b = new Mem(); b.f = { ...filing(), id: "f2", workspace_id: "other-customer" };
  assert.equal((await worker(b, new Scripted(), p.url, { open: t.open, tmpRoot: root }).run(b.f))?.kind, "submitted");
  assert.equal(t.seen.length, 2);
  assert.notEqual(t.seen[1].session.browser, t.seen[0].session.browser, "a new browser, not the last one");
  assert.equal(t.seen[1].cookiesAtStart, 0, "the next customer's run starts with no cookies");
  assert.deepEqual(await readdir(root), []);
  await rm(root, { recursive: true, force: true });
});

test("a failed run still closes its browser and deletes its folder", async () => {
  const p = await portal(), root = await mkdtemp(join(tmpdir(), "filer-iso-")), t = tracked();
  const store = new Mem();
  const broken: Model = { calls: 0, async next() { throw new Error("model down"); } };
  await worker(store, broken, p.url, { open: t.open, tmpRoot: root }).run(store.f);
  assert.equal(p.submissions, 0);
  assert.equal(t.seen[0].session.browser.isConnected(), false);
  assert.deepEqual(await readdir(root), []);
  await rm(root, { recursive: true, force: true });
});

test("a browser session that isn't fresh is refused before it visits the portal", async () => {
  const p = await portal(), root = await mkdtemp(join(tmpdir(), "filer-iso-")), store = new Mem();
  let visited = false;
  const used = async (): Promise<Session> => {
    const s = await openBrowser();
    await s.page.context().addCookies([{ name: "sid", value: "someone-else", url: "https://example.com" }]);
    s.page.on("request", () => { visited = true; });
    return s;
  };
  const probe = await used();
  await assert.rejects(assertFresh(probe), /isn't fresh/);
  await probe.close();
  await worker(store, new Scripted(), p.url, { open: used, tmpRoot: root }).run(store.f);
  assert.equal(visited, false);
  assert.equal(p.submissions, 0);
  assert.ok(store.f.agent_log.every((e) => e.kind !== "visit"));
  assert.deepEqual(await readdir(root), []);
  await rm(root, { recursive: true, force: true });
});
