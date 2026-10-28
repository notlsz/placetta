// npm test: the business's signed-in session on a portal (session.ts). What must hold:
//   - after a run signs in with the saved login, the portal's own cookies (its hosts only) are kept, keyed to the
//     workspace and the host; the next run for the same workspace and portal starts signed in, with no password typed
//   - another workspace, or another host, never gets it; a stored state carrying another site's cookies is refused
//   - the state is never in the model's prompt, the filing's log or the trace
//   - it ends with the portal's own session or 30 days; a logout replaces it, a sign-in failure drops it
import { test, after } from "node:test";
import assert from "node:assert";
import { openBrowser } from "../src/main.ts";
import type { Model, StepInput, ToolCall } from "../src/model.ts";
import { Worker } from "../src/run.ts";
import type { Store } from "../src/store.ts";
import type { Filing, LogEntry, Skill } from "../src/types.ts";
import { assertOnly, expiresAt, MAX_DAYS, restore, scope, SESSION_ONLY_MS, type PortalState } from "../src/session.ts";
import { startPortal, type Portal } from "./portal/server.ts";

const b = (s: string) => ({ en: s, zh: s });
const VALUES: [string, string][] = [["Legal name", "Acme Noodles LLC"], ["Business address", "1 Main St, San Jose, CA"], ["Owner name", "Li Wei"], ["Title", "Manager"], ["Activity", "Restaurant"]];
const filing = (ws = "w1"): Filing => ({ id: `f-${ws}`, workspace_id: ws, app_id: "llc", title: b("LLC"), status: "in_progress", channel: "portal", agent_state: "running", agent_log: [],
  handoff_url: null, submit_clicked_at: null, attempts: 1, confirmation_number: null,
  payload: { official: "test-llc", fields: VALUES.map(([l, v]) => ({ label: b(l), value: v })), attachments: [{ name: "articles.pdf", path: "w/articles.pdf" }] } });

/** The vault as the SQL functions keep it: one state per workspace and host, never read across workspaces. */
class Vault {
  rows = new Map<string, { state: string; expires: number }>();
  drops: string[] = [];
  now = () => Date.now();
}
class Mem implements Store {
  f: Filing; vault: Vault; password = "s3cret";
  constructor(vault: Vault, ws = "w1") { this.vault = vault; this.f = filing(ws); }
  async claim() { return null; }
  async reload() { return this.f; }
  async step(_f: Filing, e: LogEntry | null, patch: Record<string, unknown> = {}) {
    if (e) this.f.agent_log = [...this.f.agent_log, e];
    for (const [k, v] of Object.entries(patch)) (this.f as unknown as Record<string, unknown>)[k] = v;
    return { ...this.f };
  }
  async login() { return { username: "demo", password: this.password, host: "127.0.0.1" }; }
  async skill() { return null; }
  async saveSkill(_s: Skill) {}
  async skillFailed() { return { disabled: false }; }
  async selfFiled() { return 99; }
  async download() { return new TextEncoder().encode("%PDF-1.4 test"); }
  async saveDoc(_f: Filing, name: string) { return `w/receipts/${name}`; }
  async saveProof(_f: Filing, name: string) { return `w/proof/${name}`; }
  async teamTask() {}
  async notify() {}
  // the same keying as filer_session_get/put/drop: the filing's own workspace plus the host
  async sessionGet(f: Filing, host: string) {
    const r = this.vault.rows.get(`${f.workspace_id}|${host}`);
    return r && r.expires > this.vault.now() ? JSON.parse(r.state) as PortalState : null;
  }
  async sessionPut(f: Filing, host: string, state: PortalState, expires: Date) { this.vault.rows.set(`${f.workspace_id}|${host}`, { state: JSON.stringify(state), expires: expires.getTime() }); }
  async sessionDrop(f: Filing, host: string, reason: string) { this.vault.rows.delete(`${f.workspace_id}|${host}`); this.vault.drops.push(reason); }
}

