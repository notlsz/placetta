// Realistic test answers for every line of a form, for the round-trip check (scripts/forms-roundtrip.mts). One sample
// business, Lotus Tea House LLC, opening a tea shop in the form's own city, so addresses pass each agency's address
// rules. Two passes: "a" takes each question's first option and the plain answers; "b" its last option and a second
// set (another owner, a longer description), so both ends of every checkbox group are exercised. Lines for an SSN or
// ITIN get "By hand" in pass a and a made-up SSN in pass b: neither may ever reach the PDF.
// scripts/fixtures/forms-samples.json overrides any answer for one form: { "<form id>": { "<line id>": "value" or ["pass a", "pass b"] } }.
import { readFileSync } from "node:fs";
import type { OfficialForm, FormField } from "../src/forms/registry.ts";

export type Pass = "a" | "b";
type Place = { street: string; suite: string; city: string; st: string; zip: string; county: string };
const PLACES: Record<string, Place> = {
  US: { street: "1250 N First St", suite: "Suite 100", city: "San Jose", st: "CA", zip: "95112", county: "Santa Clara" },
  CA: { street: "1250 N First St", suite: "Suite 100", city: "San Jose", st: "CA", zip: "95112", county: "Santa Clara" },
  SJ: { street: "1250 N First St", suite: "Suite 100", city: "San Jose", st: "CA", zip: "95112", county: "Santa Clara" },
  SCC: { street: "1250 N First St", suite: "Suite 100", city: "San Jose", st: "CA", zip: "95112", county: "Santa Clara" },
  SF: { street: "845 Clay St", suite: "Unit 2", city: "San Francisco", st: "CA", zip: "94108", county: "San Francisco" },
  OAK: { street: "388 9th St", suite: "Suite 110", city: "Oakland", st: "CA", zip: "94607", county: "Alameda" },
  SAC: { street: "1730 Broadway", suite: "Suite 5", city: "Sacramento", st: "CA", zip: "95818", county: "Sacramento" },
  LA: { street: "727 N Broadway", suite: "Suite 103", city: "Los Angeles", st: "CA", zip: "90012", county: "Los Angeles" },
  LAC: { street: "140 W Valley Blvd", suite: "Suite 208", city: "San Gabriel", st: "CA", zip: "91776", county: "Los Angeles" },
  IRV: { street: "4250 Barranca Pkwy", suite: "Suite C", city: "Irvine", st: "CA", zip: "92604", county: "Orange" },
  SDG: { street: "4646 Convoy St", suite: "Suite 102", city: "San Diego", st: "CA", zip: "92111", county: "San Diego" },
  NY: { street: "136-20 Roosevelt Ave", suite: "Store 12", city: "Flushing", st: "NY", zip: "11354", county: "Queens" },
  NYC: { street: "136-20 Roosevelt Ave", suite: "Store 12", city: "Flushing", st: "NY", zip: "11354", county: "Queens" },
  TX: { street: "9889 Bellaire Blvd", suite: "Suite 110", city: "Houston", st: "TX", zip: "77036", county: "Harris" },
  HOU: { street: "9889 Bellaire Blvd", suite: "Suite 110", city: "Houston", st: "TX", zip: "77036", county: "Harris" },
  DAL: { street: "2625 Old Denton Rd", suite: "Suite 300", city: "Carrollton", st: "TX", zip: "75007", county: "Dallas" },
  AUS: { street: "6929 Airport Blvd", suite: "Suite 150", city: "Austin", st: "TX", zip: "78752", county: "Travis" },
  SAT: { street: "8338 Fredericksburg Rd", suite: "Suite 101", city: "San Antonio", st: "TX", zip: "78229", county: "Bexar" },
  FTW: { street: "4400 Camp Bowie Blvd", suite: "Suite 102", city: "Fort Worth", st: "TX", zip: "76107", county: "Tarrant" },
  PLA: { street: "2101 Coit Rd", suite: "Suite 120", city: "Plano", st: "TX", zip: "75075", county: "Collin" },
  AZ: { street: "668 N 44th St", suite: "Suite 108", city: "Phoenix", st: "AZ", zip: "85008", county: "Maricopa" },
  PHX: { street: "668 N 44th St", suite: "Suite 108", city: "Phoenix", st: "AZ", zip: "85008", county: "Maricopa" },
  IL: { street: "2133 S China Pl", suite: "Unit 4", city: "Chicago", st: "IL", zip: "60616", county: "Cook" },
  CHI: { street: "2133 S China Pl", suite: "Unit 4", city: "Chicago", st: "IL", zip: "60616", county: "Cook" },
  WA: { street: "601 S King St", suite: "Suite 102", city: "Seattle", st: "WA", zip: "98104", county: "King" },
  SEA: { street: "601 S King St", suite: "Suite 102", city: "Seattle", st: "WA", zip: "98104", county: "King" },
  MA: { street: "18 Beach St", suite: "Unit 2", city: "Boston", st: "MA", zip: "02111", county: "Suffolk" },
  BOS: { street: "18 Beach St", suite: "Unit 2", city: "Boston", st: "MA", zip: "02111", county: "Suffolk" },
  FL: { street: "3001 NW 2nd Ave", suite: "Suite 4", city: "Miami", st: "FL", zip: "33127", county: "Miami-Dade" },
  MIA: { street: "3001 NW 2nd Ave", suite: "Suite 4", city: "Miami", st: "FL", zip: "33127", county: "Miami-Dade" },
  TPA: { street: "1600 E 7th Ave", suite: "Suite 103", city: "Tampa", st: "FL", zip: "33605", county: "Hillsborough" },
  ORL: { street: "1231 E Colonial Dr", suite: "Suite 2", city: "Orlando", st: "FL", zip: "32803", county: "Orange" },
  DC: { street: "707 H St NW", suite: "Suite 100", city: "Washington", st: "DC", zip: "20001", county: "District of Columbia" },
  GA: { street: "5150 Buford Hwy NE", suite: "Suite 120", city: "Doraville", st: "GA", zip: "30340", county: "DeKalb" },
  ATL: { street: "5150 Buford Hwy NE", suite: "Suite 120", city: "Atlanta", st: "GA", zip: "30340", county: "Fulton" },
  PA: { street: "1011 Race St", suite: "Unit 1", city: "Philadelphia", st: "PA", zip: "19107", county: "Philadelphia" },
  PHL: { street: "1011 Race St", suite: "Unit 1", city: "Philadelphia", st: "PA", zip: "19107", county: "Philadelphia" },
  NV: { street: "4255 Spring Mountain Rd", suite: "Suite 102", city: "Las Vegas", st: "NV", zip: "89102", county: "Clark" },
  LV: { street: "4255 Spring Mountain Rd", suite: "Suite 102", city: "Las Vegas", st: "NV", zip: "89102", county: "Clark" },
  NJ: { street: "1655 Oak Tree Rd", suite: "Suite 3", city: "Edison", st: "NJ", zip: "08820", county: "Middlesex" },
  EDI: { street: "1655 Oak Tree Rd", suite: "Suite 3", city: "Edison", st: "NJ", zip: "08820", county: "Middlesex" },
  JC: { street: "294 Newark Ave", suite: "Unit 1", city: "Jersey City", st: "NJ", zip: "07302", county: "Hudson" },
  VA: { street: "6763 Wilson Blvd", suite: "Suite 12", city: "Falls Church", st: "VA", zip: "22044", county: "Fairfax" },
  FFX: { street: "6763 Wilson Blvd", suite: "Suite 12", city: "Falls Church", st: "VA", zip: "22044", county: "Fairfax" },
  ARL: { street: "3100 Clarendon Blvd", suite: "Suite 110", city: "Arlington", st: "VA", zip: "22201", county: "Arlington" },
  CO: { street: "333 S Federal Blvd", suite: "Unit 5", city: "Denver", st: "CO", zip: "80219", county: "Denver" },
  DEN: { street: "333 S Federal Blvd", suite: "Unit 5", city: "Denver", st: "CO", zip: "80219", county: "Denver" },
  MN: { street: "2601 Nicollet Ave", suite: "Suite 102", city: "Minneapolis", st: "MN", zip: "55408", county: "Hennepin" },
  MSP: { street: "2601 Nicollet Ave", suite: "Suite 102", city: "Minneapolis", st: "MN", zip: "55408", county: "Hennepin" },
  OH: { street: "1030 N High St", suite: "Suite 2", city: "Columbus", st: "OH", zip: "43201", county: "Franklin" },
  CMH: { street: "1030 N High St", suite: "Suite 2", city: "Columbus", st: "OH", zip: "43201", county: "Franklin" },
  OR: { street: "3015 SE Division St", suite: "Suite 4", city: "Portland", st: "OR", zip: "97202", county: "Multnomah" },
  PDX: { street: "3015 SE Division St", suite: "Suite 4", city: "Portland", st: "OR", zip: "97202", county: "Multnomah" },
};
export const placeOf = (where: string): Place => PLACES[where] ?? PLACES.US;
const STATE_NAMES: Record<string, string> = { CA: "California", NY: "New York", TX: "Texas", AZ: "Arizona", IL: "Illinois", WA: "Washington", MA: "Massachusetts", FL: "Florida", DC: "District of Columbia", GA: "Georgia", PA: "Pennsylvania", NV: "Nevada", NJ: "New Jersey", VA: "Virginia", CO: "Colorado", MN: "Minnesota", OH: "Ohio", OR: "Oregon" };

