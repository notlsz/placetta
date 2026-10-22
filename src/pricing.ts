/* The price list the growth mechanics read: the published prices, as the landing page (site/index.html) and the plans
   sheet (src/cloud/Plans.tsx) already show them, and the proposed ones the founder still has to confirm.

   FOUNDER TO CONFIRM: every number under PROPOSED. None of them is on the landing page and none may go there until it
   is confirmed. The app only shows them to a signed-in owner, always before anything is charged, and nothing is
   charged without that owner's approval.

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

/** FOUNDER TO CONFIRM: proposed, not published. */
export const PROPOSED = {
  /** FOUNDER TO CONFIRM. Filings outside a plan's own licenses and renewals (a sales tax return, an annual report, an
   *  amendment) included each month for every paid location, before any is charged. */
  extraFilingsPerLocationMonth: 2,
  /** FOUNDER TO CONFIRM. What one filing past that allowance costs, in Odelia packs (the existing $49 pack price, so no
   *  new Stripe price is needed). */
  packsPerExtraFiling: 1,
  /** FOUNDER TO CONFIRM. The monthly cap a new workspace starts with: $0, so nothing past the allowance is ever charged
   *  until an owner sets a cap. */
  defaultFilingCapUsd: 0,
  /** FOUNDER TO CONFIRM. The highest monthly cap an owner may set in the app; higher goes through the team. */
  maxFilingCapUsd: 5000,
  /** FOUNDER TO CONFIRM. Brand plan billed to headquarters: people on the franchisees' teams included per location, and
   *  the yearly price for each person past that. Headquarters' own people who only look at the dashboard are never
   *  counted (the landing page says headquarters pays nothing extra to see every store). */
  includedPeoplePerLocation: 3,
  personYearUsd: 240,
  /** FOUNDER TO CONFIRM. Contract terms offered: one, two or three years, billed yearly at the published price. No
   *  multi-year discount until one is confirmed. */
  terms: [1, 2, 3] as number[],
  multiYearDiscountPct: 0,
  /** FOUNDER TO CONFIRM. The hours an owner would have spent, used only for the value report's labelled estimate. */
  hoursPerFiling: 3,
  hoursPerRenewal: 1,
  hoursPerEntityReport: 1,
} as const;

/** A module's yearly price per location. FOUNDER TO CONFIRM: all null, so every module is quoted by the team and no
 *  module price is published anywhere. Setting STRIPE_PRICE_MODULE_<ID> on the billing function bills it directly. */
export const MODULE_PRICES: Record<string, number | null> = {
  entity: null, sales_tax: null, alcohol: null, imports: null, abroad: null, security: null,
};
