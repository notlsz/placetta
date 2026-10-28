// Zero-touch agency fees under Autopilot, with Stripe Issuing single-use virtual cards. Ported from the parked spend-wip
// branch onto the current spend function, behind STRIPE_ISSUING=on (and app_settings.issuing_on in the database): off
// until Stripe approves Placetta for Issuing and the founder switches it on (SETUP.md "Stripe Issuing").
//
// One card per agency fee, made only when the database says the fee fits the owner's Autopilot grant
// (autopilot_spend_ok: live, this workspace's, within the per-filing and monthly caps):
//   1. the workspace's card on file is charged the exact amount (off-session, idempotent per purchase),
//   2. a virtual card is issued for that amount, all-time limit = the amount, government merchant categories only,
//      metadata naming the purchase, the workspace and when it lapses (7 days),
//   3. the real-time authorization (issuing_authorization.request, Stripe waits 2 seconds) approves only that card, for
//      at most that amount, before it lapses, while the purchase is approved and unpaid, and the grant is still live,
//   4. issuing_transaction.created marks the purchase paid and closes the card; a canceled purchase closes the card and
//      refunds the charge.
// The card's number goes only to the portal worker that types it on the agency's own checkout, never to the model, a
// log or the app (https://docs.stripe.com/issuing/cards/virtual: retrieve with expand[]=number,cvc, live virtual cards
// only; Placetta's own cards for its own use carry no PCI service-provider duty there). Pure functions here; the
// spend function and the webhook do the I/O.

import { ISSUING_EVENTS, issuingOn, VERSION } from "./stripe_catalog.ts";
export { ISSUING_EVENTS, issuingOn };
export const STRIPE_VERSION = VERSION;
/** Government services (MCC 9399) and tax payments (9311): where an agency's fee is charged. */
export const GOV_CATEGORIES = ["government_services", "tax_payments"];
export const CARD_DAYS = 7;

/** The parameters for the single-use card (POST /v1/issuing/cards). */
export function cardParams(o: { holder: string; cents: number; purchase: string; workspace: string; now: number }): Record<string, string> {
  const p: Record<string, string> = {
    cardholder: o.holder, currency: "usd", type: "virtual", status: "active",
    "spending_controls[spending_limits][0][amount]": String(o.cents), "spending_controls[spending_limits][0][interval]": "all_time",
    "spending_controls[spending_limits][1][amount]": String(o.cents), "spending_controls[spending_limits][1][interval]": "per_authorization",
    "metadata[purchase_id]": o.purchase, "metadata[workspace_id]": o.workspace, "metadata[expires]": new Date(o.now + CARD_DAYS * 864e5).toISOString(),
  };
  GOV_CATEGORIES.forEach((c, i) => (p[`spending_controls[allowed_categories][${i}]`] = c));
  return p;
}

export type CardPurchase = { id: string; workspace_id: string; status: string; method: string | null; card_id: string | null; amount_cents: number; grant_live: boolean };
/** The real-time decision for one authorization request: approve only the card made for this purchase, within its
 *  amount, before it lapses, while the purchase waits to be paid and the owner's grant is live. Anything else: no. */
export function approveAuthorization(a: { card?: { id?: string; metadata?: Record<string, string> }; pending_request?: { amount?: number }; amount?: number }, p: CardPurchase | null, now: number): { approved: boolean; why: string } {
  if (!p) return { approved: false, why: "no purchase for this card" };
  if (p.status !== "approved" || p.method !== "card") return { approved: false, why: `purchase is ${p.status}` };
  if (!a.card?.id || p.card_id !== a.card.id) return { approved: false, why: "not the card made for this purchase" };
  if (a.card.metadata?.workspace_id && a.card.metadata.workspace_id !== p.workspace_id) return { approved: false, why: "another workspace's card" };
  const amount = Number(a.pending_request?.amount ?? a.amount ?? 0);
  if (!(amount > 0) || amount > p.amount_cents) return { approved: false, why: `amount ${amount} over ${p.amount_cents}` };
  const exp = Date.parse(a.card.metadata?.expires ?? "");
  if (exp && now >= exp) return { approved: false, why: "card lapsed" };
  if (!p.grant_live) return { approved: false, why: "Autopilot was turned off or expired" };
  return { approved: true, why: "ok" };
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