let overrides: Record<string, Record<string, string | [string, string]>> | null = null;
function override(form: string, id: string, pass: Pass): string | undefined {
  overrides ??= JSON.parse(readFileSync("scripts/fixtures/forms-samples.json", "utf8"));   // run from the repo root
  const o = overrides![form]?.[id];
  return o === undefined ? undefined : Array.isArray(o) ? (pass === "a" ? o[0] : o[1]) : o;
}

/** A line the signer writes by hand (an SSN, ITIN or ID number): never printed by Placetta. */
export const secretLine = (f: FormField) => !f.options && (/written by hand|\(by hand\)/i.test(f.label.en) || /^(ssn|itin|ssn_itin)$/i.test(f.id)
  || (/^(ssn|social security( number)?|itin|individual taxpayer identification number)\b/i.test(f.label.en.trim()) && !/\bein\b/i.test(f.label.en)));

/** The answer to one line, as an owner would give it. */
export function sample(form: OfficialForm, f: FormField, pass: Pass): string {
  const o = override(form.id, f.id, pass);
  if (o !== undefined) return o;
  const p = placeOf(form.where), b = pass === "b";
  const full = `${p.street}, ${p.suite}, ${p.city}, ${p.st} ${p.zip}`;
  const L = `${f.id} ${f.label.en} ${f.line}`.toLowerCase();
  const label = f.label.en.toLowerCase();
  if (secretLine(f)) return b ? "123-45-6789" : "By hand";
  if (f.options?.length) {
    const yesNo = f.options.length === 2 && /^yes$/i.test(f.options[0]) && /^no$/i.test(f.options[1]);
    if (yesNo) return b ? "No" : "Yes";
    return b ? f.options[f.options.length - 1] : f.options[0];
  }
  if (/e-?mail/.test(L)) return b ? "lin.wei@lotusteahouse.com" : "mei.chen@lotusteahouse.com";
  if (/\bfax\b/.test(label)) return "(408) 555-0199";
  if (/phone|telephone|\bcell\b|\btel\b/.test(L)) return b ? "(408) 555-0187" : "(408) 555-0142";
  if (/website|web site|\burl\b|web address/.test(L)) return "www.lotusteahouse.com";
  if (/\bnaics\b/.test(L)) return "722515";
  if (/\b(f?ein|fein|employer identification|federal (tax|employer) (id|identification)|federal id|fed(eral)? ?id)\b/.test(L)) return "93-4567890";
  if (/zip|postal code/.test(label) && !/address/.test(label)) return p.zip;
  if (/\bcounty\b/.test(label) && !/address/.test(label)) return p.county;
  if (/^city\b|\bcity\b(?! and state| state| ,)/.test(label) && !/address|street|city of/.test(label)) return p.city;
  if (/^state\b|\bstate\b$/.test(label) && !/address|statement/.test(label)) return p.st;
  if (/birth|\bdob\b/.test(L)) return "04/18/1988";
  if (/expir/.test(L)) return "06/30/2031";
  if (/\bdate\b|\bdated\b|start(ed|s)? (on|date)|first day|begin/.test(L)) return b ? "12/01/2026" : "11/02/2026";
  if (/hours|open(ing)? time|close|closing/.test(L)) return /clos/.test(L) ? "9:00 PM" : /open/.test(L) ? "10:00 AM" : "10:00 AM to 9:00 PM daily";
  if (/days? (of|open)/.test(L)) return "Daily";
  if (/mailing address|mail address/.test(L)) return b ? "PO Box 2210, " + `${p.city}, ${p.st} ${p.zip}` : full;
  if (/address|street|location|premises|site/.test(L)) return full;
  if (/\b(dba|d\/b\/a|trade name|doing business as|assumed name|fictitious)\b/.test(L)) return "Lotus Tea";
  if (/(legal|business|entity|company|corporation|firm|establishment|facility|applicant|organization)('s)? name|name of (the )?(business|entity|company|corporation|llc|establishment|facility|applicant|organization)|legal name/.test(L)) return "Lotus Tea House LLC";
  if (/\btitle\b|position|capacity/.test(L)) return b ? "Manager" : "Managing Member";
  if (/(number of|no\. of|how many) (full[- ]time )?(employees|workers|staff)|employees/.test(L)) return b ? "12" : "8";
  if (/seat/.test(L)) return "24";
  if (/square f|sq\.? ?f|footage|\barea\b/.test(L)) return "1450";
  if (/state of (incorporation|formation|organization)|jurisdiction|where (incorporated|formed|organized)/.test(L)) return STATE_NAMES[p.st] ?? "Delaware";
  if (/descri|nature|activit|type of business|kind of business|products|merchandise|services|what you sell|menu|scope|purpose|operation/.test(L)) return b ? "Tea house serving milk tea, fruit tea, coffee and fresh pastries baked on site" : "Tea house serving milk tea, fruit tea and pastries";
  if (/amount|sales|gross|receipts|wages|payroll|revenue|cost|valuation|value|\$/.test(L)) return b ? "180000" : "250000";
  if (/\byear\b/.test(L)) return "2026";
  if (/owner|officer|member|manager|partner|contact|person|name|signer|print|agent|organizer|director|president|principal|responsible|applicant/.test(L)) return b ? "Lin Wei" : "Mei Chen";
  if (/number|\bno\b|#|\bid\b|license|permit|account/.test(L)) return "4471-2026";
  return b ? "Lotus Tea House, second answer" : "Lotus Tea House";
}
