// Outcome pricing, the Stripe side (migration 20261105091200_outcome_pricing, src/pricing.ts, docs/PRICING.md). The
// founder's decision of 2026-10-28, after Sierra and Decagon (pay per resolution), as he corrected it the same day: a
// new license ($149, or $999 for a complex one) is charged when the agency decides it.
//   approved, with the agency's confirmation or the license        charged
//   rejected through Placetta's fault                               not charged; anything paid is refunded
//   rejected, not Placetta's fault (zoning, ineligible by law,      charged, when the team marks the reason
//   the owner's wrong or incomplete information, owner withdrew)
// The database decides when a charge is due (the filings trigger); this file collects it, off session, and undoes one.
//
// Never twice: each charge has one row and one invoice. The invoice is made first, with the charge id in its
// idempotency key, and saved on the charge (license_outcome_invoice) before anything is added to it; a retry reads it
// back instead of making another, and every later call carries the charge id in its key too. An approval and a
// rejection of the same filing share that one charge, so they can never both charge.
// Authentication required (SCA): the owner gets Stripe's hosted pay link. A refused card: the existing dunning
// (billing_payment_apply and the owner's notice), and Stripe's own retries; invoice.paid settles it (stripe_apply.ts).
// Placetta never sees a card number: the card is saved and charged by Stripe.

// deno-lint-ignore no-explicit-any
export type Obj = Record<string, any>;
export type StripeError = Error & { status?: number; code?: string; decline_code?: string };
export type Stripe = {
  get(path: string): Promise<Obj>;
  post(path: string, params: Record<string, string>, idem?: string): Promise<Obj>;
  del?(path: string): Promise<Obj>;
};
type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
export type Claimed = {
  id: string; workspace_id: string; ref: string; tier: "license" | "complex"; cents: number; job: "charge" | "undo";
  collect: "upfront" | "on_approval"; stripe_ref: string | null; payment_method: string | null; fault: "placetta" | "not_placetta" | null;
  outcome: "approved" | "rejected" | null; attempts: number; filing_id: string | null; customer: string | null; title: { en?: string; zh?: string } | null;
};
export type Notice = "charged" | "action" | "failed" | "refunded";
export type Deps = {
  stripe: Stripe;
  rpc: Rpc;
  /** the approved Stripe price for the tier, or null (then the team quotes and nothing is charged) */
  priceId: (tier: Claimed["tier"]) => Promise<string | null>;
  /** tell the owner (an update in the app and, for a pay link, an email); and the dunning for a refused card */
  notify: (c: Claimed, kind: Notice, url?: string | null) => Promise<void>;
  /** a team task, once per key */
  team: (c: Claimed, title: string, key: string) => Promise<void>;
};

/** A raw Stripe client whose errors keep Stripe's code (authentication_required, card_declined). */
export function stripeRaw(key: () => string, version: string, f: typeof fetch = fetch): Stripe {
  const call = async (method: string, path: string, body?: URLSearchParams, idem?: string) => {
    const r = await f(`https://api.stripe.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${key()}`, "Stripe-Version": version,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...(idem ? { "Idempotency-Key": idem } : {}) }, body });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(String(d?.error?.message ?? "Stripe error").slice(0, 200)), { status: r.status, code: d?.error?.code, decline_code: d?.error?.decline_code }) as StripeError;
    return d as Obj;
  };
  return { get: (p) => call("GET", p), post: (p, params, idem) => call("POST", p, new URLSearchParams(params), idem), del: (p) => call("DELETE", p) };
}

/** Stripe's words for "the bank wants the owner to confirm" (SCA). */
export const needsAuth = (e: unknown) => {
  const c = String((e as StripeError)?.code ?? ""), d = String((e as StripeError)?.decline_code ?? "");
  return c === "authentication_required" || c === "invoice_payment_intent_requires_action" || d === "authentication_required";
};
/** A refusal the owner fixes (a card problem), as opposed to Placetta's or Stripe's own trouble, which is retried. */
export const cardRefused = (e: unknown) => (e as StripeError)?.status === 402 || /^card_|^expired_card$|^incorrect_|^insufficient_funds$/.test(String((e as StripeError)?.code ?? ""));

const must = async (p: ReturnType<Rpc>) => { const r = await p; if (r.error) throw new Error(`${r.error.code ?? ""} ${r.error.message}`.trim()); return r.data; };
const result = (d: Deps, c: Claimed, res: string, stripe?: string | null, url?: string | null, err?: string | null) =>
  must(d.rpc("license_outcome_result", { p_id: c.id, p_result: res, p_stripe: stripe ?? null, p_url: url ?? null, p_error: err ?? null })) as Promise<string>;
const name = (c: Claimed) => String(c.title?.en ?? c.ref).slice(0, 120);

