// Stripe tells us when someone pays. Signature checked by hand (HMAC-SHA256), each event applied once.
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

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function verified(raw: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]).filter((p) => p.length === 2));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${parts.t}.${raw}`)));
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => same(p.slice(3), sig));
}

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
    if (event.type === "checkout.session.completed") {
      const ws = o.metadata?.workspace_id as string | undefined;
      if (ws) {
        let markets = 0;
        if (o.mode === "payment" && o.metadata?.plan === "entry" && o.payment_status === "paid") {
          markets = Math.max(1, Math.min(20, Number(o.metadata?.markets) || 1));
        }
        // a license or renewal on the simple model, paid at the price the owner approved: its filing may now go in
        if (o.mode === "payment" && o.metadata?.kind === "license" && o.payment_status === "paid" && typeof o.metadata?.charge_id === "string") {
          const { error } = await admin.rpc("license_charge_settle", { p_id: o.metadata.charge_id, p_ok: true, p_stripe: String(o.id ?? "") || null });
          if (error) throw new Error(error.message);
          await admin.from("audit_log").insert({ workspace_id: ws, actor: "you", actor_id: null, action: { en: "Paid for a filing", zh: "已支付申报费用" }, object: { en: String(o.metadata.ref ?? ""), zh: String(o.metadata.ref ?? "") } });
        }
        if (o.mode === "payment" && o.metadata?.kind === "pack" && o.payment_status === "paid") {
          // the credit was set by the billing function when it made this checkout
          const usd = Math.max(0, Math.min(1000, Number(o.metadata?.credit_usd) || 0));
          if (usd > 0) {
            const { error } = await admin.rpc("ai_add_credit", { ws, p_usd: usd });
            if (error) throw new Error(error.message);
            await admin.from("audit_log").insert({ workspace_id: ws, actor: "you", actor_id: null, action: { en: "Added an Odelia pack", zh: "购买 Odelia 加量包" }, object: { en: `$${usd} of Odelia allowance`, zh: `$${usd} Odelia 额度` } });
          }
        }
        // One statement in the database: the customer (kept if already set), entry markets added to what's there, the
        // stores this checkout billed for (later stores are charged by billing's sync_locations; an older checkout
        // without the list counts the stores billing knows), and the entry credit, which is never given twice.
        const locations = o.mode === "subscription" && o.metadata?.plan === "locations";
        const { error } = await admin.rpc("billing_checkout_completed", {
          p_ws: ws, p_customer: typeof o.customer === "string" ? o.customer : null, p_add_markets: markets,
          p_locations: locations, p_entry_credited: locations && Number(o.metadata?.entry_credit) > 0,
        });
        if (error) throw new Error(error.message);
        if (markets) await log(ws, { en: "Paid", zh: "已付款" }, "entry");
        // the contract term the owner chose next to the renewal terms (src/contract.ts)
        if (locations && o.metadata?.term_years) {
          const { error: te } = await admin.rpc("billing_term_apply", { p_ws: ws, p_years: Math.max(1, Math.min(3, Number(o.metadata.term_years) || 1)) });
          if (te) throw new Error(te.message);
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
