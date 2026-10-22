// The source audit of 2026-10-22: every link in the registry checked with `npm run verify:sources` (HEAD, or a GET cut
// off at the headers), and each one found gone (404 or 410) looked up again on the agency's own site. Each fix below names
// the entry, what changed, the official page that shows the new value and the day it was read. A fix only ever moves a
// link to the page the agency now uses, replaces a proof whose page is gone with a sentence from the new page, or takes
// a claim away when no official page states it any more (the row then abstains and names the office). It never adds a fee
// or a time that an official page doesn't state.
//
// Applied in src/forms/registry.ts after every other layer, so it wins; scripts/registry-test.ts checks that each fix
// still finds its entry and that its new link answers.
import type { OfficialForm } from "./registry";

export const AUDIT_READ = "2026-10-22";

type Proof = { quote: string; read: string; en?: string };
export type Fix = {
  id: string;
  /** new links; null removes one (a PDF the agency took down) */
  url?: string; info?: string; pdf?: string | null; takesSource?: string | null;
  /** a proof from the new page, replacing one whose page is gone; null takes the proof away (no official page states it now) */
  proof?: Proof | null;
  /** drop the processing time whose only source is gone */
  dropTakes?: boolean;
  why: string;
};

export const FIXES: Fix[] = [
  { id: "fl-fictitious", url: "https://dos.fl.gov/sunbiz/start-business/efile/fl-fictitious-name-registration/", info: "https://dos.fl.gov/sunbiz/start-business/efile/fl-fictitious-name-registration/",
    proof: { read: "https://dos.fl.gov/sunbiz/start-business/efile/fl-fictitious-name-registration/", quote: "Registration of Fictitious Name $50.00" },
    why: "The Division of Corporations moved the page (the old one is a 404); the new one states the $50.00 fee the registry already gave." },
  { id: "sacc-plan-review", info: "https://emd.saccounty.gov/us/en/environmental-health/eh-plan-review.html",
    why: "Sacramento County EMD moved its plan review page (the old .aspx page is a 404)." },
  { id: "sacc-health-permit", url: "https://emd.saccounty.gov/us/en/environmental-health/retail-food-protection-program/selling-food-in-sacramento-county.html",
    info: "https://emd.saccounty.gov/us/en/environmental-health/retail-food-protection-program/selling-food-in-sacramento-county.html",
    proof: { read: "https://emd.saccounty.gov/us/en/environmental-health/retail-food-protection-program/selling-food-in-sacramento-county.html", quote: "A health permit is required when food is given or sold to the public." },
    why: "The linked PDF (How to Obtain a Health Permit, 2023) is a 404; the county's Selling Food page states the requirement." },
  { id: "fulton-food-permit", url: "https://FultonCountyGa.gov/-/media/Departments/Board-of-Health/Environmental-Health/Restaurant-Inspection/Link-List-Items/Food-Service-Application.pdf",
    why: "Fulton County's Restaurant Inspection page is a 404; the Board of Health's food service application PDF is still published." },
  { id: "smc-health-permit", info: "https://www.smchealth.org/food-program", proof: null,
    why: "San Mateo County took down its plan review FAQ (20251104_plan_review_faqs.pdf, now a 404), the only page the quote was on; no sentence on the Food Program page states the permit fee step, so the row abstains and names the county until one is read." },
  { id: "fmc-18", info: "https://www2.fmc.gov/form18/Form18/FillingInformation.aspx",
    why: "fmc.gov/resources-services/licensing-registration/ is a 404; the Form 18 filing information page is the Commission's own." },
  { id: "sac-bot", pdf: null,
    proof: { read: "https://www.cityofsacramento.gov/finance/revenue/business-operations-tax", quote: "All businesses that operate in the City of Sacramento or do business with the City of Sacramento must pay a business operation tax." },
    why: "The fillable application PDF (revised 12-2019) is a 404; the city's Business Operations Tax page takes applications by email and states the requirement." },
  { id: "ffx-bpol", url: "https://www.fairfaxcounty.gov/taxes/business/business-forms", pdf: null,
    why: "The 2024 BPOL application PDF is a 404; Fairfax County's Business Forms page links the current application and instructions." },
  { id: "cn-open-sh", url: "https://yct.sh.gov.cn/portal_yct/", info: "https://yct.sh.gov.cn/portal_yct/",
    why: "The bare host yct.sh.gov.cn answers 404; Shanghai's 一窗通 portal is at /portal_yct/." },
  { id: "fda-ffr", info: "https://www.fda.gov/food/online-registration-food-facilities/food-facility-registration-user-guide-biennial-registration-renewal",
    proof: { read: "https://www.fda.gov/food/online-registration-food-facilities/food-facility-registration-user-guide-biennial-registration-renewal",
      quote: "requires food facilities that are required to register with FDA to renew such registrations during the period beginning on October 1" },
    why: "The old ucm324780 page redirects to FDA's biennial renewal guide, which states the 2026 renewal window (October 1 to December 31, 2026)." },
  { id: "lv-food", takesSource: null, dropTakes: true,
    why: "The page the 4-week inspection wait came from (southernnevadahealthdistrict.org/?p=299647) is a 404 and the Health District's plan review page states no time, so no time is claimed." },
  { id: "hou-fire", url: "https://www.houstontx.gov/fire/formsandpermits/",
    why: "Without the trailing slash the page redirects to plain http; the https page answers 200." },
  { id: "fincen-boir", info: "https://www.fincen.gov/boi",
    proof: { read: "https://www.fincen.gov/boi", quote: "U.S. companies are exempt from BOI reporting requirements." },
    why: "Status re-read: FinCEN's final rule, effective August 14, 2026, made the March 2025 exemptions permanent. Only foreign-formed companies registered to do business in a U.S. state report, within 30 days of the registration." },
  /* proofs added to US entries that had none: each sentence read on the agency's own page today */
  ...([
    ["ca-ftb-3522", "https://www.ftb.ca.gov/file/business/types/limited-liability-company/index.html", "Every LLC that is doing business or organized in California must pay an annual tax of $800.", "confirms the $800 the registry stated"],
    ["tx-304", "https://www.sos.state.tx.us/corp/instructions/304.shtml", "The filing fee for an application for registration for a limited liability company is $750.", "confirms the $750 the registry stated"],
    ["fda-5066", "https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products", "to assist in the biennial registration renewal of cosmetic product facilities", "confirms the two-year renewal"],
    ["fda-5067", "https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products", "A responsible person must list each marketed cosmetic product with the FDA, including product ingredients, and provide any updates annually.", "confirms the yearly update"],
    ["nyc-crt", "https://www.nyc.gov/site/finance/business/business-commercial-rent-tax-crt.page", "This tax is charged to tenants who occupy or use a property for commercial activity in Manhattan, south of 96th Street.", "states the area"],
    ["mn-cfpm", "https://www.health.state.mn.us/communities/environment/food/cfpm/require.html", "All food establishments are required to employ a Certified Food Protection Manager (CFPM),", "states the requirement"],
    ["or-payroll", "https://www.oregon.gov/dor/programs/businesses/Pages/Withholding-and-Payroll-tax.aspx", "All employers with paid employees working in Oregon must register for a business identification number (BIN) to report and pay Oregon payroll taxes.", "states the requirement"],
    ["sat-co", "https://www.sa.gov/Directory/Departments/DSD/Constructing/Business-Commercial/Certificate-of-Occupancy", "A Certificate of Occupancy is required for all businesses in the City of San Antonio.", "the city moved the page to sa.gov"],
    ["ftw-co", "https://www.fortworthtexas.gov/departments/development-services/permits/certificate-of-occupancy", "Any building used or occupied in Fort Worth must have a Certificate of Occupancy.", "states the requirement"],
    ["ftw-plan-review", "https://www.fortworthtexas.gov/departments/environmental-services/consumer-health/plan-review", "must be submitted to the Consumer Health division for review under city and state law.", "states the requirement"],
    ["mult-plan-review", "https://multco.us/services/restaurant-license", "You must obtain a plan review and license before:", "the county moved the page to /services/restaurant-license"],
    ["mult-food-license", "https://multco.us/services/restaurant-license", "You must obtain a plan review and license before:", "the county moved the page to /services/restaurant-license"],
    ["mpls-plan-review", "https://www.minneapolismn.gov/business-services/business-assistance/run/food-safety/food-plan-review/", "The City must approve your plan to start, remodel or expand a food business.", "states the requirement"],
    ["cmh-plan-review", "https://www.columbus.gov/Services/Food-Protection-Program", "Complete a plan review packet and send it to our office with a payment to begin the process of getting a license.", "states the requirement"],
    ["dal-sign", "https://dallascityhall.com/departments/sustainabledevelopment/buildinginspection/Pages/Signs.aspx", "A permit IS REQUIRED for all signs (new or re-face) if any sign:", "states the requirement; the $296 fee is not on the page and stays unverified"],
    ["aus-sign", "https://www.austintexas.gov/development-services/sign-permits", "For ALL submissions, you must submit a completed Sign Permit Application.", "states the requirement"],
    ["orl-business-tax", "https://www.orlando.gov/Building-Development/Permits-Inspections/Other/Get-a-Permit-for-Your-Business/Get-a-Business-Tax-Receipt", "You must pay a tax to operate any business within city limits.", "states the requirement"],
  ] as const).map(([id, read, quote, why]): Fix => ({ id, info: read, proof: { read, quote }, why: `Proof added from the agency's page: ${why}.` })),
];

/** Apply the audit's fixes to the library (in place). Returns the ids it couldn't find, which the test fails on. */
export function applyFixes(forms: OfficialForm[]): string[] {
  const missing: string[] = [];
  for (const x of FIXES) {
    const f = forms.find(g => g.id === x.id);
    if (!f) { missing.push(x.id); continue; }
    if (x.url) f.url = x.url;
    if (x.info) f.info = x.info;
    if (x.pdf === null) delete f.pdf; else if (x.pdf) f.pdf = x.pdf;
    if (x.dropTakes) { delete f.takes; f.takesDays = null; }
    if (x.takesSource === null) delete f.takesSource; else if (x.takesSource) f.takesSource = x.takesSource;
    if (x.proof === null) delete f.proof;
    else if (x.proof) f.proof = { quote: x.proof.quote, read: x.proof.read, checked: AUDIT_READ, ...(x.proof.en ? { en: x.proof.en } : {}) };
  }
  return missing;
}
