// Where the western states' filings in src/forms/states/west.json go, each copied from the agency's own page or form on
// 2026-10-28. Merged into DEST (and the team-only list into TEAM_ONLY) in ../destinations.ts.
import type { Dest } from "../destinations.ts";

const ON = "2026-10-28";

const IBR: Dest = {
  // tax.idaho.gov: "Apply for your tax permits and employee-related permits: Idaho Business Registration (IBR)
  // application" (www2.labor.idaho.gov/IBRS), or "print and fill out this PDF"; the form: "Return to: PO BOX 36 BOISE, ID
  // 83722-0410", and line 19, the business contact person: "POA will be required."
  portal: "www2.labor.idaho.gov", portalUrl: "https://www2.labor.idaho.gov/IBRS",
  mail: { name: "Idaho Business Registration", line1: "PO Box 36", city: "Boise", state: "ID", zip: "83722-0410" },
  signature: "wet", onBehalf: "authorization",
  authorization: "A power of attorney for the business contact person named on the IBR (line 19: \"POA will be required\").",
  checked: ON, source: "https://tax.idaho.gov/business-registration/", also: ["https://tax.idaho.gov/document-mngr/forms_EFO00147"],
};

const UDAF_PLAN = (pdf: string, page: string): Dest => ({
  // Forms PRA 101 and PRA 102: "This form and the provisions therein must be submitted to the Support Services Staff at
  // udaf-planreview@utah.gov"; "Plans will not be reviewed until payment is received."
  email: "udaf-planreview@utah.gov",
  signature: "wet", onBehalf: "unstated",
  checked: ON, source: page, also: [pdf],
});

