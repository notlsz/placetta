// Where the New England state filings go (src/forms/states/newengland.json), and Form 1120-F, each copied from the
// agency's own page on 2026-10-28, with that page. Merged into DEST and TEAM_ONLY in ../destinations.ts.
import type { Dest } from "../destinations.ts";

const D = "2026-10-28";

// The Business Application and Registration (Form BAR) is headed "Division of Taxation\Employer Tax, One Capitol Hill,
// Providence RI 02908"; Section G "must be signed". The Department of Labor and Training's Employer Tax page: "The online
// application is not currently available", so "download the Business Application and Registration form and e-mail it to
// the Registration Section at the Division of Taxation at Tax.Registration@tax.ri.gov."
const RI_BAR = {
  email: "Tax.Registration@tax.ri.gov",
  mail: { name: "Rhode Island Division of Taxation", line1: "Employer Tax", line2: "One Capitol Hill", city: "Providence", state: "RI", zip: "02908" },
  signature: "wet", payment: "none", onBehalf: "unstated", checked: D,
  source: "https://www.ri.gov/taxation/BAR/assets/BAR_2024-0f89117d70c65f7907130a612bf59768ff6b0e0a0e5048832053717a51e6b4fb.pdf",
  also: ["https://dlt.ri.gov/employers/employer-tax-unit", "https://www.ri.gov/taxation/BAR/"] as string[],
} as const;
// Every Department of Health food application: "Attach check/money order made payable to "General Treasurer, State of
// Rhode Island" to the front of this application and mail to: Center for Food Protection, 3 Capitol Hill, Room 203,
// Providence, RI 02908-5097."
const RI_FOOD = {
  mail: { name: "Rhode Island Department of Health, Center for Food Protection", line1: "3 Capitol Hill, Room 203", city: "Providence", state: "RI", zip: "02908-5097" },
  signature: "wet", payment: "with_filing", payTo: "General Treasurer, State of Rhode Island", onBehalf: "unstated", checked: D,
} as const;
// "To register your business with the Vermont Department of Taxes please select Sign Up on the myVTax homepage"; Form
// BR-400: "You may fax the completed form to 802-828-5787."
const VT_TAX = {
  portal: "myvtax.vermont.gov", portalUrl: "https://myvtax.vermont.gov/", fax: { us: "+18028285787" },
  signature: "wet", payment: "none", onBehalf: "unstated", checked: D, source: "https://tax.vermont.gov/business/register",
} as const;
// "APPLICATION : Fill out an online application or print and mail it in"; Apply Online opens vtdoh.safefoodinspection.com;
// "Mailing address: VT Dept of Health Environmental Health Food & Lodging Program 280 State Drive Waterbury, VT 05671-8350".
const VT_FOOD = {
  portal: "vtdoh.safefoodinspection.com", portalUrl: "https://vtdoh.safefoodinspection.com/Login.aspx", account: "unknown",
  mail: { name: "Vermont Department of Health, Food and Lodging Program", line1: "280 State Drive", city: "Waterbury", state: "VT", zip: "05671-8350" },
  signature: "typed", onBehalf: "unstated", checked: D,
} as const;
// The Maine Revenue Services registration booklet (Revised February 2026): "Register Online at: revenue.maine.gov";
// "Return Application by fax (207) 287-6975; email taxpayerassist@maine.gov; or mail to: Taxpayer Assistance, P.O. Box
// 1060, Augusta, ME 04332-1060".
const ME_MRS = {
  portal: "revenue.maine.gov", portalUrl: "https://revenue.maine.gov/", fax: { us: "+12072876975" }, email: "taxpayerassist@maine.gov",
  mail: { name: "Maine Revenue Services", line1: "Taxpayer Assistance", line2: "P.O. Box 1060", city: "Augusta", state: "ME", zip: "04332-1060" },
  signature: "wet", payment: "none", onBehalf: "unstated", checked: D,
  source: "https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/25_Central_reg_app_booklet%20.pdf",
} as const;

