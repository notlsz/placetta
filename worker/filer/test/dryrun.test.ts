// npm run dryrun (needs a Chromium; CHROMIUM_PATH): the founder's dry run. Every agency copy in test/mocks served as a
// working site on 127.0.0.1 (each <template> one page, its buttons posting to the next), and the REAL worker (run.ts),
// the REAL playbook for that agency (its host rebound to 127.0.0.1), the real guards, a made-up business per license.
// The model is SCRIPTED (no API key here): it fills approved values by label and presses the guide's forward buttons;
// everything else (guards, fee hand-off, final-submit guard, confirmation capture, receipts, state) is production code.
// Nothing here opens a real agency site. Writes DRYRUN_OUT (JSON) when set.
import { test, after } from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { DEST } from "../../../supabase/functions/file/destinations.ts";
import { openBrowser } from "../src/main.ts";
import type { Model, StepInput, ToolCall } from "../src/model.ts";
import { PLAYBOOKS } from "../src/playbooks.ts";
import { Worker } from "../src/run.ts";
import type { Store } from "../src/store.ts";
import type { Filing, LogEntry, Skill } from "../src/types.ts";

const DIR = new URL("./mocks/", import.meta.url);
const NAMES: Record<string, string> = {
  "boiefiling.fincen.gov": "Lantern & Ledger Tea Co. LLC", "bizfileonline.sos.ca.gov": "Golden Dumpling Republic LLC",
  "onlineservices.cdtfa.ca.gov": "Sesame Moon Bakery LLC", "ccfs.sos.wa.gov": "Rainy Day Ramen Lab LLC",
  "ecorp.sos.ga.gov": "Peachy Boba Brothers LLC", "gtc.dor.ga.gov": "Midnight Mochi Market LLC",
  "cis.scc.virginia.gov": "Blue Ridge Bao House LLC", "mytax.illinois.gov": "Windy City Wonton Works LLC",
  "etaxstatement.sfgov.org": "Foggy Pearl Milk Tea LLC", "sjpermits.org": "Silicon Spice Noodle Bar LLC",
  "myhealthdepartment.com": "Happy Hen Hot Pot LLC", "aca-prod.accela.com": "Copper Kettle Congee LLC",
  "county-taxes.net": "Sunshine Scallion Pancake LLC", "denvergov.org": "Mile High Mooncake Co. LLC",
  "abc.austintexas.gov": "Lone Star Lychee Lounge LLC",
};
const b = (s: string) => ({ en: s, zh: s });
const norm = (s: string) => s.replace(/\s*\*\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase();

type Mock = { host: string; form: string; pages: { title: string; html: string }[] };
const mocks: Mock[] = readdirSync(DIR).filter((f) => f.endsWith(".html")).sort().map((file) => {
  const src = readFileSync(new URL(file, DIR), "utf8");
  return { host: file.replace(/\.html$/, ""), form: /<meta name="replay-form" content="([^"]+)">/.exec(src)?.[1] ?? "",
    pages: [...src.matchAll(/<template data-title="([^"]*)">([\s\S]*?)<\/template>/g)].map((m) => ({ title: m[1], html: m[2] })) };
});

/** A made-up value for a field, by its label. */
function valueFor(label: string, name: string): string {
  const l = label.toLowerCase();
  if (/email/.test(l)) return "owner@example.test";
  if (/phone/.test(l)) return "(415) 555-0142";
  if (/zip|postal/.test(l)) return "94107";
  if (/address|street|location|office/.test(l) && !/name/.test(l)) return "100 Test Street, San Francisco, CA 94107";
  if (/date/.test(l)) return "10/28/2026";
  if (/employees|number/.test(l)) return "4";
  if (/owner|officer|manager|applicant|organizer|signature|your name|contact/.test(l)) return "Mei Test-Owner";
  return name;
}

