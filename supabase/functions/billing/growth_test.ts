// deno test supabase/functions/billing/growth_test.ts
// The growth actions' decisions at the approved owner prices: a filing past the plan is charged only at the price and
// kind of work shown and under the cap; modules bill by their own unit from the workspace's facts and only from the
// approved Stripe price; the brand plan bills headquarters only when it pays; the term is 1 to 3 years.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { chargeStep, filingFactsOf, filingQuote, hqCheckout, moduleApproval, moduleOf, modulePriceOk, moduleQuote, moduleUnits, ownerPriceOk, prorationCents, QUOTE_TTL_S, termOf, termPriceEnv, termPriceOk } from "./logic.ts";
import { quoteFiling } from "../../../src/overage.ts";
import { APPROVED, PUBLISHED } from "../../../src/pricing.ts";

const month = (o: Partial<{ locations: number; used: number; chargedCents: number; capCents: number; packCents: number; assistedCents: number | null }> = {}) =>
  ({ locations: 2, used: 0, chargedCents: 0, capCents: 0, packCents: 4900, assistedCents: 19900, ...o });
const auto = (kind: "sales_tax" | "entity" | "license" | "renewal" = "sales_tax") => ({ kind, mode: "automated" as const });
const assisted = { kind: "entity" as const, mode: "assisted" as const };
const ALLOW = 2 * APPROVED.includedAutomatedPerLocationMonth;

Deno.test("a plan's own licenses and renewals are never charged", () => {
  assertEquals(chargeStep({ ref: "a" }, auto("license"), month()), { do: "none" });
  assertEquals(chargeStep({ ref: "a" }, auto("renewal"), month({ used: 99, capCents: 10000 })), { do: "none" });
});
Deno.test("a filing billing can't find in the workspace is refused", () => {
  const s = chargeStep({ ref: "nope", shown_cents: 0, mode: "automated" }, null, month());
  assert(s.do === "refuse" && s.code === "not_found");
  assert(chargeStep({ ref: "", shown_cents: 0 }, auto(), month()).do === "refuse");
});
Deno.test("automated, within the allowance: counted at no charge, only as shown", () => {
  const s = chargeStep({ ref: "a", shown_cents: 0, mode: "automated" }, auto(), month());
  assert(s.do === "reserve" && !s.charge && s.cents === 0 && s.mode === "automated" && s.allow === ALLOW);
  assertEquals(chargeStep({ ref: "a", shown_cents: 4900, mode: "automated" }, auto(), month()).do, "refuse");
  assertEquals(chargeStep({ ref: "a", shown_cents: 0, mode: "assisted" }, auto(), month()).do, "refuse");
});
Deno.test("automated, past the allowance: refused with a $0 cap, charged at the exact price shown under a cap", () => {
  const full = { used: ALLOW };
  const none = chargeStep({ ref: "a", shown_cents: 4900, mode: "automated" }, auto("entity"), month(full));
  assert(none.do === "refuse" && none.code === "no_cap");
  const yes = chargeStep({ ref: "a", shown_cents: 4900, mode: "automated" }, auto("entity"), month({ ...full, capCents: 20000 }));
  assert(yes.do === "reserve" && yes.charge && yes.cents === 4900 * APPROVED.packsPerAutomatedFiling && yes.packs === 1);
  const off = chargeStep({ ref: "a", shown_cents: 4899, mode: "automated" }, auto("entity"), month({ ...full, capCents: 20000 }));
  assert(off.do === "refuse" && off.code === "price_changed");
  const over = chargeStep({ ref: "a", shown_cents: 4900, mode: "automated" }, auto("entity"), month({ ...full, capCents: 10000, chargedCents: 9800 }));
  assert(over.do === "refuse" && over.code === "over_cap");
});
Deno.test("assisted: $199 each, never in the allowance, the team quotes it without the approved Stripe price", () => {
  const y = chargeStep({ ref: "a", shown_cents: 19900, mode: "assisted" }, assisted, month({ capCents: 50000 }));
  assert(y.do === "reserve" && y.charge && y.cents === APPROVED.assistedFilingUsd * 100 && y.mode === "assisted");
  assert(chargeStep({ ref: "a", shown_cents: 4900, mode: "automated" }, assisted, month({ capCents: 50000 })).do === "refuse");
  const q = chargeStep({ ref: "a", shown_cents: 0, mode: "assisted" }, assisted, month({ capCents: 50000, assistedCents: null }));
  assert(q.do === "quote" && /quote/.test(q.message));
  const capped = chargeStep({ ref: "a", shown_cents: 19900, mode: "assisted" }, assisted, month({ capCents: 10000 }));
  assert(capped.do === "refuse" && capped.code === "over_cap");
});
Deno.test("who does the work comes from the filing's verified destination", () => {
  const dest = { web: { signature: "typed", portal: "x.gov" }, ink: { signature: "wet", portal: "y.gov" }, post: { signature: "none" } };
  const apps = [{ id: "a1", name: { en: "Sales and use tax return" }, official: "web" }, { id: "a2", name: { en: "LLC Statement of Information" }, official: "ink" },
    { id: "a3", name: { en: "Annual report" }, official: "post" }, { id: "a4", name: { en: "Amended permit" } }];
  assertEquals(["a1", "a2", "a3", "a4"].map((r) => filingFactsOf(apps, r, dest)), [
    { kind: "sales_tax", mode: "automated" }, { kind: "entity", mode: "assisted" }, { kind: "entity", mode: "assisted" }, { kind: "amendment", mode: "assisted" }]);
  assertEquals(filingFactsOf(apps, "zz", dest), null);
  assertEquals(filingFactsOf("not a list", "a1", dest), null);
  const q = filingQuote({ kind: "sales_tax", mode: "automated" }, month());
  assert(q?.kind === "allowance");
});
Deno.test("the quote uses the pack price, and says so before anything is charged", () => {
  const q = quoteFiling("amendment", month({ used: 4, capCents: 10000 }));
  assert(q.kind === "charge" && q.cents === PUBLISHED.packUsd * 100 * APPROVED.packsPerAutomatedFiling && /charged only when you approve/.test(q.line.en) && q.line.zh.length > 0);
  const noPlan = quoteFiling("sales_tax", month({ locations: 0 }));
  assert(noPlan.kind === "blocked" && noPlan.reason === "no_plan");
});

