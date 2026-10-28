// deno test supabase/functions/monitor/stage_test.ts
// Stage alerts (stage.ts): every stage a filing reaches is announced once, right away, to each person in charge of it,
// the way they chose; and the morning run (filingUpdates) never announces it a second time.
import "./test_env.ts";
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { stageAlert, stageRecipients, stageText, stageUpdates, STAGES, type StageDb, type StageFiling, type StageOut, type StageUpdate } from "./stage.ts";
import { filingUpdates } from "./index.ts";
import type { Person } from "../_shared/notices.ts";

const WS = "11111111-1111-4111-8111-111111111111";
const filing = (o: Partial<StageFiling> = {}): StageFiling => ({
  id: "f1", workspace_id: WS, app_id: "fse", title: { en: "Food Service Establishment Permit", zh: "食品服务场所许可证" },
  status: "submitted", agent_state: null, updated_at: "2026-10-22T15:00:00Z", confirmation_number: "DOH-48213", note: null,
  payment_url: null, approved_by: "u-member", channel: "portal", ...o,
});
const OWNER: Person = { email: "mei@luckyleaf.example", confirmed: true, phone: null };
const TEXTER: Person = { email: "jun@luckyleaf.example", confirmed: true, phone: { lang: "zh", texts: true } };
const NOBODY: Person = { email: "new@luckyleaf.example", confirmed: false, phone: null };

/** A workspace in memory: its people, its saved Updates, and everything sent. */
function world(o: { f?: StageFiling; members?: { user_id: string; role: string }[]; people?: Record<string, Person>; state?: unknown } = {}) {
  const saved = new Set<string>(), mails: { to: string; subject: string; text: string }[] = [], texts: { user_id: string; body: string; dedupe: string }[] = [], chats: StageUpdate[][] = [];
  let f = o.f ?? filing(), flushed = 0;
  const members = o.members ?? [{ user_id: "u-owner", role: "owner" }, { user_id: "u-member", role: "member" }, { user_id: "u-viewer", role: "member" }];
  const people = o.people ?? { "u-owner": OWNER, "u-member": TEXTER, "u-viewer": OWNER };
  // the approver told Odelia "text me" (src/recall.ts): only a saved preference makes a linked phone the way to reach them
  const state = o.state ?? { memories: { "u-member": { items: [{ kind: "preference", status: "saved", reach: "text", at: "2026-10-01" }] } } };
  const db: StageDb = {
    filing: async (id) => (id === f.id ? f : null),
    workspace: async () => ({ name: "Lucky Leaf Tea", state }),
    members: async () => members,
    person: async (uid) => people[uid] ?? NOBODY,
    save: async (u) => { if (saved.has(u.dedupe)) return false; saved.add(u.dedupe); return true; },
  };
  const out: StageOut = {
    mail: async (to, subject, text) => { mails.push({ to, subject, text }); return true; },
    text: async (row) => { texts.push(row); return true; },
    chats: async (_ws, _b, items) => { chats.push(items); return 1; },
    flush: async () => { flushed++; },
  };
  return { db, out, saved, mails, texts, chats, flushed: () => flushed, set: (g: Partial<StageFiling>) => { f = { ...f, ...g }; } };
}

Deno.test("every stage has its own words, in English and Chinese", () => {
  for (const s of STAGES) {
    const [u] = stageUpdates(filing({ status: s }));
    assert(u, `${s} is announced`);
    assert(u.title.en.includes("Food Service Establishment Permit") && u.title.zh.includes("食品服务场所许可证"), `${s}: names the filing in both languages`);
    assertEquals(u.dedupe, `filing:f1:${s}:2026-10-22`);
  }
  assertEquals(stageUpdates(filing({ status: "submitted" }))[0].body?.en, "Confirmation DOH-48213.");
  assertEquals(stageUpdates(filing({ status: "in_progress" }))[0].body?.en, "It goes to the agency on the agency's site.");
  assertEquals(stageUpdates(filing({ status: "requested" })).length, 0, "the person's own approval isn't announced back to them");
  assertEquals(stageUpdates(filing({ status: "canceled" })).length, 0);
  const needs = stageUpdates(filing({ status: "in_progress", agent_state: "needs_you" }));
  assertEquals(needs.map((u) => u.dedupe.split(":")[0]), ["filing", "needs_you"], "a step that needs the person is its own alert");
});

