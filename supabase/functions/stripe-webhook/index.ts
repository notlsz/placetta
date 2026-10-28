// Stripe tells us when someone pays. The work is in handler.ts (tested with signed sample events in handler_test.ts);
// this file only wires it to the database and Stripe. The endpoint itself is made by ensureWebhook: on the monitor's
// daily run, from staff's billing health check, and before any checkout (_shared/stripe_catalog.ts).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { client, webhookSecret } from "../_shared/stripe_catalog.ts";
import { configStore, stripeDb } from "../_shared/stripe_db.ts";
import { handle } from "./handler.ts";
import { STRIPE_VERSION, type CardPurchase } from "../_shared/issuing.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const env = (k: string) => Deno.env.get(k);

Deno.serve((req) => handle(req, {
  db: stripeDb(admin),
  env,
  secret: () => webhookSecret(env, configStore(admin)),
  paymentIntentMeta: async (id) => env("STRIPE_SECRET_KEY") ? ((await client(env).get(`payment_intents/${encodeURIComponent(id)}`))?.metadata ?? null) : null,
  issuing: {
    // the purchase a single-use card was made for, and whether the Autopilot grant behind it is still live
    async purchaseForCard(cardId: string): Promise<CardPurchase | null> {
      const { data: p } = await admin.from("purchases").select("id, workspace_id, status, method, card_id, amount_cents, autopilot_grant").eq("card_id", cardId).maybeSingle();
      if (!p) return null;
      const { data: live } = p.autopilot_grant ? await admin.rpc("autopilot_live", { p_grant: p.autopilot_grant }) : { data: false };
      return { id: p.id, workspace_id: p.workspace_id, status: p.status, method: p.method, card_id: p.card_id, amount_cents: p.amount_cents, grant_live: !!live };
    },
    async paid(cardId: string) {
      const { data: row } = await admin.from("purchases").update({ status: "paid", paid_at: new Date().toISOString() }).eq("card_id", cardId).eq("status", "approved").select("id, workspace_id, payee, amount_cents, app_id").maybeSingle();
      const key = env("STRIPE_SECRET_KEY");
      if (key) await fetch(`https://api.stripe.com/v1/issuing/cards/${encodeURIComponent(cardId)}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": STRIPE_VERSION }, body: "status=canceled" }).catch(() => undefined);
      if (!row) return;
      const amt = `$${(row.amount_cents / 100).toLocaleString("en-US")}`;
      await admin.from("updates").upsert({ workspace_id: row.workspace_id, kind: "purchase", title: { en: `Paid ${row.payee} ${amt}`, zh: `已向 ${row.payee} 支付 ${amt}` }, app_id: row.app_id, dedupe: `purchase:${row.id}:paid` }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
      await admin.from("audit_log").insert({ workspace_id: row.workspace_id, actor: "agent", actor_id: null, action: { en: "Paid an agency fee under Autopilot", zh: "在自动驾驶下支付了机构费用" }, object: { en: `${amt} to ${row.payee}`, zh: `向 ${row.payee} 支付 ${amt}` } });
    },
  },
}));
