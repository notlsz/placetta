// npm test: the review gate on a skill Odelia records for herself (skillcheck.ts, run.ts learn). Hermes Agent's own
// skills are its attack surface; here a recording that adds a host, a payment step or a recipient line is saved off and
// waits for the team, and the same steps again, or fewer, carry on as before.
import { test } from "node:test";
import assert from "node:assert";
import { reviewSkill } from "../src/skillcheck.ts";
import { Worker } from "../src/run.ts";
import { openBrowser } from "../src/main.ts";
import type { Model } from "../src/model.ts";
import type { Store } from "../src/store.ts";
import type { Filing, Skill, TraceStep } from "../src/types.ts";

const HOST = "bizfileonline.sos.ca.gov";
const fill = (selector: string, url = `https://${HOST}/form`, extra: Partial<TraceStep> = {}): TraceStep => ({ action: "fill", selector, field: "Legal name", url, heading: "Business", at: 0, ...extra } as TraceStep);
const click = (selector: string, url = `https://${HOST}/form`, heading = "Business"): TraceStep => ({ action: "click", selector, url, heading, at: 0 });
const BASE = [fill("label:Legal name"), fill("label:Business email"), click("button:Continue"), click("button:Submit")];

test("the same steps again, or a first recording on the portal's own hosts, carry on without review", () => {
  assert.deepEqual(reviewSkill(BASE, BASE, [HOST]), { hold: false, why: [] });
  assert.deepEqual(reviewSkill(null, BASE, [HOST]), { hold: false, why: [] });
  assert.equal(reviewSkill(BASE, BASE.slice(0, 2), [HOST]).hold, false, "fewer steps add nothing");
});

test("a new host, a payment step or a new recipient line waits for the team", () => {
  const host = reviewSkill(BASE, [...BASE, click("button:Continue", "https://forms.evil.example/x")], [HOST]);
  assert.ok(host.hold && /new host: forms\.evil\.example/.test(host.why[0]));
  const sub = reviewSkill(BASE, [...BASE, click("button:Next", `https://pay.${HOST}/x`)], [HOST]);
  assert.ok(sub.hold, "a subdomain the earlier skill never visited is a new host too");
  const pay = reviewSkill(BASE, [...BASE, fill("label:Card number", `https://${HOST}/form`, { card: "number" } as Partial<TraceStep>)], [HOST]);
  assert.ok(pay.hold && /payment step/.test(pay.why.join()));
  const checkout = reviewSkill(BASE, [...BASE, click("button:Pay now", `https://${HOST}/checkout`, "Checkout")], [HOST]);
  assert.ok(checkout.hold && /payment step/.test(checkout.why.join()));
  const cc = reviewSkill(BASE, [...BASE, fill("label:Send a copy to")], [HOST]);
  assert.ok(cc.hold && /new recipient line: label:Send a copy to/.test(cc.why.join()));
  assert.ok(reviewSkill(null, [...BASE, click("button:Pay fee", `https://${HOST}/payment`)], [HOST]).hold, "a first recording with a payment step waits too");
  assert.ok(reviewSkill(null, [click("button:Go", "https://evil.example/")], [HOST]).hold, "and one off the run's own hosts");
});

test("learn: a held recording is saved off with why and goes to the team; a clean one is saved as before", async () => {
  const saved: Skill[] = [], held: { s: Skill; why: string[] }[] = [], tasks: string[] = [];
  const store = { saveSkill: async (s: Skill) => { saved.push(s); }, holdSkill: async (s: Skill, why: string[]) => { held.push({ s, why }); }, teamTask: async (_f: Filing | null, kind: string, title: string) => { tasks.push(`${kind} ${title}`); } } as unknown as Store;
  const w = new Worker({ store, model: {} as Model, open: openBrowser, portalOf: () => HOST, startUrl: () => `https://${HOST}/`, dryRun: true, twoKey: 10, maxSteps: 10, maxMs: 1000, holdMs: 10, pollMs: 10 });
  const f = { id: "f1", workspace_id: "w1", payload: { official: "ca-llc", form: { en: "LLC-1", zh: "LLC-1" } } } as unknown as Filing;
  const old: Skill = { key: `portal:${HOST}:ca-llc`, name: "LLC-1", enabled: true, uses: 3, fails_in_a_row: 0, last_seconds: 60, best_seconds: 50, body: { version: 1, steps: BASE } };
  const learn = (w as unknown as { learn: (k: string, f: Filing, r: unknown, o: Skill | null, h: string[]) => Promise<void> }).learn.bind(w);
  await learn(old.key, f, { kind: "submitted", confirmation: "X", summary: "", trace: [...BASE, fill("label:Notify email")], seconds: 40, replayed: false }, old, [HOST]);
  assert.equal(saved.length, 0);
  assert.equal(held.length, 1);
  assert.equal(held[0].s.enabled, false);
  assert.ok(/new recipient line/.test(held[0].why.join()));
  assert.ok(tasks[0].startsWith("playbook_review Review the steps Odelia recorded"));
  await learn(old.key, f, { kind: "submitted", confirmation: "X", summary: "", trace: BASE, seconds: 40, replayed: false }, old, [HOST]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].enabled, true);
});
