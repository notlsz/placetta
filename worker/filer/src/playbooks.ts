// Playbooks for the portals the most registry forms use (supabase/functions/file/destinations.ts): My Health
// Department (4 forms), Accela Citizen Access at aca-prod.accela.com (4), SJPermits (3), BTExpress at county-taxes.net
// (3), Denver's portals at denvergov.org (3) and California's bizfile Online (3). Fairfax County's PLUS also has 3
// forms, but its only published guides are videos. Then the formation portals of the states whose Secretary publishes
// a written walkthrough: Washington's CCFS, Georgia's eCorp and Virginia's Clerk's Information System (one form each).
// And Austin's AB+C Portal (3 forms since its building final is booked online), from the city's scheduling steps.
//
// test/replay.test.ts walks each playbook through a static copy of the pages its guide documents (test/mocks), so a
// guide's page names, buttons and fee pages stay consistent with what the guards key on.
//
// Each playbook is written from the portal's published user guide, cited below, because Placetta can't open these
// portals to record them. So none is verified: the worker refuses a playbook whose `verified` is null unless
// FILER_ALLOW_UNVERIFIED=1, and staff run the first filing on it while watching. A supervised run always stops at the
// agency's review page for the team's check, even after the two-key period. When that first run submits, the worker
// records the real steps as a skill (agent_skills) and replays them from then on; a person then sets `verified` here
// to the date, who watched, and the filing id.
//
// The steps guide the model, which still picks one action at a time. What the code enforces whatever the model does:
// only approved values are typed (guards.ts), the final-submit guard runs before every button in `final`, and every
// page named in `pay` goes to the person, who pays the agency's fee themselves.
import type { PageState } from "./guards.ts";

/** One step as the guide prints it. selector is the worker's own selector grammar ("button:", "link:", "label:")
    when the guide names the control; the model confirms it against the page. */
export type Step = { page: string; do: "sign_in" | "open" | "choose" | "fill" | "upload" | "agree" | "review" | "submit" | "pay" | "receipt"; selector?: string; note: string };
export type FormSteps = { start: string; steps: Step[]; guides?: string[] };
export type Final = { page: string; button?: string };   // a button on that page sends it; with no button, any forward button does
export type Playbook = {
  host: string;
  name: string;
  guides: string[];                                       // the published guides the steps are written from
  read: string;                                           // when they were read (YYYY-MM-DD)
  verified: null | { on: string; by: string; filing: string };
  forms: Record<string, FormSteps>;                       // official form id → its steps
  final: Final[];
  /** Buttons the guide shows only opening the next form, on the page it names ("Schedule Inspection" on AB+C's My
      Inspections opens the request; "Request Inspection" sends it). Never a button `final` names. */
  nav?: { page: string; button: string; path?: string }[];   // path: the nav page's own address path, when the guide shows it
  pay: string[];                                          // words in the heading of a page where the agency takes its fee
  receipt: string[];                                      // words in the heading of the page that confirms it
  confirm?: string;                                       // a pattern whose first group is the confirmation number, when the guide shows one
};

const ACA = "https://dallascityhall.com/departments/sustainabledevelopment/DCH%20documents/3.%20Applying%20for%20a%20Commercial%20Alteration%20and%20Addition%20Application.pdf";

