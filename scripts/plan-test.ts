import { parseStoreList, planStores, publishedDays, renewMonths, toWorkspace, planCsv } from "../src/plan";
import { B } from "../src/model";
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); process.exitCode = 1; } else console.log("ok  ", m); };
const rows = parseStoreList("Name\tAddress\tOpening\nFlushing\t136-20 Roosevelt Ave, Flushing, NY 11354\t2026-12-15\nIrvine; 4250 Barranca Pkwy, Irvine, CA 92604; 1/20/2027\n500 Main St, Houston, TX 77002");
eq(rows.length, 3, "three rows, header skipped");
eq(rows[0], { name: "Flushing", address: "136-20 Roosevelt Ave, Flushing, NY 11354", opening: "2026-12-15" }, "tab row");
eq(rows[1].opening, "2027-01-20", "US date");
eq(rows[2].name, "500 Main St", "address-only row named by street");
eq(publishedDays(B("Fax: about 4 business days. Mail: about 4 to 5 weeks.", "")), 35, "longest published time");
eq(publishedDays(B("Usually about two weeks.", "")), 14, "word numbers");
eq(publishedDays(undefined), null, "no time");
eq(renewMonths(B("Every two years.", "")), 24, "biennial");
eq(renewMonths(B("Every year by June 30.", "")), 12, "yearly");
eq(renewMonths(B("Valid up to 10 years.", "")), 120, "ten years");
const plans = planStores(rows, "Chinese tea house", [], "2026-10-09");
eq(plans.every(p => p.forms.length > 0), true, "every store has forms");
eq(plans[0].forms.some(f => f.form.where === "NYC" || f.form.where === "NY"), true, "NY store gets NY forms");
eq(plans[1].forms.some(f => f.form.where === "CA"), true, "CA store gets CA forms");
const ss4 = plans[0].forms.find(f => f.form.id === "irs-ss4");
eq(ss4 ? [ss4.days, ss4.daysFrom, ss4.fileBy] : null, [35, "agency", "2026-11-03"], "SS-4 file-by from published time");
const withStats = planStores(rows, "tea", [{ form: "irs-ss4", n: 5, median_days: 10, p90_days: 20, rejected_pct: 0 }], "2026-10-09");
eq(withStats[0].forms.find(f => f.form.id === "irs-ss4")?.daysFrom, "placetta", "our own filings win once there are enough");
const lateP = planStores([{ name: "x", address: "1 A St, Flushing, NY 11354", opening: "2026-10-20" }], "tea", [], "2026-10-09");
eq(lateP[0].late > 0, true, "an opening too soon is flagged late");
const w = toWorkspace(plans, []);
eq(w.stores.length, 3, "three stores added");
eq(new Set(w.stores.map(s => s.id)).size, 3, "unique ids");
eq(w.deadlines.every(d => d.date && d.kind === "due"), true, "file-by deadlines");
eq(planCsv(plans).split("\n")[0].startsWith('"Store"'), true, "csv header");
eq(publishedDays(B("No standard time published; paid expedited service typically takes 2 to 3 business days.", "")), null, "expedited-only times make no deadline");
eq(publishedDays(B("Often issued the same day.", "")), 1, "same day");
eq(publishedDays(B("You may open 22 days after applying, even before the pre-permit inspection.", "")), 22, "NYC food permit 22 days");
const ny = planStores([{ name: "F", address: "136-20 Roosevelt Ave, Flushing, NY 11354", opening: "2027-03-01" }], "tea", [], "2026-10-09")[0];
eq(ny.forms.filter(f => f.days != null).length >= 4, true, "most NY forms now have an agency time");
import { permitsOnOpening } from "../src/plan";
const permits = permitsOnOpening({ name: "F", address: "136-20 Roosevelt Ave, Flushing, NY 11354" }, "tea", "2026-10-09");
eq(permits.length > 0 && permits.every(p => p.expires > "2026-10-09" && p.name.en.includes("(estimated)")), true, "opening a store starts its renewals");
// no filing twice in one plan, in any of the cities the library covers
const titles = (address: string) => planStores([{ name: "x", address, opening: "2027-03-01" }], "restaurant", [], "2026-10-09")[0].forms.map(f => f.form.id);
for (const a of ["1 N First St, San Jose, CA 95112", "1 Market St, San Francisco, CA", "1 Main St, Los Angeles, CA", "1 Main St, Houston, TX", "1 Main St, Flushing, NY 11354"]) {
  const ids = titles(a); eq(ids.length === new Set(ids).size && !ids.includes("sj-btc") && !ids.includes("sf-reg"), true, `no duplicate filing in ${a.split(", ")[1]}`);
}
// Manhattan's postal city is "New York, NY": it gets New York City's filings
eq(titles("123 Broadway, New York, NY 10006").some(id => id.startsWith("nyc-")), true, "a Manhattan address gets NYC filings");
eq(titles("1 Main St, Albany, NY 12207").some(id => id.startsWith("nyc-")), false, "an Albany address doesn't");
// Pasadena and Long Beach have their own health departments: no LA County food permit there
eq(titles("1 Colorado Blvd, Pasadena, CA 91101").some(id => id.startsWith("lac-")), false, "Pasadena doesn't get LA County's food permits");
eq(titles("1 Pine Ave, Long Beach, CA 90802").some(id => id.startsWith("lac-")), false, "Long Beach doesn't either");
eq(titles("1 Main St, Alhambra, CA 91801").some(id => id.startsWith("lac-")), true, "Alhambra does");

