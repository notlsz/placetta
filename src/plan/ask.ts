// Fail closed: a plan row claims a requirement only when an official page says so, in words Placetta read there
// recently. Everything else abstains: the row says Odelia doesn't know yet and names who to ask, with that office's own
// .gov link. Pure functions: the instant plan (src/plan/preview.ts), the agent's forms tool (src/live.ts) and the
// accuracy eval (scripts/eval) read claims and abstentions through here.
//
//   proofCurrent    the quote was found on its page by the last re-read (src/forms/proofChecks.json, written by
//                   `npm run proof:read`) no more than MAX_PROOF_AGE days ago
//   whoToAsk        the city's (or, unincorporated, the county's) own .gov site from CISA's .gov registry
//                   (src/forms/citySites.ts), else USA.gov's directory of local governments
//   STATE_LOCAL     what a state's own official page says about its local offices: who issues the food permit and the
//                   building permit, quoted, so a city the library hasn't read still gets the right office (or, where
//                   the state leaves it to each city, an abstention that names the city)
import CHECKS from "../forms/proofChecks.json";
import { CITY_SITES } from "../forms/citySites";

/** How long a quote stays good after it was last seen on its page. Re-read at least monthly (npm run proof:read). */
export const MAX_PROOF_AGE = 90;
const checks = CHECKS as Record<string, string>;
const dayMs = 86_400_000;
const age = (from: string, to: string) => Math.floor((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / dayMs);

/** The day the quote was last seen on the page, when that's recent enough to claim on; undefined otherwise. */
export function proofCurrent(p: { read: string; quote: string } | undefined, today: string): string | undefined {
  if (!p?.quote || !p.read) return undefined;
  const seen = checks[p.read + "\n" + p.quote];
  if (!seen) return undefined;
  return age(seen, today) <= MAX_PROOF_AGE ? seen : undefined;
}

export type Src = { label: string; url: string; quote?: string; checked?: string };
const READ = "2026-10-21";
/** USA.gov's directory of local governments, by state: where to start when a city has no .gov site on record. */
export const USA_GOV_LOCAL: Src & { quote: string; checked: string } = { label: "usa.gov", url: "https://www.usa.gov/local-governments", quote: "Find contact information for local governments by state.", checked: READ };

/** The office to ask about a city's own steps: its .gov site, the county's for an unincorporated place, or USA.gov. */
export function whoToAsk(city: string | undefined, state: string | undefined): { source: Src; site: "city" | "county" | "usa.gov"; org?: string } {
  const row = city && state ? CITY_SITES[`${city.toLowerCase().replace(/\s+/g, " ").trim()}|${state.toUpperCase()}`] : undefined;
  if (!row) return { source: USA_GOV_LOCAL, site: "usa.gov" };
  const [domain, org] = row;
  return { source: { label: domain, url: `https://${domain}/` }, site: /county/i.test(org) && !/city and county/i.test(org) ? "county" : "city", org };
}

/* ------------------------------------------------------------------ the states' own rules for their local offices */

export type Quoted = Src & { quote: string; checked: string };
/** Massachusetts: food establishments are permitted by the city or town's board of health (there are no county health
    departments). Read with curl on 2026-10-21. */
export const SRC_MA_FOOD: Quoted = { label: "mass.gov", url: "https://www.mass.gov/guidance/stakeholders-regarding-the-retail-food-code", quote: "A Food Establishment may not operate without a permit from the local board of health.", checked: READ };
/** New Jersey: the Uniform Construction Code's construction permit, from the municipality's enforcing agency. */
export const SRC_NJ_UCC: Quoted = { label: "nj.gov", url: "https://www.nj.gov/dca/codes/publications/pdf_ucc/UCC_gen_info.pdf", quote: "A construction permit is required for any new construction as well as for work on existing buildings", checked: READ };
/** Texas: a city or county health department permits food places where it has one; DSHS elsewhere. Who it is varies, so
    a Texas city the library hasn't read gets an abstention that says so, never a guessed office. */
export const SRC_TX_FOOD: Quoted = { label: "dshs.texas.gov", url: "https://www.dshs.texas.gov/sites/default/files/foodestablishments/pdf/GuidanceDocs/23-13105-Starting-a-New-Retail-Food-Establishment--rev-05-27-21.pdf", quote: "You should contact your city or county office to determine if they permit facilities in your area.", checked: READ };

/** Who permits a food place in a state, where its own page says: "city" (the city or town's board of health), or
    "varies" (the state leaves it to each city or county: abstain and name both). Not listed: the county table decides. */
export const FOOD_PERMITTER: Record<string, { who: "city" | "varies"; src: Quoted }> = {
  MA: { who: "city", src: SRC_MA_FOOD },
  TX: { who: "varies", src: SRC_TX_FOOD },
};
/** States whose own page says a build-out needs a permit from the municipality's office: the claim is certain there. */
export const MUNICIPAL_BUILDING: Record<string, Quoted> = { NJ: SRC_NJ_UCC };

/** Every source a fallback row can claim on, for the proof dump (scripts/eval/proof-dump.ts). */
export const STATE_SOURCES: Quoted[] = [SRC_MA_FOOD, SRC_NJ_UCC, SRC_TX_FOOD, USA_GOV_LOCAL];
