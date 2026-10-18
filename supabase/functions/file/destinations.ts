// Where each official form may be sent. The file dispatcher sends only to these; a destination from the client is
// never used. Every entry is copied from the agency's own page, with the page and the date someone checked it.
// Re-check each entry every quarter: the monitor opens a team task when one is older than 90 days.
//
// Keys are official form ids from src/forms/registry.ts, local-us.ts and world.ts. A form that isn't here goes to the
// Placetta team; TEAM_ONLY below says why for the ones that were researched and have no route Placetta can use.
// docs/FILING_COVERAGE.md is generated from this file by scripts/filing-coverage.mjs.

export type Address = { name: string; line1: string; line2?: string; city: string; state: string; zip: string; country?: string };

/** How the agency takes its fee, as its page says. */
export type Payment =
  | "none"          // no fee for this filing
  | "portal"        // paid on the agency's own site, where the person pays it themselves when the worker reaches that page
  | "invoice"       // billed after the agency has it (an emailed invoice or payment link); nothing goes with the filing
  | "with_filing"   // a check, money order or card form must go with it, or "fees are due at the time of application"
  | "in_person";    // paid at the counter, or to a private exam provider

/** The agency takes it only from the business itself: the owner (or the certified person) sends it, and Odelia
    prepares the packet. Each says why, in the agency's words where it has them, and where it goes. */
export type OwnerRoute = { why: string; url?: string; email?: string; mail?: Address };

export type Dest = {
  email?: string;                                   // agency inbox that accepts this form
  fax?: { us: string; foreign?: string };           // E.164; foreign = owner with no US address
  mail?: Address & { foreign?: Address };
  portal?: string;                                  // https host the worker may open, e.g. "bizfile.sos.ca.gov"
  portalUrl?: string;                               // the page the agency links to start it, on that host
  tenant?: string;                                  // on a host many agencies share (Accela, BTExpress), this agency's path
  alsoOn?: string[];                                // other hosts the portal's own pages send the browser to (its sign-in
                                                    // service, or the same app under the county's name), as the agency or its guide links them
  noLogin?: boolean;                                // the portal files without an account (the worker opens it with no saved login)
  faxQuality?: "high" | "very_high";                // when the agency asks for a finer fax (the IRS asks for 300 DPI or more)
  owner?: OwnerRoute;                               // only the business can submit it: an owner packet, never a send
  signature: "none" | "typed" | "drawn" | "wet";    // what the agency accepts on this form
  payment?: Payment;                                // how its fee is paid; any fee sends email, fax and mail to the team
  onBehalf?: "allowed" | "authorization" | "unstated";   // whether a filer may submit it for the business
  authorization?: string;                           // with "authorization": the signed document the agency asks for
  attach?: string[];                                // what the agency says goes with it, as it prints them
  checked: string;                                  // YYYY-MM-DD someone confirmed it on the agency's page
  source: string;                                   // that page
  also?: string[];                                  // other agency pages read for this entry
};