export const WEST_DEST: Record<string, Dest> = {
  "wa-wsda-warehouse": {
    // "Complete and send the Food Storage Warehouse application form along with a check or money order"; AGR-2060 is
    // headed "Food Safety Program, PO Box 42560, Olympia, WA 98504-2560".
    mail: { name: "WSDA Food Safety Program", line1: "PO Box 42560", city: "Olympia", state: "WA", zip: "98504-2560" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: ON, source: "https://agr.wa.gov/Services/Licenses-Permits-and-Certificates/Summary-Descriptions/Food-Storage-Warehouse",
    also: ["https://cms.agr.wa.gov/WSDAKentico/Documents/Forms/2060-FoodStorageWarehouseLicenseApplication.pdf"],
  },
  "wa-wsda-processor": {
    // "Complete and send the Food Processor's Application and Attachments A, B, C, D, and E along with a check or money
    // order to: Department of Agriculture Food Safety & Consumer Services P.O Box 42591 Olympia, WA 98504-2591"
    mail: { name: "Department of Agriculture", line1: "Food Safety & Consumer Services", line2: "PO Box 42591", city: "Olympia", state: "WA", zip: "98504-2591" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: ON, source: "https://agr.wa.gov/departments/food-safety/food-safety/food-processors",
  },
  "ut-udaf-retail-plan": UDAF_PLAN("https://ag.utah.gov/wp-content/uploads/PRA101-UDAF-Form-Rev-07_2026.pdf", "https://ag.utah.gov/regulatory-services/retail-food-regulatory-program/"),
  "ut-udaf-manufactured-plan": UDAF_PLAN("https://ag.utah.gov/wp-content/uploads/PRA102-UDAF-Form-Rev-07_2026.pdf", "https://ag.utah.gov/regulatory-services/manufactured-food/"),
  "id-ibr": IBR,
  "id-ibr-employer": IBR,
  "mt-withholding": {
    // "Online: Through the TransAction Portal (TAP)"; "By Mail: Using the Montana Department of Revenue Business
    // Registration (Form GenReg)"; GenReg: "Send to: Montana Department of Revenue, Attn: Registration Unit, PO Box 5805,
    // Helena, MT 59604-5805 or fax to: (406) 444-7723, Attn: Registration Unit."
    portal: "tap.dor.mt.gov", portalUrl: "https://tap.dor.mt.gov/",
    fax: { us: "+14064447723" },
    mail: { name: "Montana Department of Revenue", line1: "Attn: Registration Unit", line2: "PO Box 5805", city: "Helena", state: "MT", zip: "59604-5805" },
    signature: "wet", onBehalf: "unstated",
    checked: ON, source: "https://revenuefiles.mt.gov/taxes/withholding-tax/accounts",
    also: ["https://revenuefiles.mt.gov/files/Forms/Montana_Department_of_Revenue_Business_Registration_Form_GenReg.pdf"],
  },
  "mt-ui": {
    // The handbook: "Register online at uieservices.mt.gov."
    portal: "uieservices.mt.gov", portalUrl: "https://uieservices.mt.gov/",
    signature: "typed", onBehalf: "unstated",
    checked: ON, source: "https://uid.dli.mt.gov/employer-handbook.pdf", also: ["https://uid.dli.mt.gov/employers/"],
  },
  "wy-sales-tax": {
    // FAQ: "Can I apply for a Wyoming sales tax license online? A. Yes. It's a two-step process" on WYIFS
    // (excise-wyifs.wy.gov); the application the division links: "Wyoming Department of Revenue, 122 West 25th Street,
    // Suite E301, Herschler Building East, Cheyenne WY 82002-0110", "Original Signature(s) are required", "Include the
    // $60.00 non-refundable application fee", "make check payable to the Wyoming Department of Revenue".
    portal: "excise-wyifs.wy.gov", portalUrl: "https://excise-wyifs.wy.gov/",
    mail: { name: "Wyoming Department of Revenue", line1: "122 West 25th Street, Suite E301", line2: "Herschler Building East", city: "Cheyenne", state: "WY", zip: "82002-0110" },
    signature: "wet", payment: "with_filing", payTo: "Wyoming Department of Revenue", onBehalf: "unstated",
    checked: ON, source: "https://excise-tax-div.wyo.gov/salesuselodging-tax/salesuselodging-registration",
    also: ["https://excise-tax-div.wyo.gov/general-administrative/excise-tax-faqs", "https://drive.google.com/file/d/1yeU3Qdk6GiP2-I9TcgUFBJBUHNNNux5t/view"],
  },
  "wy-dws": {
    // "Visit WYUI.wyo.gov. Under Employer Services (lower left), select Register New Business with DWS."
    portal: "wyui.wyo.gov", portalUrl: "https://wyui.wyo.gov/",
    signature: "typed", onBehalf: "unstated",
    checked: ON, source: "https://dws.wyo.gov/dws-division/workers-compensation/new-employers/",
  },
  "ak-business-license": {
    // Form 08-4181: "Business Licensing PO Box 110806, Juneau, AK 99811"; "Submit this application via U.S. mail, along
    // with all appropriate fees. Do not e-mail filings or payments."; "By my signature or electronic signature, I
    // confirm I am an authorized representative of the business". The online application is on the same site.
    portal: "www.commerce.alaska.gov", portalUrl: "https://www.commerce.alaska.gov/cbp/businesslicense/new/",
    mail: { name: "Business Licensing", line1: "PO Box 110806", city: "Juneau", state: "AK", zip: "99811" },
    signature: "typed", payment: "with_filing", onBehalf: "unstated",
    checked: ON, source: "https://www.commerce.alaska.gov/web/Portals/5/pub/bus4181.pdf",
    also: ["https://commerce.alaska.gov/web/cbpl/BusinessLicensing/NewBLOnline", "https://www.commerce.alaska.gov/web/cbpl/BusinessLicensing/ObtainBusinessLicenseNumber.aspx"],
  },
  "ak-esd-ui": {
    // Form TREG: "TO REGISTER ONLINE: Go to https://my.alaska.gov"; "SEND COMPLETED REGISTRATION FORM TO: ... Fax: (907)
    // 465-2374 Email: esd.tax@alaska.gov ... Alaska Department of Labor and Workforce Development Employment Security Tax
    // P.O. Box 115509 Juneau, AK 99811-5509"; "This registration form must be signed by the person completing the form."
    portal: "my.alaska.gov", portalUrl: "https://my.alaska.gov/",
    email: "esd.tax@alaska.gov",
    fax: { us: "+19074652374" },
    mail: { name: "Alaska Department of Labor and Workforce Development", line1: "Employment Security Tax", line2: "P.O. Box 115509", city: "Juneau", state: "AK", zip: "99811-5509" },
    signature: "wet", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://www.labor.state.ak.us/estax/forms/AER.pdf",
  },
};

/** Researched, and no channel Placetta can send on: each application is handed over at the agency's own inspection. */
export const WEST_TEAM_ONLY: Record<string, { why: string; source: string; checked: string }> = {
  "or-oda-retail": { why: "ODA presents the license application only at the approval inspection, which the business books by calling its inspector.", source: "https://www.oregon.gov/oda/food-safety/fs-licensing/Pages/application.aspx", checked: ON },
  "or-oda-processing-warehouse": { why: "ODA presents the license application only at the approval inspection, which the business books by calling its inspector.", source: "https://www.oregon.gov/oda/food-safety/fs-licensing/Pages/application.aspx", checked: ON },
  "ut-udaf-retail": { why: "UDAF completes the registration application with the business during the pre-operational inspection.", source: "https://ag.utah.gov/regulatory-services/retail-food-regulatory-program/", checked: ON },
  "ut-udaf-manufactured": { why: "UDAF completes the registration application with the business during the pre-operational inspection.", source: "https://ag.utah.gov/regulatory-services/manufactured-food/", checked: ON },
  "mt-wholesale-food": { why: "\"DPHHS will not accept license applications directly from applicants\": the county sanitarian submits it after inspecting.", source: "https://dphhs.mt.gov/assets/publichealth/FCS/SanitarianResourcePage/FCSForms/Wholesale/WholesaleFoodLicenseApplicationFB.pdf", checked: ON },
  "mt-retail-food": { why: "\"DPHHS will not accept license applications directly from applicants\": the county sanitarian submits it after inspecting.", source: "https://dphhs.mt.gov/assets/publichealth/FCS/SanitarianResourcePage/FCSForms/RetailFood/RFLicenseAppRev3.12.21front.back.pdf", checked: ON },
  "wy-wda-food": { why: "\"The license application is not available online and may be obtained from the local inspector or health department.\"", source: "https://agriculture.wy.gov/chs-information", checked: ON },
  "ak-dec-food": { why: "DEC's pages link the application but name no email, fax or mailing address for it.", source: "https://dec.alaska.gov/eh/fss/food/opening/", checked: ON },
  "hi-food-warehouse": { why: "The Food Safety Branch's pages name no channel for a new permit application; the branch is contacted for the application.", source: "https://health.hawaii.gov/food-drug", checked: ON },
};