export const NEWENGLAND_DEST: Record<string, Dest> = {
  "ma-dph-wholesale-food": {
    // "Apply for initial licensure for food processing and/or distribution at wholesale" in the Environmental Health
    // eLicensing Portal: "create an account, or log into your existing account" (read with WebFetch: mass.gov refuses curl).
    portal: "environmentalhealthlicensing.mass.gov", portalUrl: "https://environmentalhealthlicensing.mass.gov/", account: "unknown",
    signature: "typed", onBehalf: "unstated", checked: D, source: "https://www.mass.gov/guides/starting-a-wholesale-food-business",
  },
  "ct-drs-sales": {
    // "Use myconneCT to register for each business and tax type"; "If you are registering for a tax type with a
    // registration fee, you must make direct payment from your savings or checking account or payment with a credit card".
    portal: "drs.ct.gov", portalUrl: "https://drs.ct.gov/eservices/_/", signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: D, source: "https://portal.ct.gov/drs/businesses/new-business-resource-center/registering-with-drs",
    also: ["https://portal.ct.gov/drs/businesses/new-business-portal/managing-sales-tax"],
  },
  "ct-drs-withholding": {
    // "Use myconneCT to register for income tax withholding."
    portal: "drs.ct.gov", portalUrl: "https://drs.ct.gov/eservices/_/", signature: "typed", payment: "none", onBehalf: "unstated",
    checked: D, source: "https://portal.ct.gov/drs/businesses/new-business-resource-center/registering-with-drs",
  },
  "ct-dol-ui": {
    // "click this link - ReEmployCT and select "Apply Here" under the New Employer section"; "Employers must register their
    // business online."
    portal: "reemploycttax.dol.ct.gov", portalUrl: "https://reemploycttax.dol.ct.gov/accessct/faces/login/login_local.xhtml",
    signature: "typed", payment: "none", onBehalf: "unstated", checked: D,
    source: "https://portal.ct.gov/dol/knowledge-base/articles/unemployment-taxes/how-do-i-register",
  },
  "ct-dcp-food": {
    // The application (FOODS, Rev 7/17): "Return your completed application and fee to: Department of Consumer
    // Protection, License Services Division, 450 Columbus Blvd., Suite 801, Hartford, CT 06103", check or money order
    // "made payable to: "Treasurer, State of CT."" The Division's page links each license's Apply Online to elicense.ct.gov.
    mail: { name: "Department of Consumer Protection, License Services Division", line1: "450 Columbus Blvd., Suite 801", city: "Hartford", state: "CT", zip: "06103" },
    signature: "wet", payment: "with_filing", payTo: "Treasurer, State of CT", onBehalf: "unstated", checked: D,
    source: "https://portal.ct.gov/dcp/-/media/dcp/pdf/applications_added_2014/fwhapplication080614pdf.pdf",
    also: ["https://portal.ct.gov/dcp/-/media/dcp/pdf/applications_added_2015/fmeapplication8715pdf.pdf",
      "https://portal.ct.gov/dcp/home/license-services-division/all-license-applications/food-and-beverage-licensing-and-registration"],
  },
  "ri-tax-permit": { ...RI_BAR },
  "ri-tax-employer": { ...RI_BAR },
  "ri-doh-food-wholesale": { ...RI_FOOD, source: "https://health.ri.gov/applications/FoodProcessorRetailWholesale.pdf", also: ["https://health.ri.gov/applications/FoodWarehouse.pdf"] },
  "ri-doh-food-service": { ...RI_FOOD, source: "https://health.ri.gov/applications/FoodServiceBusinessRetail.pdf" },
  "ri-doh-food-market": { ...RI_FOOD, source: "https://health.ri.gov/applications/FoodMarketCashRegisters.pdf" },
  "vt-tax-sales": { ...VT_TAX },
  "vt-tax-withholding": { ...VT_TAX },
  "vt-dol-ui": {
    // "Access e-Services for Employers/TPAs: https://labor.ui.vermont.gov/UI/Employer"; "You should use your business/work
    // email address for the myVermont account you set up to access e-Services."
    portal: "labor.ui.vermont.gov", portalUrl: "https://labor.ui.vermont.gov/UI/Employer", account: "unknown",
    signature: "typed", payment: "none", onBehalf: "unstated", checked: D,
    source: "https://labor.vermont.gov/unemployment-insurance-modernization-employer-resources",
  },
  "vt-doh-food-processor": { ...VT_FOOD, source: "https://www.healthvermont.gov/environment/food-lodging-program/food-processing-establishments" },
  "vt-doh-retail-food": { ...VT_FOOD, source: "https://www.healthvermont.gov/environment/food-lodging-program/retail-food-service-establishments" },
  "me-mrs-sales": { ...ME_MRS },
  "me-mrs-withholding": { ...ME_MRS },
  "me-dol-ui": {
    // "Applicants registering for an unemployment compensation tax account, register online at maine.gov/reemployme"
    portal: "www.maine.gov", portalUrl: "https://www.maine.gov/reemployme", tenant: "/reemployme",
    signature: "typed", payment: "none", onBehalf: "unstated", checked: D,
    source: "https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/25_Central_reg_app_booklet%20.pdf",
  },
  "me-pfml": {
    // "All employers with Maine employees are required to register with Maine Paid Leave at maine.gov/paidleave/."
    portal: "www.maine.gov", portalUrl: "https://www.maine.gov/paidleave/", tenant: "/paidleave",
    signature: "typed", payment: "none", onBehalf: "unstated", checked: D,
    source: "https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/25_Central_reg_app_booklet%20.pdf",
  },
  "irs-1120f": {
    // "File Form 1120-F with the Internal Revenue Service Center, P.O. Box 409101, Ogden, UT 84409."
    mail: { name: "Internal Revenue Service Center", line1: "P.O. Box 409101", city: "Ogden", state: "UT", zip: "84409" },
    signature: "wet", payment: "none", onBehalf: "unstated", checked: D, source: "https://www.irs.gov/instructions/i1120f",
  },
};