/** Verified destinations. Only these are used. */
export const DEST: Record<string, Dest> = {
  "irs-ss4": {
    // Foreign applicants: the IRS lists 855-215-1627 for faxes sent from within the US (Placetta's fax number is
    // in the US) and 304-707-9471 from outside it.
    fax: { us: "+18556416935", foreign: "+18552151627" },
    mail: {
      name: "Internal Revenue Service", line1: "Attn: EIN Operation", city: "Cincinnati", state: "OH", zip: "45999",
      foreign: { name: "Internal Revenue Service", line1: "Attn: EIN International Operation", city: "Cincinnati", state: "OH", zip: "45999" },
    },
    signature: "wet",                                 // until the IRS e-signature list includes Form SS-4
    payment: "none",
    checked: "2026-10-07",                            // page last reviewed 28-Apr-2026
    source: "https://www.irs.gov/filing/where-to-file-your-taxes-for-form-ss-4",
  },

  // ---- From the line-by-line research of 2026-10-13 (research/lines). Each value is copied from the source page. ----
  "hou-food-dealer": {
    email: "Food-COO@houstontx.gov",                  // "Applications can be submitted via email at Food-COO@houstontx.gov."
    signature: "none",                                // the form has no signature line
    checked: "2026-10-13",
    source: "https://www.houstonhealth.org/media/14901/download",
  },
  "hou-co": {
    email: "Occupancy.Inspections@houstontx.gov",     // printed on CE-1045-A
    mail: { name: "City of Houston, Occupancy Inspections Section", line1: "P.O. Box 2688", city: "Houston", state: "TX", zip: "77252-2688" },
    signature: "wet",                                 // an "Applicant Signature" line; electronic signatures not addressed
    payment: "invoice",                               // iPermits sends a payment link after processing
    checked: "2026-10-13",
    source: "https://www.houstonpermittingcenter.org/media/941/download",
  },
  "ny-dol-100": {
    fax: { us: "+15184858010" },
    mail: { name: "NYS Department of Labor, Unemployment Insurance Division, Registration Section", line1: "Harriman State Office Campus, Building 12", city: "Albany", state: "NY", zip: "12240-0339" },
    portal: "www.businessexpress.ny.gov",
    signature: "wet",                                 // "This form must be signed by the person completing it."
    payment: "none",
    checked: "2026-10-13",
    source: "https://dol.ny.gov/system/files/documents/2021/02/nys100-1.pdf",
  },
  "ny-dos-pub": {
    mail: { name: "New York Department of State, Division of Corporations", line1: "One Commerce Plaza, 99 Washington Avenue", city: "Albany", state: "NY", zip: "12231" },
    signature: "wet",
    payment: "with_filing",                           // the $50 fee goes with the certificate and affidavits
    checked: "2026-10-13",
    source: "https://dos.ny.gov/certificate-publication-domestic-limited-liability-company-0",
  },
  "tx-205": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    signature: "drawn",                               // "A wet ink signature is not required. Copies and electronically signed documents are accepted."
    payment: "with_filing",
    checked: "2026-10-13",
    source: "https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml",
  },
  "tx-304": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    portal: "direct.sos.state.tx.us",                 // SOSDirect: "Payments for web filings may be made by credit card or client account" (help-corp-filing-304)
    signature: "drawn",
    payment: "with_filing",
    checked: "2026-10-13",
    source: "https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml",
  },
  "tx-503": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    signature: "drawn",
    payment: "with_filing",
    checked: "2026-10-13",
    source: "https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml",
  },
  // Austin Public Health's page (2026-10-18) now sends City of Austin plan reviews to Development Services and takes the
  // pre-opening inspection and the operational permit online at My Health Department ("Log in to your account. Select:
  // Retail and Wholesale Food Applications -> Pre-Opening Inspection" / "Food Enterprise → Operational Permit
  // Application"; "Upload required documents, sign, and submit"). It prints the mailing address as PO Box 142529,
  // Austin, TX 78767 where the forms print 78714, so mail is left out until the two agree.
  "aus-food-preopening": {
    email: "ehsd.service@austintexas.gov",           // printed on the pre-opening form
    portal: "myhealthdepartment.com", portalUrl: "https://myhealthdepartment.com/APH/login", tenant: "/APH",
    signature: "wet",
    checked: "2026-10-18",
    source: "https://www.austintexas.gov/health/programs/fixed-food-establishments",
    also: ["https://www.austintexas.gov/sites/default/files/files/APH%20Comms/Food-Pre-Opening-Revise.pdf"],
  },
  "aus-food-permit": {
    portal: "myhealthdepartment.com", portalUrl: "https://myhealthdepartment.com/APH/login", tenant: "/APH",
    signature: "wet",                                 // names must match the photo ID; email is not a route for this form
    checked: "2026-10-18",
    source: "https://www.austintexas.gov/health/programs/fixed-food-establishments",
    also: ["https://www.austintexas.gov/sites/default/files/files/Health/Environmental/Food/Operational_Permit_Application_FFE_EN_110118_TC.pdf"],
  },
  // DallasNow is Accela Citizen Access: "You can access DallasNow portal on this page or directly at
  // https://aca-prod.accela.com/dallastx" (dallascityhall.com/departments/sustainabledevelopment/Pages/DallasNow.aspx, 2026-10-18).
  "dal-co": { portal: "aca-prod.accela.com", portalUrl: "https://aca-prod.accela.com/dallastx", tenant: "/dallastx", signature: "typed", payment: "portal", checked: "2026-10-13", source: "https://dallascityhall.com/departments/sustainabledevelopment/buildinginspection/Pages/certificate_occupancy.aspx", also: ["https://dallascityhall.com/departments/sustainabledevelopment/Pages/DallasNow.aspx"] },
  "dal-building": { portal: "aca-prod.accela.com", portalUrl: "https://aca-prod.accela.com/dallastx", tenant: "/dallastx", signature: "typed", payment: "portal", checked: "2026-10-13", source: "https://dallascityhall.com/departments/sustainabledevelopment/DCH%20documents/3.%20Applying%20for%20a%20Commercial%20Alteration%20and%20Addition%20Application.pdf", also: ["https://dallascityhall.com/departments/sustainabledevelopment/Pages/DallasNow.aspx"] },
  "sf-business-registration": { portal: "etaxstatement.sfgov.org", signature: "typed", payment: "portal", checked: "2026-10-13", source: "https://sftreasurer.org/business/register-business" },
  "sj-building-ti": { portal: "sjpermits.org", portalUrl: "https://www.sjpermits.org/", signature: "drawn", payment: "portal", checked: "2026-10-13", source: "https://www.sanjoseca.gov/businesses/development-services-permit-center/start-your-project/commercial-industrial-properties/tenant-improvement" },
  "sj-sign": { portal: "sjpermits.org", portalUrl: "https://www.sjpermits.org/", signature: "drawn", payment: "invoice", checked: "2026-10-13", source: "https://www.sanjoseca.gov/business/development-services-permit-center/online-permits-at-sjpermits-org/planning-online-permits" },
  "aus-building": { portal: "abc.austintexas.gov", signature: "typed", payment: "invoice", checked: "2026-10-13", source: "https://www.austintexas.gov/development-services/commercial-plan-review" },
  "la-ladbs": { portal: "eplanla.lacity.org", signature: "typed", checked: "2026-10-13", source: "https://dbs.lacity.gov/" },

  // ---- Read from the agencies' own pages on 2026-10-13 (federal, California, Los Angeles, New York). ----
  "irs-5472": {
    // Foreign-owned U.S. DEs: "Fax ... to 855-887-7737" (300 DPI or higher) or mail; "you cannot file Form 5472 electronically."
    fax: { us: "+18558877737", foreign: "+18558877737" },
    faxQuality: "very_high",
    mail: { name: "Internal Revenue Service", line1: "1973 Rulon White Blvd", line2: "M/S 6112 Attn: PIN Unit", city: "Ogden", state: "UT", zip: "84201" },
    signature: "wet",                                 // signed with the pro forma Form 1120
    payment: "none",
    checked: "2026-10-13",
    source: "https://www.irs.gov/zh-hant/instructions/i5472",
  },
  "irs-w7": {
    // Mailed with original or certified identity documents, so the person or the team always sends it.
    mail: { name: "Internal Revenue Service, Austin Service Center", line1: "ITIN Operation", line2: "P.O. Box 149342", city: "Austin", state: "TX", zip: "78714-9342" },
    signature: "wet",
    payment: "none",
    checked: "2026-10-13",
    source: "https://irs.gov/tin/itin/how-to-apply-for-an-itin",
  },
  "fincen-boir": {
    // "Go to boiefiling.fincen.gov"; no account; an hCaptcha before submitting, which the worker hands to the person.
    // Since March 21, 2025 only companies formed under a foreign country's law and registered in a US state file.
    portal: "boiefiling.fincen.gov",
    noLogin: true,
    signature: "none",
    payment: "none",
    checked: "2026-10-13",
    source: "https://boiefiling.fincen.gov/resources/BOIR_E-File_Online_Step-by-Step_Instructions.pdf",
  },
  "ca-cdtfa": {
    // "Register Online" links to onlineservices.cdtfa.ca.gov; "There is no charge for a seller's permit."
    portal: "onlineservices.cdtfa.ca.gov",
    signature: "none",
    payment: "none",
    checked: "2026-10-13",
    source: "https://cdtfa.ca.gov/formspubs/pub107/applying-for-a-sellers-permit.htm",
  },
  "ny-dtf-17": {
    // "register with the Tax Department through New York Business Express"; needs a NY.gov Business account
    portal: "www.businessexpress.ny.gov",
    signature: "none",
    payment: "none",
    checked: "2026-10-13",
    source: "https://tax.ny.gov/bus/st/register.htm",
  },
  "ny-dos-1336": {
    // "$200 ... forwarded to the New York Department of State, Division of Corporations"; a fee, so the team sends it
    mail: { name: "New York Department of State, Division of Corporations", line1: "One Commerce Plaza, 99 Washington Avenue", city: "Albany", state: "NY", zip: "12231" },
    signature: "wet",
    payment: "with_filing",
    checked: "2026-10-13",
    source: "https://dos.ny.gov/limited-liability-company-articles-organization",
  },
  "fda-ffr": {
    // FDA Industry Systems at www.access.fda.gov, "created to facilitate making submissions to FDA, including registrations"
    portal: "www.access.fda.gov",
    signature: "none",
    payment: "none",
    checked: "2026-10-13",
    source: "https://www.fda.gov/food/registration-food-facilities",
  },

  // ---- Read from the agencies' own pages on 2026-10-18 for the 33 metros, their states and the federal forms. ----
  // Pages that refuse scripted reads were read through a reader service; the cited page is the agency's own.
  // New York City
  "nyc-fse": {
    // NYC Business: "Create an account with the NYC Online Licensing system", select "Food Service Establishment (General)",
    // upload the documents, "Pay with a credit or debit card to complete the application." Someone else submitting needs
    // "a completed Power of Attorney/Authority to Act form".
    portal: "a816-hlst.nyc.gov", portalUrl: "https://a816-hlst.nyc.gov/CitizenAccess/",
    signature: "typed", payment: "portal", onBehalf: "authorization", authorization: "Power of Attorney/Authority to Act form",
    attach: ["Food Protection Certificate or course registration", "Certificate of Authority to Collect Sales Tax", "Workers' compensation and disability insurance certificates naming DOHMH as certificate holder, or Form CE-200", "Power of Attorney/Authority to Act form"],
    checked: "2026-10-18", source: "https://nyc-business.nyc.gov/nycbusiness/description/food-service-establishment-permit",
  },
  "nyc-crt": {
    // "File online with e-Services" (www.nyc.gov/eservices, which opens a836-btseservices.nyc.gov/production/eservices/).
    portal: "a836-btseservices.nyc.gov", portalUrl: "https://a836-btseservices.nyc.gov/production/eservices/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.nyc.gov/site/finance/business/business-commercial-rent-tax-crt.page",
    also: ["https://www.nyc.gov/assets/finance/jump/eservices.html"],
  },
  // California, Los Angeles, Texas
  "la-btrc": {
    // "The fastest way to register is online" (latax.lacity.org/businessregapp); the forms page: "all other forms can be
    // submitted via email as an attachment ... Finance.CustomerService@lacity.org", and an emailed form "has the same
    // legal effect" as one mailed. The first year's tax is paid at renewal, so nothing is due with the registration.
    email: "Finance.CustomerService@lacity.org",
    portal: "latax.lacity.org", portalUrl: "https://latax.lacity.org/businessregapp/eappreg_criteria",
    signature: "drawn", payment: "none",
    checked: "2026-10-18", source: "https://finance.lacity.gov/tax-education/new-business-registration/how-register-btrc",
    also: ["https://finance.lacity.gov/business-tax-forms"],
  },
  "tx-ap201": {
    // "Email the application to sales.applications@cpa.texas.gov or fax the application to 512-936-0010" (paper AP-201,
    // owners without an SSN); everyone else uses "Apply for Permit via eSystems" (security.app.cpa.state.tx.us).
    email: "sales.applications@cpa.texas.gov", fax: { us: "+15129360010" },
    portal: "security.app.cpa.state.tx.us", portalUrl: "https://security.app.cpa.state.tx.us/",
    signature: "wet", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://comptroller.texas.gov/taxes/permit/",
  },
  "tx-franchise": {
    // "eSystems/Webfile Login" (security.app.cpa.state.tx.us): the annual report, or the Public Information or
    // Ownership Report at or below the no tax due threshold.
    portal: "security.app.cpa.state.tx.us", portalUrl: "https://security.app.cpa.state.tx.us/",
    signature: "none", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://comptroller.texas.gov/taxes/franchise/",
  },
  "tx-twc": {
    // "Registering is easy with Unemployment Tax Registration (UTR), TWC's quick and free online service" (UTR sign-in:
    // apps.twc.texas.gov/UITAXREG/security/logon.do); "register ... within 10 days of becoming liable".
    portal: "apps.twc.texas.gov", portalUrl: "https://apps.twc.texas.gov/UITAXREG/security/logon.do",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.twc.texas.gov/services/register-tax",
  },
  "aus-hazmat": {
    // Austin Fire permits: "Hazardous Materials Storage (Above Ground) ... How to Apply: AB+C Portal" (abc.austintexas.gov).
    portal: "abc.austintexas.gov", portalUrl: "https://abc.austintexas.gov/",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.austintexas.gov/development-services/small-business-permitting",
  },
  "tx-food-manager": {
    owner: {
      why: "Certification comes from passing an exam at a DSHS-licensed program or test site: \"Do not apply or send money to DSHS\".",
      url: "https://www.dshs.texas.gov/retail-food-establishments/licensing-certified-food-manager-training-programs",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-18", source: "https://www.dshs.texas.gov/retail-food-establishments/licensing-certified-food-manager-training-programs",
  },
  "tx-food-handler": {
    owner: {
      why: "Each employee completes an accredited food handler course \"within 30 days of getting a job\"; nothing is filed with the state.",
      url: "https://www.dshs.texas.gov/retail-food-establishments/licensing-food-handler-training-programs",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-18", source: "https://www.dshs.texas.gov/retail-food-establishments/licensing-food-handler-training-programs",
  },
  "ca-edd-de1": {
    // Existing portal, plus the paper DE 1: "Mail your completed form to: Employment Development Department, Account
    // Services Group, MIC 28, PO Box 826880, Sacramento, CA 94280-0001. Fax: 1-916-654-9211."
    portal: "eddservices.edd.ca.gov",
    fax: { us: "+19166549211" },
    mail: { name: "Employment Development Department", line1: "Account Services Group, MIC 28", line2: "PO Box 826880", city: "Sacramento", state: "CA", zip: "94280-0001" },
    signature: "wet", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://edd.ca.gov/en/payroll_taxes/step-3-register-for-a-payroll-tax-account/",
  },
  "la-cupa-hmbp": {
    // "electronically submitted in CERS" (sign-in at cersbusiness3.calepa.ca.gov); the page lists "third-party
    // contractors that can develop and submit a HMBP for your facility".
    portal: "cersbusiness3.calepa.ca.gov", portalUrl: "https://cersbusiness3.calepa.ca.gov/Account/SignIn",
    signature: "typed", onBehalf: "allowed",
    checked: "2026-10-18", source: "https://lafd.org/fire-prevention/cupa/hazardous-materials",
  },
  "scc-plan-check": {
    // "Starting April 1, 2026, all plan check submittals must be sent by email. Printed plans and documents will no
    // longer be accepted." Then "we issue you an invoice for the initial plan review fees". The application has an
    // "Applicant Signature" line with nothing said about electronic signatures.
    email: "dehplancheck@deh.sccgov.org",
    signature: "wet", payment: "invoice", onBehalf: "unstated",
    attach: ["Food Plan Check Checklist", "Plans to scale (equipment, mechanical, finish schedule, plumbing, electrical)", "Proposed menu", "Equipment specification sheets"],
    checked: "2026-10-18", source: "https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/submit-plan-review-restaurants-grocery-stores-and",
    also: ["https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/food-safety-program/application-new-food-facility"],
  },
  "scc-health-permit": {
    // "Submit the application package by email or in-person"; "An invoice for the operating permit will be sent to
    // you after the final inspection."
    email: "dehplancheck@deh.sccgov.org",
    signature: "wet", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/submit-plan-review-restaurants-grocery-stores-and",
  },
  "sac-bot": {
    // "Submit your application(s) by email to finance@cityofsacramento.org, by mail to Revenue Division 915 I Street,
    // Room 1214, Sacramento, CA 95814 or in person. Fees are due at the time of application." Online: sacramento.hdlgov.com.
    // (The PDF's footer prints Room 1201; the page's submission line says 1214.)
    email: "finance@cityofsacramento.org",
    mail: { name: "City of Sacramento, Revenue Division", line1: "915 I Street, Room 1214", city: "Sacramento", state: "CA", zip: "95814" },
    portal: "sacramento.hdlgov.com", portalUrl: "https://sacramento.hdlgov.com/",
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.cityofsacramento.gov/finance/revenue/business-operations-tax",
    also: ["https://www.cityofsacramento.gov/content/dam/portal/finance/Revenue/permits-and-taxes/BUSINESS-TAX-app_Revised-12-2019-FILLABLE.pdf"],
  },
  // San Francisco, Oakland, San Diego, Orange County
  "sf-dph-health-permit": {
    // "Fill out the online health permit application" ("Apply for food permit" opens myhealthdepartment.com/san-francisco);
    // "You can save and return to this application at any time." The older DPH page: "Sign the Form Electronically".
    portal: "myhealthdepartment.com", portalUrl: "https://myhealthdepartment.com/san-francisco/login", tenant: "/san-francisco",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.sf.gov/get-health-permit-open-restaurant-bar-or-other-retail-food-location",
  },
  "sf-sign": {
    // "Apply online at PermitSF" (sanfranciscoca.portal.opengov.com); applying "on behalf of a property owner" needs the
    // owner's driver's license and the last section of a Property Owner Disclosure Form; "pay online from your PermitSF portal".
    portal: "sanfranciscoca.portal.opengov.com", portalUrl: "https://sanfranciscoca.portal.opengov.com/categories/1082/record-types/6473",
    signature: "typed", payment: "portal", onBehalf: "authorization",
    authorization: "Property Owner Disclosure Form (last section), or the Licensed Contractor Statement Form",
    attach: ["Plans, as a PDF upload", "Contractor license number and Business Account Number"],
    checked: "2026-10-18", source: "https://www.sf.gov/step-by-step--get-permit-install-sign-or-awning",
  },
  "oak-business-tax": {
    // "Apply for a New Business Tax Certificate online: oakland.hdlgov.com"; after it's processed "you will receive an
    // email ... including the amount due and instructions on how to pay online."
    portal: "oakland.hdlgov.com", portalUrl: "https://oakland.hdlgov.com/",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.oaklandca.gov/Business/Business-Taxes-Licenses-Permits/Apply-or-Renew-for-a-Business-License-or-Certificate",
  },
  "sdg-business-tax": {
    // "Business Tax applications may be submitted electronically, by mail or in person." Online needs "a username and
    // password"; by mail "include a check for $38.00 made payable to City Treasurer and send to: Office of the City
    // Treasurer, Business Tax Program, PO Box 122289, San Diego, CA 92112-2289". (btax@sandiego.gov is for questions.)
    portal: "pay.sandiego.gov", portalUrl: "https://pay.sandiego.gov/BTaxApp",
    mail: { name: "Office of the City Treasurer", line1: "Business Tax Program", line2: "PO Box 122289", city: "San Diego", state: "CA", zip: "92112-2289" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.sandiego.gov/treasurer/taxesfees/btax/btaxhow",
  },
  "oc-plan-check": {
    // "Submit your plan check application online" ("Ready to Start Plan Check Submittal": myhealthdepartment.com/orange-county);
    // "our team will email you upload links for your plans"; "After upload, you'll receive an email with the assessed fees".
    portal: "myhealthdepartment.com", portalUrl: "https://myhealthdepartment.com/orange-county", tenant: "/orange-county",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    attach: ["Menu", "Equipment specification sheets"],
    checked: "2026-10-18", source: "https://www.ochealthinfo.com/services-programs/environmental-health/plan-check",
  },
  // San José, Fort Worth, San Antonio and Florida
  "sj-building-final": {
    // "Go to SJPermits.org and select “Schedule an Inspection”": the final is booked on the permit's own account.
    portal: "sjpermits.org", portalUrl: "https://www.sjpermits.org/",
    signature: "none", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.sanjoseca.gov/your-government/departments-offices/planning-building-code-enforcement/building-division/inspections/inspection-success",
  },
  "ftw-co": {
    // "submit a Change of Use (CoU) application via our online permitting software, Accela Citizen Access"
    // (aca-prod.accela.com/CFW), or for the same use "Occupancy Existing Ordinance" there or in person.
    portal: "aca-prod.accela.com", portalUrl: "https://aca-prod.accela.com/CFW", tenant: "/CFW",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.fortworthtexas.gov/departments/development-services/permits/certificate-of-occupancy",
  },
  "sat-co": {
    // "submit an application form or apply online" (BuildSA, the city's Accela Citizen Access at www.sa.gov/cosa):
    // "To use all the services we provide, you must register and create a user account."
    portal: "www.sa.gov", portalUrl: "https://www.sa.gov/Directory/Departments/DSD/BuildSA/Portal",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.sanantonio.gov/DSD/Business/CofO",
  },
  // BTExpress (Grant Street Group) runs each Florida county's business tax application. Its user guide, published by
  // the Hillsborough Tax Collector: no account ("you cannot save your application in BTExpress and return to it
  // later"); the app is at hillsborough.county-taxes.com/btexpress; "I Agree ... will submit your application"; an
  // email link confirms it; fees are paid after approval.
  "hc-business-tax": {
    // "You can apply using our BTExpress online portal" (county-taxes.net/hillsborough/btexpress); "Once approved,
    // you'll receive an email with a link to review, pay, and print your business tax receipt."
    portal: "county-taxes.net", portalUrl: "https://county-taxes.net/hillsborough/btexpress", noLogin: true, alsoOn: ["hillsborough.county-taxes.com"], tenant: "/hillsborough",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.hillstaxfl.gov/taxes/business-tax-services/new-regulated-businesses/",
    also: ["https://www.hillstaxfl.gov/wp-content/uploads/2025/05/BTExpress-User-Guide.pdf"],
  },
  "tpa-business-tax": {
    // "This Business Tax Application Form is the first step in applying for a business tax receipt" (the city's
    // customer service form, apps.tampagov.net); "A possible on-site inspection may be required."
    portal: "apps.tampagov.net", portalUrl: "https://apps.tampagov.net/appl_customer_service_center/form.asp?strServiceID=843",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.tampa.gov/service/new-business-tax-receipt-application",
  },
  "orl-business-tax": {
    // "Complete and submit your application" (orlando.opencounter.com); "Within 10 business days, we will send you a
    // billing summary ... It will include payment instructions".
    portal: "orlando.opencounter.com", portalUrl: "https://orlando.opencounter.com/permits/business-tax-receipt",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    attach: ["Sunbiz registration", "State license or certification, if any"],
    checked: "2026-10-18", source: "https://www.orlando.gov/Building-Development/Permits-Inspections/Other/Get-a-Permit-for-Your-Business/Get-a-Business-Tax-Receipt",
  },
  "ocfl-business-tax": {
    // "After Obtaining Your City/Town Business Tax Receipt, begin the application process here" (BTExpress,
    // county-taxes.net/fl-orange/btexpress). "You will need to upload all of your documentation with your application."
    portal: "county-taxes.net", portalUrl: "https://county-taxes.net/fl-orange/btexpress", noLogin: true, tenant: "/fl-orange",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    attach: ["City or town Business Tax Receipt", "Sunbiz registration", "Any applicable state licenses"],
    checked: "2026-10-18", source: "https://www.octaxcol.com/taxes/business-taxes/obtain-new-business-tax-receipt/",
    also: ["https://www.hillstaxfl.gov/wp-content/uploads/2025/05/BTExpress-User-Guide.pdf"],
  },
  "mia-cu": {
    // "You must apply online through MiamiBiz" (apps.miami.gov/MiamiBizIntake), after creating an account; then "you'll
    // be emailed an invoice for a non-refundable application fee of $50".
    portal: "apps.miami.gov", portalUrl: "https://apps.miami.gov/MiamiBizIntake",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.miami.gov/Business-Licenses/Business-Licensing/Get-a-Certificate-of-Use-CU",
  },
  "mia-btr": {
    // "You can now complete your BTR application online" ("Apply for BTR": us.openforms.com); "If your application is
    // approved, an invoice will be provided to you via email."
    portal: "us.openforms.com", portalUrl: "https://us.openforms.com/Form/98a6acf3-a616-4139-857d-68f4d9a4e51e",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.miami.gov/Business/Business-Tax-Receipt-BTR",
  },
  "mdc-btr": {
    // "Applications, renewals, and updates should be completed online using BTExpress" (county-taxes.net/fl-miamidade/
    // btexpress; the same page also links miamidade.county-taxes.com/btexpress), with the attestation that the business
    // doesn't trade with Cuba.
    portal: "county-taxes.net", portalUrl: "https://county-taxes.net/fl-miamidade/btexpress", noLogin: true, alsoOn: ["miamidade.county-taxes.com"], tenant: "/fl-miamidade",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.mdctaxcollector.gov/en/services/local-business-tax-receipt",
    also: ["https://www.hillstaxfl.gov/wp-content/uploads/2025/05/BTExpress-User-Guide.pdf"],
  },
  "fl-dor": {
    // "The Department's online Florida Business Tax Application" (taxapps.floridarevenue.com/taxregistration), with the
    // "user id and password you created for your online registration profile".
    portal: "taxapps.floridarevenue.com", portalUrl: "https://taxapps.floridarevenue.com/taxregistration",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://floridarevenue.com/taxes/registration",
  },
  "fl-dbpr": {
    // "Applications are available via DBPR Online services"; "Payments are submitted online during the application process."
    portal: "www.myfloridalicense.com", portalUrl: "https://www.myfloridalicense.com/datamart/mainMenuFLDBPR.do",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www2.myfloridalicense.com/hotels-restaurants/licensing/general/",
  },
  "fl-dbpr-plan": {
    // DBPR Online: "Apply for and complete plan review (for Food Service licenses only)".
    portal: "www.myfloridalicense.com", portalUrl: "https://www.myfloridalicense.com/datamart/mainMenuFLDBPR.do",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    attach: ["Plan with labeled equipment", "Sample menu"],
    checked: "2026-10-18", source: "https://www2.myfloridalicense.com/hotels-restaurants/licensing/general/",
  },
  "fl-food-manager": {
    owner: {
      why: "\"Florida law requires food managers to complete training and pass a certification exam within 30 days of employment. Private entities provide the training and testing.\"",
      url: "https://www2.myfloridalicense.com/hotels-restaurants/food-lodging/food-manager/",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-18", source: "https://www2.myfloridalicense.com/hotels-restaurants/food-lodging/food-manager/",
  },
  "fl-sunbiz": {
    // "File or Correct Florida LLC" (efile.sunbiz.org); "All payments by credit card must use the online application";
    // or "print the Articles of Organization ... and mail it with a check or money order" (no address on this page).
    portal: "efile.sunbiz.org", portalUrl: "https://efile.sunbiz.org/llc_file.html",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://dos.fl.gov/sunbiz/start-business/efile/fl-llc/",
  },
  // Illinois, Washington, Massachusetts, Georgia, Pennsylvania, Nevada, New Jersey, Arizona
  "il-tax": {
    // "MyTax Illinois, available at mytax.illinois.gov. On the MyTax Illinois homepage, click “Register a New Business
    // (Form REG-1).”" The paper REG-1 goes "to the address on the form", which the page doesn't print.
    portal: "mytax.illinois.gov", portalUrl: "https://mytax.illinois.gov/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://tax.illinois.gov/businesses/registration.html",
  },
  "il-ides": {
    // "Employers can register through the MyTax Illinois" ("Newly-created businesses ... must register with IDES within 30 days").
    portal: "mytax.illinois.gov", portalUrl: "https://mytax.illinois.gov/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://ides.illinois.gov/employer-resources/tax-employer-information.html",
    also: ["https://tax.illinois.gov/businesses/registration.html"],
  },
  "chi-license": {
    // "You may apply for a license online by visiting ChicagoBusinessDirect.org, or in person at the Small Business
    // Center in City Hall, 121 N. LaSalle Street, Room 800."
    portal: "chicagobusinessdirect.org", portalUrl: "https://chicagobusinessdirect.org/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.chicago.gov/city/en/depts/bacp/supp_info/retailfoodestablishment0.html",
  },
  "chi-sanitation": {
    owner: {
      why: "\"To obtain a CDPH Foodservice Sanitation Manager Certificate you must attend and pass an approved course\", or apply for reciprocity with a valid ANSI-accredited food protection manager certificate: the person being certified does it.",
      url: "https://www.chicago.gov/city/en/depts/cdph/provdrs/food_safety/svcs/enroll_in_a_foodsanitationcertificationcourse.html",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-18", source: "https://www.chicago.gov/city/en/depts/cdph/provdrs/food_safety/svcs/enroll_in_a_foodsanitationcertificationcourse.html",
  },
  "wa-bls": {
    // "File online with My DOR", or "Complete the Business License Application ... and supplemental forms and mail to:
    // Business Licensing Service, P.O. Box 9034, Olympia, WA 98507-9034". "The application fee ... varies."
    portal: "secure.dor.wa.gov", portalUrl: "https://secure.dor.wa.gov/home",
    mail: { name: "Business Licensing Service", line1: "P.O. Box 9034", city: "Olympia", state: "WA", zip: "98507-9034" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://dor.wa.gov/open-business/business-licensing-and-renewals-faqs",
  },
  "sea-business-license": {
    // "You can apply and renew online at FileLocal" (www.filelocal-wa.gov), "or you can do so via mail" with payment.
    portal: "www.filelocal-wa.gov", portalUrl: "https://www.filelocal-wa.gov/Default_FileLocal.aspx",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.seattle.gov/city-finance/business-taxes-and-licenses/business-licenses",
  },
  "kc-plan-review": {
    // "Register for an account or login to your existing account in the Public Health Permit Center" (Tyler EnerGov at
    // kingcountywa-energovweb.tylerhost.net, signing in through identity.tylerportico.com); "pay for your application by
    // selecting "add to cart"".
    portal: "kingcountywa-energovweb.tylerhost.net", portalUrl: "https://kingcountywa-energovweb.tylerhost.net/apps/selfservice#/home",
    alsoOn: ["identity.tylerportico.com"],
    signature: "typed", payment: "portal", onBehalf: "unstated",
    attach: ["Site plan", "Menu", "Floor plan", "Equipment list with make and model", "Plan review questionnaire", "Finish schedule", "Seating layout"],
    checked: "2026-10-18", source: "https://kingcounty.gov/en/dept/dph/certificates-permits-licenses/food-business-permits/permanent-food-plan-review",
    also: ["https://kingcounty.gov/en/dept/dph/health-safety/environmental-health/permits"],
  },
  "sea-food": {
    // "apply for and submit an operating permit application in the Public Health Permit Center"; "you will receive an
    // emailed invoice for the operating fee".
    portal: "kingcountywa-energovweb.tylerhost.net", portalUrl: "https://kingcountywa-energovweb.tylerhost.net/apps/selfservice#/home",
    alsoOn: ["identity.tylerportico.com"],
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://kingcounty.gov/en/dept/dph/certificates-permits-licenses/food-business-permits/permanent-food-business-permit",
    also: ["https://kingcounty.gov/en/dept/dph/health-safety/environmental-health/permits"],
  },
  "ma-tax": {
    // "Register your business on MassTaxConnect" (mtc.dor.state.ma.us/mtc/?Link=newreg); "When you log in for the first
    // time, you will be prompted to set up two-step verification."
    portal: "mtc.dor.state.ma.us", portalUrl: "https://mtc.dor.state.ma.us/mtc/?Link=newreg",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://mass.gov/info-details/register-your-business-with-masstaxconnect",
  },
  "ga-tax": {
    // "Online registration is available through Georgia Tax Center (GTC)" (gtc.dor.ga.gov): "you should receive your
    // specific tax account number within 15 minutes by email."
    portal: "gtc.dor.ga.gov", portalUrl: "https://gtc.dor.ga.gov/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://dor.georgia.gov/tax-registration",
  },
  "bos-food-permit": {
    // "You can apply in person or by email. By email: Send your completed application and documents to
    // ISDHealth@boston.gov." Fees: "We'll send a one-time payment link to your email address."
    email: "ISDHealth@boston.gov",
    signature: "wet", payment: "invoice", onBehalf: "unstated",
    attach: ["Workers' Compensation Insurance Affidavit", "Federal Tax ID (EIN)", "Food Protection Manager Certificate", "Allergen Certificate"],
    checked: "2026-10-18", source: "https://www.boston.gov/permitting/permits/food-service-permit",
  },
  "bos-cv": {
    // "Apply online through the Licensing Board's application portal. This is the only way to apply." (a Google Form);
    // "Don't submit payment until Licensing Board staff asks you to"; at the hearing "you or your representative will present".
    portal: "docs.google.com", portalUrl: "https://docs.google.com/forms/d/e/1FAIpQLScp721MuqsSIAPeryi7VN7cdMEH4cXgnY2MAze5iM3LSrDCcw/viewform",
    alsoOn: ["accounts.google.com"],
    signature: "typed", payment: "invoice", onBehalf: "allowed",
    attach: ["Signed lease in the business's name", "Personal Information Form for every owner", "Wage Theft Prevention form", "Floor plan"],
    checked: "2026-10-18", source: "https://www.boston.gov/permitting/permits/common-victualler-license",
  },
  "bos-cert": {
    owner: {
      why: "The form must be notarized (\"everyone who's signing must be there in person\"), and \"There is no online filing option.\"",
      mail: { name: "City Clerk's Office", line1: "Room 601", line2: "1 City Hall Square", city: "Boston", state: "MA", zip: "02201" },
    },
    signature: "wet", payment: "with_filing",
    attach: ["Signed lease, or a notarized letter from the landlord", "Check or money order payable to the City of Boston", "Self-addressed stamped envelope"],
    checked: "2026-10-18", source: "https://www.boston.gov/permitting/permits/business-certificate",
  },
  "atl-license": {
    // "All applications must be submitted using our ATLBIZ Occupational Tax and Permitting Portal" (atlbiz.atlantaga.gov);
    // "all required documents can be uploaded"; the certificate is available "after payment is processed".
    portal: "atlbiz.atlantaga.gov", portalUrl: "https://atlbiz.atlantaga.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    attach: ["Notarized SAVE Affidavit", "Notarized E-Verify Affidavit"],
    checked: "2026-10-18", source: "https://atlantaga.gov/government/departments/finance/office-of-revenue/frequently-asked-questions",
  },
  "ga-food-manager": {
    owner: {
      why: "A manager passes an accredited food safety manager course and exam; Georgia DPH lists the accredited courses and the person takes it.",
      url: "https://dph.georgia.gov/environmental-health/food-service",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-18", source: "https://dph.georgia.gov/environmental-health/food-service",
  },
  "pa-tax": {
    // "use myPATH's "Pennsylvania Online Business Tax Registration" service"; "New customers can register for various
    // taxes without logging in to myPATH".
    portal: "mypath.pa.gov", portalUrl: "https://mypath.pa.gov/_/", noLogin: true,
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.pa.gov/services/revenue/register-my-business-for-taxes",
  },
  "phl-tax-account": {
    // "You can register yourself or your business as a new taxpayer on the Philadelphia Tax Center" (tax-services.phila.gov).
    portal: "tax-services.phila.gov", portalUrl: "https://tax-services.phila.gov/_/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.phila.gov/services/payments-assistance-taxes/taxes/get-a-tax-account/",
  },
  "phl-cal": {
    // "You can apply for this license using eCLIPSE" (eclipse.phila.gov); "There is no cost"; "The license is issued automatically."
    portal: "eclipse.phila.gov", portalUrl: "https://eclipse.phila.gov/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.phila.gov/services/permits-violations-licenses/get-a-license/business-licenses/activity/get-a-commercial-activity-license/",
  },
  "phl-food-license": {
    // "apply online using eCLIPSE"; "A non-refundable application fee of $20 is applied toward the license fee."
    portal: "eclipse.phila.gov", portalUrl: "https://eclipse.phila.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    attach: ["Commercial Activity License", "Proof of occupancy (zoning approval)", "License Eligibility Report dated within 30 days"],
    checked: "2026-10-18", source: "https://www.phila.gov/services/business-self-employment/starting-a-business/business-licenses-permits-and-approvals/food-businesses/get-a-food-preparation-and-serving-license/",
  },
  "phl-food-safety": {
    owner: {
      why: "A food safety certificate belongs to the person who took an approved course: the Health Department checks that person's training certificate, then the person applies.",
      mail: { name: "Department of Public Health, Office of Food Protection", line1: "7801 Essington Avenue", city: "Philadelphia", state: "PA", zip: "19153" },
    },
    signature: "wet", payment: "with_filing",
    attach: ["Application for food safety certification", "The training provider's certificate", "Money order for $30 made out to \"PHILA. HEALTH DEPT – EHS\""],
    checked: "2026-10-18", source: "https://www.phila.gov/services/permits-violations-licenses/get-a-license/business-licenses/food-businesses/take-a-food-safety-certification-course/",
  },
  "nv-tax": {
    // "Register for a Tax Permit Online at My Nevada Tax" (mynvtax.nv.gov), or by mail to "Department of Taxation,
    // 3850 Arrowhead Dr., Carson City, NV 89706". Registration fee $15.00.
    portal: "mynvtax.nv.gov", portalUrl: "https://mynvtax.nv.gov/tap/_/",
    mail: { name: "Department of Taxation", line1: "3850 Arrowhead Dr.", city: "Carson City", state: "NV", zip: "89706" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://tax.nv.gov/faqs/register-a-business/",
  },
  "lv-license": {
    // "Use our online portal to apply for a business license"; "Currently our online feature is only available for
    // General Business license applications"; a license technician follows up by email.
    portal: "www.lasvegasnevada.gov", portalUrl: "https://www.lasvegasnevada.gov/dashboard",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.lasvegasnevada.gov/Business/Business-License/Apply-For-A-Business-License",
  },
  "snhd-plan-review": {
    // "Applications may be submitted electronically, without an appointment, to FOODREV@SNHD.ORG"; "an invoice will be
    // provided to you via email after the review"; "Owner/Applicant Signature".
    email: "FOODREV@SNHD.ORG",
    signature: "wet", payment: "invoice", onBehalf: "unstated",
    attach: ["Signed Instructions for Submission of Plans for Review", "Proof of ownership: lease, deed or other legal document", "Plans in PDF", "Menu", "Food questionnaire"],
    checked: "2026-10-18", source: "https://media.southernnevadahealthdistrict.org/download/eh/2022/plan-review/applications/snhd-application-packet-food-202207.pdf",
  },
  "lv-food": {
    // The same packet is the Health Permit Application, emailed to FOODREV@SNHD.ORG; fees are "paid upon receipt of the invoice".
    email: "FOODREV@SNHD.ORG",
    signature: "wet", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://media.southernnevadahealthdistrict.org/download/eh/2022/plan-review/applications/snhd-application-packet-food-202207.pdf",
  },
  "nj-reg": {
    // "File the NJ-REG online" (www.njportal.com/DOR/BusinessRegistration).
    portal: "www.njportal.com", portalUrl: "https://www.njportal.com/DOR/BusinessRegistration/Home/FirstStep",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.nj.gov/treasury/revenue/gettingregistered.shtml",
  },
  "nj-formation": {
    // Form the entity "online" (www.njportal.com/DOR/BusinessFormation): "The fee is $100 for all for-profit entities".
    portal: "www.njportal.com", portalUrl: "https://www.njportal.com/DOR/BusinessFormation/Home/Welcome",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.nj.gov/treasury/revenue/gettingregistered.shtml",
  },
  "az-tpt": {
    // "AZTaxes.gov: Register, file and pay TPT online"; the paper JT-1 is mailed "to the address indicated on the form";
    // "Licenses are not delivered until fees are paid in full."
    portal: "www.aztaxes.gov", portalUrl: "https://www.aztaxes.gov/Home/Page",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://azdor.gov/transaction-privilege-tax/tpt-license/applying-tpt-license",
  },
  "az-llc": {
    // "file your documents online" at ABC (ArizonaBusinessCenter.azcc.gov), or by mail to "Arizona Corporation
    // Commission Corporations Division, 1300 W. Washington St., Phoenix, Arizona 85007", or by fax to 602-542-4100
    // with a Money-on-Deposit account for the fee.
    portal: "arizonabusinesscenter.azcc.gov", portalUrl: "https://ArizonaBusinessCenter.azcc.gov",
    fax: { us: "+16025424100" },
    mail: { name: "Arizona Corporation Commission Corporations Division", line1: "1300 W. Washington St.", city: "Phoenix", state: "AZ", zip: "85007" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.azcc.gov/faqs/BusinessServicesFAQs",
  },
  "mc-plan-review": {
    // "Ready to apply? Fill out the application on our Permit Center" (maricopacountyaz-energovweb.tylerhost.net);
    // "you will receive an email with your permit number(s) and payment instructions."
    portal: "maricopacountyaz-energovweb.tylerhost.net", portalUrl: "https://maricopacountyaz-energovweb.tylerhost.net/apps/selfservice#/home",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.maricopa.gov/4996/New-Application-Guidance",
  },
  "mc-food-permit": {
    portal: "maricopacountyaz-energovweb.tylerhost.net", portalUrl: "https://maricopacountyaz-energovweb.tylerhost.net/apps/selfservice#/home",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.maricopa.gov/4996/New-Application-Guidance",
  },
  // Virginia, DC, Colorado, Minnesota, Ohio, Oregon, federal, California formation, and the people's own certificates
  "va-tax": {
    // "all new businesses are required to register with us online" ("Register your business now":
    // account.tax.virginia.gov/online-services/?link=businessregistration).
    portal: "account.tax.virginia.gov", portalUrl: "https://account.tax.virginia.gov/online-services/?link=businessregistration",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.tax.virginia.gov/register-business-virginia",
  },
  "va-vec": {
    // "Register a business online through iFile/iReg" (www.business.tax.virginia.gov), or "Mail a completed VEC FC-27 form
    // to: Virginia Employment Commission, Employer Accounts, P.O. Box 26441, Richmond, VA 23261-6441".
    portal: "www.business.tax.virginia.gov", portalUrl: "https://www.business.tax.virginia.gov/",
    mail: { name: "Virginia Employment Commission", line1: "Employer Accounts", line2: "P.O. Box 26441", city: "Richmond", state: "VA", zip: "23261-6441" },
    signature: "wet", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://vec.virginia.gov/tax-filing-registration",
  },
  "arl-plan-review": {
    // "Submit your plans and the Food Service Plan Review Application using the Permit Arlington Customer Portal"
    // (aca-prod.accela.com/ARLINGTONCO) "and pay the appropriate fees". (ehealth@arlingtonva.us and 2110 Washington Blvd
    // are only for a change of ownership or a place at Reagan National Airport, so they aren't used here.)
    portal: "aca-prod.accela.com", portalUrl: "https://aca-prod.accela.com/ARLINGTONCO/Default.aspx", tenant: "/ARLINGTONCO",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    attach: ["Food Service Plan Review Application", "Building plans", "Site plan", "Equipment schedule", "Certified food protection manager certificate"],
    checked: "2026-10-18", source: "https://arlingtonva.us/Government/Programs/Health/Environmental-Health/Food-Establishment-Plans-Construction",
  },
  "arl-bpol": {
    // "Business Registrations and returns can be filed using the Customer Assessment and Payment Portal (CAPP)" (capp.arlingtonva.us).
    portal: "capp.arlingtonva.us", portalUrl: "https://capp.arlingtonva.us/",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.arlingtonva.us/Government/Programs/Taxes/Business-License-and-Taxes",
  },
  "ffx-plan-review": {
    // "To apply for Food Establishment, Mobile Food Unit, and Change of Ownership Applications please go to the PLUS
    // Citizen Portal page and complete the application." "Application fee: $80".
    portal: "plus.fairfaxcounty.gov", portalUrl: "https://plus.fairfaxcounty.gov/CitizenAccess/Welcome.aspx",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.fairfaxcounty.gov/health/permits/new-food-establishment",
  },
  "ffx-food-permit": {
    portal: "plus.fairfaxcounty.gov", portalUrl: "https://plus.fairfaxcounty.gov/CitizenAccess/Welcome.aspx",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.fairfaxcounty.gov/health/permits/new-food-establishment",
  },
  "ffx-nonrup": {
    // Land Development Services: the "NonRUP record workflow will be located under the Building tab" in PLUS; "The review fee is $70".
    portal: "plus.fairfaxcounty.gov", portalUrl: "https://plus.fairfaxcounty.gov/CitizenAccess/Welcome.aspx",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.fairfaxcounty.gov/landdevelopment/sites/landdevelopment/files/assets/documents/22-10-changes-nonrup-process.pdf",
    also: ["https://www.fairfaxcounty.gov/plan2build/node/204"],
  },
  "dc-otr": {
    // "MyTax.DC.gov ... FR-500 New Business Registration"; the user guide: "On the MyTax.DC.gov homepage, locate the
    // Business section. Click “Register a New Business – Form FR-500”". LLCs attach their Articles of Organization.
    portal: "mytax.dc.gov", portalUrl: "https://mytax.dc.gov/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    attach: ["Articles of Organization (LLC) or Articles of Incorporation", "Certificate of Trade Name Registration, if any"],
    checked: "2026-10-18", source: "https://otr.cfo.dc.gov/page/new-business-registration",
    also: ["https://mytax.dc.gov/webfiles/Documents/Tut/Bus/GI/How_to_Register_a_New_Business_Form_FR-500.pdf"],
  },
  "dc-does": {
    // "Any business that has employees working in the District of Columbia is required to register online at
    // essp.does.dc.gov"; "employers and third-party agents (TPAs) can access" it.
    portal: "essp.does.dc.gov", portalUrl: "https://essp.does.dc.gov/",
    signature: "typed", payment: "none", onBehalf: "allowed",
    checked: "2026-10-18", source: "https://unemployment.dc.gov/page/employer-service-portal",
  },
  "dc-food": {
    // "Apply for a license online at BOSS" (boss.dc.gov), with the Certificate of Occupancy and the approved DC Health
    // inspection report.
    portal: "boss.dc.gov", portalUrl: "https://boss.dc.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    attach: ["Certificate of Occupancy", "Approved DC Health inspection report", "DC Health food manager's certificate"],
    checked: "2026-10-18", source: "https://dlcp.dc.gov/page/food-services-0",
  },
  "dc-food-manager": {
    owner: {
      why: "It's the certified manager's own ID card: the person who passed the exam applies, with a check or money order payable to DC Treasurer (card payments only in person).",
      mail: { name: "DOH – Food Safety (ID Cards)", line1: "P.O. Box 37489", city: "Washington", state: "DC", zip: "20013" },
    },
    signature: "wet", payment: "with_filing",
    attach: ["Copy of the national certificate with the test score", "Check or money order for $35 payable to DC Treasurer"],
    checked: "2026-10-18", source: "https://doh.dc.gov/sites/default/files/dc/sites/doh/publication/attachments/Application%20for%20ID%20Cards.pdf",
  },
  "co-tax": {
    // "Your business can use MyBizColorado to apply for a sales tax license and a wage withholding license" (mybiz.colorado.gov).
    portal: "mybiz.colorado.gov", portalUrl: "https://mybiz.colorado.gov/",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://tax.colorado.gov/new-businesses",
  },
  "den-tax": {
    // Denver's eBiz Tax Center (www.denvergov.org/ebiztax); "Denver no longer charges a license fee".
    portal: "denvergov.org", portalUrl: "https://www.denvergov.org/ebiztax/_/", tenant: "/ebiztax",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Department-of-Finance/Our-Divisions/Treasury/Business-Tax-Information/Business-Tax-FAQ",
  },
  "den-zoning": {
    // "Submit Online: e-permits ... go to Development Services > Apply for a permit", "Select "Zoning Permit"".
    portal: "denvergov.org", portalUrl: "https://www.denvergov.org/AccelaCitizenAccess/Default.aspx", tenant: "/AccelaCitizenAccess",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    attach: ["Floor plan", "Site plan", "Written narrative of the project"],
    checked: "2026-10-18", source: "https://denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Community-Planning-and-Development/Plan-Review-Permits-and-Inspections/Zoning-Permits/Apply-for-Commercial-Zoning-Permits",
  },
  "den-food-license": {
    // "In Denver's Online Permitting and Licensing Center ... click "Apply New""; "you will be prompted to submit fees in
    // the online portal"; application fee $150.
    portal: "denvergov.org", portalUrl: "https://www.denvergov.org/AccelaCitizenAccess/Default.aspx", tenant: "/AccelaCitizenAccess",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    attach: ["Zoning use permit", "Denver sales tax license"],
    checked: "2026-10-18", source: "https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Business-Licensing/Business-licenses/Retail-Food/Retail-food/New",
  },
  "mn-tax": {
    // "If you need a Minnesota Tax ID Number, you can apply: Online" ("Register for a Tax ID Number":
    // www.mndor.state.mn.us/tp/eservices/_/?link=NewBusinessReg) or by phone.
    portal: "www.mndor.state.mn.us", portalUrl: "https://www.mndor.state.mn.us/tp/eservices/_/?link=NewBusinessReg",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.revenue.state.mn.us/so/node/9571",
  },
  "mn-ui": {
    // New employer registration in Employer Self-Service ("Employer Login": www1.ui.mn.gov/ui_employer/ui/employer/login).
    portal: "www1.ui.mn.gov", portalUrl: "https://www1.ui.mn.gov/ui_employer/ui/employer/login",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://ui.mn.gov/employers/help-and-support/emp-hbook/new-registration.jsp",
  },
  "mn-cfpm": {
    owner: {
      why: "The certified manager applies for their own Minnesota CFPM after passing an approved course and exam.",
      url: "https://www.health.state.mn.us/communities/environment/food/cfpm/require.html",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-18", source: "https://www.health.state.mn.us/communities/environment/food/cfpm/require.html",
  },
  "mpls-plan-review": {
    // "Submit your completed application by email to Minneapolis Development Review (MDR)" (mailto:
    // Development@minneapolismn.gov); MDR then sends a ProjectDox link for the drawings.
    email: "Development@minneapolismn.gov",
    signature: "wet", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.minneapolismn.gov/business-services/business-assistance/run/food-safety/food-plan-review/",
  },
  "oh-vendor": {
    // "Application for Vendor’s License to Make Taxable Sales (ST 1)" online (franklincountyohio.jotform.com), or "submitted
    // along with the $50 filing fee to Franklin County Auditor, Vendor’s License Section, 373 S High St, 21st Floor,
    // Columbus, OH 43215."
    portal: "franklincountyohio.jotform.com", portalUrl: "https://franklincountyohio.jotform.com/form/222723544220143",
    mail: { name: "Franklin County Auditor", line1: "Vendor's License Section", line2: "373 S High St, 21st Floor", city: "Columbus", state: "OH", zip: "43215" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://auditor.franklincountyohio.gov/Consumer/Licensing-Types",
  },
  "oh-ui": {
    // "If you are a new employer and need to create an OHIO UI account, register your account by selecting “Employers”
    // under “Register for an Account”" (The SOURCE).
    portal: "thesource.jfs.ohio.gov", portalUrl: "https://thesource.jfs.ohio.gov/employer.html",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://thesource.jfs.ohio.gov/employer.html",
  },
  "oh-pic": {
    owner: {
      why: "Person in charge certification belongs to the person who takes the course; at least one certified person is on site on every shift.",
      url: "https://odh.ohio.gov/know-our-programs/food-safety-program/food-safety-certification/",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-18", source: "https://odh.ohio.gov/know-our-programs/food-safety-program/food-safety-certification/",
  },
  "cmh-plan-review": {
    // The application: "Step 1: Submit Plans (at least 45 days prior to estimated opening date) to EH@columbus.gov,
    // including: Plan review fee"; "Send payment invoice to this email"; "CPH will review the plans within 30 days of receipt of payment."
    email: "EH@columbus.gov",
    signature: "wet", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.columbus.gov/files/sharedassets/city/v/10/public-health/planreview-application.pdf",
    also: ["https://www.columbus.gov/Services/Food-Protection-Program"],
  },
  "or-payroll": {
    // "Register online for a BIN using Revenue Online" (revenueonline.dor.oregon.gov); the paper form: "Mail your completed
    // form to: Oregon Employment Department, 875 Union Street NE - Room 107, Salem OR 97311-0030. Fax to: 503-947-1528".
    portal: "revenueonline.dor.oregon.gov", portalUrl: "https://revenueonline.dor.oregon.gov/tap/_/?Link=BIN",
    fax: { us: "+15039471528" },
    mail: { name: "Oregon Employment Department", line1: "875 Union Street NE - Room 107", city: "Salem", state: "OR", zip: "97311-0030" },
    signature: "wet", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.oregon.gov/dor/programs/businesses/Pages/Withholding-and-Payroll-tax.aspx",
    also: ["https://www.oregon.gov/dor/forms/FormsPubs/form-or-cer_211-055.pdf"],
  },
  "pdx-tax": {
    // "Register for a Revenue Division tax account online" (pro.portland.gov); or "Mail or drop off your registration form
    // to: Revenue Division, 111 SW Columbia St., Suite 600, Portland, OR 97201-5840"; "Fax your registration form to the
    // Revenue Division: 503-823-5192".
    portal: "pro.portland.gov", portalUrl: "https://pro.portland.gov/?Link=Register",
    fax: { us: "+15038235192" },
    mail: { name: "Revenue Division", line1: "111 SW Columbia St., Suite 600", city: "Portland", state: "OR", zip: "97201-5840" },
    signature: "wet", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.portland.gov/revenue/register-tax-account",
  },
  "cbp-ace": {
    // CBP's Cargo Systems Messaging Service, April 1, 2026: "CBP released a modernized ACE Secure Data Portal (ACE
    // Portal) account application", "Importer Application" at ace-accounts.cbp.gov/s/importer-form.
    portal: "ace-accounts.cbp.gov", portalUrl: "https://ace-accounts.cbp.gov/s/importer-form",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://content.govdelivery.com/accounts/USDHSCBP/bulletins/41113af",
  },
  "fda-5066": {
    // "Launch Cosmetics Direct" (direct.fda.gov), "an electronic submissions portal" with an FDA Direct account.
    portal: "direct.fda.gov", portalUrl: "https://direct.fda.gov/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products/cosmetics-direct",
    also: ["https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products"],
  },
  "fda-5067": {
    portal: "direct.fda.gov", portalUrl: "https://direct.fda.gov/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products/cosmetics-direct",
  },
  "fmc-18": {
    // "Form FMC-18" (www2.fmc.gov/form18/Form18/Login.aspx).
    portal: "www2.fmc.gov", portalUrl: "https://www2.fmc.gov/form18/Form18/Login.aspx",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.fmc.gov/resources-services/licensing-registration/",
  },
  "phmsa-5800": {
    // "We will no longer accept paper registration forms ... All registrations and payments must be completed
    // electronically"; "Hazardous Materials Online Registration Service" (portal.phmsa.dot.gov/PHMSAPortal2).
    portal: "portal.phmsa.dot.gov", portalUrl: "https://portal.phmsa.dot.gov/PHMSAPortal2",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.phmsa.dot.gov/registration/registration-overview",
    also: ["https://www.phmsa.dot.gov/registration/online-registration"],
  },
  "ca-llc-1": {
    // "File Articles of Organization online at bizfileOnline.sos.ca.gov"; "Electronic signatures on filings submitted
    // through the Secretary of State's online process are the only electronic signatures" it accepts.
    portal: "bizfileonline.sos.ca.gov", portalUrl: "https://bizfileonline.sos.ca.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.sos.ca.gov/business-programs/business-entities/faqs",
  },
  "ca-llc-5": {
    portal: "bizfileonline.sos.ca.gov", portalUrl: "https://bizfileonline.sos.ca.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    attach: ["Certificate of Good Standing from where the LLC was formed"],
    checked: "2026-10-18", source: "https://www.sos.ca.gov/business-programs/business-entities/faqs",
  },
  "ca-ftb-3522": {
    owner: {
      why: "It's a payment, not an application, and Placetta never pays an agency: \"If paying by Web Pay, do not file form FTB 3522.\" Pay with Web Pay, or mail the voucher with a check.",
      url: "https://webapp.ftb.ca.gov/",
      mail: { name: "Franchise Tax Board", line1: "PO Box 942857", city: "Sacramento", state: "CA", zip: "94257-0531" },
    },
    signature: "none", payment: "with_filing",
    checked: "2026-10-13", source: "https://www.ftb.ca.gov/forms/2026/2026-3522.pdf",
  },
  "ca-food-manager": {
    owner: {
      why: "An owner or employee passes a food protection manager exam from an accredited organization; the person keeps the certificate for the inspector.",
      url: "http://publichealth.lacounty.gov/eh/business/certified-food-handler-manager.htm",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-17", source: "https://emd.saccounty.gov/EH/Documents/CERTIFIED%20FOOD%20MGR%2008%2005%2015.pdf",
  },
  "nyc-fpc": {
    owner: {
      why: "A free online course, then an in-person exam the supervisor sits themselves.",
      url: "https://www.nyc.gov/site/doh/business/health-academy/food-protection-online-free.page",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-09", source: "https://www.nyc.gov/site/doh/business/health-academy/food-protection-online-free.page",
  },
  "ma-food-manager": {
    owner: {
      why: "A manager passes a food protection manager exam from a nationally accredited provider that Massachusetts accepts.",
      url: "https://www.mass.gov/doc/massachusetts-food-protection-manager-certification-exam-and-trainer-directory-1/download",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-17", source: "https://www.mass.gov/doc/massachusetts-food-protection-manager-certification-exam-and-trainer-directory-1/download",
  },
  "ma-allergen": {
    owner: {
      why: "The person in charge and their backup take an allergen awareness course themselves.",
      url: "https://www.mass.gov/lists/food-allergen-awareness-guidance",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-17", source: "https://www.mass.gov/info-details/food-allergen-awareness-faqs",
  },
  "va-food-manager": {
    owner: {
      why: "An employee with authority over food holds a certificate from a CFP-accredited program, earned by passing its exam.",
      url: "https://www.vdh.virginia.gov/environmental-health/food-safety-in-virginia/cfpm/",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-18", source: "https://www.vdh.virginia.gov/environmental-health/food-safety-in-virginia/cfpm/",
  },
  "wa-food-worker": {
    owner: {
      why: "Each worker takes the state training and exam themselves, online at foodworkercard.wa.gov or through a local health department.",
      url: "https://www.foodworkercard.wa.gov",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-17", source: "https://doh.wa.gov/node/5754",
  },
  "snhd-food-handler": {
    owner: {
      why: "A first card means an in-person test at a Health District location with photo ID, taken by the worker.",
      url: "https://www.southernnevadahealthdistrict.org/?p=3661",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-17", source: "https://www.southernnevadahealthdistrict.org/?p=3661",
  },
};

/**
 * Waiting for someone to copy the numbers and addresses from the agency's page and date them. Nothing here is used:
 * move an entry into DEST once every value is confirmed on the source page.
 */
export const TO_VERIFY: Record<string, { source: string; note: string; partial?: Partial<Dest> }> = {
  "cbp-5106": {
    source: "https://www.cbp.gov/newsroom/publications/forms",
    note: "Usually goes through the customs broker, and cbp.gov's pages refuse automated reads. Leave it to the team at first.",
  },
};

/**
 * Researched, and the Placetta team files these: the agency publishes no route Placetta can send on (in person only,
 * a licensed professional or contractor files it, there's nothing to file, or the route couldn't be confirmed).
 * Each says why and which page says so. Never used to send anything; the coverage report reads it.
 */
export const TEAM_ONLY: Record<string, { why: string; source: string; checked: string }> = {
  "cbp-301": { why: "Bought from a CBP-approved surety, which files it electronically; the business doesn't file it.", source: "https://www.cbp.gov/trade/priority-issues/bonds", checked: "2026-10-09" },
  "cpsc-cert": { why: "There is no government application: the importer issues the certificate, and its data goes to CBP at entry or into a CPSC Product Registry account.", source: "https://www.cpsc.gov/eFiling", checked: "2026-10-18" },
  "ca-prop65": { why: "Nothing is filed: businesses give a \"clear and reasonable\" warning.", source: "https://www.p65warnings.ca.gov/business-resources/frequently-asked-questions-businesses", checked: "2026-10-18" },
  "ny-wcb": { why: "The insurer reports the coverage to the Board; the business only buys the policy.", source: "https://www.wcb.ny.gov/content/main/coverage-requirements.jsp", checked: "2026-10-18" },
  "nyc-sign": { why: "Filed in DOB NOW by a registered design professional or licensed sign hanger; the owner attests in their own login.", source: "https://www.nyc.gov/assets/buildings/pdf/build_sign_filing_guided.pdf", checked: "2026-10-13" },
  "nyc-co": { why: "A change of use is an architect's or engineer's DOB NOW job; otherwise it's a lookup, not a filing.", source: "https://www.nyc.gov/site/buildings/property-or-business-owner/certificate-of-occupancy.page", checked: "2026-10-13" },
  "lac-plan-check": { why: "Two steps: an email asking for a SharePoint upload link, then the plans go to that link, and review waits for the invoiced fee.", source: "https://admin.publichealth.lacounty.gov/eh/i-want-to/submit-electronic-plan.htm", checked: "2026-10-13" },
  "lac-health-permit": { why: "The plan checker hands over the application at the final inspection and takes it back there.", source: "https://publichealth.lacounty.gov/eh/about/permit.htm", checked: "2026-10-13" },
  "la-lafd-ops": { why: "In person at the Office of Finance public counter by appointment, signed off by LADBS Zoning.", source: "https://lafd.org/operational-fire-permits", checked: "2026-10-13" },
  "hou-sign": { why: "\"Contractors only; no individuals\": a licensed sign contractor files it, with notarized affidavits.", source: "https://www.houstonpermittingcenter.org/hpwcode1112", checked: "2026-10-13" },
  "hou-plan-review": { why: "The city's pages disagree (two paper sets at the Permitting Center, or ProjectDox after an iPermits account), so the team confirms the route each time.", source: "https://www.houstonhealth.org/food-permits/opening-food-establishment", checked: "2026-10-13" },
  "hou-fire": { why: "Filed in person with the Fire Marshal's Office.", source: "https://www.houstonpermittingcenter.org/fire-marshal-office", checked: "2026-10-09" },
  "sj-business-tax": { why: "The registration page names no email, fax or mailing route, and its online link isn't in the page's text, so there's no host to point the worker at.", source: "https://www.sanjoseca.gov/your-government/departments-offices/finance/business-tax-registration/register-for-a-business-tax-certificate", checked: "2026-10-18" },
  "sf-formula-retail": { why: "Not a filing of its own: the affidavit goes with the building permit application.", source: "https://sfplanning.org/sites/default/files/forms/Formula_Retail_Affidavit.pdf", checked: "2026-10-13" },
  "sf-dph-plan-check": { why: "Submitted in person with the building permit at the Permit Center, DPH counters 82 and 83.", source: "https://sf.gov/sites/default/files/2023-07/PlanCheckApplication.pdf", checked: "2026-10-13" },
  "sf-fire-assembly": { why: "Paper application to the Bureau of Fire Prevention; the page gives no email or address to send it to, and PermitSF doesn't take this permit.", source: "https://sf-fire.org/services/permits", checked: "2026-10-18" },
  "sacc-plan-review": { why: "A printed plan set goes to 11080 White Rock Rd; for electronic submittal the county sends instructions on request (EHPlanReview@SacCounty.gov), so there's no route Placetta can send the whole packet on.", source: "https://emd.saccounty.gov/content/dam/emd/docs/transition/Application%20for%20Food%20Facility%20Plan%20Review%202026-2027.pdf", checked: "2026-10-18" },
  "sdc-plan-check": { why: "Online through the county's Accela Citizen Access, reached through dehpay.com; the portal's own host isn't printed, so the worker can't be pointed at it.", source: "https://www.sandiegocounty.gov/content/dam/sdc/deh/fhd/food/pdf/onlinesubmission_pc.pdf", checked: "2026-10-18" },
  "sj-fire-systems": { why: "Only a licensed contractor can apply: \"Your Contractor's License type will determine which permits you can apply for.\"", source: "https://www.sanjoseca.gov/your-government/departments-offices/fire-department/fire-prevention-permits/development-services", checked: "2026-10-18" },
  "irv-license": { why: "Irvine is moving business licensing to its new PRISM portal and hasn't published the portal's address yet (\"check back closer to launch\").", source: "https://cityofirvine.gov/community-development/business-licensing", checked: "2026-10-18" },
  "oc-health-permit": { why: "The plan checker directs the owner or contractor to the application at the final inspection; no address or inbox is published for it.", source: "https://ochealthinfo.com/about-hca/public-health-services/environmental-health-division/food/food-facility-health-permit", checked: "2026-10-18" },
  "aus-sign": { why: "The applicant must first register as an Outdoor Advertising Contractor with insurance naming the city, and lit signs need a registered electrical sign contractor.", source: "https://www.austintexas.gov/development-services/sign-permits", checked: "2026-10-18" },
  "ftw-plan-review": { why: "Plans go to the Department of Development at 1000 Throckmorton; no email or online route is published.", source: "https://www.fortworthtexas.gov/departments/environmental-services/consumer-health/plan-review", checked: "2026-10-18" },
  "ftw-food-permit": { why: "Consumer Health issues it after the Certificate of Occupancy and a permit inspection; there's no application route of its own.", source: "https://www.fortworthtexas.gov/departments/environmental-services/consumer-health/plan-review", checked: "2026-10-18" },
  "sat-food": { why: "Bought in person at the Development and Business Services Center, 1901 S. Alamo.", source: "https://www.sanantonio.gov/Health/FoodLicensing/FAQs", checked: "2026-10-12" },
  "dal-plan-review": { why: "Plans are reviewed at Planning and Development, 320 E. Jefferson Blvd., as part of the building permit; no remote route is published.", source: "https://dallascityhall.com/departments/codecompliance/consumer-health/Pages/food-establishment.aspx", checked: "2026-10-18" },
  "dal-food-permit": { why: "Filed with a government photo ID and the fee; the page names no email, mailing address or online route.", source: "https://dallascityhall.com/departments/codecompliance/consumer-health/Pages/food-establishment.aspx", checked: "2026-10-18" },
  "dal-fire-hood": { why: "The application is picked up from Dallas Fire-Rescue, 1551 Baylor St., Suite 400; usually the hood contractor files it.", source: "https://dallascityhall.com/departments/fire-rescue/Pages/Prevention-and-Investigation-Bureau.aspx", checked: "2026-10-13" },
  "aus-food-plan-review": { why: "The route depends on where the place is: City of Austin plans go to Development Services' commercial plan review, Travis County and its towns' to Austin Public Health's portal, in person or by mail; the page no longer lists the email the 2024 form printed.", source: "https://www.austintexas.gov/health/programs/fixed-food-establishments", checked: "2026-10-18" },
  "aus-co": { why: "Not an application: the Certificate of Occupancy follows the building permit's final inspection (the email address on the page is for one that wasn't issued).", source: "https://www.austintexas.gov/development-services/certificate-occupancy", checked: "2026-10-13" },
  "pla-co": { why: "The packet goes to Building Inspections with the fee; the guide names no email, mailing address or online route for it.", source: "https://content.civicplus.com/api/assets/tx-plano/d2490980-662a-4f38-8def-66070c8691e5", checked: "2026-10-18" },
  "pla-plan-review": { why: "Submitted to Building Inspections with the Environmental Health review form and fee; no remote route is published.", source: "https://www.plano.gov/food-permits", checked: "2026-10-18" },
  "pla-food-permit": { why: "Issued by Environmental Health once the fee is paid, after the Certificate of Occupancy; there's no application route of its own.", source: "https://www.plano.gov/food-permits", checked: "2026-10-18" },
  "bos-plan-review": { why: "\"The Plan Review appointment is in-person only.\"", source: "https://www.boston.gov/permitting/permits/food-service-permit", checked: "2026-10-18" },
  "fulton-plan-review": { why: "Mailed or brought to the district office nearest the restaurant; the county's page didn't load for us and the application prints no address, so there's no confirmed destination.", source: "https://FultonCountyGa.gov/-/media/Departments/Board-of-Health/Environmental-Health/Restaurant-Inspection/Link-List-Items/Food-Service-Application.pdf", checked: "2026-10-18" },
  "fulton-food-permit": { why: "Same district office as the plan review; no confirmed address or online route.", source: "https://fultoncountyga.gov/Inside-Fulton-County/Fulton-County-Departments/Board-of-Health/Environmental-Health/Restaurant-Inspection", checked: "2026-10-18" },
  "phl-plan-review": { why: "Submitted by phone appointment or walk-in at 7801 Essington Ave.", source: "https://phila.gov/services/permits-violations-licenses/get-a-license/business-licenses/food-businesses/apply-for-a-plan-review-for-a-stationary-food-business/", checked: "2026-10-17" },
  "phx-co": { why: "Not an application: the Certificate of Occupancy is generated once the building permit's inspections pass, and that permit goes through plan review by the design professional.", source: "https://www.phoenix.gov/administration/departments/pdd/residential-building/resident-plan-reviews/certificate-of-occupancy.html", checked: "2026-10-17" },
  "cc-business-license": { why: "The county's apply page loads its options in buttons the page text doesn't carry, so the online route wasn't confirmed.", source: "https://www.clarkcountynv.gov/business/doing_business_with_clark_county/apply-for-a-business-license", checked: "2026-10-18" },
  "nv-esd": { why: "The registration page says DETR shares details with the Department of Taxation but doesn't name the employer portal's address.", source: "https://tax.nv.gov/faqs/register-a-business/", checked: "2026-10-18" },
  "ffx-bpol": { why: "The county's BPOL application PDF now returns \"not found\" and the license page names no route to send it.", source: "https://www.fairfaxcounty.gov/topics/starting-business-step-3-license-taxes", checked: "2026-10-18" },
  "arl-food-license": { why: "Issued after plan approval and the pre-opening inspection; the page publishes no application route of its own.", source: "https://arlingtonva.us/Government/Programs/Health/Environmental-Health/Food-Establishment-Plans-Construction", checked: "2026-10-18" },
  "dc-co": { why: "Filed in DOB's Certifi platform, whose address the guide doesn't print (coapp@dc.gov is for questions).", source: "https://dob.dc.gov/sites/default/files/dc/sites/dob/Certificate%20of%20Occupancy--A%20Quick%20Guide.pdf", checked: "2026-10-18" },
  "dc-plan-review": { why: "Plans go to DC Health through ProjectDox with the building permit application, filed by the design professional.", source: "https://dchealth.dc.gov/sites/default/files/dc/sites/doh/publication/attachments/FS%28redtop%29%20-%20Plan%20review%202018%20v2.pdf", checked: "2026-10-17" },
  "den-plan-review": { why: "Denver Public Health lists plan review among the opening steps but publishes no submission route of its own.", source: "https://denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Public-Health-Environment/Public-Health-Investigations/Plan-Review-and-Inspections", checked: "2026-10-17" },
  "mpls-food-license": { why: "A paper application with the license fee goes to Business Licenses; the page gives no email, address or online route for it.", source: "https://www.minneapolismn.gov/business-services/licenses-permits-inspections/business-licenses/food-restaurants/restaurant-coffee-cafe/restaurant/application/", checked: "2026-10-18" },
  "cmh-food-license": { why: "Completed at the final inspection, where the fee is collected.", source: "https://www.columbus.gov/Services/Food-Protection-Program", checked: "2026-10-18" },
  "mult-plan-review": { why: "\"Send us\" the application, plans and fee, but the page names no address or inbox to send them to.", source: "https://multco.us/services/restaurant-license", checked: "2026-10-18" },
  "mult-food-license": { why: "Same as the plan review: the page names no address or inbox.", source: "https://multco.us/services/restaurant-license", checked: "2026-10-18" },
  "edi-plan-review": { why: "The township says to ask the Health Department how to submit; no route is published.", source: "https://www.edisonnj.org/departments/health_department/index.php", checked: "2026-10-17" },
  "edi-food-license": { why: "Applied for at the township, 100 Municipal Boulevard, with Division of Health approval.", source: "https://ecode360.com/34701907", checked: "2026-10-17" },
  "jc-co": { why: "The city links its permit portal as jcnj.org/permitportal, which doesn't resolve, so there's no confirmed host.", source: "https://www.jerseycitynj.gov/cityhall/HousingAndDevelopment/businesses", checked: "2026-10-18" },
  "jc-food-license": { why: "New licenses are in person by appointment only at 1 Jackson Square.", source: "https://www.jerseycitynj.gov/cityhall/health/divisionofhealth", checked: "2026-10-17" },
  "ca-sb54": { why: "Registration is with Circular Action Alliance, the producer organization, not a government agency.", source: "https://calrecycle.ca.gov/packaging/packaging-epr/", checked: "2026-10-17" },
  "uspto-tm": { why: "A foreign-domiciled applicant must be represented by a US-licensed attorney, who files it.", source: "https://www.uspto.gov/trademarks/basics/do-i-need-attorney", checked: "2026-10-17" },
  "fda-prior-notice": { why: "Filed for each shipment by whoever has the shipment data, usually the customs broker.", source: "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/guidance-industry-what-you-need-know-about-prior-notice-imported-food-shipments", checked: "2026-10-17" },
  "il-sos": { why: "A state-fee formation filing whose submission page wasn't re-read in this round.", source: "https://www.ilsos.gov", checked: "2026-10-17" },
  "wa-sos": { why: "A state-fee formation filing whose submission page wasn't re-read in this round.", source: "https://ccfs.sos.wa.gov", checked: "2026-10-17" },
  "ma-sos": { why: "A state-fee formation filing whose submission page wasn't re-read in this round.", source: "https://www.sec.state.ma.us", checked: "2026-10-17" },
  "ga-sos": { why: "A state-fee formation filing whose submission page wasn't re-read in this round.", source: "https://ecorp.sos.ga.gov", checked: "2026-10-17" },
  "pa-dos": { why: "A state-fee formation filing whose submission page wasn't re-read in this round.", source: "https://file.dos.pa.gov", checked: "2026-10-17" },
  "nv-silverflume": { why: "A state-fee formation and license filing whose submission page wasn't re-read in this round.", source: "https://www.nvsilverflume.gov", checked: "2026-10-17" },
  "dc-dlcp": { why: "Corporate registration and the basic business license together; the registration route wasn't re-read in this round.", source: "https://dlcp.dc.gov", checked: "2026-10-17" },
  "dal-sign": { why: "A registered sign contractor applies on DallasNow, and lit signs need a registered electrical sign contractor.", source: "https://dallascityhall.com/departments/sustainabledevelopment/buildinginspection/Documents/Signs/SIGN%20PERMITS%20-%20SPSD%20Checklist.pdf", checked: "2026-10-13" },
  "sdg-co": { why: "Not an application: issued after the final inspection of the building permit work.", source: "https://www.sandiego.gov/development-services/forms-publications/information-bulletin/585", checked: "2026-10-12" },
  "sdc-health-permit": { why: "The county issues it in person with the plan check; no remote route is published.", source: "https://www.sandiegocounty.gov/content/sdc/deh/fhd/food/food_faq.html", checked: "2026-10-12" },
  "ac-plan-check": { why: "\"Bring one set of plans\" with payment to 1131 Harbor Bay Parkway, Alameda: in person only.", source: "https://health.alamedacountyca.gov/alameda-county-plan-check-guide-for-retail-food-facilities/", checked: "2026-10-17" },
  "ac-health-permit": { why: "Completed after the final inspection, with the fees, in person.", source: "https://health.alamedacountyca.gov/alameda-county-plan-check-guide-for-retail-food-facilities/", checked: "2026-10-17" },
  "oak-zoning": { why: "Filed in Oakland's Accela Online Permit Center with payment at submission; its submission page wasn't re-read in this round.", source: "https://www.oaklandca.gov/Planning-Building/Your-Commercial-Projects-Permits/Zoning-Clearance-Permit", checked: "2026-10-17" },
  "sacc-health-permit": { why: "The application to operate goes in with the fees before opening; the county's guide names no inbox or online route.", source: "https://emd.saccounty.gov/EH/Documents/How%20to%20Obtain%20a%20Health%20Permit%2002-6-23.pdf", checked: "2026-10-17" },
  "sf-dbi-building": { why: "Plans and the application go in at the Permit Center, which routes them to Planning, Fire and Health.", source: "https://www.sf.gov/learn-about-our-building-permit-review-processes", checked: "2026-10-10" },
  "chi-plan-review": { why: "Reviewed as part of the building permit by a city sanitarian; Public Health isn't on E-Plan.", source: "https://www.chicago.gov/content/dam/city/depts/cdph/FoodProtection/FP_Plan.Review.Requirements.2020_Feb2021.pdf", checked: "2026-10-17" },
};

const E164 = /^\+[1-9]\d{6,14}$/;
const US_FAX = /^\+1[2-9]\d{2}[2-9]\d{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const EMAIL = /^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const PAYMENTS = new Set(["none", "portal", "invoice", "with_filing", "in_person"]);

/** A host the worker may open: a public name with a real top-level domain, never an address, localhost or an
    internal name (the same rule the worker's navigation guard and the file function's login lookup rely on). */
export function isPublicHost(h: string | undefined): boolean {
  if (!h || !HOST.test(h)) return false;
  if (/^\d+(\.\d+){3}$/.test(h)) return false;                                        // an IPv4 address
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|example|invalid|arpa)$/.test(h)) return false;
  return /\.[a-z]{2,}$/.test(h);
}

const urlOf = (u: string | undefined) => { try { return u ? new URL(u) : null; } catch { return null; } };
/** h is the portal host or one of its subdomains. */
export const onHost = (h: string, portal: string) => h === portal || h.endsWith("." + portal);

/** A saved login (its URL, as the person typed it in the vault) belongs to this destination: the same host, and on a
    host many agencies share, this agency's path. */
export function loginMatches(loginUrl: string | null | undefined, d: Pick<Dest, "portal" | "tenant">): boolean {
  if (!d.portal || !loginUrl) return false;
  const u = urlOf(/^https?:/i.test(loginUrl) ? loginUrl : `https://${loginUrl}`);
  if (!u || !onHost(u.hostname.toLowerCase(), d.portal)) return false;
  return !d.tenant || u.pathname.toLowerCase().startsWith(d.tenant.toLowerCase());
}

function addressProblems(id: string, a: Address | undefined, label: string): string[] {
  if (!a) return [];
  const out: string[] = [];
  for (const k of ["name", "line1", "city", "state", "zip"] as const) if (!a[k]?.trim()) out.push(`${id}: ${label} ${k} is missing`);
  if (/[<>]/.test(JSON.stringify(a))) out.push(`${id}: ${label} still has a placeholder`);
  if (a.zip && !/^\d{5}(-\d{4})?$/.test(a.zip) && (a.country ?? "US") === "US") out.push(`${id}: ${label} zip isn't a US ZIP code`);
  return out;
}

const firstSegment = (u: string | undefined) => (urlOf(u)?.pathname.split("/").filter(Boolean)[0] ?? "").toLowerCase();

/** Every reason an entry can't ship. The tests and CI fail on any. */
export function destinationProblems(dest: Record<string, Dest> = DEST): string[] {
  const out: string[] = [];
  for (const [id, d] of Object.entries(dest)) {
    if (!d.checked || !DATE.test(d.checked) || Number.isNaN(Date.parse(d.checked))) out.push(`${id}: checked must be the date it was confirmed (YYYY-MM-DD)`);
    if (!d.source || !/^https:\/\//.test(d.source) || !urlOf(d.source)) out.push(`${id}: source must be the agency's https page`);
    for (const a of d.also ?? []) if (!/^https:\/\//.test(a) || !urlOf(a)) out.push(`${id}: every page in also must be https`);
    if (!d.email && !d.fax && !d.mail && !d.portal && !d.owner) out.push(`${id}: has no destination`);
    if (d.email && !EMAIL.test(d.email)) out.push(`${id}: email is not an address`);
    if (d.fax && (!E164.test(d.fax.us) || (d.fax.foreign !== undefined && !E164.test(d.fax.foreign)))) out.push(`${id}: fax numbers must be E.164 (+1...)`);
    if (d.fax && !US_FAX.test(d.fax.us)) out.push(`${id}: the US fax number must be a US number`);
    if (d.portal && !HOST.test(d.portal)) out.push(`${id}: portal must be a bare host name`);
    if (d.portal && !isPublicHost(d.portal)) out.push(`${id}: portal must be a public host name, not an address or an internal name`);
    if (d.portalUrl) {
      const u = urlOf(d.portalUrl);
      if (!u || u.protocol !== "https:" || u.username || u.password || u.port) out.push(`${id}: portalUrl must be a plain https link`);
      else if (!d.portal || !onHost(u.hostname.toLowerCase(), d.portal)) out.push(`${id}: portalUrl must be on the portal host`);
    }
    if (d.portalUrl && !d.portal) out.push(`${id}: portalUrl without a portal`);
    if (d.tenant !== undefined && (!/^\/[\w.-]+$/.test(d.tenant) || !d.portalUrl || !urlOf(d.portalUrl)?.pathname.toLowerCase().startsWith(d.tenant.toLowerCase()))) {
      out.push(`${id}: tenant must be the first part of the portalUrl's path`);
    }
    for (const h of d.alsoOn ?? []) if (!isPublicHost(h)) out.push(`${id}: every other host the portal uses must be a public host name`);
    if (d.alsoOn?.length && !d.portal) out.push(`${id}: other portal hosts without a portal`);
    if (d.payment !== undefined && !PAYMENTS.has(d.payment)) out.push(`${id}: payment must be one of ${[...PAYMENTS].join(", ")}`);
    if (d.onBehalf === "authorization" && !d.authorization?.trim()) out.push(`${id}: name the authorization the agency asks for`);
    if (d.attach && (!Array.isArray(d.attach) || d.attach.some((a) => !a.trim()))) out.push(`${id}: attachments must be named`);
    if (d.owner) {
      // An owner packet is never sent by Placetta, so it carries no channel the dispatcher would send on.
      if (d.email || d.fax || d.mail || d.portal) out.push(`${id}: an owner-only form has no channel Placetta sends on`);
      if (!d.owner.why?.trim()) out.push(`${id}: say why only the owner can submit it`);
      if (!d.owner.url && !d.owner.email && !d.owner.mail) out.push(`${id}: say where the owner sends it`);
      if (d.owner.url && (!/^https?:\/\//.test(d.owner.url) || !urlOf(d.owner.url))) out.push(`${id}: the owner's link must be a web address`);
      if (d.owner.email && !EMAIL.test(d.owner.email)) out.push(`${id}: the owner's email is not an address`);
      out.push(...addressProblems(id, d.owner.mail, "owner mail"));
    }
    out.push(...addressProblems(id, d.mail, "mail"), ...addressProblems(id, d.mail?.foreign, "foreign mail"));
  }
  // On a host several agencies share, each entry names its agency's path, so a saved login for one agency is never
  // used for another.
  const byHost = new Map<string, [string, Dest][]>();
  for (const [id, d] of Object.entries(dest)) if (d.portal) byHost.set(d.portal, [...(byHost.get(d.portal) ?? []), [id, d]]);
  for (const [host, list] of byHost) {
    const segments = new Set(list.map(([, d]) => firstSegment(d.portalUrl)));
    if (segments.size > 1) for (const [id, d] of list) if (!d.tenant) out.push(`${id}: ${host} serves several agencies, so this entry needs its tenant path`);
  }
  return out;
}

/** Entries last checked more than `days` ago. */
export function staleDestinations(today: string, days = 90, dest: Record<string, Dest> = DEST): { id: string; checked: string; source: string }[] {
  const now = Date.parse(today + "T00:00:00Z");
  return Object.entries(dest)
    .filter(([, d]) => now - Date.parse(d.checked + "T00:00:00Z") > days * 864e5)
    .map(([id, d]) => ({ id, checked: d.checked, source: d.source }));
}