export const PLAYBOOKS: Playbook[] = [
  {
    host: "aca-prod.accela.com",
    name: "Accela Citizen Access (DallasNow, Fort Worth, Permit Arlington)",
    guides: [
      ACA,
      "https://dallascityhall.com/departments/sustainabledevelopment/Pages/DallasNow.aspx",
      "https://www.fortworthtexas.gov/departments/development-services/permits/certificate-of-occupancy",
      "https://arlingtonva.us/Government/Programs/Health/Environmental-Health/Food-Establishment-Plans-Construction",
    ],
    read: "2026-10-18",
    verified: null,
    // DallasNow guide, step 24: "Review and/ or edit the application and check the certification agreement box, then
    // click Continue Application." That moves it to Pay Fees, where step 25 is "Check Out".
    final: [{ page: "Review", button: "Continue Application" }],
    pay: ["Pay Fees", "Payment", "Check Out", "Order Summary"],
    receipt: ["Record Issuance", "Receipt"],
    forms: {
      "dal-co": {
        start: "https://aca-prod.accela.com/dallastx",
        guides: ["https://dallascityhall.com/departments/sustainabledevelopment/buildinginspection/Pages/certificate_occupancy.aspx"],
        steps: [
          { page: "Login", do: "sign_in", note: "Enter the saved username or email and password, then click Sign In (guide step 1)." },
          { page: "Home", do: "open", selector: "link:Building", note: "Click Building (step 2), then Create an Application (step 3)." },
          { page: "General Disclaimer", do: "agree", note: "Check \"I have read and accepted the above terms\", then click Continue Application (step 4)." },
          { page: "Select a Record Type", do: "choose", note: "Choose the Certificate of Occupancy application; the CO page says to submit it \"and Land Use Questionnaire through DallasNOW\". If the type isn't listed by that name, ask the person." },
          { page: "Contact Information", do: "fill", note: "Select from Account for the Applicant and the Property Owner (steps 8 to 13); both are required." },
          { page: "Work Location", do: "fill", note: "Enter only the street number in Street # and the street name in Street Name, search, and pick the address, parcel and owner (steps 15 to 18)." },
          { page: "Project Information", do: "fill", note: "Fill the description and the required fields from the approved values only (steps 19 and 20)." },
          { page: "Support Documentation", do: "upload", note: "Attach each listed document: the CO Application and the Land Use Questionnaire, from the approved files (step 23)." },
          { page: "Review", do: "review", selector: "button:Continue Application", note: "Check the certification agreement box. The worker compares this page with the approved values before Continue Application (step 24)." },
          { page: "Pay Fees", do: "pay", note: "\"See Application Fees, then click Check Out\" (step 25): the person pays the fee themselves." },
          { page: "Record Issuance", do: "receipt", note: "\"Receive Receipt/Record Issuance for printing and a confirmation email\" (step 28): note the record number." },
        ],
      },
      "dal-building": {
        start: "https://aca-prod.accela.com/dallastx",
        steps: [
          { page: "Login", do: "sign_in", note: "Sign in with the saved login (step 1)." },
          { page: "Home", do: "open", selector: "link:Building", note: "Click Building, then Create an Application (steps 2 and 3)." },
          { page: "General Disclaimer", do: "agree", note: "Accept the terms, then Continue Application (step 4)." },
          { page: "Contractor", do: "choose", note: "\"A general contractor will be required for this application\" (step 5): select the contractor named in the approved values, or ask the person." },
          { page: "Select a Record Type", do: "choose", note: "Click Commercial Permits, select Commercial Alteration Addition Permit, then Continue Application (steps 6 and 7)." },
          { page: "Contact Information", do: "fill", note: "Applicant and Property Owner from the account (steps 8 to 14)." },
          { page: "Work Location", do: "fill", note: "Street # and Street Name only; pick the address, parcel and owner (steps 15 to 18)." },
          { page: "Project Information", do: "fill", note: "Detailed Description and Project Details Parts 1 and 2 (steps 19 and 20); trades (step 21); review request type (step 22)." },
          { page: "Support Documentation", do: "upload", note: "Building Permit Application, fee estimate worksheet, remodel checklist and the CO checklist and application (step 23)." },
          { page: "Review", do: "review", selector: "button:Continue Application", note: "Certification box, then Continue Application after the worker's comparison (step 24)." },
          { page: "Pay Fees", do: "pay", note: "Check Out and payment are the person's (steps 25 to 27)." },
          { page: "Record Issuance", do: "receipt", note: "The receipt and record (step 28)." },
        ],
      },
      "ftw-co": {
        start: "https://aca-prod.accela.com/CFW",
        steps: [
          { page: "Login", do: "sign_in", note: "Sign in with the saved login." },
          { page: "Home", do: "open", note: "Fort Worth: \"this permit application is under the \"Building Permits\" drop down and is called an \"Occupancy Change of Use\"\"; for the same use it is \"Occupancy Existing Ordinance\". Pick the one the approved values name." },
          { page: "Contact Information", do: "fill", note: "Applicant and owner from the account." },
          { page: "Work Location", do: "fill", note: "The address from the approved values." },
          { page: "Support Documentation", do: "upload", note: "Attach the approved files the record asks for." },
          { page: "Review", do: "review", selector: "button:Continue Application", note: "The worker compares the review page with the approved values first." },
          { page: "Pay Fees", do: "pay", note: "The person pays." },
          { page: "Receipt", do: "receipt", note: "Note the record number." },
        ],
      },
      "arl-plan-review": {
        start: "https://aca-prod.accela.com/ARLINGTONCO/Default.aspx",
        steps: [
          { page: "Login", do: "sign_in", note: "Sign in to the Permit Arlington Customer Portal with the saved login." },
          { page: "Home", do: "open", note: "\"Submit your plans and the Food Service Plan Review Application using the Permit Arlington Customer Portal, and pay the appropriate fees.\"" },
          { page: "Support Documentation", do: "upload", note: "The Food Service Plan Review Application, building plans, site plan, equipment schedule and the food protection manager certificate, from the approved files." },
          { page: "Review", do: "review", selector: "button:Continue Application", note: "The worker compares the review page with the approved values first." },
          { page: "Pay Fees", do: "pay", note: "The person pays the fee." },
          { page: "Receipt", do: "receipt", note: "Note the record number." },
        ],
      },
    },
  },
  {
    host: "myhealthdepartment.com",
    name: "My Health Department (Austin Public Health, San Francisco, Orange County)",
    guides: [
      "https://www.austintexas.gov/health/programs/fixed-food-establishments",
      "https://www.sf.gov/get-health-permit-open-restaurant-bar-or-other-retail-food-location",
      "https://www.ochealthinfo.com/services-programs/environmental-health/plan-check",
    ],
    read: "2026-10-18",
    verified: null,
    // Austin: "Upload required documents, sign, and submit."
    final: [{ page: "", button: "Submit" }],
    pay: ["Payment", "Pay Fees", "Checkout"],
    receipt: ["Past Submissions", "Submitted", "Confirmation"],
    forms: {
      "aus-food-preopening": {
        start: "https://myhealthdepartment.com/APH/login",
        steps: [
          { page: "Login", do: "sign_in", note: "\"Log in to your account.\"" },
          { page: "Applications", do: "choose", note: "\"Select: Retail and Wholesale Food Applications -> Pre-Opening Inspection.\"" },
          { page: "Application", do: "fill", note: "\"Complete the application (required fields marked with a red asterisk)\" from the approved values only." },
          { page: "Documents", do: "upload", note: "\"Upload required documents\" from the approved files." },
          { page: "Signature", do: "agree", note: "The applicant signs: if the page asks for a drawn signature, ask the person." },
          { page: "Review", do: "submit", selector: "button:Submit", note: "The worker compares the page with the approved values before Submit." },
          { page: "Past Submissions", do: "receipt", note: "\"You may review or edit your submission under “Past Submissions.”\"" },
        ],
      },
      "aus-food-permit": {
        start: "https://myhealthdepartment.com/APH/login",
        steps: [
          { page: "Login", do: "sign_in", note: "\"Log in to your account.\"" },
          { page: "Applications", do: "choose", note: "\"Select: Food Enterprise → Operational Permit Application\"." },
          { page: "Application", do: "fill", note: "Required fields (red asterisk) from the approved values; names must match the photo ID." },
          { page: "Documents", do: "upload", note: "\"Upload required documents\"." },
          { page: "Review", do: "submit", selector: "button:Submit", note: "\"sign, and submit\" after the worker's comparison." },
          { page: "Past Submissions", do: "receipt", note: "The submission appears under Past Submissions." },
        ],
      },
      "sf-dph-health-permit": {
        start: "https://myhealthdepartment.com/san-francisco/login",
        steps: [
          { page: "Login", do: "sign_in", note: "Sign in (\"Apply for a new health permit\" opens this login)." },
          { page: "Application", do: "fill", note: "\"Have ready your: Business account number, or BAN; Location ID number, or LIN; Federal taxpayer ID\". \"You can save and return to this application at any time.\"" },
          { page: "Documents", do: "upload", note: "\"You might need to show other documents, too, like a menu or floor plan.\"" },
          { page: "Review", do: "submit", selector: "button:Submit", note: "Sign electronically and submit after the worker's comparison." },
          { page: "Payment", do: "pay", note: "Any application fee is the person's to pay." },
        ],
      },
      "oc-plan-check": {
        start: "https://myhealthdepartment.com/orange-county",
        steps: [
          { page: "Login", do: "sign_in", note: "Sign in, or create the account the agency's portal asks for." },
          { page: "Application", do: "fill", note: "\"Submit your plan check application online\" with the approved values." },
          { page: "Review", do: "submit", selector: "button:Submit", note: "The worker compares the page with the approved values before Submit." },
          { page: "Submitted", do: "receipt", note: "\"Once your application is reviewed, our team will email you upload links for your plans\"; fees come by email after upload." },
        ],
      },
    },
  },
  {
    host: "sjpermits.org",
    name: "SJPermits (City of San José)",
    guides: [
      "https://www.sanjoseca.gov/home/showpublisheddocument/88919/639111600083200000",
      "https://www.sanjoseca.gov/business/development-services-permit-center/online-permits-at-sjpermits-org/planning-online-permits",
      "https://www.sanjoseca.gov/your-government/departments-offices/planning-building-code-enforcement/building-division/inspections/inspection-success",
    ],
    read: "2026-10-18",
    verified: null,
    // The fire guide's Figure 13: the Terms and Conditions screen ("You will need to fill out this screen in order to
    // advance") comes right before Payment Details, where the application is complete once paid.
    final: [{ page: "Terms and Conditions" }],
    pay: ["Payment Details"],
    receipt: ["Post Submission Instructions", "Payment Confirmation"],
    forms: {
      "sj-building-ti": {
        start: "https://www.sjpermits.org/",
        steps: [
          { page: "Login", do: "sign_in", note: "\"an SJPermits account is required\"; sign in with the saved login." },
          { page: "My Services", do: "open", selector: "button:Apply for New Permit", note: "\"Click on the Apply for New Permit button\"." },
          { page: "Add New Application", do: "choose", note: "Select the group, type, Sub Type and Work Type (\"New Construction, Tenant Improvement, or Demolition\") the approved values name." },
          { page: "Search for Property Information", do: "fill", note: "Search for the property and confirm the Primary Property." },
          { page: "Project Collaborators", do: "fill", note: "Add the collaborators the approved values name; the city advises a licensed contractor as applicant." },
          { page: "Additional Information", do: "fill", note: "\"Please do not overstate the numbers for the fields which will affect fees.\" Approved values only." },
          { page: "Terms and Conditions", do: "agree", note: "Workers' compensation and licensed contractor declarations; the worker compares the application with the approved values before advancing." },
          { page: "Payment Details", do: "pay", note: "\"This initial fee must be paid through the online submittal process\": the person pays." },
          { page: "Post Submission Instructions", do: "receipt", note: "\"Congratulations, you have successfully completed the initial application phase.\" Plans then go up in SJePlans." },
        ],
      },
      "sj-sign": {
        start: "https://www.sjpermits.org/",
        steps: [
          { page: "Login", do: "sign_in", note: "\"Create an SJPermits account\" or sign in with the saved login." },
          { page: "My Services", do: "open", selector: "button:Apply for New Permit", note: "Apply for New Permit and choose the Sign Permit." },
          { page: "Documents", do: "upload", note: "\"You will upload the form to SJPermits\" with the documents its What to Submit section lists and a Digital Signature." },
          { page: "Terms and Conditions", do: "agree", note: "The worker compares the application with the approved values before advancing." },
          { page: "Post Submission Instructions", do: "receipt", note: "\"SJPermits will generate a File Reference Number for your application\"; staff then send an invoice." },
        ],
      },
      "sj-building-final": {
        start: "https://www.sjpermits.org/",
        steps: [
          { page: "Login", do: "sign_in", note: "Sign in with the saved login." },
          { page: "My Services", do: "open", note: "\"Go to SJPermits.org and select “Schedule an Inspection”\"." },
          { page: "Schedule an Inspection", do: "choose", note: "\"Request all the processes that are complete and ready for inspection\", as the approved values list them." },
          { page: "Confirm", do: "submit", note: "The worker compares the request with the approved values before confirming." },
          { page: "Confirmation", do: "receipt", note: "The inspector calls between 7 and 8 a.m.; someone must be on site." },
        ],
      },
    },
  },
  {
    host: "county-taxes.net",
    name: "BTExpress (Hillsborough, Orange and Miami-Dade County tax collectors)",
    guides: ["https://www.hillstaxfl.gov/wp-content/uploads/2025/05/BTExpress-User-Guide.pdf"],
    read: "2026-10-18",
    verified: null,
    // Guide step 10: "I Agree - You agree to the affidavit. This will submit your application to the county."
    final: [{ page: "Affidavit", button: "I Agree" }],
    pay: [],
    receipt: ["Completed"],
    forms: Object.fromEntries([
      ["hc-business-tax", "https://county-taxes.net/hillsborough/btexpress"],
      ["ocfl-business-tax", "https://county-taxes.net/fl-orange/btexpress"],
      ["mdc-btr", "https://county-taxes.net/fl-miamidade/btexpress"],
    ].map(([id, start]) => [id, {
      start,
      steps: [
        { page: "BTExpress", do: "open", selector: "link:Apply for a new Business Tax account", note: "No account: \"you cannot save your application in BTExpress and return to it later\". Click Apply for a new Business Tax account (step 2)." },
        { page: "Required Documentation", do: "choose", note: "\"Select True or False for each statement about your business\" (step 3), only where the approved values answer it; otherwise ask the person. Then review the required documents and click Next (step 4)." },
        { page: "Business And Owner", do: "fill", note: "\"Enter the business name and location, owner name and address, mailing name and address\" (step 5). The page also asks for an EIN or SSN: Placetta enters only an EIN, and the guards hand any SSN line to the person." },
        { page: "Fictitious (DBA)", do: "choose", note: "Whether the business has a registered fictitious name and its number (step 6)." },
        { page: "Occupation Information", do: "fill", note: "The primary function of the business (steps 7 and 8)." },
        { page: "Submit Documentation", do: "upload", note: "\"Only image files of the documents can be uploaded\" (step 9). Upload only approved image files; PDFs go to the county by mail, fax or in person, which the team handles." },
        { page: "Affidavit", do: "submit", selector: "button:I Agree", note: "\"I Agree ... will submit your application to the county\" (step 10). The worker compares the application with the approved values first." },
        { page: "Completed", do: "receipt", note: "\"Remain on the Completed page until you receive an email from BTExpress\" (step 11): the owner clicks the link in that email to confirm it." },
      ] as Step[],
    }])),
  },
  {
    host: "denvergov.org",
    name: "Denver e-permits and the Online Permitting and Licensing Center (Accela)",
    guides: [
      "https://denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Community-Planning-and-Development/E-permits/E-permits-application-guide",
      "https://denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Community-Planning-and-Development/Plan-Review-Permits-and-Inspections/Zoning-Permits/Apply-for-Commercial-Zoning-Permits",
      "https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Business-Licensing/Business-licenses/Retail-Food/Retail-food/New",
    ],
    read: "2026-10-18",
    verified: null,
    final: [{ page: "Review", button: "Continue Application" }],
    pay: ["Pay Fees", "Payment", "Check Out"],
    receipt: ["Receipt", "Record Issuance"],
    forms: {
      "den-zoning": {
        start: "https://www.denvergov.org/AccelaCitizenAccess/Default.aspx",
        steps: [
          { page: "Login", do: "sign_in", note: "\"If you are new to e-permits, please start by registering for an account\"; sign in with the saved login." },
          { page: "Home", do: "open", note: "\"go to Development Services > Apply for a permit\"." },
          { page: "Select a Record Type", do: "choose", note: "\"Select \"Zoning Permit\" and follow the prompts to submit contact information, project details, and upload documents.\"" },
          { page: "Documents", do: "upload", note: "\"a floor plan, site plan, elevations, or written narrative describing your project\", from the approved files." },
          { page: "Review", do: "review", selector: "button:Continue Application", note: "The worker compares the review page with the approved values first." },
          { page: "Pay Fees", do: "pay", note: "The permit \"is issued once its fee is paid\": the person pays." },
        ],
      },
      "den-food-license": {
        start: "https://www.denvergov.org/AccelaCitizenAccess/Default.aspx",
        steps: [
          { page: "Login", do: "sign_in", note: "Sign in to \"Denver's Online Permitting and Licensing Center\"." },
          { page: "Home", do: "open", note: "\"Under Business/Occupational, Short-Term and Residential Rental Licensing, click \"Apply New.\"\"" },
          { page: "Application", do: "fill", note: "Complete the licensed establishment and entity registration records from the approved values." },
          { page: "Documents", do: "upload", note: "\"you might need to combine documents and upload them in a single .pdf\"; the zoning use permit and the sales tax license." },
          { page: "Review", do: "review", selector: "button:Continue Application", note: "The worker compares the review page with the approved values first." },
          { page: "Pay Fees", do: "pay", note: "\"you will be prompted to submit fees in the online portal\": the person pays ($150 application fee)." },
        ],
      },
    },
  },
  {
    host: "bizfileonline.sos.ca.gov",
    name: "bizfile Online (California Secretary of State)",
    guides: [
      "https://bpd.cdn.sos.ca.gov/ucc/ucc-online-help.pdf",
      "https://bpd.cdn.sos.ca.gov/bizfile/bizfile-online-account-setup.pdf",
      "https://www.sos.ca.gov/business-programs/business-entities/faqs",
    ],
    read: "2026-10-18",
    verified: null,
    // Help guide 11.1.8 (File Document): "Choose File Online to send the document to the Shopping Cart"; the Shopping
    // Cart then takes the fee. The other choice there, Print and Mail, is never used.
    final: [{ page: "File Document", button: "File Online" }],
    // On the Forms page the same words only open the form: "a pop-up window will describe the form and fee, and select
    // File Online" (7.1). The guides don't print the address, so the exception holds only on a page whose main heading
    // is exactly "Forms" and which names neither File Document nor a fee page (navOn); anywhere else "File Online" is a
    // send and the final-submit guard runs. Found by worker/filer/test/cafllc.test.ts; not yet seen on the live site.
    nav: [{ page: "Forms", button: "File Online" }],
    pay: ["Shopping Cart", "Checkout", "Payment"],
    receipt: ["My Work Queue", "Receipt"],
    forms: Object.fromEntries(([
      ["ca-llc-1", "Articles of Organization - CA LLC", null],
      ["ca-llc-5", "Application to Register a Foreign LLC", "The Certificate of Good Standing from where the LLC was formed, from the approved files."],
      ["ca-llc-12", "Statement of Information - LLC", null],
    ] as const).map(([id, form, upload]) => [id, {
      start: "https://bizfileonline.sos.ca.gov/",
      steps: [
        { page: "Login", do: "sign_in", note: "Click the Login button in the upper right corner, enter the Username and Password, and click Sign In (account guide)." },
        ...(id === "ca-llc-12" ? [{ page: "My Records", do: "open", note: "The LLC must be in My Records: the account guide's Request Access sends a PIN to the entity's mailing address. If the LLC isn't listed, call need_person." } as Step] : []),
        { page: "Forms", do: "choose", selector: "button:File Online", note: `"Click on Forms on the Left Navigation Pane. Make sure the Business tab is selected at the top." Select ${form}; "a pop-up window will describe the form and fee, and select File Online" (7.1).` },
        { page: form, do: "fill", note: "\"Each section of the workflow is listed on the left\" (11.1): fill each from the approved values and use Next Step. \"The user cannot submit a document if any sections are missing required information\" (7.13)." },
        ...(upload ? [{ page: "Attachments", do: "upload", note: upload } as Step] : []),
        { page: "Review", do: "review", note: "\"The Review page gives the user a chance to review the data that has been entered\"; it becomes public record, so the worker compares it with the approved values (11.1.7)." },
        { page: "File Document", do: "submit", selector: "button:File Online", note: "\"Choose File Online to send the document to the Shopping Cart\" (11.1.8), never Print and Mail. The final-submit guard runs first." },
        { page: "Shopping Cart", do: "pay", note: "\"The Shopping Cart will automatically open on the right-hand side of the page\" (11.2.1): checkout and the fee are the person's." },
        { page: "My Work Queue", do: "receipt", note: "\"After a filing, check its status in the My Work Queue tab\"; note the receipt or work order number." },
      ] as Step[],
    }])),
  },
  {
    host: "ccfs.sos.wa.gov",
    name: "Corporations and Charities Filing System (Washington Secretary of State)",
    guides: ["https://www.sos.wa.gov/corporations-charities/business-entities/online-filing-instructions/start-domestic-wa-limited-liability-company-llc-online"],
    read: "2026-10-18",
    verified: null,
    // "On the Review page, select "Add to Cart"": what the worker commits to; Checkout and "Place your Order" take the fee.
    final: [{ page: "Review", button: "Add to Cart" }],
    pay: ["Shopping Cart", "Checkout"],
    receipt: ["Order Confirmation", "Confirmation"],
    forms: {
      "wa-sos": {
        start: "https://ccfs.sos.wa.gov/",
        steps: [
          { page: "Login", do: "sign_in", note: "\"Log in to your account\" with the saved login." },
          { page: "Dashboard", do: "open", selector: "link:Create or Register a Business", note: "\"Select \"Create or Register a Business\" from the left navigation bar.\"" },
          { page: "Create or Register a Business", do: "choose", selector: "button:Continue", note: "\"Select \"I would like to form a Washington State business.\"\", \"WA Limited Liability Company\" from the business type drop-down, then Continue." },
          { page: "Business Information", do: "fill", note: "Fill each section from the approved values. \"All businesses must designate a Registered Agent in Washington State\"; the return address only receives the confirmation." },
          { page: "Authorized Person", do: "agree", note: "The Authorized Person's first and last name, and the box \"This document is hereby executed under penalty of law and is to the best of my knowledge, true and correct\": only the approved signer, or ask the person." },
          { page: "Review", do: "review", selector: "button:Add to Cart", note: "\"On the Review page, select \"Add to Cart.\"\" The worker compares the page with the approved values first." },
          { page: "Shopping Cart", do: "pay", note: "\"Select \"Checkout\"\", \"Proceed to Checkout\", then \"Enter the required payment information\" and \"Place your Order\": the person pays ($180 plus the processing fee)." },
          { page: "Order Confirmation", do: "receipt", note: "The guide doesn't show this page: note any order or filing number it shows." },
        ],
      },
    },
  },
  {
    host: "ecorp.sos.ga.gov",
    name: "eCorp Online Services (Georgia Secretary of State, Corporations Division)",
    guides: ["https://sos.ga.gov/sites/default/files/forms/Online%20Services%20User%20Guide.pdf", "https://sos.ga.gov/how-to-guide/how-guide-register-domestic-entity"],
    read: "2026-10-18",
    verified: null,
    // User guide: on the review page "Verify your information ... then click Submit"; the payment page follows.
    final: [{ page: "Review", button: "Submit" }],
    pay: ["Payment"],
    receipt: ["Thank You"],
    forms: {
      "ga-sos": {
        start: "https://ecorp.sos.ga.gov/",
        steps: [
          { page: "Customer Login", do: "sign_in", note: "Online Services, then on the Customer Login page \"enter your User ID and Password, then click Log In\"." },
          { page: "Business Formation", do: "choose", note: "In Create Business, choose a new domestic business and select Domestic Limited Liability Company from the dropdown (the how-to guide: \"create or register a business\")." },
          { page: "Business Name", do: "fill", note: "The name (or name choices), the Business Purpose NAICS code or \"Any Legal Purpose\", the Principal Office Address and the business email, from the approved values; Continue." },
          { page: "Registered Agent", do: "fill", note: "\"Create Registered Agent\": a Georgia street address where the agent can be personally served. Then the organizers (the guide's example adds incorporators the same way)." },
          { page: "Certification", do: "agree", note: "\"Check the certify box, select an Effective Date, enter your name in the Authorizer Signature field, choose your title\": only the approved signer, or ask the person." },
          { page: "Review", do: "review", selector: "button:Submit", note: "\"Verify your information. Use \"Edit Info\" or \"Back\" to make changes, then click \"Submit.\"\" The worker compares the page first." },
          { page: "Payment", do: "pay", note: "Processing speed and \"Click to Pay\", then the card on the secure gateway: the person pays ($110)." },
          { page: "Thank You", do: "receipt", note: "\"Check \"Pending Filings\" for status\"; the certificate is emailed once approved." },
        ],
      },
    },
  },
  {
    host: "cis.scc.virginia.gov",
    name: "Clerk's Information System (Virginia State Corporation Commission)",
    guides: ["https://www.scc.virginia.gov/media/sccvirginiagov-home/business-home/business-faqs/llc-faqs/how-to-guide-form-a-virginia-limited-liability-company.pdf"],
    read: "2026-10-18",
    verified: null,
    // Guide steps 28 and 29: "Review each section of the Articles of Organization", then "Click Add To Shopping Cart";
    // Checkout and the LexisNexis payment page (with its CAPTCHA) follow.
    final: [{ page: "Review", button: "Add To Shopping Cart" }],
    pay: ["Shopping Cart", "Payment"],
    receipt: ["Confirmation"],
    forms: {
      "va-llc": {
        start: "https://cis.scc.virginia.gov/",
        steps: [
          { page: "Log In", do: "sign_in", note: "\"Log on to CIS at cis.scc.virginia.gov\" with the saved login (step 1)." },
          { page: "Dashboard", do: "open", selector: "link:Online Services", note: "\"Click Online Services on the top left\", then \"Select Form or Register a Business\" (steps 2 and 3)." },
          { page: "Form or Register a Business", do: "choose", selector: "button:Continue", note: "\"Select Virginia Entity. Click Continue.\" Then \"Select Limited Liability Company, then Articles of Organization from the drop-down. Click Continue.\" (steps 4 and 8)" },
          { page: "Entity Name", do: "fill", note: "A reserved name takes its Reservation ID and PIN; otherwise \"Enter an Entity Name and click Check Availability\" and Next once it is \"available and acceptable\" (steps 5 to 10)." },
          { page: "Entity Information", do: "fill", note: "\"Enter the Entity Email Address and Contact Number\", the Industry Code (\"Most select 0 - General\") and Duration (\"Most select Perpetual\"), then Next (steps 11 to 16)." },
          { page: "Registered Agent", do: "fill", note: "Individual or Entity, search for it or Create Individual RA, the RA Capacity, then Next (steps 17 and 18): the agent the approved values name, or ask the person." },
          { page: "Principal Office Address", do: "fill", note: "\"Enter the Principal Office Address information\", then Next (steps 19 and 20)." },
          { page: "Management Structure", do: "choose", note: "\"Select the Management Structure from the Manager/Member Information drop-down\", then Next (steps 21 and 22)." },
          { page: "Upload Articles", do: "upload", note: "Optional, and left alone: \"If you do not upload Articles, the system will create a filing image\"; an uploaded document isn't approved in real time (steps 23 and 24). Click Next." },
          { page: "Signature", do: "agree", note: "Signing as an Individual or On behalf of Business Entity, the Signature Information, Add, OK, then Next (steps 25 to 27): only the approved signer, or ask the person." },
          { page: "Review", do: "review", selector: "button:Add To Shopping Cart", note: "\"Review each section of the Articles of Organization\"; the worker compares it with the approved values before \"Add To Shopping Cart\" (steps 28 and 29)." },
          { page: "Shopping Cart", do: "pay", note: "\"Click Checkout\", \"Go To Payment\", Continue: the payment page (run by LexisNexis, with a CAPTCHA) is the person's (steps 30 to 35)." },
          { page: "Confirmation", do: "receipt", note: "\"You will be directed to a confirmation screen\"; \"In the Confirmation pop up window, click I Agree\" (step 36)." },
        ],
      },
    },
  },
  {
    // Austin's AB+C Portal (abc.austintexas.gov): 3 forms since the building final's online booking (2026-10-22). The
    // steps are the city's own "How to Schedule an Inspection Online"; the permit applications there stay with the team.
    host: "abc.austintexas.gov",
    name: "Austin Build + Connect (AB+C) Portal",
    guides: ["https://www.austintexas.gov/development-services/schedule-building-inspection"],
    read: "2026-10-22",
    verified: null,
    // "Check the box to the left of the inspection you wish to schedule, select a date ... click Request Inspection."
    final: [{ page: "Schedule Inspection", button: "Request Inspection" }],
    // "Click Schedule Inspection" only opens the request form on My Inspections
    nav: [{ page: "My Inspections", button: "Schedule Inspection" }],
    pay: ["Pay Fees", "Payment"],
    receipt: ["My Inspections"],
    forms: {
      "insp-aus-building-final": {
        start: "https://abc.austintexas.gov/",
        steps: [
          { page: "Login", do: "sign_in", note: "\"You must be a registered AB+C Portal user\": the owner's saved login. Never register one: if there's no saved login, stop for the team (step 1)." },
          { page: "My Inspections", do: "open", selector: "button:Schedule Inspection", note: "\"Clicking My Inspections will display permits with available inspections\"; tick \"the small check box to the left of the permit number\" for the approved permit, then \"Click Schedule Inspection\" (steps 2 to 4). It is only offered if the account is linked to the permit, the permit is Active and its fees are paid." },
          { page: "Schedule Inspection", do: "submit", selector: "button:Request Inspection", note: "\"Check the box to the left of the inspection you wish to schedule, select a date, and leave any comments for the inspector\": only the approved inspection and date. The worker compares the page with them before \"Request Inspection\" (step 4)." },
          { page: "My Inspections", do: "receipt", note: "\"a confirmation note will appear at the top of the page\": it either confirms the inspection was scheduled or shows an error code (step 5). Record it as the booking's confirmation." },
        ],
      },
    },
  },
];

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const headings = (s: PageState) => [s.title, ...s.headings].map(norm).join(" | ");

