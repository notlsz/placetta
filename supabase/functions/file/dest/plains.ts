// Where the plains states' filings go (src/forms/states/plains.json), each copied from the agency's own page on the day
// it was read. Merged into DEST in ../destinations.ts. A filing not here goes to the Placetta team: the food licenses that
// a county health department or a field office takes by hand (New Mexico, Oklahoma, Kansas, North Dakota, Colorado)
// have no channel their pages state.
import type { Dest } from "../destinations.ts";

const READ = "2026-10-28";

export const PLAINS_DEST: Record<string, Dest> = {
  "tx-dshs-food-mfr": {
    // the forms page links "Regulatory Services Online Licensing System" (vo.ras.dshs.state.tx.us) beside the paper forms
    portal: "vo.ras.dshs.state.tx.us", portalUrl: "https://vo.ras.dshs.state.tx.us/",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://www.dshs.texas.gov/food-manufacturers-wholesalers-warehouses/applications-forms-food-manufacturers-warehouse-operators-food-wholesalers-food-wholesale-registrants",
  },
  "tx-dshs-food-wholesale": {
    portal: "vo.ras.dshs.state.tx.us", portalUrl: "https://vo.ras.dshs.state.tx.us/",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://www.dshs.texas.gov/food-manufacturers-wholesalers-warehouses/applications-forms-food-manufacturers-warehouse-operators-food-wholesalers-food-wholesale-registrants",
  },
  "nm-trd-registration": {
    // "You will click 'Apply for a New Mexico Business Tax ID' and follow the prompts. Upon completion and approval of the
    // online application you may log in with the credentials set up during the application." "There is no fee".
    portal: "tap.state.nm.us", portalUrl: "https://tap.state.nm.us/TAP/_/",
    noLogin: true,
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: READ, source: "https://www.tax.newmexico.gov/businesses/who-must-register-a-business/",
  },
  "nm-dws-ui": {
    // "Register Now" (ui.dws.nm.gov ... RegisterEmployer.ASPX); "After registering ... You will also receive a notice with
    // a NMDWS Unemployment Insurance Tax System User ID and Password": the registration comes before any account
    portal: "ui.dws.nm.gov", portalUrl: "https://ui.dws.nm.gov/Employer/Revenue/Registration/EmployerRegistration/RegisterEmployer.ASPX",
    noLogin: true,
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://www.dws.nm.gov/UI-Tax-Information",
  },
  "ok-otc-sales": {
    // "A STP is also one of the items that must be obtained online from the OTC website" (OkTAP, linked on the page)
    portal: "oktap.tax.ok.gov", portalUrl: "https://oktap.tax.ok.gov/OkTAP/Web/_/",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://oklahoma.gov/business/operate/business-taxes.html",
  },
  "ok-otc-withholding": {
    portal: "oktap.tax.ok.gov", portalUrl: "https://oktap.tax.ok.gov/OkTAP/Web/_/",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://oklahoma.gov/business/operate/business-taxes.html",
  },
  "ok-oesc-ui": {
    // "please use the Create New User Id (Registration) link ... to create a User Id and Password which can then be used to
    // Login and Submit a Status Report if you do not currently have an Oklahoma Unemployment Account Id"
    portal: "eztaxexpress.oesc.ok.gov", portalUrl: "https://eztaxexpress.oesc.ok.gov/",
    account: "business",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://eztaxexpress.oesc.ok.gov/Access/LearMore",
  },
  "ks-kdor-sales": {
    // "To register for and pay your business taxes, you will need to set up an account with the Kansas Department of
    // Revenue Customer Service Center" (www.kdor.ks.gov/Apps/kcsc/login.aspx)
    portal: "www.kdor.ks.gov", portalUrl: "https://www.kdor.ks.gov/Apps/kcsc/login.aspx",
    account: "business",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://www.ksrevenue.gov/busregistration.html",
  },
  "ks-kdor-withholding": {
    portal: "www.kdor.ks.gov", portalUrl: "https://www.kdor.ks.gov/Apps/kcsc/login.aspx",
    account: "business",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://www.ksrevenue.gov/busregistration.html",
  },
  "ne-dor-sales": {
    // "complete the Form 20, and mail or fax it to DOR: Nebraska Department of Revenue PO Box 98903 Lincoln, NE 68509-8903
    // FAX: 402-471-5927"; "make sure ... the form is signed by the owner, partner, or corporate officer". Online: "register
    // online" goes through the state's sign-in (cio-centurion.ne.gov) to ndr-taxapp.ne.gov.
    fax: { us: "+14024715927" },
    mail: { name: "Nebraska Department of Revenue", line1: "PO Box 98903", city: "Lincoln", state: "NE", zip: "68509-8903" },
    portal: "ndr-taxapp.ne.gov", portalUrl: "https://ndr-taxapp.ne.gov/revtaxapp/pages/appWelcomePage.faces", alsoOn: ["cio-centurion.ne.gov"],
    signature: "wet", onBehalf: "unstated",
    checked: READ, source: "https://revenue.nebraska.gov/businesses/starting-business-nebraska",
    also: ["https://revenue.nebraska.gov/businesses/register-your-new-business-online"],
  },
  "ne-dor-withholding": {
    fax: { us: "+14024715927" },
    mail: { name: "Nebraska Department of Revenue", line1: "PO Box 98903", city: "Lincoln", state: "NE", zip: "68509-8903" },
    portal: "ndr-taxapp.ne.gov", portalUrl: "https://ndr-taxapp.ne.gov/revtaxapp/pages/appWelcomePage.faces", alsoOn: ["cio-centurion.ne.gov"],
    signature: "wet", onBehalf: "unstated",
    checked: READ, source: "https://revenue.nebraska.gov/businesses/starting-business-nebraska",
    also: ["https://revenue.nebraska.gov/businesses/register-your-new-business-online"],
  },
  "ne-ndol-ui": {
    // "Employers must complete a new employer registration to create an on-line account" (NEworks, linked from /UITax)
    portal: "neworks.nebraska.gov", portalUrl: "https://neworks.nebraska.gov/",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://dol.nebraska.gov/webdocs/Resources/Items/1_UI%20Tax%20Account%20Instruction%20guide.pdf",
    also: ["https://dol.nebraska.gov/UITax"],
  },
  "ne-nda-food-establishment": {
    // "Please fill out the request for permit document and submit to agr.foodsafety@nebraska.gov"; the form: "Please
    // complete the following Request for Permit electronically and email the completed file", with "Signature of the applicant"
    email: "agr.foodsafety@nebraska.gov",
    signature: "drawn", onBehalf: "unstated",
    checked: READ, source: "https://nda.nebraska.gov/fscp/foods/inspection_areas",
    also: ["https://nda.nebraska.gov/sites/default/files/fscp/foods/Request%20for%20Permit%20(printable).pdf"],
  },
  "ne-nda-food-processing": {
    email: "agr.foodsafety@nebraska.gov",
    signature: "drawn", onBehalf: "unstated",
    checked: READ, source: "https://nda.nebraska.gov/fscp/foods/inspection_areas",
    also: ["https://nda.nebraska.gov/sites/default/files/fscp/foods/Request%20for%20Permit%20(printable).pdf"],
  },
  "sd-dor-sales": {
    // "Apply for a tax license online at https://apps.sd.gov/rv23cedar/main/main.aspx"; "There is no fee"
    portal: "apps.sd.gov", portalUrl: "https://apps.sd.gov/rv23cedar/main/main.aspx", tenant: "/rv23cedar",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: READ, source: "https://dor.sd.gov/media/qn3a1y31/license-requirements-for-sales-use-contractors-excise-tax.pdf",
  },
  "sd-dlr-ui": {
    // "Reemployment Assistance Tax Business Registration" (apps.sd.gov/ld94empuimenu)
    portal: "apps.sd.gov", portalUrl: "https://apps.sd.gov/ld94empuimenu/default.aspx", tenant: "/ld94empuimenu",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://dlr.sd.gov/ra/businesses/registration.aspx",
  },
  "sd-doh-food-service": {
    // "Complete the Online Application and submit it with the correct fee." (sddoh.safefoodinspection.com)
    portal: "sddoh.safefoodinspection.com", portalUrl: "https://sddoh.safefoodinspection.com/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://doh.sd.gov/topics/food-lodging-safety/licensure-codes/food-service/",
  },
  "nd-tax-sales": {
    // "ND TAP" (tap.tax.nd.gov), linked from the page
    portal: "tap.tax.nd.gov", portalUrl: "https://tap.tax.nd.gov/",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://www.tax.nd.gov/starting-new-business",
  },
  "nd-tax-withholding": {
    // "Employers must register for an Income Tax Withholding account ... online through the North Dakota Taxpayer Access
    // Point (ND TAP). Register here"
    portal: "tap.tax.nd.gov", portalUrl: "https://tap.tax.nd.gov/",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://www.tax.nd.gov/income-tax-withholding",
  },
  "nd-jsnd-ui": {
    // "you will be directed to the State of North Dakota Login page where you will need to enter your User ID and Password
    // or Create Account" (apps.nd.gov/jsnd/uiiatax/login.htm)
    portal: "apps.nd.gov", portalUrl: "https://apps.nd.gov/jsnd/uiiatax/login.htm", tenant: "/jsnd",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://www.jobsnd.com/unemployment-business-tax/file-reports",
  },
  "nd-wsi": {
    // WSI's "Apply for Coverage" (forms.apps.mywsi.workforcesafety.com/?form=OAI), linked from its FAQ as "applied for coverage"
    portal: "forms.apps.mywsi.workforcesafety.com", portalUrl: "https://forms.apps.mywsi.workforcesafety.com/?form=OAI",
    signature: "typed", onBehalf: "unstated",
    checked: READ, source: "https://www.nd.gov/faq/workforce-safety-and-insurance-faq",
    also: ["https://www.workforcesafety.com/employers/insurance-coverage-information"],
  },
};
