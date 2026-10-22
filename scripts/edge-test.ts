/* Edge cases, one test each, for the places a filing goes wrong: where the store is, what kind of place it is, who
   owns it, the numbers and names on the form, the dates, and what happens when an agency's site or Placetta's own
   copy of a rule goes stale. Run from scripts/agent-test.ts. Each names the check that holds it. */
import { B, same } from "../src/bi";
import { normalizeState } from "../src/core";
import type { Application, Approval, Store, Workspace } from "../src/model";
import { placesOf, formById } from "../src/forms/registry";
import { placeOfAddress } from "../src/forms/addressCheck";
import { previewPlan } from "../src/plan/preview";
import { preflight, parseDate } from "../src/smart";
import { secretNumber } from "../src/guard";
import { ein, latin, premises } from "../src/validate";
import { nextRenewal, renewalCycle } from "../src/renewal";
import { dayIn, timeZoneOf, workspaceToday } from "../src/localDay";
import { licenseTierOf } from "../src/pricing";
import { priceOf } from "../supabase/functions/_shared/ai_cost";
import { faxTo, isForeign } from "../supabase/functions/file/logic";
import { DEST } from "../supabase/functions/file/destinations";
import { applySafeFee, sweepFinding } from "../src/qa/sweep";
import { gradeRun, sampled } from "../src/qa/grade";
import { checkFixture } from "../src/qa/mutate";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;
const TODAY = "2026-10-22";
const store = (id: string, address: string, apps: string[] = []): Store => ({ id, name: same(address.split(",")[0]), address, stage: "opening", rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps });
function filing(official: string, address: string, fields: [string, string][], over: Partial<Workspace> = {}): { w: Workspace; a: Approval } {
  const off = formById(official)!;
  const app: Application = { id: "a1", name: off.title, agency: off.agency, level: off.level, status: "ready", official, fees: [{ label: same("Fee"), amount: off.fee ?? 0 }], est: same("2 weeks"),
    source: { label: "gov", url: off.info }, fields: fields.map(([label, value], k) => ({ id: "l" + k, label: same(label), value })), checklist: [] };
  const w = normalizeState("Moonleaf", { business: B("Moonleaf Tea LLC", "月叶茶饮"), facts: [{ id: "f0", group: "business", label: same("Legal name"), value: same("Moonleaf Tea LLC"), source: same("You told me") }],
    apps: [app], stores: [store("s1", address, ["a1"])], ...over });
  return { w, a: { id: "ap1", kind: "file", app: "a1", title: off.title, data: [], created: TODAY } as unknown as Approval };
}
const errs = (p: ReturnType<typeof preflight>) => p.errors.map(e => e.note.en).join(" | ");
const warns = (p: ReturnType<typeof preflight>) => p.warnings.map(e => e.note.en).join(" | ");

