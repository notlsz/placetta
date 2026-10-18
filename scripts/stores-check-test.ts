// The free compliance check for stores already open (src/plan/existing.ts): for each city, the registry's permits, the
// gaps the owner's answers leave, the lapse risks, and the plan rows the gaps become. No model is called.
// Run: npm run test:stores
import { B } from "../src/bi";
import { checkStore, checkStores, readPlace, renewEvery, requiredFor, toPlan, totals, type Answers, type StoreInput } from "../src/plan/existing";

let failed = 0, passed = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); failed++; }
  else { console.log("ok  ", m); passed++; }
};
const TODAY = "2026-10-17";

// the five cities, with the permits Placetta's registry has for them
const CITIES: { store: StoreInput; expect: string[] }[] = [
  { store: { id: "f", city: "Flushing, NY", what: "Milk tea" }, expect: ["nyc-fse", "ny-dtf-17", "nyc-fpc"] },
  { store: { id: "i", city: "Irvine, CA", what: "Restaurant" }, expect: ["irv-license", "oc-health-permit", "ca-cdtfa"] },
  { store: { id: "h", city: "Houston, TX", what: "Bakery and desserts" }, expect: ["hou-food-dealer", "tx-ap201", "hou-co"] },
  { store: { id: "b", city: "Boston, MA", what: "Milk tea" }, expect: ["bos-cv", "bos-food-permit", "ma-tax"] },
  { store: { id: "a", city: "Atlanta, GA", what: "Restaurant" }, expect: ["atl-license", "fulton-food-permit", "ga-tax"] },
];

for (const { store, expect } of CITIES) {
  const req = requiredFor(store);
  const keys = req.map(r => r.key);
  eq(req.length >= 4, true, `${store.city}: the registry lists ${req.length} permits`);
  eq(expect.every(k => keys.includes(k)), true, `${store.city}: includes ${expect.join(", ")}`);
  eq(keys.includes("irs-ss4") && req.find(r => r.key === "irs-ss4")!.whole, true, `${store.city}: the EIN is held once by the whole business`);
  eq(req.some(r => /plan review|building permit/i.test(r.name.en)), false, `${store.city}: no construction steps for a store already open`);
  eq(new Set(keys).size, keys.length, `${store.city}: no permit listed twice`);

  // nothing answered: every permit is "not sure", never assumed held
  const blank = checkStore(store, {}, TODAY);
  eq([blank.counts.unsure, blank.counts.gap, blank.counts.ok], [req.length, 0, 0], `${store.city}: unanswered means not sure`);

  // "don't have" on each city's own permit (the first expected key) is a gap; the rest held
  const own = expect[0];
  const answers: Record<string, { have: "have" | "missing"; renews?: string }> = {};
  for (const r of req) answers[r.key] = r.key === own ? { have: "missing" } : { have: "have", renews: r.every !== null ? "2027-06-30" : undefined };
  const one = checkStore(store, answers, TODAY);
  eq(one.findings.filter(f => f.kind === "gap").map(f => f.key), [own], `${store.city}: the missing ${own} is the one gap`);
  eq(one.counts.lapsed + one.counts.due_soon + one.counts.no_date, 0, `${store.city}: nothing else at risk when every date is far off`);
}

// lapse risks from renewal dates, on Flushing's food service permit (renews every year)
const fl = CITIES[0].store;
const at = (renews?: string) => checkStore(fl, { "nyc-fse": { have: "have", renews } }, TODAY).findings.find(f => f.key === "nyc-fse")!;
eq([at("2026-09-30").kind, at("2026-09-30").days], ["lapsed", -17], "a renewal date in the past is lapsed, 17 days ago");
eq([at("2026-11-20").kind, at("2026-11-20").days], ["due_soon", 34], "within 60 days is due soon");
eq(at("2027-09-30").kind, "ok", "far off is in order");
eq(at(undefined).kind, "no_date", "held but no renewal date is a lapse risk");
eq(at("next year").kind, "no_date", "a date that isn't a date isn't trusted");
// a registration that doesn't renew is in order once held, with or without a date
eq(checkStore(fl, { "ny-dtf-17": { have: "have" } }, TODAY).findings.find(f => f.key === "ny-dtf-17")!.kind, "ok", "a one-time registration held is in order");
eq(checkStore(fl, { "nyc-fpc": { have: "have" } }, TODAY).findings.find(f => f.key === "nyc-fpc")!.kind, "ok", "\"Does not expire\" never lapses");

