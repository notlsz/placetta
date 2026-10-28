// Where the southern states' filings go (src/forms/states/south.json), each copied from the agency's own page on
// 2026-10-28. Only the channels a page states are here; the rest (Louisiana's sanitarian offices, Kentucky's area food
// inspectors, Tennessee's and North Carolina's unemployment registration, Kentucky's KUIP and South Carolina's RVC
// portal, whose hosts no page read names) stay with the Placetta team.
import type { Dest } from "../destinations.ts";

const READ = "2026-10-28";
const GDA = { line1: "19 Martin Luther King Jr Dr SW", line2: "Room 306", city: "Atlanta", state: "GA", zip: "30334" };

export const SOUTH_DEST: Record<string, Dest> = {
  // "Ways to Apply: Apply Online" links foodpermit.fdacs.gov, the "Food Permit Owner Registration Center"; "An email with
  // payment instructions will be sent to the owner's designated email address once FDACS conducts an inspection".
  "fl-fdacs-wholesale": {
    portal: "foodpermit.fdacs.gov", portalUrl: "https://foodpermit.fdacs.gov/",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: READ, source: "https://www.fdacs.gov/Business-Services/Food/Food-Establishments/Wholesale-Manufactured-Food-Establishment-Permit",
  },
  "fl-fdacs-retail": {
    portal: "foodpermit.fdacs.gov", portalUrl: "https://foodpermit.fdacs.gov/",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: READ, source: "https://www.fdacs.gov/Business-Services/Food/Food-Establishments/Retail-Food-Establishment-Permit",
  },
  // The application prints "Return Completed Documents To: Manufactured Food Program By Email:
  // ManufacturedFoodInfo@agr.georgia.gov" and the Room 306 address, with an "APPLICANT - SIGNATURE" line. The page:
  // "you will be notified by email how to log in and pay your license fee".
  "ga-gda-manufacturer": {
    email: "ManufacturedFoodInfo@agr.georgia.gov",
    mail: { name: "Georgia Department of Agriculture, Manufactured Food Program", ...GDA },
    signature: "wet", payment: "invoice",
    checked: READ, source: "https://agr.georgia.gov/sites/default/files/documents/assets/Food%20Sales%20License%20Application%20-%20Manufacturers.pdf",
    also: ["https://agr.georgia.gov/food-establishment-licenses-manufacturers"],
  },
  "ga-gda-retail": {
    email: "RetailFoodInfo@agr.georgia.gov",
    mail: { name: "Georgia Department of Agriculture, Retail Food Program", ...GDA },
    signature: "wet", payment: "invoice",
    checked: READ, source: "https://agr.georgia.gov/sites/default/files/documents/assets/Food%20Sales%20License%20Application%20-%20Retailers.pdf",
    also: ["https://agr.georgia.gov/food-establishment-licenses-retailers"],
  },
  // "Businesses must use My Alabama Taxes to apply online"; the page links myalabamataxes.alabama.gov/?link=newbusiness.
  // "a service provided by the Alabama Department of Revenue at no charge to the registrant".
  "al-tax": {
    portal: "myalabamataxes.alabama.gov", portalUrl: "https://myalabamataxes.alabama.gov/?link=newbusiness",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: READ, source: "https://www.revenue.alabama.gov/sales-use/business-tax-online-registration-system/",
  },
  // SR-2 prints "649 MONROE STREET MONTGOMERY, ALABAMA 36131 ... FAX: (334) 954-4731 EMAIL: status@labor.alabama.gov";
  // the FAQ adds "Status Unit 649 Monroe Street, Room 4201". "IF CPA, TAX PREPARER, ETC., IS ONLY SIGNATURE, PLEASE
  // ENCLOSE POWER OF ATTORNEY."
  "al-sr2": {
    email: "status@labor.alabama.gov",
    fax: { us: "+13349544731" },
    mail: { name: "Alabama Department of Workforce, Unemployment Compensation Division, Status Unit", line1: "649 Monroe Street", line2: "Room 4201", city: "Montgomery", state: "AL", zip: "36131" },
    // the employer signs it, so no power of attorney goes with it (the form asks for one only when a CPA or preparer signs)
    signature: "wet", payment: "none", onBehalf: "unstated",
    checked: READ, source: "https://adol.alabama.gov/wp-content/uploads/2023/11/uc_sr2_application.pdf",
    also: ["https://adol.alabama.gov/faq/how-does-my-business-register-as-a-new-employer/"],
  },
  // "submit the following documents to manufacturedfood@adph.state.al.us" (the address is the page's protected email
  // link); "Once the documentation is reviewed and approved, an application will be emailed to the applicant."
  "al-adph-mfp": {
    email: "manufacturedfood@adph.state.al.us",
    signature: "none",
    attach: ["Equipment Layout Drawing", "Descriptions of Foods Produced", "Process Flow", "Food Safety Plan"],
    checked: READ, source: "https://www.alabamapublichealth.gov/foodsafety/mfp/permitting.html",
  },
  // "WE ACCEPT CHECK OR MONEY ORDER ONLY Make Payable to: Alabama Department of Agriculture / Food Safety Section";
  // "Application must be signed."
  "al-adai-food": {
    mail: { name: "Alabama Department of Agriculture and Industries, Food Safety Section", line1: "1445 Federal Drive", line2: "Room 220", city: "Montgomery", state: "AL", zip: "36107-1123" },
    signature: "wet", payment: "with_filing", payTo: "Alabama Department of Agriculture / Food Safety Section",
    checked: READ, source: "https://agi.alabama.gov/foodsafety/wp-content/uploads/sites/8/2022/02/2026-2027-fs-application.pdf",
  },
  // "You may register for most taxes online through TAP." (read with WebFetch: dor.ms.gov fails curl's certificate
  // check); TAP is tap.dor.ms.gov.
  "ms-dor-tax": {
    portal: "tap.dor.ms.gov", portalUrl: "https://tap.dor.ms.gov/",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://dor.ms.gov/business/sales-use-tax/register-taxes",
  },
  // "For Reporting and Payment of Unemployment Taxes, please click HERE to Register a New Business" (accessmstax.mdes.ms.gov).
  "ms-mdes-ui": {
    portal: "accessmstax.mdes.ms.gov", portalUrl: "https://accessmstax.mdes.ms.gov/accessmstax/faces/login/login.xhtml",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: READ, source: "https://mdes.ms.gov/employers/register-with-us/",
  },
  // "Complete the Food Permit application and Plan Review. Send it to the address listed on the Plan Review, or e-mail it
  // to food@msdh.ms.gov (retail facilities) or mfgfoods@msdh.ms.gov (manufacturers)"; fees by emailed link.
  "ms-msdh-retail": {
    email: "food@msdh.ms.gov",
    signature: "wet", payment: "invoice",
    checked: READ, source: "https://msdh.ms.gov/Page/30,0,77,311.html",
  },
  "ms-msdh-manufactured": {
    email: "mfgfoods@msdh.ms.gov",
    signature: "wet", payment: "invoice",
    checked: READ, source: "https://msdh.ms.gov/Page/30,0,77,311.html",
  },
  // "New businesses can register their LDR tax accounts by visiting the LaTAP website and clicking on the Register My
  // Business link" (latap.revenue.louisiana.gov).
  "la-ldr-tax": {
    portal: "latap.revenue.louisiana.gov", portalUrl: "https://latap.revenue.louisiana.gov/",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://revenue.louisiana.gov/businesses/general-resources/business-registration/",
  },
  // The employer menu links "Register for an Unemployment Tax Account" to laors.laworks.net, which opens on laors9.
  "la-lwc-ui": {
    portal: "laors.laworks.net", portalUrl: "https://laors.laworks.net/lastatusreport/register/index.asp", alsoOn: ["laors9.laworks.net"],
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: READ, source: "https://www.laworks.net/UnemploymentInsurance/UI_Employers.asp",
    also: ["https://www.laworks.net/FAQs/FAQ_UI_EmployerTaxes.asp"],
  },
  // "Click Here to Apply Now" (atap.arkansas.gov/?link=REGISTER); "$50.00 sales tax permit fee to be paid electronically".
  "ar-dfa-tax": {
    portal: "atap.arkansas.gov", portalUrl: "https://atap.arkansas.gov/?link=REGISTER",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://www.dfa.arkansas.gov/office/taxes/excise-tax-administration/sales-use-tax/register-for-a-tax-account/",
  },
  // "Apply for a new DWS Employer Account Number." on the Tax 21 employer services site, which www.workforce.arkansas.gov/Tax21 opens.
  "ar-dws-ui": {
    portal: "tax21.reemployment.acom.arkansas.gov", portalUrl: "https://tax21.reemployment.acom.arkansas.gov/", alsoOn: ["www.workforce.arkansas.gov"],
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: READ, source: "https://www.workforce.arkansas.gov/Tax21/Home.aspx?2",
  },
  // "Submit to: Arkansas Department of Health Food Protection Services 4815 W. Markham St., Slot 46 Little Rock, AR
  // 72205", "WITH THE APPROPRIATE FEES (CHECK OR MONEY ORDER)", signed by the owner or responsible representative.
  "ar-adh-retail": {
    mail: { name: "Arkansas Department of Health, Food Protection Services", line1: "4815 W. Markham St.", line2: "Slot 46", city: "Little Rock", state: "AR", zip: "72205" },
    signature: "wet", payment: "with_filing",
    checked: READ, source: "https://healthy.arkansas.gov/wp-content/uploads/Food-Permit-Application-10.2025.pdf",
  },
  // "Taxpayers may register for a sales and use tax account online through the Tennessee Taxpayer Access Point (TNTAP)."
  // and "There is no charge" (WebFetch); the Department's registration page links tntap.tn.gov/eservices/_/.
  "tn-dor-sales": {
    portal: "tntap.tn.gov", portalUrl: "https://tntap.tn.gov/eservices/_/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: READ, source: "https://www.tn.gov/revenue/taxes/sales-and-use-tax/registration.html",
    also: ["https://revenue.support.tn.gov/hc/en-us/articles/360058139252-SUT-10-Sales-and-Use-Tax-Account-Registering-for-an-Account"],
  },
  // "Applications and documentation can be submitted to NewFood.business@TN.gov if they are not submitted through the
  // online application"; "The invoice will be emailed upon approval of the application."
  "tn-tda-warehouse": {
    email: "NewFood.business@TN.gov",
    signature: "wet", payment: "invoice",
    checked: READ, source: "https://www.tn.gov/agriculture/consumers/food-safety/ag-farms-food-manufacturing-and-warehousing/startup.html",
  },
  // "The completed questionnaire and required documentation can be sent as email attachments to NewFood.Business@TN.gov
  // or mailed to Tennessee Department of Agriculture Consumer and Industry Services Attn: Food and Dairy P.O. Box 40627".
  "tn-tda-retail": {
    email: "NewFood.Business@TN.gov",
    mail: { name: "Tennessee Department of Agriculture, Consumer and Industry Services", line1: "Attn: Food and Dairy", line2: "P.O. Box 40627", city: "Nashville", state: "TN", zip: "37204" },
    signature: "wet",
    checked: READ, source: "https://www.tn.gov/agriculture/consumers/food-safety/ag-businesses-retail-food-establishments.html",
  },
  // Form 10A100: "SEND completed application to: KENTUCKY DEPARTMENT OF REVENUE DIVISION OF REGISTRATION 501 HIGH STREET,
  // STATION 20 FRANKFORT, KENTUCKY 40602-0299 FAX: 502-227-0772 E-MAIL: DOR.Registration@ky.gov", with a signature line.
  "ky-10a100": {
    email: "DOR.Registration@ky.gov",
    fax: { us: "+15022270772" },
    mail: { name: "Kentucky Department of Revenue, Division of Registration", line1: "501 High Street, Station 20", city: "Frankfort", state: "KY", zip: "40602-0299" },
    signature: "wet",
    checked: READ, source: "https://revenue.ky.gov/Forms/10A100(P)(4-25)_FINAL_locked%20Fill-in.pdf",
    also: ["https://revenue.ky.gov/Business/Pages/Register-Business.aspx"],
  },
  // "To apply, use the Business Tax Application on MyDORWAY" (mydorway.dor.sc.gov); "If your Business Tax Account
  // requires a fee, we will not process your Business Tax Application without your payment."
  "sc-dor-retail": {
    portal: "mydorway.dor.sc.gov", portalUrl: "https://mydorway.dor.sc.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://dor.sc.gov/businesses/apply-business-tax-account/licensing-retail-license",
  },
  // "To register a new Employer for an Unemployment Insurance account as an Agent using the Self-Service Portal ... SUITS
  // sends a work item to the UI agency to review the Power of Attorney (POA) document."
  "sc-dew-ui": {
    portal: "uitax.dew.sc.gov", portalUrl: "https://uitax.dew.sc.gov/",
    signature: "typed", payment: "none",
    onBehalf: "authorization", authorization: "Power of Attorney (POA) document",
    checked: READ, source: "https://uitax.dew.sc.gov/scuiprod/onlinehelp/NetHelp/Documents/faq2.htm",
    also: ["https://uitax.dew.sc.gov/scuiprod/onlinehelp/nethelp/Documents/agentregistersemployer1.htm"],
  },
  // "Apply for a Retail Food Establishment Permit" opens SCDA's retail food registration site ("Sign in or create a new
  // account"); "Payments can be made online using Visa, Mastercard, or Discover".
  "sc-scda-retail": {
    portal: "retailfoodregistration.agriculture.sc.gov", portalUrl: "https://retailfoodregistration.agriculture.sc.gov/Registration/Account/Loginuser",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://agriculture.sc.gov/permits-and-inspections/retail-food-safety/",
  },
  // "Register Your Business Electronically" (eservices.dor.nc.gov/ncbusreg/); "There is no fee to use the Department's
  // online business registration system."
  "nc-dor-br": {
    portal: "eservices.dor.nc.gov", portalUrl: "https://eservices.dor.nc.gov/ncbusreg/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: READ, source: "https://www.ncdor.gov/registration",
  },
};
