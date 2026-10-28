// deno test -A supabase/functions/_shared/issuing_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { apForward, approveAuthorization, CARD_HOURS, cardLimit, cardParams, feeAuthority, filerCard, GOV_CATEGORIES, ISSUING_EVENTS, issuingOn, marginOf, reconcile } from "./issuing.ts";
import { WEBHOOK_EVENTS, webhookEvents } from "./stripe_catalog.ts";

const NOW = Date.parse("2026-10-27T18:00:00Z");
const p = { id: "p", workspace_id: "w", status: "approved", method: "card", card_id: "ic_1", amount_cents: 1000, grant_live: true };
const a = (amount: number, o: { card?: string; ws?: string; expires?: string; category?: string } = {}) => ({ card: { id: o.card ?? "ic_1", metadata: { workspace_id: o.ws ?? "w", expires: o.expires ?? new Date(NOW + 1000).toISOString() } }, pending_request: { amount }, ...(o.category ? { merchant_data: { category: o.category } } : {}) });
const env = (o: Record<string, string>) => (k: string) => o[k];

Deno.test("off unless STRIPE_ISSUING_ON (or the older STRIPE_ISSUING=on), and the webhook asks for its events only then", () => {
  assertEquals(issuingOn(() => undefined), false);
  assertEquals(issuingOn(env({ STRIPE_ISSUING_ON: "0" })), false);
  assertEquals(issuingOn(env({ STRIPE_ISSUING_ON: "off" })), false);
  assertEquals(issuingOn(env({ STRIPE_ISSUING: "1" })), false);
  for (const v of ["1", "on", "true", " TRUE "]) assertEquals(issuingOn(env({ STRIPE_ISSUING_ON: v })), true, v);
  assertEquals(issuingOn(env({ STRIPE_ISSUING: "on" })), true);
  assertEquals(webhookEvents(() => undefined), WEBHOOK_EVENTS);
  assertEquals(webhookEvents(env({ STRIPE_ISSUING_ON: "1" })), [...WEBHOOK_EVENTS, ...ISSUING_EVENTS]);
  assertEquals(ISSUING_EVENTS, ["issuing_authorization.created", "issuing_transaction.created"]);
});

Deno.test("the card: single-use, up to its limit, at government merchants, lapsing in 24 hours", () => {
  const c = cardParams({ holder: "ich_1", cents: 45835, purchase: "p", workspace: "w", now: NOW, filing: "f-1" });
  assertEquals(c["lifecycle_controls[cancel_after][payment_count]"], "1");
  assertEquals([c["spending_controls[spending_limits][0][amount]"], c["spending_controls[spending_limits][0][interval]"], c["spending_controls[spending_limits][1][amount]"], c["spending_controls[spending_limits][1][interval]"]],
    ["45835", "all_time", "45835", "per_authorization"]);
  assertEquals(GOV_CATEGORIES.map((_, i) => c[`spending_controls[allowed_categories][${i}]`]), GOV_CATEGORIES);
  assertEquals(c["metadata[expires]"], new Date(NOW + CARD_HOURS * 3600e3).toISOString());
  assertEquals(CARD_HOURS, 24);
  assertEquals(c["metadata[filing_id]"], "f-1");
  const own = cardParams({ holder: "ich_1", cents: 100, purchase: "p", workspace: "w", now: NOW, categories: ["government_services"] });
  assertEquals([own["spending_controls[allowed_categories][0]"], own["spending_controls[allowed_categories][1]"], own["metadata[categories]"]], ["government_services", undefined, "government_services"]);
});

Deno.test("the limit: the registry's fee plus a small margin, never over the cap, and a page asking more is refused", () => {
  assertEquals([marginOf(1000), marginOf(44500), marginOf(500000)], [200, 1335, 2500]);
  assertEquals(cardLimit({ feeCents: 44500, capCents: 100000, kind: "autopilot" }), { ok: true, limitCents: 45835, baseCents: 44500 });
  assertEquals(cardLimit({ feeCents: 44500, capCents: 45000, kind: "autopilot" }), { ok: true, limitCents: 45000, baseCents: 44500 }, "held to the cap");
  assertEquals(cardLimit({ feeCents: 50000, capCents: 45000, kind: "autopilot" }).ok, false, "a fee over the cap");
  assertEquals(cardLimit({ feeCents: 44500, capCents: 100000, pageCents: 45800, kind: "autopilot" }).ok, true, "a card surcharge inside the margin");
  const over = cardLimit({ feeCents: 44500, capCents: 100000, pageCents: 46000, kind: "autopilot" });
  assert(!over.ok && /asks \$460\.00, more than the \$458\.35/.test(over.why));
  assertEquals(cardLimit({ feeCents: null, capCents: 100000, pageCents: 15000, kind: "autopilot" }), { ok: true, limitCents: 15450, baseCents: 15000 }, "no registry fee: the page's, under Autopilot");
  assertEquals(cardLimit({ feeCents: null, capCents: 100000, kind: "autopilot" }).ok, false, "no fee known at all");
  assertEquals(cardLimit({ feeCents: null, capCents: 44500, kind: "approval" }), { ok: true, limitCents: 44500, baseCents: 44500 }, "an approval: the approved amount");
  assertEquals(cardLimit({ feeCents: 44500, capCents: 44500, pageCents: 44600, kind: "approval" }).ok, false, "never past what the owner approved");
  assertEquals(cardLimit({ feeCents: 100, capCents: 0, kind: "autopilot" }).ok, false);
});

