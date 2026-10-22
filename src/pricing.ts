/* The price list the growth mechanics read: the published prices, as the landing page (site/index.html) and the plans
   sheet (src/cloud/Plans.tsx) already show them; the owner prices the founder approved on 2026-10-22 (APPROVED,
   MODULE_PRICES); and the few numbers still waiting on the founder (PROPOSED). docs/PRICING.md has the whole list, the
   Stripe prices to create, and the margin estimates behind each one.

   APPROVED and MODULE_PRICES are for signed-in owners only. None of them is on the landing page and none may go there.
   The app shows each one to an owner before anything is charged, and nothing is charged without that owner's approval.
   Each is charged only from its own Stripe price (an env var named below); when that price is missing, or Stripe's
   amount differs from the one here, the team sends a quote instead and nothing is charged.

   No imports: the billing function (Deno) reads this file as it is. */

/** On the landing page today. Changing one of these changes a public price: don't, without the founder. */
export const PUBLISHED = {
  essentialsMonth: 149,      // a location a month, billed yearly
  proMonth: 299,             // a location a month, billed yearly
  openingRetail: 3500,
  openingFood: 6500,
  entryMarket: 299,          // one time, a market
  hqFromYear: 25000,         // headquarters plans from $25,000 a year
  packUsd: 49,               // an Odelia pack
  packCreditUsd: 25,         // what a pack adds to the allowance
  guarantee: 2500,           // open-by-date guarantee, a store
} as const;

/** Approved by the founder on 2026-10-22. Owners only, never on the landing page. */
export const APPROVED = {
  /** Filings outside a plan's own licenses and renewals that Odelia completes on her own (a sales tax return, a simple
   *  renewal by email, fax or an automated portal): this many included each month for every paid location. */
  includedAutomatedPerLocationMonth: 2,
  /** One automated filing past that allowance: one Odelia pack, at the published $49 pack price. */
  packsPerAutomatedFiling: 1,
  /** One filing that needs Placetta's team (a wet signature, mail, or a portal Odelia can't work on her own). No
   *  allowance covers it. Stripe price: STRIPE_PRICE_FILING_ASSISTED. */
  assistedFilingUsd: 199,
  /** Brand plan billed to headquarters: people on the franchisees' teams included per location, and the yearly price
   *  for each person past that (STRIPE_PRICE_HQ_PERSON). Headquarters' own people who only look at the dashboard are
   *  never counted (the landing page says headquarters pays nothing extra to see every store). */
  includedPeoplePerLocation: 3,
  personYearUsd: 240,
  /** Contract terms, billed yearly. A two or three year term takes this much off the per-location plan price, from its
   *  own Stripe price (STRIPE_PRICE_LOCATION_2Y and the rest, see TERM_PRICE_ENV). */
  terms: [1, 2, 3] as number[],
  termDiscountPct: { 1: 0, 2: 5, 3: 10 } as Record<number, number>,
} as const;

/** Not confirmed yet. */
export const PROPOSED = {
  /** FOUNDER TO CONFIRM. The monthly cap a new workspace starts with: $0, so nothing past the allowance is ever charged
   *  until an owner sets a cap. */
  defaultFilingCapUsd: 0,
  /** FOUNDER TO CONFIRM. The highest monthly cap an owner may set in the app; higher goes through the team. */
  maxFilingCapUsd: 5000,
  /** FOUNDER TO CONFIRM. The hours an owner would have spent, used only for the value report's labelled estimate. */
  hoursPerFiling: 3,
  hoursPerRenewal: 1,
  hoursPerEntityReport: 1,
} as const;

/* ------------------------------------------------------------------ modules, by unit */

/** What a module's price counts. */
export type ModuleUnit = "entity_state" | "state" | "licensed_location" | "company" | "country";
/** usd: the list price for one unit, per `per`. Monthly prices are billed yearly on the plan (12 months at once, the
 *  way the per-location plans are); one-time prices go on the next invoice. */
export type ModulePrice = { usd: number; unit: ModuleUnit; per: "month" | "year" | "once" };

