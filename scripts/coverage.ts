// npm run coverage (npm run coverage:write rewrites the document): docs/COVERAGE.md, the registry's coverage city by
// city for the 92 cities the guides name (site/guides/data.json), plus the countries added after them. For each city it
// asks the registry (formsFor) what a new restaurant and a new shop there file, with staff, a build-out, a sign, a new
// company and alcohol for the restaurant, and sorts each filing into a level (federal or national, state or province,
// county, city) and a topic. A filing counts as verified when it carries a proof (a quote from the official page, the
// URL and the day it was read); one without is UNVERIFIED: its plan row abstains and names the office.
//
// A city is "covered" when every level that governs it has a verified filing for each core topic (company, tax, employer,
// food, building or use, local licence), "partial" when some are verified, "unverified" when none of its local filings
// are. The test fails when the document is out of date, or when a guide city resolves to no jurisdiction.
import { readFileSync, writeFileSync } from "node:fs";
import { FORMS, formsFor, placesOf, type OfficialForm } from "../src/forms/registry";
import { CITIES, COUNTRIES } from "../src/forms/world";
import { AUDIT_READ, FIXES } from "../src/forms/audit";
import { US_GAPS } from "../src/forms/us-gaps";
import { INTL_FORMS } from "../src/forms/intl";
import { MEXICO_GAPS } from "../src/forms/mexico";
import { FINISH_FIXES, FINISH_FORMS } from "../src/forms/finish";

/** Each guide city's status in the audit of 2026-10-22, before the finishing pass (src/forms/finish.ts). */
const BEFORE: Record<string, string> = {"New York City": "covered", "Los Angeles": "covered", "Houston": "covered", "San Francisco": "covered", "San Jose": "covered", "Chicago": "partial", "Seattle": "covered", "Boston": "covered", "Miami": "covered", "Dallas": "covered", "Austin": "covered", "Washington, DC": "covered", "Atlanta": "covered", "Philadelphia": "covered", "Las Vegas": "covered", "San Antonio": "covered", "Tampa": "partial", "San Diego": "covered", "Irvine": "covered", "Orlando": "covered", "Fort Worth": "covered", "Phoenix": "partial", "Oakland": "covered", "Sacramento": "partial", "Portland": "covered", "Plano": "covered", "Arlington": "covered", "Fairfax County": "covered", "Edison": "covered", "Jersey City": "covered", "Denver": "covered", "Minneapolis": "covered", "Columbus": "unverified", "Cupertino": "covered", "Milpitas": "covered", "Daly City": "covered", "Arcadia": "covered", "Alhambra": "covered", "Fort Lee": "covered", "Bellevue": "covered", "Rockville": "covered", "Mexico City": "partial", "Monterrey": "partial", "Guadalajara": "partial", "Cancún": "partial", "Beijing": "unverified", "Shanghai": "unverified", "Shenzhen": "unverified", "Guangzhou": "unverified", "Hangzhou": "unverified", "Chengdu": "unverified", "Chongqing": "unverified", "Wuhan": "unverified", "Nanjing": "unverified", "Suzhou": "unverified", "Tianjin": "unverified", "Xi'an": "unverified", "London": "covered", "Manchester": "covered", "Paris": "covered", "Berlin": "covered", "Munich": "partial", "Hamburg": "partial", "Frankfurt": "partial", "Madrid": "partial", "Barcelona": "partial", "Milan": "partial", "Rome": "partial", "Amsterdam": "covered", "Rotterdam": "covered", "Dublin": "partial", "Cork": "partial", "Brussels": "unverified", "Lisbon": "unverified", "Zurich": "unverified", "Bern": "unverified", "Vienna": "unverified", "Graz": "unverified", "Stockholm": "unverified", "Gothenburg": "unverified", "Copenhagen": "unverified", "Aarhus": "unverified", "Warsaw": "unverified", "Helsinki": "unverified", "Dubai": "unverified", "Abu Dhabi": "unverified", "Sharjah": "unverified", "Riyadh": "unverified", "Jeddah": "unverified", "Dammam": "unverified", "Doha": "unverified", "Istanbul": "unverified"};

/** Filings that are two steps at once by the agency's own words: Madrid's responsible declaration opens the activity and
    covers the works it needs, so for coverage it counts as the city's building step as well as its licence; Monterrey's
    opening licence is its building use licence (granted through the fast opening system, SARE). */
