// npm test (needs a Chromium): a visible CAPTCHA goes to the Placetta team first, never to a solver. Staff get the
// worker's own live view of that one page, with the owner's lines covered and closed to their typing; once they solve
// it, Odelia carries on by herself and the owner never hears of it but in the log. Nobody taking it in time, the team's
// hours over, staff passing it on, or a page that also needs the owner, and it goes to the owner as before.
import { test, after } from "node:test";
import assert from "node:assert";
import type { Page } from "playwright-core";
import { openBrowser } from "../src/main.ts";
import { mustStop, staffHides, staffMay, type PageState } from "../src/guards.ts";
import { LiveViews, type LivePage } from "../src/live.ts";
import type { Model, StepInput, ToolCall } from "../src/model.ts";
import { staffGuard, tagHidden } from "../src/page.ts";
import { type Session, Worker } from "../src/run.ts";
import type { HumanCheck, Store } from "../src/store.ts";
import type { Filing, LogEntry, Skill } from "../src/types.ts";
import { startPortal, type Variant } from "./portal/server.ts";

const b = (s: string) => ({ en: s, zh: s });
const VALUES: [string, string][] = [["Legal name", "Acme Noodles LLC"], ["Business address", "1 Main St, San Jose, CA"], ["Owner name", "Li Wei"], ["Title", "Manager"], ["Activity", "Restaurant"]];
const filing = (): Filing => ({ id: "f1", workspace_id: "w", app_id: "llc", title: b("LLC"), status: "in_progress", channel: "portal", agent_state: "running", agent_log: [],
  handoff_url: null, submit_clicked_at: null, attempts: 1, confirmation_number: null,
  payload: { official: "test-llc", fields: VALUES.map(([l, v]) => ({ label: b(l), value: v })), attachments: [{ name: "articles.pdf", path: "w/articles.pdf" }] } });

type Check = { id: string; url: string; escalate_at: string; state: string; opened_at: string | null; closed?: string };
class Mem implements Store {
  f = filing(); skills = new Map<string, Skill>(); tasks: string[] = []; notes: string[] = []; states: string[] = [];
  checks: Check[] = []; escalateIn = 60_000; stopOnOpen = false;
  async claim() { return null; }
  async reload() { return this.f; }
  async step(_f: Filing, e: LogEntry | null, patch: Record<string, unknown> = {}) {
    if (e) this.f.agent_log = [...this.f.agent_log, e];
    for (const [k, v] of Object.entries(patch)) (this.f as unknown as Record<string, unknown>)[k] = v;
    if (typeof patch.agent_state === "string") this.states.push(patch.agent_state);
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
  async teamTask(_f: Filing | null, kind: string) { this.tasks.push(kind); }
  async notify(_f: Filing, title: { en: string }) { this.notes.push(title.en); }
  async humanCheckOpen(_f: Filing, url: string): Promise<HumanCheck> {
    const c: Check = { id: `hc${this.checks.length + 1}`, url, escalate_at: new Date(Date.now() + this.escalateIn).toISOString(), state: "waiting", opened_at: null };
    this.checks.push(c);
    if (this.stopOnOpen) this.f.status = "canceled";
    return { id: c.id, escalate_at: c.escalate_at };
  }
  async humanCheck(id: string) { const c = this.checks.find((x) => x.id === id); return c ? { state: c.state, opened_at: c.opened_at } : null; }
  async humanCheckClose(id: string, state: "solved" | "to_owner" | "ended") {
    const c = this.checks.find((x) => x.id === id);
    if (!c || c.closed) return false;
    c.closed = state; c.state = state;
    return true;
  }
}

/** A stand-in for Claude: fills each empty field from the approved values, then continues. */
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

const portals: { close(): Promise<void> }[] = [];
const portal = async (v: Variant = {}) => { const p = await startPortal(v); portals.push(p); return p; };
after(async () => { for (const p of portals) await p.close(); });
const until = async (f: () => boolean, ms = 15000) => { const t = Date.now() + ms; while (!f()) { if (Date.now() > t) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 50)); } };

/** A worker with the live view on (a public https address), whose browser the test also holds: the test is the person
 *  on the Placetta team. */
function worker(store: Mem, url: string, extra: Record<string, unknown> = {}) {
  const box: { page?: Page } = {};
  const live = new LiveViews("https://filer.placetta.test");
  const w = new Worker({ store, model: new Scripted(), portalOf: () => "127.0.0.1", startUrl: () => url + "/", live,
    open: async (): Promise<Session> => { const s = await openBrowser(); box.page = s.page; return s; },
    dryRun: false, twoKey: 10, maxSteps: 80, maxMs: 120000, holdMs: 300, pollMs: 100, staffHoldMs: 20000, ...extra });
  return { w, box, live };
}
const kinds = (s: Mem) => s.f.agent_log.filter((e) => e.kind === "team_check").map((e) => e.ref);

