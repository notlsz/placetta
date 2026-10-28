// What a Stripe object does to the database, shared by the webhook (stripe-webhook/handler.ts) and billing's
// "confirm" (the person back from Checkout, so the plan shows at once even if the webhook is late). Every write is a
// database function that is safe to apply twice: a subscription older than the last one applied is ignored, a license
// charge is settled once, a pack's credit is added once per Checkout session and taken back once per refund.
import { itemOf } from "./stripe_catalog.ts";
import { checkoutEffect } from "../stripe-webhook/logic.ts";
import { storePlanItemOf, TERM_PRICE_ENV } from "../../../src/pricing.ts";

type Env = (k: string) => string | undefined;
type Bi = { en: string; zh: string };
// deno-lint-ignore no-explicit-any
export type Obj = Record<string, any>;
export type Db = {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  /** audit_log, or a row upserted once by its dedupe key (updates, team_tasks) */
  insert(table: "audit_log" | "updates" | "team_tasks", row: Record<string, unknown>): Promise<void>;
  billing(ws: string): Promise<{ auto_renew?: boolean | null; subscription_id?: string | null; subscription_status?: string | null } | null>;
  wsOfSubscription(sub: string): Promise<string | null>;
  /** the card a SetupIntent saved (outcome pricing); given by the webhook and billing's confirm */
  setupIntentPm?(id: string): Promise<string | null>;
};

const PLAN_NAME: Record<string, Bi> = {
  entry: { en: "Entry plan", zh: "开店计划" }, starter: { en: "Starter plan", zh: "入门版" }, growth: { en: "Growth plan", zh: "成长版" }, scale: { en: "Scale plan", zh: "规模版" },
  locations: { en: "Per location plan", zh: "按门店计费" }, store: { en: "Store plan, billed yearly", zh: "门店方案（按年计费）" }, store_monthly: { en: "Store plan, monthly", zh: "门店方案（按月）" },
};
const must = async (p: Promise<{ data: unknown; error: { message: string } | null }>) => { const r = await p; if (r.error) throw new Error(r.error.message); return r.data; };
const log = (db: Db, ws: string, action: Bi, object: Bi) => db.insert("audit_log", { workspace_id: ws, actor: "you", actor_id: null, action, object });
const LIVE = ["active", "trialing", "past_due", "unpaid", "incomplete"];

/** Owners hear about money in their Updates, in English and Chinese (the dunning and plan-ended notices). */
export const NOTICE = {
  failed: {
    title: { en: "A payment didn't go through", zh: "一笔付款未成功" },
    body: { en: "Stripe couldn't charge your card for the store plan and will try again over the next few days. Update your card in Settings, Billing, Manage billing. Nothing is deleted; until it's paid, the plan's Odelia allowance and included renewals pause.",
      zh: "Stripe 未能从您的银行卡扣取门店方案费用，接下来几天会自动重试。请在“设置 > 账单 > 管理账单”中更新银行卡。任何内容都不会被删除；付款完成前，方案内的 Odelia 额度和包含的续期将暂停。" },
  },
  licenseFailed: {
    title: { en: "A payment didn't go through", zh: "一笔付款未成功" },
    body: { en: "Stripe couldn't charge your card for a license and will try again over the next few days. Update your card in Settings, Billing, Manage billing, or pay with the link in Updates. Nothing is deleted.",
      zh: "Stripe 未能从您的银行卡扣取一项执照费用，接下来几天会自动重试。请在“设置 > 账单 > 管理账单”中更新银行卡，或使用“动态”中的付款链接支付。任何内容都不会被删除。" },
  },
  paid: {
    title: { en: "Payment received, your plan is on", zh: "已收到付款，方案已生效" },
    body: { en: "Thank you. The payment that didn't go through earlier is paid.", zh: "谢谢。之前未成功的付款已完成。" },
  },
  ended: {
    title: { en: "Your store plan ended", zh: "您的门店方案已结束" },
    body: { en: "Everything you saved stays: stores, documents, filings and the audit trail. Renewal monitoring, renewals Odelia files on her own and the plan's Odelia allowance stop until you start a plan again in Settings, Billing.",
      zh: "您保存的一切都会保留：门店、文件、申报和审计记录。续期监控、Odelia 自行提交的续期以及方案内的 Odelia 额度将暂停，直到您在“设置 > 账单”中重新开通方案。" },
  },
} as const;

