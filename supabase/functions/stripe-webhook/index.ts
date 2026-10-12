// Stripe tells us when someone pays. Signature checked by hand (HMAC-SHA256), each event applied once.
//   checkout.session.completed (payment, plan=entry)  -> billing.entry_markets += markets
//   customer.subscription.created / updated / deleted  -> billing.subscription_*
import { createClient } from "npm:@supabase/supabase-js@2";

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
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return reply(503, { error: "Set STRIPE_WEBHOOK_SECRET." });
  const raw = await req.text();
  if (!(await verified(raw, req.headers.get("stripe-signature") ?? "", secret))) return reply(400, { error: "Bad signature." });

  const event = JSON.parse(raw) as { id: string; type: string; data: { object: Record<string, any> } };
  const { error: dup } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dup) return reply(200, { received: true, duplicate: true });   // already applied

  try {
    const o = event.data.object;
    if (event.type === "checkout.session.completed") {
      const ws = o.metadata?.workspace_id as string | undefined;
      if (ws) {
        const { data: b } = await admin.from("billing").select("entry_markets, stripe_customer_id").eq("workspace_id", ws).maybeSingle();
        const patch: Record<string, unknown> = {};
        if (o.customer && !b?.stripe_customer_id) patch.stripe_customer_id = o.customer;
        if (o.mode === "payment" && o.metadata?.plan === "entry" && o.payment_status === "paid") {
          patch.entry_markets = (b?.entry_markets ?? 0) + Math.max(1, Number(o.metadata?.markets) || 1);
          patch.entry_paid_at = new Date().toISOString();
          await log(ws, { en: "Paid", zh: "已付款" }, "entry");
        }
        if (o.mode === "subscription" && o.metadata?.plan === "locations") {
          // The stores at checkout paid their opening fee in it; later stores are charged by billing's sync_locations.
          const { data: w } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
          const stores = (w?.state as { stores?: { id?: unknown }[] } | null)?.stores;
          patch.charged_store_ids = Array.isArray(stores) ? stores.map((x) => x?.id).filter((x): x is string => typeof x === "string") : [];
          // The entry plans were credited in this checkout, so they are never credited again.
          if (Number(o.metadata?.entry_credit) > 0) patch.entry_credited_at = new Date().toISOString();
        }
        if (Object.keys(patch).length) await admin.from("billing").update(patch).eq("workspace_id", ws);
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      const ws = o.metadata?.workspace_id as string | undefined;
      if (ws) {
        const end = o.current_period_end ?? o.items?.data?.[0]?.current_period_end;
        const status = event.type === "customer.subscription.deleted" ? "canceled" : String(o.status);
        await admin.from("billing").update({
          stripe_customer_id: o.customer, subscription_id: o.id, subscription_status: status,
          subscription_plan: o.metadata?.plan ?? null, current_period_end: end ? new Date(end * 1000).toISOString() : null,
        }).eq("workspace_id", ws);
        if (event.type === "customer.subscription.created") await log(ws, { en: "Started", zh: "开通" }, o.metadata?.plan ?? "starter");
        if (event.type === "customer.subscription.deleted") await log(ws, { en: "Ended", zh: "已结束" }, o.metadata?.plan ?? "starter");
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