test("a visible CAPTCHA goes to the team, not the owner; staff solve it in the live view and Odelia files by herself", async () => {
  const p = await portal({ captchaToken: true }), store = new Mem();
  const { w, box, live } = worker(store, p.url);
  const run = w.run(store.f);
  await until(() => kinds(store).includes("waiting"));
  const c = store.checks[0];
  assert.match(c.url, /^https:\/\/filer\.placetta\.test\/live\/[A-Za-z0-9_-]{32}$/, "the worker's own view of the page, nothing else");
  assert.equal(store.f.agent_state, "running", "the owner isn't asked");
  assert.ok(!store.notes.includes("Placetta needs you for one step"));
  assert.match(String((store.f as unknown as { provider_ref?: string }).provider_ref), /^held-until:/, "the stuck-run sweep leaves the held browser alone");
  const path = new URL(c.url).pathname;
  const html = await live.handle("GET", path, "");
  assert.match(String(html.body), /Placetta team view/);
  const frame = await live.handle("GET", path + "/frame.jpg", "");
  assert.equal(frame.status, 200);
  assert.equal(frame.type, "image/jpeg");
  // staff open it (human_check_take writes the audit row), then solve it
  c.opened_at = new Date().toISOString();
  await until(() => kinds(store).includes("opened"));
  await box.page!.evaluate(() => { (document.querySelector('[name="g-recaptcha-response"]') as HTMLTextAreaElement).value = "solved-by-a-person"; });
  const r = await run;
  assert.equal(r?.kind, "submitted");
  assert.equal(p.submissions, 1);
  assert.equal(c.closed, "solved", "closed as solved: the owner's audit trail says Solved a human check for you");
  assert.deepEqual(kinds(store), ["waiting", "opened", "solved"]);
  assert.ok(!store.states.includes("needs_you"), "never handed to the owner");
  assert.ok(!store.notes.includes("Placetta needs you for one step"));
  assert.equal((await live.handle("GET", path, "")).status, 404, "the view ends with the step");
});

test("nobody on the team opens it in time: it goes to the owner, with one tap", async () => {
  const p = await portal({ captchaToken: true }), store = new Mem();
  store.escalateIn = 400;
  const r = await worker(store, p.url).w.run(store.f);
  assert.equal(r?.kind, "needs_you");
  assert.equal(store.checks[0].closed, "to_owner");
  assert.deepEqual(kinds(store), ["waiting", "to_owner"]);
  assert.ok(store.states.includes("needs_you"));
  assert.ok(store.notes.includes("Placetta needs you for one step"));
  assert.ok(store.f.agent_log.some((e) => e.kind === "need_person" && e.ref === "captcha"));
  assert.equal(p.submissions, 0);
});

