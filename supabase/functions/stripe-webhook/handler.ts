// The Stripe webhook, free of the Supabase client so it can be tested with signed sample events (handler_test.ts).
// Signature checked by hand (Stripe's scheme: HMAC-SHA256 of "t.payload", five minutes' tolerance), each event applied
// once (stripe_event_claim: a duplicate is acknowledged; one whose handling crashed is claimed again after 5 minutes),
// and every failure answered with a 500 and logged, so Stripe retries and the log says why.
//   checkout.session.completed            a license charge paid, a pack's credit, the customer (stripe_apply.ts)
//   customer.subscription.created/updated/deleted
//                                         plan, status, period, stores paid for (Odelia's allowance), unless an event
//                                         created later was already applied (Stripe doesn't deliver in order)
//   invoice.payment_failed / invoice.paid the dunning notice, and clearing it
//   charge.refunded                       a license charge let go, a pack's credit taken back
//   checkout.session.async_payment_succeeded / _failed
//                                         a delayed method (a bank debit) cleared: fulfilled now; or failed: nothing
// With single-use cards on (STRIPE_ISSUING_ON=1, _shared/issuing.ts), and only then:
//   issuing_authorization.request         the real-time endpoint (set in Stripe's Issuing settings to this function):
//                                         approve only the card made for one authorized fee, within its limit, at an
//                                         allowed merchant category, before it lapses, while its authority is live;
//                                         answered at once, never claimed (Stripe gives 2 seconds, then its fallback)
//   issuing_authorization.created         an approved authorization: recorded on the purchase, and the card frozen
//   issuing_transaction.created           the fee settled: reconciled (the purchase paid, the unspent charge refunded,
//                                         the card closed, anything that doesn't match to the Placetta team)
import { applyCheckoutSession, applyInvoice, applyRefund, applySubscription, type Db, type Obj } from "../_shared/stripe_apply.ts";
import { approveAuthorization, issuingOn, STRIPE_VERSION, type CardPurchase } from "../_shared/issuing.ts";
import { verified } from "./logic.ts";

export type Deps = {
  db: Db & {
    claimEvent(id: string, type: string): Promise<"new" | "retry" | "duplicate">;
    doneEvent(id: string): Promise<void>;
    releaseEvent(id: string): Promise<void>;
  };
  env: (k: string) => string | undefined;
  secret: () => Promise<string | undefined>;
  /** a PaymentIntent's metadata (a refund names its PaymentIntent, not the Checkout that made it) */
  paymentIntentMeta: (id: string) => Promise<Obj | null>;
  /** Single-use cards: the purchase a card was made for (with whether its grant is still live), and marking it paid. */
  issuing?: {
    purchaseForCard(cardId: string): Promise<CardPurchase | null>;
    paid(cardId: string): Promise<void>;
    /** an approved authorization: record it on the purchase and freeze the card */
    authorized?(a: Obj): Promise<void>;
    /** a settled transaction: reconcile it (in place of paid when given) */
    settled?(t: Obj): Promise<void>;
  };
  now?: () => number;
};

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
/** Stripe's signature: t=<seconds>,v1=<hex HMAC-SHA256 of "t.raw">, as Stripe makes it (for tests and fixtures). The
 *  check is logic.ts verified: exactly one timestamp, five minutes' tolerance, any v1 may match (a secret being rolled). */
