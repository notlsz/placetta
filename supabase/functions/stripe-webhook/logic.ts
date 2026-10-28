// The webhook's decisions, free of I/O so they can be tested (logic_test.ts): is the signature Stripe's, and what a
// checkout event may fulfil. index.ts does the writes.

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Stripe's signature (HMAC-SHA256 of "t.body" with the endpoint's secret), within 5 minutes of its timestamp. */
export async function verified(raw: string, header: string, secret: string, nowSec = Date.now() / 1000): Promise<boolean> {
  if (!secret || !header) return false;
  const parts = header.split(",").map((kv) => kv.trim());
  const ts = parts.filter((p) => p.startsWith("t=")).map((p) => p.slice(2));
  // exactly one timestamp, all digits
  if (ts.length !== 1 || !/^\d{1,12}$/.test(ts[0])) return false;
  const t = Number(ts[0]);
  if (!t || Math.abs(nowSec - t) > 300) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${ts[0]}.${raw}`)));
  return parts.filter((p) => p.startsWith("v1=")).some((p) => same(p.slice(3), sig));
}

/** What a checkout event fulfils. A checkout is fulfilled once its money is in: "completed" when it's paid then, else
 *  "async_payment_succeeded" when a delayed method (a bank debit) clears. "completed" while unpaid fulfils nothing
 *  paid for (it may still record the customer); "async_payment_failed" fulfils nothing. Each event id is applied once
 *  (stripe_events), and completed and async_payment_succeeded can't both fulfil one session: the first is unpaid
 *  whenever the second comes. */
export type CheckoutEffect = { ws: string | null; paid: boolean; markets: number; license: string | null; packUsd: number; locations: boolean; termYears: number | null; entryCredited: boolean };
export function checkoutEffect(type: string, o: Record<string, any>): CheckoutEffect | null {
  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") return null;
  const ws = typeof o.metadata?.workspace_id === "string" && o.metadata.workspace_id ? o.metadata.workspace_id as string : null;
  const paid = o.payment_status === "paid" || o.payment_status === "no_payment_required";
  const pay = o.mode === "payment" && paid;
  const locations = type === "checkout.session.completed" && o.mode === "subscription" && o.metadata?.plan === "locations";
  return {
    ws, paid,
    markets: pay && o.metadata?.plan === "entry" ? Math.max(1, Math.min(20, Number(o.metadata?.markets) || 1)) : 0,
    license: pay && o.metadata?.kind === "license" && typeof o.metadata?.charge_id === "string" ? o.metadata.charge_id as string : null,
    packUsd: pay && o.metadata?.kind === "pack" ? Math.max(0, Math.min(1000, Number(o.metadata?.credit_usd) || 0)) : 0,
    locations,
    termYears: locations && o.metadata?.term_years ? Math.max(1, Math.min(3, Number(o.metadata.term_years) || 1)) : null,
    entryCredited: locations && Number(o.metadata?.entry_credit) > 0,
  };
}
