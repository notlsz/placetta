// Where the Midwest state filings (src/forms/states/midwest.json) go, each copied from the agency's own page on
// 2026-10-28. Only channels a page names. Left with no route (the Placetta team handles them): Ohio's food processing
// registration (the Department of Agriculture hands the application over after its inspection), Wisconsin's DATCP
// plant and warehouse licenses and Minnesota's MDA food licenses (no application form or filing address read: MDA's
// page says to contact its Licensing Liaison for the form, and has no online application).
import type { Dest } from "../destinations.ts";

const ON = "2026-10-28";

export const MIDWEST_DEST: Record<string, Dest> = {
  "il-idph-food": {
    // The application: "Mail completed application AND payment to: Illinois Department of Public Health ... Manufactured
    // Food Program, 525 W. Jefferson St, 3rd Floor, Springfield, IL 62761"; "Fees must be payable to the Illinois
    // Department of Public Health"; the page: "Applications must be submitted by mail".
    mail: { name: "Illinois Department of Public Health", line1: "Manufactured Food Program, Food, Dairies, and Devices Section", line2: "525 W. Jefferson St, 3rd Floor", city: "Springfield", state: "IL", zip: "62761" },
    signature: "wet", payment: "with_filing", payTo: "Illinois Department of Public Health", onBehalf: "unstated",
    attach: ["Floor plan", "Product labels", "Completed pre-inspection questionnaire"],
    checked: ON, source: "https://dph.illinois.gov/topics-services/food-safety/manufactured-food.html",
    also: ["https://dph.illinois.gov/content/dam/soi/en/web/idph/forms/topics-services/food-safety/manufactured-food/food-processing-plant-or-food-application.pdf"],
  },
  "in-sales": {
    // "You can register to collect sales tax and obtain a Registered Retail Merchant Certificate (RRMC) via InBiz"
    portal: "inbiz.in.gov", portalUrl: "https://inbiz.in.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: ON, source: "https://www.in.gov/dor/i-am-a/business-corp/sales-tax/",
  },
  "in-withholding": {
    // "How do I register as a new withholding agent? Register with DOR via INBiz."
    portal: "inbiz.in.gov", portalUrl: "https://inbiz.in.gov/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://www.in.gov/dor/i-am-a/business-corp/business-faq/",
  },
  "in-ui": {
    // "The organization should register online using the Uplink Employer Self Service (ESS) website, at
    // https://uplink.in.gov/ESS/ESSLogon.htm"
    portal: "uplink.in.gov", portalUrl: "https://uplink.in.gov/ESS/ESSLogon.htm",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://www.in.gov/dwd/indiana-unemployment/employers/employer-guide/accessing-ess/",
  },
  "in-idoh-food": {
    // "businesses must complete the online registration form available here" (redcap.isdh.in.gov).
    portal: "redcap.isdh.in.gov", portalUrl: "https://redcap.isdh.in.gov/surveys/?s=R84MJCTLNFJWHWEN",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://secure.in.gov/health/food-protection/wholesale-manufactured-foods-program/starting-a-wholesale-food-business-in-indiana/",
  },
  "oh-vendor-state": {
    // "Prospective retailers may obtain a vendor's license immediately through OH|TAX eServices. Note: Businesses must
    // first establish an account with eServices"; the register-for-taxes page links OH|TAX eServices to myportal.tax.ohio.gov/tap/_/.
    portal: "myportal.tax.ohio.gov", portalUrl: "https://myportal.tax.ohio.gov/tap/_/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: ON, source: "https://tax.ohio.gov/business/sales-and-use-tax",
    also: ["https://tax.ohio.gov/business/register-for-taxes"],
  },
  "oh-withholding": {
    // "Register online through OH|TAX eServices."
    portal: "myportal.tax.ohio.gov", portalUrl: "https://myportal.tax.ohio.gov/tap/_/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://tax.ohio.gov/business/employer-withholding",
    also: ["https://tax.ohio.gov/business/register-for-taxes"],
  },
  "mi-sales": {
    // "On the MTO homepage, click Start a New Business (E-Registration)" (mto.treasury.michigan.gov).
    portal: "mto.treasury.michigan.gov", portalUrl: "https://mto.treasury.michigan.gov/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://www.michigan.gov/taxes/business-taxes/new-biz",
    also: ["https://www.michigan.gov/taxes/business-taxes/new-biz/registration-faqs"],
  },
  "mi-withholding": {
    portal: "mto.treasury.michigan.gov", portalUrl: "https://mto.treasury.michigan.gov/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://www.michigan.gov/taxes/business-taxes/new-biz",
    also: ["https://www.michigan.gov/taxes/business-taxes/new-biz/registration-faqs"],
  },
  "mi-uia": {
    // "Register for most Michigan business taxes ... using an online e-Registration application" (milogintp.michigan.gov).
    portal: "milogintp.michigan.gov", portalUrl: "https://milogintp.michigan.gov/eai/tplogin/authenticate?URL=/uisecure/tpselfservice/sp/1746/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://www.michigan.gov/en/leo/bureaus-agencies/uia/employers",
  },
  "mi-mdard-food": {
    // "Mail In Your Application": the paper applications, to "Michigan Department of Agriculture & Rural Development,
    // P.O. Box 30776, Lansing, MI 48909-8276". The online route (the Licensing Portal System) signs in with MiLogin,
    // whose host the page doesn't name.
    mail: { name: "Michigan Department of Agriculture & Rural Development", line1: "P.O. Box 30776", city: "Lansing", state: "MI", zip: "48909-8276" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: ON, source: "https://www.michigan.gov/mdard/licensing/food/food-establishment-license/food-establishment-licensing-step-by-step-guide",
    also: ["https://www.michigan.gov/mdard/licensing/food/food-establishment-license/fees-and-schedule"],
  },
  "wi-seller": {
    // "Go to My Tax Account and select "Register a Business"" (tap.revenue.wi.gov/MTA); "The $20 BTR will be billed by
    // the department."
    portal: "tap.revenue.wi.gov", portalUrl: "https://tap.revenue.wi.gov/MTA",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: ON, source: "https://www.revenue.wi.gov/Pages/FAQS/using-mta-general-questions.aspx",
    also: ["https://www.revenue.wi.gov/Pages/FAQS/pcs-btr.aspx", "https://www.revenue.wi.gov/Pages/FAQS/pcs-seller.aspx"],
  },
  "wi-withholding": {
    portal: "tap.revenue.wi.gov", portalUrl: "https://tap.revenue.wi.gov/MTA",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: ON, source: "https://www.revenue.wi.gov/Pages/FAQS/using-mta-general-questions.aspx",
    also: ["https://www.revenue.wi.gov/Pages/FAQS/pcs-with.aspx"],
  },
  "wi-ui": {
    // "New Employer Registration (apply for a new UI account number)" links to unemployment.wisconsin.gov.
    portal: "unemployment.wisconsin.gov", portalUrl: "https://unemployment.wisconsin.gov/EmployerWelcome?target=UCB719Home.aspx",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://www.dwd.wisconsin.gov/uitax/",
  },
  "mn-withholding": {
    // "To register for a Minnesota Tax ID Number, go to our website"; the same e-Services registration as mn-tax.
    portal: "www.mndor.state.mn.us", portalUrl: "https://www.mndor.state.mn.us/tp/eservices/_/?link=NewBusinessReg",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://www.revenue.state.mn.us/sites/default/files/2025-12/wh-inst-26.pdf",
    also: ["https://www.revenue.state.mn.us/so/node/9571"],
  },
  "ia-sales": {
    // "Register via GovConnectIowa"; "These permits are free of charge."
    portal: "govconnect.iowa.gov", portalUrl: "https://govconnect.iowa.gov/tap/_/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://revenue.iowa.gov/taxes/business-permit-registration",
  },
  "ia-withholding": {
    portal: "govconnect.iowa.gov", portalUrl: "https://govconnect.iowa.gov/tap/_/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://revenue.iowa.gov/taxes/business-permit-registration",
  },
  "ia-ui": {
    // "all employers must register a UI tax account with Iowa Workforce Development (IWD) at" myiowaui.org.
    portal: "www.myiowaui.org", portalUrl: "https://www.myiowaui.org/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    notReady: "IWD's handbook says an agent must never use the employer's own login to myIowaUI (it calls that unauthorized access); Placetta would need its own registered agent account first.",
    checked: ON, source: "https://workforce.iowa.gov/employers/unemployment-insurance/unemployment-insurance-employer-handbook/employing-units",
  },
  "ia-dial-food": {
    // "Apply or Renew Online" (safher-portal.dial.iowa.gov); "Both Electronic Fund Transfer (EFT) AND credit/debit card
    // payments are accepted."
    portal: "safher-portal.dial.iowa.gov", portalUrl: "https://safher-portal.dial.iowa.gov/safher-portal",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: ON, source: "https://dial.iowa.gov/licenses/food-establishments-hotels/apply-food-license",
  },
  "mo-sales": {
    // "Online New Business Registration": "START REGISTRATION HERE" (mytax.mo.gov/rptp/portal/business/register-new-business/).
    portal: "mytax.mo.gov", portalUrl: "https://mytax.mo.gov/rptp/portal/business/register-new-business/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://dor.mo.gov/register-business/",
    also: ["https://dor.mo.gov/faq/taxation/business/registration.html"],
  },
  "mo-withholding": {
    portal: "mytax.mo.gov", portalUrl: "https://mytax.mo.gov/rptp/portal/business/register-new-business/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://dor.mo.gov/register-business/",
    also: ["https://dor.mo.gov/faq/taxation/business/registration.html"],
  },
  "mo-ui": {
    // DOR's registration page: "If you need to add unemployment tax to your existing account, visit" uinteract.labor.mo.gov;
    // DES: "An employer may do this online".
    portal: "uinteract.labor.mo.gov", portalUrl: "https://uinteract.labor.mo.gov/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: ON, source: "https://labor.mo.gov/des/employers/liability",
    also: ["https://dor.mo.gov/register-business/"],
  },
};