/** The invoice's payment intent: the basil shape (invoice_payments), then the older invoice.payment_intent. */
async function paymentIntentOfInvoice(s: Stripe, inv: Obj): Promise<string | null> {
  if (typeof inv.payment_intent === "string") return inv.payment_intent;
  const list = await s.get(`invoice_payments?invoice=${encodeURIComponent(String(inv.id))}&limit=1`).catch(() => null);
  const pi = list?.data?.[0]?.payment?.payment_intent;
  return typeof pi === "string" ? pi : (pi?.id ?? null);
}

/** Charge one due charge, off session, once. Returns what the charge became. */
export async function collect(d: Deps, c: Claimed): Promise<string> {
  if (!c.customer || !c.payment_method) {
    await d.team(c, `Charge on approval: no saved card for ${name(c)}`, `outcome_nocard:${c.id}`);
    return await result(d, c, "failed", c.stripe_ref, null, "no saved card");
  }
  const price = await d.priceId(c.tier);
  if (!price) {
    // the approved price is missing or differs in Stripe: nothing is charged, the team fixes it, the sweep tries again
    await d.team(c, `Charge on approval: the ${c.tier} price isn't set up in Stripe for ${name(c)}`, `outcome_price:${c.tier}`);
    return await result(d, c, "retry", null, null, "price missing");
  }
  const meta = { "metadata[workspace_id]": c.workspace_id, "metadata[kind]": "license_outcome", "metadata[charge_id]": c.id, "metadata[ref]": c.ref, "metadata[tier]": c.tier, "metadata[outcome]": c.outcome ?? "approved" };
  const s = d.stripe;
  try {
    let inv: Obj;
    if (c.stripe_ref?.startsWith("in_")) inv = await s.get(`invoices/${encodeURIComponent(c.stripe_ref)}`);
    else {
      inv = await s.post("invoices", { customer: c.customer, collection_method: "charge_automatically", auto_advance: "false", pending_invoice_items_behavior: "exclude",
        default_payment_method: c.payment_method, description: `${c.outcome === "rejected" ? "License, rejected not through Placetta's fault" : "License, approved"}: ${name(c)}`.slice(0, 200), ...meta }, `outcome-inv-${c.id}`);
      await must(d.rpc("license_outcome_invoice", { p_id: c.id, p_invoice: String(inv.id) }));
    }
    if (inv.status === "paid") return await settled(d, c, inv);
    if (inv.status === "void" || inv.status === "uncollectible") {
      await d.team(c, `Charge on approval: its invoice ${inv.id} was ${inv.status} in Stripe for ${name(c)}`, `outcome_void:${c.id}`);
      return await result(d, c, "failed", inv.id, null, `invoice ${inv.status}`);
    }
    if (inv.status === "draft") {
      const lines = Number(inv.lines?.total_count ?? inv.lines?.data?.length ?? 0);
      if (!lines) await s.post("invoiceitems", { customer: c.customer, invoice: String(inv.id), "pricing[price]": price, quantity: "1", ...meta }, `outcome-item-${c.id}`);
      inv = await s.post(`invoices/${inv.id}/finalize`, { auto_advance: "false" }, `outcome-fin-${c.id}`);
      if (Number(inv.amount_due) !== c.cents) {
        // never charge an amount other than the one the owner approved
        await s.post(`invoices/${inv.id}/void`, {}, `outcome-void-${c.id}`).catch(() => undefined);
        await d.team(c, `Charge on approval: Stripe's invoice was ${inv.amount_due} cents, not ${c.cents}, for ${name(c)}`, `outcome_amount:${c.id}`);
        return await result(d, c, "failed", inv.id, null, "amount differs");
      }
    }
    try {
      inv = await s.post(`invoices/${inv.id}/pay`, { off_session: "true", payment_method: c.payment_method }, `outcome-pay-${c.id}`);
    } catch (e) {
      const open = await s.get(`invoices/${encodeURIComponent(String(inv.id))}`).catch(() => inv);
      if (open?.status === "paid") return await settled(d, c, open);
      const url = typeof open?.hosted_invoice_url === "string" ? open.hosted_invoice_url : null;
      if (needsAuth(e)) {
        const st = await result(d, c, "action", String(inv.id), url, "authentication_required");
        await d.notify(c, "action", url);
        return st;
      }
      if (cardRefused(e)) {
        // Stripe's smart retries and its emails from here; our dunning notice now; invoice.paid settles it
        await s.post(`invoices/${inv.id}`, { auto_advance: "true" }, `outcome-retry-${c.id}`).catch(() => undefined);
        const st = await result(d, c, "failed", String(inv.id), url, String((e as StripeError).code ?? "card_declined"));
        await d.notify(c, "failed", url);
        return st;
      }
      throw e;
    }
    if (inv.status === "paid") return await settled(d, c, inv);
    return await result(d, c, "retry", String(inv.id), null, `invoice ${inv.status}`);
  } catch (e) {
    // Stripe or the network: the sweep tries again, with the same keys and the saved invoice
    console.error("outcome collect:", c.id, (e as Error).message.slice(0, 200));
    return await result(d, c, "retry", null, null, (e as Error).message.slice(0, 200));
  }
}

