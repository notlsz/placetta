// deno test supabase/functions/billing/simple_test.ts
// The simple model: the price a filing is shown before approval, the server's check on the approval, the complex list,
// what's never charged, the chain plan's minimum, and the exact Stripe prices it may charge from.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { isChain, licenseFactsOf, planQuantity, simpleApproval, simplePriceOk, simpleQuote } from "./logic.ts";
import { complexOf, licenseTierOf, SIMPLE, SIMPLE_PRICE_ENV, typicalOpeningUsd } from "../../../src/pricing.ts";

const all = () => true, none = () => false;
const facts = (name: string, fee: number | null = null) => ({ name, govFeeUsd: fee });

Deno.test("the founder's numbers", () => {
  assertEquals([SIMPLE.planStoreMonthUsd, SIMPLE.licenseUsd, SIMPLE.complexUsd, SIMPLE.renewalUsd, SIMPLE.previewUsd, SIMPLE.chainMinStores], [149, 299, 999, 99, 0, 10]);
  assertEquals(SIMPLE_PRICE_ENV.plan.cents, 178800);
  assertEquals(typicalOpeningUsd(), 9 * 299 + 2 * 999);
});

Deno.test("the complex list is fixed: liquor, building plan review, import permits", () => {
  for (const n of ["Alcoholic beverage license", "Conditional use permit to sell alcohol", "Food facility plan check", "Building permit for a tenant improvement", "Building permit for the build-out (DOB alteration)", "Food establishment plan review", "USDA import permit"]) assertEquals(licenseTierOf(n), "complex", n);
  for (const n of ["Seller's permit", "Health permit to operate a food facility", "Sign permit", "City of San José Business Tax Certificate", "Alcohol dealer registration", "Application for Employer Identification Number (EIN)"]) assertEquals(licenseTierOf(n), "license", n);
  assertEquals(complexOf("Alcoholic beverage license")?.id, "liquor");
});

Deno.test("what staff complete and inspections inside a permit are never charged", () => {
  for (const n of ["Food handler cards for staff", "Certified food protection manager", "Building final inspection", "Food Protection Certificate (course and exam)"]) assertEquals(licenseTierOf(n), "free", n);
  // found by the liquor-license journey: New York's community board notice is a step of the liquor license ($999 once),
  // not a second complex license; France's hygiene training and the EU's hygiene rules have nothing to file
  for (const n of ["Community board notice for the liquor license", "Food hygiene training (the operator and at least one staff member)", "EU food hygiene rules (Regulation (EC) 852/2004)"]) assertEquals(licenseTierOf(n), "free", n);
  assertEquals(licenseTierOf("Restaurant wine license (beer and wine)"), "complex");
});

Deno.test("a quote: $299, $999, a $99 renewal, included on the plan, or a team quote without its Stripe price", () => {
  const base = { renewal: false, paid: null, chain: false, onPlan: false, automated: false, priceOk: all };
  assertEquals(simpleQuote(facts("Sign permit", 445), base).cents, 29900);
  assert(simpleQuote(facts("Sign permit", 445), base).line.en.includes("($445) is passed through at cost"));
  assertEquals(simpleQuote(facts("Alcoholic beverage license"), base).cents, 99900);
  assertEquals(simpleQuote(facts("Sign permit"), { ...base, renewal: true }).tier, "renewal");
  assertEquals(simpleQuote(facts("Sign permit"), { ...base, renewal: true }).cents, 9900);
  const chain = simpleQuote(facts("Sign permit"), { ...base, chain: true, onPlan: true });
  assertEquals([chain.tier, chain.cents], ["chain", 0]);
  // the store plan: a renewal Odelia files on her own is included; one that needs the team is $99; a new license is $299
  assertEquals(simpleQuote(facts("Sign permit"), { ...base, onPlan: true, automated: true, renewal: true }).tier, "plan");
  assertEquals(simpleQuote(facts("Sign permit"), { ...base, onPlan: true, automated: true, renewal: true }).cents, 0);
  assertEquals(simpleQuote(facts("Sign permit"), { ...base, onPlan: true, automated: false, renewal: true }).cents, 9900);
  assertEquals(simpleQuote(facts("Sign permit"), { ...base, onPlan: false, automated: true, renewal: true }).cents, 9900);
  assertEquals(simpleQuote(facts("Sign permit"), { ...base, onPlan: true, automated: true }).cents, 29900);
  const q = simpleQuote(facts("Sign permit"), { ...base, priceOk: none });
  assert(!q.priceOk && q.line.en.includes("the team sends a quote") && q.line.en.includes("Nothing is charged"));
  const free = simpleQuote(facts("Food handler cards for staff"), { ...base, priceOk: none });
  assert(free.priceOk && free.cents === 0);
  const paid = simpleQuote(facts("Sign permit"), { ...base, paid: { tier: "license", cents: 29900 } });
  assert(paid.paid && paid.line.en.startsWith("Paid"));
});

Deno.test("the approval must be the exact price and kind shown", () => {
  const q = simpleQuote(facts("Sign permit"), { renewal: false, paid: null, chain: false, onPlan: false, automated: false, priceOk: all });
  assertEquals(simpleApproval(q, { tier: "license", cents: 29900 }), { ok: true });
  assertEquals((simpleApproval(q, { tier: "license", cents: 29899 }) as { code: string }).code, "price_changed");
  assertEquals((simpleApproval(q, { tier: "renewal", cents: 29900 }) as { code: string }).code, "price_changed");
  assertEquals((simpleApproval(q, {}) as { code: string }).code, "price_changed");
});

Deno.test("the store plan bills every store; at 10 or more, every new license is included", () => {
  assertEquals(planQuantity(0), 1);
  assertEquals(planQuantity(37), 37);
  assertEquals(isChain(9), false);
  assertEquals(isChain(10), true);
});

Deno.test("only the exact Stripe price is charged", () => {
  assert(simplePriceOk("license", { unit_amount: 29900, currency: "usd", recurring: null }));
  assert(!simplePriceOk("license", { unit_amount: 29900, currency: "usd", recurring: { interval: "year" } }));
  assert(!simplePriceOk("complex", { unit_amount: 99800, currency: "usd", recurring: null }));
  assert(simplePriceOk("plan", { unit_amount: 178800, currency: "usd", recurring: { interval: "year", interval_count: 1 } }));
  assert(!simplePriceOk("plan", { unit_amount: 14900, currency: "usd", recurring: { interval: "month" } }));
  assert(!simplePriceOk("renewal", null));
});

Deno.test("a filing's facts: its name and the agency's fee, from the saved workspace only", () => {
  const apps = [{ id: "a", name: { en: "Sign permit" }, fees: [{ amount: 400 }, { amount: 45 }] }, { id: "b", name: { en: "EIN" }, fees: [] }];
  assertEquals(licenseFactsOf(apps, "a"), { name: "Sign permit", govFeeUsd: 445 });
  assertEquals(licenseFactsOf(apps, "b"), { name: "EIN", govFeeUsd: null });
  assertEquals(licenseFactsOf(apps, "z"), null);
  assertEquals(licenseFactsOf("nope", "a"), null);
});
