// deno test supabase/functions/monitor/renewal_notice_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { dueNotices, noticeFor, type RenewalRow } from "./renewal_notice.ts";

const row = (o: Partial<RenewalRow> = {}): RenewalRow => ({
  workspace_id: "w1", current_period_end: "2026-11-21T00:00:00Z", subscription_status: "active", subscription_plan: "locations",
  paid_locations: 2, auto_renew: true, renewal_notice_for: null, hq_paid_by: null, subscription_id: "sub_1", ...o,
});

Deno.test("sent 15 to 30 days before the renewal, once, and only while auto-renew is on", () => {
  const today = "2026-10-22";   // 30 days before 2026-11-21
  assertEquals(dueNotices([row()], today).length, 1);
  assertEquals(dueNotices([row({ current_period_end: "2026-12-10T00:00:00Z" })], today).length, 0, "49 days out: too early");
  assertEquals(dueNotices([row({ current_period_end: "2026-11-05T00:00:00Z" })], today).length, 0, "14 days out: past the window");
  assertEquals(dueNotices([row({ renewal_notice_for: "2026-11-21" })], today).length, 0, "already sent for this renewal");
  assertEquals(dueNotices([row({ auto_renew: false })], today).length, 0, "auto-renew off");
  assertEquals(dueNotices([row({ hq_paid_by: "hq@brand.test", subscription_id: null })], today).length, 0, "headquarters pays");
  assertEquals(dueNotices([row({ subscription_status: "canceled" })], today).length, 0);
});

Deno.test("the notice says the price, the cadence, the one-click cancel, and only what records show", () => {
  const state = {
    business: { en: "Moonleaf Tea", zh: "Moonleaf Tea" },
    apps: [{ id: "a1", name: { en: "Health permit", zh: "卫生许可证" } }],
    stores: [{ id: "s1", name: { en: "Main St", zh: "Main St" }, stage: "open" }],
    deadlines: [{ id: "d1", date: "2026-09-30", kind: "renewal", app: "a1" }],
    docs: [],
  };
  const filings = [{ workspace_id: "w1", app_id: "a1", status: "accepted", submitted_at: "2026-09-01T10:00:00Z", decided_at: "2026-09-15T10:00:00Z" },
    { workspace_id: "other", app_id: "a1", status: "accepted", submitted_at: "2026-09-01T10:00:00Z", decided_at: "2026-09-02T10:00:00Z" }];
  const m = noticeFor(row(), "Moonleaf Tea", state, filings, "2026-10-22", "https://placetta.com/app/settings/billing?ws=w1");
  assert(m.subject.includes("renews on 2026-11-21"));
  assert(m.text.includes("$3,576") && m.text.includes("once a year"), "two Essentials locations a year, at the published price");
  assert(m.text.includes("Cancel online in one click") && m.html.includes("https://placetta.com/app/settings/billing?ws=w1"));
  assert(m.text.includes("1 filing made with agencies"), "only this workspace's filing");
  assert(m.text.includes("1 of 1 renewal filed before the due date"));
  assert(m.text.includes("No fines avoided claimed"), "no notice on file, no fines claimed");
  assert(m.text.includes("(estimate)"));
  assert(!/faster than the agency medians/.test(m.text), "no network comparison without network data");
});
