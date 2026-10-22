// Billing's decisions, kept free of I/O so they can be tested: where Stripe may send the person back to, what the
// stores billing reads from the database add up to, and the growth actions (filings past the allowance, modules, the
// brand plan, the contract term), decided with the same files the app uses.
import { allowanceOf, approvalMatches, filingKindOf, filingModeOf, IN_PLAN, quoteFiling, type FilingKind, type FilingMode, type Month, type Quote } from "../../../src/overage.ts";
import { moduleById, moduleFactsOf, moduleQuantity, moduleQuote, type ModuleId, type ModuleQuote } from "../../../src/modules.ts";
import { hqQuote, type BillTo } from "../../../src/hqPlan.ts";
import { validTerm } from "../../../src/contract.ts";
import { licenseQuoteLine, licenseTierOf, MODULE_PRICES, moduleStripeCents, moduleStripeInterval, OWNER_PRICE_ENV, SIMPLE, SIMPLE_PRICE_ENV, stripePriceMatches, TERM_PRICE_ENV, termYearCents, tierUsd,
  type LicenseQuote, type LicenseTier, type SimpleItem } from "../../../src/pricing.ts";
import { DEST } from "../file/destinations.ts";

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

/** A filing in the workspace, as billing prices it: its kind from its own name (src/overage.ts filingKindOf), and who
 *  does the work from its verified destination (automated or assisted). Null when the workspace has no such filing. */
export type FilingFacts = { kind: FilingKind; mode: FilingMode };
export function filingFactsOf(apps: unknown, ref: unknown, dest: Record<string, Parameters<typeof filingModeOf>[0]> = DEST): FilingFacts | null {
  if (typeof ref !== "string" || !ref || ref.length > 120 || !Array.isArray(apps)) return null;
  const a = apps.find((x) => x && typeof x === "object" && (x as { id?: unknown }).id === ref) as { id: string; name?: { en: string }; official?: unknown } | undefined;
  if (!a) return null;
  return { kind: filingKindOf(a), mode: filingModeOf(typeof a.official === "string" ? dest[a.official] : undefined) };
}

/** A filing past the plan, as the owner approved it: what to do, decided from this month's numbers and the price and
 *  kind of work the owner was shown. Never charges on its own: "reserve" asks the database to hold it under the cap
 *  first, and a price that differs from the one shown, by a cent, or a different kind of work, is refused. "quote":
 *  an assisted filing without its Stripe price, so the team quotes it and nothing is filed or charged. */
export type ChargeStep =
  | { do: "none" }
  | { do: "reserve"; kind: Exclude<FilingKind, "license" | "renewal">; mode: FilingMode; cents: number; packs: number; allow: number; charge: boolean }
  | { do: "quote"; message: string; message_zh: string }
  | { do: "refuse"; status: number; code: string; message: string; message_zh: string };
export function chargeStep(body: { ref?: unknown; shown_cents?: unknown; mode?: unknown }, f: FilingFacts | null, m: Month): ChargeStep {
  if (typeof body.ref !== "string" || !body.ref || body.ref.length > 120) return { do: "refuse", status: 400, code: "bad_request", message: "Name the filing.", message_zh: "请说明是哪份申报。" };
  if (!f) return { do: "refuse", status: 404, code: "not_found", message: "That filing isn't in this workspace. Nothing was charged.", message_zh: "此工作区中没有这份申报，未收取任何费用。" };
  if (IN_PLAN.includes(f.kind)) return { do: "none" };
  const q = quoteFiling(f.kind, m, f.mode);
  const k = f.kind as Exclude<FilingKind, "license" | "renewal">;
  if (q.kind === "allowance") return body.shown_cents === 0 && body.mode === q.mode ? { do: "reserve", kind: k, mode: q.mode, cents: 0, packs: 0, allow: allowanceOf(m.locations), charge: false } : changed(q.line);
  if (q.kind === "charge") return approvalMatches(q, body.shown_cents, body.mode) ? { do: "reserve", kind: k, mode: q.mode, cents: q.cents, packs: q.packs, allow: allowanceOf(m.locations), charge: true } : changed(q.line);
  if (q.kind === "quoted") return body.mode === q.mode ? { do: "quote", message: q.line.en, message_zh: q.line.zh } : changed(q.line);
  if (q.kind === "blocked") return { do: "refuse", status: 409, code: q.reason, message: q.line.en, message_zh: q.line.zh };
  return { do: "none" };
}
const changed = (line: { en: string; zh: string }): ChargeStep => ({ do: "refuse", status: 409, code: "price_changed", message: `The price changed since it was shown. ${line.en}`, message_zh: `价格已与显示时不同。${line.zh}` });
/** The quote the app shows in a filing's card: the same one chargeStep checks. */
export function filingQuote(f: FilingFacts | null, m: Month): Quote | null {
  return f ? quoteFiling(f.kind, m, f.mode) : null;
}

