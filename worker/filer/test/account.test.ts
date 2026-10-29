// "Odelia gets the login" (src/account.ts, run.ts makeAccount): the worker makes the business's own account on a
// portal with no saved login, verifies it from the business's inbox at Placetta, saves the login and files signed in.
// npm test (needs a Chromium, like filer.test.ts).
import { test, after } from "node:test";
import assert from "node:assert";
import { openBrowser } from "../src/main.ts";
import { type Model, prompt, type StepInput, type ToolCall } from "../src/model.ts";
import { type Route, Worker } from "../src/run.ts";
import { type AccountSetup, type Store, waitForMail } from "../src/store.ts";
import type { Filing, LogEntry, Login, Skill } from "../src/types.ts";
import { accountPage, codeControl, emailControl, newPassword, phoneCodeMsg, profileValue, termsControl } from "../src/account.ts";
import { codeInText, codesIn, fromAgency, inboxAddress, type InboxMail, inboxTokenOf, linksIn, pickVerification } from "../../../supabase/functions/_shared/agent_inbox.ts";
import { accountOf, accountProblems, PORTAL_ACCOUNTS } from "../../../supabase/functions/file/accounts.ts";
import { DEST } from "../../../supabase/functions/file/destinations.ts";
import { mustStop, type PageState } from "../src/guards.ts";
import { startPortal, type Variant } from "./portal/server.ts";

const b = (s: string) => ({ en: s, zh: s });
const VALUES: [string, string][] = [["Legal name", "Acme Noodles LLC"], ["Business address", "1 Main St, San Jose, CA"], ["Owner name", "Li Wei"], ["Title", "Manager"], ["Activity", "Restaurant"]];
const filing = (extra: [string, string][] = []): Filing => ({ id: "f1", workspace_id: "w", app_id: "llc", title: b("LLC"), status: "in_progress", channel: "portal", agent_state: "running", agent_log: [],
  handoff_url: null, submit_clicked_at: null, attempts: 1, confirmation_number: null,
  payload: { official: "test-llc", fields: [...VALUES, ...extra].map(([l, v]) => ({ label: b(l), value: v })), attachments: [{ name: "articles.pdf", path: "w/articles.pdf" }] } });

/** The store, in memory, with the account functions of 20261105090000_agent_accounts.sql. */
class Mem implements Store {
  f: Filing; tasks: string[] = []; notes: unknown[] = []; inbox: InboxMail[] = []; terms: { url: string; heading: string; label: string }[] = [];
  saved: { url: string; username: string; password: string; status: "pending" | "saved" } | null = null; states: string[] = []; begun = 0;
  coverTerms = true; authority = true; onNotify?: () => void;
  constructor(f = filing()) { this.f = f; }
  async claim() { return null; }
  async reload() { return this.f; }
  async step(_f: Filing, e: LogEntry | null, patch: Record<string, unknown> = {}) {
    if (e) this.f.agent_log = [...this.f.agent_log, e];
    for (const [k, v] of Object.entries(patch)) if (!(k === "submit_clicked_at" && this.f.submit_clicked_at)) (this.f as unknown as Record<string, unknown>)[k] = v;
    return { ...this.f };
  }
  async login(): Promise<Login | null> { return this.saved ? { username: this.saved.username, password: this.saved.password, host: "127.0.0.1" } : null; }
  async skill(): Promise<Skill | null> { return null; }
  async saveSkill() {}
  async skillFailed() { return { disabled: false }; }
  async selfFiled() { return 99; }
  async download() { return new TextEncoder().encode("%PDF-1.4 test"); }
  async saveDoc(_f: Filing, name: string) { return `w/receipts/${name}`; }
  async saveProof(_f: Filing, name: string) { return `w/proof/${name}`; }
  async teamTask(_f: Filing | null, kind: string, title: string, detail?: unknown) { this.tasks.push(kind); this.notes.push(title, detail); }
  async notify(_f: Filing, t: unknown, body: unknown) { this.notes.push(t, body); this.onNotify?.(); }
  async accountBegin(_f: Filing, host: string): Promise<AccountSetup> {
    if (!this.authority) throw new Error("account begin failed: account_authority");
    this.begun++;
    return { id: "acct-1", email: inboxAddress("k7qx9abc", "odelia@in.placetta.com"), login: null, state: "creating", ...(host ? {} : {}) };
  }
  async saveLogin(_f: Filing, _setup: string, url: string, username: string, password: string) { this.saved = { url, username, password, status: "pending" }; return "login-1"; }
  async acceptTerms(_f: Filing, _setup: string, url: string, heading: string, label: string) {
    if (!this.coverTerms) throw new Error("terms failed: terms_not_covered");
    this.terms.push({ url, heading, label });
  }
  async accountState(_f: Filing, _setup: string, state: string) {
    this.states.push(state);
    if ((state === "failed" || state === "handed_back") && this.saved?.status === "pending") this.saved = null;
  }
  async accountSaved() { this.states.push("saved"); if (this.saved) this.saved.status = "saved"; }
  async waitForMail(_f: Filing, w: Parameters<NonNullable<Store["waitForMail"]>>[1], o: Parameters<NonNullable<Store["waitForMail"]>>[2]) {
    return await waitForMail(async () => this.inbox.filter((m) => !(m as InboxMail & { used?: boolean }).used), async (id) => { const m = this.inbox.find((x) => x.id === id) as InboxMail & { used?: boolean }; if (m) m.used = true; }, w, o);
  }
  /** What the site emails lands in the business's inbox. */
  mail = (m: { from: string; subject: string; links: string[]; codes: string[] }) => {
    this.inbox.push({ id: this.inbox.length + 1, source: "email", from_addr: m.from, from_host: m.from.split("@")[1], subject: m.subject, links: m.links, codes: m.codes, verified: false, received_at: new Date().toISOString() });
  };
}