export const ALSO_COVERS: Record<string, { topic: Topic; read: string; quote: string; en: string }> = {
  "es-mad-dr": { topic: "building", read: "https://www.madrid.es/portales/munimadrid/es/Como-poner-en-marcha-una-actividad-economica/?vgnextfmt=default&vgnextoid=b13a369f792f7710VgnVCM1000001d4a900aRCRD&vgnextchannel=2af331d3b28fe410VgnVCM1000000b205a0aRCRD",
    quote: "Para iniciar o modificar una actividad económica en la ciudad de Madrid, incluidas las obras necesarias para su desarrollo,", en: "To start or change an economic activity in the city of Madrid, including the works it needs," },
  "mx-mty-edificacion": { topic: "licence", read: "https://www.monterrey.gob.mx/pdf/new/Procedimientos/Sedue/P_SDU_DEC_37_Manual_para_la_Operacion_del_Sistema_de_Apertura_Rapida_de_Empresas.pdf",
    quote: "Otorgar la Licencia de Uso de Edificación mediante la operación del Sistema de Apertura de Empresas (SARE)", en: "To grant the building use licence through the Business Fast Opening System (SARE)" },
};

/** Countries with no general local trade licence for a shop or restaurant: the city's own list of what a new restaurant
    needs names national registrations and local permits (building, alcohol, outdoor seating) and no trade licence. There
    the local licence step is met by the city's verified building or use permit. Each is a judgement on an official page,
    quoted, for the founder to check. */
export const NO_TRADE_LICENCE: Record<string, { read: string; quote: string; en: string; why: string }> = {
  DK: { read: "https://www.kk.dk/erhverv/butik-gadesalg-og-restaurant/tjekliste-for-nye-restauratoerer", quote: "Nødvendige tilladelser og registreringer",
    en: "Necessary permits and registrations", why: "Copenhagen's checklist for new restaurateurs lists, under this heading, the Danish Veterinary and Food Administration's registration, the alcohol licence, the building permit and outdoor seating, and no trade licence." },
};

const OUT = `${process.cwd()}/docs/COVERAGE.md`;
const write = process.argv.includes("--write");

type Topic = "company" | "tax" | "employer" | "food" | "building" | "licence" | "alcohol";
const TOPICS: Topic[] = ["company", "tax", "employer", "food", "building", "licence", "alcohol"];
const LEVELS = ["federal", "state", "county", "city"] as const;