/** A paid Checkout: the customer, a license charge paid, a pack's credit, and (older plans) entry markets and stores. */
export async function applyCheckoutSession(db: Db, o: Obj, type = "checkout.session.completed"): Promise<void> {
  // what this event may fulfil (stripe-webhook/logic.ts checkoutEffect): "completed" when paid then, or
  // "async_payment_succeeded" when a delayed method (a bank debit) clears; unpaid or failed fulfils nothing paid for
  const c = checkoutEffect(type, o);
  if (!c?.ws) return;
  const ws = c.ws;
  // outcome pricing: Stripe saved the owner's card for a license charged on the agency's decision; nothing is charged now
  if (c.setup) {
    const si = o.setup_intent;
    const pm = si && typeof si === "object" ? (typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id ?? null)
      : typeof si === "string" && db.setupIntentPm ? await db.setupIntentPm(si) : null;
    if (!pm) throw new Error("setup Checkout without a saved card");
    const customer = typeof o.customer === "string" ? o.customer : (o.customer?.id ?? null);
    const done = await must(db.rpc("license_outcome_authorize", { p_id: c.setup, p_pm: pm, p_customer: customer }));
    if (done === true) await log(db, ws, { en: "Saved a card for a license, nothing charged", zh: "为执照保存了银行卡，未收费" }, { en: String(o.metadata?.ref ?? ""), zh: String(o.metadata?.ref ?? "") });
  }
  // a license or renewal on the simple model, paid at the price the owner approved: its filing may now go in
  if (c.license) {
    const settled = await must(db.rpc("license_charge_settle", { p_id: c.license, p_ok: true, p_stripe: String(o.id ?? "") || null }));
    if (settled === true) await log(db, ws, { en: "Paid for a filing", zh: "已支付申报费用" }, { en: String(o.metadata?.ref ?? ""), zh: String(o.metadata?.ref ?? "") });
  }
  await must(db.rpc("billing_checkout_completed", {
    p_ws: ws, p_customer: typeof o.customer === "string" ? o.customer : (o.customer?.id ?? null), p_add_markets: c.markets,
    p_locations: c.locations, p_entry_credited: c.entryCredited,
  }));
  if (c.markets) await log(db, ws, { en: "Paid", zh: "已付款" }, PLAN_NAME.entry);
  if (c.termYears) await must(db.rpc("billing_term_apply", { p_ws: ws, p_years: c.termYears }));
  // a pack's credit last, and once per session (the webhook and the return from Checkout may both see it)
  if (c.packUsd > 0) {
    const added = await must(db.rpc("ai_credit_once", { p_ws: ws, p_usd: c.packUsd, p_key: `pack:${o.id}` }));
    if (added === true) await log(db, ws, { en: "Added an Odelia pack", zh: "购买 Odelia 加量包" }, { en: `$${c.packUsd} of Odelia allowance`, zh: `$${c.packUsd} Odelia 额度` });
  }
}

/** What a subscription pays for: the plan name, the stores (locations) paid for, which size Odelia's allowance. */
export function subscriptionFacts(o: Obj, status: string, env: Env): { plan: string | null; paid: number } {
  const items = (o.items?.data ?? []) as { price?: { id?: string; lookup_key?: string | null }; quantity?: number }[];
  const tierOf = (p: { id?: string; lookup_key?: string | null } | undefined) => {
    const store = storePlanItemOf(p, env);
    if (store) return store === "planMonthly" ? "store_monthly" : "store";
    const it = itemOf(p, env);
    if (it === "essentials" || it === "pro") return it;
    return (["essentials", "pro"] as const).find((t) => Object.values(TERM_PRICE_ENV[t]).some((k) => !!p?.id && env(k) === p.id));
  };
  const located = items.filter((i) => !!tierOf(i.price));
  const paid = status === "active" || status === "trialing" ? located.reduce((n, i) => n + (Number(i.quantity) || 0), 0) : 0;
  const tiers = located.map((i) => tierOf(i.price));
  // the price decides (a switch in the portal changes it); what checkout set counts only when no price is recognized
  const plan = tiers.includes("store_monthly") ? "store_monthly" : tiers.includes("store") ? "store" : tiers.includes("pro") ? "pro"
    : tiers.length ? (o.metadata?.plan ?? null) : o.metadata?.tier === "pro" ? "pro" : (o.metadata?.plan ?? null);
  return { plan, paid };
}