/** Approved by the founder on 2026-10-22. Each is billed from STRIPE_PRICE_MODULE_<ID> (src/modules.ts). */
export const MODULE_PRICES: Record<string, ModulePrice> = {
  entity: { usd: 299, unit: "entity_state", per: "year" },        // a legal entity in each state it's registered in
  sales_tax: { usd: 49, unit: "state", per: "month" },            // each state where returns are filed
  alcohol: { usd: 79, unit: "licensed_location", per: "month" },  // each location holding a liquor license
  imports: { usd: 499, unit: "company", per: "month" },           // the importing company; its customs broker still files the entries
  abroad: { usd: 1500, unit: "country", per: "once" },            // each new country, plus the normal location prices; notary and government fees at cost
  security: { usd: 500, unit: "company", per: "month" },          // SSO, SCIM, audit export and roles
};

/** The amount of one unit of a module's Stripe price, in cents: a year of a monthly price, else the price itself. */
export const moduleStripeCents = (p: ModulePrice): number => Math.round(p.usd * 100) * (p.per === "month" ? 12 : 1);
/** The interval of a module's Stripe price: "year" for anything recurring, null for one time. */
export const moduleStripeInterval = (p: ModulePrice): "year" | null => (p.per === "once" ? null : "year");

/* ------------------------------------------------------------------ multi-year terms */

/** The Stripe price for each tier on a two or three year term, from its env var. A one-year term uses the plan's own
 *  price (supabase/functions/_shared/stripe_catalog.ts). */
export const TERM_PRICE_ENV: Record<"essentials" | "pro", Record<number, string>> = {
  essentials: { 2: "STRIPE_PRICE_LOCATION_2Y", 3: "STRIPE_PRICE_LOCATION_3Y" },
  pro: { 2: "STRIPE_PRICE_LOCATION_PRO_2Y", 3: "STRIPE_PRICE_LOCATION_PRO_3Y" },
};
/** A location's year on a term, in cents: the published monthly price × 12, less the term's discount, to the cent. */
export function termYearCents(tier: "essentials" | "pro", years: number): number {
  const month = tier === "pro" ? PUBLISHED.proMonth : PUBLISHED.essentialsMonth;
  return Math.round(month * 12 * 100 * (100 - (APPROVED.termDiscountPct[years] ?? 0)) / 100);
}

/** The other Stripe prices the approved list needs, by env var, with the amount Stripe must have, in cents. */
export const OWNER_PRICE_ENV = {
  filingAssisted: { env: "STRIPE_PRICE_FILING_ASSISTED", cents: APPROVED.assistedFilingUsd * 100, interval: null },
  hqPerson: { env: "STRIPE_PRICE_HQ_PERSON", cents: APPROVED.personYearUsd * 100, interval: "year" },
} as const;

/** Whether a Stripe price is exactly the one this list expects: amount, currency and interval. A price that differs
 *  by a cent is never charged; the team quotes instead. */
export function stripePriceMatches(p: { unit_amount?: number | null; currency?: string | null; recurring?: { interval?: string | null; interval_count?: number | null } | null; active?: boolean } | null | undefined,
  want: { cents: number; interval: "year" | null }): boolean {
  if (!p || p.active === false || p.unit_amount !== want.cents || String(p.currency ?? "").toLowerCase() !== "usd") return false;
  if (want.interval === null) return !p.recurring;
  return p.recurring?.interval === want.interval && (p.recurring?.interval_count ?? 1) === 1;
}

/* ================================================================== the simple model (approved 2026-10-22)

   The model every new workspace sees: one price per license, filed; a fixed list of complex licenses at a higher
   price; renewals at one price after a one-tap approval; tracking free; a chain plan for 10 or more stores; government
   fees passed through at cost. docs/PRICING.md has the Stripe prices to create and the margin math,
   docs/PRICING-RESEARCH.md the research each number was checked against, docs/SALES-PLAYBOOK.md how the team quotes.

   Grandfathering: a workspace that was already a customer when this model shipped (billing.price_model = 'legacy', set
   once by migration 20261023120000_simple_pricing) keeps its plan and everything above. Every other workspace is on
   this model ('simple'). Nothing below changes a legacy workspace's price. */

/** The simple list. Public: the landing page shows these. Changing one changes a public price: don't, without the founder. */
export const SIMPLE = {
  licenseUsd: 299,          // any license, permit or registration, filed and tracked to approval
  complexUsd: 999,          // a license on COMPLEX_LIST
  renewalUsd: 99,           // a renewal of a license already approved, after the owner's one-tap approval
  trackingUsd: 0,           // tracking, rule-change alerts and the plan preview: free
  chainStoreMonthUsd: 149,  // the chain plan: a store a month, billed yearly, every license and renewal included
  chainMinStores: 10,
} as const;