Deno.test("in charge: the owners and whoever approved it, each once", () => {
  const m = [{ user_id: "a", role: "owner" }, { user_id: "b", role: "member" }, { user_id: "c", role: "owner" }, { user_id: "d", role: "member" }];
  assertEquals(stageRecipients(m, "b"), ["a", "c", "b"]);
  assertEquals(stageRecipients(m, "a"), ["a", "c"], "an owner who approved it hears once");
  assertEquals(stageRecipients(m, "stranger"), ["a", "c"], "someone no longer in the workspace hears nothing");
  assertEquals(stageRecipients(m, null), ["a", "c"]);
});

Deno.test("submitted is Odelia's own progress: in the app and the team chat, no email or text to anyone", async () => {
  const w = world();
  const r = await stageAlert(w.db, w.out, { app: "https://app.placetta.com", filingId: "f1" });
  assertEquals({ updates: r.updates, emailed: r.emailed, texted: r.texted, chats: r.chats, quiet: r.quiet }, { updates: 1, emailed: 0, texted: 0, chats: 1, quiet: 1 });
  assertEquals(w.flushed(), 0);
});

Deno.test("the agency asks for something: the owner is emailed, the approver who asked for texts is texted, at once, one tap to the filing", async () => {
  const w = world({ f: filing({ status: "needs_info", note: "Upload the floor plan." }) });
  const r = await stageAlert(w.db, w.out, { app: "https://app.placetta.com", filingId: "f1" });
  assertEquals({ updates: r.updates, emailed: r.emailed, texted: r.texted, chats: r.chats }, { updates: 1, emailed: 1, texted: 1, chats: 1 });
  assertEquals(w.mails[0].to, "mei@luckyleaf.example");
  assertEquals(w.mails[0].subject, "Action needed: Food Service Establishment Permit (Lucky Leaf Tea)");
  assert(w.mails[0].text.includes("Upload the floor plan.") && w.mails[0].text.includes(`https://app.placetta.com/app/?ws=${WS}&open=fse`), "the email says what and opens the filing itself");
  assertEquals(w.texts[0].user_id, "u-member");
  assert(w.texts[0].body.startsWith("快哉：需要您处理"), "texted in the phone's language");
  assertEquals(w.flushed(), 1, "texts go out now, not at the next sweep");
  assert(!w.mails.some((m) => m.to === "jun@luckyleaf.example"), "the texter isn't emailed too");
  assertEquals(w.mails.length, 1, "a member who isn't in charge (u-viewer) isn't told");
});

Deno.test("from start to approval, the owner is reached only when the agency asks for something", async () => {
  const w = world();
  const seen: string[] = [];
  for (const s of ["in_progress", "submitted", "needs_info", "submitted", "accepted"]) {
    w.set({ status: s, updated_at: s === "accepted" ? "2026-11-03T10:00:00Z" : `2026-10-${s === "in_progress" ? "22" : s === "needs_info" ? "24" : seen.includes("needs_info") ? "27" : "23"}T10:00:00Z` });
    const r = await stageAlert(w.db, w.out, { app: "", filingId: "f1" });
    assertEquals(r.updates, 1, `${s} is in the timeline`);
    seen.push(s);
  }
  assertEquals(w.mails.map((m) => m.subject.split(":")[0]), ["Action needed"]);
  assertEquals(w.texts.length, 1, "and the approver had only that by text");
  assertEquals(w.chats.length, 5, "a linked team chat still sees every stage");
});