/** A stand-in for Claude that makes the account the way the account note says, then files like filer.test.ts's. */
class AccountModel implements Model {
  calls = 0; prompts: string[] = []; inputs: StepInput[] = []; verified = false; first: ToolCall[] = [];
  async next(i: StepInput): Promise<ToolCall> {
    this.calls++; this.inputs.push(i); this.prompts.push(prompt(i));
    if (this.first.length) return this.first.shift()!;
    const s = i.state, p = i.filing.payload;
    const m = /Confirmation number: (\S+)/.exec(s.text);
    if (m) return { name: "done", input: { confirmation_number: m[1], summary: "Filed" } };
    if (i.account) {
      if (s.title === "Check your email") return { name: "account", input: { status: "verify" } };
      if (s.title === "Business") return { name: "account", input: { status: "created" } };
      if (s.title === "Account verified") { this.verified = true; return { name: "click", input: { selector: "link:Sign in" } }; }
      if (s.title === "Sign in" && !this.verified) return { name: "click", input: { selector: "link:Create an account" } };
    }
    for (const c of s.controls) {
      if (i.account && c.type === "email" && !c.value) return { name: "fill_login", input: { selector: c.selector, which: "username" } };
      if (c.type === "password" && !c.value) return { name: "fill_login", input: { selector: c.selector, which: "password" } };
      if (c.label === "Username" && !c.value) return { name: "fill_login", input: { selector: c.selector, which: "username" } };
      if (c.type === "checkbox" && !c.checked) return { name: "check", input: { selector: c.selector, on: true } };
      if (c.type === "file" && !i.recent.some((r) => r.startsWith("upload"))) return { name: "upload", input: { selector: c.selector, attachment: "articles.pdf" } };
      const v = p.fields?.find((f) => f.label.en === c.label)?.value;
      if (v && c.value !== v) return c.tag === "select" ? { name: "select", input: { selector: c.selector, option: v } } : { name: "fill", input: { selector: c.selector, value: v } };
    }
    return { name: "click", input: { selector: s.buttons[0]?.selector ?? s.links[0].selector } };
  }
}

const business: Route = { account: "business" };
const worker = (store: Mem, model: Model, url: string, extra: Record<string, unknown> = {}) => new Worker({ store, model, open: openBrowser, portalOf: () => "127.0.0.1", startUrl: () => url + "/",
  routeOf: () => business, dryRun: false, twoKey: 10, maxSteps: 120, maxMs: 120000, holdMs: 400, pollMs: 50, accountMailMs: 3000, ...extra });
const portals: { close(): Promise<void> }[] = [];
const portal = async (v: Variant = {}) => { const p = await startPortal(v); portals.push(p); return p; };
after(async () => { for (const p of portals) await p.close(); });