/** The playbook and steps for this portal and form, if any. */
export function playbookFor(host: string, official: string): { playbook: Playbook; form: FormSteps } | null {
  const playbook = PLAYBOOKS.find((p) => p.host === host);
  const form = playbook?.forms[official];
  return playbook && form ? { playbook, form } : null;
}

/** Buttons that only move back, save or leave never send the application. */
const NOT_FORWARD = /\b(back|previous|cancel|save|close|log ?out|sign ?out|help|search|add|delete|remove|browse|upload)\b/i;

/** Clicking this button on this page sends the application to the agency: the final-submit guard runs first. */
export function finalOn(p: Playbook | undefined, s: PageState, buttonText: string): boolean {
  if (!p || !buttonText.trim()) return false;
  const on = headings(s);
  return p.final.some((f) => (!f.page || on.includes(norm(f.page)))
    && (f.button ? norm(buttonText) === norm(f.button) : !NOT_FORWARD.test(buttonText)));
}

/** This button, on this page, only opens the next form, as the guide shows: the generic send words ("Schedule") don't
 *  make it a send. A button the guide's `final` names is always a send on its own page.
 *
 *  A nav button may carry the same words as a send button (bizfile Online's "File Online" opens the form on Forms and
 *  sends it on File Document) only when both are scoped to different pages (navProblems). The exception then applies
 *  only when the page is unambiguously the nav page, read from the page itself (pageState: the DOM's visible h1-h3
 *  and its address, never the model's say-so): it has a parseable address, on the nav entry's `path` when the entry
 *  names one; its first visible heading is exactly the nav page (the <title> alone never counts: a page with no
 *  heading gets no exception); exactly one button or link on the page carries the words; and nothing on the page
 *  (headings, title or visible text) names the send page or any fee page. Anything else gets no exception, so the
 *  final-submit guard runs and the run hands back: fail closed, never navigation. The worker (run.ts exec) also
 *  refuses the exception once a submit has been pressed, and reads the page again just before the click. */