/* ------------------------------ modules, by unit ------------------------------ */

/** The module asked for, or null. */
export const moduleOf = (id: unknown): ModuleId | null => moduleById(id)?.id ?? null;

/** Stripe's line items on a previewed invoice that are prorations, added up in cents (both the basil shape,
 *  parent.subscription_item_details.proration, and the older line.proration). What a mid-term change charges now. */
export function prorationCents(inv: { lines?: { data?: unknown[] } } | null | undefined): number {
  return (inv?.lines?.data ?? []).reduce<number>((sum, l) => {
    const line = l as { amount?: number; proration?: boolean; parent?: { subscription_item_details?: { proration?: boolean } | null } | null };
    return line.proration === true || line.parent?.subscription_item_details?.proration === true ? sum + (Number(line.amount) || 0) : sum;
  }, 0);
}

/** What a module would bill from the workspace's saved state: the units, and for abroad the countries not charged yet. */
export function moduleUnits(id: ModuleId, state: { stores?: unknown; entities?: unknown } | null, chargedCountries: string[]) {
  const facts = moduleFactsOf(state as Parameters<typeof moduleFactsOf>[0]);
  return { qty: moduleQuantity(id, facts, chargedCountries), countries: id === "abroad" ? facts.countries.filter((c) => !chargedCountries.includes(c)) : [] };
}

/** Whether a module's Stripe price is the approved one (amount, currency, interval), so it may be charged. */
export const modulePriceOk = (id: ModuleId, p: Parameters<typeof stripePriceMatches>[0]) =>
  stripePriceMatches(p, { cents: moduleStripeCents(MODULE_PRICES[id]), interval: moduleStripeInterval(MODULE_PRICES[id]) });

/** How long a module quote stays good: Stripe prorates to the second the owner saw, so an old one is quoted again. */
export const QUOTE_TTL_S = 30 * 60;
/** The server's check on a module approval: same units, same cents, and a quote still fresh. */
export function moduleApproval(q: ModuleQuote, shown: { qty?: unknown; cents?: unknown; at?: unknown }, nowS: number): { ok: true } | { ok: false; code: string; message: string; message_zh: string } {
  if (typeof shown.at !== "number" || nowS - shown.at > QUOTE_TTL_S || shown.at > nowS + 60) return { ok: false, code: "quote_expired", message: "That price was shown a while ago. Look at it again before approving. Nothing was charged.", message_zh: "该价格显示已久，请重新查看后再批准。未收取任何费用。" };
  if (!q.billed || shown.qty !== q.qty || shown.cents !== q.dueNowCents) return { ok: false, code: "price_changed", message: `The price changed since it was shown. ${q.line.en} Nothing was charged.`, message_zh: `价格已与显示时不同。${q.line.zh}未收取任何费用。` };
  return { ok: true };
}
export { moduleQuote };

/* ------------------------------ the owner prices' Stripe prices ------------------------------ */

/** The Stripe price for a location on a term: the plan's own for one year, else the term's env var. */
export const termPriceEnv = (tier: "essentials" | "pro", years: number): string | null => (years > 1 ? TERM_PRICE_ENV[tier][years] ?? null : null);
/** Whether a term's Stripe price is the approved one: the published year less the term's discount, yearly. */
export const termPriceOk = (tier: "essentials" | "pro", years: number, p: Parameters<typeof stripePriceMatches>[0]) =>
  stripePriceMatches(p, { cents: termYearCents(tier, years), interval: "year" });
/** Whether the assisted filing or the headquarters person price in Stripe is the approved one. */
export const ownerPriceOk = (k: keyof typeof OWNER_PRICE_ENV, p: Parameters<typeof stripePriceMatches>[0]) =>
  stripePriceMatches(p, { cents: OWNER_PRICE_ENV[k].cents, interval: OWNER_PRICE_ENV[k].interval });

/** The headquarters checkout: only when headquarters pays and at least one location joined. */
export function hqCheckout(x: { billTo: BillTo; tier: "essentials" | "pro"; locations: number; people: number }) {
  const q = hqQuote(x);
  return { quote: q, ok: x.billTo === "hq" && q.locations > 0 };
}

