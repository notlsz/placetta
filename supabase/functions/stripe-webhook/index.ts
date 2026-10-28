// Stripe tells us when someone pays. The work is in handler.ts (tested with signed sample events in handler_test.ts);
// this file only wires it to the database and Stripe. The endpoint itself is made by ensureWebhook: on the monitor's
// daily run, from staff's billing health check, and before any checkout (_shared/stripe_catalog.ts).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { client, webhookSecret } from "../_shared/stripe_catalog.ts";
import { configStore, stripeDb } from "../_shared/stripe_db.ts";
import { handle } from "./handler.ts";
import { reconcile, STRIPE_VERSION, type CardPurchase } from "../_shared/issuing.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const env = (k: string) => Deno.env.get(k);

/** A card's status, by Stripe's API: inactive freezes it, canceled closes it. Never logs anything but the outcome. */
async function cardStatus(cardId: string, status: "inactive" | "canceled") {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) return;
  const r = await fetch(`https://api.stripe.com/v1/issuing/cards/${encodeURIComponent(cardId)}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": STRIPE_VERSION }, body: `status=${status}` }).catch(() => null);
  // a single-use card Stripe already canceled after its one payment refuses "inactive": that's fine
  if (!r?.ok && status === "canceled") console.error("issuing: card close failed", r?.status ?? "no answer");
}
const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0 })}`;
const cardOf = (o: Record<string, unknown>) => { const c = o.card as string | { id?: string } | undefined; return typeof c === "string" ? c : c?.id ?? ""; };

Deno.serve((req) => handle(req, {
  db: stripeDb(admin),
  env,
  secret: () => webhookSecret(env, configStore(admin)),
  paymentIntentMeta: async (id) => env("STRIPE_SECRET_KEY") ? ((await client(env).get(`payment_intents/${encodeURIComponent(id)}`))?.metadata ?? null) : null,
  issuing: {
    // the purchase a single-use card was made for, and whether the authority behind it is still live: the Autopilot
    // grant, or (for an owner's approval) the purchase still approved
    async purchaseForCard(cardId: string): Promise<CardPurchase | null> {
      const { data: p } = await admin.from("purchases").select("id, workspace_id, status, method, card_id, amount_cents, autopilot_grant").eq("card_id", cardId).maybeSingle();
      if (!p) return null;
      const { data: live } = p.autopilot_grant ? await admin.rpc("autopilot_live", { p_grant: p.autopilot_grant }) : { data: p.status === "approved" };
      return { id: p.id, workspace_id: p.workspace_id, status: p.status, method: p.method, card_id: p.card_id, amount_cents: p.amount_cents, grant_live: !!live };
    },
    async paid(cardId: string) {
      const { data: row } = await admin.from("purchases").update({ status: "paid", paid_at: new Date().toISOString() }).eq("card_id", cardId).eq("status", "approved").select("id, workspace_id, payee, amount_cents, app_id").maybeSingle();
      await cardStatus(cardId, "canceled");
      if (!row) return;
      const amt = money(row.amount_cents);
      await admin.from("updates").upsert({ workspace_id: row.workspace_id, kind: "purchase", title: { en: `Paid ${row.payee} ${amt}`, zh: `已向 ${row.payee} 支付 ${amt}` }, app_id: row.app_id, dedupe: `purchase:${row.id}:paid` }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
      await admin.from("audit_log").insert({ workspace_id: row.workspace_id, actor: "agent", actor_id: null, action: { en: "Paid an agency fee", zh: "支付了机构费用" }, object: { en: `${amt} to ${row.payee}`, zh: `向 ${row.payee} 支付 ${amt}` } });
    },
    // approved: recorded on the purchase, and the card frozen so nothing else can use it
    async authorized(a) {
      const cardId = cardOf(a);
      if (!cardId) return;
      const m = (a.merchant_data ?? {}) as { name?: string; category?: string };
      await admin.from("purchases").update({ authorization_id: String(a.id ?? ""), authorized_cents: Math.abs(Number(a.amount ?? 0)) || null, merchant: { name: m.name ?? null, category: m.category ?? null } })
        .eq("card_id", cardId).is("authorization_id", null);
      await cardStatus(cardId, "inactive");
    },
    // settled: paid, the unspent part of the business's charge refunded, the card closed, and anything that doesn't
    // reconcile goes to the team. A refund from the agency (positive amount) is passed back to the business.
    async settled(t) {
      const cardId = cardOf(t);
      if (!cardId) return;
      const { data: p } = await admin.from("purchases").select("id, workspace_id, filing_id, payee, app_id, amount_cents, charge_id, refunded_cents, authorized_cents, receipt_cents, status, settled_cents")
        .eq("card_id", cardId).maybeSingle();
      if (!p) return;
      const amount = Number(t.amount ?? 0);
      const m = (t.merchant_data ?? {}) as { name?: string; category?: string };
      const key = env("STRIPE_SECRET_KEY");
      const refund = async (cents: number, why: string) => {
        if (!(cents > 0) || !p.charge_id || !key) return 0;
        const r = await client(env).post("refunds", { payment_intent: p.charge_id, amount: String(cents), "metadata[purchase_id]": p.id, "metadata[why]": why }, `spend-${why}-${p.id}-${String(t.id ?? "")}`).catch(() => null);
        return r ? cents : 0;
      };
      if (amount > 0) {
        // the agency refunded the card: the business gets it back
        const back = await refund(amount, "agency-refund");
        await admin.from("purchases").update({ refunded_cents: (p.refunded_cents ?? 0) + back }).eq("id", p.id);
        return;
      }
      const settled = -amount + (p.settled_cents ?? 0);
      const r = reconcile({ chargedCents: p.amount_cents, refundedCents: p.refunded_cents ?? 0, limitCents: p.amount_cents, authorizedCents: p.authorized_cents ?? null,
        settledCents: settled, receiptCents: p.receipt_cents ?? null, category: m.category ?? null });
      const back = await refund(r.refundCents, "unspent");
      await admin.from("purchases").update({ status: "paid", paid_at: new Date().toISOString(), settled_cents: settled, transaction_id: String(t.id ?? ""), refunded_cents: (p.refunded_cents ?? 0) + back,
        ...(r.flags.length ? { flags: r.flags } : {}) }).eq("id", p.id);
      await cardStatus(cardId, "canceled");
      const amt = money(settled);
      await admin.from("updates").upsert({ workspace_id: p.workspace_id, kind: "purchase", title: { en: `Paid ${p.payee} ${amt}`, zh: `已向 ${p.payee} 支付 ${amt}` },
        body: back ? { en: `The other ${money(back)} held for it was refunded to your card.`, zh: `为此预留的其余 ${money(back)} 已退回您的卡。` } : null, app_id: p.app_id, dedupe: `purchase:${p.id}:paid` },
        { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
      await admin.from("audit_log").insert({ workspace_id: p.workspace_id, actor: "agent", actor_id: null, action: { en: "Paid an agency fee", zh: "支付了机构费用" }, object: { en: `${amt} to ${p.payee}`, zh: `向 ${p.payee} 支付 ${amt}` } });
      if (r.flags.length) {
        await admin.from("team_tasks").upsert({ kind: "fee_mismatch", workspace_id: p.workspace_id, filing_id: p.filing_id, title: `Fee to ${p.payee} doesn't reconcile: ${r.flags.join("; ")}`.slice(0, 300),
          detail: { purchase: p.id, transaction: t.id ?? null }, dedupe: `fee_mismatch:purchase:${p.id}` }, { onConflict: "dedupe", ignoreDuplicates: true });
      }
    },
  },
}));
