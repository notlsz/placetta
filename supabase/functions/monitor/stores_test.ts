// deno test supabase/functions/monitor/stores_test.ts
import { deepStrictEqual as eq, ok } from "node:assert";
import { storeUpdates, weekAhead } from "./index.ts";

const stores = [{ id: "st-1", name: { en: "Flushing", zh: "法拉盛" }, stage: "open", permits: [
  { name: { en: "Food service permit", zh: "餐饮许可" }, expires: "2026-10-23" },
  { name: { en: "Sign permit", zh: "招牌许可" }, expires: "2026-09-30" },
  { name: { en: "Far off", zh: "远" }, expires: "2027-06-01" },
] }];

Deno.test("permits renew at 60, 30, 14, 7 and 1 days and flag lapses", () => {
  const u = storeUpdates("w", stores, "2026-10-09");
  eq(u.length, 2);
  ok(u[0].dedupe.endsWith(":14") && u[0].kind === "renewal");
  ok(u[1].dedupe.startsWith("lapsed:"));
});
Deno.test("nothing to say for an empty workspace", () => {
  eq(weekAhead("w", { deadlines: [], stores: [] }, 0, "2026-10-12"), null);
});
Deno.test("the week ahead counts what's due, renewing and in progress", () => {
  const u = weekAhead("w", { deadlines: [{ id: "a", date: "2026-10-20", kind: "due", title: { en: "x", zh: "x" } }], stores }, 2, "2026-10-12")!;
  ok(u.title.en.includes("1 due in the next 2 weeks") && u.title.en.includes("2 filings in progress") && u.title.en.includes("renewal"));
  eq(u.dedupe, "week:2026-10-12");
});

Deno.test("a store slipping past its opening date: one update per change, a late one reaches the phone", async () => {
  const { openingUpdates } = await import("./index.ts");
  const { urgency } = await import("../_shared/odelia.ts");
  const today = "2026-10-13";
  const app = (id: string, status: string, extra: Record<string, unknown> = {}) => ({ id, name: { en: id, zh: id }, agency: { en: "DOHMH", zh: "DOHMH" }, level: "city", status, fees: [], est: { en: "about 3 weeks", zh: "" }, source: { label: "", url: "" }, fields: [], checklist: [], ...extra });
  const state = (planned: string) => ({
    apps: [app("health", "needs", { checklist: [{ id: "c", label: { en: "Signed lease", zh: "租约" }, state: "missing" }] })],
    stores: [{ id: "s1", name: { en: "Main St", zh: "主街店" }, address: "1 Main St, Flushing, NY", stage: "opening", plannedOpen: planned, apps: ["health"], rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 } }],
  });
  // 21 days of agency time + a week: permits in hand Nov 10
  eq(openingUpdates("w", state("2026-12-31"), today), []);
  const late = openingUpdates("w", state("2026-11-01"), today);
  ok(late.length === 1 && late[0].dedupe === "opening:s1:late:health:needs" && /9 days behind/.test(late[0].title.en) && /Signed lease/.test(late[0].title.en), JSON.stringify(late));
  ok(urgency(late[0], new Set()) === "important");
  const tight = openingUpdates("w", state("2026-11-13"), today);
  ok(tight.length === 1 && tight[0].dedupe.startsWith("opening:s1:tight") && urgency(tight[0], new Set()) === null);
  eq(openingUpdates("w", { stores: [{ id: "x", stage: "opening" }] }, today), []);
  eq(openingUpdates("w", null, today), []);
});
