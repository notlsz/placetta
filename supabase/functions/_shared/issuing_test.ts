// deno test -A supabase/functions/_shared/issuing_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { apForward, approveAuthorization, cardParams, GOV_CATEGORIES, ISSUING_EVENTS, issuingOn } from "./issuing.ts";
import { WEBHOOK_EVENTS, webhookEvents } from "./stripe_catalog.ts";

const NOW = Date.parse("2026-10-27T18:00:00Z");
const p = { id: "p", workspace_id: "w", status: "approved", method: "card", card_id: "ic_1", amount_cents: 1000, grant_live: true };
const a = (amount: number, o: { card?: string; ws?: string; expires?: string } = {}) => ({ card: { id: o.card ?? "ic_1", metadata: { workspace_id: o.ws ?? "w", expires: o.expires ?? new Date(NOW + 1000).toISOString() } }, pending_request: { amount } });

Deno.test("off unless STRIPE_ISSUING=on, and the webhook asks for its events only then", () => {
  assertEquals(issuingOn(() => undefined), false);
  assertEquals(issuingOn((k) => (k === "STRIPE_ISSUING" ? "1" : undefined)), false);
  assertEquals(webhookEvents(() => undefined), WEBHOOK_EVENTS);
  assertEquals(webhookEvents((k) => (k === "STRIPE_ISSUING" ? "on" : undefined)), [...WEBHOOK_EVENTS, ...ISSUING_EVENTS]);
});
Deno.test("the card: exactly the fee, once, at government merchants, lapsing in 7 days", () => {
  const c = cardParams({ holder: "ich_1", cents: 44500, purchase: "p", workspace: "w", now: NOW });
  assertEquals([c["spending_controls[spending_limits][0][amount]"], c["spending_controls[spending_limits][0][interval]"], c["spending_controls[spending_limits][1][interval]"]], ["44500", "all_time", "per_authorization"]);
  assertEquals(GOV_CATEGORIES.map((_, i) => c[`spending_controls[allowed_categories][${i}]`]), ["government_services", "tax_payments"]);
  assertEquals(c["metadata[expires]"], new Date(NOW + 7 * 864e5).toISOString());
});
Deno.test("the real-time decision", () => {
  assert(approveAuthorization(a(1000), p, NOW).approved);
  const no: [string, ReturnType<typeof a>, typeof p | null][] = [["over", a(1001), p], ["other card", a(1, { card: "ic_2" }), p], ["other workspace", a(1, { ws: "x" }), p],
    ["lapsed", a(1, { expires: new Date(NOW - 1).toISOString() }), p], ["no purchase", a(1), null], ["grant off", a(1), { ...p, grant_live: false }],
    ["paid", a(1), { ...p, status: "paid" }], ["link", a(1), { ...p, method: "link" }], ["zero", a(0), p]];
  for (const [why, x, q] of no) assertEquals(approveAuthorization(x, q, NOW).approved, false, why);
});
Deno.test("a bill forwarded to accounts payable names the payee and asks for no card details", () => {
  const m = apForward({ to: "ap@x.test", business: "Moonleaf Tea LLC", payee: "County of Santa Clara", cents: 91900, filing: "Food facility plan check", link: "https://deh.santaclaracounty.gov/pay" });
  assertEquals(m.subject, "Agency bill for Moonleaf Tea LLC: $919 to County of Santa Clara");
  assert(/never asks for card or bank details/.test(m.text) && /deh\.santaclaracounty\.gov\/pay/.test(m.text));
});
