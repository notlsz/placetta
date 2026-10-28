// Zero-touch agency fees, with Stripe Issuing single-use virtual cards (Stripe's "Issuing for agents": browser checkout
// with a single-use card, https://docs.stripe.com/issuing/agents). Off until Stripe approves Placetta for Issuing and the
// founder switches it on: STRIPE_ISSUING_ON=1 here and on the portal worker, and app_settings.issuing_on in the database
// (SETUP.md "Stripe Issuing"). With it off, every fee goes to a person exactly as before.
//
// One card per filing, made at the last moment (the portal worker is on the agency's payment page), and only when the
// filing has fee authority: the owner's live Autopilot grant (autopilot_spend_ok: within the per-filing and monthly
// caps) or an owner's explicit approval of this fee (an approved purchase for the filing).
//   1. The limit is the registry's fee plus a small margin for a card surcharge (marginOf: 3%, at least $2, at most
//      $25), never above the Autopilot per-filing cap or the amount the owner approved. A page asking for more is
//      refused before any card is made.
//   2. Funding: the business's card on file is charged the limit first (off-session, idempotent per purchase). The card
//      itself draws on Placetta's Issuing balance, which the founder keeps funded (a top-up from the bank, or a transfer
//      from the Stripe payments balance the charges land in). The unspent part of the charge is refunded once the
//      agency's charge settles (reconcile).
//   3. The card: virtual, single-use (lifecycle_controls cancel_after payment_count 1), an all-time and a per-
//      authorization limit of the limit, government merchant categories only (or the destination's own list), and
//      metadata naming the purchase, the filing, the workspace and when it lapses (24 hours: Stripe sets a virtual
//      card's printed expiry itself, so the lapse is enforced by the real-time decision and the sweep that cancels it).
//   4. issuing_authorization.request (Stripe waits 2 seconds) approves only that card, within its limit, at an allowed
//      merchant category, before it lapses, while the purchase waits and its authority is live.
//   5. issuing_authorization.created freezes the card (inactive; Stripe still settles what it approved).
//      issuing_transaction.created reconciles: the purchase is paid, the unspent charge refunded, the card closed, and
//      anything that doesn't match (over the authorization, the worker's receipt amount, a merchant outside the list)
//      goes to the Placetta team.
// The card's number goes only to the portal worker, at the moment it types it on the agency's own checkout, never to the
// model, a log, a trace, a recording or the app (worker/filer/src/card.ts). Pure functions here; the spend function and
// the webhook do the I/O.

import { ISSUING_EVENTS, issuingOn, VERSION } from "./stripe_catalog.ts";
export { ISSUING_EVENTS, issuingOn };
export const STRIPE_VERSION = VERSION;
/** Government services (MCC 9399), tax payments (9311), court costs (9211) and fines (9222): where an agency's fee is
 *  charged. A destination may name its own (its payment processor's) list instead. */
export const GOV_CATEGORIES = ["government_services", "tax_payments", "court_costs", "fines"];
/** How long a single-use card may be used after it's made. */
export const CARD_HOURS = 24;

/** The margin over the registry's fee a card may spend: an agency's card surcharge (usually 2% to 3%, often with a
 *  dollar or two on top). 3%, at least $2, at most $25. */
export const marginOf = (feeCents: number) => Math.min(2500, Math.max(200, Math.ceil(feeCents * 0.03)));

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/** What a card may spend for one filing: the registry's fee plus the margin, never above the cap (the Autopilot
 *  per-filing cap, or the amount an owner approved). With no fee in the registry: under Autopilot, the amount the
 *  agency's page shows; under an approval, the approved amount. A page asking for more than the limit is refused before
 *  any card is made. */
