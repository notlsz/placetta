// Run: deno test -A supabase/functions/integrations/pos_test.ts
// Square and Toast reads with a stand-in for their APIs: what is asked, and how the answers add up.
import { deepStrictEqual as assertEquals, ok as assert, rejects } from "node:assert";
import {
  addSquareOrder, addToastOrder, type Call, daysBetween, isoWeek, lastFullMonth, localDate, monthsBetween, PosError, type SavedToken, squareSales, squareStaff,
  type ToastCtx, toastGet, toastMatches, type ToastOrder, toastSales, toastStaff, toastTokens,
} from "./pos.ts";

const SQ = "https://connect.squareup.com", V = "2026-09-16";
type Seen = { url: string; method: string; headers: Headers; body: Record<string, unknown> | null };
/** A stand-in API: each call goes to the first route whose test matches, and is remembered. */
function api(routes: [(s: Seen) => boolean, (s: Seen) => unknown | Response][]) {
  const seen: Seen[] = [];
  const f = (async (u: string | URL | Request, init?: RequestInit) => {
    const s: Seen = { url: String(u), method: init?.method ?? "GET", headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : null };
    seen.push(s);
    const r = routes.find(([t]) => t(s));
    if (!r) return new Response(JSON.stringify({ errors: [{ code: "NOT_FOUND" }] }), { status: 404 });
    const out = r[1](s);
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { f, seen, call: f as unknown as Call };
}
const usd = (amount: number) => ({ amount, currency: "USD" });

Deno.test("months, dates and weeks", () => {
  assertEquals(monthsBetween("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assertEquals(monthsBetween("2026-09", "2026-09"), ["2026-09"]);
  assertEquals(monthsBetween("2026-13", "2026-09"), []);
  assertEquals(lastFullMonth(new Date("2026-10-17T12:00:00Z")), "2026-09");
  assertEquals(lastFullMonth(new Date("2027-01-03T12:00:00Z")), "2026-12");
  // 03:30 UTC on Oct 1 is still Sept 30 in Los Angeles, but Oct 1 in Shanghai
  assertEquals(localDate("2026-10-01T03:30:00Z", "America/Los_Angeles"), "2026-09-30");
  assertEquals(localDate("2026-10-01T03:30:00Z", "Asia/Shanghai"), "2026-10-01");
  assertEquals(localDate("2026-10-01T03:30:00Z", "Not/AZone"), "2026-10-01", "an unknown zone falls back to UTC");
  assertEquals(daysBetween("2026-02-27", "2026-03-02"), ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  assertEquals([isoWeek("2026-10-12"), isoWeek("2026-10-18"), isoWeek("2027-01-01"), isoWeek("2026-12-31")], ["2026-W42", "2026-W42", "2026-W53", "2026-W53"]);
});

Deno.test("one Square order: net of returns, tax, tips and service charges", () => {
  const a = { orders: 0, net: 0, discounts: 0, service: 0, tax: 0, tips: 0, refunds: 0 };
  // $50 total: $40 of food after a $5 discount, $3.50 tax, $4 tip, $2.50 service charge; then $10 of it returned
  addSquareOrder(a, { total_money: usd(5000), total_tax_money: usd(350), total_tip_money: usd(400), total_service_charge_money: usd(250), total_discount_money: usd(500),
    net_amounts: { total_money: usd(4000), tax_money: usd(280), tip_money: usd(400), service_charge_money: usd(250), discount_money: usd(500) } });
  assertEquals(a, { orders: 1, net: 4000 - 280 - 400 - 250, discounts: 500, service: 250, tax: 280, tips: 400, refunds: 1000 });
  addSquareOrder(a, { total_money: usd(1000), total_tax_money: usd(80) });
  assertEquals([a.orders, a.net, a.tax, a.refunds], [2, 3070 + 920, 360, 1000], "without net_amounts the totals count");
});

Deno.test("Square monthly sales: completed orders by closing day in each location's zone, paged", async () => {
  const { call, seen } = api([
    [(s) => s.url === `${SQ}/v2/locations`, () => ({ locations: [
      { id: "L1", name: "Flushing", status: "ACTIVE", timezone: "America/New_York", currency: "USD", address: { address_line_1: "136-20 Roosevelt Ave", locality: "Flushing", administrative_district_level_1: "NY", postal_code: "11354" } },
      { id: "L2", name: "Old store", status: "INACTIVE", timezone: "America/New_York" },
      { id: "L3", name: "Irvine", status: "ACTIVE", timezone: "America/Los_Angeles" },
    ] })],
    [(s) => s.url === `${SQ}/v2/orders/search` && (s.body?.location_ids as string[])[0] === "L1" && !s.body?.cursor, () => ({ orders: [
      { closed_at: "2026-09-01T04:30:00Z", total_money: usd(2000), total_tax_money: usd(178) },   // 00:30 Sept 1 in New York
      { closed_at: "2026-09-30T23:59:00Z", total_money: usd(1000), total_tax_money: usd(89) },    // 19:59 Sept 30
    ], cursor: "next" })],
    [(s) => s.url === `${SQ}/v2/orders/search` && (s.body?.location_ids as string[])[0] === "L1" && s.body?.cursor === "next", () => ({ orders: [
      { closed_at: "2026-10-01T03:00:00Z", total_money: usd(500), total_tax_money: usd(44) },     // 23:00 Sept 30 in New York
      { closed_at: "2026-10-01T05:00:00Z", total_money: usd(9999), total_tax_money: usd(0) },     // Oct 1: not September
    ] })],
    [(s) => s.url === `${SQ}/v2/orders/search` && (s.body?.location_ids as string[])[0] === "L3", () => ({ orders: [{ closed_at: "2026-09-15T20:00:00Z", total_money: usd(300), total_tip_money: usd(50) }] })],
  ]);
  const out = await squareSales(call, SQ, V, ["2026-09"]);
  assertEquals(out.complete, true);
  assertEquals(out.rows.map((r) => [r.location, r.month, r.orders, r.net_sales, r.tax, r.tips, r.total_collected]), [
    ["Flushing", "2026-09", 3, 3500 / 100 - 3.11, 3.11, 0, 35], ["Irvine", "2026-09", 1, 2.5, 0, 0.5, 3],
  ]);
  assertEquals(out.rows[0].address, "136-20 Roosevelt Ave, Flushing, NY, 11354");
  const q = seen.find((s) => s.url.endsWith("/orders/search"))!;
  assertEquals(q.headers.get("square-version"), V);
  assertEquals(q.body?.query, { filter: { date_time_filter: { closed_at: { start_at: "2026-08-31T00:00:00Z", end_at: "2026-10-02T00:00:00Z" } }, state_filter: { states: ["COMPLETED"] } }, sort: { sort_field: "CLOSED_AT", sort_order: "ASC" } });
  assert(!seen.some((s) => (s.body?.location_ids as string[] | undefined)?.includes("L2")), "an inactive location isn't read");
  // one location by name, and a deadline that has passed stops after the first page
  const one = await squareSales(call, SQ, V, ["2026-09"], { location: "flushing", deadline: Date.now() - 1 });
  assertEquals([one.rows.length, one.complete, one.rows[0].orders], [1, false, 2]);
  await rejects(squareSales(call, SQ, V, ["2026-09"], { location: "Brooklyn" }), (e: unknown) => e instanceof PosError && e.status === 404 && !!e.zh);
});

Deno.test("Square errors say what to do", async () => {
  const { call } = api([[() => true, () => new Response(JSON.stringify({ errors: [{ category: "AUTHENTICATION_ERROR", code: "INSUFFICIENT_SCOPES" }] }), { status: 403 })]]);
  await rejects(squareSales(call, SQ, V, ["2026-09"]), (e: unknown) => e instanceof PosError && e.status === 403 && /Reconnect Square/.test(e.message) && /重新连接/.test(e.zh ?? ""));
});

Deno.test("Square staff: the team, published shifts and timecards with unpaid breaks", async () => {
  const { call, seen } = api([
    [(s) => s.url === `${SQ}/v2/locations`, () => ({ locations: [{ id: "L1", name: "Flushing", timezone: "America/New_York" }] })],
    [(s) => s.url.endsWith("/v2/team-members/search"), () => ({ team_members: [
      { id: "T1", given_name: "Mei", family_name: "Chen", email_address: "mei@goldenox.com", is_owner: true, assigned_locations: { location_ids: ["L1"] } },
      { id: "T2", given_name: "Jun", family_name: "Li" },
    ] })],
    [(s) => s.url.endsWith("/v2/labor/scheduled-shifts/search"), () => ({ scheduled_shifts: [
      { published_shift_details: { team_member_id: "T2", location_id: "L1", start_at: "2026-10-05T13:00:00Z", end_at: "2026-10-05T21:00:00Z", timezone: "America/New_York" } },
      { published_shift_details: { team_member_id: "T2", location_id: "L1", start_at: "2026-10-06T13:00:00Z", end_at: "2026-10-06T21:00:00Z", is_deleted: true } },
      { draft_shift_details: { team_member_id: "T1", start_at: "2026-10-07T13:00:00Z" } },
    ] })],
    [(s) => s.url.endsWith("/v2/labor/timecards/search"), () => ({ timecards: [
      { team_member_id: "T2", location_id: "L1", timezone: "America/New_York", start_at: "2026-10-05T13:00:00Z", end_at: "2026-10-05T23:00:00Z", wage: { title: "Line cook" },
        breaks: [{ start_at: "2026-10-05T17:00:00Z", end_at: "2026-10-05T17:30:00Z", is_paid: false }, { start_at: "2026-10-05T20:00:00Z", end_at: "2026-10-05T20:10:00Z", is_paid: true }] },
      { team_member_id: "T2", location_id: "L1", timezone: "America/New_York", start_at: "2026-10-13T01:00:00Z", end_at: "2026-10-13T05:00:00Z", wage: { title: "Line cook" } },
    ] })],
  ]);
  const out = await squareStaff(call, SQ, V, "2026-10-01", "2026-10-14");
  assertEquals(out.people, [
    { id: "T1", name: "Mei Chen", email: "mei@goldenox.com", locations: ["Flushing"] },
    { id: "T2", name: "Jun Li", jobs: ["Line cook"] },
  ]);
  assertEquals(out.scheduled, [{ person: "Jun Li", location: "Flushing", date: "2026-10-05", start: "2026-10-05T13:00:00Z", end: "2026-10-05T21:00:00Z", hours: 8 }]);
  assertEquals(out.worked[0], { person: "Jun Li", location: "Flushing", date: "2026-10-05", start: "2026-10-05T13:00:00Z", end: "2026-10-05T23:00:00Z", hours: 9.5, breaks: [{ minutes: 30, paid: false }, { minutes: 10, paid: true }] });
  assertEquals(out.worked[1].date, "2026-10-12", "9pm in New York counts on that day, not the UTC one");
  assertEquals(out.totals, [{ person: "Jun Li", days_worked: 2, worked_hours: 13.5, longest_shift_hours: 9.5, by_week: { "2026-W41": 9.5, "2026-W42": 4 } }]);
  const tc = seen.find((s) => s.url.endsWith("/timecards/search"))!;
  assertEquals((tc.body?.query as { filter: unknown }).filter, { workday: { date_range: { start_date: "2026-10-01", end_date: "2026-10-14" }, match_timecards_by: "START_AT", default_timezone: "America/New_York" } });
  const ss = seen.find((s) => s.url.endsWith("/scheduled-shifts/search"))!;
  assertEquals(((ss.body?.query as { filter: Record<string, unknown> }).filter.workday as Record<string, unknown>).match_shifts_by, "START_AT");
  // a business that doesn't schedule in Square: a note, not a failure
  const noSched = api([
    [(s) => s.url === `${SQ}/v2/locations`, () => ({ locations: [{ id: "L1", name: "Flushing" }] })],
    [(s) => s.url.endsWith("/v2/team-members/search"), () => ({ team_members: [] })],
    [(s) => s.url.endsWith("/scheduled-shifts/search"), () => new Response(JSON.stringify({ errors: [{ code: "FORBIDDEN" }] }), { status: 403 })],
    [(s) => s.url.endsWith("/timecards/search"), () => ({ timecards: [] })],
  ]);
  const o2 = await squareStaff(noSched.call, SQ, V, "2026-10-01", "2026-10-14");
  assertEquals([o2.scheduled, o2.notes.length, o2.complete], [[], 1, true]);
});

/* ------------------------------------------------------------------ Toast */

const TB = "https://ws-api.toasttab.com", GUID = "4721e7a9-b4ae-4fef-9230-b3dae186e0a4";

Deno.test("Toast's partner token: one login, reused, saved, renewed only when it may be", async () => {
  let t = 1_000_000_000_000, saved: SavedToken | null = null, logins = 0;
  const { f, seen } = api([[(s) => s.url === `${TB}/authentication/v1/authentication/login`, () => { logins++; return { "@class": ".SuccessfulResponse", token: { tokenType: "Bearer", expiresIn: 19168, accessToken: `T${logins}` }, status: "SUCCESS" }; }]]);
  const make = () => toastTokens({ f, base: TB, clientId: "placetta", clientSecret: "s3cret", load: async () => saved, store: async (x) => { saved = x; }, now: () => t });
  const token = make();
  assertEquals(await token(), "T1");
  assertEquals(seen[0].body, { clientId: "placetta", clientSecret: "s3cret", userAccessType: "TOAST_MACHINE_CLIENT" });
  assertEquals(saved, { token: "T1", exp: t + 19168 * 1000, fetched_at: t });
  t += 60 * 60_000;
  assertEquals([await token(), await make()()], ["T1", "T1"], "an hour later, this instance and a new one both reuse it");
  assertEquals(logins, 1);
  t += 5 * 3600_000;   // past expiry (19168 seconds is about 5 hours 20 minutes)
  assertEquals(await token(), "T2");
  assertEquals(await token("T2"), "T2", "refused moments after login: not another login (at most two an hour)");
  t += 31 * 60_000;
  assertEquals(await token("T2"), "T3", "refused after 30 minutes: a new login");
  assertEquals(logins, 3);
  const down = toastTokens({ f: api([[() => true, () => new Response("{}", { status: 401 })]]).f, base: TB, clientId: "x", clientSecret: "y", load: async () => null, store: async () => {}, now: () => t });
  await rejects(down(), (e: unknown) => e instanceof PosError && e.code === "toast_login" && !!e.zh);
});

function toastCtx(routes: Parameters<typeof api>[0]) {
  const a = api(routes);
  const tokens: (string | undefined)[] = [];
  const ctx: ToastCtx = { f: a.f, base: TB, token: async (stale) => { tokens.push(stale); return stale ? "fresh" : "tok"; }, sleep: async () => {} };
  return { ...a, ctx, tokens };
}

Deno.test("Toast calls: the restaurant header, a refused token renewed once, busy waited out, 403 explained", async () => {
  let n = 0;
  const { ctx, seen, tokens } = toastCtx([[() => true, (s) => {
    n++;
    if (n === 1) return new Response("", { status: 401 });
    if (n === 2) return new Response("", { status: 429, headers: { "retry-after": "1" } });
    return s.headers.get("authorization") === "Bearer fresh" ? [{ guid: "e1" }] : new Response("", { status: 401 });
  }]]);
  assertEquals(await toastGet(ctx, "/labor/v1/employees", GUID), [{ guid: "e1" }]);
  assertEquals(seen.map((s) => [s.headers.get("authorization"), s.headers.get("toast-restaurant-external-id")]), [["Bearer tok", GUID], ["Bearer fresh", GUID], ["Bearer fresh", GUID]]);
  assertEquals(tokens, [undefined, "tok"]);
  const no = toastCtx([[() => true, () => new Response("", { status: 403 })]]);
  await rejects(toastGet(no.ctx, "/labor/v1/employees", GUID), (e: unknown) => e instanceof PosError && e.status === 403 && /15 minutes/.test(e.message) && /15 分钟/.test(e.zh ?? ""));
});

Deno.test("Toast locations: only those carrying this workspace's code, across pages", async () => {
  const conn = (guid: string, ref: string | null, group: string | null = null) => ({ restaurantGuid: guid, restaurantName: "Golden Ox", locationName: guid.slice(0, 4), externalRestaurantRef: ref, externalGroupRef: group });
  const { ctx, seen } = toastCtx([
    [(s) => s.url.endsWith("page=1"), () => ({ results: [conn("aaaa0000-0000-0000-0000-000000000001", "PLACETTA-7KQ3MZ9W"), conn("bbbb0000-0000-0000-0000-000000000002", "PLACETTA-7KQ3MZ9X"), conn("cccc0000-0000-0000-0000-000000000003", null)], nextPageNum: 2 })],
    [(s) => s.url.endsWith("page=2"), () => ({ results: [conn("dddd0000-0000-0000-0000-000000000004", null, " placetta-7kq3mz9w "), conn("eeee0000-0000-0000-0000-000000000005", "someone else")], nextPageNum: null })],
  ]);
  const got = await toastMatches(ctx, "PLACETTA-7KQ3MZ9W");
  assertEquals(got.map((p) => p.guid), ["aaaa0000-0000-0000-0000-000000000001", "dddd0000-0000-0000-0000-000000000004"]);
  assertEquals(seen.map((s) => [s.url.replace(TB, ""), s.headers.get("toast-restaurant-external-id")]), [["/partners/v1/connectedRestaurants?pageSize=100&page=1", null], ["/partners/v1/connectedRestaurants?pageSize=100&page=2", null]]);
});

Deno.test("one Toast order, as Toast's sales report guide counts it", () => {
  const a = { orders: 0, net: 0, discounts: 0, service: 0, tax: 0, tips: 0, refunds: 0 };
  const order: ToastOrder = { businessDate: 20260915, checks: [
    { amount: 52.5, taxAmount: 4.66,
      appliedDiscounts: [{ discountAmount: 3 }],
      appliedServiceCharges: [{ chargeAmount: 5, serviceChargeCategory: "SERVICE_CHARGE" }, { chargeAmount: 1, serviceChargeCategory: "FUNDRAISING_CAMPAIGN" }, { chargeAmount: 8, gratuity: true }],
      selections: [{ price: 20, appliedDiscounts: [{ discountAmount: 2 }] }, { price: 10, deferred: true }, { price: 99, voided: true, appliedDiscounts: [{ discountAmount: 50 }] }],
      payments: [{ paymentStatus: "CAPTURED", tipAmount: 6, refund: { refundAmount: 4 } }, { paymentStatus: "VOIDED", tipAmount: 100 }] },
    { voided: true, amount: 1000, taxAmount: 80 },
  ] };
  addToastOrder(a, order);
  // 52.50 less the $5 service charge, the $1 donation and the $10 gift card sold
  assertEquals(a, { orders: 1, net: 3650, discounts: 500, service: 500, tax: 466, tips: 600, refunds: 400 });
  addToastOrder(a, { voided: true, checks: [{ amount: 10 }] });
  addToastOrder(a, { deleted: true, checks: [{ amount: 10 }] });
  assertEquals(a.orders, 1, "voided and deleted orders don't count");
});

Deno.test("Toast monthly sales: each business day, paged by 100, days still to come skipped", async () => {
  const order = (amount: number): ToastOrder => ({ checks: [{ amount, taxAmount: amount * 0.08875, payments: [{ tipAmount: 1 }] }] });
  const { ctx, seen } = toastCtx([[(s) => s.url.includes("/orders/v2/ordersBulk"), (s) => {
    const u = new URL(s.url), d = u.searchParams.get("businessDate"), page = Number(u.searchParams.get("page"));
    if (d === "20261001") return page === 1 ? Array.from({ length: 100 }, () => order(10)) : page === 2 ? [order(10), order(10)] : [];
    return d === "20261002" ? [order(25)] : [];
  }]]);
  const out = await toastSales(ctx, [{ guid: GUID, name: "Golden Ox", location: "Boston" }], ["2026-10"], { today: "2026-10-03" });
  const days = seen.map((s) => new URL(s.url).searchParams.get("businessDate") + ":" + new URL(s.url).searchParams.get("page"));
  assertEquals(days, ["20261001:1", "20261001:2", "20261002:1", "20261003:1"], "Oct 1 twice (a full page of 100), then a page a day up to today");
  assert(seen.every((s) => s.headers.get("toast-restaurant-external-id") === GUID));
  assertEquals([out.rows[0].location, out.rows[0].orders, out.rows[0].net_sales, out.rows[0].tips, out.complete], ["Golden Ox, Boston", 103, 1045, 103, true]);
  assert(/business day/.test(out.how));
  const late = await toastSales(ctx, [{ guid: GUID, name: "Golden Ox" }], ["2026-10"], { today: "2026-10-03", deadline: Date.now() - 1 });
  assertEquals(late.complete, false);
});

Deno.test("Toast staff: employees with jobs, shifts by local day, time entries by business date with missed breaks", async () => {
  const { ctx, seen } = toastCtx([
    [(s) => s.url.endsWith("/labor/v1/employees"), () => [
      { guid: "e1", firstName: "Wei", lastName: "Zhang", email: "wei@goldenox.com", jobReferences: [{ guid: "j1" }] },
      { guid: "e2", firstName: "Ana", chosenName: "Annie", lastName: "Ruiz", jobReferences: [] },
      { guid: "e3", firstName: "Gone", deleted: true },
    ]],
    [(s) => s.url.endsWith("/labor/v1/jobs"), () => [{ guid: "j1", title: "Server" }]],
    [(s) => s.url.includes("/labor/v1/shifts?"), () => [
      { employeeReference: { guid: "e1" }, inDate: "2026-10-05T14:00:00.000+0000", outDate: "2026-10-05T22:00:00.000+0000" },
      { employeeReference: { guid: "e1" }, inDate: "2026-09-29T14:00:00.000+0000", outDate: "2026-09-29T22:00:00.000+0000" },
    ]],
    [(s) => s.url.includes("/labor/v1/timeEntries?"), () => [
      { employeeReference: { guid: "e2" }, inDate: "2026-10-05T14:00:00.000+0000", outDate: "2026-10-06T01:00:00.000+0000", businessDate: "20261005", regularHours: 8, overtimeHours: 2.5,
        breaks: [{ inDate: "2026-10-05T18:00:00.000+0000", outDate: "2026-10-05T18:30:00.000+0000", paid: false, missed: false }, { inDate: "2026-10-05T22:00:00.000+0000", outDate: null, paid: false, missed: true }] },
      { employeeReference: { guid: "e2" }, inDate: "2026-10-20T14:00:00.000+0000", businessDate: "20261020", regularHours: 4 },
    ]],
  ]);
  const out = await toastStaff(ctx, [{ guid: GUID, name: "Golden Ox", location: "Boston", tz: "America/New_York" }], "2026-10-01", "2026-10-14");
  assertEquals(out.people, [
    { id: "e1", name: "Wei Zhang", email: "wei@goldenox.com", jobs: ["Server"], locations: ["Golden Ox, Boston"] },
    { id: "e2", name: "Annie Ruiz", locations: ["Golden Ox, Boston"] },
  ]);
  assertEquals(out.scheduled.map((s) => [s.person, s.date, s.hours]), [["Wei Zhang", "2026-10-05", 8]]);
  assertEquals(out.worked, [{ person: "Annie Ruiz", location: "Golden Ox, Boston", date: "2026-10-05", start: "2026-10-05T14:00:00.000+0000", end: "2026-10-06T01:00:00.000+0000", hours: 10.5, overtime_hours: 2.5,
    breaks: [{ minutes: 30, paid: false }, { minutes: 0, paid: false, missed: true }] }]);
  assertEquals(out.totals[0].longest_shift_hours, 10.5);
  const te = seen.find((s) => s.url.includes("/timeEntries?"))!;
  assertEquals(new URL(te.url).searchParams.get("startDate"), "2026-09-30T00:00:00.000+0000");
  assertEquals(new URL(te.url).searchParams.get("endDate"), "2026-10-16T00:00:00.000+0000");
  assertEquals(new URL(te.url).searchParams.get("includeMissedBreaks"), "true");
});
