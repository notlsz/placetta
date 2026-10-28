// npm test (needs a Chromium): the remote browser providers (browsers.ts) against mocks of Steel's and Browserbase's
// sessions APIs, each session a real Chromium reached over CDP like the providers' own. What must hold:
//   - BROWSER_PROVIDER picks the browser; local Chromium stays the default; a remote provider never starts Chromium here
//   - no provider's CAPTCHA solving is ever asked for, and no saved profile, context or stored credentials
//   - every session is new and empty, and released when the run ends, however it ends
//   - the API key never reaches an error, a log line or a live-view address
//   - hand-backs: the owner gets the provider's viewer; a CAPTCHA for the Placetta team gets the worker's own covered
//     view, never the provider's
import type { RecordingPolicy } from "../src/privacy.ts";
import { test, after } from "node:test";
import assert from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { chromium, type Browser } from "playwright-core";
import { browserbaseBody, launcher, opener, steelBody, viewerUrl, type Deps } from "../src/browsers.ts";
import { checkEnv, providerOf } from "../src/env.ts";
import { counted, keepAwakeDue } from "../src/main.ts";
import { LiveViews } from "../src/live.ts";
import type { Model, StepInput, ToolCall } from "../src/model.ts";
import { assertFresh, Worker } from "../src/run.ts";
import type { HumanCheck, Store } from "../src/store.ts";
import type { Filing, LogEntry, Skill } from "../src/types.ts";
import { startPortal, type Portal } from "./portal/server.ts";

const KEY = "steel-live-key-0123456789";
const BBKEY = "bb-live-key-0123456789";

// ---------------------------------------------------------------- a Chromium per session, over CDP

