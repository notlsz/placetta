// Odelia pays the agency's fee with Placetta's single-use card (src/card.ts): only with fee authority, only on the
// agency's payment page, typed by a tool whose values the model never sees, and never in a log, a trace, a recording, a
// picture's page or the model's prompt. Needs a Chromium, like filer.test.ts.
import type { RecordingPolicy } from "../src/privacy.ts";
import { test, after } from "node:test";
import assert from "node:assert";
import { openBrowser } from "../src/main.ts";
import { browserbaseBody } from "../src/browsers.ts";
import { cardLineOk, cardsOn, guardStore, holdsSecret, optionCandidates, pageAmount, partValue, redactDeep, redactText, scrubPage, type CardDetails, type CardOutcome, type FeeDecision } from "../src/card.ts";
import { mustStop, stopBesidesCard, type PageState } from "../src/guards.ts";
import { prompt, type Model, type StepInput, type ToolCall } from "../src/model.ts";
import { type Session, Worker } from "../src/run.ts";
import type { Store } from "../src/store.ts";
import type { Filing, LogEntry, Skill } from "../src/types.ts";
import { startPortal, type Variant } from "./portal/server.ts";

const NUMBER = "4000009990000006", CVC = "723";
const CARD: CardDetails = { purchase_id: "pu-1", limit_cents: 15450, number: NUMBER, cvc: CVC, exp_month: 11, exp_year: 2029, name: "Placetta Inc",
  address: { line1: "1 Market St", city: "San Francisco", state: "CA", postal_code: "94105", country: "US" } };
const SECRETS = [NUMBER, CVC];

const b = (s: string) => ({ en: s, zh: s });
const VALUES: [string, string][] = [["Legal name", "Acme Noodles LLC"], ["Business address", "1 Main St, San Jose, CA"], ["Owner name", "Li Wei"], ["Title", "Manager"], ["Activity", "Restaurant"]];
const filing = (): Filing => ({ id: "f1", workspace_id: "w", app_id: "llc", title: b("LLC"), status: "in_progress", channel: "portal", agent_state: "running", agent_log: [],
  handoff_url: null, submit_clicked_at: null, attempts: 1, confirmation_number: null,
  payload: { official: "test-llc", fields: VALUES.map(([l, v]) => ({ label: b(l), value: v })), attachments: [{ name: "articles.pdf", path: "w/articles.pdf" }] } });

