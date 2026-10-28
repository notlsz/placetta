// npm run test:registry: the registry's own integrity, entry by entry (src/forms/registry.ts FORMS and the kind facts).
//   - every entry has an agency (EN and ZH), a level, a title, an http(s) source link, and a currency that matches its
//     place (a US jurisdiction in USD, any other in its own);
//   - an entry with a proof carries the URL read and the day it was read (YYYY-MM-DD, not in the future); an entry
//     without one is UNVERIFIED and is listed so in docs/COVERAGE.md (its plan row abstains);
//   - no two entries share an id, and no two are the same filing (same place, form and agency);
//   - every entry's `where` resolves to a jurisdiction the library knows: "US", "EU", a country, a US state, a US
//     county, a city, or a city's state or province;
//   - the source audit (src/forms/audit.ts) found every entry it fixes;
//   - the entries this audit added carry no bullet or dot separators and no leading zeros in their copy.
import { readFileSync } from "node:fs";
import { AUDIT_MISSING, FORMS, formsFor, placesOf } from "../src/forms/registry";
import { KIND_FACTS } from "../src/forms/kinds";
import { CITIES, COUNTRIES, STATES, EU_MEMBERS } from "../src/forms/world";
import { COUNTIES } from "../src/forms/usplace";
import { STATES as US_STATES } from "../src/plan/line";
import { US_GAPS } from "../src/forms/us-gaps";
import { INTL_FORMS } from "../src/forms/intl";
import { MEXICO_GAPS } from "../src/forms/mexico";
import { FINISH_FORMS } from "../src/forms/finish";
import { BROWSER_READ, READ_VER, VERIFY_BLOCKED, VERIFY_FIXES, VERIFY_FORMS } from "../src/forms/verify";

let failed = 0;
const fail = (m: string) => { failed++; console.error("FAIL", m); };
const today = new Date().toISOString().slice(0, 10);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LEVELS = new Set(["federal", "state", "county", "city"]);

const US_CODES = new Set<string>(["US", "NY", "CA", "TX", ...STATES.map(s => s.code), ...Object.keys(COUNTIES),
  ...CITIES.filter(c => c.country === "US").map(c => c.code)]);
// county-like codes the registry files under that aren't in COUNTIES (the Las Vegas split, unincorporated LA County)
for (const c of ["NYC", "LA", "HOU", "LACU", "CLK", "LVC", "SNHD", "LV"]) US_CODES.add(c);
// every state and DC: the company filings (src/forms/entities.ts) are filed under each state's own code
for (const [c] of US_STATES) US_CODES.add(c);
const ABROAD = new Set<string>(["EU", ...EU_MEMBERS, ...COUNTRIES.filter(c => c.code !== "US").map(c => c.code),
  ...CITIES.filter(c => c.country !== "US").flatMap(c => [c.code, ...(c.state ? [c.state] : [])])]);