Deno.test("fee authority: a live Autopilot grant, else an owner's approval of this fee, else none", () => {
  const grant = { id: "g", live: true, capPerFiling: 500 };
  const approved = { id: "pu", status: "approved", amount_cents: 44500, approvals: [{}], approvers_needed: 1 };
  assertEquals(feeAuthority({ grant, approved: null }), { kind: "autopilot", grant: "g", capCents: 50000 });
  assertEquals(feeAuthority({ grant: { ...grant, live: false }, approved }), { kind: "approval", purchase: "pu", capCents: 44500 });
  assertEquals(feeAuthority({ grant: { ...grant, live: false }, approved: null }), null, "Autopilot turned off or expired");
  assertEquals(feeAuthority({ grant: null, approved: { ...approved, status: "asked" } }), null, "still waiting for the owner");
  assertEquals(feeAuthority({ grant: null, approved: { ...approved, approvers_needed: 2 } }), null, "one of two owners");
  assertEquals(feeAuthority({ grant: null, approved: { ...approved, authorization_id: "iauth_1" } }), null, "already used");
});

Deno.test("what the worker gets: the card's lines and billing details from an active card, nothing from a closed one", () => {
  const c = { number: "4000009990000006", cvc: "123", exp_month: 11, exp_year: 2029, status: "active", cardholder: { name: "Placetta Inc", billing: { address: { line1: "1 Market St", city: "San Francisco", state: "CA", postal_code: "94105", country: "US" } } } };
  assertEquals(filerCard({ id: "pu", amount_cents: 45835 }, c), { purchase_id: "pu", limit_cents: 45835, number: "4000009990000006", cvc: "123", exp_month: 11, exp_year: 2029, name: "Placetta Inc",
    address: { line1: "1 Market St", city: "San Francisco", state: "CA", postal_code: "94105", country: "US" } });
  assertEquals(filerCard({ id: "pu", amount_cents: 1 }, { ...c, status: "inactive" }), null);
  assertEquals(filerCard({ id: "pu", amount_cents: 1 }, { ...c, number: undefined }), null, "a number Stripe didn't expand");
});

Deno.test("the real-time decision", () => {
  assert(approveAuthorization(a(1000), p, NOW).approved);
  assert(approveAuthorization(a(1000, { category: "government_services" }), p, NOW).approved);
  const no: [string, ReturnType<typeof a>, typeof p | null][] = [["over", a(1001), p], ["other card", a(1, { card: "ic_2" }), p], ["other workspace", a(1, { ws: "x" }), p],
    ["lapsed", a(1, { expires: new Date(NOW - 1).toISOString() }), p], ["no purchase", a(1), null], ["authority off", a(1), { ...p, grant_live: false }],
    ["paid", a(1), { ...p, status: "paid" }], ["link", a(1), { ...p, method: "link" }], ["zero", a(0), p], ["a shop", a(100, { category: "computer_software_stores" }), p]];
  for (const [why, x, q] of no) assertEquals(approveAuthorization(x, q, NOW).approved, false, why);
});

Deno.test("reconciling a settled fee: the unspent charge back to the business, and mismatches to the team", () => {
  assertEquals(reconcile({ chargedCents: 45835, limitCents: 45835, authorizedCents: 44500, settledCents: 44500, receiptCents: 44500, category: "government_services" }), { refundCents: 1335, flags: [] });
  assertEquals(reconcile({ chargedCents: 45835, refundedCents: 335, limitCents: 45835, authorizedCents: 45835, settledCents: 45835, receiptCents: null }).refundCents, 0);
  const bad = reconcile({ chargedCents: 45835, limitCents: 45835, authorizedCents: 44500, settledCents: 46000, receiptCents: 44500, category: "computer_software_stores" });
  assertEquals(bad.refundCents, 0);
  assertEquals(bad.flags.length, 4);
  assert(bad.flags.some((f) => /receipt says \$445\.00/.test(f)) && bad.flags.some((f) => /computer_software_stores/.test(f)));
});

Deno.test("a bill forwarded to accounts payable names the payee and asks for no card details", () => {
  const m = apForward({ to: "ap@x.test", business: "Moonleaf Tea LLC", payee: "County of Santa Clara", cents: 91900, filing: "Food facility plan check", link: "https://deh.santaclaracounty.gov/pay" });
  assertEquals(m.subject, "Agency bill for Moonleaf Tea LLC: $919 to County of Santa Clara");
  assert(/never asks for card or bank details/.test(m.text) && /deh\.santaclaracounty\.gov\/pay/.test(m.text));
});