/** The term a checkout may carry: 1, 2 or 3 years, else 1. */
export const termOf = (y: unknown) => validTerm(typeof y === "string" ? Number(y) : y) ?? 1;

/* ------------------------------ the simple model: per license ------------------------------ */

/** A filing as the simple model prices it: its name, and the agency's own fee (passed through at cost) when the plan
 *  has it. Null when the workspace has no such filing. */
export type LicenseFacts = { name: string; govFeeUsd: number | null };
export function licenseFactsOf(apps: unknown, ref: unknown): LicenseFacts | null {
  if (typeof ref !== "string" || !ref || ref.length > 120 || !Array.isArray(apps)) return null;
  const a = apps.find((x) => x && typeof x === "object" && (x as { id?: unknown }).id === ref) as { name?: { en?: unknown }; fees?: unknown } | undefined;
  if (!a || typeof a.name?.en !== "string" || !a.name.en) return null;
  const fees = Array.isArray(a.fees) ? a.fees.map((f) => Number((f as { amount?: unknown })?.amount)).filter((n) => Number.isFinite(n) && n >= 0) : [];
  return { name: a.name.en.slice(0, 200), govFeeUsd: fees.length ? fees.reduce((s, n) => s + n, 0) : null };
}

/** The quote an owner sees before approving a filing on the simple model: everything included with 10 or more stores
 *  on the plan (the chain plan); a renewal Odelia files on her own included in the store plan; free for what staff
 *  complete themselves; else $299, $999 or a $99 renewal, from its own Stripe price only. */
export function simpleQuote(f: LicenseFacts, x: { renewal: boolean; paid: { tier: string; cents: number } | null; chain: boolean; onPlan: boolean; automated: boolean; priceOk: (item: SimpleItem) => boolean }): LicenseQuote {
  const gov = f.govFeeUsd ? "$" + f.govFeeUsd.toLocaleString("en-US", { maximumFractionDigits: 2 }) : null;
  if (x.chain) return { tier: "chain", cents: 0, priceOk: true, line: licenseQuoteLine("chain", true, false, gov) };
  const tier = licenseTierOf(f.name, x.renewal);
  if (tier === "renewal" && x.onPlan && x.automated && !x.paid) return { tier: "plan", cents: 0, priceOk: true, line: licenseQuoteLine("plan", true, false, gov) };
  if (x.paid) {
    const t = (["license", "complex", "renewal", "free"].includes(x.paid.tier) ? x.paid.tier : tier) as LicenseTier;
    return { tier: t, cents: x.paid.cents, priceOk: true, paid: true, line: licenseQuoteLine(t, true, true, gov) };
  }
  const cents = tierUsd(tier) * 100;
  const ok = tier === "free" || x.priceOk(tier as SimpleItem);
  return { tier, cents, priceOk: ok, line: licenseQuoteLine(tier, ok, false, gov) };
}

/** The server's check on an approval: the same kind and the same cents the owner was shown, worked out again now. */
export function simpleApproval(q: LicenseQuote, shown: { tier?: unknown; cents?: unknown }): { ok: true } | { ok: false; code: string; message: string; message_zh: string } {
  if (shown.tier !== q.tier || shown.cents !== q.cents) return { ok: false, code: "price_changed", message: `The price changed since it was shown. ${q.line.en} Nothing was charged.`, message_zh: `价格已与显示时不同。${q.line.zh}未收取任何费用。` };
  return { ok: true };
}

/** The store plan: every store in the workspace (at least one), billed yearly. */
export const planQuantity = (stores: number): number => Math.min(Math.max(1, Math.floor(stores) || 0), 2000);
/** 10 or more stores paid for on the plan: every new license is included too (the chain plan). */
export const isChain = (paidLocations: number): boolean => paidLocations >= SIMPLE.chainMinStores;

/** Whether a simple-model Stripe price is exactly the approved one. */
export const simplePriceOk = (item: SimpleItem, p: Parameters<typeof stripePriceMatches>[0]) =>
  stripePriceMatches(p, { cents: SIMPLE_PRICE_ENV[item].cents, interval: SIMPLE_PRICE_ENV[item].interval });

/** What the person sees when Stripe refuses a request. Stripe's own message stays in the server log. */
export const STRIPE_FAILED = {
  en: "The payment service couldn't do that just now. Try again in a minute, or email support@placetta.com.",
  zh: "支付服务暂时无法完成该操作。请稍后再试，或发邮件至 support@placetta.com。",
};
