// npm test: the owner decides how a CAPTCHA mid-run is handled (captcha.ts, run.ts captchaChoice). What must hold:
//   - the workspace's saved answer for the site decides without asking: "route" leaves with nothing submitted (the file
//     function sends it another way), "me" hands the page to the owner, "team" goes to the Placetta team first
//   - with no saved answer, the run pauses with the page live and nothing submitted, and the owner is asked in EN and ZH
//     with the real other way and how much slower it usually is; their answer is followed
//   - no answer within the hold parks the run for the team, nothing submitted
//   - after the submit was pressed, "another way" would be a second filing: it goes to the team instead
//   - nothing is ever solved: the portal's submit count stays 0 while a CAPTCHA is on the page
import { test, after } from "node:test";
import assert from "node:assert";
import { openBrowser } from "../src/main.ts";
import type { Model, StepInput, ToolCall } from "../src/model.ts";
import { Worker } from "../src/run.ts";
import type { Store } from "../src/store.ts";
import type { Filing, LogEntry, Skill } from "../src/types.ts";
import { captchaQuestion, midRunAction, type CaptchaChoice } from "../../../supabase/functions/file/captcha.ts";
import { startPortal, type Portal } from "./portal/server.ts";

const b = (s: string) => ({ en: s, zh: s });
const VALUES: [string, string][] = [["Legal name", "Acme Noodles LLC"], ["Business address", "1 Main St, San Jose, CA"]];
const filing = (): Filing => ({ id: "f1", workspace_id: "w", app_id: "llc", title: b("LLC"), status: "in_progress", channel: "portal", agent_state: "running", agent_log: [],
  handoff_url: null, submit_clicked_at: null, attempts: 1, confirmation_number: null,
  payload: { official: "test-llc", fields: VALUES.map(([l, v]) => ({ label: b(l), value: v })) } });

class Mem implements Store {
  f = filing(); saved: CaptchaChoice | null = null; tasks: string[] = []; notes: string[] = []; answer: CaptchaChoice | null = null;
  privacy = { synthetic: false, strict: false, screen: true, teach: true };
  async recordingPolicy() { return this.privacy; }
  async claim() { return null; }
  async reload() {
    // the owner answers in the app once the question is in the log (the file function writes kind captcha_choice)
    if (this.answer && this.f.agent_log.some((e) => e.ref === "captcha_choice" && e.kind === "need_person") && !this.f.agent_log.some((e) => e.kind === "captcha_choice"))
      this.f.agent_log = [...this.f.agent_log, { en: "answer", zh: "answer", kind: "captcha_choice", ref: this.answer } as LogEntry];
    return this.f;
  }
  async step(_f: Filing, e: LogEntry | null, patch: Record<string, unknown> = {}) {
    if (e) this.f.agent_log = [...this.f.agent_log, e];
    for (const [k, v] of Object.entries(patch)) (this.f as unknown as Record<string, unknown>)[k] = v;
    return { ...this.f };
  }
  async login() { return { username: "demo", password: "s3cret", host: "127.0.0.1" }; }
  async skill() { return null; }
  async saveSkill(_s: Skill) {}
  async skillFailed() { return { disabled: false }; }
  async selfFiled() { return 99; }
  async download() { return new TextEncoder().encode("%PDF-1.4 test"); }
  async saveDoc(_f: Filing, name: string) { return `w/receipts/${name}`; }
  async saveProof(_f: Filing, name: string) { return `w/proof/${name}`; }
  async teamTask(_f: Filing | null, kind: string) { this.tasks.push(kind); }
  async notify(_f: Filing, t: { en: string }) { this.notes.push(t.en); }
  async captchaChoice() { return this.saved; }
}
class Scripted implements Model {
  calls = 0;
  async next(i: StepInput): Promise<ToolCall> {
    this.calls++;
    const s = i.state;
    for (const c of s.controls) {
      if (c.type === "password" && !c.value) return { name: "fill_login", input: { selector: c.selector, which: "password" } };
      if (c.label === "Username" && !c.value) return { name: "fill_login", input: { selector: c.selector, which: "username" } };
      const v = i.filing.payload.fields?.find((f) => f.label.en === c.label)?.value;
      if (v && c.value !== v) return { name: "fill", input: { selector: c.selector, value: v } };
    }
    return { name: "click", input: { selector: s.buttons[0]?.selector ?? s.links[0].selector } };
  }
}
const portals: Portal[] = [];
after(async () => { for (const p of portals) await p.close(); });
const go = async (store: Mem, holdMs = 1500) => {
  const p = await startPortal({ captcha: true }); portals.push(p);
  const r = await new Worker({ store, model: new Scripted(), open: openBrowser, portalOf: () => "127.0.0.1", startUrl: () => p.url + "/", altOf: () => "email",
    dryRun: false, twoKey: 10, maxSteps: 40, maxMs: 60000, holdMs, pollMs: 50 }).run(store.f);
  return { r, p };
};
const asked = (s: Mem) => s.f.agent_log.find((e) => e.kind === "need_person" && e.ref === "captcha_choice");

