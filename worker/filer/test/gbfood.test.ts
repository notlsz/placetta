// npm test (needs a Chromium that launches: the browser plus its system libraries, or CHROMIUM_PATH)
//
// gb-food (supabase/functions/file/destinations.ts) through the real worker on a LOCAL FIXTURE only: pages shaped like a
// no-login registration service, served on 127.0.0.1. Nothing here opens register.food.gov.uk, and passing says nothing
// about that site's real pages; it proves the worker's own guards for this no-login portal destination:
//   - with no saved login, the run fills only the approved values and, in the two-key period, stops at the review page
//   - a card field on the way stops the run for the person, and nothing is submitted
//   - once the team has approved the review page, the run submits once
import { test, after } from "node:test";
import assert from "node:assert";
import { createServer, type Server } from "node:http";
import { DEST } from "../../../supabase/functions/file/destinations.ts";
import { openBrowser } from "../src/main.ts";
import type { Model, StepInput, ToolCall } from "../src/model.ts";
import { Worker } from "../src/run.ts";
import type { Store } from "../src/store.ts";
import type { Filing, LogEntry, Skill } from "../src/types.ts";

const b = (s: string) => ({ en: s, zh: s });
const VALUES: [string, string][] = [["Business name", "Acme Noodles Ltd"], ["Establishment postcode", "SW1A 1AA"], ["Operator name", "Li Wei"]];
const filing = (): Filing => ({ id: "gb1", workspace_id: "w", app_id: "food", title: b("Food business registration"), status: "in_progress", channel: "portal",
  agent_state: "running", agent_log: [], handoff_url: null, submit_clicked_at: null, attempts: 1, confirmation_number: null,
  payload: { official: "gb-food", fields: VALUES.map(([l, v]) => ({ label: b(l), value: v })) } });

class Mem implements Store {
  f = filing(); tasks: string[] = []; docs: string[] = []; filed = 0;
  async claim() { return null; }
  async reload() { return this.f; }
  async step(_f: Filing, e: LogEntry | null, patch: Record<string, unknown> = {}) {
    if (e) this.f.agent_log = [...this.f.agent_log, e];
    for (const [k, v] of Object.entries(patch)) if (!(k === "submit_clicked_at" && this.f.submit_clicked_at)) (this.f as unknown as Record<string, unknown>)[k] = v;
    return { ...this.f };
  }
  async login() { return null; }                                     // no saved login for this service
  async skill() { return null; }
  async saveSkill(_s: Skill) {}
  async skillFailed() { return { disabled: false }; }
  async selfFiled() { return this.filed; }
  async download() { return new Uint8Array(); }
  async saveDoc(_f: Filing, name: string) { this.docs.push(name); return `w/receipts/${name}`; }
  async saveProof(_f: Filing, name: string) { return `w/proof/${name}`; }
  async teamTask(_f: Filing | null, kind: string) { this.tasks.push(kind); }
  async notify() {}
  async takeHeld() { return false; }
}