/** A chain plan store's year, the amount its Stripe price must have: $149 × 12. */
export const CHAIN_STORE_YEAR_USD = SIMPLE.chainStoreMonthUsd * 12;

export type ComplexId = "liquor" | "plan_review" | "import";
/** The complex list, fixed: a license is complex only when its name matches one of these. Nothing else costs $999. */
export const COMPLEX_LIST: { id: ComplexId; name: { en: string; zh: string }; match: RegExp; not?: RegExp }[] = [
  { id: "liquor", name: { en: "Liquor licenses", zh: "酒类执照" },
    match: /\b(liquor|alcoholic beverage|beer and wine|wine and beer)\b|sell alcohol|酒类|酒牌|售酒/i, not: /dealer registration|server (training|permit|card)|responsible beverage/i },
  { id: "plan_review", name: { en: "Building plan review", zh: "建筑图纸审查" },
    match: /plan (check|review)|building permit|tenant improvement|build-?out permit|DOB alteration|图纸审查|建筑许可|装修许可/i },
  { id: "import", name: { en: "Import permits", zh: "进口许可" },
    match: /\bimport (permit|licen[cs]e)|permit to import|importer (registration|license|number)|进口许可|进口执照/i },
];

/** Never charged: an inspection that is part of a permit already paid for, and a certificate staff earn themselves
 *  (a course and an exam). Placetta tracks them for free. */
export const NOT_CHARGED = /\b(final|pre-?opening|routine) inspection\b|\binspection$|food handler (cards?|certificates?)|food (protection )?manager|food protection certificate|食品经理|食品处理员/i;

export type LicenseTier = "license" | "complex" | "renewal" | "free";
/** The complex item a name matches, or null. */
export const complexOf = (name: string) => COMPLEX_LIST.find(c => c.match.test(name) && !(c.not && c.not.test(name))) ?? null;
/** What one filing costs on the simple model, from its name and whether that license was approved before (a renewal). */
export function licenseTierOf(name: string, renewal = false): LicenseTier {
  if (NOT_CHARGED.test(name)) return "free";
  if (renewal) return "renewal";
  return complexOf(name) ? "complex" : "license";
}
export const tierUsd = (t: LicenseTier): number => (t === "complex" ? SIMPLE.complexUsd : t === "renewal" ? SIMPLE.renewalUsd : t === "free" ? 0 : SIMPLE.licenseUsd);

/** The Stripe price for each simple item, by env var. The code never makes these: until the founder creates one and
 *  sets its env var (at exactly this amount), the team sends a quote for that item and nothing is charged. */
export const SIMPLE_PRICE_ENV = {
  license: { env: "STRIPE_PRICE_LICENSE", cents: SIMPLE.licenseUsd * 100, interval: null },
  complex: { env: "STRIPE_PRICE_LICENSE_COMPLEX", cents: SIMPLE.complexUsd * 100, interval: null },
  renewal: { env: "STRIPE_PRICE_RENEWAL", cents: SIMPLE.renewalUsd * 100, interval: null },
  chain: { env: "STRIPE_PRICE_CHAIN_STORE", cents: CHAIN_STORE_YEAR_USD * 100, interval: "year" },
} as const;
export type SimpleItem = keyof typeof SIMPLE_PRICE_ENV;

/** Which model a workspace is on: 'legacy' only when the migration found it was already a customer. */
export type PriceModel = "legacy" | "simple";
export const priceModelOf = (b: { price_model?: string | null } | null | undefined): PriceModel => (b?.price_model === "legacy" ? "legacy" : "simple");

/** The typical restaurant opening the landing page and the sales playbook quote: Placetta's own registry plan for a
 *  restaurant in San José (src/plan/preview.ts), counting only what Placetta files. The two staff certificates and the
 *  final inspection are tracked free (NOT_CHARGED); the food facility plan check and the tenant improvement building
 *  permit are building plan review (complex). */
