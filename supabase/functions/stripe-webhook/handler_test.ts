// deno test -A supabase/functions/stripe-webhook/handler_test.ts
// The webhook with signed sample events. The events are Stripe's own shapes (API 2025-03-31.basil, as in Stripe's
// docs and `stripe trigger` fixtures: evt_ ids, object "event", data.object a checkout.session, subscription, invoice
// or charge), signed the way Stripe signs them (t=..., v1=HMAC-SHA256 of "t.payload") with a test secret. The database
// is an in-memory stand-in that applies the same rules as the migrations (one event once; a subscription event older
// than the last one applied is ignored; a license charge settled once; a pack's credit added once).
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { handle, sign, verified, type Deps } from "./handler.ts";
import { NOTICE } from "../_shared/stripe_apply.ts";

const SECRET = "whsec_test_" + "a".repeat(32);
const WS = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-10-27T18:00:00Z");
const T = Math.floor(NOW / 1000);

type Bill = { subscription_id: string | null; subscription_status: string | null; subscription_plan: string | null; current_period_end: string | null; paid_locations: number;
  stripe_customer_id: string | null; event_at: string | null; auto_renew: boolean; ai_credit_usd: number; payment_issue_at: string | null };
function fakeDb(o: { noBilling?: boolean; failRpc?: string } = {}) {
  const events = new Map<string, { done: boolean; at: number }>();
  const billing = new Map<string, Bill>();
  if (!o.noBilling) billing.set(WS, { subscription_id: null, subscription_status: null, subscription_plan: null, current_period_end: null, paid_locations: 0, stripe_customer_id: null, event_at: null, auto_renew: true, ai_credit_usd: 0, payment_issue_at: null });
  const charges = new Map<string, string>([["c-1", "pending"], ["c-used", "used"]]);
  const rows: { table: string; row: Record<string, unknown> }[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const ok = (data: unknown) => ({ data, error: null });
  const db: Deps["db"] = {
    async rpc(fn, a) {
      rpcs.push({ fn, args: a });
      if (fn === o.failRpc) return { data: null, error: { message: "boom" } };
      const b = billing.get(String(a.p_ws));
      switch (fn) {
        case "billing_subscription_apply": {
          if (!b || (b.event_at && b.event_at > String(a.p_event_at))) return ok(false);
          Object.assign(b, { stripe_customer_id: a.p_customer, subscription_id: a.p_subscription, subscription_status: a.p_status, subscription_plan: a.p_plan, current_period_end: a.p_period_end, paid_locations: a.p_paid_locations, event_at: a.p_event_at });
          return ok(true);
        }
        case "billing_checkout_completed": if (b) b.stripe_customer_id ??= a.p_customer as string; return ok(null);
        case "license_charge_settle": { const st = charges.get(String(a.p_id)); if (st !== "pending") return ok(false); charges.set(String(a.p_id), a.p_ok ? "paid" : "void"); return ok(true); }
        case "license_charge_refund": { const st = charges.get(String(a.p_id)); if (!st) return ok("none"); if (st === "used") return ok("used"); charges.set(String(a.p_id), "void"); return ok("void"); }
        case "ai_credit_once": { const k = String(a.p_key); if (events.has(k)) return ok(false); events.set(k, { done: true, at: NOW }); b!.ai_credit_usd = Math.max(0, b!.ai_credit_usd + Number(a.p_usd)); return ok(true); }
        case "billing_payment_apply": {
          if (!b) return ok(false);
          if (a.p_failed) { b.payment_issue_at = String(a.p_at); return ok(true); }
          if (b.payment_issue_at && b.payment_issue_at <= String(a.p_at)) { b.payment_issue_at = null; return ok(true); }
          return ok(false);
        }
        case "billing_auto_renew_apply": if (b) b.auto_renew = !!a.p_on; return ok(null);
        default: return ok(null);
      }
    },
    async insert(table, row) {
      // updates and team tasks are once per dedupe key
      if (table !== "audit_log" && rows.some((r) => r.table === table && r.row.dedupe === row.dedupe)) return;
      rows.push({ table, row });
    },
    async billing(ws) { const b = billing.get(ws); return b ? { auto_renew: b.auto_renew, subscription_id: b.subscription_id, subscription_status: b.subscription_status } : null; },
    async wsOfSubscription(sub) { for (const [ws, b] of billing) if (b.subscription_id === sub) return ws; return null; },
    async claimEvent(id) {
      const e = events.get(id);
      if (!e) { events.set(id, { done: false, at: NOW }); return "new"; }
      if (!e.done && NOW - e.at > 5 * 60_000) { e.at = NOW; return "retry"; }
      return "duplicate";
    },
    async doneEvent(id) { events.get(id)!.done = true; },
    async releaseEvent(id) { events.delete(id); },
  };
  return { db, billing, charges, rows, rpcs, events };
}

const env = (o: Record<string, string> = {}) => (k: string) => o[k];
function deps(db: ReturnType<typeof fakeDb>, pi: Record<string, Record<string, string>> = {}): Deps {
  return { db: db.db, env: env(), secret: async () => SECRET, paymentIntentMeta: async (id) => pi[id] ?? null, now: () => NOW };
}
let seq = 0;
const event = (type: string, object: Record<string, unknown>, created = T) =>
  ({ id: `evt_1Q${(++seq).toString().padStart(22, "0")}`, object: "event", api_version: "2025-03-31.basil", created, livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null }, type, data: { object } });
