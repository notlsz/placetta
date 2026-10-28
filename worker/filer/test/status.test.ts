// node --experimental-strip-types --test test/status.test.ts (no browser, no database)
// A portal status check: sign in with the saved login, read the status, check the read in code, take the license.
import { test } from "node:test";
import assert from "node:assert";
import type { PageState } from "../src/guards.ts";
import type { ToolCall } from "../src/model.ts";
import { runStatusCheck, statusPrompt, type StatusJob, type StatusModel, type StatusPage, type StatusResult, type StatusStore } from "../src/status.ts";
import { SupabaseStore } from "../src/store.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const job: StatusJob = { job_id: "j1", filing_id: "f1", workspace_id: "w1", host: "sjpermits.org", tenant: null, start_url: "https://sjpermits.org/login", official: "sj-btr",
  title: { en: "Business tax registration", zh: "营业税登记" }, agency: { en: "City of San José" }, confirmation_number: "BT-778812", submitted_at: "2026-09-01T00:00:00Z" };
const empty = (o: Partial<PageState>): PageState => ({ url: "https://sjpermits.org/", title: "", headings: [], controls: [], buttons: [], links: [], text: "", frames: [], markers: [], ...o });
const SIGNIN = empty({ url: "https://sjpermits.org/login", title: "Sign in", headings: ["Sign in"], buttons: [{ selector: "button:Sign in", text: "Sign in" }],
  controls: [{ selector: "#user", tag: "input", type: "text", label: "Username", name: "user", id: "user", autocomplete: "username", value: "" },
    { selector: "#pw", tag: "input", type: "password", label: "Password", name: "pw", id: "pw", autocomplete: "current-password", value: "" }] });
const LIST = empty({ url: "https://sjpermits.org/records", title: "My records", headings: ["My records"], text: "BT-778812 Business tax registration Status: Issued. Download certificate",
  buttons: [{ selector: "button:Pay fees", text: "Pay fees" }], links: [{ selector: "link:Download certificate", text: "Download certificate", href: "https://sjpermits.org/cert/778812.pdf" }] });

class Page implements StatusPage {
  pages: PageState[]; i = 0; filled: string[] = []; clicked: string[] = []; fetched: string[] = []; closed = false;
  constructor(pages: PageState[]) { this.pages = pages; }
  async goto() {}
  async state() { return this.pages[Math.min(this.i, this.pages.length - 1)]; }
  async fill(sel: string, v: string) { this.filled.push(`${sel}=${v}`); }
  async click(sel: string) { this.clicked.push(sel); this.i++; }
  async wait() {}
  async pdf(url: string) { this.fetched.push(url); return new TextEncoder().encode("%PDF-1.7 license"); }
  async close() { this.closed = true; }
}
class Model implements StatusModel {
  calls = 0; seen: string[] = []; script: ToolCall[];
  constructor(script: ToolCall[]) { this.script = script; }
  async next(i: { job: StatusJob; state: PageState; recent: string[]; signedIn: boolean }) { this.seen.push(statusPrompt(i)); return this.script[this.calls++] ?? { name: "give_up", input: { reason: "script over" } }; }
}
class Store implements StatusStore {
  log: string[] = []; result: StatusResult | null = null; error: string | null = null; login = true;
  async claimStatus() { return job; }
  async beginStatus() { this.log.push("begin"); }
  async statusLogin() { this.log.push("login"); return this.login ? { username: "owner1", password: "pw-secret", host: "sjpermits.org" } : null; }
  async saveLicense(_j: StatusJob, name: string) { this.log.push(`license ${name}`); return `w1/receipts/f1-${name}`; }
  async reportStatus(_j: StatusJob, r: StatusResult | null, e: string | null) { this.result = r; this.error = e; this.log.push("report"); }
  async endStatus() { this.log.push("end"); }
}
const READ = { name: "read_status", input: { state: "issued", status: "Issued", confirmation_seen: "BT-778812", license_link: "https://sjpermits.org/cert/778812.pdf", expires: "2027-12-31" } };

