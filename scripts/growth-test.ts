/* The growth mechanics, without a server: the value report says only what records show, entity due dates come only from
   current official quotes, filings past the plan are priced before they're approved, the contract tells its renewal
   terms and its notice window, modules add without public prices, and the brand plan prices by locations and people.
   Run from scripts/agent-test.ts (npm run test:agent). */
import { approvalLine, headline, hoursEstimate, valueReport, valueReportHtml, type ValueInput } from "../src/value.ts";
import { valueInputOf } from "../src/valueInput";
import { ENTITY_RULES, entityDeadlines, filePrompt, MAX_RULE_AGE, nextDue, obligations, REGISTERED_AGENT, ruleCurrent, ruleFor } from "../src/entity.ts";
import { allowanceOf, filingKindOf, quoteFiling, validCap } from "../src/overage.ts";
import { commitmentEnd, consentLine, disclosure, expansions, noticeDue, renewalNotice, yearUsd } from "../src/contract.ts";
import { addLine, MODULES, moduleStates, modulePrice } from "../src/modules.ts";
import { cleanCode, hqQuote, inviteLink } from "../src/hqPlan.ts";
import { MODULE_PRICES, PROPOSED, PUBLISHED } from "../src/pricing.ts";
import { readFileSync } from "node:fs";
import type { Workspace } from "../src/model";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;
const bi = (s: string) => ({ en: s, zh: s });