async function post(d: Deps, ev: unknown, o: { secret?: string; t?: number; body?: string } = {}) {
  const body = o.body ?? JSON.stringify(ev);
  const t = o.t ?? T;
  const sig = `t=${t},v1=${await sign(body, o.secret ?? SECRET, t)},v0=deadbeef`;
  return await handle(new Request("https://x.supabase.co/functions/v1/stripe-webhook", { method: "POST", headers: { "stripe-signature": sig, "content-type": "application/json" }, body }), d);
}

/** A subscription as Stripe sends it (basil: the period on each item), for the store plan at n stores. */
const subscription = (o: { id?: string; status?: string; qty?: number; lookup?: string; price?: string; interval?: string; cancelAtEnd?: boolean; meta?: Record<string, string> } = {}) => ({
  id: o.id ?? "sub_1QStore", object: "subscription", customer: "cus_QStore", status: o.status ?? "active", cancel_at_period_end: o.cancelAtEnd ?? false,
  metadata: o.meta ?? { workspace_id: WS, plan: "store", interval: "year" },
  items: { object: "list", data: [{ id: "si_1QStore", object: "subscription_item", quantity: o.qty ?? 3, current_period_start: T, current_period_end: T + 365 * 86400,
    price: { id: o.price ?? "price_y", object: "price", lookup_key: o.lookup ?? "placetta_store_plan_year", unit_amount: 178800, currency: "usd", recurring: { interval: o.interval ?? "year", interval_count: 1 } } }] },
});

Deno.test("the signature: Stripe's scheme, the tolerance, a wrong secret or a changed body", async () => {
  const body = JSON.stringify(event("invoice.paid", { id: "in_1" }));
  assert(await verified(body, `t=${T},v1=${await sign(body, SECRET, T)}`, SECRET, T));
  assert(await verified(body, `t=${T},v1=00,v1=${await sign(body, SECRET, T)}`, SECRET, T), "any v1 may match (a secret being rolled)");
  assert(!(await verified(body, `t=${T},v1=${await sign(body, "whsec_other", T)}`, SECRET, T)));
  assert(!(await verified(body + " ", `t=${T},v1=${await sign(body, SECRET, T)}`, SECRET, T)));
  assert(!(await verified(body, `t=${T - 301},v1=${await sign(body, SECRET, T - 301)}`, SECRET, T)), "older than five minutes");
  assert(!(await verified(body, "", SECRET, T)));

  const db = fakeDb();
  assertEquals((await post(deps(db), event("invoice.paid", { id: "in_1" }), { secret: "whsec_wrong" })).status, 400);
  assertEquals((await post(deps(db), event("invoice.paid", { id: "in_1" }), { t: T - 600 })).status, 400);
  assertEquals(db.rpcs.length, 0, "nothing applied from an unsigned event");
  // no secret anywhere: a loud 503, so Stripe keeps retrying until it's set
  assertEquals((await handle(new Request("https://x/", { method: "POST", body: "{}" }), { ...deps(db), secret: async () => undefined })).status, 503);
  assertEquals((await handle(new Request("https://x/", { method: "GET" }), deps(db))).status, 405);
});