async function site(m: Mock, finalIdx: number, steps: { do: string }[], receipt?: string) {
  let sent = 0, paidAt = -1, paid = false;
  const data: Record<string, string> = {};
  const labelOf: Record<string, string> = Object.fromEntries(m.pages.flatMap((p) => [...p.html.matchAll(/<label for="([^"]+)">([^<]+)<\/label>/g)].map((x) => [x[1], x[2].replace(/\s*\*$/, "").trim()])));
  const labels = (h: string) => [...h.matchAll(/<label for="([^"]+)">([^<]+)<\/label>/g)];
  const srv: Server = createServer(async (req, res) => {
    let raw = ""; for await (const c of req) raw += c;
    if (!String(req.headers["content-type"] ?? "").startsWith("multipart")) for (const [k, v] of new URLSearchParams(raw)) if (v) data[k] = v;
    if (req.url === "/paid") { res.writeHead(200); return res.end(paid ? "yes" : "no"); }
    const i = Number(/^\/p\/(\d+)/.exec(new URL(req.url!, "http://x").pathname)?.[1] ?? 0);
    if (i > finalIdx && req.method === "POST" && i === finalIdx + 1) sent++;
    // past the copy's last page: the guide's receipt page, when the copy stops at the fee (Denver's guide ends there)
    if (i >= m.pages.length) {
      if (!receipt) { res.writeHead(303, { location: `/p/${m.pages.length - 1}` }); return res.end(); }
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<!doctype html><html><head><title>${receipt}</title></head><body><h1>${receipt}</h1><p>Confirmation Number: DRY-${m.host.split(".")[0].toUpperCase()}-${1000 + sent}</p></body></html>`);
    }
    const p = m.pages[i];
    // give unlabeled-by-name inputs names so a POST carries them; the receipt page gets the agency's number
    let html = p.html.replace(/<(input|textarea|select) id="([^"]+)"/g, '<$1 id="$2" name="$2"');
    if (steps[i]?.do === "receipt") html += `<p>Confirmation Number: DRY-${m.host.split(".")[0].toUpperCase()}-${1000 + sent}</p>`;
    if (steps[i]?.do === "pay") { paidAt = i; html += `<script>setInterval(() => fetch("/paid").then(r => r.text()).then(t => { if (t === "yes") location.href = "/p/${i + 1}"; }), 100)</script>`; }
    // a review page shows back what was entered, as the agencies' review pages do
    if (["review", "submit", "agree"].includes(steps[i]?.do ?? "") || i === finalIdx) html = Object.entries(data).filter(([k]) => labelOf[k]).map(([k, v]) => `<p>${labelOf[k]}: ${v}</p>`).join("") + html;
    const enc = /type="file"/.test(html) ? ` enctype="multipart/form-data"` : "";
    const body = `<form method="post" action="/p/${i + 1}"${enc}>${html.replace(/<a href="(#[^"]*|javascript:;?)">([^<]*)<\/a>/g, `<a href="/p/${i + 1}">$2</a>`)}</form>`;
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><html><head><title>${p.title}</title></head><body>${body}</body></html>`);
    void labels;
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  return { url: `http://127.0.0.1:${(srv.address() as { port: number }).port}`, sent: () => sent, paidAt: () => paidAt, pay: () => { paid = true; }, close: () => new Promise<void>((r) => srv.close(() => r())) };
}

class Mem implements Store {
  f: Filing;
  constructor(f: Filing) { this.f = f; }
  tasks: string[] = []; docs: string[] = []; logins = 0;
  async claim() { return null; }
  async reload() { return this.f; }
  async step(_f: Filing, e: LogEntry | null, patch: Record<string, unknown> = {}) {
    if (e) this.f.agent_log = [...this.f.agent_log, e];
    for (const [k, v] of Object.entries(patch)) if (!(k === "submit_clicked_at" && this.f.submit_clicked_at)) (this.f as unknown as Record<string, unknown>)[k] = v;
    return { ...this.f };
  }
  async login() { this.logins++; return { username: "dryrun-user", password: "dryrun-pass", host: "127.0.0.1" }; }
  async skill() { return null; }
  async saveSkill(_s: Skill) {}
  async skillFailed() { return { disabled: false }; }
  async selfFiled() { return 99; }   // past the two-key period: this measures the automatic path
  async download() { return new TextEncoder().encode("%PDF-1.4 dry run"); }
  async saveDoc(_f: Filing, name: string) { this.docs.push(name); return `w/receipts/${name}`; }
  async saveProof(_f: Filing, name: string) { return `w/proof/${name}`; }
  async teamTask(_f: Filing | null, kind: string) { this.tasks.push(kind); }
  async notify() {}
  // the person's one tap: the fee paid (or the check done) in the live view
  onHeld: () => void = () => undefined;
  async takeHeld() { const held = this.f.agent_log.some((e) => e.kind === "handoff" || e.ref === "payment" || e.kind === "needs_you"); if (held) { this.onHeld(); await new Promise((r) => setTimeout(r, 400)); } return held; }
}

const BACK = /cancel|edit|save|print|previous|back|draft|mail|sign up|create|register for an account|exit|log ?out/i;
class Scripted implements Model {
  calls = 0;
  async next(i: StepInput): Promise<ToolCall> {
    this.calls++;
    const s = i.state, fields = i.filing.payload.fields ?? [];
    const conf = /Confirmation Number: (\S+)/.exec(s.text);
    if (conf) return { name: "done", input: { confirmation_number: conf[1], summary: "Dry run receipt" } };
    for (const c of s.controls) {
      if (c.type === "password" && !c.value) return { name: "fill_login", input: { selector: c.selector, which: "password" } };
      if (/user ?(name|id)|login id|email address/i.test(c.label ?? "") && !c.value && s.controls.some((x) => x.type === "password")) return { name: "fill_login", input: { selector: c.selector, which: "username" } };
      if (c.type === "file" && !i.recent.some((r) => r.startsWith("upload"))) return { name: "upload", input: { selector: c.selector, attachment: "document.pdf" } };
      const v = fields.find((f) => norm(f.label.en) === norm(c.label ?? ""))?.value;
      if (v && c.value !== v && !["checkbox", "radio", "select"].includes(c.type ?? "")) return { name: "fill", input: { selector: c.selector, value: v } };
    }
    const btn = s.buttons.find((x) => !BACK.test(x.text)) ?? s.links.find((x) => !BACK.test(x.text));
    if (btn) return { name: "click", input: { selector: btn.selector } };
    return { name: "need_person", input: { reason: "no_forward", message: "No way forward on this page." } };
  }
}

const servers: { close(): Promise<void> }[] = [];
after(async () => { for (const s of servers) await s.close(); });
const rows: Record<string, unknown>[] = [];
after(() => { if (process.env.DRYRUN_OUT) writeFileSync(process.env.DRYRUN_OUT, JSON.stringify(rows, null, 2)); });

for (const m of mocks) {
  test(`dry run: ${m.host} (${m.form}) for ${NAMES[m.host] ?? "a test business"}`, async () => {
    const pb = PLAYBOOKS.find((p) => p.host === m.host)!;
    const steps = pb.forms[m.form].steps;
    const finalIdx = steps.findIndex((s) => ["review", "submit", "agree"].includes(s.do) && pb.final.some((f) => f.page ? norm(s.page).includes(norm(f.page)) : !!f.button && s.selector === `button:${f.button}`));
    const w = await site(m, finalIdx, steps, steps.at(-1)?.do === "receipt" ? undefined : pb.receipt?.[0]); servers.push(w);
    const name = NAMES[m.host] ?? "Test Business LLC";
    const labelsSeen = [...new Set(m.pages.flatMap((p) => [...p.html.matchAll(/<label for="[^"]+">([^<]+)<\/label><(input|textarea)(?![^>]*type="(file|checkbox|radio|password)")/g)].map((x) => x[1].replace(/\s*\*$/, "").trim())))];
    const fields = labelsSeen.filter((l) => !/password|user ?(name|id)/i.test(l)).map((l) => ({ label: b(l), value: valueFor(l, /name/i.test(l) && !/owner|contact|your/i.test(l) ? name : name) }));
    const f: Filing = { id: `dry-${m.host}`, workspace_id: "dry", app_id: m.form, title: b(m.form), status: "in_progress", channel: "portal",
      agent_state: "running", agent_log: [{ en: "", zh: "", kind: "two_key_ok" }], handoff_url: null, submit_clicked_at: null, attempts: 1, confirmation_number: null,
      payload: { official: m.form, fields, attachments: [{ name: "document.pdf", path: "dry/document.pdf" }] } };
    const store = new Mem(f), model = new Scripted();
    store.onHeld = () => w.pay();
    const t0 = Date.now();
    const r = await new Worker({ store, model, open: openBrowser, portalOf: (id) => (DEST[id]?.portal ? "127.0.0.1" : null),
      playbookOf: () => ({ playbook: { ...pb, host: "127.0.0.1" }, form: pb.forms[m.form] }), startUrl: () => `${w.url}/p/0`,
      dryRun: false, twoKey: 10, maxSteps: 80, maxMs: 90000, holdMs: 800, pollMs: 100, allowUnverified: true }).run(f).catch((e) => ({ kind: "error", message: String(e) }));
    const last = store.f.agent_log.filter((e) => e.en).slice(-14).map((e) => `${e.kind ?? ""}${e.ref ? `/${e.ref}` : ""}: ${e.en.slice(0, 140)}`);
    rows.push({ host: m.host, form: m.form, business: name, result: (r as { kind?: string } | null)?.kind ?? "none", confirmation: store.f.confirmation_number,
      status: store.f.status, sent: w.sent(), modelSteps: model.calls, pages: m.pages.length, seconds: Math.round((Date.now() - t0) / 1000),
      handedToPerson: store.f.agent_log.filter((e) => e.kind === "handoff" || e.ref === "payment").map((e) => e.ref ?? e.kind), tasks: store.tasks, docs: store.docs, last });
    assert.ok(w.sent() <= 1, "never sent twice");
  });
}
