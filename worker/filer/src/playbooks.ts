// Playbooks for the five portals the most registry forms use (supabase/functions/file/destinations.ts): My Health
// Department (4 forms), Accela Citizen Access at aca-prod.accela.com (4), SJPermits (3), BTExpress at county-taxes.net
// (3) and Denver's portals at denvergov.org (3). Fairfax County's PLUS also has 3 forms, but its only published guides
// are videos, so Denver, whose guides are written, takes the fifth place.
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

/** This page is where the agency takes its fee: the person pays it. */
export const payOn = (p: Playbook | undefined, s: PageState): boolean => !!p && p.pay.some((w) => headings(s).includes(norm(w)));

/** The steps as the model reads them, with the warning that they are unverified. */
export function guideLines(x: { playbook: Playbook; form: FormSteps }): string[] {
  return [
    `Published guide for ${x.playbook.name}${x.playbook.verified ? "" : " (not yet verified on the live site: if the page differs, follow the page and call need_person when unsure)"}:`,
    ...x.form.steps.map((s, i) => `${i + 1}. [${s.page}] ${s.note}${s.selector ? ` (${s.selector})` : ""}`),
  ];
}