Deno.test("checkout, then the subscription: plan, period, stores and allowance; shown at once", async () => {
  const db = fakeDb(), d = deps(db);
  const cs = { id: "cs_test_a1", object: "checkout.session", mode: "subscription", status: "complete", payment_status: "paid", customer: "cus_QStore", subscription: "sub_1QStore", client_reference_id: WS,
    metadata: { workspace_id: WS, plan: "store", interval: "year", renewal_consent: "2026-10-27T17:59:00Z" } };
  assertEquals((await post(d, event("checkout.session.completed", cs))).status, 200);
  assertEquals(db.billing.get(WS)!.stripe_customer_id, "cus_QStore");
  assertEquals((await post(d, event("customer.subscription.created", subscription({ qty: 3 })))).status, 200);
  const b = db.billing.get(WS)!;
  assertEquals([b.subscription_status, b.subscription_plan, b.paid_locations, b.current_period_end], ["active", "store", 3, new Date((T + 365 * 86400) * 1000).toISOString()]);
  assert(db.rows.some((r) => r.table === "audit_log" && (r.row.action as { en: string }).en === "Started"));

  // monthly, found by its lookup key only (no env var): the plan name follows the price
  const m = fakeDb();
  await post(deps(m), event("customer.subscription.created", subscription({ lookup: "placetta_store_plan_month", price: "price_m", interval: "month", qty: 2, meta: { workspace_id: WS, plan: "store" } })));
  assertEquals([m.billing.get(WS)!.subscription_plan, m.billing.get(WS)!.paid_locations], ["store_monthly", 2]);
});

Deno.test("each event once: a duplicate is acknowledged and not applied again; a crash is retried", async () => {
  const db = fakeDb(), d = deps(db);
  const ev = event("checkout.session.completed", { id: "cs_pack_1", object: "checkout.session", mode: "payment", payment_status: "paid", customer: "cus_1", metadata: { workspace_id: WS, kind: "pack", packs: "2", credit_usd: "50" } });
  assertEquals((await post(d, ev)).status, 200);
  const again = await post(d, ev);
  assertEquals([again.status, (await again.json()).duplicate], [200, true]);
  assertEquals(db.billing.get(WS)!.ai_credit_usd, 50, "a pack's credit once");
  // the same session seen by billing's confirm (a different key path): still once
  await db.db.rpc("ai_credit_once", { p_ws: WS, p_usd: 50, p_key: "pack:cs_pack_1" });
  assertEquals(db.billing.get(WS)!.ai_credit_usd, 50);

  // a database error: 500 (Stripe retries), the event forgotten so the retry is applied
  const bad = fakeDb({ failRpc: "billing_subscription_apply" });
  const e2 = event("customer.subscription.updated", subscription());
  assertEquals((await post(deps(bad), e2)).status, 500);
  assert(!bad.events.has(e2.id));
  // a workspace without a billing row is loud too, never a silent 200
  const nob = fakeDb({ noBilling: true });
  assertEquals((await post(deps(nob), event("customer.subscription.created", subscription()))).status, 500);
  // an event type the app doesn't use: acknowledged, nothing recorded
  const other = await post(d, event("customer.created", { id: "cus_x" }));
  assertEquals([other.status, (await other.json()).ignored], [200, true]);
});

Deno.test("out of order: a late 'updated' never undoes a 'deleted'", async () => {
  const db = fakeDb(), d = deps(db);
  await post(d, event("customer.subscription.deleted", subscription({ status: "canceled" }), T));
  await post(d, event("customer.subscription.updated", subscription({ status: "active" }), T - 60));
  const b = db.billing.get(WS)!;
  assertEquals([b.subscription_status, b.paid_locations], ["canceled", 0]);
  const ended = db.rows.find((r) => r.table === "updates" && String(r.row.dedupe).startsWith("plan_ended:"));
  assert(ended && (ended.row.title as { zh: string }).zh === NOTICE.ended.title.zh, "the owner hears the plan ended, in English and Chinese");
  assert(NOTICE.ended.body.en.includes("Everything you saved stays"));
});