const ids = new Map<string, number>();
const same = new Map<string, string>();
let verified = 0, unverified = 0;
for (const f of FORMS) {
  ids.set(f.id, (ids.get(f.id) ?? 0) + 1);
  const k = `${f.where}|${f.form}|${f.agency.en}`;
  if (same.has(k) && same.get(k) !== f.id) fail(`${f.id} repeats ${same.get(k)} (same place, form and agency)`);
  same.set(k, f.id);
  if (!f.agency?.en?.trim() || !f.agency?.zh?.trim()) fail(`${f.id}: agency missing in EN or ZH`);
  if (!f.title?.en?.trim() || !f.title?.zh?.trim()) fail(`${f.id}: title missing in EN or ZH`);
  if (!LEVELS.has(f.level)) fail(`${f.id}: level "${f.level}"`);
  for (const [k2, u] of [["url", f.url], ["info", f.info], ["pdf", f.pdf]] as const) if (u !== undefined && !/^https?:\/\/[^\s]+$/.test(u)) fail(`${f.id}: ${k2} is not a link (${u})`);
  if (!f.url && !f.info) fail(`${f.id}: no source link`);
  const usd = !f.currency || f.currency === "USD";
  const us = US_CODES.has(f.where), abroad = ABROAD.has(f.where);
  if (!us && !abroad) fail(`${f.id}: where "${f.where}" resolves to no jurisdiction`);
  if (usd && !us) fail(`${f.id}: priced in USD but filed under "${f.where}", which isn't a US jurisdiction`);
  if (!usd && !abroad) fail(`${f.id}: priced in ${f.currency} but filed under "${f.where}", which isn't a place abroad`);
  if (f.proof) {
    verified++;
    if (!/^https?:\/\//.test(f.proof.read)) fail(`${f.id}: proof has no URL read`);
    if (!DAY.test(f.proof.checked) || f.proof.checked > today) fail(`${f.id}: proof read date "${f.proof.checked}"`);
    if (!f.proof.quote?.trim()) fail(`${f.id}: proof has no quote`);
  } else unverified++;
  if (f.fee != null && (typeof f.fee !== "number" || f.fee < 0)) fail(`${f.id}: fee ${f.fee}`);
}
for (const [id, n] of ids) if (n > 1) fail(`id ${id} is used ${n} times`);
for (const k of KIND_FACTS) {
  if (!DAY.test(k.proof.checked) || !/^https?:\/\//.test(k.proof.read)) fail(`kind fact ${k.id}: proof read date or URL`);
}
if (AUDIT_MISSING.length) fail(`the audit fixes entries the registry doesn't have: ${AUDIT_MISSING.join(", ")}`);

// the entries this audit added: bilingual copy, no bullet or dot separators, no leading zeros
for (const f of [...US_GAPS, ...INTL_FORMS, ...MEXICO_GAPS, ...FINISH_FORMS, ...VERIFY_FORMS]) {
  for (const b of [f.title, f.how, f.agency, f.plain, f.feeNote, f.takes, f.renews, f.specialist].filter(Boolean)) {
    for (const s of [b!.en, b!.zh]) {
      if (/[·•∙]/.test(s)) fail(`${f.id}: a dot separator in "${s.slice(0, 60)}"`);
      if (/(^|[\s(（])0\d\b/.test(s)) fail(`${f.id}: a leading zero in "${s.slice(0, 60)}"`);
    }
    if (!b!.zh.trim()) fail(`${f.id}: no Chinese copy`);
  }
}

// the verification pass (src/forms/verify.ts): every proof it adds was read on the day of the pass (or, for the pages
// read in a browser, on BROWSER_READ), is under 25 words and comes from an official page; every entry still unverified
// names what blocked it; no blocked entry has a proof
for (const x of VERIFY_FIXES) {
  if (!x.proof) continue;
  if (x.proof.checked !== READ_VER && x.proof.checked !== BROWSER_READ) fail(`${x.id}: verification proof read date ${x.proof.checked}`);
  if (x.proof.quote.trim().split(/\s+/).length >= 25) fail(`${x.id}: verification quote has 25 words or more`);
}
for (const f of FORMS.filter(f => !f.proof)) if (!VERIFY_BLOCKED[f.id]) fail(`${f.id} is unverified but src/forms/verify.ts VERIFY_BLOCKED doesn't say what blocked it`);
for (const id of Object.keys(VERIFY_BLOCKED)) { const f = FORMS.find(x => x.id === id); if (!f) fail(`VERIFY_BLOCKED names ${id}, which the registry doesn't have`); else if (f.proof) fail(`${id} has a proof but VERIFY_BLOCKED still lists it`); }

// the unverified entries are listed as such in docs/COVERAGE.md
const cov = readFileSync("docs/COVERAGE.md", "utf8");
for (const f of FORMS.filter(f => !f.proof)) if (!cov.includes(`\`${f.id}\``)) fail(`${f.id} is unverified but docs/COVERAGE.md doesn't list it`);

// places: the new countries resolve, and keep their forms apart from the US states that share their codes
const at = (where: string) => placesOf(where);
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
eq(at("100 Queen St W, Toronto, ON M5H 2N2, Canada").slice(0, 3), ["CA", "CA-ON", "CA-TOR"], "Toronto resolves to Canada, Ontario and Toronto");
eq(at("Kuala Lumpur, Malaysia").includes("MY-KUL"), true, "Kuala Lumpur resolves");
eq(at("Bogotá, Colombia")[0], "CO", "Bogotá is Colombia");
eq(at("Casablanca, Morocco")[0], "MA", "Casablanca is Morocco");
const toronto = formsFor({ segment: "restaurant", where: "100 Queen St W, Toronto, ON M5H 2N2, Canada", needs: { food: true, employees: true, newEntity: true } });
eq(toronto.some(f => f.currency === "USD"), false, "no California (USD) form in a Toronto plan");
eq(toronto.some(f => f.id === "ca-tor-eating"), true, "Toronto's eating establishment licence is in its plan");
const la = formsFor({ segment: "restaurant", where: "727 N Broadway, Los Angeles, CA 90012", needs: { food: true, employees: true } });
eq(la.some(f => f.currency === "CAD"), false, "no Canadian form in a Los Angeles plan");
eq(la.some(f => f.id === "ca-workers-comp"), true, "California's workers' comp is in a Los Angeles plan with staff");
const boston = formsFor({ segment: "retail", where: "60 Beach St, Boston, MA 02111", needs: { employees: true } });
eq(boston.some(f => f.currency === "MAD"), false, "no Moroccan form in a Boston plan");
const casa = formsFor({ segment: "retail", where: "Casablanca, Morocco", needs: { employees: true } });
eq(casa.some(f => !f.currency || f.currency === "USD"), false, "no Massachusetts form in a Casablanca plan");

console.log(`registry: ${FORMS.length} entries (${verified} with a proof and its read date, ${unverified} unverified), ${KIND_FACTS.length} kind facts${failed ? `, ${failed} failures` : ", all checks pass"}`);
if (failed) process.exit(1);