Deno.test("modules: units from the workspace's saved facts", () => {
  const state = {
    stores: [{ id: "a", address: "1 Main St, San Jose, CA 95112", liquor: true }, { id: "b", address: "9 Rd, Austin, TX 78701" }, { id: "c", address: "Calle 5, 28013 Madrid, ES" }, { id: "d", address: "4 Av, Monterrey, MX" }],
    entities: [{ id: "e1", registrations: [{ state: "DE" }, { state: "CA" }, { state: "TX" }] }],
  };
  assertEquals([moduleUnits("entity", state, []).qty, moduleUnits("sales_tax", state, []).qty, moduleUnits("alcohol", state, []).qty, moduleUnits("imports", state, []).qty, moduleUnits("security", state, []).qty], [3, 2, 1, 1, 1]);
  assertEquals(moduleUnits("abroad", state, ["ES"]), { qty: 1, countries: ["MX"] });
  assertEquals(moduleUnits("entity", null, []).qty, 0);
  assertEquals([moduleOf("alcohol"), moduleOf("vendor_marketplace"), moduleOf(7)], ["alcohol", null, null]);
});
Deno.test("modules: billed only from the approved Stripe price", () => {
  const year = (cents: number) => ({ unit_amount: cents, currency: "usd", recurring: { interval: "year", interval_count: 1 }, active: true });
  assert(modulePriceOk("sales_tax", year(58800)) && modulePriceOk("entity", year(29900)) && modulePriceOk("alcohol", year(94800)) && modulePriceOk("imports", year(598800)) && modulePriceOk("security", year(600000)));
  assert(modulePriceOk("abroad", { unit_amount: 150000, currency: "usd", recurring: null }));
  assert(!modulePriceOk("sales_tax", year(4900)) && !modulePriceOk("sales_tax", { ...year(58800), active: false }) && !modulePriceOk("abroad", year(150000)));
  assert(ownerPriceOk("filingAssisted", { unit_amount: 19900, currency: "usd", recurring: null }) && ownerPriceOk("hqPerson", year(24000)) && !ownerPriceOk("hqPerson", year(24001)));
});
Deno.test("modules: an approval must match the quote's units, cents and time", () => {
  const q = moduleQuote("sales_tax", { qty: 2, priceOk: true, subscribed: true, dueNowCents: 31234, renews: "2027-03-01" });
  const now = 1_800_000_000;
  assertEquals(moduleApproval(q, { qty: 2, cents: 31234, at: now - 60 }, now), { ok: true });
  assert(!moduleApproval(q, { qty: 2, cents: 31233, at: now - 60 }, now).ok);
  assert(!moduleApproval(q, { qty: 3, cents: 31234, at: now - 60 }, now).ok);
  const old = moduleApproval(q, { qty: 2, cents: 31234, at: now - QUOTE_TTL_S - 1 }, now);
  assert(!old.ok && old.code === "quote_expired");
  assert(!moduleApproval(moduleQuote("sales_tax", { qty: 2, priceOk: false, subscribed: true }), { qty: 2, cents: 0, at: now }, now).ok);
});
Deno.test("a mid-term change charges Stripe's prorations, to the cent", () => {
  assertEquals(prorationCents({ lines: { data: [
    { amount: 31234, parent: { subscription_item_details: { proration: true } } },
    { amount: -1000, proration: true },
    { amount: 178800, parent: { subscription_item_details: { proration: false } } },
  ] } }), 30234);
  assertEquals(prorationCents(null), 0);
});
Deno.test("multi-year terms: their own approved price, else the team quotes", () => {
  assertEquals([termPriceEnv("essentials", 1), termPriceEnv("essentials", 2), termPriceEnv("pro", 3)], [null, "STRIPE_PRICE_LOCATION_2Y", "STRIPE_PRICE_LOCATION_PRO_3Y"]);
  const year = (cents: number) => ({ unit_amount: cents, currency: "usd", recurring: { interval: "year" } });
  assert(termPriceOk("essentials", 2, year(169860)) && termPriceOk("essentials", 3, year(160920)) && termPriceOk("pro", 2, year(340860)) && termPriceOk("pro", 3, year(322920)));
  assert(!termPriceOk("essentials", 2, year(178800)));
});
Deno.test("the brand plan: headquarters pays only when it chose to, with the published floor", () => {
  const f = hqCheckout({ billTo: "franchisee", tier: "essentials", locations: 12, people: 50 });
  assert(!f.ok && f.quote.yearUsd === 0);
  const small = hqCheckout({ billTo: "hq", tier: "essentials", locations: 3, people: 4 });
  assert(small.ok && small.quote.locationsUsd === 3 * PUBLISHED.essentialsMonth * 12 && small.quote.yearUsd === PUBLISHED.hqFromYear && small.quote.topUpUsd > 0);
  const big = hqCheckout({ billTo: "hq", tier: "pro", locations: 20, people: 70 });
  const extra = 70 - 20 * APPROVED.includedPeoplePerLocation;
  assert(big.ok && big.quote.extraPeople === extra && big.quote.peopleUsd === extra * APPROVED.personYearUsd && big.quote.topUpUsd === 0
    && big.quote.yearUsd === 20 * PUBLISHED.proMonth * 12 + extra * APPROVED.personYearUsd);
  assert(!hqCheckout({ billTo: "hq", tier: "essentials", locations: 0, people: 0 }).ok);
});
Deno.test("the term: one, two or three years, else one", () => {
  assertEquals([termOf(1), termOf("2"), termOf(3), termOf(4), termOf(undefined), termOf("x")], [1, 2, 3, 1, 1, 1]);
});
