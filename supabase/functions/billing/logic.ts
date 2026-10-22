// Billing's decisions, kept free of I/O so they can be tested: where Stripe may send the person back to, what the
// stores billing reads from the database add up to, and the growth actions (filings past the allowance, modules, the
// brand plan, the contract term), decided with the same files the app uses.
import { allowanceOf, approvalMatches, FILING_KINDS, IN_PLAN, quoteFiling, type FilingKind, type Month } from "../../../src/overage.ts";
import { moduleById } from "../../../src/modules.ts";
import { hqQuote, type BillTo } from "../../../src/hqPlan.ts";
import { validTerm } from "../../../src/contract.ts";

/** The origins Stripe may send someone back to: the app's own (APP_ORIGINS), its Vercel address (which keeps working
    when a custom domain isn't connected), and, only when DEV_ORIGINS lists them, development origins such as
    http://localhost:5173. A localhost return address is refused unless DEV_ORIGINS names it. */
export function returnOrigins(get: (k: string) => string | undefined): string[] {
  const list = (k: string) => (get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...list("APP_ORIGINS"), "https://placetta.com", "https://www.placetta.com", "https://placetta.vercel.app", ...list("DEV_ORIGINS")].flatMap((o) => {
    try {
      const u = new URL(o);
      return u.protocol === "https:" || u.protocol === "http:" ? [u.origin] : [];
    } catch {
      return [];
    }
  });
}

/** The return address without its query or fragment, when it is on an allowed origin; else null. */
export function safeReturn(url: unknown, origins: string[]): string | null {
  if (typeof url !== "string" || !url || url.length > 2000) return null;
  try {
    const u = new URL(url);
    return origins.includes(u.origin) ? `${u.origin}${u.pathname}` : null;
  } catch {
    return null;
  }
}

export type Kind = "retail" | "food" | "complex";
export type Store = { id: string; name: string; opening: boolean; kind: Kind };

/** Rows of store_billing (kept by a database trigger that members can't get around) as billing's stores. */
export function storesFrom(rows: { store_id: unknown; name?: unknown; kind: unknown; opening: unknown }[]): Store[] {
  return rows.filter((r) => typeof r.store_id === "string").slice(0, 2000).map((r) => ({
    id: r.store_id as string,
    name: typeof r.name === "string" && r.name ? r.name : (r.store_id as string),
    opening: r.opening === true,
    kind: (r.kind === "food" || r.kind === "complex" ? r.kind : "retail") as Kind,
  }));
}

/** How many of each opening fee a list of stores owes: one per store still opening, by kind. Complex ones are quoted. */
export function openingCounts(list: Pick<Store, "opening" | "kind">[]): { retail: number; food: number } {
  const n = (k: Kind) => list.filter((s) => s.opening && s.kind === k).length;
  return { retail: n("retail"), food: n("food") };
}

/* ------------------------------ the growth actions' decisions ------------------------------ */

/** A filing past the plan, as the owner approved it: what to do, decided from this month's numbers and the price the
 *  owner was shown. Never charges on its own: "reserve" asks the database to hold it under the cap first, and a price
 *  that differs from the one shown, by a cent, is refused. */
export type ChargeStep =
  | { do: "none" }
  | { do: "reserve"; kind: Exclude<FilingKind, "license" | "renewal">; cents: number; packs: number; allow: number; charge: boolean }
  | { do: "refuse"; status: number; code: string; message: string; message_zh: string };
export function chargeStep(body: { kind?: unknown; ref?: unknown; shown_cents?: unknown }, m: Month): ChargeStep {
  const kind = body.kind as FilingKind;
  if (!FILING_KINDS.includes(kind) || typeof body.ref !== "string" || !body.ref || body.ref.length > 120) return { do: "refuse", status: 400, code: "bad_request", message: "Name the filing and its kind.", message_zh: "请说明申报及其类型。" };
  if (IN_PLAN.includes(kind)) return { do: "none" };
  const q = quoteFiling(kind, m);
  const k = kind as Exclude<FilingKind, "license" | "renewal">;
  if (q.kind === "allowance") return body.shown_cents === 0 ? { do: "reserve", kind: k, cents: 0, packs: 0, allow: allowanceOf(m.locations), charge: false } : changed(q.line);
  if (q.kind === "charge") return approvalMatches(q, body.shown_cents) ? { do: "reserve", kind: k, cents: q.cents, packs: q.packs, allow: allowanceOf(m.locations), charge: true } : changed(q.line);
  if (q.kind === "blocked") return { do: "refuse", status: 409, code: q.reason, message: q.line.en, message_zh: q.line.zh };
  return { do: "none" };
}
const changed = (line: { en: string; zh: string }): ChargeStep => ({ do: "refuse", status: 409, code: "price_changed", message: `The price changed since it was shown. ${line.en}`, message_zh: `价格已与显示时不同。${line.zh}` });

/** A module to add, and how: billed from its own Stripe price when one is set and a yearly plan is running, else quoted. */
export function moduleStep(id: unknown, priceSet: boolean, subscribed: boolean): { ok: false; message: string } | { ok: true; id: string; billed: boolean } {
  const m = moduleById(id);
  if (!m) return { ok: false, message: "Unknown module." };
  return { ok: true, id: m.id, billed: priceSet && subscribed };
}

/** The headquarters checkout: only when headquarters pays and at least one location joined. */
export function hqCheckout(x: { billTo: BillTo; tier: "essentials" | "pro"; locations: number; people: number }) {
  const q = hqQuote(x);
  return { quote: q, ok: x.billTo === "hq" && q.locations > 0 };
}

/** The term a checkout may carry: 1, 2 or 3 years, else 1. */
export const termOf = (y: unknown) => validTerm(typeof y === "string" ? Number(y) : y) ?? 1;

/** What the person sees when Stripe refuses a request. Stripe's own message stays in the server log. */
export const STRIPE_FAILED = {
  en: "The payment service couldn't do that just now. Try again in a minute, or email support@placetta.com.",
  zh: "支付服务暂时无法完成该操作。请稍后再试，或发邮件至 support@placetta.com。",
};
