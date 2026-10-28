// deno test supabase/functions/stripe-webhook/logic_test.ts: the webhook's signature check and what a checkout event
// may fulfil. Synthetic events only: nothing here talks to Stripe.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { checkoutEffect, verified } from "./logic.ts";

const SECRET = "whsec_test_synthetic";
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sign(raw: string, t: number, secret = SECRET) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${raw}`)));
}
const NOW = 1_800_000_000;
const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } });

Deno.test("the signature: Stripe's, fresh, over this exact body", async () => {
  const t = NOW, v1 = await sign(body, t);
  assert(await verified(body, `t=${t},v1=${v1}`, SECRET, NOW), "a good signature");
  assert(await verified(body, `t=${t},v1=deadbeef,v1=${v1}`, SECRET, NOW), "one good v1 among several (a rolled secret)");
  assert(!(await verified(body + " ", `t=${t},v1=${v1}`, SECRET, NOW)), "a changed body");
  assert(!(await verified(body, `t=${t},v1=${await sign(body, t, "whsec_other")}`, SECRET, NOW)), "another endpoint's secret");
  assert(!(await verified(body, `t=${t - 301},v1=${await sign(body, t - 301)}`, SECRET, NOW)), "older than 5 minutes: a replay");
  assert(!(await verified(body, `t=${t + 301},v1=${await sign(body, t + 301)}`, SECRET, NOW)), "from the future");
  assert(!(await verified(body, `v1=${v1}`, SECRET, NOW)), "no timestamp");
  assert(!(await verified(body, "", SECRET, NOW)), "no header");
  assert(!(await verified(body, `t=${t},v1=${v1}`, "", NOW)), "no secret");
  assert(!(await verified(body, `t=${t},v0=${v1}`, SECRET, NOW)), "only v1 counts");
  // two timestamps: the signature was made for one; a parser that takes the last could check it against the other
  assert(!(await verified(body, `t=${t - 10000},t=${t},v1=${await sign(body, t - 10000)}`, SECRET, NOW)), "two timestamps are refused");
  assert(!(await verified(body, `t=${t}x,v1=${v1}`, SECRET, NOW)), "a timestamp that isn't all digits");
});
const pack = (status: string) => ({ id: "cs_1", mode: "payment", payment_status: status, customer: "cus_1", metadata: { workspace_id: "w1", kind: "pack", credit_usd: "25" } });
const lic = (status: string) => ({ id: "cs_2", mode: "payment", payment_status: status, metadata: { workspace_id: "w1", kind: "license", charge_id: "ch_1", ref: "app" } });
const entry = (status: string) => ({ id: "cs_3", mode: "payment", payment_status: status, metadata: { workspace_id: "w1", plan: "entry", markets: "2" } });

Deno.test("a checkout is fulfilled once its money is in: paid now, or when a delayed payment clears", () => {
  assertEquals(checkoutEffect("checkout.session.completed", pack("paid"))?.packUsd, 25);
  assertEquals(checkoutEffect("checkout.session.completed", lic("paid"))?.license, "ch_1");
  assertEquals(checkoutEffect("checkout.session.completed", entry("paid"))?.markets, 2);
  // a bank debit: completed while unpaid fulfils nothing paid for; the later success does
  for (const o of [pack("unpaid"), lic("unpaid"), entry("unpaid")]) {
    const e = checkoutEffect("checkout.session.completed", o)!;
    assert(e.packUsd === 0 && e.license === null && e.markets === 0 && !e.paid, `unpaid at completion: nothing (${o.id})`);
  }
  assertEquals(checkoutEffect("checkout.session.async_payment_succeeded", pack("paid"))?.packUsd, 25);
  assertEquals(checkoutEffect("checkout.session.async_payment_succeeded", lic("paid"))?.license, "ch_1");
  assertEquals(checkoutEffect("checkout.session.async_payment_succeeded", entry("paid"))?.markets, 2);
  // a failed delayed payment, or any other event: nothing
  assertEquals(checkoutEffect("checkout.session.async_payment_failed", pack("unpaid")), null);
  assertEquals(checkoutEffect("checkout.session.expired", pack("unpaid")), null);
  assertEquals(checkoutEffect("invoice.paid", pack("paid")), null);
});

Deno.test("what a checkout may add is bounded, and belongs only to the workspace named on the checkout", () => {
  const c = (o: Record<string, unknown>) => checkoutEffect("checkout.session.completed", o);
  assertEquals(c({ ...pack("paid"), metadata: { workspace_id: "w1", kind: "pack", credit_usd: "999999" } })?.packUsd, 1000);
  assertEquals(c({ ...pack("paid"), metadata: { workspace_id: "w1", kind: "pack", credit_usd: "-5" } })?.packUsd, 0);
  assertEquals(c({ ...entry("paid"), metadata: { workspace_id: "w1", plan: "entry", markets: "500" } })?.markets, 20);
  assertEquals(c({ ...pack("paid"), metadata: { kind: "pack", credit_usd: "25" } })?.ws, null, "no workspace: nothing to update");
  assertEquals(c({ ...pack("paid"), metadata: { workspace_id: "", kind: "pack", credit_usd: "25" } })?.ws, null);
  assertEquals(c({ ...lic("paid"), metadata: { workspace_id: "w1", kind: "license", charge_id: 7 } })?.license, null, "a charge id that isn't text");
  // a subscription checkout fulfils no one-time item, whatever its metadata says
  const sub = c({ mode: "subscription", payment_status: "paid", metadata: { workspace_id: "w1", kind: "pack", credit_usd: "25", plan: "locations", term_years: "9" } })!;
  assert(sub.packUsd === 0 && sub.license === null && sub.markets === 0 && sub.locations && sub.termYears === 3, "subscription: only its own store list and term, bounded");
  // the store list is counted on completion only, never again on a delayed payment's success
  assertEquals(checkoutEffect("checkout.session.async_payment_succeeded", { mode: "subscription", payment_status: "paid", metadata: { workspace_id: "w1", plan: "locations" } })?.locations, false);
});