// Cost to open (src/cost.ts), checked against the registry for three cities: every published fee counted, every fee the
// registry doesn't publish left out and reported, never guessed; Placetta's own price from the Stripe catalog.
import { previewPlan } from "../src/plan/preview";
import { costToOpen } from "../src/cost";
import { formById } from "../src/forms/registry";
import { normalizeState } from "../src/core";
import { CATALOG } from "../supabase/functions/_shared/stripe_catalog.ts";
import { licenseTierOf, SIMPLE } from "../src/pricing";
const opened = (where: string, opening: string) => {
  const p = previewPlan("Milk tea shop", where, opening, { today: "2026-10-17", storeId: "st1" });
  const store = { id: "st1", name: B(where, where), address: where, stage: "opening" as const, plannedOpen: opening, rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: p.apps.map(a => a.id) };
  return { p, w: normalizeState("Moonleaf", { business: B("Moonleaf Tea LLC", "月叶茶"), apps: p.apps, deadlines: p.deadlines, stores: [store] }) };
};
const want: Record<string, { usd: number; published: number; unpublished: number; open: string[]; closed: string[] }> = {
  // unpublished counts include the build-out permits and California's food handler card added from the accuracy gold set; Irvine's
  // new LLC also files its $20 Statement of Information (LLC-12)
  "Flushing, NY": { usd: 554.6, published: 7, unpublished: 4, open: ["nyc-fse"], closed: ["nyc-co", "ny-wcb", "nyc-sign", "nyc-dob-alt"] },
  "Irvine, CA": { usd: 90, published: 5, unpublished: 5, open: ["ca-llc-1", "ca-llc-12"], closed: ["irv-license", "oc-plan-check", "oc-health-permit", "ca-food-handler"] },
  "Houston, TX": { usd: 325, published: 5, unpublished: 7, open: ["tx-205", "tx-503"], closed: ["hou-food-dealer", "hou-plan-review", "hou-co", "hou-buildout"] },
};
const cents = (n: number) => Math.round(n * 100) / 100;
for (const [where, x] of Object.entries(want)) {
  const { p, w } = opened(where, "2027-03-01");
  const c = costToOpen(w, { today: "2026-10-17" });
  // the registry, read directly: what the plan's forms publish
  const forms = p.apps.map(a => (a.official ? formById(a.official) : undefined));
  eq(cents(c.agencyUSD), cents(forms.reduce((s, f) => s + (f?.fee ?? 0), 0)), `${where}: agency fees add up exactly what the registry publishes`);
  eq([cents(c.agencyUSD), c.published, c.unpublished], [x.usd, x.published, x.unpublished], `${where}: $${x.usd} published across ${x.published} permits, ${x.unpublished} not published`);
  eq(c.fees.filter(f => f.fee == null).length, forms.filter(f => !f || f.fee == null).length, `${where}: every fee the registry leaves open stays open`);
  eq(x.closed.every(id => c.fees.find(f => f.app === "pv-" + id)?.fee === null), true, `${where}: ${x.closed.join(", ")} say "not published", with no amount`);
  eq(x.open.every(id => c.fees.find(f => f.app === "pv-" + id)?.fee === formById(id)!.fee && c.fees.find(f => f.app === "pv-" + id)?.source === formById(id)!.info), true, `${where}: published fees carry the agency's page`);
  // the simple model (every new workspace, and the sample): each permit at its list price, complex ones at $999,
  // what staff complete themselves free (src/pricing.ts)
  const tiers = w.apps.filter(a => a.status !== "approved").map(a => licenseTierOf(a.name.en));
  const simple = tiers.reduce((s, t) => s + (t === "complex" ? SIMPLE.complexUsd : t === "license" ? SIMPLE.licenseUsd : 0), 0) + SIMPLE.planStoreMonthUsd * 12 * Math.max(1, (w.stores ?? []).length);
  eq(c.placettaUSD, simple, `${where}: Placetta is each new license at its list price plus the store plan's first year ($${simple})`);
  eq(tiers.includes("complex") && tiers.includes("license"), true, `${where}: a restaurant opening has both standard and complex licenses`);
  eq(c.totalUSD, cents(x.usd + simple), `${where}: the total is what's known, nothing more`);
  const legacy = costToOpen(w, { today: "2026-10-17", billing: { plan: "none", model: "legacy" } });
  eq(legacy.placetta.map(r => r.amount), [CATALOG.food.cents / 100, CATALOG.essentials.cents / 100], `${where}: a legacy customer still sees the food opening fee and a year of Essentials, from the Stripe catalog`);
  eq(!!c.landing && c.landing === p.projectedOpen, true, `${where}: the time to open is the opening path's date`);
}
{
  // the plan in billing: Pro, a comped account, and an entry plan already paid; a complex store is quoted, never priced
  const { w } = opened("Flushing, NY", "2027-03-01");
  eq(costToOpen(w, { today: "2026-10-17", billing: { plan: "monthly", tier: "pro", model: "legacy" } }).placetta.map(r => r.amount), [6500, 3588], "Pro: a year of Pro instead");
  eq(costToOpen(w, { today: "2026-10-17", billing: { plan: "monthly", comped: true } }).placettaUSD, 0, "comped: nothing to pay");
  const entry = costToOpen(w, { today: "2026-10-17", billing: { plan: "entry", entryMarkets: 1, model: "legacy" } });
  eq([entry.placetta.at(-1)?.paid, entry.placettaUSD], [true, 8288], "an entry plan already paid is shown, not charged again");
  eq(costToOpen(w, { today: "2026-10-17", billing: { plan: "monthly", paidLocations: 12 } }).placettaUSD, 0, "10 or more stores on the plan: every new license included");
  eq(costToOpen(w, { today: "2026-10-17", billing: { plan: "monthly", paidLocations: 1 } }).placetta.some(r => r.paid && r.amount === 0), true, "on the store plan: the plan is shown as theirs, new licenses still priced");
  const complex = costToOpen({ ...w, stores: w.stores!.map(s => ({ ...s, kind: "complex" }) as typeof s) }, { today: "2026-10-17", billing: { plan: "none", model: "legacy" } });
  eq([complex.placetta[0].amount, complex.quoted, complex.placettaUSD], [null, 1, 1788], "a liquor or build-out store is quoted by the team, not guessed");
  // a permit that isn't in the registry is never counted, whatever amount sits on it
  const odd = costToOpen({ ...w, apps: [...w.apps, { ...w.apps[0], id: "x", official: undefined, fees: [{ label: B("Fee", "费用"), amount: 999 }] }] }, { today: "2026-10-17" });
  eq([odd.agencyUSD, odd.unpublished], [costToOpen(w, { today: "2026-10-17" }).agencyUSD, 5], "an amount the registry doesn't publish is never added");
}
