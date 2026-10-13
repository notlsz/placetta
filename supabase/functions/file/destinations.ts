// Where each official form may be sent. The file dispatcher sends only to these; a destination from the client is
// never used. Every entry is copied from the agency's own page, with the page and the date someone checked it.
// Re-check each entry every quarter: the monitor opens a team task when one is older than 90 days.
//
// Keys are official form ids from src/forms/registry.ts and world.ts.

export type Address = { name: string; line1: string; line2?: string; city: string; state: string; zip: string; country?: string };

export type Dest = {
  email?: string;                                   // agency inbox that accepts this form
  fax?: { us: string; foreign?: string };           // E.164; foreign = owner with no US address
  mail?: Address & { foreign?: Address };
  portal?: string;                                  // https host the worker may open, e.g. "bizfile.sos.ca.gov"
  noLogin?: boolean;                                // the portal files without an account (the worker opens it with no saved login)
  faxQuality?: "high" | "very_high";                // when the agency asks for a finer fax (the IRS asks for 300 DPI or more)
  signature: "none" | "typed" | "drawn" | "wet";    // what the agency accepts on this form
  checked: string;                                  // YYYY-MM-DD someone confirmed it on the agency's page
  source: string;                                   // that page
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
    checked: "2026-10-13",
    source: "https://www.houstonpermittingcenter.org/media/941/download",
  },
  "ny-dol-100": {
    fax: { us: "+15184858010" },
    mail: { name: "NYS Department of Labor, Unemployment Insurance Division, Registration Section", line1: "Harriman State Office Campus, Building 12", city: "Albany", state: "NY", zip: "12240-0339" },
    portal: "www.businessexpress.ny.gov",
    signature: "wet",                                 // "This form must be signed by the person completing it."
    checked: "2026-10-13",
    source: "https://dol.ny.gov/system/files/documents/2021/02/nys100-1.pdf",
  },
  "ny-dos-pub": {
    mail: { name: "New York Department of State, Division of Corporations", line1: "One Commerce Plaza, 99 Washington Avenue", city: "Albany", state: "NY", zip: "12231" },
    signature: "wet",
    checked: "2026-10-13",
    source: "https://dos.ny.gov/certificate-publication-domestic-limited-liability-company-0",
  },
  "tx-ap201": {
    email: "sales.applications@cpa.texas.gov",        // paper AP-201, for owners without an SSN
    fax: { us: "+15129360010" },
    signature: "wet",
    checked: "2026-10-13",
    source: "https://comptroller.texas.gov/taxes/permit/",
  },
  "tx-205": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    signature: "drawn",                               // "A wet ink signature is not required. Copies and electronically signed documents are accepted."
    checked: "2026-10-13",
    source: "https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml",
  },
  "tx-304": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    portal: "direct.sos.state.tx.us",                 // SOSDirect: "Payments for web filings may be made by credit card or client account" (help-corp-filing-304)
    signature: "drawn",
    checked: "2026-10-13",
    source: "https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml",
  },
  "tx-503": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    signature: "drawn",
    checked: "2026-10-13",
    source: "https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml",
  },
  "aus-food-plan-review": {
    email: "ehsd.service@austintexas.gov",
    mail: { name: "Environmental Health Services Division", line1: "P.O. Box 142529", city: "Austin", state: "TX", zip: "78714" },
    signature: "wet",
    checked: "2026-10-13",
    source: "https://austintexas.gov/sites/default/files/files/APH%20Comms/Plan_Review_FFE_EN_061424.pdf",
  },
  "aus-food-preopening": {
    email: "ehsd.service@austintexas.gov",
    mail: { name: "Environmental Health Services Division", line1: "P.O. Box 142529", city: "Austin", state: "TX", zip: "78714" },
    portal: "myhealthdepartment.com",
    signature: "wet",
    checked: "2026-10-13",
    source: "https://www.austintexas.gov/sites/default/files/files/APH%20Comms/Food-Pre-Opening-Revise.pdf",
  },
  "aus-food-permit": {
    mail: { name: "Environmental Health Services Division", line1: "P.O. Box 142529", city: "Austin", state: "TX", zip: "78714" },
    signature: "wet",                                 // names must match the photo ID; email is not a route for this form
    checked: "2026-10-13",
    source: "https://www.austintexas.gov/sites/default/files/files/Health/Environmental/Food/Operational_Permit_Application_FFE_EN_110118_TC.pdf",
  },
  "dal-co": { portal: "aca-prod.accela.com", signature: "typed", checked: "2026-10-13", source: "https://dallascityhall.com/departments/sustainabledevelopment/buildinginspection/Pages/certificate_occupancy.aspx" },
  "dal-building": { portal: "aca-prod.accela.com", signature: "typed", checked: "2026-10-13", source: "https://dallascityhall.com/departments/sustainabledevelopment/DCH%20documents/3.%20Applying%20for%20a%20Commercial%20Alteration%20and%20Addition%20Application.pdf" },
  "sf-business-registration": { portal: "etaxstatement.sfgov.org", signature: "typed", checked: "2026-10-13", source: "https://sftreasurer.org/business/register-business" },
  "sj-building-ti": { portal: "sjpermits.org", signature: "drawn", checked: "2026-10-13", source: "https://www.sanjoseca.gov/businesses/development-services-permit-center/start-your-project/commercial-industrial-properties/tenant-improvement" },
  "sj-sign": { portal: "sjpermits.org", signature: "drawn", checked: "2026-10-13", source: "https://www.sanjoseca.gov/business/development-services-permit-center/online-permits-at-sjpermits-org/planning-online-permits" },
  "aus-building": { portal: "abc.austintexas.gov", signature: "typed", checked: "2026-10-13", source: "https://www.austintexas.gov/development-services/commercial-plan-review" },
  "la-ladbs": { portal: "eplanla.lacity.org", signature: "typed", checked: "2026-10-13", source: "https://dbs.lacity.gov/" },

  // ---- Read from the agencies' own pages on 2026-10-13 (federal, California, Los Angeles, New York). ----
  "irs-5472": {
    // Foreign-owned U.S. DEs: "Fax ... to 855-887-7737" (300 DPI or higher) or mail; "you cannot file Form 5472 electronically."
    fax: { us: "+18558877737", foreign: "+18558877737" },
    faxQuality: "very_high",
    mail: { name: "Internal Revenue Service", line1: "1973 Rulon White Blvd", line2: "M/S 6112 Attn: PIN Unit", city: "Ogden", state: "UT", zip: "84201" },
    signature: "wet",                                 // signed with the pro forma Form 1120
    checked: "2026-10-13",
    source: "https://www.irs.gov/zh-hant/instructions/i5472",
  },
  "irs-w7": {
    // Mailed with original or certified identity documents, so the person or the team always sends it.
    mail: { name: "Internal Revenue Service, Austin Service Center", line1: "ITIN Operation", line2: "P.O. Box 149342", city: "Austin", state: "TX", zip: "78714-9342" },
    signature: "wet",
    checked: "2026-10-13",
    source: "https://irs.gov/tin/itin/how-to-apply-for-an-itin",
  },
  "fincen-boir": {
    // "Go to boiefiling.fincen.gov"; no account; an hCaptcha before submitting, which the worker hands to the person.
    // Since March 21, 2025 only companies formed under a foreign country's law and registered in a US state file.
    portal: "boiefiling.fincen.gov",
    noLogin: true,
    signature: "none",
    checked: "2026-10-13",
    source: "https://boiefiling.fincen.gov/resources/BOIR_E-File_Online_Step-by-Step_Instructions.pdf",
  },
  "ca-cdtfa": {
    // "Register Online" links to onlineservices.cdtfa.ca.gov; "There is no charge for a seller's permit."
    portal: "onlineservices.cdtfa.ca.gov",
    signature: "none",
    checked: "2026-10-13",
    source: "https://cdtfa.ca.gov/formspubs/pub107/applying-for-a-sellers-permit.htm",
  },
  "ca-edd-de1": {
    // e-Services for Business, eddservices.edd.ca.gov: "Register, close, or re-open an employer payroll tax account."
    portal: "eddservices.edd.ca.gov",
    signature: "none",
    checked: "2026-10-13",
    source: "https://edd.ca.gov/e-services-for-business/",
  },
  "la-btrc": {
    // "The fastest way to register is online": latax.lacity.org/businessregapp
    portal: "latax.lacity.org",
    signature: "none",
    checked: "2026-10-13",
    source: "https://finance.lacity.gov/tax-education/new-business-registration/how-register-btrc",
  },
  "ny-dtf-17": {
    // "register with the Tax Department through New York Business Express"; needs a NY.gov Business account
    portal: "www.businessexpress.ny.gov",
    signature: "none",
    checked: "2026-10-13",
    source: "https://tax.ny.gov/bus/st/register.htm",
  },
  "ny-dos-1336": {
    // "$200 ... forwarded to the New York Department of State, Division of Corporations"; a fee, so the team sends it
    mail: { name: "New York Department of State, Division of Corporations", line1: "One Commerce Plaza, 99 Washington Avenue", city: "Albany", state: "NY", zip: "12231" },
    signature: "wet",
    checked: "2026-10-13",
    source: "https://dos.ny.gov/limited-liability-company-articles-organization",
  },
  "fda-ffr": {
    // FDA Industry Systems at www.access.fda.gov, "created to facilitate making submissions to FDA, including registrations"
    portal: "www.access.fda.gov",
    signature: "none",
    checked: "2026-10-13",
    source: "https://www.fda.gov/food/registration-food-facilities",
  },
};