Deno.test("a live step on the agency's page (a CAPTCHA, a code): reached at once, told it's one short step that's waiting", async () => {
  const w = world({ f: filing({ status: "in_progress", agent_state: "needs_you", handoff_url: "https://live.example/v/1" }) });
  const r = await stageAlert(w.db, w.out, { app: "https://app.placetta.com", filingId: "f1" });
  assertEquals({ emailed: r.emailed, texted: r.texted, quiet: r.quiet }, { emailed: 1, texted: 1, quiet: 1 });
  assert(/One short step on the agency's page/.test(w.mails[0].text) && /页面已打开等候/.test(w.texts[0].body));
  assert(!w.mails[0].text.includes("live.example"), "the live browser's own address never goes in a message: the link opens the filing in the app");
});

Deno.test("the same stage twice is announced once", async () => {
  const w = world({ f: filing({ status: "rejected", note: "Wrong address." }) });
  await stageAlert(w.db, w.out, { app: "", filingId: "f1" });
  const again = await stageAlert(w.db, w.out, { app: "", filingId: "f1" });
  assertEquals(again.updates, 0);
  assertEquals(again.skipped, "already announced");
  assertEquals(w.mails.length, 1);
  assertEquals(w.texts.length, 1);
});

Deno.test("the morning run never repeats a stage already announced live", async () => {
  const w = world();
  await stageAlert(w.db, w.out, { app: "", filingId: "f1" });
  const morning = filingUpdates({ ...filing(), title: { en: "Food Service Establishment Permit", zh: "食品服务场所许可证" }, approved_at: null, customer_paid_at: null, fee_paid: null } as never, "2026-10-21T00:00:00Z", Date.parse("2026-10-23T12:00:00Z"));
  assert(morning.length >= 1, "the morning run still sees the stage");
  assert(morning.every((u) => w.saved.has(u.dedupe)), "with the same key, so saving it again is a no-op and nothing is resent");
});

Deno.test("someone with no confirmed email and no phone still sees it in the app", async () => {
  const w = world({ f: filing({ status: "needs_info" }), members: [{ user_id: "u-new", role: "owner" }], people: { "u-new": NOBODY } });
  const r = await stageAlert(w.db, w.out, { app: "", filingId: "f1" });
  assertEquals({ updates: r.updates, emailed: r.emailed, texted: r.texted, app_only: r.app_only }, { updates: 1, emailed: 0, texted: 0, app_only: 1 });
});

Deno.test("someone who told Odelia \"text me, don't email\" gets a text, never an email", async () => {
  const state = { memories: { "u-owner": { items: [{ kind: "preference", status: "saved", reach: "text", avoid: ["email"], at: "2026-10-01" }] } } };
  const w = world({ f: filing({ status: "rejected" }), state, people: { "u-owner": { ...OWNER, phone: { lang: "en", texts: true } }, "u-member": TEXTER, "u-viewer": OWNER } });
  await stageAlert(w.db, w.out, { app: "", filingId: "f1" });
  assert(w.texts.some((t) => t.user_id === "u-owner"), "texted");
  assert(!w.mails.some((m) => m.to === OWNER.email), "not emailed");
});

Deno.test("someone who said not to email them and has no phone sees it in the app only", async () => {
  const state = { memories: { "u-owner": { items: [{ kind: "preference", status: "saved", avoid: ["email"], at: "2026-10-01" }] } } };
  const w = world({ f: filing({ status: "needs_info" }), state, members: [{ user_id: "u-owner", role: "owner" }] });
  const r = await stageAlert(w.db, w.out, { app: "", filingId: "f1" });
  assertEquals({ emailed: r.emailed, texted: r.texted, app_only: r.app_only }, { emailed: 0, texted: 0, app_only: 1 });
});

Deno.test("an unknown filing, or a stage that isn't announced, sends nothing", async () => {
  const w = world();
  assertEquals((await stageAlert(w.db, w.out, { app: "", filingId: "nope" })).skipped, "no such filing");
  w.set({ status: "requested" });
  const r = await stageAlert(w.db, w.out, { app: "", filingId: "f1" });
  assertEquals(r.skipped, "not a stage that's announced");
  assertEquals(w.mails.length + w.texts.length, 0);
});

Deno.test("a text fits one message and names the business", () => {
  const [u] = stageUpdates(filing({ status: "accepted" }));
  const t = stageText(u, "Lucky Leaf Tea", "en");
  assert(t.startsWith("Placetta: Approved by the agency: Food Service Establishment Permit (Lucky Leaf Tea)."));
  assert(t.length <= 300);
});