Deno.test("quantity: a store added in the portal or by sync updates the stores paid for", async () => {
  const db = fakeDb(), d = deps(db);
  await post(d, event("customer.subscription.created", subscription({ qty: 3 }), T - 100));
  await post(d, event("customer.subscription.updated", subscription({ qty: 5 }), T));
  assertEquals(db.billing.get(WS)!.paid_locations, 5);
  // past due keeps the subscription but pays for no stores (Odelia's allowance drops to the free one)
  await post(d, event("customer.subscription.updated", subscription({ qty: 5, status: "past_due" }), T + 10));
  assertEquals([db.billing.get(WS)!.subscription_status, db.billing.get(WS)!.paid_locations], ["past_due", 0]);
});

Deno.test("cancel at period end in the portal turns auto-renew off here too", async () => {
  const db = fakeDb(), d = deps(db);
  await post(d, event("customer.subscription.updated", subscription({ cancelAtEnd: true })));
  assertEquals(db.billing.get(WS)!.auto_renew, false);
  assertEquals(db.billing.get(WS)!.subscription_status, "active", "kept until the period ends");
});

Deno.test("a second live subscription for one workspace goes to the team", async () => {
  const db = fakeDb(), d = deps(db);
  await post(d, event("customer.subscription.created", subscription({ id: "sub_A" }), T - 10));
  await post(d, event("customer.subscription.created", subscription({ id: "sub_B" }), T));
  assert(db.rows.some((r) => r.table === "team_tasks" && r.row.kind === "billing" && r.row.dedupe === "dup-sub:sub_B"));
});

Deno.test("dunning: a failed invoice is told to the owner in English and Chinese, once; paid clears it", async () => {
  const db = fakeDb(), d = deps(db);
  await post(d, event("customer.subscription.created", subscription(), T - 100));
  const inv = { id: "in_1QFail", object: "invoice", number: "PLC-0001", status: "open", attempt_count: 1, customer: "cus_QStore",
    parent: { type: "subscription_details", subscription_details: { subscription: "sub_1QStore", metadata: { workspace_id: WS, plan: "store" } } } };
  await post(d, event("invoice.payment_failed", inv, T - 50));
  await post(d, event("invoice.payment_failed", { ...inv, attempt_count: 2 }, T - 40));
  const notes = db.rows.filter((r) => r.table === "updates" && r.row.dedupe === "payment_failed:in_1QFail");
  assertEquals(notes.length, 1);
  assertEquals(notes[0].row.title, NOTICE.failed.title);
  assert(NOTICE.failed.body.zh.includes("更新银行卡") && NOTICE.failed.body.en.includes("Manage billing"));
  assert(db.billing.get(WS)!.payment_issue_at);
  // an invoice without metadata is found by its subscription (older API shape)
  await post(d, event("invoice.paid", { id: "in_1QFail", object: "invoice", subscription: "sub_1QStore", status: "paid" }, T));
  assertEquals(db.billing.get(WS)!.payment_issue_at, null);
  assert(db.rows.some((r) => r.table === "updates" && r.row.dedupe === "payment_ok:in_1QFail"));
});