/** A subscription as Stripe has it now: status, plan, period, stores. Applied only when not older than the last one. */
export async function applySubscription(db: Db, o: Obj, type: string, createdAt: string, env: Env): Promise<boolean> {
  const status = type === "customer.subscription.deleted" ? "canceled" : String(o.status);
  const end = o.current_period_end ?? o.items?.data?.[0]?.current_period_end;
  if (typeof o.metadata?.hq_email === "string" && !o.metadata?.workspace_id) {
    await must(db.rpc("hq_subscription_apply", {
      p_email: o.metadata.hq_email, p_event_at: createdAt, p_customer: typeof o.customer === "string" ? o.customer : null, p_subscription: o.id,
      p_status: status, p_period_end: end ? new Date(end * 1000).toISOString() : null,
    }));
    return true;
  }
  const ws = (o.metadata?.workspace_id as string | undefined) ?? (o.id ? await db.wsOfSubscription(String(o.id)) : null);
  if (!ws) { console.error("stripe: a subscription without a workspace", o.id); return false; }
  const before = await db.billing(ws);
  if (!before) throw new Error(`no billing row for workspace ${ws}`);   // loud: Stripe retries, and the log says why
  // a second live subscription for one workspace (two checkouts paid): the team refunds one
  if (type === "customer.subscription.created" && before.subscription_id && before.subscription_id !== o.id && LIVE.includes(String(before.subscription_status))) {
    console.error("stripe: second subscription for workspace", ws, o.id);
    await db.insert("team_tasks", { kind: "billing", workspace_id: ws, title: "Two store plans are live for one workspace: cancel and refund one", detail: { kept: before.subscription_id, new: o.id }, dedupe: `dup-sub:${o.id}` });
  }
  const { plan, paid } = subscriptionFacts(o, status, env);
  const applied = await must(db.rpc("billing_subscription_apply", {
    p_ws: ws, p_event_at: createdAt, p_customer: typeof o.customer === "string" ? o.customer : (o.customer?.id ?? null), p_subscription: o.id, p_status: status,
    p_plan: plan, p_period_end: end ? new Date(end * 1000).toISOString() : null, p_paid_locations: paid,
  }));
  if (applied !== true) return false;
  const name = PLAN_NAME[plan ?? ""] ?? { en: plan ?? "Plan", zh: plan ?? "方案" };
  if (type === "customer.subscription.created") await log(db, ws, { en: "Started", zh: "开通" }, name);
  if (status === "canceled") {
    await log(db, ws, { en: "Ended", zh: "已结束" }, name);
    await db.insert("updates", { workspace_id: ws, kind: "payment", dedupe: `plan_ended:${o.id}`, title: NOTICE.ended.title, body: NOTICE.ended.body });
  }
  // auto-renew turned off or on in Stripe's own portal: kept in step, so no renewal notice goes out after a cancel
  if (typeof o.cancel_at_period_end === "boolean" && status !== "canceled" && before.auto_renew === o.cancel_at_period_end) {
    await must(db.rpc("billing_auto_renew_apply", { p_ws: ws, p_on: !o.cancel_at_period_end, p_user: null }));
  }
  return true;
}

/** The workspace an invoice is for: its subscription's metadata (the basil shape, then the older one), its own
 *  metadata, else the workspace that holds its subscription. */
export async function invoiceWs(db: Db, inv: Obj): Promise<string | null> {
  const meta = inv.parent?.subscription_details?.metadata ?? inv.subscription_details?.metadata ?? {};
  const sub = inv.parent?.subscription_details?.subscription ?? inv.subscription;
  return (meta.workspace_id as string | undefined) ?? (inv.metadata?.workspace_id as string | undefined) ?? (typeof sub === "string" ? await db.wsOfSubscription(sub) : null);
}