test("signs in with the saved login, reads the status, matches the receipt's number and takes the license", async () => {
  const page = new Page([SIGNIN, LIST]), store = new Store();
  const model = new Model([{ name: "fill_login", input: { selector: "#user", which: "username" } }, { name: "fill_login", input: { selector: "#pw", which: "password" } },
    { name: "click", input: { selector: "button:Sign in" } }, READ]);
  const how = await runStatusCheck(job, { store, model, open: async () => page });
  assert.strictEqual(how, "read:issued");
  assert.deepStrictEqual(page.filled, ["#user=owner1", "#pw=pw-secret"]);
  assert.deepStrictEqual(page.fetched, ["https://sjpermits.org/cert/778812.pdf"]);
  assert.strictEqual(store.result?.matched, true);
  assert.strictEqual(store.result?.license_path, "w1/receipts/f1-license-BT-778812.pdf");
  assert.strictEqual(store.result?.expires, "2027-12-31");
  assert.deepStrictEqual(store.log, ["begin", "login", "license license-BT-778812.pdf", "report", "end"]);
  assert.ok(page.closed);
  // the model never sees the saved login
  assert.ok(!model.seen.some((p) => p.includes("pw-secret") || p.includes("owner1")));
});

test("a read whose number isn't on the page decides nothing and takes no license", async () => {
  const page = new Page([empty({ url: "https://sjpermits.org/records", text: "Status: Issued" })]), store = new Store();
  const how = await runStatusCheck(job, { store, model: new Model([READ]), open: async () => page });
  assert.strictEqual(how, "unmatched");
  assert.strictEqual(store.result?.state, "unknown");
  assert.deepStrictEqual(page.fetched, []);
});

test("never clicks what submits or pays, never types the password into a text box", async () => {
  const page = new Page([LIST]), store = new Store();
  const model = new Model([{ name: "click", input: { selector: "button:Pay fees" } }, { name: "fill_login", input: { selector: "#user", which: "password" } }, READ]);
  await runStatusCheck(job, { store, model, open: async () => page });
  assert.deepStrictEqual(page.clicked, []);
  assert.deepStrictEqual(page.filled, []);
});

test("a CAPTCHA, leaving the portal, or no saved login ends the check: nobody solves it", async () => {
  const cap = new Store();
  assert.strictEqual(await runStatusCheck(job, { store: cap, model: new Model([READ]), open: async () => new Page([empty({ frames: ["https://www.google.com/recaptcha/api2/bframe"], text: "I'm not a robot" })]) }), "captcha");
  assert.match(cap.error ?? "", /nobody solves it/);
  const off = new Store();
  assert.strictEqual(await runStatusCheck(job, { store: off, model: new Model([READ]), open: async () => new Page([empty({ url: "https://evil.example/" })]) }), "off_portal");
  const none = new Store(); none.login = false;
  let opened = false;
  assert.strictEqual(await runStatusCheck(job, { store: none, model: new Model([READ]), open: async () => { opened = true; return new Page([LIST]); } }), "no_login");
  assert.strictEqual(opened, false);
});

test("the store reaches the database only through the status functions, with the run's token, auditing before the password", async () => {
  const calls: { fn: string; args: Record<string, unknown>; headers?: Record<string, string> }[] = [];
  const client = (headers: Record<string, string> = {}) => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args, headers });
      if (fn === "filer_status_begin") return { data: "t".repeat(64), error: null };
      if (fn === "filer_status_logins") return { data: [{ id: "l1", url: "https://sjpermits.org/" }], error: null };
      if (fn === "filer_status_open_login") return { data: [{ username: "u", password: "p" }], error: null };
      return { data: null, error: null };
    },
    from: (t: string) => { throw new Error(`table access: ${t}`); },
  }) as unknown as SupabaseClient;
  const s = new SupabaseStore("https://x.supabase.co", "k", client(), client);
  await s.beginStatus(job);
  assert.deepStrictEqual(await s.statusLogin(job, "sjpermits.org"), { username: "u", password: "p", host: "sjpermits.org" });
  await s.reportStatus(job, null, "x");
  await s.endStatus(job);
  assert.deepStrictEqual(calls.map((c) => c.fn), ["filer_status_begin", "filer_status_logins", "filer_status_open_login", "filer_status_report", "filer_status_end"]);
  assert.strictEqual(calls[2].headers?.["x-filer-run"], "t".repeat(64));
});