const procs = new Map<string, { p: ChildProcess; dir: string; ws: string }>();
async function chromeFor(id: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cdp-"));
  const p = spawn(chromium.executablePath(), ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const ws = await new Promise<string>((ok, bad) => {
    let b = "";
    const t = setTimeout(() => bad(new Error("chromium didn't start")), 20_000);
    p.stderr!.on("data", (d) => { b += d; const m = /DevTools listening on (ws:\S+)/.exec(b); if (m) { clearTimeout(t); ok(m[1]); } });
  });
  procs.set(id, { p, dir, ws });
  return ws;
}
function kill(id: string) {
  const c = procs.get(id);
  if (!c) return;
  c.p.kill("SIGKILL"); procs.delete(id);
  try { rmSync(c.dir, { recursive: true, force: true }); } catch { /* still closing */ }
}

// ---------------------------------------------------------------- the providers' APIs

type Call = { method: string; path: string; headers: IncomingMessage["headers"]; body: Record<string, unknown> };
class Api {
  calls: Call[] = []; url = ""; srv!: Server; n = 0;
  refuse = 0;
  debugUrl = (id: string) => `https://api.steel.dev/v1/sessions/${id}/player`;
  async start() {
    this.srv = createServer(async (req, res) => {
      let raw = ""; for await (const c of req) raw += c;
      const body = raw ? JSON.parse(raw) : {};
      const path = req.url ?? "/";
      this.calls.push({ method: req.method ?? "", path, headers: req.headers, body });
      const send = (s: number, o: unknown) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
      if (this.refuse) return send(this.refuse, { error: "nope" });
      if (req.method === "POST" && path === "/v1/sessions") {
        const id = `sess-${++this.n}-abcdef`;
        const ws = await chromeFor(id);
        return send(201, { id, debugUrl: this.debugUrl(id), sessionViewerUrl: `https://app.steel.dev/sessions/${id}`, websocketUrl: `wss://connect.steel.dev?sessionId=${id}`, connectUrl: ws });
      }
      let m = /^\/v1\/sessions\/([\w-]+)\/release$/.exec(path);
      if (m && req.method === "POST") { kill(m[1]); return send(200, { success: true }); }
      m = /^\/v1\/sessions\/([\w-]+)\/debug$/.exec(path);
      if (m) return send(200, { debuggerFullscreenUrl: `https://www.browserbase.com/devtools-fullscreen/inspector.html?wss=connect.browserbase.com/debug/${m[1]}` });
      m = /^\/v1\/sessions\/([\w-]+)$/.exec(path);
      if (m && req.method === "POST" && body.status === "REQUEST_RELEASE") { kill(m[1]); return send(200, {}); }
      send(404, {});
    });
    await new Promise<void>((r) => this.srv.listen(0, "127.0.0.1", () => r()));
    this.url = `http://127.0.0.1:${(this.srv.address() as { port: number }).port}`;
    return this;
  }
  creates() { return this.calls.filter((c) => c.method === "POST" && c.path === "/v1/sessions"); }
  releases() { return this.calls.filter((c) => /release$/.test(c.path) || c.body.status === "REQUEST_RELEASE"); }
}

const apis: Api[] = [];
const portals: Portal[] = [];
after(async () => {
  for (const id of [...procs.keys()]) kill(id);
  for (const a of apis) await new Promise((r) => a.srv.close(r));
  for (const p of portals) await p.close();
});

/** Deps whose connect goes to the session's own Chromium, after checking the address it was given. */
function deps(api: Api, env: Record<string, string>, seen: string[] = [], launched = { n: 0 }): Deps {
  return {
    env: { STEEL_API_URL: api.url, BROWSERBASE_API_URL: api.url, ...env }, fetch: (...a) => fetch(...a), sessionMs: 20 * 60_000,
    connect: async (url: string): Promise<Browser> => {
      seen.push(url);
      const byWs = [...procs].find(([, c]) => c.ws === url)?.[0];
      const id = /sessionId=([\w-]+)/.exec(url)?.[1] ?? byWs;
      const c = id ? procs.get(id) : null;
      if (!c) throw new Error(`no such session at ${url}`);
      return chromium.connectOverCDP(c.ws);
    },
    launch: async () => { launched.n++; throw new Error("local Chromium must not start"); },
  };
}
const fresh = async () => { const a = await new Api().start(); apis.push(a); return a; };

// ---------------------------------------------------------------- env

test("BROWSER_PROVIDER: local by default, steel or browserbase; anything else files nothing", () => {
  const base = { SUPABASE_URL: "https://esquxzcfsylffuijvzec.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "x", ANTHROPIC_API_KEY: "sk-ant-x", RENDER_EXTERNAL_URL: "https://placetta-filer.onrender.com" };
  assert.equal(providerOf({}), "local");
  assert.equal(checkEnv(base).provider, "local");
  assert.equal(checkEnv(base).remote, false);
  const steel = checkEnv({ ...base, BROWSER_PROVIDER: "steel" });
  assert.equal(steel.ok, false);
  assert.deepEqual(steel.missing.map((m) => m.key), ["STEEL_API_KEY"]);
  assert.ok(/steel\.dev/.test(steel.missing[0].where));
  const on = checkEnv({ ...base, BROWSER_PROVIDER: " Steel ", STEEL_API_KEY: KEY });
  assert.equal(on.ok, true); assert.equal(on.browser, "steel"); assert.equal(on.remote, true);
  assert.deepEqual(checkEnv({ ...base, BROWSER_PROVIDER: "browserbase" }).missing.map((m) => m.key), ["BROWSERBASE_API_KEY", "BROWSERBASE_PROJECT_ID"]);
  assert.equal(checkEnv({ ...base, BROWSER_PROVIDER: "browserbase", BROWSERBASE_API_KEY: "k", BROWSERBASE_PROJECT_ID: "p" }).remote, true);
  assert.deepEqual(checkEnv({ ...base, BROWSER_PROVIDER: "chrome" }).missing.map((m) => m.key), ["BROWSER_PROVIDER"]);
  // wake on demand needs a real secret
  assert.equal(checkEnv(base).wake, false);
  assert.ok(checkEnv(base).warnings.some((w) => /FILER_SECRET/.test(w)));
  assert.equal(checkEnv({ ...base, FILER_SECRET: "short" }).wake, false);
  assert.equal(checkEnv({ ...base, FILER_SECRET: "s".repeat(32) }).wake, true);
  // no public address with a remote browser: the owner still gets the provider's view; the team's view can't open
  assert.ok(checkEnv({ ...base, RENDER_EXTERNAL_URL: "", BROWSER_PROVIDER: "steel", STEEL_API_KEY: KEY }).warnings.some((w) => /provider's live view/.test(w)));
});

test("never a CAPTCHA solver, never a saved profile or stored credentials", () => {
  const s = steelBody(3600_000) as Record<string, unknown>;
  assert.equal(s.solveCaptcha, false);
  assert.deepEqual(s.stealthConfig, { autoCaptchaSolving: false });
  for (const k of ["profileId", "persistProfile", "sessionContext", "credentials", "extensionIds"]) assert.ok(!(k in s), k);
  const b = browserbaseBody("p") as Record<string, unknown>;
  assert.deepEqual(b.browserSettings, { solveCaptchas: false });
  assert.ok(!("context" in (b.browserSettings as object)) && !("extensionId" in b));
});

test("a viewer address is used only when it's https and doesn't carry the key", () => {
  assert.equal(viewerUrl("https://api.steel.dev/v1/sessions/s1/player", KEY, "interactive=true"), "https://api.steel.dev/v1/sessions/s1/player?interactive=true");
  assert.equal(viewerUrl(`https://api.steel.dev/v1/sessions/s1/player?apiKey=${KEY}`, KEY), null);
  assert.equal(viewerUrl("http://api.steel.dev/v1/sessions/s1/player", KEY), null);
  assert.equal(viewerUrl("https://user:pw@x.example/", KEY), null);
  assert.equal(viewerUrl(undefined, KEY), null);
});

// ---------------------------------------------------------------- Steel

test("Steel: a new empty session over CDP, the key only in the connect address, released on close; Chromium never starts here", async () => {
  const api = await fresh(), seen: string[] = [], launched = { n: 0 };
  const open = opener(deps(api, { BROWSER_PROVIDER: "steel", STEEL_API_KEY: KEY, STEEL_CONNECT_URL: "wss://connect.steel.dev" }, seen, launched));
  const s = await open("bizfileonline.sos.ca.gov");
  const c = api.creates()[0];
  assert.equal(c.headers["steel-api-key"], KEY);
  assert.equal(c.body.solveCaptcha, false);
  assert.deepEqual(c.body.stealthConfig, { autoCaptchaSolving: false });
  assert.ok(Number(c.body.timeout) >= 60_000);
  assert.match(seen[0], /^wss:\/\/connect\.steel\.dev\?apiKey=steel-live-key-0123456789&sessionId=sess-1-abcdef$/);
  await assertFresh(s);
  assert.equal(s.page.url(), "about:blank");
  assert.equal(s.liveUrl, "https://api.steel.dev/v1/sessions/sess-1-abcdef/player?interactive=true&showControls=false");
  assert.ok(!s.liveUrl!.includes(KEY));
  await s.page.setContent("<h1>Hello from Steel</h1>");
  assert.equal(await s.page.textContent("h1"), "Hello from Steel");
  await s.close();
  assert.equal(api.releases().length, 1);
  assert.equal(api.releases()[0].headers["steel-api-key"], KEY);
  assert.equal(launched.n, 0, "a remote provider never starts Chromium in the container");
  assert.ok(!procs.has("sess-1-abcdef"), "the session is gone");
});

test("Steel refuses, or the connection fails: the error says which, never the key, and the session is released", async () => {
  const api = await fresh();
  api.refuse = 401;
  const open = opener(deps(api, { BROWSER_PROVIDER: "steel", STEEL_API_KEY: KEY }));
  await assert.rejects(open(""), (e: Error) => /^steel 401\b/.test(e.message) && !e.message.includes(KEY));
  api.refuse = 0;
  const bad = opener({ ...deps(api, { BROWSER_PROVIDER: "steel", STEEL_API_KEY: KEY }), connect: async (url) => { throw new Error(`connect ECONNREFUSED ${url}`); } });
  await assert.rejects(bad(""), (e: Error) => /couldn't connect/.test(e.message) && !e.message.includes(KEY));
  assert.equal(api.releases().length, 1, "a session that couldn't be used is released at once");
  // a viewer address that carries the key is never handed to anyone
  const api2 = await fresh();
  api2.debugUrl = (id) => `https://api.steel.dev/v1/sessions/${id}/player?apiKey=${KEY}`;
  const s = await opener(deps(api2, { BROWSER_PROVIDER: "steel", STEEL_API_KEY: KEY }))("");
  assert.equal(s.liveUrl, null);
  await s.close();
});

test("the nightly check and the founder's check use one Steel session, released on close", async () => {
  const api = await fresh(), launched = { n: 0 };
  const b = await launcher(deps(api, { BROWSER_PROVIDER: "steel", STEEL_API_KEY: KEY }, [], launched))();
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  await p.setContent("<p>ok</p>");
  await b.close();
  assert.equal(api.releases().length, 1);
  assert.equal(launched.n, 0);
});

// ---------------------------------------------------------------- Browserbase

test("Browserbase for every run: solving off, the debugger view for the owner, released on close", async () => {
  const api = await fresh(), seen: string[] = [], launched = { n: 0 };
  // the mock hands back its Chromium's own CDP address as Browserbase's connectUrl
  const d = deps(api, { BROWSER_PROVIDER: "browserbase", BROWSERBASE_API_KEY: BBKEY, BROWSERBASE_PROJECT_ID: "proj-1" }, seen, launched);
  const s = await opener(d)("boiefiling.fincen.gov");
  const c = api.creates()[0];
  assert.equal(c.headers["x-bb-api-key"], BBKEY);
  assert.deepEqual(c.body, { projectId: "proj-1", keepAlive: true, browserSettings: { solveCaptchas: false } });
  await assertFresh(s);
  assert.match(s.liveUrl ?? "", /^https:\/\/www\.browserbase\.com\/devtools-fullscreen\//);
  await s.close();
  assert.equal(api.releases().length, 1);
  assert.equal(launched.n, 0);
});

test("local (the default): Chromium here, Browserbase only for the hosts that refuse a cloud server when its keys are set", async () => {
  const api = await fresh(), launched = { n: 0 };
  const d = deps(api, { BROWSERBASE_API_KEY: BBKEY, BROWSERBASE_PROJECT_ID: "p" }, [], launched);
  const open = opener(d);
  await assert.rejects(open("boiefiling.fincen.gov"), /local Chromium must not start/);
  assert.equal(launched.n, 1, "an ordinary host opens local Chromium");
  const s = await open("eddservices.edd.ca.gov");
  assert.equal(api.creates().length, 1, "EDD opens on Browserbase");
  await s.close();
  await assert.rejects(opener({ ...d, env: { BROWSER_PROVIDER: "firefox" } })(""), /local, steel or browserbase/);
});

// ---------------------------------------------------------------- hand-backs on a remote browser

const bi = (s: string) => ({ en: s, zh: s });
const VALUES: [string, string][] = [["Legal name", "Acme Noodles LLC"], ["Business address", "1 Main St, San Jose, CA"], ["Owner name", "Li Wei"], ["Title", "Manager"], ["Activity", "Restaurant"]];
const filing = (): Filing => ({ id: "f1", workspace_id: "w", app_id: "llc", title: bi("LLC"), status: "in_progress", channel: "portal", agent_state: "running", agent_log: [],
  handoff_url: null, submit_clicked_at: null, attempts: 1, confirmation_number: null,
  payload: { official: "test-llc", fields: VALUES.map(([l, v]) => ({ label: bi(l), value: v })), attachments: [{ name: "articles.pdf", path: "w/articles.pdf" }] } });
class Mem implements Store {
  f = filing(); skills = new Map<string, Skill>(); notes: string[] = []; checks: { id: string; url: string; escalate_at: string; state: string; opened_at: string | null; closed?: string }[] = [];
  handoffs: (string | null)[] = [];
  privacy: RecordingPolicy = { synthetic: false, strict: false, screen: false, teach: false };   // a business outside California
  async recordingPolicy() { return this.privacy; }
  async claim() { return null; }
  async reload() { return this.f; }
  async step(_f: Filing, e: LogEntry | null, patch: Record<string, unknown> = {}) {
    if (e) this.f.agent_log = [...this.f.agent_log, e];
    for (const [k, v] of Object.entries(patch)) (this.f as unknown as Record<string, unknown>)[k] = v;
    if ("handoff_url" in patch) this.handoffs.push(patch.handoff_url as string | null);
    return { ...this.f };
  }
  async login() { return { username: "demo", password: "s3cret", host: "127.0.0.1" }; }
  async skill(k: string) { return this.skills.get(k) ?? null; }
  async saveSkill(s: Skill) { this.skills.set(s.key, s); }
  async skillFailed() { return { disabled: false }; }
  async selfFiled() { return 99; }
  async download() { return new TextEncoder().encode("%PDF-1.4 test"); }
  async saveDoc(_f: Filing, name: string) { return `w/receipts/${name}`; }
  async saveProof(_f: Filing, name: string) { return `w/proof/${name}`; }
  async teamTask() { /* none */ }
  async notify(_f: Filing, title: { en: string }) { this.notes.push(title.en); }
  async humanCheckOpen(_f: Filing, url: string): Promise<HumanCheck> {
    const c = { id: `hc${this.checks.length + 1}`, url, escalate_at: new Date(Date.now() + 400).toISOString(), state: "waiting", opened_at: null };
    this.checks.push(c);
    return { id: c.id, escalate_at: c.escalate_at };
  }
  async humanCheck(id: string) { const c = this.checks.find((x) => x.id === id); return c ? { state: c.state, opened_at: c.opened_at } : null; }
  async humanCheckClose(id: string, state: "solved" | "to_owner" | "ended") { const c = this.checks.find((x) => x.id === id); if (!c || c.closed) return false; c.closed = state; c.state = state; return true; }
}
class Scripted implements Model {
  calls = 0;
  async next(i: StepInput): Promise<ToolCall> {
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

test("a CAPTCHA on a Steel run: the team gets the worker's covered view, never Steel's; the owner gets Steel's viewer", async () => {
  const api = await fresh();
  const portal = await startPortal({ captchaToken: true }); portals.push(portal);
  const store = new Mem(), runs = { open: 0 };
  const live = new LiveViews("https://filer.placetta.test");
  const open = counted(opener(deps(api, { BROWSER_PROVIDER: "steel", STEEL_API_KEY: KEY })), runs);
  let peak = 0;
  const w = new Worker({ store, model: new Scripted(), portalOf: () => "127.0.0.1", startUrl: () => portal.url + "/", live,
    open: async (h) => { const s = await open(h); peak = Math.max(peak, runs.open); return s; },
    dryRun: false, twoKey: 10, maxSteps: 80, maxMs: 120000, holdMs: 400, pollMs: 100, staffHoldMs: 20000 });
  const r = await w.run(store.f);
  // nobody on the team opened it in time (escalate in 400 ms): it went to the owner
  assert.equal(r?.kind, "needs_you");
  const team = store.checks[0];
  assert.match(team.url, /^https:\/\/filer\.placetta\.test\/live\/[A-Za-z0-9_-]{32}$/, "the team's view is the worker's own, covered");
  assert.ok(!team.url.includes("steel"), "never the provider's uncovered viewer");
  assert.equal(team.closed, "to_owner");
  const owner = store.handoffs.find((u) => u);
  assert.equal(owner, "https://api.steel.dev/v1/sessions/sess-1-abcdef/player?interactive=true&showControls=false", "the owner's hand-back is Steel's live view");
  assert.ok(!store.handoffs.some((u) => u?.includes(KEY)));
  assert.ok(store.notes.includes("Placetta needs you for one step"));
  assert.equal(portal.submissions, 0);
  assert.equal(peak, 1, "the run was counted while its browser was open");
  assert.equal(runs.open, 0, "and not after");
  assert.equal(api.releases().length, 1, "the session was released when the run ended");
});

test("keep awake: only while a run or a view is open, with a public address, every 4 minutes at most", () => {
  const base = { open: 1, views: 0, publicUrl: "https://placetta-filer.onrender.com", last: 0, now: 10 * 60_000 };
  assert.equal(keepAwakeDue(base), true);
  assert.equal(keepAwakeDue({ ...base, open: 0 }), false, "idle: let the plan sleep");
  assert.equal(keepAwakeDue({ ...base, open: 0, views: 1 }), true);
  assert.equal(keepAwakeDue({ ...base, last: base.now - 60_000 }), false);
  assert.equal(keepAwakeDue({ ...base, publicUrl: null }), false);
  assert.equal(keepAwakeDue({ ...base, off: true }), false);
});

test("Steel refuses a session longer than the plan allows: the worker asks again for 15 minutes, then 5", async () => {
  const { openSteel } = await import("../src/browsers.ts");
  const asked: number[] = [];
  const fetch = (async (_url: string, init?: RequestInit) => {
    const ms = JSON.parse(String(init?.body ?? "{}")).timeout as number;
    asked.push(ms);
    return new Response(JSON.stringify({ error: `timeout ${ms} is over your plan's limit` }), { status: 400 });
  }) as typeof globalThis.fetch;
  await assert.rejects(openSteel({ env: { STEEL_API_KEY: KEY }, fetch } as never), (e: Error) => /^steel 400: .*limit/.test(e.message) && !e.message.includes(KEY));
  assert.deepEqual(asked, [30 * 60_000, 15 * 60_000, 5 * 60_000]);
});

// ---------------------------------------------------------------- recording a person (privacy.ts, CIPA)

const CA = { synthetic: false, strict: true, screen: false, teach: false };
const steelRun = async (o: { privacy: RecordingPolicy; env?: Record<string, string>; launch?: () => Promise<Browser> }) => {
  const api = await fresh();
  const portal = await startPortal({ captchaToken: true }); portals.push(portal);
  const store = new Mem(); store.privacy = o.privacy;
  const live = new LiveViews("https://filer.placetta.test");
  const d = deps(api, { BROWSER_PROVIDER: "steel", STEEL_API_KEY: KEY, ...(o.env ?? {}) });
  if (o.launch) d.launch = o.launch;
  const w = new Worker({ store, model: new Scripted(), portalOf: () => "127.0.0.1", startUrl: () => portal.url + "/", live, open: opener(d),
    dryRun: false, twoKey: 10, maxSteps: 80, maxMs: 120000, holdMs: 400, pollMs: 100, staffHoldMs: 300 });
  const r = await w.run(store.f);
  return { r, store, api, portal };
};

test("California, nobody opted in, Steel and nothing else: the recorded browser never goes to the owner", async () => {
  const { r, store, api, portal } = await steelRun({ privacy: CA });
  assert.equal(r?.kind, "handoff");
  assert.equal((r as { reason: string }).reason, "recording_consent");
  assert.match((r as { message: { en: string } }).message.en, /doesn't record anyone in California without their OK/);
  assert.ok(!store.handoffs.some((u) => u?.includes("steel")), "Steel's viewer was never handed out");
  assert.ok(!store.f.agent_log.some((e) => e.kind === "need_person"), "the owner wasn't asked into the page");
  assert.ok(store.f.agent_log.some((e) => e.kind === "privacy"), "the log says why");
  assert.equal(api.creates().length, 1, "Steel was the only browser there was");
  assert.equal(portal.submissions, 0);
});

test("California, nobody opted in, Browserbase keys set: the run opens on Browserbase with recording off, not Steel", async () => {
  const { r, store, api } = await steelRun({ privacy: CA, env: { BROWSERBASE_API_KEY: "bb_live_test_key_000000", BROWSERBASE_PROJECT_ID: "proj-1" } });
  const made = api.creates();
  assert.equal(made.length, 1);
  assert.equal(made[0].headers["x-bb-api-key"], "bb_live_test_key_000000", "Browserbase, not Steel");
  assert.equal((made[0].body as { browserSettings: { recordSession?: boolean } }).browserSettings.recordSession, false, "with recording off");
  assert.equal(r?.kind, "needs_you", "an unrecorded browser goes to the owner as before");
  assert.ok(store.f.agent_log.some((e) => e.kind === "need_person" && !e.en.includes("is recorded")), "with no recording notice: nothing records");
});

test("California, nobody opted in, local Chromium here: the run opens locally and the owner gets the worker's own view", async () => {
  const { r, store, api } = await steelRun({ privacy: CA, launch: () => chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_PATH ? ["--no-sandbox"] : [] }) });
  assert.equal(api.creates().length, 0, "no Steel session at all");
  assert.equal(r?.kind, "needs_you");
  assert.match(store.handoffs.find((u) => u) ?? "", /^https:\/\/filer\.placetta\.test\/live\//, "the worker's own live view");
});

test("California with everyone's opt-in, or outside California: Steel's viewer, with the notice before it opens", async () => {
  for (const privacy of [{ ...CA, screen: true }, { ...CA, strict: false }]) {
    const { r, store } = await steelRun({ privacy });
    assert.equal(r?.kind, "needs_you");
    assert.ok(store.handoffs.some((u) => u?.startsWith("https://api.steel.dev/")), "Steel's viewer");
    const asked = store.f.agent_log.find((e) => e.kind === "need_person");
    assert.ok(asked?.en.includes("This browser is recorded by Placetta's browser provider"), "the notice comes before the person opens it");
    assert.ok(asked?.zh.includes("录制"));
  }
});