/** A stand-in for the model: fills each empty field from the approved values, then presses the page's one button. */
class Scripted implements Model {
  calls = 0;
  async next(i: StepInput): Promise<ToolCall> {
    this.calls++;
    const m = /Registration reference: (\S+)/.exec(i.state.text);
    if (m) return { name: "done", input: { confirmation_number: m[1], summary: "Registered" } };
    for (const c of i.state.controls) {
      const v = i.filing.payload.fields?.find((f) => f.label.en === c.label)?.value;
      if (v && c.value !== v) return { name: "fill", input: { selector: c.selector, value: v } };
    }
    return { name: "click", input: { selector: i.state.buttons[0].selector } };
  }
}
/** The fixture: no sign-in anywhere; card: a payment page with a card field before the review. */
async function fixture(o: { card?: boolean } = {}) {
  const data: Record<string, string> = {};
  let submissions = 0;
  const page = (t: string, body: string) => `<!doctype html><html><head><title>${t}</title></head><body><h1>${t}</h1>${body}</body></html>`;
  const field = (id: string, label: string) => `<p><label for="${id}">${label}</label><input id="${id}" name="${id}"></p>`;
  const form = (to: string, inner: string, button: string) => `<form method="post" action="${to}">${inner}<button type="submit">${button}</button></form>`;
  const srv: Server = createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    Object.assign(data, Object.fromEntries(new URLSearchParams(body)));
    const html = (h: string) => { res.writeHead(200, { "content-type": "text/html" }); res.end(h); };
    switch (new URL(req.url!, "http://x").pathname) {
      case "/new": return html(page("Register a Food Business", form("/business", "", "Begin registration")));
      case "/business": return html(page("About the business", form(o.card ? "/fee" : "/review", field("bn", "Business name") + field("pc", "Establishment postcode") + field("op", "Operator name"), "Continue")));
      case "/fee": return html(page("Payment", form("/review", `<p><label for="cc">Card number</label><input id="cc" name="cc" autocomplete="cc-number"></p>`, "Continue")));
      case "/review": return html(page("Check your answers", `<p>Business name: ${data.bn}</p><p>Establishment postcode: ${data.pc}</p><p>Operator name: ${data.op}</p>` + form("/submit", "", "Submit registration")));
      case "/submit": submissions++; return html(page("Registration complete", `<p>Registration reference: GB-${10000 + submissions}</p>`));
      default: res.writeHead(404); res.end();
    }
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const a = srv.address() as { port: number };
  return { url: `http://127.0.0.1:${a.port}`, submissions: () => submissions, close: () => new Promise<void>((r) => srv.close(() => r())) };
}

const servers: { close(): Promise<void> }[] = [];
after(async () => { for (const s of servers) await s.close(); });

/** The worker as main.ts builds it, except the host: the destination's own start path, on the fixture. */
const worker = (store: Mem, url: string) => new Worker({ store, model: new Scripted(), open: openBrowser,
  portalOf: (id) => (DEST[id]?.portal ? "127.0.0.1" : null),
  startUrl: () => url + new URL(DEST["gb-food"].portalUrl!).pathname,
  dryRun: false, twoKey: 10, maxSteps: 40, maxMs: 60000, holdMs: 300, pollMs: 100 });

test("gb-food is a no-login portal destination with no fee (the worker's input)", () => {
  const d = DEST["gb-food"];
  assert.equal(d.portal, "register.food.gov.uk");
  assert.equal(d.noLogin, true);
  assert.equal(d.payment, "none");
  assert.equal(new URL(d.portalUrl!).pathname, "/new");
});

test("FIXTURE: in the two-key period, a gb-food run with no saved login fills the approved values and stops at the review page", async () => {
  const p = await fixture(); servers.push(p);
  const store = new Mem();
  const r = await worker(store, p.url).run(store.f);
  assert.equal(r?.kind, "review");
  assert.equal(p.submissions(), 0, "nothing reached the submit page");
  assert.equal(store.f.submit_clicked_at, null);
  assert.ok(store.tasks.includes("review") && store.docs.includes("review-page.png"), "the team gets the review page to check");
  assert.ok(VALUES.every(([l]) => store.f.agent_log.some((e) => e.kind === "fill" && e.en.includes(l))), "every approved value was filled");
  assert.ok(!store.f.agent_log.some((e) => e.kind === "refused"), "nothing outside the approval was tried");
});

test("FIXTURE: a card field on the way hands the gb-food run to the person, and nothing is submitted", async () => {
  const p = await fixture({ card: true }); servers.push(p);
  const store = new Mem(); store.filed = 99;
  const r = await worker(store, p.url).run(store.f);
  assert.equal(r?.kind, "needs_you");
  assert.ok(store.f.agent_log.some((e) => e.ref === "payment"));
  assert.equal(p.submissions(), 0);
});

test("FIXTURE: once the team approved the review page, the gb-food run submits once", async () => {
  const p = await fixture(); servers.push(p);
  const store = new Mem(); store.f.agent_log = [{ en: "", zh: "", kind: "two_key_ok" }];
  const r = await worker(store, p.url).run(store.f);
  assert.equal(r?.kind, "submitted");
  assert.equal(p.submissions(), 1);
  assert.equal(store.f.confirmation_number, "GB-10001");
});