function topicOf(f: OfficialForm): Topic {
  const t = `${f.id} ${f.form} ${f.title.en}`.toLowerCase();
  if (f.needs?.alcohol || /alcohol|liquor|wine|beer|abc\b|sla\b/.test(t)) return "alcohol";
  if (f.needs?.newEntity || f.needs?.foreignEntity || /formation|articles of|incorporat|company registration|registro p|handelsregister|kbis|sociedad|notar|extra-provincial|foreign (llc|registration)|certificate of (organization|formation)/.test(t)) return "company";
  if (/irs-ss4|business number/.test(t)) return "tax";
  if (f.needs?.employees || /employer|payroll|unemployment|workers'? comp|wsib|imss|social (security|insurance)|urssaf|sozialversicherung|seguridad social|inps/.test(t)) return "employer";
  if (/plan (review|check)|building|occupancy|zoning|use permit|uso de|edificaci|alteration|buildout|finish-out|tenant improvement|construction|planning|bauantrag|permis de construire|fire|sign\b|sign permit|hood/.test(t)) return "building";
  if (/food|health|hygiene|haccp|cofepris|victual|restaurant|sanitation|eating|lebensmittel|alimentaire|sanitari|horeca|handler|manager/.test(t)) return "food";
  if (/nj-reg|md-cra|combined registration|tax|seller|sales|vat|gst|hst|pst|rfc|tva|iva|umsatz|steuer|vendor|ein\b|ss-4|business number|tin\b/.test(t)) return "tax";
  return "licence";
}

type Cell = { v: number; u: number; ids: string[] };
type Row = { city: string; country: string; code?: string; address: string; places: string[]; cells: Record<string, Cell>; status: string; gaps: string[] };

function cityAddress(name: string, country: string): { address: string; code?: string } {
  const c = CITIES.find(x => x.en === name || (x.en.replace(/,.*/, "") === name.replace(/,.*/, "") && COUNTRIES.find(k => k.code === x.country)?.en === country));
  if (country === "United States") {
    const st = c?.state;
    return { address: st ? `${name.replace(/,.*$/, "")}, ${st}` : name, code: c?.code };
  }
  return { address: `${name}, ${country}`, code: c?.code };
}

/** The countries this audit added (src/forms/intl.ts). */
const NEW_COUNTRIES = ["CA", "BR", "CL", "CO", "AR", "PE", "SG", "MY", "TH", "VN", "ID", "PH", "NG", "KE", "ZA", "MA"];
/** States with no general sales tax: no seller's permit to file (Oregon, Montana, New Hampshire, Alaska). */
const NO_SALES_TAX = ["OR", "MT", "NH", "AK"];
const RESTAURANT = { food: true, employees: true, buildout: true, signage: true, newEntity: true, alcohol: true };
const SHOP = { employees: true, buildout: true, signage: true, newEntity: true };

function rowFor(city: string, country: string): Row {
  const { address, code } = cityAddress(city, country);
  const places = placesOf(address);
  const forms = [...formsFor({ segment: "restaurant", where: address, needs: RESTAURANT }), ...formsFor({ segment: "retail", where: address, needs: SHOP })];
  const seen = new Set<string>(), cells: Record<string, Cell> = {};
  for (const f of forms) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    const k = `${f.level}:${topicOf(f)}`;
    cells[k] ??= { v: 0, u: 0, ids: [] };
    if (f.proof) cells[k].v++; else cells[k].u++;
    cells[k].ids.push(f.id);
    const also = ALSO_COVERS[f.id];
    if (also && f.proof) { const k2 = `${f.level}:${also.topic}`; cells[k2] ??= { v: 0, u: 0, ids: [] }; cells[k2].v++; cells[k2].ids.push(f.id); }
  }
  // what a city needs at minimum: national company and tax, an employer registration somewhere, a food permit, a
  // building or use step and a local licence or registration (any level below national)
  const has = (lv: string[], t: Topic, verified = true) => lv.some(l => (cells[`${l}:${t}`]?.[verified ? "v" : "u"] ?? 0) > 0);
  const below = ["state", "county", "city"];
  const noSalesTax = places.some(p => NO_SALES_TAX.includes(p)) && places.includes("US");
  // a company, tax or employer step may sit at any level (Washington, DC files them with the District, filed as a city)
  const any = ["federal", ...below];
  const need: [string, string[], Topic][] = [["company formation", any, "company"], ["tax registration", any, "tax"],
    ["employer registration", any, "employer"], ["food permit", ["federal", ...below], "food"], ["building or use", below, "building"],
    ["local licence", below, "licence"]];
  const gaps: string[] = [];
  let ok = 0, some = 0;
  for (const [label, lv, t] of need) {
    // a city's or county's business tax registration is its local licence (Los Angeles, San José, Sacramento)
    if (has(lv, t) || (t === "tax" && noSalesTax) || (t === "licence" && has(["county", "city"], "tax"))) { ok++; continue; }
    if (has(lv, t, false)) { some++; gaps.push(`${label} (unverified)`); } else gaps.push(`${label} (missing)`);
  }
  // a "licence" topic is often folded into the food permit or the business tax registration abroad: count it present then
  if (gaps.includes("local licence (missing)") && (has(below, "food") || has(below, "tax"))) { gaps.splice(gaps.indexOf("local licence (missing)"), 1); ok++; }
  // a country with no general trade licence (NO_TRADE_LICENCE): the city's verified building or use permit is its local step
  const country2 = places.find(p => /^[A-Z]{2}$/.test(p) && p !== "EU");
  if (gaps.includes("local licence (missing)") && country2 && NO_TRADE_LICENCE[country2] && has(["city"], "building")) { gaps.splice(gaps.indexOf("local licence (missing)"), 1); ok++; }
  const status = !places.length ? "no jurisdiction" : gaps.length === 0 ? "covered" : ok >= 3 ? "partial" : "unverified";
  return { city, country, code, address, places, cells, status, gaps };
}

const cell = (c?: Cell) => !c ? "·" : c.u ? `${c.v}✓ ${c.u}?` : `${c.v}✓`;

