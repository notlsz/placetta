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
import { LIFECYCLE, READ_LIFE, type LifeItem } from "../src/forms/lifecycle";
import { KIND_FACTS } from "../src/forms/kinds";
import { READ_VER, VERIFY_BLOCKED, VERIFY_FIXES, VERIFY_FORMS, VERIFY_REFERENCE } from "../src/forms/verify";
import { previewPlan } from "../src/plan/preview";
import { proofCurrent } from "../src/plan/ask";

/* ------------------------------------------------------------------ lifecycle and product compliance */

const STAGE: Record<LifeItem["stage"], string> = { start: "A. Start", open: "B. Open", employ: "C. Employ", sell: "D. Sell products", online: "E. Online and retailers" };
const KIND: Record<LifeItem["kind"], string> = { filing: "filing", checklist: "label or design checklist", advisory: "an agency decides" };
const TRIGGER: Record<string, string> = { newEntity: "no company yet", foreignEntity: "formed abroad", employees: "has employees", manufactures: "manufactures", imports: "imports",
  upholstered: "sells upholstered", children: "children's products", online: "sells online", food: "food", packagedFood: "packaged food", cosmetics: "cosmetics", furniture: "furniture",
  clothingStorage: "dressers and chests", textile: "textiles", consumer: "consumer products", premises: "a store open to the public" };