export async function sign(raw: string, secret: string, t: number): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${raw}`)));
}
export { verified };

export const HANDLED = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed", "charge.refunded",
  "issuing_authorization.created", "issuing_transaction.created"]);

export async function handle(req: Request, d: Deps): Promise<Response> {
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  const secret = await d.secret();
  if (!secret) { console.error("stripe-webhook: no signing secret (STRIPE_WEBHOOK_SECRET or stripe_config)"); return reply(503, { error: "Set STRIPE_WEBHOOK_SECRET." }); }
  const raw = await req.text();
  const nowS = Math.floor((d.now?.() ?? Date.now()) / 1000);
  // the real-time authorization endpoint may have its own signing secret (Stripe's Issuing settings)
  const rt = issuingOn(d.env) ? d.env("STRIPE_ISSUING_AUTH_SECRET") : undefined;
  if (!(await verified(raw, req.headers.get("stripe-signature") ?? "", secret, nowS)) && !(rt && (await verified(raw, req.headers.get("stripe-signature") ?? "", rt, nowS)))) return reply(400, { error: "Bad signature." });
  let event: { id: string; type: string; created?: number; data: { object: Obj } };
  try { event = JSON.parse(raw); } catch { return reply(400, { error: "Bad JSON." }); }
  if (typeof event?.id !== "string" || typeof event?.type !== "string" || !event.data?.object) return reply(400, { error: "Not a Stripe event." });
  if (event.type === "issuing_authorization.request") {
    // answered now: approve only what the owner's grant or approval covers; anything else, or cards off, is declined
    let approved = false;
    if (issuingOn(d.env) && d.issuing) {
      const a = event.data.object as { card?: { id?: string; metadata?: Record<string, string> }; pending_request?: { amount?: number }; amount?: number; merchant_data?: { category?: string } };
      try { const p = a.card?.id ? await d.issuing.purchaseForCard(a.card.id) : null; const r = approveAuthorization(a, p, d.now?.() ?? Date.now()); approved = r.approved; if (!approved) console.error("issuing: declined", r.why); }
      catch (e) { console.error("issuing: decision failed", (e as Error).message); approved = false; }
    }
    return new Response(JSON.stringify({ approved }), { status: 200, headers: { "Content-Type": "application/json", "Stripe-Version": STRIPE_VERSION } });
  }
  if (!HANDLED.has(event.type)) return reply(200, { received: true, ignored: true });
  if (event.type.startsWith("issuing_") && !(issuingOn(d.env) && d.issuing)) return reply(200, { received: true, ignored: true });

  let claim: "new" | "retry" | "duplicate";
  try { claim = await d.db.claimEvent(event.id, event.type); }
  catch (e) { console.error("stripe-webhook: claim", event.id, (e as Error).message); return reply(500, { error: "Try again." }); }
  if (claim === "duplicate") return reply(200, { received: true, duplicate: true });

  const createdAt = new Date((Number(event.created) || nowS) * 1000).toISOString();
  try {
    const o = event.data.object;
    if (event.type === "checkout.session.async_payment_failed") {
      // a delayed payment (a bank debit) that never cleared: nothing is fulfilled, and the owner can pay again
      const ws = o.metadata?.workspace_id;
      if (typeof ws === "string" && ws) await d.db.insert("audit_log", { workspace_id: ws, actor: "you", actor_id: null, action: { en: "A payment didn't go through", zh: "一笔付款未成功" }, object: { en: String(o.metadata?.ref ?? o.id ?? ""), zh: String(o.metadata?.ref ?? o.id ?? "") } });
    } else if (event.type.startsWith("checkout.session.")) await applyCheckoutSession(d.db, o, event.type);
    else if (event.type.startsWith("customer.subscription.")) await applySubscription(d.db, o, event.type, createdAt, d.env);
    else if (event.type.startsWith("invoice.")) await applyInvoice(d.db, o, event.type, createdAt);
    else if (event.type === "charge.refunded") await applyRefund(d.db, o, d.paymentIntentMeta);
    else if (event.type === "issuing_authorization.created") { if (o.approved === true) await d.issuing!.authorized?.(o); }
    else if (event.type === "issuing_transaction.created") {
      if (d.issuing!.settled) await d.issuing!.settled(o);
      else { const card = typeof o.card === "string" ? o.card : o.card?.id; if (typeof card === "string" && card) await d.issuing!.paid(card); }
    }
    await d.db.doneEvent(event.id);
  } catch (e) {
    // Let Stripe retry: forget the event so the retry is applied, and say loudly what failed.
    await d.db.releaseEvent(event.id).catch(() => undefined);
    console.error("stripe-webhook FAILED", event.type, event.id, (e as Error).message);
    return reply(500, { error: "Try again." });
  }
  return reply(200, { received: true });
}