export function cardLimit(o: { feeCents: number | null; capCents: number; pageCents?: number | null; kind: "autopilot" | "approval" }):
  { ok: true; limitCents: number; baseCents: number } | { ok: false; why: string } {
  const cap = Math.floor(o.capCents);
  if (!(cap > 0)) return { ok: false, why: "there is no cap to hold the fee to" };
  const page = o.pageCents && o.pageCents > 0 ? Math.round(o.pageCents) : null;
  const base = o.feeCents && o.feeCents > 0 ? Math.round(o.feeCents) : o.kind === "autopilot" ? page : cap;
  if (!base) return { ok: false, why: "the fee isn't known" };
  if (base > cap) return { ok: false, why: `the fee (${usd(base)}) is over the ${usd(cap)} cap` };
  const limit = Math.min(base + marginOf(base), cap);
  if (page && page > limit) return { ok: false, why: `the agency asks ${usd(page)}, more than the ${usd(limit)} Placetta may pay for it` };
  return { ok: true, limitCents: limit, baseCents: base };
}

export type Authority = { kind: "autopilot"; grant: string; capCents: number } | { kind: "approval"; purchase: string; capCents: number };
/** The filing's fee authority, or null: a live Autopilot grant behind the filing, else an owner's approval of this
 *  filing's fee (a purchase for it, approved by every owner it needed, not yet paid or used). */
export function feeAuthority(o: {
  grant: { id: string; live: boolean; capPerFiling: number } | null;
  approved: { id: string; status: string; amount_cents: number; approvals: unknown[]; approvers_needed: number; authorization_id?: string | null } | null;
}): Authority | null {
  if (o.grant?.live && o.grant.capPerFiling > 0) return { kind: "autopilot", grant: o.grant.id, capCents: Math.round(o.grant.capPerFiling * 100) };
  const a = o.approved;
  if (a && a.status === "approved" && !a.authorization_id && a.approvals.length >= Math.max(1, a.approvers_needed) && a.amount_cents > 0) {
    return { kind: "approval", purchase: a.id, capCents: a.amount_cents };
  }
  return null;
}

/** The parameters for the single-use card (POST /v1/issuing/cards). */
export function cardParams(o: { holder: string; cents: number; purchase: string; workspace: string; now: number; filing?: string | null; categories?: string[] }): Record<string, string> {
  const cats = o.categories?.length ? o.categories : GOV_CATEGORIES;
  const p: Record<string, string> = {
    cardholder: o.holder, currency: "usd", type: "virtual", status: "active",
    "lifecycle_controls[cancel_after][payment_count]": "1",
    "spending_controls[spending_limits][0][amount]": String(o.cents), "spending_controls[spending_limits][0][interval]": "all_time",
    "spending_controls[spending_limits][1][amount]": String(o.cents), "spending_controls[spending_limits][1][interval]": "per_authorization",
    "metadata[purchase_id]": o.purchase, "metadata[workspace_id]": o.workspace, "metadata[expires]": new Date(o.now + CARD_HOURS * 3600e3).toISOString(),
    "metadata[categories]": cats.join(","),
    ...(o.filing ? { "metadata[filing_id]": o.filing } : {}),
  };
  cats.forEach((c, i) => (p[`spending_controls[allowed_categories][${i}]`] = c));
  return p;
}

/** What the portal worker gets for the card it types: the card's own lines and its cardholder's billing details
 *  (agencies check the billing ZIP), nothing else. */
export type FilerCard = {
  purchase_id: string; limit_cents: number; number: string; cvc: string; exp_month: number; exp_year: number; name: string;
  address: { line1: string; city: string; state: string; postal_code: string; country: string };
};
export function filerCard(purchase: { id: string; amount_cents: number }, c: {
  number?: string; cvc?: string; exp_month?: number; exp_year?: number; status?: string;
  cardholder?: { name?: string; billing?: { address?: Record<string, string | null | undefined> } } | string;
}): FilerCard | null {
  if (c.status !== "active" || typeof c.number !== "string" || !/^\d{12,19}$/.test(c.number) || typeof c.cvc !== "string" || !/^\d{3,4}$/.test(c.cvc) || !c.exp_month || !c.exp_year) return null;
  const holder = typeof c.cardholder === "object" ? c.cardholder : undefined;
  const a = holder?.billing?.address ?? {};
  return {
    purchase_id: purchase.id, limit_cents: purchase.amount_cents, number: c.number, cvc: c.cvc, exp_month: c.exp_month, exp_year: c.exp_year,
    name: String(holder?.name ?? "").slice(0, 80),
    address: { line1: String(a.line1 ?? ""), city: String(a.city ?? ""), state: String(a.state ?? ""), postal_code: String(a.postal_code ?? ""), country: String(a.country ?? "US") },
  };
}