/** Everything the run writes, kept so the test can look for the card in it. */
class Mem implements Store {
  f = filing(); skills = new Map<string, Skill>(); tasks: unknown[] = []; docs: string[] = []; notices: unknown[] = []; filed = 99;
  decision: FeeDecision = { ok: true, limitCents: 15450 }; feeAsked: (number | null)[] = []; cardCalls = 0; done: { outcome: CardOutcome; receipt?: string | null; cents?: number | null; confirmation?: string | null }[] = [];
  onNotify?: () => Promise<void>;
  privacy: RecordingPolicy = { synthetic: false, strict: false, screen: false, teach: false };   // a business outside California
  async recordingPolicy() { return this.privacy; }
  async claim() { return null; }
  async reload() { return this.f; }
  async step(_f: Filing, e: LogEntry | null, patch: Record<string, unknown> = {}) {
    if (e) this.f.agent_log = [...this.f.agent_log, e];
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
  async saveProof(_f: Filing, name: string) { return `w/proof/${name}`; }
  async teamTask(_f: Filing | null, kind: string, title: string, detail?: unknown) { this.tasks.push({ kind, title, detail }); }
  async notify(_f: Filing, t: unknown, body: unknown) { this.notices.push({ t, body }); await this.onNotify?.(); }
  async feeAuthority(_f: Filing, cents: number | null) { this.feeAsked.push(cents); return this.decision; }
  async card() { this.cardCalls++; return CARD; }
  async cardDone(_f: Filing, outcome: CardOutcome, o: { receipt?: string | null; cents?: number | null; confirmation?: string | null } = {}) { this.done.push({ outcome, ...o }); }
}

/** A stand-in for Claude: the approved values, the saved login, and on a payment page with the note, fill_card for each
 *  card line, then Pay. Keeps the real prompt of every step. */
class CardModel implements Model {
  calls = 0; prompts: string[] = []; script: ToolCall[] = []; inputs: StepInput[] = [];
  async next(i: StepInput): Promise<ToolCall> {
    this.calls++; this.prompts.push(prompt(i)); this.inputs.push(i);
    if (this.script.length) return this.script.shift()!;
    const s = i.state, p = i.filing.payload;
    const m = /Confirmation number: (\S+)/.exec(s.text);
    if (m) return { name: "done", input: { confirmation_number: m[1], summary: "Filed and paid" } };
    if (i.note?.includes("fill_card")) {
      const want: Record<string, string> = { "cc-number": "number", "cc-exp": "exp", "cc-csc": "cvc", "cc-name": "name", "postal-code": "postal_code" };
      for (const c of s.controls) { const w = want[c.autocomplete]; if (w && !c.value) return { name: "fill_card", input: { selector: c.selector, which: w } }; }
      return { name: "click", input: { selector: "button:Pay" } };
    }
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
const portal = async (v: Variant) => { const p = await startPortal(v); portals.push(p); return p; };
after(async () => { for (const p of portals) await p.close(); });
const worker = (store: Mem, model: Model, url: string, extra: Record<string, unknown> = {}) => new Worker({ store, model, open: openBrowser, portalOf: () => "127.0.0.1", startUrl: () => url + "/",
  dryRun: false, twoKey: 10, maxSteps: 80, maxMs: 120000, holdMs: 400, pollMs: 100, cards: true, ...extra });
/** Nothing the run kept, wrote or asked holds the card's number or code, in any spacing. */
function clean(store: Mem, model: CardModel) {
  const kept = JSON.stringify({ log: store.f.agent_log, tasks: store.tasks, notices: store.notices, skills: [...store.skills.values()], done: store.done });
  for (const s of [kept, ...model.prompts]) {
    assert.ok(!s.includes(NUMBER) && !s.replace(/[\s-]/g, "").includes(NUMBER), "the card's number never leaves its field");
    assert.ok(!new RegExp(`(?<![\\w])${CVC}(?![\\w])`).test(s), "nor its security code");
  }
}

test("with fee authority: the card goes into the agency's lines only, Pay is pressed once, the receipt is kept, and the card is nowhere else", async () => {
  const p = await portal({ card: true }), store = new Mem(), model = new CardModel();
  const r = await worker(store, model, p.url).run(store.f);
  assert.equal(r?.kind, "submitted");
  assert.equal(store.f.confirmation_number, "CA-10001");
  assert.deepEqual(p.paid && { cc: p.paid.cc, exp: p.paid.exp, cvv: p.paid.cvv, cname: p.paid.cname, zip: p.paid.zip }, { cc: NUMBER, exp: "11/29", cvv: CVC, cname: "Placetta Inc", zip: "94105" });
  assert.deepEqual(store.feeAsked, [15000], "asked once, with the page's total");
  assert.equal(store.cardCalls, 1, "the card fetched once, at the last moment");
  assert.equal(store.done.length, 1);
  assert.equal(store.done[0].outcome, "used");
  assert.equal(store.done[0].confirmation, "CA-10001");
  assert.equal(store.done[0].cents, 15000, "the agency's own amount, for reconciling");
  assert.match(store.done[0].receipt ?? "", /confirmation\.(pdf|png)$/);
  assert.ok(store.f.agent_log.some((e) => e.kind === "fee" && e.ref === "paid"));
  // the model chose the lines by name; the trace says which part went where, never what
  const steps = [...store.skills.values()][0]?.body.steps ?? [];
  assert.deepEqual(steps.filter((s) => s.action === "fill" && "card" in s && s.card).map((s) => (s as { card: string }).card), ["number", "exp", "cvc", "name", "postal_code"]);
  assert.ok(model.inputs.every((i) => !JSON.stringify(i.state.controls).includes(NUMBER)));
  clean(store, model);
});

test("the recorded skill pays again on replay, with no model at all, and only with authority", async () => {
  const p = await portal({ card: true }), first = new Mem(), model = new CardModel();
  assert.equal((await worker(first, model, p.url).run(first.f))?.kind, "submitted");
  const again = new Mem(), m2 = new CardModel();
  again.skills = first.skills;
  const r = await worker(again, m2, p.url).run(again.f);
  assert.equal(r?.kind, "submitted");
  assert.equal(m2.calls, 0, "replayed");
  assert.equal(p.paid?.cc, NUMBER);
  assert.deepEqual(again.done.map((d) => d.outcome), ["used"]);
  clean(again, m2);
  // the same skill without authority stops at the fee for the person
  const third = new Mem(), m3 = new CardModel();
  third.skills = first.skills; third.decision = { ok: false, why: "nobody authorized Placetta to pay this fee" };
  assert.equal((await worker(third, m3, p.url).run(third.f))?.kind, "needs_you");
  assert.equal(third.cardCalls, 0);
});

test("an agency page that prints the card back: the model reads it masked, and the page is scrubbed before it's kept", async () => {
  const p = await portal({ card: true, echo: true }), store = new Mem(), model = new CardModel();
  const r = await worker(store, model, p.url).run(store.f);
  assert.equal(r?.kind, "submitted");
  const last = model.prompts.at(-1) ?? "";
  assert.match(last, /Paid with card •••• 0006/, "the model sees only the last four");
  clean(store, model);
});

test("without fee authority, over the limit, with cards off, or on a recorded session: the fee goes to the person as today, and no card is made", async () => {
  for (const [name, set] of [
    ["no authority", (s: Mem) => { s.decision = { ok: false, why: "nobody authorized Placetta to pay this fee" }; }],
    ["over the limit", (s: Mem) => { s.decision = { ok: true, limitCents: 14000 }; }],
  ] as const) {
    const p = await portal({ card: true }), store = new Mem(), model = new CardModel();
    set(store);
    const r = await worker(store, model, p.url).run(store.f);
    assert.equal(r?.kind, "needs_you", name);
    assert.ok(store.f.agent_log.some((e) => e.kind === "need_person" && e.ref === "payment"), name);
    assert.equal(store.cardCalls, 0, name);
    assert.ok(store.f.agent_log.some((e) => e.ref === "card_refused"), `${name}: the log says why`);
    assert.equal(p.paid, undefined, name);
    assert.deepEqual(store.done, [], name);
  }
  {
    const p = await portal({ card: true }), store = new Mem(), model = new CardModel();
    const r = await worker(store, model, p.url, { cards: false }).run(store.f);
    assert.equal(r?.kind, "needs_you");
    assert.deepEqual([store.feeAsked, store.cardCalls], [[], 0], "cards off: the server isn't even asked");
  }
  {
    const p = await portal({ card: true }), store = new Mem(), model = new CardModel();
    const recorded = async (h?: string): Promise<Session> => ({ ...(await openBrowser(h)), recorded: true });
    const r = await worker(store, model, p.url, { open: recorded }).run(store.f);
    assert.equal(r?.kind, "needs_you");
    assert.equal(store.cardCalls, 0, "a recorded session never gets the card");
    assert.ok(store.f.agent_log.some((e) => e.ref === "card_refused" && /recorded/.test(e.en)));
  }
});

test("a payment page that also asks for the owner's SSN still goes to the owner, with no card made", async () => {
  const p = await portal({ card: true, cardSsn: true }), store = new Mem(), model = new CardModel();
  const r = await worker(store, model, p.url).run(store.f);
  assert.equal(r?.kind, "needs_you");
  assert.ok(store.f.agent_log.some((e) => e.kind === "need_person" && e.ref === "secret_number"));
  assert.equal(store.cardCalls, 0);
});

test("a hand-back after the card went in: the lines are emptied before the person sees the page, and the unused card is released", async () => {
  const p = await portal({ card: true }), store = new Mem(), model = new CardModel();
  let session: Session | null = null;
  const open = async (h?: string) => (session = await openBrowser(h));
  let seen: string[] = [];
  store.onNotify = async () => { seen = await session!.page.locator("#cc, #cvv").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value)).catch(() => ["unreadable"]); };
  // on the payment page the model types the number, the expiry and the code, then asks the person something
  const base = model.next.bind(model);
  model.next = async (i) => {
    if (i.note?.includes("fill_card") && i.recent.filter((x) => x.startsWith("fill_card")).length >= 3) {
      model.calls++; model.prompts.push(prompt(i));
      return { name: "need_person", input: { reason: "question", message: "Which fee schedule applies?" } };
    }
    return await base(i);
  };
  const r = await worker(store, model, p.url, { open }).run(store.f);
  assert.equal(r?.kind, "needs_you");
  assert.deepEqual(seen, ["", ""], "the person's view of the page has no card in it");
  assert.equal(store.cardCalls, 1);
  assert.deepEqual(store.done.map((d) => d.outcome), ["unused"], "nothing was pressed: canceled and refunded");
  assert.equal(p.paid, undefined);
  clean(store, model);
});

// ---------------------------------------------------------------- the pure parts

const ctl = (label: string, o: Partial<{ autocomplete: string; type: string; name: string; id: string }> = {}) => ({ label, name: o.name ?? "", id: o.id ?? "", autocomplete: o.autocomplete ?? "", type: o.type ?? "text" });

test("the card's number and code go only into the agency's lines for them", () => {
  assert.ok(cardLineOk("number", ctl("Card number")));
  assert.ok(cardLineOk("number", ctl("", { autocomplete: "cc-number" })));
  assert.ok(cardLineOk("cvc", ctl("CVV")) && cardLineOk("cvc", ctl("Security code")));
  assert.ok(cardLineOk("exp", ctl("Expiration date (MM/YY)")) && !cardLineOk("exp", ctl("Expiration month")));
  assert.ok(cardLineOk("exp_month", ctl("Expiration month")) && cardLineOk("exp_year", ctl("Exp. year (YYYY)")));
  assert.ok(cardLineOk("name", ctl("Name on card")) && cardLineOk("name", ctl("Name")));
  assert.ok(cardLineOk("postal_code", ctl("Billing ZIP code")));
  for (const [part, c] of [["number", ctl("Legal name")], ["number", ctl("Business address")], ["number", ctl("Notes")], ["cvc", ctl("Card number")], ["number", ctl("Card number", { type: "password" })],
    ["name", ctl("Legal name")], ["name", ctl("Business name")], ["address_line1", ctl("Business address")], ["postal_code", ctl("Mailing ZIP")], ["number", ctl("Search")]] as const) {
    assert.equal(cardLineOk(part, c), false, `${part} into ${c.label}`);
  }
});

test("each line's value, and the ways a dropdown writes a month or year", () => {
  assert.deepEqual(["number", "cvc", "exp", "exp_month", "exp_year", "name", "postal_code", "state"].map((x) => partValue(x as never, CARD)), [NUMBER, CVC, "11/29", "11", "2029", "Placetta Inc", "94105", "CA"]);
  assert.equal(partValue("exp_year", CARD, ctl("Year (YY)")), "29");
  assert.ok(optionCandidates("exp_month", "03").includes("March") && optionCandidates("exp_month", "03").includes("3"));
  assert.deepEqual(optionCandidates("exp_year", "2029"), ["2029", "29"]);
});

test("the fee a page asks for", () => {
  assert.equal(pageAmount("Application fee: $150.00\nTotal due: $154.50"), 15450);
  assert.equal(pageAmount("Amount due $1,234.56"), 123456);
  assert.equal(pageAmount("Welcome. Call $5 for help"), null, "a dollar amount on a line that names no fee");
  assert.equal(pageAmount("nothing here"), null);
});

test("redaction: the number in any spacing and the code as a token, through any value; the store's writes are redacted", async () => {
  assert.equal(redactText(`card ${NUMBER}`, SECRETS), "card •••• 0006");
  assert.equal(redactText("4000 0099 9000 0006 and 4000-0099-9000-0006", SECRETS), "•••• 0006 and •••• 0006");
  assert.equal(redactText(`cvv ${CVC}; id A${CVC}X; ${CVC}0`, SECRETS), `cvv •••; id A${CVC}X; ${CVC}0`);
  const v = { a: [`x ${NUMBER}`], b: { c: CVC }, n: 5, bytes: new Uint8Array([1]) };
  const r = redactDeep(v, SECRETS);
  assert.deepEqual([r.a, r.b, r.n, r.bytes], [["x •••• 0006"], { c: "•••" }, 5, v.bytes]);
  assert.ok(holdsSecret(v, SECRETS) && !holdsSecret(r, SECRETS));
  assert.equal(redactDeep(v, []), v, "no card: untouched");
  const seen: unknown[] = [];
  const base = { step: async (_f: Filing, e: LogEntry | null) => { seen.push(e); return filing(); }, saveDoc: async (_f: Filing, _n: string, bytes: Uint8Array) => { seen.push(bytes); return "p"; } } as unknown as Store;
  let secrets: string[] = [];
  const s = guardStore(base, () => secrets);
  await s.step(filing(), { en: NUMBER, zh: "", kind: "x" });
  secrets = SECRETS;
  await s.step(filing(), { en: `n ${NUMBER} c ${CVC}`, zh: "", kind: "x" });
  await s.saveDoc(filing(), "a", new Uint8Array([7]), "x");
  assert.deepEqual(seen, [{ en: NUMBER, zh: "", kind: "x" }, { en: "n •••• 0006 c •••", zh: "", kind: "x" }, new Uint8Array([7])]);
});

test("a payment page's other stops, cards on the worker, and Browserbase without recordings", () => {
  const st = (controls: PageState["controls"]): PageState => ({ url: "https://x.gov/pay", title: "Pay", headings: ["Pay"], controls, buttons: [], links: [], text: "", frames: [], markers: [] });
  const c = (label: string, autocomplete = "") => ({ selector: `label:${label}`, tag: "input", type: "text", label, name: "", id: "", autocomplete, value: "" });
  assert.equal(mustStop(st([c("Card number", "cc-number")]))?.reason, "payment");
  assert.equal(stopBesidesCard(st([c("Card number", "cc-number"), c("Security code", "cc-csc")])), null);
  assert.equal(stopBesidesCard(st([c("Card number", "cc-number"), c("Owner SSN")]))?.reason, "secret_number");
  assert.equal(cardsOn({}), false);
  assert.equal(cardsOn({ STRIPE_ISSUING_ON: "1" }), true);
  assert.equal(cardsOn({ STRIPE_ISSUING_ON: "0" }), false);
  assert.deepEqual(browserbaseBody("p", false).browserSettings, { solveCaptchas: false, recordSession: false });
  assert.deepEqual(browserbaseBody("p").browserSettings, { solveCaptchas: false });
});

test("the page scrub blanks the card from fields and text before a picture or a person", async () => {
  const s = await openBrowser();
  try {
    await s.page.setContent(`<p>Paid with card 4000 0099 9000 0006</p><input id="a" value="${NUMBER}"><input id="b" value="${CVC}"><input id="c" value="Acme"><p>Total $150</p>`);
    await s.page.evaluate(scrubPage, SECRETS);
    const text = await s.page.evaluate(() => document.body.innerText);
    assert.ok(!text.replace(/\s/g, "").includes(NUMBER) && /•••• 0006/.test(text));
    assert.deepEqual(await s.page.locator("input").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value)), ["", "", "Acme"]);
  } finally { await s.close(); }
});
