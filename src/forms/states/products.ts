// The product dimension across the 50 states and DC: what a business files because of what it makes, imports or sells,
// read from the agencies' own pages on 2026-10-28 (the data is products.json, built and proof-read with
// scripts/eval/proof-read.py; each entry's proof is the page's own sentence, under 25 words, its URL and the day).
//
//   bedding and upholstered furniture   the states that license or register makers, importers or sellers (MA, PA, NY,
//                                       CT, UT, WV, VA, DC, NC, DE; CA and OH are in src/forms/furniture.ts), and the
//                                       federal mattress flammability standards' records and certification (16 CFR
//                                       1632 and 1633). The tip-over rule for dressers is cpsc-1261 (furniture.ts).
//   cleaning products                   TSCA section 13 import certification for detergents and cleaning chemicals (the
//                                       composite wood certification, epa-tsca-import, stays furniture's)
//   antimicrobial (kills germs)         a pesticide: EPA's FIFRA registration, the producing establishment's
//                                       registration and yearly report, the Notice of Arrival for each import, and the
//                                       state registration in each state whose page could be read (46 of 51)
//   packaging EPR                       Washington and Minnesota (California, Oregon and Colorado are elsewhere)
//   food                                FDA's canning establishment registration and process filing for canned and
//                                       acidified food, and FSIS's import inspection application for meat and poultry
//
// Not here, and why (each checked on the agency's page or its rule that day):
//   - CPSC and FTC rules for cleaning products (the Federal Hazardous Substances Act's cautionary labels, the Green
//     Guides) are labeling, with nothing to file.
//   - California's Cleaning Product Right to Know Act discloses ingredients on the label and the website, with no
//     filing; New York's Household Cleansing Product Information Disclosure Program is being rewritten by rulemaking
//     (dec.ny.gov says so) and asks for no filing today. No state phosphate limit asks for a filing.
//   - Maine's packaging stewardship program has no stewardship organization yet (maine.gov/dep: registration opens 90
//     days after one is contracted); Maryland's law was read but no official page states a producer's own deadline.
//   - Arkansas, Hawaii, Indiana, Mississippi and Tennessee register pesticides too, but no page of theirs that could be
//     read states the requirement in a sentence, so they have no row yet.
//   - Rhode Island and Oklahoma license bedding, but their pages refused automated reads or state no requirement.
//   - A hand sanitizer is an FDA drug, not a pesticide, so it never sets `antimicrobial`.
import DATA from "./products.json";
import type { Needs, OfficialForm } from "../registry";

export const PRODUCT_FORMS = DATA as unknown as OfficialForm[];

/** Mattresses and bedding, in the words a brand uses: "mattress brand", "pillows and comforters", "床垫". */
const BEDDING = /\bmattress(es)?\b|\bbox ?springs?\b|\bbedding\b|\bpillows?\b|\bcomforters?\b|\bduvets?\b|\bquilts?\b|\bmattress (pads?|toppers?)\b|床垫|床上用品|枕头|被子|羽绒被|棉被/i;
/** Laundry detergent and household cleaning products. */
const CLEANING = /\blaundry (detergents?|pods?|liquid|powder|products?)\b|\bdetergents?\b|\bcleaning (products?|supplies|solutions?|chemicals?|brand)\b|\bhousehold cleaners?\b|\b(all-purpose|glass|floor|kitchen|bathroom|toilet|surface) cleaners?\b|\bdish ?(soap|washing|detergent)\b|\bdishwasher (tablets?|pods?|detergent)\b|\bfabric softeners?\b|\bstain removers?\b|\bbleach\b|\bdisinfect(ant|ants|ing)\b|\bsanitizing (wipes|spray)\b|洗衣液|洗衣粉|洗衣凝珠|洗涤剂|洗洁精|清洁剂|清洁用品|清洁产品|日化|消毒液|漂白/i;
/** A claim to kill or control germs, which makes a product a pesticide (EPA). A hand sanitizer is an FDA drug instead. */
const ANTIMICROBIAL = /\bdisinfect(ant|ants|ing)?\b|\bsanitiz(er|ers|ing)\b|\bantibacterial\b|\banti-bacterial\b|\bantimicrobial\b|\bgerm[- ]?killing\b|\bkills? (99(\.9)?% of )?(germs|bacteria|viruses)\b|\bgermicid(e|al)\b|消毒|杀菌|抗菌|除菌|灭菌/i;
const HAND_SANITIZER = /\bhand sanitiz(er|ers|ing)\b|免洗洗手液|洗手液/i;
/** Meat and poultry, which USDA's FSIS inspects at import. */
const MEAT = /\bmeats?\b|\bbeef\b|\bpork\b|\bpoultry\b|\bchicken\b|\bduck\b|\bjerky\b|\bsausages?\b|\bham\b|\bbacon\b|\bluncheon meat\b|肉|香肠|腊肠|腊味|火腿|鸭/i;
/** Shelf-stable canned, jarred or acidified food (FDA's canning rules). */
const CANNED = /\bcanned\b|\btinned\b|\bjarred\b|\bpickled?\b|\bpickles\b|\bretort\b|\bshelf-stable\b|\bacidified\b|罐头|罐装|瓶装酱|腌制|泡菜|酱菜|榨菜/i;

export const sellsBedding = (what: string) => BEDDING.test(what || "");
export const sellsCleaning = (what: string) => CLEANING.test(what || "") || (ANTIMICROBIAL.test(what || "") && !HAND_SANITIZER.test(what || ""));

/** What the words say a business makes, imports or sells, for the product filings: bedding, cleaning products, a
    germ-killing claim, meat and canned food. Food itself (`food`) is read by the plan (src/plan/preview.ts dealsInFood);
    meat and canned only matter with it. Nothing for words that name none of these. */
export function productNeeds(what: string): Pick<Needs, "bedding" | "cleaning" | "antimicrobial" | "meat" | "canned"> {
  const w = what || "";
  const cleaning = sellsCleaning(w), anti = ANTIMICROBIAL.test(w) && !HAND_SANITIZER.test(w);
  return { ...(BEDDING.test(w) ? { bedding: true } : {}), ...(cleaning ? { cleaning: true } : {}), ...(anti ? { antimicrobial: true } : {}),
    ...(!cleaning && MEAT.test(w) ? { meat: true } : {}), ...(!cleaning && CANNED.test(w) ? { canned: true } : {}) };
}