test("the question: the three answers in EN and ZH, the real other way and how much slower; (c) left out when there's none", () => {
  const q = captchaQuestion("mail", 5, true);
  assert.match(q.en, /\(a\) I'll do it when it comes up, one tap on my phone\. \(b\) Placetta's team does it\. \(c\) Send it another way: by mail, usually about 5 days slower\./);
  assert.match(q.en, /paused with the page open and nothing sent/);
  assert.match(q.zh, /\(c\) 改用其他方式提交：通过邮寄，通常约慢 5 天/);
  assert.match(captchaQuestion("email", null).en, /not sure how much slower/);
  assert.ok(!/\(c\)/.test(captchaQuestion(null, null).en));
  assert.ok(!/[–—]/.test(q.en + q.zh + captchaQuestion("fax", 0).en), "no em or en dashes");
  // after the submit, another way would send it twice: the team instead
  assert.equal(midRunAction("route", true), "team");
  assert.equal(midRunAction("route", false), "route");
  assert.equal(midRunAction("ask", false), "me");
});

test("saved \"another way\": the run leaves the site with nothing submitted and hands it to the file function's reroute", async () => {
  const s = new Mem(); s.saved = "route";
  const { r, p } = await go(s);
  assert.equal(r?.kind, "handoff");
  assert.equal((r as { reason: string }).reason, "captcha_reroute");
  assert.equal(p.submissions, 0);
  assert.ok(!asked(s), "a saved answer isn't asked again");
  assert.ok(!s.f.submit_clicked_at);
});

test("no saved answer: asked with the page live and nothing sent; the answer is followed", async () => {
  const s = new Mem(); s.answer = "route";
  const { r, p } = await go(s);
  const q = asked(s)!;
  assert.ok(q, "the owner was asked");
  assert.match(q.en, /Send it another way: by email, usually about 1 day slower/);
  assert.match(q.zh, /通过邮件/);
  assert.ok(s.notes.length > 0, "and told on their channel");
  assert.equal((r as { reason: string }).reason, "captcha_reroute");
  assert.equal(p.submissions, 0);
});

test("no answer within the hold: the run parks for the team, nothing submitted", async () => {
  const s = new Mem();
  const { r, p } = await go(s, 400);
  assert.equal(r?.kind, "handoff");
  assert.equal((r as { reason: string }).reason, "captcha_unanswered");
  assert.ok(s.tasks.includes("captcha_unanswered"), "the team is told");
  assert.equal(p.submissions, 0);
});

test("saved \"me\": straight to the owner's one tap, never the team's queue", async () => {
  const s = new Mem(); s.saved = "me";
  const { r, p } = await go(s, 300);
  assert.ok(!asked(s));
  assert.ok(s.f.agent_log.some((e) => e.kind === "need_person" && e.ref !== "captcha_choice"), "the owner's hand-back");
  assert.ok(r?.kind === "needs_you" || r?.kind === "handoff");
  assert.equal(p.submissions, 0);
});