/**
 * Waiting for someone to copy the numbers and addresses from the agency's page and date them. Nothing here is used:
 * move an entry into DEST once every value is confirmed on the source page.
 */
export const TO_VERIFY: Record<string, { source: string; note: string; partial?: Partial<Dest> }> = {
  "cbp-5106": {
    source: "https://www.cbp.gov/newsroom/publications/forms",
    note: "Usually goes through the customs broker. Leave it to the team at first.",
  },
};

const E164 = /^\+[1-9]\d{6,14}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const EMAIL = /^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

function addressProblems(id: string, a: Address | undefined, label: string): string[] {
  if (!a) return [];
  const out: string[] = [];
  for (const k of ["name", "line1", "city", "state", "zip"] as const) if (!a[k]?.trim()) out.push(`${id}: ${label} ${k} is missing`);
  if (/[<>]/.test(JSON.stringify(a))) out.push(`${id}: ${label} still has a placeholder`);
  return out;
}

/** Every reason an entry can't ship. The tests fail on any. */
export function destinationProblems(dest: Record<string, Dest> = DEST): string[] {
  const out: string[] = [];
  for (const [id, d] of Object.entries(dest)) {
    if (!d.checked || !DATE.test(d.checked) || Number.isNaN(Date.parse(d.checked))) out.push(`${id}: checked must be the date it was confirmed (YYYY-MM-DD)`);
    if (!d.source || !/^https:\/\//.test(d.source)) out.push(`${id}: source must be the agency's https page`);
    if (!d.email && !d.fax && !d.mail && !d.portal) out.push(`${id}: has no destination`);
    if (d.email && !EMAIL.test(d.email)) out.push(`${id}: email is not an address`);
    if (d.fax && (!E164.test(d.fax.us) || (d.fax.foreign !== undefined && !E164.test(d.fax.foreign)))) out.push(`${id}: fax numbers must be E.164 (+1...)`);
    if (d.portal && !HOST.test(d.portal)) out.push(`${id}: portal must be a bare host name`);
    out.push(...addressProblems(id, d.mail, "mail"), ...addressProblems(id, d.mail?.foreign, "foreign mail"));
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