/** invoice.payment_failed: the dunning notice, once per invoice. invoice.paid: the notice cleared. */
export async function applyInvoice(db: Db, inv: Obj, type: string, createdAt: string): Promise<void> {
  const ws = await invoiceWs(db, inv);
  if (!ws) return;   // a one-time invoice that isn't Placetta's (or a hand-made one): nothing to do
  const failed = type === "invoice.payment_failed";
  const outcome = inv.metadata?.kind === "license_outcome" && typeof inv.metadata?.charge_id === "string" ? inv.metadata.charge_id as string : null;
  // outcome pricing: a license charged on the agency's decision, paid now (Stripe's retry, or the owner's pay link)
  if (outcome && !failed) await must(db.rpc("license_outcome_paid", { p_id: outcome, p_invoice: String(inv.id ?? "") }));
  const changed = await must(db.rpc("billing_payment_apply", { p_ws: ws, p_failed: failed, p_at: createdAt, p_invoice: String(inv.id ?? "") }));
  if (failed && outcome) {
    // the same notice (and dedupe key) the sweep already gave the owner, so it shows once
    await log(db, ws, { en: "A payment didn't go through", zh: "一笔付款未成功" }, { en: `Invoice ${inv.number ?? inv.id}`, zh: `账单 ${inv.number ?? inv.id}` });
    await db.insert("updates", { workspace_id: ws, kind: "payment", dedupe: `payment_failed:${inv.id}`, title: NOTICE.licenseFailed.title, body: NOTICE.licenseFailed.body });
  } else if (failed) {
    await log(db, ws, { en: "A payment didn't go through", zh: "一笔付款未成功" }, { en: `Invoice ${inv.number ?? inv.id}`, zh: `账单 ${inv.number ?? inv.id}` });
    await db.insert("updates", { workspace_id: ws, kind: "payment", dedupe: `payment_failed:${inv.id}`, title: NOTICE.failed.title, body: NOTICE.failed.body });
  } else if (changed === true && !outcome) {
    await db.insert("updates", { workspace_id: ws, kind: "payment", dedupe: `payment_ok:${inv.id}`, title: NOTICE.paid.title, body: NOTICE.paid.body });
  }
}

/** charge.refunded, in full: a license charge not yet used is let go (its filing can't go in on it); one already used
 *  goes to the team; a pack's credit is taken back once. A partial refund is only recorded. */
export async function applyRefund(db: Db, ch: Obj, paymentIntentMeta: (id: string) => Promise<Obj | null>): Promise<void> {
  let meta: Obj = ch.metadata ?? {};
  if (!meta.kind && typeof ch.payment_intent === "string") meta = (await paymentIntentMeta(ch.payment_intent)) ?? {};
  const ws = meta.workspace_id as string | undefined;
  if (!ws) return;
  const full = ch.refunded === true || (Number(ch.amount_refunded) > 0 && Number(ch.amount_refunded) >= Number(ch.amount));
  const usd = (Number(ch.amount_refunded) || 0) / 100;
  await log(db, ws, { en: full ? "Refunded" : "Partly refunded", zh: full ? "已退款" : "已部分退款" }, { en: `$${usd.toFixed(2)}`, zh: `$${usd.toFixed(2)}` });
  if (!full) return;
  if (meta.kind === "license" && typeof meta.charge_id === "string") {
    const r = await must(db.rpc("license_charge_refund", { p_id: meta.charge_id, p_stripe: String(ch.id ?? "") }));
    if (r === "used") await db.insert("team_tasks", { kind: "billing", workspace_id: ws, title: "A filing was refunded after it went in: check with the owner", detail: { charge: ch.id, ref: meta.ref ?? null }, dedupe: `refund:${ch.id}` });
  }
  if (meta.kind === "pack") {
    const credit = Math.max(0, Math.min(1000, Number(meta.credit_usd) || 0));
    if (credit > 0) await must(db.rpc("ai_credit_once", { p_ws: ws, p_usd: -credit, p_key: `refund:${ch.id}` }));
  }
}