/** Fills each page from the approved values, signs in when asked, and keeps every prompt it was given. */
class Scripted implements Model {
  calls = 0; seen: string[] = [];
  async next(i: StepInput): Promise<ToolCall> {
    this.calls++; this.seen.push(JSON.stringify(i));
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
const portals: Portal[] = [];
after(async () => { for (const p of portals) await p.close(); });
const run = (store: Mem, model: Model, p: Portal) => new Worker({ store, model, open: openBrowser, portalOf: () => "127.0.0.1", startUrl: () => p.url + "/",
  dryRun: false, twoKey: 10, maxSteps: 80, maxMs: 120000, holdMs: 300, pollMs: 100 }).run(store.f);
const typedPassword = (m: Scripted) => m.seen.some((s) => /"type":"password"/.test(s) && /Sign in/.test(s));

test("scope: only the run's hosts; expiry: the portal's own session or 30 days, two hours for session cookies only", () => {
  const c = (domain: string, expires = -1) => ({ name: "sid", value: "v", domain, path: "/", expires, httpOnly: true, secure: true, sameSite: "Lax" as const });
  const s = scope({ cookies: [c("portal.gov"), c(".app.portal.gov"), c("idp.example.com"), c("google.com")],
    origins: [{ origin: "https://portal.gov", localStorage: [{ name: "a", value: "1" }] }, { origin: "https://evil.example", localStorage: [] }, { origin: "http://portal.gov", localStorage: [] }] }, ["portal.gov"]);
  assert.deepEqual(s.cookies.map((x) => x.domain), ["portal.gov", ".app.portal.gov"]);
  assert.deepEqual(s.origins.map((o) => o.origin), ["https://portal.gov"], "https only, the portal's own origin only");
  const now = Date.parse("2026-11-01T00:00:00Z");
  assert.equal(expiresAt({ cookies: [c("portal.gov")], origins: [] }, now).getTime(), now + SESSION_ONLY_MS);
  assert.equal(expiresAt({ cookies: [c("portal.gov", now / 1000 + 3600)], origins: [] }, now).getTime(), now + 3600_000);
  assert.equal(expiresAt({ cookies: [c("portal.gov", now / 1000 + 90 * 86400)], origins: [] }, now).getTime(), now + MAX_DAYS * 86_400_000);
});

test("signed in once, the next run for the same workspace and portal starts signed in: no password typed, nothing in a log or a prompt", async () => {
  const p = await startPortal({ cookieAuth: true }); portals.push(p);
  const vault = new Vault();
  const s1 = new Mem(vault), m1 = new Scripted();
  assert.equal((await run(s1, m1, p))?.kind, "submitted");
  assert.equal(p.signIns, 1);
  assert.ok(typedPassword(m1));
  const kept = vault.rows.get("w1|127.0.0.1");
  assert.ok(kept, "kept for this workspace and host");
  const sid = (JSON.parse(kept!.state) as PortalState).cookies.find((c) => c.name === "sid")!.value;
  assert.ok(sid && p.sids!.has(sid));
  const s2 = new Mem(vault), m2 = new Scripted();
  assert.equal((await run(s2, m2, p))?.kind, "submitted");
  assert.equal(p.signIns, 1, "the second run never signed in");
  assert.ok(!typedPassword(m2), "no password typed");
  assert.ok(s2.f.agent_log.some((e) => /signed-in session/.test(e.en)), "the log says the session was reused");
  for (const text of [JSON.stringify(s1.f.agent_log), JSON.stringify(s2.f.agent_log), ...m1.seen, ...m2.seen]) assert.ok(!text.includes(sid), "the session's value is in no log and no prompt");
  assert.equal(p.submissions, 2);
});

test("another workspace never gets it, and a stored state with another site's cookies is refused before any page", async () => {
  const p = await startPortal({ cookieAuth: true }); portals.push(p);
  const vault = new Vault();
  await run(new Mem(vault, "w1"), new Scripted(), p);
  const other = new Mem(vault, "w2"), m = new Scripted();
  assert.equal((await run(other, m, p))?.kind, "submitted");
  assert.equal(p.signIns, 2, "workspace w2 signed in with its own login");
  assert.ok(typedPassword(m));
  assert.ok(vault.rows.has("w2|127.0.0.1") && vault.rows.has("w1|127.0.0.1"), "each workspace has its own");
  // a state that names another site: restore keeps only the run's hosts, and the check after it refuses anything else
  const s = await openBrowser();
  try {
    const n = await restore(s.page.context(), { cookies: [{ name: "x", value: "y", domain: "evil.example", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] }, ["127.0.0.1"]);
    assert.equal(n, 0, "nothing of another host goes in");
    await s.page.context().addCookies([{ name: "x", value: "y", domain: "evil.example", path: "/" }]);
    await assert.rejects(assertOnly(s.page.context(), ["127.0.0.1"]), /another site's state/);
  } finally { await s.close(); }
});

test("the agency logged it out: the run signs in as before and replaces it; it expires; a sign-in failure drops it", async () => {
  const p = await startPortal({ cookieAuth: true }); portals.push(p);
  const vault = new Vault();
  await run(new Mem(vault), new Scripted(), p);
  const first = vault.rows.get("w1|127.0.0.1")!.state;
  p.logout!();
  const m = new Scripted(), s = new Mem(vault);
  assert.equal((await run(s, m, p))?.kind, "submitted");
  assert.ok(typedPassword(m), "signed in again");
  assert.deepEqual(vault.drops, ["logged_out"]);
  assert.notEqual(vault.rows.get("w1|127.0.0.1")!.state, first, "replaced with the new session");
  // past its expiry it isn't used
  vault.now = () => Date.now() + 31 * 86_400_000;
  assert.equal(await s.sessionGet(s.f, "127.0.0.1"), null);
  vault.now = () => Date.now();
  // a sign-in the agency refuses (the password was changed): dropped
  p.logout!();
  const bad = new Mem(vault); bad.password = "wrong";
  await run(bad, new Scripted(), p).catch(() => null);
  assert.ok(!vault.rows.has("w1|127.0.0.1"), "dropped");
  assert.ok(vault.drops.includes("sign_in_failed"), "a refused sign-in is a security event");
});