export function growthTests(ok: Ok, eq: Eq) {
  console.log("\n# Value report: only what records show (src/value.ts)");
  {
    const base: ValueInput = {
      business: bi("Moonleaf Tea"),
      apps: [{ id: "h", name: bi("Health permit"), official: "scc-health" }, { id: "b", name: bi("Business tax certificate"), official: "sj-btc" }, { id: "x", name: bi("Sign permit") }],
      stores: [{ id: "s1", name: bi("Main St"), stage: "open", apps: ["h", "b"] }, { id: "s2", name: bi("Mall"), stage: "opening", apps: ["x"],
        notices: [
          { id: "n1", date: "2026-08-01", agency: bi("County"), what: bi("Late renewal warning"), fine: 500, cureBy: "2026-08-31", doc: "d1", resolved: "2026-08-20" },
          { id: "n2", date: "2026-08-01", agency: bi("City"), what: bi("Sign notice"), fine: 300, cureBy: "2026-08-31", resolved: "2026-08-10" },
          { id: "n3", date: "2026-08-01", agency: bi("City"), what: bi("Fire notice"), fine: 250, cureBy: "2026-08-15", doc: "d1", resolved: "2026-08-20" },
        ] }],
      deadlines: [{ id: "r1", date: "2026-10-01", kind: "renewal", app: "h" }, { id: "r2", date: "2026-10-10", kind: "renewal", app: "b" }],
      docs: [{ id: "d1" }],
      filings: [
        { app: "h", status: "accepted", submitted: "2026-01-05", decided: "2026-01-19", official: "scc-health" },
        { app: "h", status: "submitted", submitted: "2026-09-15" },
        { app: "b", status: "accepted", submitted: "2026-02-01", decided: "2026-02-03", official: "sj-btc" },
        { app: "x", status: "requested", submitted: null },
      ],
      medians: [{ form: "scc-health", businesses: 4, median_days: 21 }, { form: "sj-btc", businesses: 2, median_days: 9 }],
    };
    const r = valueReport(base, "2026-10-22");
    const s1 = r.stores.find(s => s.id === "s1")!, s2 = r.stores.find(s => s.id === "s2")!;
    eq(s1.filings, 3, "filings made: only those that reached the agency (a submitted date)");
    eq(s2.filings, 0, "a filing still waiting isn't counted");
    eq(s1.approvals.map(a => [a.app, a.days, a.median]), [["h", 14, 21], ["b", 2, null]], "days to approval from the filing's own dates; a median only with 3+ businesses");
    ok(/fewer than 3 businesses/.test(approvalLine(s1.approvals[1]).en) && approvalLine(s1.approvals[1]).zh.includes("不足 3 家"), "without network data it says so, in both languages");
    ok(/7 days faster than the agency median of 21 days across 4 businesses/.test(approvalLine(s1.approvals[0]).en), "with it, the comparison");
    eq([s1.renewals, s1.renewalsDue], [1, 2], "a renewal caught: filed within 180 days before it was due; one not filed isn't");
    eq(s2.fines, 500, "fines avoided: only a notice on file, naming a fine, resolved by its date");
    eq(s2.notices.map(n => n.avoided), [500, null, null], "no document, or resolved late: not counted");
    ok(/isn't on file/.test(s2.notices[1].why.en) && /after the date/.test(s2.notices[2].why.en), "and each says why");
    eq(r.brand.fines, 500, "the brand adds up the stores' notices");
    const h = hoursEstimate(3, 1);
    eq(h.total, 3 * PROPOSED.hoursPerFiling + PROPOSED.hoursPerRenewal, "hours saved from the stated formula");
    ok(/^Estimate: 3 filings × \d+ h \+ 1 renewal × \d+ h = \d+ h\. The hours per task are Placetta's assumption/.test(h.formula.en) && h.formula.zh.includes("估算"), "labelled an estimate, its formula shown");
    const lines = headline(s1).map(l => l.en);
    ok(lines.some(l => /No fines avoided claimed/.test(l)), "no notice, no fines claimed");
    ok(lines.some(l => /^7 days faster than the agency medians, over 1 approval/.test(l)), "the headline compares only approvals with network data");
    const html = valueReportHtml(r, "en");
    ok(html.startsWith("<!doctype html>") && html.includes("Moonleaf Tea") && html.includes("Main St") && html.includes("estimate"), "the shareable page stands on its own");
    ok(!/<script/i.test(html), "and runs nothing");
    const evil = valueReportHtml(valueReport({ ...base, business: bi("<img src=x onerror=alert(1)>") }, "2026-10-22"), "zh");
    ok(!evil.includes("<img") && evil.includes("&lt;img"), "names are escaped");
    const empty = valueReport({ ...base, filings: [], stores: base.stores.map(s => ({ ...s, notices: [] })) }, "2026-10-22");
    ok(empty.empty && empty.brand.filings === 0 && empty.brand.hours.total === 0, "with no records, an empty report, not a made-up one");
    const one = valueReport({ ...base, stores: [{ id: "only", name: bi("Only"), stage: "open" }] }, "2026-10-22");
    eq(one.stores[0].filings, 3, "a single store owns every application");
    // from a workspace: the filings table when signed in, else each application's own record
    const ws = { business: bi("W"), apps: [{ id: "h", name: bi("Health permit"), official: "scc-health", filed: { status: "accepted", submitted: "2026-01-05", decided: "2026-01-10" } }],
      stores: [{ id: "s", name: bi("S"), stage: "open" }], deadlines: [], docs: [] } as unknown as Workspace;
    eq(valueInputOf(ws, null, []).filings.length, 1, "a workspace without an account reads Application.filed");
    eq(valueInputOf(ws, [], []).filings.length, 0, "signed in, only the filings table counts");
  }

  console.log("\n# Entity compliance: fail closed on official quotes (src/entity.ts)");
  {
    for (const r of ENTITY_RULES) ok(r.quote.length > 20 && /^https:\/\/[^/]+\.gov\//.test(r.url) && /^\d{4}-\d{2}-\d{2}$/.test(r.read), `${r.state} ${r.kinds.join("/")}: quote, official .gov address and read date`);
    ok(ruleCurrent(ruleFor("CA", "llc"), "2026-10-22"), "a rule read today is current");
    ok(!ruleCurrent(ruleFor("CA", "llc"), "2027-02-01"), `older than ${MAX_RULE_AGE} days: no longer claimed`);
    ok(!ruleCurrent({ ...ruleFor("WA", "llc")!, url: "https://example.com/x" }, "2026-10-22"), "not an official address: not claimed");
    ok(!ruleCurrent({ ...ruleFor("WA", "llc")!, quote: " " }, "2026-10-22"), "no quote: not claimed");
    eq(nextDue(ruleFor("CA", "llc")!, { state: "CA", date: "2026-09-10" }, "2026-10-22"), { due: "2026-12-09", initial: true }, "California LLC: the first statement 90 days after registering");
    eq(nextDue(ruleFor("CA", "llc")!, { state: "CA", date: "2025-03-10" }, "2026-10-22"), { due: "2027-03-31", opens: "2026-10-01" }, "then every two years by the end of the registration month, opening five months before");
    eq(nextDue(ruleFor("CA", "llc")!, { state: "CA", date: "2024-01-15" }, "2026-10-22"), { due: "2028-01-31", opens: "2027-08-01" }, "January: August through January, as the LLC-12 chart says");
    eq(nextDue(ruleFor("DE", "corp")!, { state: "DE", date: "2026-05-01" }, "2026-10-22"), { due: "2027-03-01" }, "Delaware corporation: March 1, from the year after it formed");
    eq(nextDue(ruleFor("NY", "llc")!, { state: "NY", date: "2025-02-14" }, "2026-10-22"), { due: "2027-02-28" }, "New York: every two years, in the month it formed");
    eq(nextDue(ruleFor("WA", "corp")!, { state: "WA", date: "2020-11-03" }, "2026-10-22"), { due: "2026-11-30" }, "Washington: yearly, by the last day of the month it formed");
    eq(nextDue(ruleFor("FL", "llc")!, { state: "FL", date: "2026-02-01" }, "2026-10-22"), { due: "2027-05-01" }, "Florida: May 1");
    eq(nextDue(ruleFor("TX", "llc")!, { state: "TX", date: "2019-07-01" }, "2026-10-22"), { due: "2027-05-15" }, "Texas: May 15");
    const list = obligations([{ id: "e1", name: "Moonleaf LLC", kind: "llc", registrations: [{ state: "CA", date: "2025-03-10" }, { state: "OR", date: "2025-06-01", foreign: true }] },
      { id: "e2", name: "Moonleaf Inc", kind: "corp", registrations: [{ state: "CA", date: "2025-03-10" }] }], "2026-10-22");
    eq(list.map(o => [o.reg.state, o.due]), [["CA", "2027-03-31"], ["OR", null], ["CA", null]], "no verified rule (California corporations, Oregon): no date, listed last");
    ok(list.filter(o => !o.due).every(o => /No verified due date/.test(o.ask!.en) && o.ask!.zh.length > 0), "and it says who to ask instead");
    const dl = entityDeadlines(list);
    eq(dl.map(d => [d.id, d.kind, d.date]), [["ent-e1-ca-2027-03-31", "renewal", "2027-03-31"]], "only a verified date goes on the renewal calendar");
    ok(/put it up for my approval\. Don't file or pay anything until I approve/.test(filePrompt(list[0]).en) && filePrompt(list[0]).en.includes(list[0].rule!.url), "Odelia is asked to prepare it for approval, from the quoted page, never to file it");
    ok(/not a registered agent/.test(REGISTERED_AGENT.line.en) && REGISTERED_AGENT.partner === null, "Placetta is not a registered agent; no partner until the founder picks one");
  }

  console.log("\n# Filings past the plan: price shown first, hard cap (src/overage.ts)");
  {
    eq([filingKindOf({ id: "ent-e1-ca", name: bi("x") }), filingKindOf({ id: "a", name: bi("LLC Statement of Information") }), filingKindOf({ id: "a", name: bi("Sales and use tax return, Q3") }),
      filingKindOf({ id: "a", name: bi("Amended seller's permit") }), filingKindOf({ id: "a", name: bi("Health permit") })], ["entity", "entity", "sales_tax", "amendment", "license"], "what kind of filing each is");
    eq(quoteFiling("renewal", { locations: 0, used: 99, chargedCents: 0, capCents: 0 }).kind, "plan", "a plan's own renewal is never charged");
    eq(allowanceOf(3), 3 * PROPOSED.extraFilingsPerLocationMonth, "the allowance grows with paid locations");
    const q = quoteFiling("sales_tax", { locations: 1, used: PROPOSED.extraFilingsPerLocationMonth, chargedCents: 0, capCents: 0 });
    ok(q.kind === "blocked" && q.reason === "no_cap" && /nothing is charged/.test(q.line.en), "a new workspace's $0 cap charges nothing");
    eq(PROPOSED.defaultFilingCapUsd, 0, "and that is the default");
    const c = quoteFiling("sales_tax", { locations: 1, used: 5, chargedCents: 4900, capCents: 10000, packCents: 4900 });
    ok(c.kind === "charge" && c.cents === 4900 * PROPOSED.packsPerExtraFiling && /\$2 would be left under your \$100 monthly cap/.test(c.line.en), "the price, said before approval, with what's left under the cap");
    eq(quoteFiling("sales_tax", { locations: 1, used: 5, chargedCents: 9800, capCents: 10000 }).kind, "blocked", "never past the cap");
    eq([validCap(0), validCap("150"), validCap(10.5), validCap(-1), validCap(PROPOSED.maxFilingCapUsd + 1)], [0, 150, null, null, null], "a cap is whole dollars within the app's range");
  }

  console.log("\n# Contract: terms, the renewal notice, expansion prompts (src/contract.ts)");
  {
    const d = disclosure({ years: 2, locations: 3 });
    ok(/Renews automatically/.test(d.en) && /2 years, billed once a year/.test(d.en) && /\$5,364 a year for Essentials or \$10,764 for Pro/.test(d.en) && /Cancel online any time/.test(d.en) && /15 to 45 days/.test(d.en), "the terms, price, cadence, notice and online cancel, before checkout");
    ok(d.zh.includes("自动续费") && consentLine.zh.length > 0, "and in Chinese");
    eq(yearUsd({ years: 1, tier: "essentials", locations: 2 }), PUBLISHED.essentialsMonth * 24, "the year at the published price");
    eq([noticeDue("2026-11-21", "2026-10-22", null), noticeDue("2026-11-21", "2026-10-21", null), noticeDue("2026-11-21", "2026-11-07", null), noticeDue("2026-11-21", "2026-10-22", "2026-11-21"), noticeDue("2026-11-21", "2026-10-22", null, false)],
      [true, false, false, false, false], "the notice: 15 to 30 days out, once, only while auto-renew is on");
    eq(commitmentEnd("2026-10-22", 3), "2029-10-21", "a three-year term's last day");
    const n = renewalNotice({ business: "Moonleaf", renewsOn: "2026-11-21", yearUsd: 3576, locations: 2, tier: "essentials", delivered: [bi("3 filings made with agencies")], cancelUrl: "https://placetta.com/app/settings/billing" });
    ok(n.text.includes("$3,576") && n.text.includes("Cancel online in one click") && n.text.includes("3 filings made"), "the notice says the charge, the cancel and the year");
    const x = expansions({ storeStates: ["CA", "TX", "MX"], entityStates: ["CA"], modules: [], sellsAlcohol: true, imports: false, locations: 12, hq: false });
    eq(x.map(e => e.id), ["entity:TX", "module:abroad", "module:alcohol", "hq"], "a new market or a module prompts, from the workspace's own facts");
    eq(expansions({ storeStates: ["CA"], entityStates: ["CA"], modules: ["alcohol"], sellsAlcohol: true, imports: false, locations: 2, hq: false }), [], "nothing to add, nothing said");
    const src = readFileSync("src/contract.ts", "utf8");
    ok(/sjud\.senate\.ca\.gov/.test(src) && /§ 17602\(b\)/.test(src) && /§ 17602\(d\)\(1\)/.test(src), "the statute is cited with its official source");
  }

  console.log("\n# Modules and the brand plan (src/modules.ts, src/hqPlan.ts)");
  {
    eq(MODULES.map(m => m.id), ["entity", "sales_tax", "alcohol", "imports", "abroad", "security"], "the six modules");
    ok(Object.values(MODULE_PRICES).every(p => p === null) && MODULES.every(m => modulePrice(m.id) === null), "no module has a price until the founder confirms one");
    ok(MODULES.every(m => m.name.zh && m.does.zh && m.ready.zh), "each in Chinese too");
    eq(moduleStates(["alcohol"], ["imports"]).alcohol + "/" + moduleStates(["alcohol"], ["imports"]).imports + "/" + moduleStates([], []).entity, "on/requested/off", "where each stands");
    ok(/quote/.test(addLine(MODULES[2], false).en) && /prorated/.test(addLine(MODULES[2], true).en), "what adding one does, said first");
    const f = hqQuote({ billTo: "franchisee", tier: "essentials", locations: 8, people: 40 });
    ok(f.yearUsd === 0 && /Headquarters pays nothing to see them all/.test(f.lines[0].en), "franchisees pay: headquarters pays nothing, as the landing page says");
    const h = hqQuote({ billTo: "hq", tier: "essentials", locations: 15, people: 60 });
    const extra = 60 - 15 * PROPOSED.includedPeoplePerLocation;
    eq([h.locationsUsd, h.extraPeople, h.peopleUsd, h.topUpUsd, h.yearUsd], [15 * 1788, extra, extra * PROPOSED.personYearUsd, 0, 15 * 1788 + extra * PROPOSED.personYearUsd], "locations and people drive the price");
    eq(hqQuote({ billTo: "hq", tier: "essentials", locations: 2, people: 2 }).yearUsd, PUBLISHED.hqFromYear, "the published $25,000 floor");
    eq([cleanCode("https://placetta.com/app/settings/team?hq=" + "a".repeat(64)), cleanCode("short"), cleanCode(" ab-cd ".repeat(4) + "x".repeat(10))], ["a".repeat(64), null, "abcd".repeat(4) + "x".repeat(10)], "an invite code from a link or pasted");
    eq(inviteLink("https://placetta.com/", "abc"), "https://placetta.com/app/settings/team?hq=abc", "the invite link opens where an owner joins");
    // no public price changed: the landing page still says what it said
    const site = readFileSync("site/index.html", "utf8");
    ok(site.includes("$149") && site.includes("25,000"), "the landing page's prices are untouched");
    ok(!new RegExp(`\\$${PROPOSED.personYearUsd} (a|per) (year|person)`).test(site) && !/FOUNDER TO CONFIRM|people past those included/i.test(site), "no proposed price is published");
  }
}