export function edgeTests(ok: Ok, eq: Eq) {
  console.log("\n# Edge cases");
  // where the store is
  ok(placesOf("18800 Colima Rd, Rowland Heights, CA 91748").includes("LACU") && !placesOf("18800 Colima Rd, Rowland Heights, CA 91748").includes("LA"),
    "unincorporated county: Rowland Heights gets Los Angeles County's steps, never the City of Los Angeles's");
  ok(placesOf("2500 Alum Rock Ave, Santa Clara County, CA 95116").includes("SCC"), "an address that names the county instead of a town is the county's (it was only the state's: the county health permit went missing)");
  { const f = filing("la-btrc", "18800 Colima Rd, Rowland Heights, CA 91748", [["Business name", "Moonleaf Tea LLC"]]);
    ok(/wrong agency/.test(errs(preflight(f.w, f.a, TODAY))), "city vs county: the City of Los Angeles's business tax for a Rowland Heights store is refused before approval", errs(preflight(f.w, f.a, TODAY))); }
  // what kind of place it is
  { const p = previewPlan("Food hall stall selling bubble tea", "100 N First St, Stall 4, San Jose, CA 95113", undefined, { today: TODAY });
    ok(p.apps.some(a => a.official === "scc-health-permit"), "multi-tenant food hall: the stall still gets its own health permit"); }
  { const f = filing("sj-business-tax", "100 N First St, Stall 4, San Jose, CA 95113", [["Business address", "100 N First St Stall 4, San Jose, CA 95113"]]);
    ok(!/Doesn't match/.test(warns(preflight(f.w, f.a, TODAY))), "food hall stall and suite numbers: the same address written another way isn't flagged", warns(preflight(f.w, f.a, TODAY))); }
  { const p = previewPlan("Ghost kitchen, delivery only", "San Jose, CA", undefined, { today: TODAY });
    ok(p.apps.some(a => a.official === "scc-health-permit"), "ghost kitchen: delivery only is still a food facility with a health permit"); }
  { const p = previewPlan("Food truck selling dumplings", "San Jose, CA", undefined, { today: TODAY });
    const ids = p.apps.map(a => a.official ?? a.id);
    ok(!ids.includes("scc-health-permit") && !ids.includes("sj-building-ti") && !ids.includes("sj-sign") && p.apps.some(a => /Mobile food facility/.test(a.name.en) && /confirm/.test(a.name.en)),
      "mobile food: no restaurant permits for a truck; the vehicle's permit is named and abstains to the county (it listed a building permit and a sign permit)", ids); }
  // who owns it
  eq([licenseTierOf("Food Service Establishment Permit", false), licenseTierOf("Food Service Establishment Permit", true)], ["license", "renewal"],
    "change of ownership: a new owner's permit is a new license, never billed or filed as the old owner's renewal");
  { const f = filing("nyc-fse", "136-20 Roosevelt Ave, Flushing, NY 11354", [["Legal name", "Moonleaf Tea LLC"]]);
    f.w.apps.push({ ...f.w.apps[0], id: "a0", status: "approved" }); f.w.stores![0].apps.push("a0");
    ok(/already approved/.test(warns(preflight(f.w, f.a, TODAY))), "change of ownership at a store whose permit is on record: flagged before a second filing pays the fee twice"); }
  ok(placeOfAddress("No. 8 Jianguo Rd, Chaoyang District, Beijing, China").country === "abroad" && isForeign({ us_address: false } as never)
    && faxTo(DEST["irs-ss4"], { us_address: false } as never) === DEST["irs-ss4"].fax!.foreign, "foreign parent company: an owner abroad faxes the SS-4 to the IRS's international line");
  // numbers and names
  ok(secretNumber("SSN, ITIN, or EIN of responsible party", "912-70-1234") && ein("912701234")?.level === "warn" && !ein("91-2701234"),
    "ITIN vs EIN: an ITIN is never kept, and nine digits that read as one on an EIN line are questioned");
  ok(ein("07-1234567")?.level === "error" && ein("84-1234567") === null && ein("12345")?.level === "error", "EIN: a prefix the IRS doesn't assign is refused");
  { const f = filing("ca-cdtfa", "100 N First St, San Jose, CA 95113", [["Legal name", "月叶茶饮有限公司"]]);
    ok(/English letters/.test(errs(preflight(f.w, f.a, TODAY))) && latin("Moonleaf Tea LLC") === null, "ZH and EN names: Chinese characters on a US form are refused before approval, with how to write it"); }
  { const f = filing("ca-cdtfa", "100 N First St, San Jose, CA 95113", [["Legal name", "Moonleaf"]]);
    ok(/Differs from the legal name/.test(warns(preflight(f.w, f.a, TODAY))), "DBA vs legal name: a trade name on the legal-name line is flagged"); }
  { const f = filing("sj-business-tax", "100 N First St, San Jose, CA 95113", [["Premises address", "P.O. Box 1234, San Jose, CA 95103"]]);
    ok(/P\.O\. box can't be the premises/.test(errs(preflight(f.w, f.a, TODAY))) && premises("100 N First St, Suite 200") === null, "P.O. boxes: refused where the agency needs the premises; a suite is fine"); }
  // dates
  ok(parseDate("2026-02-29") === null && parseDate("2028-02-29") === "2028-02-29", "leap years: February 29 is a date only in a leap year");
  eq([nextRenewal("2024-02-29", { months: 12 }), nextRenewal("2028-02-29", { months: 48 })], ["2025-02-28", "2032-02-29"], "leap years: a permit approved on February 29 renews on the 28th, or the 29th when there is one");
  ok(renewalCycle("Every year, by the tax return due date.") === null, "renewal grace and odd cycles: a cycle the agency words loosely is never turned into a made-up date");
  { const evening = new Date("2026-11-01T01:30:00Z");   // 6:30 pm on October 31 in California, 9:30 am on November 1 in Shanghai
    eq([dayIn(evening, timeZoneOf("100 N First St, San Jose, CA 95113")), dayIn(evening, timeZoneOf("No. 8 Jianguo Rd, Beijing, China")), evening.toISOString().slice(0, 10)], ["2026-10-31", "2026-11-01", "2026-11-01"],
      "time zones: at 6:30 pm in San José it is still October 31 there, though UTC says November 1");
    eq(workspaceToday([{ address: "100 N First St, San Jose, CA 95113" }], evening), "2026-10-31", "time zones: the monitor counts a California store's deadline from California's date (it counted from UTC, a day early)");
    eq(workspaceToday([{ address: "100 N First St, San Jose, CA 95113" }, { address: "Beijing, China" }], evening), "2026-11-01", "time zones: stores in two zones count from the date furthest ahead, never later than any store's own");
    const dst = new Date("2026-11-01T08:30:00Z");   // the night the clocks go back in the US
    eq(dayIn(dst, "America/Los_Angeles"), "2026-11-01", "DST: the night the clocks change still gives the right local date"); }
  // holidays: an agency that moves a due date off a weekend or holiday moves it later, never earlier, so keeping the
  // printed date is always safe; the renewal is started 60 days ahead (monitor RENEW_AHEAD)
  eq(nextRenewal("2026-05-15", { month: 5, day: 15 }), "2027-05-15", "holidays: the printed due date is kept, never moved for a weekend (May 15, 2027 is a Saturday)");
  // fees and stale rules
  { const f = filing("ca-llc-1", "100 N First St, San Jose, CA 95113", [["Legal name", "Moonleaf Tea LLC"]]);
    f.w.apps[0].fees = [{ label: same("Fee"), amount: (formById("ca-llc-1")?.fee ?? 70) + 30 }];
    ok(/agency publishes/.test(warns(preflight(f.w, f.a, TODAY))), "fee changes mid-year: a fee that differs from the agency's published one is flagged before paying"); }
  eq([priceOf("gemini:gemini-3.8-flash", 0, new Date("2026-12-31T12:00:00Z")).in, priceOf("gemini:gemini-3.8-flash", 0, new Date("2027-01-02T12:00:00Z")).in], [0.75, 1.5], "a vendor's price change on a date applies from that day");
  ok(sweepFinding({ id: "x", url: "https://agency.example/page", quote: "must register", checked: "2026-01-01" }, { status: 503, text: "" }, TODAY)?.kind === "unreachable",
    "agency site down: the sweeper records it as unreachable, not as a changed rule, and changes nothing");
  ok(sweepFinding({ id: "x", url: "https://agency.example/page", quote: "must register", checked: "2026-01-01" }, { status: 200, text: "You must register before opening." }, TODAY)?.kind === "stale",
    "stale cached rule: a proof read more than 90 days ago is re-read and, when the words still hold, flagged only as due for its date");
  ok(sweepFinding({ id: "x", url: "https://agency.example/page", quote: "must register", checked: "2026-10-01" }, { status: 200, text: "The program has ended." }, TODAY)?.kind === "drift",
    "a rule whose quoted words are gone from the agency's page is drift, for staff");

  console.log("\n# The quality system: sweeper, online grader, mutations");
  { const fee = sweepFinding({ id: "ca-llc-1", url: "https://bizfile.sos.ca.gov/x", quote: "file articles", checked: "2026-10-18", fee: 70 }, { status: 200, text: "To file Articles of Organization the filing fee is $85." }, TODAY);
    ok(fee?.kind === "fee" && fee.safe?.to === 85 && fee.safe.from === 70 && /bizfile/.test(fee.safe.cite), "a fee that changed on the form's own page is a safe fix, with the page it cites", fee);
    const two = sweepFinding({ id: "x", url: "https://a.gov/p", quote: "online filing", checked: "2026-10-18", fee: 70 }, { status: 200, text: "The fee is $85 for online filing and the fee is $95 by mail." }, TODAY);
    ok(two?.kind === "fee" && !two.safe, "two amounts on the page: no safe fix, staff read it");
    ok(sweepFinding({ id: "x", url: "https://a.gov/p", quote: "file articles", checked: "2026-10-18", fee: 70 }, { status: 200, text: "<p>File&nbsp;Articles here. The filing fee is $70.</p>" }, TODAY) === null, "the page still says it, recently read: nothing"); }
  { const src = `  {\n    id: "aa-1", fee: 70, title: x,\n  },\n  {\n    id: "bb-2", fee: 70,\n  },\n`;
    const out = applySafeFee(src, "aa-1", 70, 85);
    ok(out && out.includes(`id: "aa-1", fee: 85,`) && out.includes(`id: "bb-2", fee: 70,`), "a safe fee fix changes that form's fee and nothing else", out);
    ok(applySafeFee(src, "aa-1", 60, 85) === null && applySafeFee(src, "zz", 70, 85) === null, "a fix whose old fee or form isn't there exactly once isn't made"); }
  { const ws = normalizeState("M", { apps: [] });
    eq(gradeRun({ runId: "r1", reply: "I filed your seller's permit.", calls: [], ws, apps: [], today: TODAY }).map(f => f.source), ["policy"], "the grader flags a reply that claims Odelia filed something");
    eq(gradeRun({ runId: "r2", reply: "The fee is $280 and it takes 4 to 6 weeks.", calls: [{ name: "add_store", ok: true }], ws, apps: [], today: TODAY }).map(f => f.source), ["uncited"], "a fee and a time with no lookup in the run: uncited");
    eq(gradeRun({ runId: "r3", reply: "The fee is $280.", calls: [{ name: "find_official_forms", ok: true }], ws, apps: [], today: TODAY }), [], "the same with the lookup: clean");
    eq(gradeRun({ runId: "r4", reply: "The store plan is $149 a store a month.", calls: [], ws, apps: [], today: TODAY }), [], "Placetta's own prices aren't agency claims");
    const n = Array.from({ length: 1000 }, (_, k) => sampled(`run-${k}`, 0.2)).filter(Boolean).length;
    ok(n > 150 && n < 250 && sampled("same", 0.2) === sampled("same", 0.2), "the grader samples about its share of runs, the same run the same way every time", n); }
  { const r = checkFixture({ id: "sj", what: "Milk tea shop", where: "100 N First St, San Jose, CA 95113" });
    ok(r.ran >= 8 && r.findings.length === 0, "the mutation generator: suites, ZIP+4, capitals, spaces, a P.O. box, a food truck, beer and wine and nonsense all keep their invariants", r.findings.map(f => f.repro)); }
}
