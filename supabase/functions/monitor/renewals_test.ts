// deno test supabase/functions/monitor/renewals_test.ts
// Renewal jobs: every permit expiring within 60 days, or lapsed, gets one job (worded normal, urgent or lapsed), and
// never two for the same permit and expiry. It used to start only for a renewal first seen 31 to 60 days out.
import "./test_env.ts";
import { deepStrictEqual as eq, ok } from "node:assert";
import { LAPSED_DAYS, renewalJobs, renewalKey, startRenewals, type RenewalIO } from "./index.ts";
import { urgency } from "../_shared/odelia.ts";

const today = "2026-10-17";
const add = (n: number) => new Date(Date.parse(today + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const CJK = /[一-鿿]/;
const dl = (id: string, n: number, title: string, app?: string) => ({ id, date: add(n), kind: "renewal", title: { en: title, zh: title === "Sign permit renewal" ? "招牌许可续期" : title }, ...(app ? { app } : {}) });
const store = (permits: { name: string; zh?: string; n: number }[], apps: string[] = []) => ({ id: "st-1", name: { en: "Flushing", zh: "法拉盛" }, stage: "open", apps,
  permits: permits.map((p) => ({ name: { en: p.name, zh: p.zh ?? p.name }, expires: add(p.n) })) });

Deno.test("first seen 31 to 60 days out: a normal job, and no extra Update", () => {
  const [j, ...rest] = renewalJobs("w", { deadlines: [dl("d1", 45, "Renew the sign permit", "app-sign")] }, today);
  eq(rest.length, 0);
  eq([j.urgency, j.days, j.expires, j.permit, j.app_id, j.update], ["normal", 45, add(45), "app:app-sign", "app-sign", null]);
  ok(j.prompt.startsWith(`Start the renewal: sign permit, expiring ${add(45)}. Find the agency's renewal form`), j.prompt);
  eq(j.title, { en: "Renewal started: sign permit", zh: "已开始续办：sign permit" });
  ok(!/urgent|lapsed/i.test(j.prompt));
});

Deno.test("first seen inside 30 days: an urgent job, and an Update for the owner in both languages", () => {
  const [j] = renewalJobs("w", { deadlines: [dl("d1", 12, "Sign permit renewal", "app-sign")] }, today);
  eq([j.urgency, j.days], ["urgent", 12]);
  ok(/^Start the renewal: Sign permit, expiring \d{4}-\d{2}-\d{2}, in 12 days\. This is urgent: do it today\./.test(j.prompt), j.prompt);
  eq(j.title, { en: "Urgent renewal started: Sign permit", zh: "已开始紧急续办：招牌许可" });
  ok(j.update && j.update.kind === "renewal" && j.update.app_id === "app-sign" && j.update.dedupe === `renewal-job:app:app-sign:${add(12)}`);
  ok(/^Urgent: Sign permit expires in 12 days$/.test(j.update!.title.en) && CJK.test(j.update!.title.zh) && /approval/.test(j.update!.body!.en) && CJK.test(j.update!.body!.zh), JSON.stringify(j.update));
  // the Update stays in the app and email: the existing 7- and 1-day reminders are what reach the phone
  eq(urgency(j.update!, new Set()), null);
  // today and tomorrow read as words
  ok(/expiring \S+, today\./.test(renewalJobs("w", { deadlines: [dl("d1", 0, "Sign permit renewal")] }, today)[0].prompt));
  ok(/, tomorrow\./.test(renewalJobs("w", { deadlines: [dl("d1", 1, "Sign permit renewal")] }, today)[0].prompt));
});

Deno.test("already lapsed: a lapsed job telling the owner to stop that activity if the law requires it, and to file now", () => {
  const [j] = renewalJobs("w", { stores: [store([{ name: "Place of assembly permit", zh: "集会场所许可", n: -3 }])] }, today);
  eq([j.urgency, j.days, j.permit, j.app_id], ["lapsed", -3, "store:st-1:place of assembly permit", null]);
  ok(/^Start the renewal: Place of assembly permit at Flushing, which expired on \S+, 3 days ago\. It has lapsed\./.test(j.prompt), j.prompt);
  ok(/already renewed/.test(j.prompt) && /renewal or reinstatement/.test(j.prompt) && /stop that activity until it's renewed/.test(j.prompt) && /check with the agency/.test(j.prompt) && /no other legal advice/.test(j.prompt));
  eq(j.title, { en: "Lapsed permit, renewal started: Place of assembly permit at Flushing", zh: "许可已过期，已开始续办：法拉盛的集会场所许可" });
  const u = j.update!;
  ok(u.title.en === "Lapsed: Place of assembly permit at Flushing. Odelia started the renewal" && CJK.test(u.title.zh), u.title.en);
  ok(/stop that activity until it's renewed/.test(u.body!.en) && /renewal or reinstatement now/.test(u.body!.en) && /Check with the agency/.test(u.body!.en), u.body!.en);
  ok(/暂停/.test(u.body!.zh) && /恢复申请/.test(u.body!.zh) && /主管机构确认/.test(u.body!.zh), u.body!.zh);
  // a renewal reminder that lapsed gets one too (it used to get nothing at all)
  eq(renewalJobs("w", { deadlines: [dl("d2", -10, "Business tax certificate renewal")] }, today)[0]?.urgency, "lapsed");
});

Deno.test("out of range: nothing beyond 60 days, nothing lapsed longer than 90, nothing for other deadlines", () => {
  eq(renewalJobs("w", { deadlines: [dl("d1", 61, "Renew")] }, today), []);
  eq(renewalJobs("w", { deadlines: [dl("d1", -LAPSED_DAYS - 1, "Renew")] }, today), []);
  eq(renewalJobs("w", { deadlines: [{ id: "d1", date: add(5), kind: "due", title: { en: "File", zh: "File" } }] }, today), []);
  eq(renewalJobs("w", null, today), []);
  eq(renewalJobs("w", { deadlines: "x", stores: [{ id: 3 }, { id: "s", permits: [{ name: "", expires: add(3) }, { name: "x", expires: "soon" }] }] }, today), []);
});

Deno.test("one job per permit: a permit and its renewal reminder, two reminders, and a lapsed record that was renewed", () => {
  // the store's sign permit and the reminder on its application are the same permit: one job, the soonest
  const both = renewalJobs("w", { apps: [{ id: "app-sign", name: { en: "Sign permit", zh: "招牌许可" } }], deadlines: [dl("d1", 45, "Renew the sign permit", "app-sign"), dl("d2", 20, "Sign permit renewal", "app-sign")],
    stores: [store([{ name: "Sign permit", n: 20 }], ["app-sign"])] }, today);
  eq(both.map((j) => [j.permit, j.days, j.urgency]), [["app:app-sign", 20, "urgent"]]);
  // a lapsed record with a later expiry on file was renewed: no job for the old one
  eq(renewalJobs("w", { stores: [store([{ name: "Food permit", n: -5 }, { name: "Food permit", n: 300 }])] }, today), []);
  // different permits each get their own
  eq(renewalJobs("w", { stores: [store([{ name: "Food permit", n: 40 }, { name: "Sign permit", n: 10 }])] }, today).map((j) => j.urgency).sort(), ["normal", "urgent"]);
});

/** The claims table and agent-run, in memory. */
function fakeIO(o: { failStarts?: number } = {}) {
  const claims = new Map<string, { run?: string }>(), started: string[] = [], updates: string[] = [];
  let fail = o.failStarts ?? 0;
  const io: RenewalIO = {
    open: async (ws, key, since) => [...claims.keys()].some((k) => { const [w, kk, d] = k.split("|"); return w === ws && kk === key && d >= since; }),
    claim: async (ws, key, expires) => { const k = `${ws}|${key}|${expires}`; if (claims.has(k)) return false; claims.set(k, {}); return true; },
    release: async (ws, key, expires) => { claims.delete(`${ws}|${key}|${expires}`); },
    started: async (ws, key, expires, run) => { claims.get(`${ws}|${key}|${expires}`)!.run = run; },
    start: async (_ws, prompt) => { if (fail > 0) { fail--; return null; } started.push(prompt); return `run-${started.length}`; },
    update: async (u) => { updates.push(u.dedupe); },
  };
  return { io, claims, started, updates };
}

Deno.test("never two jobs for the same permit and expiry, run after run, as the days count down", async () => {
  const f = fakeIO();
  const state = { deadlines: [dl("d1", 45, "Renew the sign permit", "app-sign")], stores: [store([{ name: "Place of assembly permit", n: -3 }])] };
  eq(await startRenewals("w", renewalJobs("w", state, today), today, f.io), 2);
  eq(await startRenewals("w", renewalJobs("w", state, today), today, f.io), 0, "the same day again");
  // 20 days on, the sign permit is urgent (12 days out) and the lapse is 23 days old: still the same jobs
  const later = add(20);
  eq(renewalJobs("w", state, later).map((j) => j.urgency).sort(), ["lapsed", "urgent"]);
  eq(await startRenewals("w", renewalJobs("w", state, later), later, f.io), 0, "as it gets urgent");
  eq(f.started.length, 2);
  eq(f.updates, [`renewal-job:store:st-1:place of assembly permit:${add(-3)}`], "only the lapsed one left an Update; the normal one didn't");
  ok([...f.claims.keys()].every((k) => k.includes(renewalKey("app:app-sign")) || k.includes(renewalKey("store:st-1:place of assembly permit"))) && [...f.claims.values()].every((c) => c.run));
});

Deno.test("an open job for a permit holds a second reminder for it; a renewed permit's next cycle gets a new job", async () => {
  const f = fakeIO();
  await startRenewals("w", renewalJobs("w", { deadlines: [dl("d1", 20, "Sign permit renewal", "app-sign")] }, today), today, f.io);
  // someone adds another reminder for the same application with a different date: the open job covers it
  eq(await startRenewals("w", renewalJobs("w", { deadlines: [dl("d9", 50, "Renew the sign permit", "app-sign")] }, today), today, f.io), 0);
  // a year on, the renewed permit comes due again: its new expiry gets its own job
  const next = add(330);
  eq(await startRenewals("w", renewalJobs("w", { deadlines: [dl("d1", 380, "Sign permit renewal", "app-sign")] }, next), next, f.io), 1);
  eq(f.started.length, 2);
});

Deno.test("a few at a time, most urgent first: the rest start on the next days", async () => {
  const f = fakeIO();
  const state = { stores: [store([{ name: "Food permit", n: 50 }, { name: "Sign permit", n: 9 }, { name: "Assembly permit", n: -2 }])] };
  eq(await startRenewals("w", renewalJobs("w", state, today), today, f.io), 2);
  ok(/Assembly permit/.test(f.started[0]) && /Sign permit/.test(f.started[1]), "the lapsed one, then the soonest");
  eq(await startRenewals("w", renewalJobs("w", state, add(1)), add(1), f.io), 1);
  ok(/Food permit/.test(f.started[2]));
});

Deno.test("a job that couldn't start lets its claim go, so the next day tries again", async () => {
  const f = fakeIO({ failStarts: 1 });
  const jobs = renewalJobs("w", { deadlines: [dl("d1", 12, "Sign permit renewal", "app-sign")] }, today);
  eq(await startRenewals("w", jobs, today, f.io), 0);
  eq([f.claims.size, f.updates.length], [0, 0], "no claim kept and no Update about a job that didn't start");
  eq(await startRenewals("w", jobs, add(1), f.io), 1);
  eq(f.updates, [`renewal-job:app:app-sign:${add(12)}`]);
});
