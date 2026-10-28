// Where the Mid-Atlantic state filings go (src/forms/states/midatlantic.json), each copied from the agency's own page
// on 2026-10-28, with that page. Merged into DEST and TEAM_ONLY in ../destinations.ts.
import type { Dest } from "../destinations.ts";

const NY_AGM = { name: "NYS Department of Agriculture and Markets", line1: "Attn: Food Safety License Unit", line2: "10B Airline Drive", city: "Albany", state: "NY", zip: "12235" };
// "Submit completed applications and requested documentation to: RA-AGPLANREVIEW@pa.gov or mail / fax to: ...
// Attn: Plan Review 2301 N. Cameron St, Room 112 Harrisburg, PA 17110 Fax: 717-787-1873"; "Do not send money".
const PDA = {
  email: "RA-AGPLANREVIEW@pa.gov",
  fax: { us: "+17177871873" },
  mail: { name: "Pennsylvania Department of Agriculture", line1: "Bureau of Food Safety and Laboratory Services, Attn: Plan Review", line2: "2301 N. Cameron St, Room 112", city: "Harrisburg", state: "PA", zip: "17110" },
  signature: "wet", payment: "invoice", onBehalf: "unstated",
} as const;

export const MIDATLANTIC_DEST: Record<string, Dest> = {
  "ny-agm-20c": {
    // "a business check or money order made payable to "Department of Agriculture and Markets" can be submitted with the
    // completed application and mailed to" the License Unit; "An original signature of owner or corporate officer or LLC
    // managing member is required in Section (9)."
    mail: NY_AGM, signature: "wet", payment: "with_filing", payTo: "Department of Agriculture and Markets", onBehalf: "unstated",
    checked: "2026-10-28", source: "https://agriculture.ny.gov/system/files/documents/2025/06/fsi-303.pdf",
    also: ["https://agriculture.ny.gov/food-business-licensing"],
  },
  "ny-agm-28d": {
    // The form is headed with the License Unit's address; "An original signature of owner or corporate officer is required
    // in Section (7)." The fee goes with it (the card authorization form on the last page).
    mail: NY_AGM, signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-28", source: "https://agriculture.ny.gov/system/files/documents/2025/09/fsi302a.pdf",
    also: ["https://agriculture.ny.gov/food-business-licensing"],
  },
  "ny-agm-28a": {
    mail: NY_AGM, signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-28", source: "https://agriculture.ny.gov/system/files/documents/2025/09/fsi302.pdf",
    also: ["https://agriculture.ny.gov/food-business-licensing"],
  },
  "nj-doh-f29": {
    // "Submit your completed application as an attachment via email to: wfc@doh.nj.gov"; "Pay your application fee online
    // at: nj.gov/health/ceohs/phfpp/wfc", with the confirmation number written on the form.
    email: "wfc@doh.nj.gov", signature: "wet", payment: "portal", onBehalf: "unstated",
    attach: ["Certificate of Occupancy"],
    checked: "2026-10-28", source: "https://www.nj.gov/health/forms/f-29.pdf",
    also: ["https://www.nj.gov/health/ceohs/phfpp/wfc/"],
  },
  "pa-pda-food-reg": {
    ...PDA,
    checked: "2026-10-28", source: "https://www.pa.gov/agencies/pda/food/food-safety/food-manufacturing-packing-holding-and-distribution/commercial-food-establishments",
  },
  "pa-pda-retail": {
    ...PDA,
    checked: "2026-10-28", source: "https://www.pa.gov/agencies/pda/food/food-safety/retail-food/retail-food-facilities-and-restaurants",
  },
  "va-vdacs-mfg": {
    // "Submit your completed application with all required information and supporting documentation to the VDACS Food
    // Safety Program by email at foodsafety@vdacs.virginia.gov"; the $40 fee is invoiced later.
    email: "foodsafety@vdacs.virginia.gov", signature: "wet", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-28", source: "https://www.vdacs.virginia.gov/pdf/manufacturedfoodpermitapplication.pdf",
  },
  "va-vdacs-retail": {
    email: "foodsafety@vdacs.virginia.gov", signature: "wet", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-28", source: "https://www.vdacs.virginia.gov/pdf/retailfoodpermitapplication.pdf",
  },
  "de-cra": {
    // "Licenses can be obtained using the One Stop Business Licensing and Registration Service"; One Stop's page offers
    // "Create an Account" and "Sign In".
    portal: "onestop.delaware.gov", portalUrl: "https://onestop.delaware.gov/Operate_Register",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-28", source: "https://onestop.delaware.gov/Operate_Register",
    also: ["https://revenue.delaware.gov/frequently-asked-questions/business-licenses-faqs/"],
  },
  "de-ui": {
    // "Delaware One Stop will guide you through the process of completing these requirements online."
    portal: "onestop.delaware.gov", portalUrl: "https://onestop.delaware.gov/Operate_Register",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-28", source: "https://onestop.delaware.gov/Operate_Register",
  },
  "de-food": {
    // "The Office of Food Protection requires all Plan Reviews to be mailed to: Plan Review 43 S Dupont Hwy Suite C
    // Dover, DE 19901"; the form: "MAKE CHECK PAYABLE TO "STATE OF DELAWARE."" and "APPLICANT SIGNATURE IS REQUIRED".
    mail: { name: "Office of Food Protection", line1: "Plan Review", line2: "43 S Dupont Hwy Suite C", city: "Dover", state: "DE", zip: "19901" },
    signature: "wet", payment: "with_filing", payTo: "State of Delaware", onBehalf: "unstated",
    checked: "2026-10-28", source: "https://dhss.delaware.gov/dph/homepage/about/sections/hsp/inspection-services/",
    also: ["https://dhss.delaware.gov/wp-content/uploads/sites/12/dph/pdf/feplanreview0603.pdf"],
  },
  "wv-tax": {
    // "Go to https://onestop.wv.gov/ to log into your existing user account or to create a new user account"; "A $1.00 WV
    // portal fee will apply to all filings processed through the online portal."
    portal: "onestop.wv.gov", portalUrl: "https://onestop.wv.gov/", account: "business",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-28", source: "https://business4.wv.gov/Documents/OneStopBizRegInstr.pdf",
    also: ["https://tax.wv.gov/Business/BusinessRegistration/Pages/BusinessRegistrationQuestionsAndAnswers.aspx", "https://business4.wv.gov/startmybusiness/Pages/Register-Your-Business.aspx"],
  },
  "wv-ui": {
    // "The completed application can be emailed to: uctaxunit@wv.gov , which is the preferred method."
    email: "uctaxunit@wv.gov", signature: "wet", payment: "none", onBehalf: "unstated",
    checked: "2026-10-28", source: "https://workforcewv.org/businesses/unemployment-tax-information/navigate-the-unemployment-process/",
  },
};

export const MIDATLANTIC_TEAM: Record<string, { why: string; source: string; checked: string }> = {
  "md-mdh-food-processing": { why: "MDH's fee page names one application for every plant type, but the application's link isn't in the page and no page read prints where or how to submit it; the Office of Food Protection (410-767-8400) confirms.", source: "https://health.maryland.gov/phpa/OEHFP/OFPCHS/Pages/food-process-fees.aspx", checked: "2026-10-28" },
};
