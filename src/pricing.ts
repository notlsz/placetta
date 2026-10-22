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
