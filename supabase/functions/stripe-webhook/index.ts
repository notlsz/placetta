// Stripe tells us when someone pays. Signature checked by hand (HMAC-SHA256), each event applied once.
//   checkout.session.completed, or .async_payment_succeeded when a delayed method clears (logic.ts checkoutEffect):
//   checkout.session.completed (payment, plan=entry)  -> billing.entry_markets += markets (added in SQL, atomically)
//   checkout.session.completed (payment, kind=license) -> that filing's license charge is paid (license_charge_settle)
//   a store plan subscription (plan=store)             -> billing.subscription_*, plan 'store', its stores paid for
//   customer.subscription.created / updated / deleted  -> billing.subscription_*, unless an event created later was
//                                                        already applied (Stripe doesn't deliver in order)
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { itemOf, webhookSecret } from "../_shared/stripe_catalog.ts";
import { SIMPLE_PRICE_ENV, TERM_PRICE_ENV } from "../../../src/pricing.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

import { checkoutEffect, verified } from "./logic.ts";

const PLAN_NAME: Record<string, { en: string; zh: string }> = {
  entry: { en: "Entry plan", zh: "开店计划" }, starter: { en: "Starter plan", zh: "入门版" }, growth: { en: "Growth plan", zh: "成长版" }, scale: { en: "Scale plan", zh: "规模版" }, locations: { en: "Per location plan", zh: "按门店计费" },
};
async function log(ws: string, action: { en: string; zh: string }, plan: string) {
  await admin.from("audit_log").insert({ workspace_id: ws, actor: "you", actor_id: null, action, object: PLAN_NAME[plan] ?? { en: plan, zh: plan } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  // the env secret, else the one kept when Placetta made the endpoint itself (billing does that before the first checkout)
  const secret = await webhookSecret((k) => Deno.env.get(k), {
    get: async (key) => ((await admin.from("stripe_config").select("value").eq("key", key).maybeSingle()).data?.value as string | undefined) ?? undefined,
    set: async () => {},
  });
  if (!secret) return reply(503, { error: "Set STRIPE_WEBHOOK_SECRET." });
  const raw = await req.text();
  if (!(await verified(raw, req.headers.get("stripe-signature") ?? "", secret))) return reply(400, { error: "Bad signature." });

  const event = JSON.parse(raw) as { id: string; type: string; created?: number; data: { object: Record<string, any> } };
  const { error: dup } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  // Only a unique violation means "already applied"; any other failure is ours, and Stripe should retry.
  if (dup?.code === "23505") return reply(200, { received: true, duplicate: true });
  if (dup) { console.error("webhook event insert", dup.code); return reply(500, { error: "Try again." }); }

  try {
    const o = event.data.object;
    // completed (paid now) or async_payment_succeeded (a delayed method cleared): what's paid for is fulfilled
    // (logic.ts checkoutEffect); unpaid or failed fulfils nothing
    const c = checkoutEffect(event.type, o);
    if (c) {
      const ws = c.ws;
      if (ws) {
        // a license or renewal on the simple model, paid at the price the owner approved: its filing may now go in
        // (license_charge_settle only moves a pending charge to paid, so a second event changes nothing)
        if (c.license) {
          const { error } = await admin.rpc("license_charge_settle", { p_id: c.license, p_ok: true, p_stripe: String(o.id ?? "") || null });
          if (error) throw new Error(error.message);
          await admin.from("audit_log").insert({ workspace_id: ws, actor: "you", actor_id: null, action: { en: "Paid for a filing", zh: "已支付申报费用" }, object: { en: String(o.metadata.ref ?? ""), zh: String(o.metadata.ref ?? "") } });
        }
        // One statement in the database: the customer (kept if already set), entry markets added to what's there, the
        // stores this checkout billed for (later stores are charged by billing's sync_locations; an older checkout
        // without the list counts the stores billing knows), and the entry credit, which is never given twice.
        const { error } = await admin.rpc("billing_checkout_completed", {
          p_ws: ws, p_customer: typeof o.customer === "string" ? o.customer : null, p_add_markets: c.markets,
          p_locations: c.locations, p_entry_credited: c.entryCredited,
        });
        if (error) throw new Error(error.message);
        if (c.markets) await log(ws, { en: "Paid", zh: "已付款" }, "entry");
        // the contract term the owner chose next to the renewal terms (src/contract.ts)
        if (c.termYears) {
          const { error: te } = await admin.rpc("billing_term_apply", { p_ws: ws, p_years: c.termYears });
          if (te) throw new Error(te.message);
        }
        // The pack's credit is added last, in one statement. A failure above throws before it, the event is forgotten
        // and Stripe's retry applies it once; before 2026-10-25 the credit came first, so a later failure and its retry
        // added the credit twice. (The credit was set by the billing function when it made this checkout.)
        if (c.packUsd > 0) {
          const { error } = await admin.rpc("ai_add_credit", { ws, p_usd: c.packUsd });
          if (error) throw new Error(error.message);
          await admin.from("audit_log").insert({ workspace_id: ws, actor: "you", actor_id: null, action: { en: "Added an Odelia pack", zh: "购买 Odelia 加量包" }, object: { en: `$${c.packUsd} of Odelia allowance`, zh: `$${c.packUsd} Odelia 额度` } });
        }
      }
    } else if (event.type.startsWith("customer.subscription.") && typeof o.metadata?.hq_email === "string" && !o.metadata?.workspace_id) {
      // a headquarters paying for its brand (src/hqPlan.ts): its plan, then every linked workspace's coverage
      const end = o.current_period_end ?? o.items?.data?.[0]?.current_period_end;
      const createdAt = new Date((Number(event.created) || Math.floor(Date.now() / 1000)) * 1000).toISOString();
      const { error } = await admin.rpc("hq_subscription_apply", {
        p_email: o.metadata.hq_email, p_event_at: createdAt, p_customer: typeof o.customer === "string" ? o.customer : null, p_subscription: o.id,
        p_status: event.type === "customer.subscription.deleted" ? "canceled" : String(o.status), p_period_end: end ? new Date(end * 1000).toISOString() : null,
      });
      if (error) throw new Error(error.message);
    } else if (event.type.startsWith("customer.subscription.")) {
      const ws = o.metadata?.workspace_id as string | undefined;
      if (ws) {
        const end = o.current_period_end ?? o.items?.data?.[0]?.current_period_end;
        const status = event.type === "customer.subscription.deleted" ? "canceled" : String(o.status);
        // the locations paid for, which size Odelia's monthly allowance
        const env = (k: string) => Deno.env.get(k);
        const items = (o.items?.data ?? []) as { price?: { id?: string; lookup_key?: string | null }; quantity?: number }[];
        // a location price: the plan's own, or a two or three year term's (src/pricing.ts TERM_PRICE_ENV)
        const tierOf = (p: { id?: string; lookup_key?: string | null } | undefined) => {
          const it = itemOf(p, env);
          if (it === "essentials" || it === "pro") return it;
          // the simple model's store plan: billed yearly, or month to month (src/pricing.ts SIMPLE_PRICE_ENV)
          if (p?.id && (env(SIMPLE_PRICE_ENV.plan.env) === p.id || env(SIMPLE_PRICE_ENV.planMonthly.env) === p.id)) return "store" as const;
          return (["essentials", "pro"] as const).find((t) => Object.values(TERM_PRICE_ENV[t]).some((k) => !!p?.id && env(k) === p.id));
        };
        const located = items.filter((i) => !!tierOf(i.price));
        const paid = status === "active" || status === "trialing" ? located.reduce((n, i) => n + (Number(i.quantity) || 0), 0) : 0;
        // Pro sizes a larger Odelia allowance. The price decides (a move in the portal changes it); the tier set at
        // checkout counts only when no location price is recognized.
        const pro = located.length ? located.some((i) => tierOf(i.price) === "pro") : o.metadata?.tier === "pro";
        // Applied only if no event created later has been applied already: a late "updated" can't undo a "deleted".
        const createdAt = new Date((Number(event.created) || Math.floor(Date.now() / 1000)) * 1000).toISOString();
        const { data: applied, error } = await admin.rpc("billing_subscription_apply", {
          p_ws: ws, p_event_at: createdAt, p_customer: o.customer, p_subscription: o.id, p_status: status,
          p_plan: pro ? "pro" : o.metadata?.plan ?? null, p_period_end: end ? new Date(end * 1000).toISOString() : null, p_paid_locations: paid,
        });
        if (error) throw new Error(error.message);
        if (applied === true && event.type === "customer.subscription.created") await log(ws, { en: "Started", zh: "开通" }, o.metadata?.plan ?? "starter");
        if (applied === true && event.type === "customer.subscription.deleted") await log(ws, { en: "Ended", zh: "已结束" }, o.metadata?.plan ?? "starter");
        // auto-renew turned off or on in Stripe's own portal: kept in step, so no renewal notice goes out after a cancel
        if (applied === true && typeof o.cancel_at_period_end === "boolean" && status !== "canceled") {
          const { data: b } = await admin.from("billing").select("auto_renew").eq("workspace_id", ws).maybeSingle();
          if (b && b.auto_renew === o.cancel_at_period_end) await admin.rpc("billing_auto_renew_apply", { p_ws: ws, p_on: !o.cancel_at_period_end, p_user: null });
        }
      }
    }
  } catch (e) {
    // Let Stripe retry: forget the event so the retry is applied.
    await admin.from("stripe_events").delete().eq("id", event.id);
    console.error("webhook", (e as Error).message);
    return reply(500, { error: "Try again." });
  }
  return reply(200, { received: true });
});