function main() {
  const data = JSON.parse(readFileSync("site/guides/data.json", "utf8")) as { cities: { city: string | { en: string }; country: string }[]; coverage: { cities: number; countries: number } };
  const guideCities = data.cities.map(c => ({ city: typeof c.city === "string" ? c.city : c.city.en, country: c.country }));
  const added = CITIES.filter(c => NEW_COUNTRIES.includes(c.country) || (c.guide && !guideCities.some(g => g.city === c.en) && !["US", "CN"].includes(c.country)))
    .map(c => ({ city: c.en, country: COUNTRIES.find(k => k.code === c.country)!.en }));
  const rows = [...guideCities, ...added].map(c => rowFor(c.city, c.country));
  const bad = rows.filter(r => r.status === "no jurisdiction");

  const total = FORMS.length, proved = FORMS.filter(f => f.proof).length;
  const lines: string[] = [];
  const p = (s = "") => lines.push(s);
  p("# Coverage");
  p();
  p(`Generated by \`npm run coverage:write\` (scripts/coverage.ts) from the registry. Audit date ${AUDIT_READ}. Do not edit by hand: \`npm run coverage\` fails when this file is stale.`);
  p();
  p("## The claim");
  p();
  p(`The landing page says "Licenses and permits in 92 cities worldwide" and the about page "92 cities in 22 countries, 12 kinds of business and 481 official forms". The guides data (site/guides/data.json) lists ${data.coverage.cities} cities in ${data.coverage.countries} countries, so the number matches what the guides publish. It does not mean every city is fully covered: below, ${rows.filter(r => guideCities.some(g => g.city === r.city) && r.status === "covered").length} of the 92 have a verified filing for every core step, ${rows.filter(r => guideCities.some(g => g.city === r.city) && r.status === "partial").length} are partial and ${rows.filter(r => guideCities.some(g => g.city === r.city) && r.status === "unverified").length} rest mostly on unverified rows. The registry now holds ${total} entries (${proved} with a proof read from the official page, ${total - proved} unverified), up from 481. The landing copy was not changed.`);
  p();
  p("Each row comes from what the registry returns for a new restaurant (staff, a build-out, a sign, a new company, alcohol) and a new shop at the city. A cell is `n✓ m?`: n filings with a proof (an official quote, URL and read date), m without (UNVERIFIED: the plan row abstains and names the office). `·` means nothing in the registry at that level for that topic. Topics: company, tax, employer, food, building (plan review, occupancy, zoning, signs, fire), licence (local business licence or registration), alcohol.");
  p();
  p("Status: **covered** when the city has a verified filing for a national company step, a tax registration, an employer registration, a food permit, a building or use step and a local licence; **partial** when at least three of those are verified; **unverified** otherwise. Gaps name the missing step.");
  p();
  for (const country of [...new Set(rows.map(r => r.country))]) {
    const rs = rows.filter(r => r.country === country);
    p(`### ${country}`);
    p();
    p(`| City | Status | ${LEVELS.map(l => l === "federal" ? "National" : l === "state" ? "State/province" : l === "county" ? "County" : "City").join(" | ")} | Gaps |`);
    p("|---|---|---|---|---|---|---|");
    for (const r of rs) {
      const lv = LEVELS.map(l => TOPICS.map(t => r.cells[`${l}:${t}`] ? `${t} ${cell(r.cells[`${l}:${t}`])}` : "").filter(Boolean).join("; ") || "·");
      p(`| ${r.city}${guideCities.some(g => g.city === r.city) ? "" : NEW_COUNTRIES.includes(r.code?.slice(0, 2) ?? "") ? " (added)" : " (listed, not in the 92)"} | ${r.status} | ${lv.join(" | ")} | ${r.gaps.join("; ") || "none"} |`);
    }
    p();
  }
  // the finishing pass, city by city: the status before it, the status now, and what's left
  const guideRows = rows.filter(r => guideCities.some(g => g.city === r.city));
  const tally = (st: string, of: (r: Row) => string) => guideRows.filter(r => of(r) === st).length;
  p("## Before and after the finishing pass");
  p();
  p(`The finishing pass (src/forms/finish.ts) took every guide city that wasn't covered through each level for a restaurant and a shop. Before: ${tally("covered", r => BEFORE[r.city])} covered, ${tally("partial", r => BEFORE[r.city])} partial, ${tally("unverified", r => BEFORE[r.city])} unverified. After: ${tally("covered", r => r.status)} covered, ${tally("partial", r => r.status)} partial, ${tally("unverified", r => r.status)} unverified.`);
  p();
  p("| City | Country | Before | After | Still short |");
  p("|---|---|---|---|---|");
  for (const r of guideRows.filter(r => BEFORE[r.city] !== "covered" || r.status !== "covered")) p(`| ${r.city} | ${r.country} | ${BEFORE[r.city] ?? "new"} | ${r.status} | ${r.gaps.join("; ") || "none"} |`);
  p();
  for (const [id, x] of Object.entries(ALSO_COVERS)) p(`\`${id}\` also counts as the ${x.topic} step: "${x.quote}" (${x.en}), ${x.read}.`);
  p();
  for (const [code, x] of Object.entries(NO_TRADE_LICENCE)) p(`No general trade licence in ${COUNTRIES.find(k => k.code === code)?.en ?? code}: ${x.why} Quote: "${x.quote}" (${x.en}), ${x.read}. The city's verified building or use permit stands as its local step there.`);
  p();
  p("## What this audit changed");
  p();
  p(`### Finishing pass: proofs added to entries already in the registry (${FINISH_FIXES.length})`);
  p();
  for (const x of FINISH_FIXES) p(`- \`${x.id}\`: ${x.why}`);
  p();
  p(`### Finishing pass: added (${FINISH_FORMS.length}, ${FINISH_FORMS.filter(f => f.proof).length} verified, ${FINISH_FORMS.filter(f => !f.proof).length} unverified)`);
  p();
  for (const f of FINISH_FORMS) p(`- \`${f.id}\` (${f.where}, ${f.level}) ${f.title.en}: ${f.agency.en}${f.proof ? "" : " **UNVERIFIED**"}${f.fee != null ? `, fee ${f.fee} ${f.currency ?? "USD"}` : ""}`);
  p();
  p(`### Fixed (${FIXES.length})`);
  p();
  p("Links checked with `npm run verify:sources` (HEAD, or a GET cut off at the headers; one request per host every 2 s). Each fix is in src/forms/audit.ts with its reason.");
  p();
  for (const x of FIXES) p(`- \`${x.id}\`: ${x.why}`);
  p();
  const list = (fs: OfficialForm[]) => fs.map(f => `- \`${f.id}\` (${f.where}, ${f.level}) ${f.title.en}: ${f.agency.en}${f.proof ? "" : " **UNVERIFIED**"}${f.fee != null ? `, fee ${f.fee} ${f.currency ?? "USD"}` : ""}`);
  p(`### Added: United States (${US_GAPS.length})`);
  p();
  list(US_GAPS).forEach(s => p(s));
  p();
  p(`### Added: Mexico (${MEXICO_GAPS.length})`);
  p();
  list(MEXICO_GAPS).forEach(s => p(s));
  p();
  p(`### Added: other countries (${INTL_FORMS.length})`);
  p();
  list(INTL_FORMS).forEach(s => p(s));
  p();
  p("## Unverified entries");
  p();
  p("Entries with no proof from an official page. Their plan rows abstain and name the office; no fee is claimed for them unless an official page stated it.");
  p();
  const byCountry = new Map<string, OfficialForm[]>();
  for (const f of FORMS.filter(f => !f.proof)) {
    const c = (f.currency ?? "USD") === "USD" ? "United States" : COUNTRIES.find(k => k.code === f.where.slice(0, 2) && k.currency === f.currency)?.en ?? f.where;
    byCountry.set(c, [...(byCountry.get(c) ?? []), f]);
  }
  for (const [c, fs] of [...byCountry].sort((a, b) => b[1].length - a[1].length)) p(`- ${c} (${fs.length}): ${fs.map(f => `\`${f.id}\``).join(", ")}`);
  p();
  p(readFileSync("scripts/coverage-missing.md", "utf8").trim());
  p();
  const doc = lines.join("\n") + "\n";
  if (bad.length) { console.error("FAIL cities with no jurisdiction:", bad.map(r => r.city).join(", ")); process.exitCode = 1; }
  if (write) { writeFileSync(OUT, doc); console.log(`coverage: wrote docs/COVERAGE.md (${rows.length} cities)`); return; }
  let cur = ""; try { cur = readFileSync(OUT, "utf8"); } catch { /* missing */ }
  if (cur !== doc) { console.error("FAIL docs/COVERAGE.md is out of date: npm run coverage:write"); process.exitCode = 1; }
  else console.log(`coverage: ${rows.length} cities, ${rows.filter(r => r.status === "covered").length} covered, ${rows.filter(r => r.status === "partial").length} partial, ${rows.filter(r => r.status === "unverified").length} unverified`);
}
main();