/** Everything the run wrote or said, and everything the model was shown. */
function spyConsole() {
  const out: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  for (const k of ["log", "warn", "error"] as const) console[k] = (...a: unknown[]) => { out.push(a.map(String).join(" ")); };
  return { out, restore: () => Object.assign(console, orig) };
}

test("no saved login: Odelia makes the business's account, verifies it by the emailed link, saves the login and files signed in", async () => {
  const store = new Mem();
  const p = await portal({ register: "link", onMail: (m) => store.mail(m) });
  const model = new AccountModel(), spy = spyConsole();
  let r;
  try { r = await worker(store, model, p.url).run(store.f); } finally { spy.restore(); }
  assert.equal(r?.kind, "submitted", JSON.stringify(store.f.agent_log.slice(-3)));
  assert.equal(store.f.confirmation_number, "CA-10001");
  // the account: the business's inbox as its email, the business's legal name, a new strong password, verified
  assert.equal(p.account?.email, "odelia+k7qx9abc@in.placetta.com");
  assert.equal(p.account?.name, "Acme Noodles LLC");
  assert.ok(p.account?.verified);
  const pw = store.saved!.password;
  assert.equal(p.account?.pw, pw, "the site has the password the vault has");
  assert.equal(store.saved?.status, "saved");
  assert.equal(store.saved?.username, "odelia+k7qx9abc@in.placetta.com");
  assert.ok(/^https:\/\/127\.0\.0\.1\//.test(store.saved!.url), "saved for this destination's host");
  assert.ok(pw.length >= 20 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[!#%+\-=?@_]/.test(pw));
  // the terms, accepted for the business: which page and its box
  assert.equal(store.terms.length, 1);
  assert.match(store.terms[0].url, /\/register$/);
  assert.equal(store.terms[0].heading, "Create an account");
  assert.match(store.terms[0].label, /Terms of Use/);
  assert.deepEqual(store.states.filter((s) => s !== "awaiting_email"), ["saved"]);
  assert.ok(store.inbox.every((m) => (m as InboxMail & { used?: boolean }).used), "the verification email is marked used");
  // the password: never in the log, the model's prompts, the team's tasks, the owner's notices or the console
  const seen = JSON.stringify({ log: store.f.agent_log, notes: store.notes, prompts: model.prompts, inputs: model.inputs, console: spy.out });
  assert.ok(!seen.includes(pw), "the password never leaves the vault and the browser");
  assert.ok(model.prompts.some((x) => x.includes("making the business's own account")), "the model was told it's making the account");
  assert.ok(store.f.agent_log.some((e) => e.kind === "account_saved"));
  assert.ok(store.f.agent_log.some((e) => e.kind === "terms"));
  assert.ok(!store.f.agent_log.some((e) => e.kind === "need_person"), "nothing went to the owner");
});

test("the agency emails a code instead of a link: the worker types it from the inbox, the model never handles it", async () => {
  const store = new Mem();
  const p = await portal({ register: "code", onMail: (m) => store.mail(m) });
  const model = new AccountModel();
  const r = await worker(store, model, p.url).run(store.f);
  assert.equal(r?.kind, "submitted", JSON.stringify(store.f.agent_log.slice(-3)));
  assert.ok(p.account?.verified);
  assert.ok(store.f.agent_log.some((e) => /Entered the code the agency emailed/.test(e.en)));
  assert.ok(!model.prompts.some((x) => x.includes("482913") && !x.includes("now: 482913")), "the code reaches the model only as what's already in the box");
  assert.ok(!store.f.agent_log.some((e) => e.kind === "need_person"));
});

test("a code texted to the owner's phone: one tap to forward it to Odelia, who types it and carries on", async () => {
  const store = new Mem();
  const p = await portal({ register: "phone", onMail: (m) => store.mail(m) });
  // the owner forwards the agency's text to Odelia (odelia-sms agent_inbox_owner_code)
  store.onNotify = () => { store.inbox.push({ id: 99, source: "owner_sms", from_addr: "owner", from_host: "", subject: "Code the owner texted", links: [], codes: [codeInText("City of Test: your code is 482913")!], verified: true, received_at: new Date().toISOString() }); };
  const r = await worker(store, new AccountModel(), p.url, { odeliaNumber: "+14155550134", holdMs: 5000 }).run(store.f);
  assert.equal(r?.kind, "submitted", JSON.stringify(store.f.agent_log.slice(-4)));
  assert.ok(p.account?.verified);
  const asked = store.f.agent_log.find((e) => e.kind === "need_person" && e.ref === "code");
  assert.ok(asked && asked.en.includes("+14155550134") && /Forward that text to Odelia/.test(asked.en), "the owner is asked for one tap, with Odelia's number");
  assert.ok(store.states.includes("awaiting_code"));
  assert.ok(store.f.agent_log.some((e) => /Entered the code you texted Odelia/.test(e.en)));
});

test("terms the agent authority doesn't cover are never ticked: the box goes to the owner, and an unsent account's login is dropped", async () => {
  const store = new Mem(); store.coverTerms = false;
  const p = await portal({ register: "link", onMail: (m) => store.mail(m) });
  const r = await worker(store, new AccountModel(), p.url).run(store.f);
  assert.equal(r?.kind, "needs_you");
  assert.equal(store.terms.length, 0);
  assert.equal(p.account, undefined, "nothing was registered");
  assert.ok(store.f.agent_log.some((e) => e.kind === "refused" && /terms/.test(e.en)));
  assert.ok(store.f.agent_log.some((e) => e.kind === "need_person" && e.ref === "terms"));
  assert.equal(store.saved, null, "the pending login is dropped with the account");
});

test("account guards: the email is only the business's inbox, values come from the profile, and nothing but the account is sent", async () => {
  const store = new Mem(filing([["Business email", "owner@acme.test"], ["Notes for the inspector", "Back door code 1234"]]));
  const p = await portal({ register: "link", onMail: (m) => store.mail(m) });
  const model = new AccountModel();
  model.first = [
    { name: "click", input: { selector: "link:Create an account" } },
    { name: "fill", input: { selector: "label:Email", value: "owner@acme.test" } },
    { name: "fill", input: { selector: "label:Legal name", value: "Back door code 1234" } },
    { name: "account", input: { status: "created" } },
  ];
  await worker(store, model, p.url, { maxSteps: 6 }).run(store.f);
  const refused = store.f.agent_log.filter((e) => e.kind === "refused").map((e) => e.en);
  assert.ok(refused.some((e) => /email other than the business's inbox/.test(e)), "the owner's own email isn't typed into the account");
  assert.ok(refused.some((e) => /didn't approve/.test(e)), "a value outside the business profile isn't typed");
  assert.ok(!store.states.includes("saved"), "the model's word alone doesn't save a login");
  assert.equal(p.account, undefined);
});

test("an ID.me or Login.gov site stays with the owner: handed back in plain words, with no account and no login", async () => {
  const store = new Mem();
  const p = await portal({ register: "link" });
  const r = await worker(store, new AccountModel(), p.url, { routeOf: () => ({ account: "individual" }) }).run(store.f);
  assert.equal(r?.kind, "handoff");
  assert.ok(r && r.kind === "handoff" && r.reason === "account_identity" && /ID\.me or Login\.gov/.test(r.message.en) && /only you can make/.test(r.message.en));
  assert.equal(store.begun, 0);
  assert.equal(store.saved, null);
  assert.ok(store.f.agent_log.some((e) => e.kind === "handoff" && e.ref === "account_identity"));
});

test("a sign-up that turns out to be ID.me hands back to the owner and tells the team to fix the site's row", async () => {
  const store = new Mem();
  const p = await portal({ register: "link", idme: true, onMail: (m) => store.mail(m) });
  const r = await worker(store, new AccountModel(), p.url).run(store.f);
  assert.ok(r && r.kind === "handoff" && r.reason === "account_identity", JSON.stringify(r));
  assert.ok(store.tasks.includes("account"));
  assert.equal(p.account, undefined);
  assert.equal(store.saved, null, "the pending login is dropped");
});

test("a site nobody has checked goes to the team, and so does an account the agent authority doesn't cover", async () => {
  const s1 = new Mem(), p = await portal({ register: "link" });
  const r1 = await worker(s1, new AccountModel(), p.url, { routeOf: () => ({}) }).run(s1.f);
  assert.ok(r1 && r1.kind === "handoff" && r1.reason === "account_unknown");
  assert.ok(s1.tasks.includes("account"));
  assert.equal(s1.begun, 0);
  const s2 = new Mem(); s2.authority = false;
  const r2 = await worker(s2, new AccountModel(), p.url).run(s2.f);
  assert.ok(r2 && r2.kind === "handoff" && r2.reason === "account_authority");
  assert.equal(s2.saved, null);
});

test("a CAPTCHA on the sign-up goes to a person as always, never solved", async () => {
  const store = new Mem();
  const p = await portal({ register: "link", registerCaptcha: true, onMail: (m) => store.mail(m) });
  const r = await worker(store, new AccountModel(), p.url).run(store.f);
  assert.equal(r?.kind, "needs_you");
  assert.ok(store.f.agent_log.some((e) => e.kind === "need_person" && e.ref === "captcha"));
  assert.equal(p.account, undefined);
});

// ---------------------------------------------------------------- pure pieces

test("passwords: 20 characters, every kind, never the same twice", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const pw = newPassword();
    assert.equal(pw.length, 20);
    assert.ok(/[A-Z].*[A-Z]/.test(pw) || pw.replace(/[^A-Z]/g, "").length >= 2);
    assert.ok(pw.replace(/[^a-z]/g, "").length >= 2 && pw.replace(/[^0-9]/g, "").length >= 2 && pw.replace(/[^!#%+\-=?@_]/g, "").length >= 2);
    seen.add(pw);
  }
  assert.equal(seen.size, 200);
  assert.throws(() => newPassword(8));
});

test("account guards, as pure functions", () => {
  const c = (label: string, type = "text", extra = {}) => ({ selector: `label:${label}`, tag: "input", type, label, name: "", id: "", autocomplete: "", value: "", ...extra });
  assert.ok(termsControl(c("I agree to the Terms of Use", "checkbox")));
  assert.ok(!termsControl(c("Send me updates", "checkbox")));
  assert.ok(!termsControl(c("Terms", "text")));
  assert.ok(emailControl(c("Email", "email")) && emailControl(c("Confirm e-mail address")) && emailControl(c("User ID")));
  assert.ok(!emailControl(c("Legal name")));
  assert.ok(codeControl(c("Verification code")) && !codeControl(c("ZIP code")));
  const p = filing([["Business email", "owner@acme.test"], ["Owner SSN", "123-45-6789"], ["Notes", "free text"]]).payload;
  assert.deepEqual(profileValue("Acme Noodles LLC", p), { label: "Legal name" });
  assert.equal(profileValue("owner@acme.test", p), null, "an email is never a profile value for the account");
  assert.equal(profileValue("123-45-6789", p), null, "an SSN is never typed");
  assert.equal(profileValue("free text", p), null);
  assert.equal(profileValue("Not approved at all", p), null);
  const st = (title: string, controls: PageState["controls"] = []): PageState => ({ url: "https://x.gov/", title, headings: [title], controls, buttons: [], links: [], text: "", frames: [], markers: [] });
  assert.ok(accountPage(st("Create an account")) && accountPage(st("Verify your email")) && !accountPage(st("Business information")));
  assert.equal(mustStop({ ...st("Sign up"), frames: ["https://api.id.me/en/registration/new"] })?.reason, "identity");
  assert.match(phoneCodeMsg("+14155550134").en, /Forward that text to Odelia at \+14155550134/);
  assert.ok(!/Forward/.test(phoneCodeMsg().en));
});

test("inbox: the address, the token back from it, and only the agency's own verification", () => {
  const addr = inboxAddress("k7qx9abc", "odelia@in.placetta.com");
  assert.equal(addr, "odelia+k7qx9abc@in.placetta.com");
  assert.equal(inboxTokenOf(["someone@else.com", addr], ["odelia@in.placetta.com"]), "k7qx9abc");
  assert.equal(inboxTokenOf(["odelia@in.placetta.com"], ["odelia@in.placetta.com"]), null, "Odelia's own address is hers, not a workspace's");
  assert.equal(inboxTokenOf(["odelia+k7qx9abc@evil.com"], ["odelia@in.placetta.com"]), null);
  assert.throws(() => inboxAddress("../x", "odelia@in.placetta.com"));
  const at = (s: number) => new Date(Date.UTC(2026, 10, 5, 9, 0, s)).toISOString();
  const m = (o: Partial<InboxMail>): InboxMail => ({ id: 1, source: "email", from_addr: "", from_host: "", subject: "", links: [], codes: [], verified: true, received_at: at(30), ...o });
  const hosts = ["bizfileonline.sos.ca.gov"], since = at(0);
  // the agency's own sender, its link on the portal (not its privacy page)
  const good = m({ from_addr: "noreply@sos.ca.gov", links: ["https://bizfileonline.sos.ca.gov/privacy", "https://bizfileonline.sos.ca.gov/account/verify?t=abc"] });
  assert.equal(pickVerification([good], { hosts, since, want: "link" })?.link, "https://bizfileonline.sos.ca.gov/account/verify?t=abc");
  // a stranger linking off the agency's site: never
  const spoof = m({ id: 2, from_addr: "verify@sos-ca-gov.help", links: ["https://sos-ca-gov.help/verify?t=abc"] });
  assert.equal(pickVerification([spoof], { hosts, since, want: "any" }), null);
  assert.ok(!fromAgency(spoof, hosts));
  // anyone from all of ca.gov isn't the agency
  assert.ok(!fromAgency(m({ from_addr: "news@cdtfa.ca.gov" }), hosts));
  // a platform sends for the agency (Accela for Dallas)
  assert.ok(fromAgency(m({ from_addr: "noreply@accela.com" }), ["aca-prod.accela.com"]));
  // a link-only match still has to be on the portal
  assert.ok(fromAgency(m({ from_addr: "x@mailer.example", links: ["https://bizfileonline.sos.ca.gov/verify?x=1"] }), hosts));
  assert.equal(pickVerification([m({ from_addr: "x@mailer.example", links: ["http://bizfileonline.sos.ca.gov/verify?x=1"] })], { hosts, since, want: "link" }), null, "never a plain http link");
  // before the account was started: not this account's
  assert.equal(pickVerification([{ ...good, received_at: at(0).replace("09:00:00", "08:00:00") }], { hosts, since, want: "link" }), null);
  // codes: only where the mail says so
  assert.deepEqual(codesIn("Your verification code is 482913. It expires in 10 minutes."), ["482913"]);
  assert.deepEqual(codesIn("Code: 4829"), ["4829"]);
  assert.deepEqual(codesIn("831204 is your security code"), ["831204"]);
  assert.deepEqual(codesIn("Your business at 1 Main St, San Jose, CA 95112, zip code 95112, was registered in 2026."), []);
  assert.equal(pickVerification([m({ from_addr: "noreply@sos.ca.gov", codes: ["482913"] })], { hosts, since, want: "code" })?.code, "482913");
  assert.equal(pickVerification([m({ source: "owner_sms", from_addr: "owner", codes: ["111222"] })], { hosts, since, want: "code" })?.code, "111222");
  assert.equal(codeInText("482913"), "482913");
  assert.equal(codeInText("Dallas: Your one-time code is 482913"), "482913");
  assert.equal(codeInText("Can you check on my permit?"), null);
  assert.deepEqual(linksIn("Verify: https://a.gov/v?t=1.", `<a href="https://a.gov/v?t=1&amp;x=2">x</a> <a href="http://a.gov/no">y</a>`), ["https://a.gov/v?t=1&x=2", "https://a.gov/v?t=1"]);
});

test("the registry's account rows: every one checked, ID.me's stays with the owner, and none for a site that files with no account", () => {
  const portals = [...new Set(Object.values(DEST).map((d) => d.portal).filter((h): h is string => !!h))];
  assert.deepEqual(accountProblems(PORTAL_ACCOUNTS, portals), []);
  assert.equal(accountOf(DEST["irs-8821"]), "individual");
  assert.equal(accountOf(DEST["irs-2848"]), "individual");
  assert.equal(accountOf(DEST["ca-cdtfa"]), "unknown", "CDTFA registers from a signed-in account (pub 439; live run 2026-10-28)");
  assert.equal(accountOf(DEST["ga-sos"]), "business");
  assert.equal(accountOf(DEST["ca-llc-1"]), "unknown", "not read yet: the team is asked");
});
