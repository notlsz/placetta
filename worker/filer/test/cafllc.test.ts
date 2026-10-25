// npm test (needs a Chromium that launches: run it in the worker's own image, mcr.microsoft.com/playwright:v1.56.0-noble)
//
// M2: California's foreign LLC registration (ca-llc-5) end to end through the real worker, with its real destination
// and its real bizfile Online playbook, on a LOCAL FIXTURE served on 127.0.0.1. The fixture's pages follow the guide's
// steps and test/mocks/bizfileonline.sos.ca.gov.html: Login, Forms, the form, Attachments, Review, File Document
// (where "File Online" sends it and "Print and Mail" never does), Shopping Cart (the fee: always the person's), and My
// Work Queue (the work order). Nothing here opens bizfileonline.sos.ca.gov; every value is made up. FIXTURE success only:
// not LIVE-SUBMITTED, not AGENCY-ACKNOWLEDGED, and the playbook stays verified: null.
import { test, after } from "node:test";
import assert from "node:assert";
import { createServer, type Server } from "node:http";
import { DEST } from "../../../supabase/functions/file/destinations.ts";
import { openBrowser } from "../src/main.ts";
import type { Model, StepInput, ToolCall } from "../src/model.ts";
import { playbookFor } from "../src/playbooks.ts";
import { Worker } from "../src/run.ts";
import type { Store } from "../src/store.ts";
import type { Filing, LogEntry, Skill } from "../src/types.ts";

const b = (s: string) => ({ en: s, zh: s });
const VALUES: [string, string][] = [["LLC Name", "Fixture Tea House LLC"], ["Jurisdiction of formation", "Delaware"], ["Principal office", "1 Fixture Way, Dover, DE 19901"]];
const filing = (): Filing => ({ id: "ca5", workspace_id: "w", app_id: "llc5", title: b("Register a foreign LLC"), status: "in_progress", channel: "portal",
  agent_state: "running", agent_log: [], handoff_url: null, submit_clicked_at: null, attempts: 1, confirmation_number: null,
  payload: { official: "ca-llc-5", fields: VALUES.map(([l, v]) => ({ label: b(l), value: v })), attachments: [{ name: "good-standing.pdf", path: "w/good-standing.pdf" }] } });

class Mem implements Store {
  f = filing(); tasks: string[] = []; docs: string[] = []; filed = 0; held = false; logins = 0;
  async claim() { return null; }
  async reload() { return this.f; }
  async step(_f: Filing, e: LogEntry | null, patch: Record<string, unknown> = {}) {
    if (this.f.status === "canceled" && "submit_clicked_at" in patch) throw new Error("filing_stopped");
    if (e) this.f.agent_log = [...this.f.agent_log, e];
    for (const [k, v] of Object.entries(patch)) if (!(k === "submit_clicked_at" && this.f.submit_clicked_at)) (this.f as unknown as Record<string, unknown>)[k] = v;
    return { ...this.f };
  }
  async login() { this.logins++; return { username: "fixture-user", password: "fixture-pass", host: "127.0.0.1" }; }
  async skill() { return null; }
  async saveSkill(_s: Skill) {}
  async skillFailed() { return { disabled: false }; }
  async selfFiled() { return this.filed; }
  async download() { return new TextEncoder().encode("%PDF-1.4 fixture"); }
  async saveDoc(_f: Filing, name: string) { this.docs.push(name); return `w/receipts/${name}`; }
  async saveProof(_f: Filing, name: string) { return `w/proof/${name}`; }
  async teamTask(_f: Filing | null, kind: string) { this.tasks.push(kind); }
  async notify() {}
  async takeHeld() { return this.held; }
}

