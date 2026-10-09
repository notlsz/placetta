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