export const TYPICAL_OPENING = {
  where: { en: "a restaurant in San José, CA", zh: "加州圣何塞的一家餐厅" },
  licenses: 9,   // LLC, statement of information, EIN, seller's permit, business tax certificate, employer registration, fire permit, health permit, sign permit
  complex: 2,    // food facility plan check, building permit for the tenant improvement
} as const;
export const typicalOpeningUsd = (): number => TYPICAL_OPENING.licenses * SIMPLE.licenseUsd + TYPICAL_OPENING.complex * SIMPLE.complexUsd;
/** PermitPlace's 2026 range for a restaurant or food service opening: expediter fees only, before municipal fees. */
export const EXPEDITER_RESTAURANT_USD = { low: 2000, high: 7500, source: "https://permitplace.com/permit-expediter-cost-guide/" } as const;

/** A simple-model charge as the owner sees it before approving: what, how much, and the government fee passed through. */
export type LicenseQuote = {
  tier: LicenseTier | "chain";
  cents: number;
  /** false: Stripe doesn't have the approved price yet, so the team sends a quote and nothing is charged */
  priceOk: boolean;
  /** already paid for this filing, so approving files it without charging again */
  paid?: boolean;
  line: { en: string; zh: string };
};
const usd0 = (n: number) => "$" + n.toLocaleString("en-US");
/** The words for a quote, shown before approval. govFee: the agency's own fee, passed through at cost, when known. */
export function licenseQuoteLine(tier: LicenseQuote["tier"], priceOk: boolean, paid = false, govFee?: string | null): { en: string; zh: string } {
  const gov = govFee ? { en: ` The agency's own fee (${govFee}) is passed through at cost, paid to the agency.`, zh: `机构规费（${govFee}）按实际金额代付，直接付给机构。` }
    : { en: " Any agency fee is passed through at cost, paid to the agency.", zh: "如有机构规费，按实际金额代付，直接付给机构。" };
  if (tier === "chain") return { en: "Included in your chain plan." + gov.en, zh: "已包含在连锁方案中。" + gov.zh };
  if (tier === "free") return { en: "Free: Placetta tracks it and your team completes it.", zh: "免费：快哉负责跟踪，由您的团队完成。" };
  const usd = tierUsd(tier);
  if (paid) return { en: `Paid: ${usd0(usd)}. Approve and it's filed.` + gov.en, zh: `已付款：${usd} 美元。批准后即提交。` + gov.zh };
  const what = tier === "complex" ? { en: `${usd0(usd)}, a complex license (liquor, building plan review or an import permit), filed and tracked to approval.`, zh: `${usd} 美元，复杂执照（酒类、建筑图纸审查或进口许可），提交并跟踪至获批。` }
    : tier === "renewal" ? { en: `${usd0(usd)} for this renewal, charged only after you approve it.`, zh: `本次续期 ${usd} 美元，经您批准后才收费。` }
    : { en: `${usd0(usd)} for this license, filed and tracked to approval.`, zh: `本项执照 ${usd} 美元，提交并跟踪至获批。` };
  if (!priceOk) return { en: `${what.en} Online payment isn't set up for it yet, so the team sends a quote. Nothing is charged.`, zh: `${what.zh}该项暂不能在线支付，团队会向您报价，不会收取任何费用。` };
  return { en: what.en + gov.en, zh: what.zh + gov.zh };
}

/** Odelia's own knowledge of Placetta's prices, for her instructions: the simple list, the same numbers as above. */
export function priceFacts(model: PriceModel = "simple"): string {
  const s = SIMPLE;
  return model === "legacy"
    ? "This workspace is on a plan it bought before October 2026 and keeps it unchanged; for its price, point the person to Settings, Billing. New customers pay per license."
    : `Placetta's prices (new customers): any license, permit or registration filed and tracked to approval $${s.licenseUsd}; complex licenses $${s.complexUsd}, only for ${COMPLEX_LIST.map(c => c.name.en.toLowerCase()).join(", ")}; a renewal $${s.renewalUsd}, charged only after the owner's one-tap approval; tracking, rule-change alerts and the plan preview free; ${s.chainMinStores} or more stores: $${s.chainStoreMonthUsd} a store a month billed yearly, every license and renewal included; government fees passed through at cost, never marked up. Every charge is shown to an owner before approval and nothing is charged without it. No discounts. Never quote any other number.`;
}
