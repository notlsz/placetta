// deno test -A supabase/functions/billing/money_test.ts
// The money path's decisions in billing: the Checkout a store plan or a pack opens (price, quantity, where it comes
// back, what it remembers), one plan per workspace, the store count kept in step (prorated by Stripe), and the
// confirm on return applying exactly what the webhook would.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { LIVE_SUB, packCheckoutParams, planCheckoutParams, planQuantity, SIMPLE_PACK_CREDIT_USD, syncStep } from "./logic.ts";
import { applyCheckoutSession, applySubscription, type Db } from "../_shared/stripe_apply.ts";

const WS = "22222222-2222-4222-8222-222222222222";
const back = "https://app.placetta.com/app";
const env = (o: Record<string, string> = {}) => (k: string) => o[k];

Deno.test("the store plan's Checkout: the right price, one line for every store, back with the session id", () => {
  const y = planCheckoutParams({ ws: WS, back, price: "price_y", qty: 4, interval: "year", consentAt: "2026-10-27T18:00:00Z" });
  assertEquals([y.mode, y["line_items[0][price]"], y["line_items[0][quantity]"], y.client_reference_id], ["subscription", "price_y", "4", WS]);
  assertEquals(y.success_url, `${back}?billing=success&session_id={CHECKOUT_SESSION_ID}`);
  assertEquals(y.cancel_url, `${back}?billing=cancel`);
  assertEquals([y["metadata[workspace_id]"], y["subscription_data[metadata][workspace_id]"], y["subscription_data[metadata][plan]"]], [WS, WS, "store"]);
  assert(y["metadata[renewal_terms]"].includes("$7,152 a year"), y["metadata[renewal_terms]"]);
  assertEquals(y["metadata[renewal_consent]"], "2026-10-27T18:00:00Z");
  // no discounts on the simple model, and no line but the plan
  assert(!("allow_promotion_codes" in y) && !Object.keys(y).some((k) => k.startsWith("discounts") || k.startsWith("line_items[1]")));
  const m = planCheckoutParams({ ws: WS, back, price: "price_m", qty: 1, interval: "month", consentAt: "x" });
  assertEquals([m["line_items[0][price]"], m["line_items[0][quantity]"], m["subscription_data[metadata][plan]"]], ["price_m", "1", "store_monthly"]);
  assert(m["metadata[renewal_terms]"].includes("$179 a month") && m["metadata[renewal_terms]"].includes("Cancel anytime"));
  // every store counts, at least one, at most 2,000
  assertEquals([planQuantity(0), planQuantity(1), planQuantity(12), planQuantity(5000)], [1, 1, 12, 2000]);
});

Deno.test("one store plan per workspace: a live one blocks a second checkout; an ended one doesn't", () => {
  for (const s of ["active", "trialing", "past_due", "unpaid", "incomplete"]) assert(LIVE_SUB.has(s), s);
  for (const s of ["canceled", "incomplete_expired", "null"]) assert(!LIVE_SUB.has(s), s);
});

Deno.test("a pack's Checkout: $49 each, its credit on the session and on the payment, for a refund", () => {
  const p = packCheckoutParams({ ws: WS, back, price: "price_p", packs: 3, creditUsd: SIMPLE_PACK_CREDIT_USD });
  assertEquals([p.mode, p["line_items[0][price]"], p["line_items[0][quantity]"], p["metadata[credit_usd]"], p["payment_intent_data[metadata][credit_usd]"], p["payment_intent_data[metadata][kind]"]], ["payment", "price_p", "3", "75", "75", "pack"]);
  assert(p.success_url.includes("session_id={CHECKOUT_SESSION_ID}"));
  assertEquals(packCheckoutParams({ ws: WS, back, price: "price_p", packs: 99, creditUsd: 25 })["line_items[0][quantity]"], "10");
  assertEquals(packCheckoutParams({ ws: WS, back, price: "price_p", packs: 0, creditUsd: 25 })["line_items[0][quantity]"], "1");
});

Deno.test("store count: the per-store item found by lookup key or env var, changed only when it differs", () => {
  const item = (id: string, qty: number, lookup: string | null, price = "price_x") => ({ id, quantity: qty, price: { id: price, lookup_key: lookup } });
  assertEquals(syncStep([item("si_y", 3, "placetta_store_plan_year")], 5, env()), { item: "si_y", qty: 5, change: true });
  assertEquals(syncStep([item("si_m", 2, "placetta_store_plan_month")], 1, env()), { item: "si_m", qty: 1, change: true }, "a store removed: down, credited by Stripe");
  assertEquals(syncStep([item("si_y", 4, "placetta_store_plan_year")], 4, env()), { item: "si_y", qty: 4, change: false });
  assertEquals(syncStep([item("si_y", 1, "placetta_store_plan_year")], 0, env()), { item: "si_y", qty: 1, change: false }, "never below one store");
  assertEquals(syncStep([item("si_env", 1, null, "price_env")], 2, env({ STRIPE_PRICE_STORE_PLAN: "price_env" })), { item: "si_env", qty: 2, change: true });
  // a module or a pack on the same subscription is never resized as stores
  assertEquals(syncStep([item("si_mod", 3, null), item("si_y", 3, "placetta_store_plan_year")], 6, env()), { item: "si_y", qty: 6, change: true });
  assertEquals(syncStep([item("si_mod", 3, null)], 6, env()), null);
});

/** A database stand-in recording what confirm writes. */
function rec(): Db & { calls: { fn: string; args: Record<string, unknown> }[] } {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc: async (fn, args) => { calls.push({ fn, args }); return { data: fn === "billing_subscription_apply" ? true : null, error: null }; },
    insert: async () => {},
    billing: async () => ({ auto_renew: true, subscription_id: null, subscription_status: null }),
    wsOfSubscription: async () => null,
  };
}

Deno.test("confirm on return: the same writes as the webhook, from the session Stripe returns", async () => {
  const db = rec();
  const sub = { id: "sub_c", customer: "cus_c", status: "active", metadata: { workspace_id: WS, plan: "store" },
    items: { data: [{ id: "si", quantity: 2, current_period_end: 1800000000, price: { id: "price_y", lookup_key: "placetta_store_plan_year" } }] } };
  await applyCheckoutSession(db, { id: "cs_c", mode: "subscription", status: "complete", payment_status: "paid", customer: "cus_c", subscription: "sub_c", metadata: { workspace_id: WS, plan: "store" } });
  await applySubscription(db, sub, "customer.subscription.updated", "2026-10-27T18:00:00Z", env());
  const applied = db.calls.find((c) => c.fn === "billing_subscription_apply")!.args;
  assertEquals([applied.p_ws, applied.p_status, applied.p_plan, applied.p_paid_locations, applied.p_subscription], [WS, "active", "store", 2, "sub_c"]);
  assertEquals(db.calls.find((c) => c.fn === "billing_checkout_completed")!.args.p_customer, "cus_c");
});