async function settled(d: Deps, c: Claimed, inv: Obj): Promise<string> {
  const st = await result(d, c, "paid", String(inv.id));
  if (st === "used") await d.notify(c, "charged");
  return st;
}

/** Undo one charge: refund what was paid for it, or void an invoice not paid yet. Agency fees are never touched. */
export async function undo(d: Deps, c: Claimed): Promise<string> {
  const s = d.stripe;
  try {
    let pi: string | null = null;
    if (c.stripe_ref?.startsWith("in_")) {
      const inv = await s.get(`invoices/${encodeURIComponent(c.stripe_ref)}`);
      if (inv.status === "open") { await s.post(`invoices/${inv.id}/void`, {}, `outcome-void-${c.id}`); return await result(d, c, "undone"); }
      if (inv.status === "draft") { if (s.del) await s.del(`invoices/${inv.id}`); return await result(d, c, "undone"); }
      if (inv.status !== "paid") return await result(d, c, "undone");
      pi = await paymentIntentOfInvoice(s, inv);
    } else if (c.stripe_ref?.startsWith("cs_")) {
      const cs = await s.get(`checkout/sessions/${encodeURIComponent(c.stripe_ref)}`);
      pi = typeof cs.payment_intent === "string" ? cs.payment_intent : (cs.payment_intent?.id ?? null);
    } else if (c.stripe_ref?.startsWith("pi_")) pi = c.stripe_ref;
    if (!pi) {
      if (!c.stripe_ref) return await result(d, c, "undone");
      await d.team(c, `Refund by hand: no payment found for ${name(c)} (${c.stripe_ref})`, `outcome_refund:${c.id}`);
      return await result(d, c, "retry", null, null, "no payment to refund");
    }
    await s.post("refunds", { payment_intent: pi, amount: String(c.cents), reason: "requested_by_customer", "metadata[workspace_id]": c.workspace_id, "metadata[kind]": "license_outcome_refund", "metadata[charge_id]": c.id }, `outcome-refund-${c.id}`);
    const st = await result(d, c, "refunded", pi);
    if (st === "refunded") await d.notify(c, "refunded");
    return st;
  } catch (e) {
    console.error("outcome undo:", c.id, (e as Error).message.slice(0, 200));
    return await result(d, c, "retry", null, null, (e as Error).message.slice(0, 200));
  }
}

/** One sweep: claim what's due and work each. Returns what each charge became. */
export async function sweep(d: Deps, limit = 20): Promise<Record<string, string>> {
  const claimed = (await must(d.rpc("license_outcome_claim", { p_limit: limit }))) as Claimed[] | null;
  const out: Record<string, string> = {};
  for (const c of claimed ?? []) {
    try { out[c.id] = c.job === "undo" ? await undo(d, c) : await collect(d, c); }
    catch (e) { console.error("outcome sweep:", c.id, (e as Error).message.slice(0, 200)); out[c.id] = "error"; }
  }
  return out;
}

/** What the owner hears, in English and Chinese. No dashes, and the reason in plain words. */
export const OUTCOME_NOTICE: Record<Notice, { title: { en: string; zh: string }; body: (c: Claimed, money: string) => { en: string; zh: string } }> = {
  charged: {
    title: { en: "License charge", zh: "执照费用" },
    body: (c, m) => c.outcome === "rejected"
      ? { en: `${m} for ${name(c)}. The agency turned it down for a reason that wasn't a mistake on our side; you can see the reason and dispute it on the filing.`, zh: `${name(c)}：${m}。机构未批准，原因并非我们的失误；您可以在该申报中查看原因并提出异议。` }
      : { en: `${m} for ${name(c)}, now that the agency approved it.`, zh: `${name(c)} 已获机构批准，收取 ${m}。` },
  },
  action: {
    title: { en: "Confirm a payment with your bank", zh: "请向银行确认一笔付款" },
    body: (c, m) => ({ en: `Your bank asked you to confirm ${m} for ${name(c)}. Open the payment link to confirm it with Stripe.`, zh: `您的银行要求您确认 ${name(c)} 的 ${m} 付款。请打开付款链接，在 Stripe 上确认。` }),
  },
  failed: {
    title: { en: "A payment didn't go through", zh: "一笔付款未成功" },
    body: (c, m) => ({ en: `Stripe couldn't charge your card ${m} for ${name(c)} and will try again over the next few days. Update your card in Settings, Billing, Manage billing, or pay with the link.`, zh: `Stripe 未能从您的银行卡扣取 ${name(c)} 的 ${m}，接下来几天会自动重试。请在“设置 > 账单 > 管理账单”中更新银行卡，或使用付款链接支付。` }),
  },
  refunded: {
    title: { en: "Refunded", zh: "已退款" },
    body: (c, m) => ({ en: `${m} for ${name(c)} is refunded to your card: it was turned down because of a mistake on our side. Agency fees follow the agency's own rules.`, zh: `${name(c)} 的 ${m} 已退回您的银行卡：该申报因我们的失误被退回。机构规费按机构自身规定处理。` }),
  },
};