export function navOn(p: Playbook | undefined, s: PageState, buttonText: string): boolean {
  if (!p?.nav?.length || !buttonText.trim() || finalOn(p, s, buttonText)) return false;
  const all = [s.title, ...s.headings].map(norm).filter(Boolean);
  const main = norm(s.headings[0] ?? "");
  let path: string | null = null;
  try { path = new URL(s.url).pathname.toLowerCase(); } catch { path = null; }
  return p.nav.some((n) => {
    if (norm(buttonText) !== norm(n.button)) return false;
    const shared = p.final.some((f) => f.button && norm(f.button) === norm(n.button));
    if (!shared) return all.join(" | ").includes(norm(n.page));
    // the shared-word case: an address, the nav page's own path when named, the exact first heading, no other guide page
    if (path === null || !main || main !== norm(n.page)) return false;
    if (n.path && !path.startsWith(n.path.toLowerCase())) return false;
    // exactly one control on the page carries these words: two or more is ambiguous
    if ([...s.buttons.map((x) => x.text), ...s.links.map((x) => x.text)].filter((t) => norm(t) === norm(n.button)).length !== 1) return false;
    // the heading never outweighs the rest of the page: the send page or a fee page named anywhere on it is a conflict
    const others = [...p.final.map((f) => f.page), ...p.pay].map((x) => norm(x ?? "")).filter((x) => x && x !== norm(n.page));
    const seen = [...all, norm(s.text ?? "")];
    return !seen.some((h) => others.some((o) => h.includes(o)));
  });
}