export const NEWENGLAND_TEAM: Record<string, { why: string; source: string; checked: string }> = {
  "me-dacf-food": { why: "The Department's Food and Fuel License Application (a Word document) refused automated reads, so where it goes and how its fee is paid weren't read in this pass.", source: "https://www.maine.gov/dacf/qar/permits_and_licenses/index.shtml", checked: D },
  "me-dacf-retail-food": { why: "The Department's Food and Fuel License Application (a Word document) refused automated reads, so where it goes and how its fee is paid weren't read in this pass.", source: "https://www.maine.gov/dacf/qar/permits_and_licenses/index.shtml", checked: D },
  "me-hip-eating": { why: "The Health Inspection Program's page names an online application service and a downloadable form, but its form link is gone (404), so no address or portal host was confirmed.", source: "https://www.maine.gov/dhhs/mecdc/services/business-services/business-licensing/license-a-new-business", checked: D },
  "fda-lacf-fce": { why: "Filed by the processor itself, electronically in FDA Industry Systems or on paper forms, with the scheduled process from its process authority.", source: "https://www.fda.gov/food/registration-food-facilities-and-other-submissions/establishment-registration-process-filing-acidified-and-low-acid-canned-foods-lacf", checked: D },
  "nh-dra-meals": { why: "revenue.nh.gov refused every automated read (403), so the route wasn't confirmed.", source: "https://www.revenue.nh.gov/meals-rooms/", checked: D },
  "nh-nhes-ui": { why: "nhes.nh.gov refused every automated read (403), so the route wasn't confirmed.", source: "https://www.nhes.nh.gov/", checked: D },
  "nh-dhhs-food": { why: "dhhs.nh.gov refused every automated read (403), and some towns license food places themselves, so the office wasn't confirmed.", source: "https://www.dhhs.nh.gov/programs-services/environmental-health-and-you/food-protection", checked: D },
};