/** A stand-in for the model, following the guide's buttons by name: never "Print and Mail", never "Save Draft". */
class Scripted implements Model {
  calls = 0; guide: string[] = [];
  async next(i: StepInput): Promise<ToolCall> {
    this.calls++;
    if (i.guide) this.guide = i.guide;
    const s = i.state, p = i.filing.payload;
    const wo = /Work Order: (\S+)/.exec(s.text);
    if (wo) return { name: "done", input: { confirmation_number: wo[1], summary: "Filed on bizfile Online" } };
    for (const c of s.controls) {
      if (c.type === "password" && !c.value) return { name: "fill_login", input: { selector: c.selector, which: "password" } };
      if (c.label === "Username" && !c.value) return { name: "fill_login", input: { selector: c.selector, which: "username" } };
      if (c.type === "file" && !i.recent.some((r) => r.startsWith("upload"))) return { name: "upload", input: { selector: c.selector, attachment: "good-standing.pdf" } };
      const v = p.fields?.find((f) => f.label.en === c.label)?.value;
      if (v && c.value !== v) return { name: "fill", input: { selector: c.selector, value: v } };
    }
    const want = ["Sign In", "File Online", "Next Step", "Checkout"];
    const btn = s.buttons.find((x) => want.includes(x.text)) ?? s.buttons.find((x) => !/print and mail|save draft|previous/i.test(x.text));
    return { name: "click", input: { selector: btn ? btn.selector : s.links[0].selector } };
  }
}
/** The fixture. review: what the File Document page shows (the guide's mock shows only its two buttons). */
async function fixture(o: { fileDocShows?: boolean } = {}) {
  const data: Record<string, string> = {};
  let authed = false, submissions = 0, paid = false;
  const page = (t: string, body: string) => `<!doctype html><html><head><title>${t}</title></head><body><h1>${t}</h1>${body}</body></html>`;
  const field = (id: string, label: string) => `<p><label for="${id}">${label}</label><input id="${id}" name="${id}"></p>`;
  const form = (to: string, inner: string, buttons: string, enc = "") => `<form method="post" action="${to}"${enc}>${inner}${buttons}</form>`;
  const btn = (t: string, to?: string) => `<button type="submit"${to ? ` formaction="${to}"` : ""}>${t}</button>`;
  const values = () => `<p>LLC Name: ${data.n}</p><p>Jurisdiction of formation: ${data.j}</p><p>Principal office: ${data.o}</p>`;
  const srv: Server = createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    if (req.headers["content-type"]?.startsWith("multipart")) data.upload = /filename="([^"]+)"/.exec(body)?.[1] ?? "";
    else Object.assign(data, Object.fromEntries(new URLSearchParams(body)));
    const html = (h: string) => { res.writeHead(200, { "content-type": "text/html" }); res.end(h); };
    const go = (to: string) => { res.writeHead(303, { location: to }); res.end(); };
    switch (new URL(req.url!, "http://x").pathname) {
      case "/": return html(page("Login", form("/login", field("u", "Username") + `<p><label for="p">Password</label><input id="p" name="p" type="password"></p>`, btn("Sign In"))));
      case "/login": if (data.u === "fixture-user" && data.p === "fixture-pass") { authed = true; return go("/forms"); } return go("/");
      case "/forms": if (!authed) return go("/");
        return html(page("Forms", `<p>Business</p>` + form("/wizard", `<p>Application to Register a Foreign LLC. Fee: $70.00</p>`, btn("File Online"))));
      case "/wizard": return html(page("Application to Register a Foreign LLC", form("/attach", field("n", "LLC Name") + field("j", "Jurisdiction of formation") + field("o", "Principal office"), btn("Save Draft", "/draft") + btn("Next Step"))));
      case "/draft": return html(page("Draft saved", "<p>Saved.</p>"));
      case "/attach": return html(page("Attachments", form("/review", `<p><label for="f">Certificate of Good Standing</label><input id="f" name="f" type="file"></p>`, btn("Next Step"), ` enctype="multipart/form-data"`)));
      case "/review": return html(page("Review", values() + `<p>File: ${data.upload}</p>` + form("/filedoc", "", btn("Next Step"))));
      case "/filedoc": return html(page("File Document", (o.fileDocShows ? values() : "") + form("/mail", "", btn("Print and Mail")) + form("/cart", "", btn("File Online"))));
      case "/mail": return html(page("Print and Mail", "<p>Print this and mail it.</p>"));
      case "/cart": submissions++;
        return html(page("Shopping Cart", `<p>Foreign LLC registration: $70.00</p><button>Checkout</button><script>setInterval(() => fetch("/paid").then(r => r.text()).then(t => { if (t === "yes") location.href = "/queue"; }), 50)</script>`));
      case "/paid": res.writeHead(200); return res.end(paid ? "yes" : "no");
      case "/queue": return html(page("My Work Queue", `<p>Application to Register a Foreign LLC: Pending Review</p><p>Work Order: WO-${700000 + submissions}</p>`));
      default: res.writeHead(404); res.end();
    }
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const a = srv.address() as { port: number };
  return { url: `http://127.0.0.1:${a.port}`, submissions: () => submissions, pay: () => { paid = true; }, close: () => new Promise<void>((r) => srv.close(() => r())) };
}

const servers: { close(): Promise<void> }[] = [];
after(async () => { for (const s of servers) await s.close(); });
const fx = async (o: { fileDocShows?: boolean } = {}) => { const p = await fixture(o); servers.push(p); return p; };

/** The worker as main.ts builds it: ca-llc-5's real playbook, rebound to the fixture's host, and the start page. */
const pb = () => { const x = playbookFor("bizfileonline.sos.ca.gov", "ca-llc-5")!; return { playbook: { ...x.playbook, host: "127.0.0.1" }, form: x.form }; };
const worker = (store: Mem, url: string, extra: Record<string, unknown> = {}) => new Worker({ store, model: new Scripted(), open: openBrowser,
  portalOf: (id) => (DEST[id]?.portal ? "127.0.0.1" : null), playbookOf: () => pb(), startUrl: () => url + "/",
  dryRun: false, twoKey: 10, maxSteps: 60, maxMs: 60000, holdMs: 1500, pollMs: 100, ...extra });

test("ca-llc-5 is routed to bizfile Online, with its fee paid on the portal, a saved login and a playbook from the guide", () => {
  const d = DEST["ca-llc-5"];
  assert.equal(d.portal, "bizfileonline.sos.ca.gov");
  assert.equal(d.payment, "portal");
  assert.ok(!d.noLogin, "the Secretary of State's site needs the business's own login");
  const x = playbookFor("bizfileonline.sos.ca.gov", "ca-llc-5");
  assert.ok(x && x.playbook.verified === null, "the playbook is unverified until a supervised live run");
});

