// deno test supabase/functions/monitor/stores_test.ts
import "./test_env.ts";
import { deepStrictEqual as eq, ok } from "node:assert";
import { permitOf, storeUpdates, weekAhead } from "./index.ts";

Deno.test("a renewal job names the permit, not the reminder's wording", () => {
  eq(permitOf("Renew the sign permit: expires in 45 days"), "sign permit");
  eq(permitOf("Food Service Establishment Permit expires: expires in 40 days"), "Food Service Establishment Permit");
  eq(permitOf("Flushing: Sign permit expires in 52 days"), "Flushing: Sign permit");
  eq(permitOf("Renew the sign permit：45 天后到期"), "sign permit");
  eq(permitOf("法拉盛：招牌许可45 天后到期"), "法拉盛：招牌许可");
});

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
Deno.test("a renewal 61 to 90 days out gets one early notice that says when Placetta starts it", async () => {
  const { deadlineUpdates, RENEWAL_ALERTS } = await import("./index.ts");
  eq(RENEWAL_ALERTS, [1, 7, 14, 30, 60, 90]);
  const far = [{ id: "st-2", name: { en: "Irvine", zh: "尔湾" }, stage: "open", permits: [{ name: { en: "Health permit", zh: "卫生许可" }, expires: "2027-01-01" }] }];
  const u = storeUpdates("w", far, "2026-10-09");   // 84 days out
  eq(u.length, 1);
  ok(u[0].dedupe.endsWith(":90"));
  ok(u[0].body!.en.includes("starts the renewal on 2026-11-02") && u[0].body!.zh.includes("2026-11-02"));
  // 91 days out: nothing yet; 60 days out: the usual notice
  eq(storeUpdates("w", far, "2026-10-02").length, 0);
  ok(storeUpdates("w", far, "2026-11-02")[0].dedupe.endsWith(":60"));
  const d = deadlineUpdates("w", [{ id: "r1", date: "2027-01-01", kind: "renewal", title: { en: "Health permit renewal", zh: "卫生许可续期" } }], "2026-10-09");
  ok(d.length === 1 && d[0].dedupe === "renewal:r1:2027-01-01:90" && d[0].body!.en.includes("2026-11-02"));
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
  const app = (id: string, status: string, extra: Record<string, unknown> = {}) => ({ id, name: { en: id, zh: id }, agency: { en: "DOHMH", zh: "DOHMH" }, level: "city", status, fees: [], est: { en: "about 3 weeks", zh: "" }, source: { label: "nyc.gov", url: "https://www.nyc.gov/site/doh/business/food-operators.page" }, fields: [], checklist: [], ...extra });
  const state = (planned: string) => ({
    apps: [app("health", "needs", { checklist: [{ id: "c", label: { en: "Signed lease", zh: "租约" }, state: "missing" }] })],
    stores: [{ id: "s1", name: { en: "Main St", zh: "主街店" }, address: "1 Main St, Flushing, NY", stage: "opening", plannedOpen: planned, apps: ["health"], rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 } }],
  });
  // 21 days of the agency's published time (an estimate with no source would be the 30-day default, src/forms/expedite.ts
  // timingOf) + a week: permits in hand Nov 10. "today" is passed in, so the result doesn't depend on the clock.
  eq(openingUpdates("w", state("2026-12-31"), today), []);
  const late = openingUpdates("w", state("2026-11-01"), today);
  ok(late.length === 1 && late[0].dedupe === "opening:s1:late:health:needs" && /9 days behind/.test(late[0].title.en) && /Signed lease/.test(late[0].title.en), JSON.stringify(late));
  ok(urgency(late[0], new Set()) === "important");
  const tight = openingUpdates("w", state("2026-11-13"), today);
  ok(tight.length === 1 && tight[0].dedupe.startsWith("opening:s1:tight") && urgency(tight[0], new Set()) === null);
  eq(openingUpdates("w", { stores: [{ id: "x", stage: "opening" }] }, today), []);
  eq(openingUpdates("w", null, today), []);
});