Deno.test("license: paid once at Checkout; a full refund lets it go; one already filed goes to the team", async () => {
  const db = fakeDb(), d = deps(db);
  const cs = { id: "cs_test_lic", object: "checkout.session", mode: "payment", payment_status: "paid", customer: "cus_1", payment_intent: "pi_lic",
    metadata: { workspace_id: WS, kind: "license", charge_id: "c-1", ref: "sj-sign", tier: "license" } };
  await post(d, event("checkout.session.completed", cs));
  await post(d, event("checkout.session.completed", cs));   // a second delivery with a new event id is still settled once
  assertEquals(db.charges.get("c-1"), "paid");
  assertEquals(db.rows.filter((r) => r.table === "audit_log" && (r.row.action as { en: string }).en === "Paid for a filing").length, 1);
  // an unpaid session (bank debit still pending) settles nothing
  await post(d, event("checkout.session.completed", { ...cs, id: "cs_unpaid", payment_status: "unpaid", metadata: { ...cs.metadata, charge_id: "c-2" } }));
  assert(!db.charges.has("c-2") || db.charges.get("c-2") !== "paid");

  // charge.refunded names the payment; its metadata says which charge (payment_intent_data[metadata])
  const pi = { pi_lic: { workspace_id: WS, kind: "license", charge_id: "c-1", ref: "sj-sign" }, pi_used: { workspace_id: WS, kind: "license", charge_id: "c-used" } };
  const ch = { id: "ch_1", object: "charge", amount: 29900, amount_refunded: 29900, refunded: true, payment_intent: "pi_lic", metadata: {} };
  await post(deps(db, pi), event("charge.refunded", ch));
  assertEquals(db.charges.get("c-1"), "void");
  await post(deps(db, pi), event("charge.refunded", { ...ch, id: "ch_2", payment_intent: "pi_used" }));
  assertEquals(db.charges.get("c-used"), "used");
  assert(db.rows.some((r) => r.table === "team_tasks" && r.row.dedupe === "refund:ch_2"));
  // a partial refund is recorded, nothing let go
  db.charges.set("c-3", "paid");
  await post(deps(db, { pi_3: { workspace_id: WS, kind: "license", charge_id: "c-3" } }), event("charge.refunded", { ...ch, id: "ch_3", amount_refunded: 10000, refunded: false, payment_intent: "pi_3" }));
  assertEquals(db.charges.get("c-3"), "paid");
});

Deno.test("a delayed payment: completed unpaid fulfils nothing; fulfilled once when it clears; a failure fulfils nothing", async () => {
  const db = fakeDb(), d = deps(db);
  const cs = { id: "cs_test_ach", object: "checkout.session", mode: "payment", status: "complete", payment_status: "unpaid", customer: "cus_1",
    metadata: { workspace_id: WS, kind: "license", charge_id: "c-1", ref: "sj-sign" } };
  await post(d, event("checkout.session.completed", cs));
  assertEquals(db.charges.get("c-1"), "pending", "not paid yet, not fulfilled");
  await post(d, event("checkout.session.async_payment_succeeded", { ...cs, payment_status: "paid" }));
  assertEquals(db.charges.get("c-1"), "paid");
  // a pack paid by a debit that fails: no credit
  const pack = { id: "cs_test_ach_p", object: "checkout.session", mode: "payment", status: "complete", payment_status: "unpaid", metadata: { workspace_id: WS, kind: "pack", credit_usd: "25" } };
  await post(d, event("checkout.session.completed", pack));
  const failed = await post(d, event("checkout.session.async_payment_failed", pack));
  assertEquals(failed.status, 200);
  assertEquals(db.billing.get(WS)!.ai_credit_usd, 0);
  assert(db.rows.some((r) => r.table === "audit_log" && (r.row.action as { en: string }).en === "A payment didn't go through"));
});

Deno.test("a refunded pack takes its credit back, once, never below zero", async () => {
  const db = fakeDb(), d = deps(db, { pi_pack: { workspace_id: WS, kind: "pack", credit_usd: "25" } });
  await post(d, event("checkout.session.completed", { id: "cs_p", object: "checkout.session", mode: "payment", payment_status: "paid", metadata: { workspace_id: WS, kind: "pack", credit_usd: "25" } }));
  assertEquals(db.billing.get(WS)!.ai_credit_usd, 25);
  const ch = { id: "ch_p", object: "charge", amount: 4900, amount_refunded: 4900, refunded: true, payment_intent: "pi_pack", metadata: {} };
  await post(d, event("charge.refunded", ch));
  await post(d, event("charge.refunded", ch));
  assertEquals(db.billing.get(WS)!.ai_credit_usd, 0);
});