export type CardPurchase = { id: string; workspace_id: string; status: string; method: string | null; card_id: string | null; amount_cents: number; grant_live: boolean };
type Auth = { card?: { id?: string; metadata?: Record<string, string> }; pending_request?: { amount?: number }; amount?: number; merchant_data?: { category?: string } };
/** The real-time decision for one authorization request: approve only the card made for this purchase, within its
 *  limit, at a merchant category the card allows, before it lapses, while the purchase waits to be paid and its
 *  authority (the owner's grant, or the owner's approval) is live. Anything else: no. */
export function approveAuthorization(a: Auth, p: CardPurchase | null, now: number): { approved: boolean; why: string } {
  if (!p) return { approved: false, why: "no purchase for this card" };
  if (p.status !== "approved" || p.method !== "card") return { approved: false, why: `purchase is ${p.status}` };
  if (!a.card?.id || p.card_id !== a.card.id) return { approved: false, why: "not the card made for this purchase" };
  if (a.card.metadata?.workspace_id && a.card.metadata.workspace_id !== p.workspace_id) return { approved: false, why: "another workspace's card" };
  const amount = Number(a.pending_request?.amount ?? a.amount ?? 0);
  if (!(amount > 0) || amount > p.amount_cents) return { approved: false, why: `amount ${amount} over ${p.amount_cents}` };
  const cats = (a.card.metadata?.categories || GOV_CATEGORIES.join(",")).split(",");
  if (a.merchant_data?.category && !cats.includes(a.merchant_data.category)) return { approved: false, why: `merchant category ${a.merchant_data.category}` };
  const exp = Date.parse(a.card.metadata?.expires ?? "");
  if (exp && now >= exp) return { approved: false, why: "card lapsed" };
  if (!p.grant_live) return { approved: false, why: "the authority behind it was turned off or expired" };
  return { approved: true, why: "ok" };
}

/** A settled charge against what was approved, charged and seen: how much of the business's charge to refund, and what
 *  the Placetta team should look at. Amounts in cents; settled is what the agency took (positive). */
export function reconcile(o: { chargedCents: number; refundedCents?: number; limitCents: number; authorizedCents: number | null; settledCents: number; receiptCents: number | null;
  category?: string | null; categories?: string[] }): { refundCents: number; flags: string[] } {
  const flags: string[] = [];
  if (o.settledCents > o.limitCents) flags.push(`settled ${usd(o.settledCents)}, over the card's ${usd(o.limitCents)} limit`);
  if (o.authorizedCents !== null && o.settledCents > o.authorizedCents) flags.push(`settled ${usd(o.settledCents)}, more than the ${usd(o.authorizedCents)} authorized`);
  if (o.receiptCents !== null && Math.abs(o.receiptCents - o.settledCents) > 100) flags.push(`the agency's receipt says ${usd(o.receiptCents)}, the card settled ${usd(o.settledCents)}`);
  const cats = o.categories?.length ? o.categories : GOV_CATEGORIES;
  if (o.category && !cats.includes(o.category)) flags.push(`charged by a merchant in ${o.category}`);
  const refund = Math.max(0, o.chargedCents - (o.refundedCents ?? 0) - Math.max(0, o.settledCents));
  return { refundCents: refund, flags };
}

/** The email that forwards an agency bill to the business's accounts-payable address when no card pays it. */
export function apForward(o: { to: string; business: string; payee: string; cents: number; filing: string; link?: string }): { to: string; subject: string; text: string } {
  const amt = `$${(o.cents / 100).toLocaleString("en-US", { minimumFractionDigits: o.cents % 100 ? 2 : 0 })}`;
  return {
    to: o.to,
    subject: `Agency bill for ${o.business}: ${amt} to ${o.payee}`.slice(0, 200),
    text: [`${o.payee} billed ${o.business} ${amt} for ${o.filing}.`, o.link ? `Pay it on the agency's own page: ${o.link}` : "The bill is attached in Placetta, under Documents.",
      "Placetta forwarded it because the owner asked for agency bills to come to this address. Placetta never asks for card or bank details by email."].join("\n\n"),
  };
}