/** Every reason the playbook's nav entries could let a send through. A nav button may share its words with a send
 *  button only when both name a page and the pages differ; a nav entry with no page, or on the send's own page, or
 *  sharing words with a send that names no page, is refused. */
export function navProblems(p: Playbook): string[] {
  const out: string[] = [];
  for (const n of p.nav ?? []) {
    if (!n.page.trim() || !n.button.trim()) out.push(`${p.host}: a nav entry needs a page and a button`);
    for (const f of p.final) {
      if (!f.button || norm(f.button) !== norm(n.button)) continue;
      if (!f.page?.trim()) out.push(`${p.host}: "${n.button}" is a send on every page, so it can't also open a form`);
      else if (norm(f.page) === norm(n.page) || norm(f.page).includes(norm(n.page)) || norm(n.page).includes(norm(f.page))) {
        out.push(`${p.host}: "${n.button}" opens on "${n.page}" and sends on "${f.page}": the pages overlap`);
      }
    }
    if (p.pay.some((w) => norm(n.page).includes(norm(w)) || norm(w).includes(norm(n.page)))) out.push(`${p.host}: "${n.page}" is also a fee page`);
  }
  return out;
}

/** This page is where the agency takes its fee: the person pays it. */
export const payOn = (p: Playbook | undefined, s: PageState): boolean => !!p && p.pay.some((w) => headings(s).includes(norm(w)));

/** The pages the guide walks through, once each and in order: the customer's progress list while the filing runs
 *  ("page 3 of 6"), the way Devin and Claude Code show a plan's steps beside the live work. */
export function pageOutline(form: FormSteps): string[] {
  const out: string[] = [];
  for (const s of form.steps) { const p = s.page.trim(); if (p && !out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p); }
  return out.slice(0, 20);
}

/** The steps as the model reads them, with the warning that they are unverified. */
export function guideLines(x: { playbook: Playbook; form: FormSteps }): string[] {
  return [
    `Published guide for ${x.playbook.name}${x.playbook.verified ? "" : " (not yet verified on the live site: if the page differs, follow the page and call need_person when unsure)"}:`,
    ...x.form.steps.map((s, i) => `${i + 1}. [${s.page}] ${s.note}${s.selector ? ` (${s.selector})` : ""}`),
  ];
}