const md = (s: string) => s.replace(/\|/g, "\\|");
/** An item's proof as the plan uses it: its registry filing's, its kinds fact's, or its own; none is UNVERIFIED. */
function lifeProof(i: LifeItem): { url: string; quote?: string; read?: string; via: string } {
  const f = (i.refs ?? []).map(id => FORMS.find(x => x.id === id)).find(Boolean);
  const k = i.fact ? KIND_FACTS.find(x => x.id === i.fact) : undefined;
  const pr = f?.proof ? { url: f.proof.read, quote: f.proof.quote, via: `registry \`${f.id}\`` } : k ? { url: k.proof.read, quote: k.proof.quote, via: `kinds fact \`${k.id}\`` } : i.source ? { url: i.source.url, quote: i.source.quote, via: "own" } : { url: i.url ?? "", via: "none" };
  const read = pr.quote ? proofCurrent({ read: pr.url, quote: pr.quote }, READ_LIFE) : undefined;
  return read ? { ...pr, read } : { url: pr.url, via: pr.via };
}
const triggers = (i: LifeItem) => [...(i.needs ?? []).map(k => TRIGGER[k] ?? k), ...(i.any?.length ? [`${i.any.map(k => TRIGGER[k] ?? k).join(" or ")}`] : []), ...(i.unless ?? []).map(k => `not ${TRIGGER[k] ?? k}`),
  ...(i.segments ? [i.segments.join("/")] : []), ...(i.refs?.length ? [`where the registry files ${i.refs.map(r => `\`${r}\``).join(", ")}${i.refsLike ? " (or the state's own)" : ""}`] : [])].join("; ") || "everyone";
/** The customer types the matrix walks, each as a plan in one US city with the intake's answers. */
const CUSTOMERS: { type: string; what: string; where: string; o: Record<string, boolean> }[] = [
  { type: "F&B (restaurant)", what: "Restaurant", where: "Los Angeles, CA", o: {} },
  { type: "Tea and coffee shop", what: "Milk tea shop", where: "New York, NY", o: {} },
  { type: "Packaged food maker", what: "Packaged snack manufacturer", where: "Los Angeles, CA", o: { manufactures: true, online: true } },
  { type: "Retail store", what: "Gift shop", where: "San Francisco, CA", o: { manufactures: false, imports: false } },
  { type: "Furniture manufacturer", what: "Upholstered furniture manufacturer", where: "San Francisco, CA", o: { manufactures: true } },
  { type: "Furniture importer", what: "Furniture importer", where: "Los Angeles, CA", o: { upholstered: true } },
  { type: "Furniture retailer", what: "Furniture showroom", where: "San Jose, CA", o: { manufactures: false, imports: false } },
  { type: "Cosmetics and personal care", what: "Cosmetics brand", where: "Austin, TX", o: { manufactures: true, online: true } },
  { type: "Consumer products", what: "Home goods brand", where: "Miami, FL", o: { manufactures: true, children: false } },
  { type: "E-commerce seller", what: "Consumer products e-commerce seller", where: "Miami, FL", o: { online: true } },
  { type: "Importer", what: "Housewares importer", where: "Houston, TX", o: { imports: true } },
  { type: "Cosmetics brand into the UK", what: "Cosmetics brand", where: "London, UK", o: {} },
];
function lifecycleSection(p: (s?: string) => void) {
  p("## Lifecycle and product compliance");
  p();
  p(`What a business needs beyond its permits to open, from forming the company to selling online (src/forms/lifecycle.ts, read ${READ_LIFE}). Three kinds, kept apart: a **filing** Placetta prepares and files (or hands to the professional who must); a **label or design checklist** Placetta lists with where to verify it, and never certifies; and an item **an agency decides** (OEHHA on Proposition 65, CBP on a tariff classification, a city's wage ordinance, the bank on an account), where Placetta cites the rule and tracks it. The plan shows them grouped as "You may also need these", "Because you manufacture, your products may also need labels", the store and staff, and what an agency decides, each line with a numbered source footnote (src/plan/also.ts). The intake asks the triggers one at a time, skipping any that don't apply (src/plan/intake.ts).`);
  p();
  const all = LIFECYCLE.map(i => ({ i, pr: lifeProof(i) }));
  const stages = Object.keys(STAGE) as LifeItem["stage"][];
  p("| Stage | Items | Verified | Unverified | Filings | Checklists | Agency decides |");
  p("|---|---|---|---|---|---|---|");
  for (const st of stages) {
    const xs = all.filter(x => x.i.stage === st);
    p(`| ${STAGE[st]} | ${xs.length} | ${xs.filter(x => x.pr.read).length} | ${xs.filter(x => !x.pr.read).length} | ${xs.filter(x => x.i.kind === "filing").length} | ${xs.filter(x => x.i.kind === "checklist").length} | ${xs.filter(x => x.i.kind === "advisory").length} |`);
  }
  p(`| Total | ${all.length} | ${all.filter(x => x.pr.read).length} | ${all.filter(x => !x.pr.read).length} | ${all.filter(x => x.i.kind === "filing").length} | ${all.filter(x => x.i.kind === "checklist").length} | ${all.filter(x => x.i.kind === "advisory").length} |`);
  p();
  p("### By customer type");
  p();
  p("Each row is the plan for that business in one city, with the intake's answers; a cell lists the lines the plan states at that stage (`?` marks one whose official page couldn't be read: it names the office and states no fee).");
  p();
  p(`| Customer | Place | ${stages.map(st => STAGE[st]).join(" | ")} |`);
  p(`|---|---|${stages.map(() => "---").join("|")}|`);
  for (const c of CUSTOMERS) {
    const plan = previewPlan(c.what, c.where, undefined, { today: READ_LIFE, ...c.o });
    p(`| ${c.type} | ${c.where} | ${stages.map(st => plan.also.filter(a => a.stage === st).map(a => `\`${a.id}\`${a.verified ? "" : "?"}`).join(" ") || "·").join(" | ")} |`);
  }
  p();
  p("### Every item");
  p();
  p("| Stage | Item | Kind | Trigger | Level and agency | Form or portal | Fee | Renewal | Source | Why | 为什么 |");
  p("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const { i, pr } of all) {
    const f = (i.refs ?? []).map(id => FORMS.find(x => x.id === id)).find(Boolean);
    const fee = !pr.read ? "not stated (UNVERIFIED)" : i.fee != null ? `$${i.fee}` : f && f.fee != null && (i.refs ?? []).length === 1 ? `$${f.fee}` : "not published";
    const src = pr.read ? `${pr.url} "${md(pr.quote!)}" (read ${pr.read}, ${pr.via})` : `UNVERIFIED: ${pr.url || "no page"}`;
    p(`| ${STAGE[i.stage]} | \`${i.id}\` ${md(i.title.en)} | ${KIND[i.kind]} | ${md(triggers(i))} | ${i.level}, ${md(i.agency.en)} | ${md(i.form ?? f?.form ?? "·")} | ${fee} | ${md(i.renews?.en ?? f?.renews?.en ?? "·")} | ${src} | ${md(i.why.en)} | ${md(i.why.zh)} |`);
  }
  p();
}

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
  // a city that is already a guide city is listed once, with the guide cities
  const added = CITIES.filter(c => !guideCities.some(g => g.city === c.en) && (NEW_COUNTRIES.includes(c.country) || (c.guide && !["US", "CN"].includes(c.country))))
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
  p(`The landing page says "Licenses and permits in 92 cities worldwide" and the about page "92 cities in 22 countries, 12 kinds of business and 481 official forms". The guides data (site/guides/data.json) lists ${data.coverage.cities} cities in ${data.coverage.countries} countries, so the number matches what the guides publish. It does not mean every city is fully covered: below, ${rows.filter(r => guideCities.some(g => g.city === r.city) && r.status === "covered").length} of the ${guideCities.length} have a verified filing for every core step, ${rows.filter(r => guideCities.some(g => g.city === r.city) && r.status === "partial").length} are partial and ${rows.filter(r => guideCities.some(g => g.city === r.city) && r.status === "unverified").length} rest mostly on unverified rows. The registry now holds ${total} entries (${proved} with a proof read from the official page, ${total - proved} unverified), up from 481. The landing copy was not changed.`);
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
      p(`| ${r.city}${guideCities.some(g => g.city === r.city) ? "" : NEW_COUNTRIES.includes(r.code?.slice(0, 2) ?? "") ? " (added)" : " (listed, not a guide city)"} | ${r.status} | ${lv.join(" | ")} | ${r.gaps.join("; ") || "none"} |`);
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
  // the verification pass of 2026-10-23 (src/forms/verify.ts): before it the registry held 683 entries, 568 verified and
  // 115 unverified (54 of them in the United States)
  const usd = (f: OfficialForm) => (f.currency ?? "USD") === "USD";
  p(`### Verification pass (${READ_VER}): proofs added and links fixed (${VERIFY_FIXES.length})`);
  p();
  p(`Every UNVERIFIED row taken back to the government's own page, the beachhead metros first. Before: 683 entries, 568 verified, 115 unverified (United States: 54 unverified). After: ${total} entries, ${proved} verified, ${total - proved} unverified (United States: ${FORMS.filter(f => usd(f) && !f.proof).length} unverified of ${FORMS.filter(usd).length}). Each quote was matched on the page as fetched that day (scripts/eval/proof-log.json). Made library references, no longer added to plans: ${VERIFY_REFERENCE.map(id => `\`${id}\``).join(", ")}.`);
  p();
  for (const x of VERIFY_FIXES) p(`- \`${x.id}\`: ${x.why}`);
  p();
  p(`### Verification pass: added (${VERIFY_FORMS.length}, ${VERIFY_FORMS.filter(f => f.proof).length} verified)`);
  p();
  for (const f of VERIFY_FORMS) p(`- \`${f.id}\` (${f.where}, ${f.level}) ${f.title.en}: ${f.agency.en}${f.proof ? "" : " **UNVERIFIED**"}`);
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
  lifecycleSection(p);
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
  p(`What blocked each one when it was read again on ${READ_VER} (src/forms/verify.ts):`);
  p();
  for (const f of FORMS.filter(f => !f.proof)) p(`- \`${f.id}\`: ${VERIFY_BLOCKED[f.id] ?? "not read again"}`);
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