test("outside the team's hours it goes to the owner at once", async () => {
  const p = await portal({ captchaToken: true }), store = new Mem();
  store.escalateIn = 0;
  const r = await worker(store, p.url).w.run(store.f);
  assert.equal(r?.kind, "needs_you");
  assert.deepEqual(kinds(store), ["to_owner"]);
  assert.match(store.f.agent_log.find((e) => e.kind === "team_check")!.en, /outside the Placetta team's hours/);
  assert.ok(store.f.agent_log.some((e) => e.kind === "need_person" && e.ref === "captcha"));
});

test("staff pass it on: the owner gets it", async () => {
  const p = await portal({ captchaToken: true }), store = new Mem();
  const run = worker(store, p.url).w.run(store.f);
  await until(() => store.checks.length === 1);
  store.checks[0].state = "to_owner";
  const r = await run;
  assert.equal(r?.kind, "needs_you");
  assert.ok(kinds(store).includes("to_owner"));
  assert.ok(store.states.includes("needs_you"));
});

test("a CAPTCHA on a page that also asks for the owner's SSN never goes to the team", async () => {
  const p = await portal({ captchaSsn: true }), store = new Mem();
  const r = await worker(store, p.url).w.run(store.f);
  assert.equal(r?.kind, "needs_you");
  assert.equal(store.checks.length, 0);
  assert.ok(store.states.includes("needs_you"));
});

test("the owner stops the filing while the team has it: the check ends, nothing is sent", async () => {
  const p = await portal({ captchaToken: true }), store = new Mem();
  store.stopOnOpen = true;
  const r = await worker(store, p.url).w.run(store.f);
  assert.equal(r?.kind, "stopped");
  assert.equal(store.checks[0].closed, "ended");
  assert.equal(p.submissions, 0);
});

test("the team's view covers the owner's lines and won't let staff type in them", async () => {
  const s = await openBrowser();
  try {
    await s.page.setContent(`<form>
      <label for="u">Username</label><input id="u" value="acme.owner">
      <label for="pw">Password</label><input id="pw" type="password" value="s3cret">
      <label for="ssn">Owner SSN</label><input id="ssn" value="123-45-6789">
      <label for="acct">Bank account number</label><input id="acct" value="000123456789">
      <input name="contact_email" value="li@acme.test">
      <label for="name">Legal name</label><input id="name" value="Acme Noodles LLC">
      <label for="cap">Type the characters in the image</label><input id="cap">
    </form>`);
    await tagHidden(s.page);
    const hidden = await s.page.evaluate(() => Array.from(document.querySelectorAll("[data-placetta-hidden]")).map((e) => e.id || e.getAttribute("name")));
    assert.deepEqual(hidden, ["u", "pw", "ssn", "acct", "contact_email"]);
    const g = staffGuard(s.page);
    const img = await g.shot();
    assert.ok(img.length > 100 && img[0] === 0xff && img[1] === 0xd8, "a JPEG");
    const views = new LiveViews("https://filer.placetta.test");
    const v = views.open(s.page as unknown as LivePage, 60_000, g)!;
    const path = new URL(v.url).pathname;
    await s.page.focus("#ssn");
    assert.equal(await g.typingBlocked(), true);
    const typed = await views.handle("POST", path + "/act", JSON.stringify({ kind: "type", text: "999" }));
    assert.equal(typed.status, 403);
    assert.equal((await views.handle("POST", path + "/act", JSON.stringify({ kind: "key", key: "Backspace" }))).status, 403);
    assert.equal(await s.page.inputValue("#ssn"), "123-45-6789", "the owner's line is untouched");
    assert.equal((await views.handle("POST", path + "/act", JSON.stringify({ kind: "key", key: "Tab" }))).status, 200, "staff can move off it");
    await s.page.focus("#cap");
    assert.equal(await g.typingBlocked(), false);
    assert.equal((await views.handle("POST", path + "/act", JSON.stringify({ kind: "type", text: "x7Kq" }))).status, 200);
    assert.equal(await s.page.inputValue("#cap"), "x7Kq", "the CAPTCHA's own box is theirs");
    // a view that can't cover the page shows nothing rather than the page uncovered
    const broken = views.open(s.page as unknown as LivePage, 60_000, { shot: async () => { throw new Error("no"); }, typingBlocked: async () => true })!;
    assert.equal((await views.handle("GET", new URL(broken.url).pathname + "/frame.jpg", "")).status, 503);
  } finally { await s.close(); }
});

const page = (o: Partial<PageState> = {}): PageState => ({ url: "https://x.gov/a", title: "", headings: [], controls: [], buttons: [], links: [], text: "", frames: [], markers: [], ...o });
const control = (o: Partial<PageState["controls"][number]>) => ({ selector: "#x", tag: "input", type: "text", label: "", name: "", id: "", autocomplete: "", value: "", ...o });

test("staffMay: only a page whose one need for a person is the CAPTCHA", () => {
  const cap = { markers: ["g-recaptcha"] };
  assert.equal(staffMay(page(cap)), true);
  assert.equal(staffMay(page({ frames: ["https://www.google.com/recaptcha/api2/anchor?size=normal"] })), true);
  assert.equal(staffMay(page({ ...cap, controls: [control({ label: "Owner SSN" })] })), false, "an SSN line");
  assert.equal(staffMay(page({ ...cap, controls: [control({ label: "Card number", autocomplete: "cc-number" })] })), false, "the fee");
  assert.equal(staffMay(page({ ...cap, controls: [control({ label: "Enter the code we sent", autocomplete: "one-time-code" })] })), false, "a code sent to the owner");
  assert.equal(staffMay(page({ ...cap, controls: [control({ label: "Signature of applicant" })] })), false, "a signature");
  assert.equal(staffMay(page({ ...cap, url: "https://secure.login.gov/" })), false, "an ID check");
  assert.equal(staffMay(page({ ...cap, controls: [control({ type: "password" }), control({ type: "password", label: "Confirm password" })] })), false, "a new account");
  assert.equal(staffMay(page({ controls: [control({ label: "Owner SSN" })] })), false, "no CAPTCHA at all");
  assert.equal(staffMay(page({ frames: ["https://www.google.com/recaptcha/enterprise/anchor?ar=1&size=invisible"] })), false, "an invisible check isn't a stop");
  assert.equal(mustStop(page({ ...cap, controls: [control({ type: "password", label: "Password" })] }))?.reason, "captcha");
  assert.equal(staffMay(page({ ...cap, controls: [control({ type: "password", label: "Password" })] })), true, "a sign-in page: the saved login is covered in the view");
});

test("staffHides: IDs, cards, accounts and the saved login are covered; the form's own lines and the CAPTCHA box aren't", () => {
  const f = (o: Partial<Parameters<typeof staffHides>[0]>) => staffHides({ type: "text", label: "", name: "", id: "", autocomplete: "", ...o });
  for (const label of ["Owner SSN", "Social Security Number", "ITIN", "Federal EIN", "Passport number", "Bank account number", "Routing number", "Card number", "CVV", "Expiration", "User name", "User ID", "Email address", "PIN", "Date of birth"]) assert.equal(f({ label }), true, label);
  assert.equal(f({ type: "password" }), true);
  assert.equal(f({ autocomplete: "username" }), true);
  assert.equal(f({ autocomplete: "cc-exp" }), true);
  assert.equal(f({ name: "user_name" }), true);
  assert.equal(f({ name: "contact-email" }), true);
  for (const label of ["Legal name", "Business address", "Type the characters in the image", "Activity", "Title"]) assert.equal(f({ label }), false, label);
});