// five stores at once: the EIN counted once, every store's own permits counted per store
const five = CITIES.map(c => c.store);
const all: Answers = Object.fromEntries(five.map(s => [s.id, Object.fromEntries(requiredFor(s).map(r => [r.key, { have: "missing" as const }]))]));
const res = checkStores(five, all, TODAY);
const t = totals(res);
const perStore = res.reduce((n, r) => n + r.required.filter(x => !x.whole).length, 0);
eq(t.gap, perStore + 1, "totals: every store's permits plus one EIN for the business");
eq(t.stores, 5, "five stores");

// the gaps become the plan
const plan = toPlan(res, TODAY);
eq(plan.stores.length, 5, "a store for each city");
eq(plan.stores.every(s => s.stage === "open"), true, "added as open stores");
eq(plan.apps.filter(a => a.official === "irs-ss4").length, 1, "one EIN application for the whole business");
eq(plan.stores.every(s => (s.apps ?? []).some(id => plan.apps.find(a => a.id === id)?.official === "irs-ss4")), true, "every store points at the one EIN row");
eq(plan.apps.length, t.gap, "an application for every gap");
eq(new Set(plan.apps.map(a => a.id)).size, plan.apps.length, "application ids are unique");
eq(plan.apps.every(a => a.status === "todo" && a.preview), true, "plan rows start as to-do previews Odelia verifies");
eq(plan.apps.find(a => a.official === "nyc-fse")?.agency.en.includes("Health") ?? false, true, "the row keeps the registry's agency");

// a lapsed permit becomes an urgent row and a due date today; a held one becomes a renewal deadline
const mixed = toPlan([checkStore(fl, { "nyc-fse": { have: "have", renews: "2026-09-30" }, "nyc-sign": { have: "have", renews: "2027-03-01" } }, TODAY)], TODAY);
const lapsedApp = mixed.apps.find(a => a.official === "nyc-fse");
eq([lapsedApp?.critical, lapsedApp?.next?.en], [true, "Renew: it expired on 2026-09-30"], "the lapsed permit is critical, with what to do");
eq(mixed.deadlines.some(d => d.kind === "due" && d.date === TODAY && d.app === lapsedApp?.id), true, "and is due today");
eq(mixed.stores[0].permits?.some(p => p.expires === "2026-09-30"), true, "the store keeps the date on file");
const sign = mixed.deadlines.find(d => d.kind === "renewal" && /sign/i.test(d.title.en));
eq(sign?.date ?? (renewEvery(requiredFor(fl).find(r => r.key === "nyc-sign")?.renews) === null ? "none" : "?"), sign ? "2027-03-01" : "none", "a dated permit that renews becomes a renewal deadline");

// new ids never clash with what's in the workspace
const again = toPlan(res.slice(0, 1), TODAY, { stores: [plan.stores[0].id], apps: plan.apps.map(a => a.id) });
eq(again.stores[0].id !== plan.stores[0].id && again.apps.every(a => !plan.apps.some(b => b.id === a.id)), true, "ids stay clear of the workspace's");

// reading places and renewal words
eq(readPlace("Flushing NY"), "Flushing, NY", "a city and state without a comma");
eq(readPlace("Irvine, California"), "Irvine, California", "a state spelled out");
eq(readPlace("Springfield"), "", "no state, no plan");
eq(checkStore({ id: "x", city: "Springfield", what: "Restaurant" }, {}, TODAY).ok, false, "a place without a state is flagged, not guessed");
eq(renewEvery(B("Every 5 years.", "")), 60, "every 5 years");
eq(renewEvery(B("Every 12 months from the first day of the application month.", "")), 12, "every 12 months");
eq(renewEvery(B("Every year, for the calendar year: renew online by October 31.", "")), 12, "every year");
eq(renewEvery(B("Does not expire.", "")), null, "does not expire");
eq(renewEvery(B("Valid to the date on the card, or 2 years if none.", "")), 0, "the agency sets the date");
eq(renewEvery(undefined), null, "no words, no renewal");

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\n${passed} checks passed`);
process.exitCode = failed ? 1 : 0;