test("FIXTURE: the unverified playbook is refused by default: no browser opens and the team is asked to watch the first run", async () => {
  const p = await fx(), store = new Mem();
  let opened = false;
  const r = await worker(store, p.url, { open: async () => { opened = true; return openBrowser(); } }).run(store.f);
  assert.equal(r, null);
  assert.equal(opened, false);
  assert.ok(store.tasks.includes("first_run"));
  assert.equal(p.submissions(), 0);
});
// BLOCKER found by this fixture (2026-10-25): the guide's Forms pop-up opens the form with a button that is also named
// "File Online", the same words as the sending button on File Document. The generic send words ("file") make the worker
// treat it as a send, so the final-submit guard runs on the Forms page and the run hands back (review_differs) before it
// reaches the form. Nothing is sent, so the guard fails safe, but ca-llc-5 can't be completed. A page-scoped `nav`
// exception fixes it and the two tests below then pass (7/7), but it breaks the playbooks.test.ts rule that no nav
// button shares its words with a send button. That is a safety-rule decision for the owner, so the fix isn't applied;
// these two tests are skipped until it's decided.
const BLOCKED = "ca-llc-5 can't pass the Forms page: its 'File Online' opener is treated as a send (owner decision pending)";
test("FIXTURE: the supervised first run signs in, fills, uploads, never presses Print and Mail, and stops at File Document for the team", { skip: BLOCKED }, async () => {
  const p = await fx({ fileDocShows: true }), store = new Mem();
  const r = await worker(store, p.url, { allowUnverified: true }).run(store.f);
  assert.equal(r?.kind, "review", JSON.stringify(store.f.agent_log.slice(-3)));
  assert.equal(p.submissions(), 0);
  assert.equal(store.f.submit_clicked_at, null);
  assert.ok(store.tasks.includes("review") && store.docs.includes("review-page.png"));
  assert.ok(store.logins >= 1, "the saved login was used");
  assert.ok(store.f.agent_log.some((e) => e.kind === "upload"), "the good standing certificate was attached");
  assert.ok(!store.f.agent_log.some((e) => /print and mail/i.test(e.en)));
});

test("FIXTURE: after the team's check it presses File Online once, hands the fee to the person, then keeps the work order", { skip: BLOCKED }, async () => {
  const p = await fx({ fileDocShows: true }), store = new Mem();
  store.f.agent_log = [{ en: "", zh: "", kind: "two_key_ok" }];
  // the person pays in the live view, then taps "I've done it"
  store.takeHeld = async () => { if (!store.f.agent_log.some((e) => e.ref === "payment")) return false; p.pay(); await new Promise((r) => setTimeout(r, 400)); return true; };
  const r = await worker(store, p.url, { allowUnverified: true }).run(store.f);
  assert.equal(r?.kind, "submitted", JSON.stringify(store.f.agent_log.slice(-3)));
  assert.equal(p.submissions(), 1, "File Online pressed exactly once");
  assert.ok(store.f.agent_log.some((e) => e.ref === "payment"), "the fee went to the person");
  assert.equal(store.f.confirmation_number, "WO-700001");
  assert.equal(store.f.status, "submitted", "submitted, which is not the agency's approval");
  assert.ok(store.docs.includes("confirmation.png"));
});

test("FIXTURE: a run after File Online was pressed never presses it again; it goes to the team to check with the agency", async () => {
  const p = await fx({ fileDocShows: true }), store = new Mem();
  store.f.submit_clicked_at = new Date().toISOString();
  const r = await worker(store, p.url, { allowUnverified: true }).run(store.f);
  assert.equal(r, null);
  assert.ok(store.tasks.includes("check_agency"));
  assert.equal(p.submissions(), 0);
});

test("FIXTURE: a filing the customer stopped is never sent", async () => {
  const p = await fx({ fileDocShows: true }), store = new Mem();
  store.f.agent_log = [{ en: "", zh: "", kind: "two_key_ok" }];
  store.f.status = "canceled";
  const r = await worker(store, p.url, { allowUnverified: true }).run(store.f);
  assert.equal(r?.kind, "stopped");
  assert.equal(p.submissions(), 0);
});

// Today's behaviour, recorded: even after the team's approval, the run hands back on the Forms page (the BLOCKER above)
// and nothing reaches the agency. The guard fails safe; this is the evidence that it does.
test("FIXTURE: today the ca-llc-5 run hands back at the Forms page and nothing is sent (the blocker, failing safe)", async () => {
  const p = await fx(), store = new Mem();
  store.f.agent_log = [{ en: "", zh: "", kind: "two_key_ok" }];
  const r = await worker(store, p.url, { allowUnverified: true }).run(store.f);
  assert.equal(p.submissions(), 0, "nothing is sent");
  assert.equal(r?.kind, "handoff");
  assert.equal(r && "reason" in r ? r.reason : "", "review_differs");
});
