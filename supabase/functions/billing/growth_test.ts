// deno test supabase/functions/billing/growth_test.ts
// The growth actions' decisions: a filing past the plan is charged only at the price shown and under the cap; modules
// are quoted until a price is set; the brand plan bills headquarters only when it pays; the term is 1 to 3 years.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { chargeStep, hqCheckout, moduleStep, termOf } from "./logic.ts";
import { quoteFiling } from "../../../src/overage.ts";
import { PROPOSED, PUBLISHED } from "../../../src/pricing.ts";

const month = (o: Partial<{ locations: number; used: number; chargedCents: number; capCents: number; packCents: number }> = {}) =>
  ({ locations: 2, used: 0, chargedCents: 0, capCents: 0, packCents: 4900, ...o });

Deno.test("a plan's own licenses and renewals are never charged", () => {
  assertEquals(chargeStep({ kind: "license", ref: "a" }, month()), { do: "none" });
  assertEquals(chargeStep({ kind: "renewal", ref: "a" }, month({ used: 99, capCents: 10000 })), { do: "none" });
});
Deno.test("within the allowance: counted at no charge, and only as shown", () => {
  const s = chargeStep({ kind: "sales_tax", ref: "a", shown_cents: 0 }, month());
  assert(s.do === "reserve" && !s.charge && s.cents === 0 && s.allow === 2 * PROPOSED.extraFilingsPerLocationMonth);
  assertEquals(chargeStep({ kind: "sales_tax", ref: "a", shown_cents: 4900 }, month()).do, "refuse");
});
Deno.test("past the allowance: refused with a $0 cap, charged at the exact price shown under a cap", () => {
  const full = { used: 2 * PROPOSED.extraFilingsPerLocationMonth };
  const none = chargeStep({ kind: "entity", ref: "a", shown_cents: 4900 }, month(full));
  assert(none.do === "refuse" && none.code === "no_cap");
  const yes = chargeStep({ kind: "entity", ref: "a", shown_cents: 4900 * PROPOSED.packsPerExtraFiling }, month({ ...full, capCents: 20000 }));
  assert(yes.do === "reserve" && yes.charge && yes.cents === 4900 * PROPOSED.packsPerExtraFiling);
  const off = chargeStep({ kind: "entity", ref: "a", shown_cents: 4899 }, month({ ...full, capCents: 20000 }));
  assert(off.do === "refuse" && off.code === "price_changed");
  const over = chargeStep({ kind: "entity", ref: "a", shown_cents: 4900 }, month({ ...full, capCents: 10000, chargedCents: 9800 }));
  assert(over.do === "refuse" && over.code === "over_cap");
  assert(chargeStep({ kind: "entity", ref: "", shown_cents: 4900 }, month()).do === "refuse");
  assert(chargeStep({ kind: "vendor", ref: "a", shown_cents: 0 }, month()).do === "refuse");
});
Deno.test("the price uses the existing pack price, and the line says so before anything is charged", () => {
  const q = quoteFiling("amendment", month({ used: 4, capCents: 10000 }));
  assert(q.kind === "charge" && q.cents === PUBLISHED.packUsd * 100 * PROPOSED.packsPerExtraFiling && /charged only when you approve/.test(q.line.en) && q.line.zh.length > 0);
  const noPlan = quoteFiling("sales_tax", month({ locations: 0 }));
  assert(noPlan.kind === "blocked" && noPlan.reason === "no_plan");
});
Deno.test("modules: quoted until the founder sets a price; billed only on a running yearly plan", () => {
  assertEquals(moduleStep("alcohol", false, true), { ok: true, id: "alcohol", billed: false });
  assertEquals(moduleStep("alcohol", true, false), { ok: true, id: "alcohol", billed: false });
  assertEquals(moduleStep("alcohol", true, true), { ok: true, id: "alcohol", billed: true });
  assertEquals(moduleStep("vendor_marketplace", true, true).ok, false);
  assertEquals(moduleStep("kitchen_booking", true, true).ok, false);
});
Deno.test("the brand plan: headquarters pays only when it chose to, with the published floor", () => {
  const f = hqCheckout({ billTo: "franchisee", tier: "essentials", locations: 12, people: 50 });
  assert(!f.ok && f.quote.yearUsd === 0);
  const small = hqCheckout({ billTo: "hq", tier: "essentials", locations: 3, people: 4 });
  assert(small.ok && small.quote.locationsUsd === 3 * PUBLISHED.essentialsMonth * 12 && small.quote.yearUsd === PUBLISHED.hqFromYear && small.quote.topUpUsd > 0);
  const big = hqCheckout({ billTo: "hq", tier: "pro", locations: 20, people: 70 });
  const extra = 70 - 20 * PROPOSED.includedPeoplePerLocation;
  assert(big.ok && big.quote.extraPeople === extra && big.quote.peopleUsd === extra * PROPOSED.personYearUsd && big.quote.topUpUsd === 0
    && big.quote.yearUsd === 20 * PUBLISHED.proMonth * 12 + extra * PROPOSED.personYearUsd);
  assert(!hqCheckout({ billTo: "hq", tier: "essentials", locations: 0, people: 0 }).ok);
});
Deno.test("the term: one, two or three years, else one", () => {
  assertEquals([termOf(1), termOf("2"), termOf(3), termOf(4), termOf(undefined), termOf("x")], [1, 2, 3, 1, 1, 1]);
});
