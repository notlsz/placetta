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
  notReady?: string;                                // why automatic filing must not be switched on yet (an unconfirmed
                                                    // sign-off or on-behalf rule): approval cards say the person sends it.
                                                    // Metadata only: activation is still FILER_AGENCIES
  signature: "none" | "typed" | "drawn" | "wet";    // what the agency accepts on this form
  payment?: Payment;                                // how its fee is paid; any fee sends email, fax and mail to the team
                                                    // (with Placetta paying fees on and the fee authorized, a
                                                    // "with_filing" fee goes by a Lob check mailed with the form)
  payTo?: string;                                   // whom a check for its fee is made out to, as the agency writes it
  onBehalf?: "allowed" | "authorization" | "unstated";   // whether a filer may submit it for the business
  authorization?: string;                           // with "authorization": the signed document the agency asks for
  attach?: string[];                                // what the agency says goes with it, as it prints them
  checked: string;                                  // YYYY-MM-DD someone confirmed it on the agency's page
  source: string;                                   // that page
  also?: string[];                                  // other agency pages read for this entry
  byState?: ByState;                                // the agency sends each state to its own address (the IRS's service centers)
};

/** An agency that takes a form at a different address (or fax number) depending on the state the business is in, as its
    page prints them in a table: "If you are located in ... Address to mail form to IRS". from names the form's lines,
    in order, whose answer says where the business is (the entity's address, or the old address on a change of address).
    groups must cover every state and DC once; abroad is the table's row for a foreign country, when it has one. A
    filing whose state can't be read from those lines has no address of its own: it isn't sent, and the business's
    packet lists every center with the states it takes. */
export type ByState = {
  from: string[];
  groups: { states: string[]; mail?: Address; fax?: string }[];
  abroad?: { mail?: Address; fax?: string };
};

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
  "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];
const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME",
  maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

/** The US state an address answer is in: the two-letter code before its ZIP code ("San Jose, CA 95112"), or a state's
    full name before one ("Atlanta, Georgia 30303"). The last one wins, so a street named for a state doesn't count.
    null when there is no US state with a ZIP code in it. */
export function stateOf(answer: string | undefined): string | null {
  const s = (answer ?? "").replace(/\s+/g, " ");
  let found: string | null = null;
  for (const m of s.matchAll(/\b([A-Z]{2})\.?,? (\d{5})(?:-\d{4})?\b/g)) {
    const code = m[1];
    if (US_STATES.includes(code)) found = code;
  }
  if (found) return found;
  const low = s.toLowerCase();
  let at = -1;
  for (const [name, code] of Object.entries(STATE_NAMES)) {
    const m = new RegExp(`\\b${name},? \\d{5}(?:-\\d{4})?\\b`).exec(low);
    if (m && m.index >= at) { at = m.index; found = code; }
  }
  return found;
}

/** A form's destination for one filing: for an agency that routes by state (byState), the address and fax for the state
    the filing's own answers name, or the row for abroad when the owner has no US address. Without a state it has no
    mail or fax, so the dispatcher hands it to the team. Every other destination is returned as it is. */
export function destFor(official: string | undefined, payload?: { fields?: { id?: string; value: string }[]; us_address?: boolean }, dest: Record<string, Dest> = DEST): Dest | undefined {
  const d = dest[official ?? ""];
  if (!d?.byState) return d;
  const answer = (id: string) => payload?.fields?.find((x) => x.id === id)?.value;
  let state: string | null = null;
  for (const id of d.byState.from) if ((state = stateOf(answer(id)))) break;
  const row = payload?.us_address === false && !state ? d.byState.abroad : d.byState.groups.find((g) => !!state && g.states.includes(state));
  // no state on the form: keep the table, so the packet can list each center with its states (waysToSend)
  if (!row) return d;
  const { byState: _drop, ...rest } = d;
  return { ...rest, ...(row?.mail ? { mail: row.mail } : {}), ...(row?.fax ? { fax: { us: row.fax, ...(row === d.byState.abroad ? { foreign: row.fax } : {}) } } : {}) };
}

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
  // Texas's online filing is now SOSPortal (webservices.sos.state.tx.us), which replaced SOSDirect: each form's
  // instructions (read 2026-10-24) say "For faster processing submit your filing through SOSPortal ... You will be
  // prompted to enter all required information through the online filing screens", with "Payments ... by ACH or credit
  // card" and "Mail filings to: P.O. Box 13697, Austin, TX 78711-3697". The options page: SOSPortal lets you "file
  // business formation documents". Its sign-in is the owner's own SOSPortal account; Placetta never creates one.
  "tx-205": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    portal: "webservices.sos.state.tx.us", portalUrl: "https://webservices.sos.state.tx.us/termsandconditions/tac.html",
    signature: "drawn",                               // "A wet ink signature is not required. Copies and electronically signed documents are accepted."
    payment: "with_filing",                           // $300: on SOSPortal by ACH or card, or a check with a mailed form
    checked: "2026-10-24",
    source: "https://www.sos.state.tx.us/corp/instructions/205.shtml",
    also: ["https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml", "https://www.sos.state.tx.us/corp/options.shtml"],
  },
  "tx-304": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    // SOSDirect's portal entry is gone: direct.sos.state.tx.us now says "SOSPortal has replaced both SOSDirect and
    // SOSUpload effective September 29, 2026" (seen 2026-10-24). The 304 instructions do link SOSPortal
    // (webservices.sos.state.tx.us, as tx-205 and tx-503 cite), but a third form on that host needs its portal
    // playbook first (worker/filer/src/playbooks.ts), so 304 waits for it.
    signature: "drawn",
    payment: "with_filing",
    checked: "2026-10-13",
    source: "https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml",
  },
  "tx-503": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    portal: "webservices.sos.state.tx.us", portalUrl: "https://webservices.sos.state.tx.us/termsandconditions/tac.html",   // SOSPortal (see tx-205)
    signature: "drawn",
    payment: "with_filing",                           // "The filing fee for an assumed name certificate is $25"
    checked: "2026-10-24",
    source: "https://www.sos.state.tx.us/corp/instructions/503.shtml",
    also: ["https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml"],
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
  // The application opens with no account (seen 2026-10-24: "New Business Registration Form", Organization Type first);
  // it ends with "Submit for Electronic Signature" and a DocuSign email the owner signs.
  "sf-business-registration": { portal: "etaxstatement.sfgov.org", portalUrl: "https://etaxstatement.sfgov.org/NewBusinessRegistration/application", noLogin: true, signature: "typed", payment: "portal", checked: "2026-10-13", source: "https://sftreasurer.org/business/register-business" },
  "sj-building-ti": { portal: "sjpermits.org", portalUrl: "https://www.sjpermits.org/", signature: "drawn", payment: "portal", checked: "2026-10-13", source: "https://www.sanjoseca.gov/businesses/development-services-permit-center/start-your-project/commercial-industrial-properties/tenant-improvement" },
  "sj-sign": { portal: "sjpermits.org", portalUrl: "https://www.sjpermits.org/", signature: "drawn", payment: "invoice", checked: "2026-10-13", source: "https://www.sanjoseca.gov/business/development-services-permit-center/online-permits-at-sjpermits-org/planning-online-permits" },
  // Inspection bookings (src/inspections/booking.ts): the agency's own scheduling page, from the inspection guides
  // (src/inspections/data, read 2026-10-15). The worker books the slot the owner approved, with the owner's own saved
  // login (no login: the team asks for it; Placetta never creates an account). Nothing is signed; a fee is paid by the
  // owner in the live view.
  "insp-la-building-final": { portal: "www.ladbsservices2.lacity.org", portalUrl: "https://www.ladbsservices2.lacity.org/OnlineServices/?service=rfi", signature: "none", payment: "none", onBehalf: "unstated", checked: "2026-10-15", source: "https://dbs.lacity.gov/services/inspection" },
  // "Pick a preferred date, then pay" (FIMS, with the Transaction ID and street name; no account named)
  "insp-la-fire-final": { portal: "inspect.lafd.org", portalUrl: "https://inspect.lafd.org/", noLogin: true, signature: "none", payment: "portal", onBehalf: "unstated", checked: "2026-10-15", source: "https://inspect.lafd.org/Content/AttachedFiles/FIMS_Help.pdf", also: ["https://lafd.org/fire-prevention/fire-development-services"] },
  // FDNY Business needs an NYC.ID account: the owner's own
  "insp-nyc-fire-hood": { portal: "fires.fdnycloud.org", portalUrl: "https://fires.fdnycloud.org/CitizenAccess/", signature: "none", payment: "portal", onBehalf: "unstated", checked: "2026-10-15", source: "https://www.nyc.gov/assets/fdny/downloads/pdf/business/restaurant-fire-safety-guide.pdf" },
  "insp-sj-building-final": { portal: "sjpermits.org", portalUrl: "https://www.sjpermits.org/", signature: "none", payment: "none", onBehalf: "unstated", checked: "2026-10-15", source: "https://www.sanjoseca.gov/your-government/departments-offices/planning-building-code-enforcement/building-division/inspections/inspection-success" },
  // Added 2026-10-22, each from the agency's own scheduling page, its start page opened live (200):
  // SF: "Once your permit is issued in PermitSF, you will be able to request inspections online from your PermitSF
  // dashboard" (permits that start with letters: BLDG, ELEC, PLMB; numeric permits are booked by phone)
  "insp-sf-building-final": { portal: "sanfranciscoca.portal.opengov.com", portalUrl: "https://sanfranciscoca.portal.opengov.com/dashboard", signature: "none", payment: "none", onBehalf: "unstated", checked: "2026-10-22", source: "https://www.sf.gov/schedule-and-pay-your-inspection" },
  // Austin: "You can schedule a building inspection online with the AB+C Portal"; "only ... if your AB+C account is
  // linked to the permit, the permit is in "Active" status, and fees have been paid"
  "insp-aus-building-final": { portal: "abc.austintexas.gov", portalUrl: "https://abc.austintexas.gov/", signature: "none", payment: "none", onBehalf: "authorization", authorization: "Inspection agent letter of authorization (Austin), when the owner isn't listed on the permit", checked: "2026-10-22", source: "https://www.austintexas.gov/development-services/schedule-building-inspection", also: ["https://austin.widen.net/s/sx2b8jvtff/sc_inspectionagentletterofauthorization"] },
  // Dallas: "Inspections can be scheduled via DallasNow" (Accela, the same tenant as its permits)
  "insp-dal-building-final": { portal: "aca-prod.accela.com", portalUrl: "https://aca-prod.accela.com/dallastx", tenant: "/dallastx", signature: "none", payment: "none", onBehalf: "unstated", checked: "2026-10-22", source: "https://dallascityhall.com/departments/sustainabledevelopment/buildinginspection/Pages/inspections.aspx" },
  // Fort Worth: "You can schedule it online or through the IVR system"; the inspection contact must be set in the ACA profile
  "insp-ftw-building-final": { portal: "aca-prod.accela.com", portalUrl: "https://aca-prod.accela.com/CFW", tenant: "/CFW", signature: "none", payment: "none", onBehalf: "unstated", checked: "2026-10-22", source: "https://www.fortworthtexas.gov/departments/development-services/inspections" },
  // Irvine: "Inspections may be scheduled ... using the City of Irvine's Online Inspection Request System" (the city links
  // it over http; the same host answers on https)
  "insp-irv-building-final": { portal: "permits.cityofirvine.org", portalUrl: "https://permits.cityofirvine.org/irvinepermits/", signature: "none", payment: "none", onBehalf: "unstated", checked: "2026-10-22", source: "https://cityofirvine.gov/node/2176", also: ["https://irvineca.seamlessdocs.com/f/InspectionSystemGuide"] },
  // Phoenix: "Enter permit number and web inspection key found on receipt and permit": the key is kept in the vault
  // like a login (permit number and key), never typed from the approved values
  "insp-phx-building-final": { portal: "apps-secure.phoenix.gov", portalUrl: "https://apps-secure.phoenix.gov/PDD/inspections", signature: "none", payment: "none", onBehalf: "unstated", checked: "2026-10-22", source: "https://www.phoenix.gov/administration/departments/pdd/commercial-multifamily-building/commercial-inspections.html" },
  // San Diego: "all building inspections can be scheduled or canceled online" (Accela, its San Diego tenant)
  "insp-sdg-building-final": { portal: "aca-prod.accela.com", portalUrl: "https://aca-prod.accela.com/SANDIEGO/Login.aspx", tenant: "/SANDIEGO", signature: "none", payment: "none", onBehalf: "unstated", checked: "2026-10-22", source: "https://www.sandiego.gov/development-services/forms-publications/information-bulletins/120" },
  // Appeals the owner can file themselves (src/appeals, appeal_case), each sent only after the owner approves it:
  // SF Board of Appeals: files by email to boardofappeals@sfgov.org; "After you file, you receive an appeal number", which
  // the fee is paid online with (or by check by mail), so nothing goes with the email.
  "appeal-sf-boa": { email: "boardofappeals@sfgov.org", signature: "typed", payment: "invoice", onBehalf: "unstated", checked: "2026-10-22", source: "https://sf.gov/file-appeal-permit-or-decision", also: ["https://www.sf.gov/board-of-appeals-faqs"] },
  // TABC, 16 TAC §33.60(c): the written request for hearing goes to "Texas Alcoholic Beverage Commission, ATTN: Clerk,
  // P.O. Box 13127, Austin, Texas 78711" or by email to clerk@tabc.texas.gov; no fee in §33.60.
  "appeal-tx-tabc-hearing": { email: "clerk@tabc.texas.gov", mail: { name: "Texas Alcoholic Beverage Commission", line1: "ATTN: Clerk", line2: "P.O. Box 13127", city: "Austin", state: "TX", zip: "78711" },
    signature: "typed", payment: "none", onBehalf: "unstated", checked: "2026-10-22", source: "https://www.tabc.texas.gov/static/f6f628258b7ae843925c2025de0a3ff6/tabc-administrative-rules.pdf" },
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
    portal: "boiefiling.fincen.gov", portalUrl: "https://boiefiling.fincen.gov/fileboir",
    noLogin: true,
    signature: "none",
    payment: "none",
    checked: "2026-10-13",
    source: "https://boiefiling.fincen.gov/resources/BOIR_E-File_Online_Step-by-Step_Instructions.pdf",
  },
  "ca-cdtfa": {
    // "Register Online" links to onlineservices.cdtfa.ca.gov; "There is no charge for a seller's permit."
    portal: "onlineservices.cdtfa.ca.gov",
    portalUrl: "https://onlineservices.cdtfa.ca.gov/",
    noLogin: true,                                    // "Register for a Permit, License, or Account" is on the public page, outside Login (seen 2026-10-24)
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
    noLogin: true,                                    // the online registration starts at its criteria page with Proceed, no account (seen 2026-10-24)
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
    // The paper DR-1 (R. 01/26) that Placetta fills prints "Mail to: Account Management MS 1-5730, Florida Department of
    // Revenue, 5050 W Tennessee St, Tallahassee FL 32399-0160". Not added as a mail route: this entry's signature is the
    // portal's typed one, and the paper form is signed by hand.
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
    noLogin: true,                                    // "Register a New Business (Form REG-1)" is among the services that need no login (seen 2026-10-24)
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
    noLogin: true,                                    // "Register a New Business" is under Registration on the public page, beside Log in (seen 2026-10-24)
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

  // ---- Company formation and foreign qualification (src/forms/entities.ts), read on the agencies' own pages on
  // 2026-10-27. Every portal here asks for an account or a sign-in before the form, or isn't documented step by step,
  // so no worker playbook is written for it: the first filing runs in teach mode with the team watching. ----
  // New Jersey's Business Formation service: "file certificates of formation and authorization of business entities";
  // an account is optional ("you may want to consider creating an account"), the fee is paid by "Credit Card or eCheck"
  ...Object.fromEntries(["nj-corp-form", "nj-foreign-registration", "nj-corp-qualify"].map((id) => [id, {
    portal: "www.njportal.com", portalUrl: "https://www.njportal.com/DOR/BusinessFormation/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    ...(id !== "nj-corp-form" ? { attach: ["Good Standing Certificate from your home state (only for foreign entities)"] } : {}),
    checked: "2026-10-27", source: "https://www.njportal.com/DOR/BusinessFormation/",
  } satisfies Dest])),
  // California: "File Articles of Incorporation online at bizfileOnline.sos.ca.gov"; a foreign corporation files its
  // Statement and Designation there and "must attach a valid certificate of good standing"
  "ca-corp-form": {
    portal: "bizfileonline.sos.ca.gov", portalUrl: "https://bizfileonline.sos.ca.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-27", source: "https://www.sos.ca.gov/business-programs/business-entities/faqs",
  },
  "ca-corp-qualify": {
    portal: "bizfileonline.sos.ca.gov", portalUrl: "https://bizfileonline.sos.ca.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    attach: ["Certificate of good standing from the jurisdiction where the corporation is incorporated"],
    checked: "2026-10-27", source: "https://www.sos.ca.gov/business-programs/business-entities/faqs",
  },
  // Washington's CCFS: "Start a Domestic (WA) Profit Corporation Online" and "Register a Foreign (Non-WA) Profit
  // Corporation Online", "Filing Fee: $180 in addition to an online processing fee", paid at checkout after sign-in
  "wa-corp-form": {
    portal: "ccfs.sos.wa.gov", portalUrl: "https://ccfs.sos.wa.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-27", source: "https://www.sos.wa.gov/corporations-charities/business-entities/online-filing-instructions/start-domestic-wa-profit-corporation-online",
  },
  "wa-corp-qualify": {
    portal: "ccfs.sos.wa.gov", portalUrl: "https://ccfs.sos.wa.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-27", source: "https://www.sos.wa.gov/corporations-charities/business-entities/online-filing-instructions/register-foreign-non-wa-profit-corporation-online",
  },
  // New York: the certificate and the application "should be forwarded to the New York Department of State, Division of
  // Corporations, One Commerce Plaza, 99 Washington Avenue, Albany, NY 12231", with the fee; the team sends it
  "ny-corp-form": {
    mail: { name: "New York Department of State, Division of Corporations", line1: "One Commerce Plaza, 99 Washington Avenue", city: "Albany", state: "NY", zip: "12231" },
    signature: "wet", payment: "with_filing",
    checked: "2026-10-27", source: "https://dos.ny.gov/certificate-incorporation-domestic-business-corporation",
  },
  "ny-corp-qualify": {
    mail: { name: "New York Department of State, Division of Corporations", line1: "One Commerce Plaza, 99 Washington Avenue", city: "Albany", state: "NY", zip: "12231" },
    signature: "wet", payment: "with_filing",
    checked: "2026-10-27", source: "https://dos.ny.gov/application-authority-foreign-business-corporation",
  },
  // Texas: "Mail filings to: P.O. Box 13697, Austin, TX 78711-3697" (the 201 and 301 instructions); "A wet ink signature
  // is not required" (the filing FAQ)
  "tx-corp-form": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    signature: "drawn", payment: "with_filing",
    checked: "2026-10-27", source: "https://www.sos.state.tx.us/corp/instructions/201.shtml",
    also: ["https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml"],
  },
  "tx-corp-qualify": {
    mail: { name: "Secretary of State, Corporations Section", line1: "P.O. Box 13697", city: "Austin", state: "TX", zip: "78711-3697" },
    signature: "drawn", payment: "with_filing",
    checked: "2026-10-27", source: "https://www.sos.state.tx.us/corp/instructions/301.shtml",
    also: ["https://www.sos.state.tx.us/corp/filingandothergeneralfaqs.shtml"],
  },
  // Delaware: "mail in your completed request to our office. The mailing address is Division of Corporations - John G.
  // Townsend Building – 401 Federal Street – Suite 4 – Dover, DE 19901. All filing fees must be paid upon submission"
  ...Object.fromEntries(["de-llc-form", "de-corp-form", "de-llc-qualify", "de-corp-qualify"].map((id) => [id, {
    mail: { name: "Delaware Division of Corporations", line1: "John G. Townsend Building", line2: "401 Federal Street, Suite 4", city: "Dover", state: "DE", zip: "19901" },
    signature: "wet", payment: "with_filing",
    checked: "2026-10-27", source: "https://corp.delaware.gov/howtoform/",
  } satisfies Dest])),
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

  // ---- Forms batch 3, read from the agencies' own pages on 2026-10-18 (IRS authorizations and the foreign-owned DE's
  // extension, California, Florida, New York City, Cook County, and the state formation filings). ----
  "irs-8821": {
    // "Securely upload and submit forms for power of attorney (POA) and tax information authorization (TIA)": "Sign in
    // or create an account" goes through sa.www4.irs.gov to the upload tool on connect.irs.gov. "For forms submitted
    // online, we accept these types of electronic signature" (typed names among them); "We don't accept electronically
    // signature for forms by fax or mail." The fax and mail units depend on the taxpayer's state, so those stay with the team.
    portal: "connect.irs.gov", alsoOn: ["sa.www4.irs.gov"],
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.irs.gov/tax-professionals/submit-forms-2848-and-8821-online",
  },
  "irs-2848": {
    // The same upload tool; the representative signs Part II.
    portal: "connect.irs.gov", alsoOn: ["sa.www4.irs.gov"],
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.irs.gov/tax-professionals/submit-forms-2848-and-8821-online",
  },
  "irs-1120": {
    // Foreign-owned U.S. DEs: "Fax (300 DPI or higher) to 855-887-7737" or mail to the PIN Unit; "These filers do not
    // use the mailing address provided in the Instructions for Form 1120." Filed with Form 5472.
    fax: { us: "+18558877737", foreign: "+18558877737" },
    faxQuality: "very_high",
    mail: { name: "Internal Revenue Service", line1: "1973 Rulon White Blvd", line2: "M/S 6112 Attn: PIN Unit", city: "Ogden", state: "UT", zip: "84201" },
    signature: "wet", payment: "none",
    checked: "2026-10-18", source: "https://www.irs.gov/instructions/i5472",
  },
  "irs-7004": {
    // "The DE must fax or mail the Form 7004 to the fax number or mailing address identified earlier" (the PIN Unit's),
    // "do not use the regular filing address listed in the Instructions for Form 7004", with "Foreign-owned U.S. DE"
    // across the top. The registry's irs-7004 is that foreign-owned DE's extension.
    fax: { us: "+18558877737", foreign: "+18558877737" },
    faxQuality: "very_high",
    mail: { name: "Internal Revenue Service", line1: "1973 Rulon White Blvd", line2: "M/S 6112 Attn: PIN Unit", city: "Ogden", state: "UT", zip: "84201" },
    signature: "wet", payment: "none",
    checked: "2026-10-18", source: "https://www.irs.gov/instructions/i5472",
    also: ["https://www.irs.gov/filing/where-to-file-form-7004"],
  },
  "ca-llc-12": {
    // "Statements of Information can be filed online at bizfileOnline.sos.ca.gov"; "Electronic signatures on filings
    // submitted through the Secretary of State's online process are the only" electronic signatures it accepts.
    portal: "bizfileonline.sos.ca.gov", portalUrl: "https://bizfileonline.sos.ca.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.sos.ca.gov/business-programs/business-entities/faqs",
  },
  "fl-fictitious": {
    // "Register a Florida Fictitious Name" (efile.sunbiz.org/ficregintro.html); $50, by credit card online. "You, the
    // applicant, certify the name has been advertised when you sign the application."
    portal: "efile.sunbiz.org", portalUrl: "https://efile.sunbiz.org/ficregintro.html",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://dos.fl.gov/sunbiz/start-business/efile/fl-fictitious-name-registration/",
  },
  "nyc-dcwp-license": {
    // DCWP licenses: "Apply Online" (a866-dcwpbp.nyc.gov/licensing/apply-license) with "a registered account with the City
    // of New York"; the Licensing Center is only for applicants who need an in-person visit. Someone else preparing it
    // needs "the Granting Authority to Act Affirmation form", and "The applicant must sign the license application".
    portal: "a866-dcwpbp.nyc.gov", portalUrl: "https://a866-dcwpbp.nyc.gov/licensing/apply-license",
    signature: "typed", payment: "portal", onBehalf: "authorization", authorization: "Granting Authority to Act Affirmation",
    attach: ["Granting Authority to Act Affirmation, when someone else prepares or submits it"],
    checked: "2026-10-18", source: "https://nyc-business.nyc.gov/nycbusiness/description/cigarette-retail-dealer-license",
  },
  "cook-food-license": {
    // The page: "Please mail completed applications and applicable payment to the address listed on the application";
    // "Make checks or money orders payable to Cook County Department of Public Health." The application prints the
    // Environmental Health Division's Bridgeview address. The fee goes with it, so the team sends it.
    mail: { name: "Cook County Department of Public Health, Environmental Health Division", line1: "10220 S. 76th Avenue, Room 250", city: "Bridgeview", state: "IL", zip: "60455" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://cookcountypublichealth.org/contact-us/permits-and-licenses/retail-food-establishment-application/",
    also: ["https://cookcountypublichealth.org/wp-content/uploads/2019/01/Retail-Food-License-Application.pdf"],
  },
  // State formation filings that were team-only until their pages were read in this round.
  "wa-sos": {
    // "Visit our Corporations and Charities Filing System" (ccfs.sos.wa.gov): log in, "Create or Register a Business",
    // "WA Limited Liability Company", checkout; the Authorized Person types their name and checks "This document is
    // hereby executed under penalty of law". $180 plus a processing fee, paid at checkout.
    portal: "ccfs.sos.wa.gov", portalUrl: "https://ccfs.sos.wa.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.sos.wa.gov/corporations-charities/business-entities/online-filing-instructions/start-domestic-wa-limited-liability-company-llc-online",
  },
  "ma-sos": {
    // "File Online" (corp.sec.state.ma.us/corpweb/loginsystem/externallogin.aspx); "The certificate must be signed by the
    // person forming the LLC"; $500.
    portal: "corp.sec.state.ma.us", portalUrl: "https://corp.sec.state.ma.us/corpweb/loginsystem/externallogin.aspx",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.sec.state.ma.us/divisions/corporations/filing-by-subject/limited-liability/corporations-limited-liability-company.htm",
  },
  "pa-dos": {
    // "To submit registration forms ... go to the" Business Filing Services portal (file.dos.pa.gov/forms/business);
    // the Business Hub's LLC guide: "Legally create the domestic LLC by filing the Certificate of Organization", $125.
    portal: "file.dos.pa.gov", portalUrl: "https://file.dos.pa.gov/forms/business",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.pa.gov/services/dos/register-a-business",
    also: ["https://hub.business.pa.gov/Home/HelpCenterDetail/RegisteraPADomesticLLC"],
  },
  "ga-sos": {
    // "Visit the Secretary of State's online services page" (ecorp.sos.ga.gov), "Create a user account", "create or
    // register a business", "Domestic Limited Liability Company"; "Pay the $110 fee" by credit card.
    portal: "ecorp.sos.ga.gov", portalUrl: "https://ecorp.sos.ga.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://sos.ga.gov/how-to-guide/how-guide-register-domestic-entity",
    also: ["https://sos.ga.gov/sites/default/files/forms/Online%20Services%20User%20Guide.pdf"],
  },
  "dc-dlcp": {
    // Steps to a Basic Business License: register the company "via BOSS/CorpOnline" (corponline.dlcp.dc.gov), then
    // "Apply for a Business License" at boss.dc.gov with "the required supporting documentation and payment"; "Online
    // filers must pay by credit card."
    portal: "boss.dc.gov", portalUrl: "https://boss.dc.gov/", alsoOn: ["corponline.dlcp.dc.gov"],
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://dlcp.dc.gov/page/steps-obtaining-basic-business-license-0",
    also: ["https://dlcp.dc.gov/service/domestic-limited-liability-company"],
  },

  // ---- The target markets' forms (src/forms/markets-us.ts), read from the agencies' own pages on 2026-10-18. ----
  "md-llc": {
    // The form's filing instructions: "To file online: Create an account with Maryland Business Express"
    // (egov.maryland.gov/businessexpress), or mail it with the $100 check. Not given a mail route here: SDAT asks for "an
    // originally executed" paper copy, and this entry's signature is the portal's.
    portal: "egov.maryland.gov", portalUrl: "https://egov.maryland.gov/businessexpress",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://dat.maryland.gov/sdat%20forms/artorgan.pdf",
  },
  "md-cra": {
    // "The Central Registration fax number is 410-260-7908" ("Do not fax a cover sheet or our instructions"); "Mail the
    // application to: Central Registration, Comptroller of Maryland, Revenue Administration Division, 110 Carroll Street,
    // Annapolis, MD 21411-0001"; online through the Comptroller's interactive CRA. Section F: "Signature* (Required by Law)".
    fax: { us: "+14102607908" },
    mail: { name: "Comptroller of Maryland, Revenue Administration Division", line1: "Central Registration", line2: "110 Carroll Street", city: "Annapolis", state: "MD", zip: "21411-0001" },
    portal: "interactive.marylandtaxes.gov", portalUrl: "https://interactive.marylandtaxes.gov/webapps/comptrollercra/entrance.asp",
    signature: "wet", payment: "none", onBehalf: "authorization", authorization: "Power of attorney form (Section F box)",
    checked: "2026-10-18", source: "https://www.marylandtaxes.gov/forms/current_forms/cra.pdf",
    also: ["https://businessexpress.maryland.gov/start/taxes-and-insurance"],
  },
  "moco-food-license": {
    // "Apply and pay through the CivicGov portal", or "Mail it to Licensure & Regulatory Services, 2425 Reedie Drive, 9th
    // Floor, Wheaton, MD 20902" or "Fax it to 240-777-3088". The license fee goes with it, so paper goes to the team.
    portal: "www.civicgov4.com", portalUrl: "https://www.civicgov4.com/md_montgomery/portal/", tenant: "/md_montgomery",
    fax: { us: "+12407773088" },
    mail: { name: "Montgomery County DHHS, Licensure & Regulatory Services", line1: "2425 Reedie Drive, 9th Floor", city: "Wheaton", state: "MD", zip: "20902" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.montgomerycountymd.gov/department-health-human-services/about-us/licensure-regulatory-services/environmental-health-unit/food-service-facility-license",
  },
  "hi-llc": {
    // "What BREG forms can I file online?" lists LLC-1; the portal is Hawaii Business Express.
    portal: "hbe.ehawaii.gov", portalUrl: "https://hbe.ehawaii.gov/BizEx/home.eb",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://cca.hawaii.gov/breg/what-breg-forms-can-i-file-online/",
    also: ["https://cca.hawaii.gov/breg/registration/dllc/forms/"],
  },
  "hi-bb1": {
    // Form BB-1: "For faster service apply online at hitax.hawaii.gov"; "Mail the completed application to: HAWAII
    // DEPARTMENT OF TAXATION, P.O. Box 1425, Honolulu, HI 96806-1425", "ATTACH CHECK OR MONEY ORDER HERE" ($20).
    portal: "hitax.hawaii.gov", portalUrl: "https://hitax.hawaii.gov/",
    mail: { name: "Hawaii Department of Taxation", line1: "P.O. Box 1425", city: "Honolulu", state: "HI", zip: "96806-1425" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://files.hawaii.gov/tax/forms/2024/bb1_i.pdf",
  },
  "hi-ui": {
    // "Employers may register their company at: https://huiclaims3.hawaii.gov/"
    portal: "huiclaims3.hawaii.gov", portalUrl: "https://huiclaims3.hawaii.gov/",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://labor.hawaii.gov/ui/employer-registration/",
  },
  "ut-llc": {
    // "Go to https://businessregistration.utah.gov/, log in with a UtahID, select Formations, choose Domestic".
    portal: "businessregistration.utah.gov", portalUrl: "https://businessregistration.utah.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://commerce.utah.gov/corporations/business-entities/domestic-limited-liability-company/",
  },
  "ut-tax": {
    // "Apply for a Utah tax account/license" in Taxpayer Access Point (tap.tax.utah.gov); the TC-69 link now opens TAP.
    portal: "tap.tax.utah.gov", portalUrl: "https://tap.tax.utah.gov/TaxExpress/_/?Link=TapBr",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://tax.utah.gov/business/create-manage/tax-info-business/",
  },
  "ut-ui": {
    // "Create a new UI account for my business" (jobs.utah.gov/ui/employer/EmployerRegistration/Intro.aspx).
    portal: "jobs.utah.gov", portalUrl: "https://jobs.utah.gov/ui/employer/EmployerRegistration/Intro.aspx",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://jobs.utah.gov/ui/employer/public/osbr.aspx",
  },
  "va-llc": {
    // The SCC's how-to guide: "Log on to CIS at cis.scc.virginia.gov", Online Services, Virginia Entity, Limited Liability
    // Company, Articles of Organization; the signer is added in the Signature Information section; "Add To Shopping
    // Cart", "Checkout", "Go To Payment" (a LexisNexis payment page with a CAPTCHA), "Pay Now".
    portal: "cis.scc.virginia.gov", portalUrl: "https://cis.scc.virginia.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.scc.virginia.gov/media/sccvirginiagov-home/business-home/business-faqs/llc-faqs/how-to-guide-form-a-virginia-limited-liability-company.pdf",
  },
  "ma-dua": {
    // "Employers who pay wages for work done in Massachusetts must register with DUA": Unemployment Services for
    // Employers, "go to the homepage without logging in and select Register your Business".
    portal: "unemployment.mass.gov", portalUrl: "https://unemployment.mass.gov/Employers/", noLogin: true,
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.mass.gov/how-to/register-a-business-with-the-department-of-unemployment-assistance",
  },
  "smo-license": {
    // The application: "Send this completed application with your check to the Business Tax Division, City Hall, 330 West
    // 20th Avenue, San Mateo, CA 94403." The tax goes with it, so the team sends it.
    mail: { name: "City of San Mateo, Business Tax Division", line1: "City Hall, 330 West 20th Avenue", city: "San Mateo", state: "CA", zip: "94403" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.cityofsanmateo.org/DocumentCenter/View/232/Gross-Receipts-Form?bidId=",
  },
  "smc-health-permit": {
    // "download, complete, and upload to the MyEHS online portal" (smcehs.my.site.com); MyEHS manages "applications,
    // permits, invoices"; an account is reviewed by staff first.
    portal: "smcehs.my.site.com", portalUrl: "https://smcehs.my.site.com/s/?language=en_US",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.smchealth.org/node/6706",
    also: ["https://www.smchealth.org/my-ehs-online-portal"],
  },
  "cup-license": {
    // "the city's business license services moved to HdL on September 22, 2025 ... Website: cupertino.hdlgov.com".
    portal: "cupertino.hdlgov.com", portalUrl: "https://cupertino.hdlgov.com/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://cupertino.gov/i-want-to/apply-for/business-license-application",
  },
  "sgb-license": {
    // "the business can apply for the City business license by calling (626) 308-2812 or emailing Financeinfo@sgch.org.
    // Please include your business name and address in the subject line." The license tax is paid to the city.
    email: "Financeinfo@sgch.org",
    signature: "wet", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://sangabrielcity.com/DocumentCenter/View/19742/City-Business-License-Guidelines-and-Fees-2023",
  },
  // ---- The registry's accuracy additions, read from the agencies' own pages on 2026-10-18. ----
  "ttb-dealer": {
    // TTB 5630.5d: "Please sign and date this registration and mail it to: Alcohol and Tobacco Tax and Trade Bureau, 550
    // Main Street, Suite 8002, Cincinnati, OH 45202-5215." (or register in Permits Online). No fee is stated.
    mail: { name: "Alcohol and Tobacco Tax and Trade Bureau", line1: "550 Main Street, Suite 8002", city: "Cincinnati", state: "OH", zip: "45202-5215" },
    signature: "wet", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.ttb.gov/system/files/images/pdfs/forms/f56305d.pdf",
    also: ["https://www.ttb.gov/nrc/retail-beverage-alcohol-dealers"],
  },
  // "ny-sla-rw" (the SLA retail license) was listed here as filed on New York Business Express. Re-read 2026-10-22, it
  // isn't: "All on-premises ... applications are provided through New York Business Express as fillable forms", the
  // wizard only finds "the appropriate license and fee" and offers "downloading or emailing the summary, application,
  // and instructions", and "after your check is cashed, it can take up to 15 days to receive a receipt"
  // (sla.ny.gov/get-license, /how-apply-sla-license). No page read says where the paper application goes, so it has no
  // verified destination and stays with the team until one is confirmed.
  "co-sos": {
    // "File a form to create a new record" (coloradosos.gov/biz/FileDoc.do).
    portal: "www.coloradosos.gov", portalUrl: "https://www.coloradosos.gov/biz/FileDoc.do",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.sos.state.co.us/pubs/business/fileAForm.html",
  },
  "co-ui": {
    // CDLE: "Create an Employer User Account" in MyUI Employer+ (myui.clouduim.cdle.state.co.us), then "New Employer
    // Registration"; the Summary's acknowledgment and Submit finish it.
    portal: "myui.clouduim.cdle.state.co.us", portalUrl: "https://myui.clouduim.cdle.state.co.us/Employer/Core/Login.aspx",
    signature: "typed", payment: "none", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://cdle.colorado.gov/employers/myui-employer/resources/how-to-register-a-new-ui-employer-account-in-myui-employer",
  },
  "bos-site": {
    // "by mail or in person": Inspectional Services, 1010 Massachusetts Avenue, 5th Floor; "$50", check or money order
    // "made payable to the City of Boston". The fee goes with it, so the team sends it.
    mail: { name: "City of Boston Inspectional Services", line1: "1010 Massachusetts Avenue, 5th Floor", city: "Boston", state: "MA", zip: "02118" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    attach: ["Maintenance plan and schedule", "Solid waste proposal with the waste disposal contract (a current invoice if it is over a year old)", "Public Works license, if the dumpster is on a public way"],
    checked: "2026-10-18", source: "https://www.boston.gov/departments/inspectional-services/how-apply-site-cleanliness-license",
  },
  "ca-cdph-pfr": {
    // "Non-courier delivery: California Department of Public Health - Food and Drug Branch, P.O. Box 997435, MS 7602,
    // Sacramento, CA 95899", with the application and check. The fee goes with it, so the team sends it.
    mail: { name: "California Department of Public Health, Food and Drug Branch", line1: "P.O. Box 997435, MS 7602", city: "Sacramento", state: "CA", zip: "95899" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.cdph.ca.gov/Programs/CEH/DFDCS/Pages/FDBPrograms/FoodSafetyProgram/ProcessedFoodRegistration.aspx",
    also: ["https://www.cdph.ca.gov/Programs/CEH/DFDCS/Pages/FDBPrograms/FoodSafetyProgram/ProcedureObtainingProcessedFoodRegistration.aspx"],
  },
  "sea-building": {
    // "The Seattle Services Portal, at services.seattle.gov. You will need to create an account"; fees are paid online
    // once the application is complete.
    portal: "services.seattle.gov",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://www.seattle.gov/construction-and-inspections/permits/how-do-you-get-a-permit",
  },
  "chi-limited": {
    // "To apply for a business license, you may APPLY ONLINE" (ChicagoBusinessDirect.org, as BACP's pages name it) "or
    // visit the Chicago Small Business Center"; $250 for 2 years.
    portal: "chicagobusinessdirect.org", portalUrl: "https://chicagobusinessdirect.org/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://chicago.gov/city/en/sites/chicago-business-licensing/home/business-licensing.html",
    also: ["https://www.chicago.gov/city/en/depts/bacp/supp_info/retailfoodestablishment0.html"],
  },
  "ca-abc": {
    owner: {
      why: "ABC takes a new license application at the district office for the premises, where each applicant signs before an ABC employee and shows state ID (or signs ABC-211-SIG before a notary); the page names no mail or online route.",
      url: "https://www.abc.ca.gov/licensing/license-forms/new-license-application/",
    },
    signature: "wet", payment: "in_person",
    checked: "2026-10-18", source: "https://www.abc.ca.gov/licensing/license-forms/new-license-application/",
  },
  "ca-food-handler": {
    owner: {
      why: "Each employee who handles food earns their own California Food Handler Card from an accredited course and exam within 30 days of hire; the card is the employee's.",
      url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=113948",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-18", source: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=113948",
  },
  "snhd-cfsm": {
    owner: {
      why: "The Health District's application asks for \"A person in charge that is a Certified Food Safety Manager\" with a copy of the certificate attached: that person passes the exam themselves.",
      url: "https://media.southernnevadahealthdistrict.org/download/eh/2022/plan-review/applications/snhd-application-packet-food-202207.pdf",
    },
    signature: "none", payment: "in_person",
    checked: "2026-10-18", source: "https://media.southernnevadahealthdistrict.org/download/eh/2022/plan-review/applications/snhd-application-packet-food-202207.pdf",
  },
  "lac-business-license": {
    // "If your business activity is one that the County licenses, you must apply" ("Restaurant", "Food Establishment"):
    // the page's Apply link opens the county's EnerGov self-service application assistant.
    portal: "losangelescountyca-energovweb.tylerhost.net",
    portalUrl: "https://losangelescountyca-energovweb.tylerhost.net/apps/selfservice#/applicationAssistant?sectionName=All&moduleId=10&categoryName=County%20of%20Los%20Angeles%20Business%20License&showTemplates=false",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-18", source: "https://ttc.lacounty.gov/business-license-requirements-2/",
  },

  // California ABC's new retail license packet: the applicants sign before an ABC employee at the district office (with
  // state ID), or on a notarized ABC-211-SIG; the page names no mail or online route ("contact your local district office").
  ...Object.fromEntries(
    ["ca-abc-217", "ca-abc-258", "ca-abc-255", "ca-abc-140", "ca-abc-247", "ca-abc-257", "ca-abc-211", "ca-abc-243", "ca-abc-256"].map((id): [string, Dest] => [id, {
      owner: {
        why: "ABC takes a new license application at the district office for the premises, where each applicant signs before an ABC employee and shows state ID (or signs ABC-211-SIG before a notary); the page names no mail or online route.",
        url: "https://www.abc.ca.gov/licensing/license-forms/new-license-application/",
      },
      signature: "wet", payment: "in_person",
      checked: "2026-10-18", source: "https://www.abc.ca.gov/licensing/license-forms/new-license-application/",
    }]),
  ),
  "ca-abc-244": {
    // The form: "When this form is completed, it must be submitted to the District office. Fees are non-refundable".
    owner: {
      why: "ABC-244 says it \"must be submitted to the District office\" with the fee, signed by a licensed principal.",
      url: "https://www.abc.ca.gov/licensing/license-forms/new-license-application/",
    },
    signature: "wet", payment: "in_person",
    checked: "2026-10-18", source: "https://www.abc.ca.gov/wp-content/uploads/forms/ABC-244.pdf",
  },

  // ---- The beachhead's team-only forms, read from the agencies' own pages on 2026-10-24 (food and beverage in the 12 top
  // metros and their states, and the federal forms they file). Every sign-in is the owner's own account: Placetta never
  // creates one, and the owner approves before anything is filed or paid. ----
  "wa-sos-foreign": {
    // "Visit our Corporations and Charities Filing System" (ccfs.sos.wa.gov), "Create or Register a Business", "I would
    // like to register a business from a different state or country", "Foreign Limited Liability Company". "Filing Fee:
    // $180 in addition to an online processing fee." The Authorized Person types their name and checks "This document
    // is hereby executed under penalty of law".
    portal: "ccfs.sos.wa.gov", portalUrl: "https://ccfs.sos.wa.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    attach: ["A Certificate of Existence/Good Standing or document of similar import from the home jurisdiction issued no more than 60 days before the date of submission"],
    checked: "2026-10-24", source: "https://www.sos.wa.gov/corporations-charities/business-entities/online-filing-instructions/register-foreign-non-wa-limited-liability-company-llc-online",
  },
  "tx-tabc": {
    // "Apply for a new license or permit in AIMS" (tabc.texas.gov/aims-login, which opens tabcaims.elicense365.com).
    // AIMS: "Upload supporting documents", "Submit forms, electronic signatures and secure payments online 24/7". The
    // FAQ: "An authorized user or a principal party can enter and submit an application"; for originals "You will upload
    // signed applications and documents."
    portal: "tabcaims.elicense365.com", portalUrl: "https://tabcaims.elicense365.com/",
    signature: "wet", payment: "portal", onBehalf: "allowed",
    attach: ["Signed applications and documents", "The public notice, publisher's affidavit and all city, county and state certificates"],
    checked: "2026-10-24", source: "https://www.tabc.texas.gov/services/tabc-licenses-permits/new-tabc-licenses-permits/",
    also: ["https://www.tabc.texas.gov/services/alcohol-industry-management-system-aims/", "https://www.tabc.texas.gov/faqs/alcohol-industry-management-system-aims-faqs/"],
  },
  "wa-lcb": {
    // "You can apply online through Business Licensing Services (BLS). Go to the liquor licenses section to complete your
    // application." BLS: "File online with My DOR" (secure.dor.wa.gov).
    portal: "secure.dor.wa.gov", portalUrl: "https://secure.dor.wa.gov/home",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://lcb.wa.gov/licensing/apply-liquor-license",
    also: ["https://dor.wa.gov/open-business/business-licensing-and-renewals-faqs"],
  },
  "ga-alcohol": {
    // "Applicants must file and complete the appropriate license online using the Georgia Tax Center (GTC)"; "Scan and
    // save all required documentation as individual PDF files to upload to GTC". The local license comes first.
    portal: "gtc.dor.ga.gov", portalUrl: "https://gtc.dor.ga.gov/",
    signature: "typed", onBehalf: "unstated",
    attach: ["All required documentation, each as its own PDF file"],
    checked: "2026-10-24", source: "https://dor.georgia.gov/alcohol/apply-license-sell-alcohol",
  },
  "la-alarm-permit": {
    // "To obtain an alarm permit, you can apply for the alarm permit online" (latax.lacity.org/policepermitapp/index);
    // "Initial Permit: $60.00".
    portal: "latax.lacity.org", portalUrl: "https://latax.lacity.org/policepermitapp/index",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://finance.lacity.gov/alarm-permits-general-information",
  },
  "chi-sidewalk-cafe": {
    // "Applicants will need to create an account on and submit their applications through the permitting web portal"
    // (ipi.cityofchicago.org/Profile); "After the application is approved, the applicants will be directed to pay via the
    // portal." The account is the restaurant's own.
    portal: "ipi.cityofchicago.org", portalUrl: "https://ipi.cityofchicago.org/Profile",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    attach: ["Proof of licensure (a Retail Food Establishment license or Tavern license)", "Associated insurance documents", "A site plan of the proposed sidewalk café with measurements indicated", "A photo of the sidewalk to be occupied"],
    checked: "2026-10-24", source: "https://www.chicago.gov/city/en/depts/bacp/supp_info/sidewalkcafe.html",
  },
  "ttb-importer": {
    // TTB F 5100.24 "may be done electronically, through Permits Online"; "TTB does not charge fees for issuing these
    // permits." Who may submit: the owner or officer, or "A person ... given power of attorney on TTB Form 5000.8", with
    // the evidence of signing authority uploaded in the Entity Application.
    portal: "www.ttbonline.gov", portalUrl: "https://www.ttbonline.gov/permitsonline/",
    signature: "typed", payment: "none", onBehalf: "authorization", authorization: "TTB Form 5000.8 Power of Attorney",
    checked: "2026-10-24", source: "https://www.ttb.gov/import-export/itd/importing-bottled-alcohol-beverages-into-the-united-states",
    also: ["https://www.ttb.gov/online-services/ponl/ponl-help/who-may-submit-applications-through-permits-online", "https://www.ttb.gov/online-services/ponl/permits-online-help"],
  },
  "irv-license": {
    // "Service Announcement: PRISM Launched October 19": "local businesses can use PRISM 24/7 ... to apply for a new
    // business license" (prism.cityofirvine.gov/s/).
    portal: "prism.cityofirvine.gov", portalUrl: "https://prism.cityofirvine.gov/s/",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://cityofirvine.gov/community-development/business-licensing",
  },
  "fda-device-reg": {
    // "Registration and listing information is submitted by using FDA's Unified Registration and Listing System (FURLS)/
    // Device Registration and Listing Module (DRLM)" (www.access.fda.gov); the yearly fee is paid first "at the Device
    // Facility User Fee (DFUF) website".
    portal: "www.access.fda.gov",
    signature: "none", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://www.fda.gov/medical-devices/device-registration-and-listing/how-register-and-list",
  },
  // The IRS sends these to a service center by the business's state. Each table is copied from the IRS's page; the
  // dispatcher reads the state from the form's own address line (destFor), and a filing without one goes to the team.
  "irs-8832": {
    // "If you are located in... Address to mail form to IRS"; "A foreign country or U.S. possession": Ogden 84201-0023.
    // No fax or online route, so the owner signs it and mails it with the filled form Placetta prepared.
    byState: {
      from: ["citystatezip", "street"],
      groups: [
        { states: ["CT", "DE", "DC", "GA", "IL", "IN", "KY", "ME", "MD", "MA", "MI", "NH", "NJ", "NY", "NC", "OH", "PA", "RI", "SC", "VT", "VA", "WV", "WI"],
          mail: { name: "Department of the Treasury", line1: "Internal Revenue Service", city: "Kansas City", state: "MO", zip: "64999" } },
        { states: ["AL", "AK", "AZ", "AR", "CA", "CO", "FL", "HI", "ID", "IA", "KS", "LA", "MN", "MS", "MO", "MT", "NE", "NV", "NM", "ND", "OK", "OR", "SD", "TN", "TX", "UT", "WA", "WY"],
          mail: { name: "Department of the Treasury", line1: "Internal Revenue Service", city: "Ogden", state: "UT", zip: "84201" } },
      ],
      abroad: { mail: { name: "Department of the Treasury", line1: "Internal Revenue Service", city: "Ogden", state: "UT", zip: "84201-0023" } },
    },
    signature: "wet", payment: "none",
    checked: "2026-10-24", source: "https://www.irs.gov/filing/where-to-file-your-taxes-for-form-8832",
  },
  "irs-2553": {
    // "If the corporation's principal business, office, or agency is located in... Use the following IRS Center address
    // or fax number": Kansas City (Fax: 855-887-7734) or Ogden (Fax: 855-214-7520). The owner signs by hand; Placetta
    // faxes the signed copy.
    byState: {
      from: ["citystatezip", "street"],
      groups: [
        { states: ["CT", "DE", "DC", "GA", "IL", "IN", "KY", "ME", "MD", "MA", "MI", "NH", "NJ", "NY", "NC", "OH", "PA", "RI", "SC", "TN", "VT", "VA", "WV", "WI"],
          mail: { name: "Department of the Treasury", line1: "Internal Revenue Service", city: "Kansas City", state: "MO", zip: "64999" }, fax: "+18558877734" },
        { states: ["AL", "AK", "AZ", "AR", "CA", "CO", "FL", "HI", "ID", "IA", "KS", "LA", "MN", "MS", "MO", "MT", "NE", "NV", "NM", "ND", "OK", "OR", "SD", "TX", "UT", "WA", "WY"],
          mail: { name: "Department of the Treasury", line1: "Internal Revenue Service", city: "Ogden", state: "UT", zip: "84201" }, fax: "+18552147520" },
      ],
    },
    signature: "wet", payment: "none",
    checked: "2026-10-24", source: "https://www.irs.gov/filing/where-to-file-your-taxes-for-form-2553",
  },
  "irs-8822b": {
    // "IF your old business address was in . . . THEN use this address": Kansas City, MO 64999, or Ogden, UT 84201-0023
    // (which also takes "any place outside the United States"). Mail only.
    byState: {
      from: ["old_mailing"],
      groups: [
        { states: ["CT", "DE", "DC", "GA", "IL", "IN", "KY", "ME", "MD", "MA", "MI", "NH", "NJ", "NY", "NC", "OH", "PA", "RI", "SC", "TN", "VT", "VA", "WV", "WI"],
          mail: { name: "Internal Revenue Service", line1: "Internal Revenue Service", city: "Kansas City", state: "MO", zip: "64999" } },
        { states: ["AL", "AK", "AZ", "AR", "CA", "CO", "FL", "HI", "ID", "IA", "KS", "LA", "MN", "MS", "MO", "MT", "NE", "NV", "NM", "ND", "OK", "OR", "SD", "TX", "UT", "WA", "WY"],
          mail: { name: "Internal Revenue Service", line1: "Internal Revenue Service", city: "Ogden", state: "UT", zip: "84201-0023" } },
      ],
      abroad: { mail: { name: "Internal Revenue Service", line1: "Internal Revenue Service", city: "Ogden", state: "UT", zip: "84201-0023" } },
    },
    signature: "wet", payment: "none",
    checked: "2026-10-24", source: "https://www.irs.gov/pub/irs-pdf/f8822b.pdf",
  },
  "ga-dol": {
    // "You must complete an Application for GDOL Tax Account or Status Change (DOL-1A) form and return it to the Georgia
    // Department of Labor, Suite 850, 148 Andrew Young International Blvd., Atlanta, GA. 30303-1751." The forms page
    // now publishes it as "Application for GDOL Tax Account or Status Change - DOL 1N" (Employer Status Report, R-3/13),
    // which "must be signed by owner, partner or principal officer" and asks for a Social Security number that Placetta
    // never writes: the signer adds it by hand. The form itself (page 2) says "RETURN ORIGINAL WITHIN TEN (10) DAYS TO:
    // Georgia Department of Labor, P O Box 740234, Atlanta, GA 30374-0234 OR FAX TO: Adjudication Section 404-232-3285";
    // the mail address here is the FAQ's, the newer of the two.
    fax: { us: "+14042323285" },
    mail: { name: "Georgia Department of Labor", line1: "148 Andrew Young International Blvd NE", line2: "Suite 850", city: "Atlanta", state: "GA", zip: "30303-1751" },
    signature: "wet", payment: "none", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://dol.georgia.gov/faqs-employers/employers-faqs-unemployment-insurance",
    also: ["https://dol.georgia.gov/documents", "https://dol.georgia.gov/document/unemployment-tax/application-gdol-tax-account-or-status-change-dol-1n/download"],
  },
  "cc-business-license": {
    // Step five of "A Step-By-Step Guide to Apply for a General Business License": "OPTION 1: APPLY ONLINE Apply online at
    // Clark County Business License Online Application" (blepay.clarkcountynv.gov/NAICSDefault.aspx), or mail the
    // "COMPLETED APPLICATION AND APPROPRIATE FEES" to the address below; a "one-time $45.00 application fee in addition to
    // each license fee". Unincorporated Clark County covers most of the Las Vegas Strip.
    portal: "blepay.clarkcountynv.gov", portalUrl: "https://blepay.clarkcountynv.gov/NAICSDefault.aspx",
    mail: { name: "Clark County Department of Business License", line1: "500 S. Grand Central Pkwy, 3rd Floor", line2: "Box 551810", city: "Las Vegas", state: "NV", zip: "89155" },
    signature: "wet", payment: "with_filing", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://www.clarkcountynv.gov/business/doing_business_with_clark_county/divisions/general_business/general-license-guide",
  },

  // ---- The beachhead metros' suburbs (the Bay Area, the San Gabriel Valley and South Bay, the Eastside, Quincy, Sugar
  // Land, Gwinnett's Duluth) and New Jersey, read from each city's own page on 2026-10-24. ----
  "bel-license": {
    // "Apply online: Go to FileLocal to apply for a Bellevue business license", "Click "Apply for a General Business
    // License""; "The registration fee for licenses obtained in 2026 is $119", by card or ACH. A Washington business
    // license comes first.
    portal: "www.filelocal-wa.gov", portalUrl: "https://www.filelocal-wa.gov/Default_FileLocal.aspx",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://bellevuewa.gov/city-government/departments/finance/business-taxes/business-licenses",
  },
  "tor-license": {
    // "Step 1. Create an online account" (aca-prod.accela.com/TORRANCE), "Step 2. Apply for a business license: Click on
    // License & Waste Hauling, then click Apply/Register Online." The account is the owner's own.
    portal: "aca-prod.accela.com", portalUrl: "https://aca-prod.accela.com/TORRANCE/Default.aspx", tenant: "/TORRANCE",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://www.torranceca.gov/Business/Business-License",
  },
  "alh-license": {
    // The city's own online Business License Application (secure.alhambraca.gov/BusinessLicenseApplication/), its form
    // open without an account; "You must also apply for an Occupancy Permit" with it.
    portal: "secure.alhambraca.gov", portalUrl: "https://secure.alhambraca.gov/BusinessLicenseApplication/", noLogin: true,
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://secure.alhambraca.gov/BusinessLicenseApplication/",
  },
  "arc-license": {
    // "Online: Apply for a business license online or renew an existing business license" (arcadia.hdlgov.com).
    portal: "arcadia.hdlgov.com", portalUrl: "https://arcadia.hdlgov.com/",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://www.arcadiaca.gov/government/development_services/business_license/index.php",
  },
  "dly-license": {
    // "Business License Online Application: Please click on the highlighted link below to apply online"
    // (dalycity.hdlgov.com).
    portal: "dalycity.hdlgov.com", portalUrl: "https://dalycity.hdlgov.com/",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://dalycity.org/438/Business-License-Requirements-Applicatio",
  },
  "mil-license": {
    // "Apply here (milpitas.hdlgov.com) for a Business License"; "The Building and Planning departments will review and
    // approve application. Once approve, fees will be emailed or mailed."
    portal: "milpitas.hdlgov.com", portalUrl: "https://milpitas.hdlgov.com/",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://www.milpitas.gov/243/Apply",
  },
  "qcy-license": {
    // The City Clerk's "Renew or Apply for a Business License" links the city's online permitting
    // (quincyma.viewpointcloud.com, the business license record type).
    portal: "quincyma.viewpointcloud.com", portalUrl: "https://quincyma.viewpointcloud.com/categories/1088/record-types/6549",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://www.quincyma.gov/departments/city_clerk/index.php",
  },
  "dul-zoning": {
    // "CITY OF DULUTH OCCUPATIONAL TAX APPLICATIONS ARE COMPLETED ONLINE. Step 1 - Obtain ZONING USE VERIFICATION":
    // "Business Zoning and Use Certificate Application" (app.govwell.com/duluth).
    portal: "app.govwell.com", portalUrl: "https://app.govwell.com/duluth", tenant: "/duluth",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://www.duluthga.net/services/city_clerk/new_business_applications/index.php",
  },
  "dul-otc": {
    // "Step 2 - Submit OTC BUSINESS INFORMATION FORM" (duluthga.govbuilt.com, "Business Information Form - Part 1 of 3");
    // "Step 3 - Complete OCCUPATION TAX CERTIFICATE APPLICATION (after Planning approval, link provided via email)".
    portal: "duluthga.govbuilt.com", portalUrl: "https://duluthga.govbuilt.com/",
    signature: "typed", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://www.duluthga.net/services/city_clerk/new_business_applications/index.php",
  },
  // Sugar Land's food guide: "Plan reviews are only accepted online through Citizen Self-Service (CSS) Portal"
  // (energovweb.sugarlandtx.gov); the food permit: "Login or register in at CITIZEN SELF-SERVICE (CSS)", "select APPLY",
  // "type "FOOD", click on PERMANENT FOOD ESTABLISHMENT PERMIT", "upload all required supporting documents". The
  // pre-opening inspection fee is assessed after.
  "sl-plan-review": {
    portal: "energovweb.sugarlandtx.gov", portalUrl: "https://energovweb.sugarlandtx.gov/EnerGov_prod/SelfService#/home",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    attach: ["Menu", "Floor plans, including equipment and finish schedules"],
    checked: "2026-10-24", source: "https://www.sugarlandtx.gov/DocumentCenter/View/26923/Pre-Opening-New-Construction-Remodel-and-Change-of-Ownership-Requirements",
  },
  "sl-food-permit": {
    portal: "energovweb.sugarlandtx.gov", portalUrl: "https://energovweb.sugarlandtx.gov/EnerGov_prod/SelfService#/home",
    signature: "typed", payment: "invoice", onBehalf: "unstated",
    attach: ["Certified Food Protection Manager certificate", "Waste manifest or grease trap service receipt"],
    checked: "2026-10-24", source: "https://www.sugarlandtx.gov/DocumentCenter/View/26923/Pre-Opening-New-Construction-Remodel-and-Change-of-Ownership-Requirements",
  },

  // ---- Out-of-state registrations and formations on the state portals that already file the domestic LLC, each read
  // from the Secretary's own page on 2026-10-24. ----
  "pa-foreign-registration": {
    // "Register a foreign association to do business in PA" in the "online Business Filing Services site"
    // (file.dos.pa.gov); "Filing online is the easiest, simplest way".
    portal: "file.dos.pa.gov", portalUrl: "https://file.dos.pa.gov/forms/business",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://www.pa.gov/services/dos/register-a-business",
  },
  "co-foreign-registration": {
    // "File a form to create a new record" (coloradosos.gov/biz/FileDoc.do) for "a new foreign (outside of Colorado)
    // entity".
    portal: "www.coloradosos.gov", portalUrl: "https://www.coloradosos.gov/biz/FileDoc.do",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://www.sos.state.co.us/pubs/business/fileAForm.html",
  },
  "va-foreign-registration": {
    // "Register a new Foreign LLC (LLC1052)": "$100", "File Online" (cis.scc.virginia.gov).
    portal: "cis.scc.virginia.gov", portalUrl: "https://cis.scc.virginia.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://www.scc.virginia.gov/businesses/forms-and-fees/foreign-limited-liability-companies/",
    also: ["https://www.scc.virginia.gov/businesses/cis-help/foreign-registration-checklist/"],
  },
  "md-foreign-registration": {
    // "Nearly all charter and personal property filings can be made online ... Maryland Business Express' Registrations
    // and Filings Portal (egov.maryland.gov/BusinessExpress) to register your business".
    portal: "egov.maryland.gov", portalUrl: "https://egov.maryland.gov/businessexpress",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://dat.maryland.gov/businesses/Pages/default.aspx",
  },
  "dc-formation": {
    // "customer shall deliver articles of organization form DLC-1 to the Superintendent for filing either by web or by
    // mail / walk-in"; "Submit a Corporate Filing/Register a Business Entity" (corponline.dlcp.dc.gov).
    portal: "corponline.dlcp.dc.gov", portalUrl: "https://corponline.dlcp.dc.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://dlcp.dc.gov/service/domestic-limited-liability-company",
  },
  "dc-foreign-registration": {
    // DLCP's "Submit a Corporate Filing/Register a Business Entity" (corponline.dlcp.dc.gov), which takes the LLC
    // filings "domestic or foreign".
    portal: "corponline.dlcp.dc.gov", portalUrl: "https://corponline.dlcp.dc.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://dlcp.dc.gov/service/domestic-limited-liability-company",
  },
  "mn-sos-llc": {
    // "go here to register your business" (mblsportal.sos.state.mn.us); "How to register your business": decide the
    // structure "(such as Corporation, LLC ...)", "Step 1: Create an online account with us and login". The account is
    // the owner's own.
    portal: "mblsportal.sos.state.mn.us", portalUrl: "https://mblsportal.sos.state.mn.us/", alsoOn: ["mblsportal.sos.mn.gov"],
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: "2026-10-24", source: "https://www.sos.mn.gov/business-liens/start-a-business/",
    also: ["https://sos.mn.gov/business-liens/start-a-business/how-to-register-your-business/"],
  },
  // England, Wales and Northern Ireland: the Food Standards Agency's "Register a Food Business" service, which sends the
  // registration to the local authority for the address. GOV.UK's guidance links it as "Apply now: Register with your
  // local authority" (https://register.food.gov.uk/new) and says to register "at least 28 days before trading".
  // Read with curl on 2026-10-25: the start page answered 200 on register.food.gov.uk itself, with no redirect to a
  // sign-in (HMRC's services redirect to Government Gateway; this one doesn't), and says it "uses a cookie to create the
  // registration": so noLogin. The pages past the start were not walked, and no run has filed on it: there is no
  // playbook, so the first filings stop at the agency's review page for the two-key check like any new form, and the
  // worker hands back on any account, identity, code or payment page (guards.ts).
  // Fee: none. The Food Standards Agency's own guidance says "Registration of your food business is free and can't be
  // refused." (read with curl on 2026-10-25, the `also` page below).
  // Signature: NOT CONFIRMED. The service's start page names no declaration, and the pages after "Begin registration"
  // weren't walked, so whether it asks for a declaration, and in whose name, isn't known. "typed" is the closest value
  // the schema has for a declaration ticked on the site; it is only safe because a portal filing never sends Placetta's
  // own signed copy (check() in logic.ts skips the signature for a portal route). Whether a filer may submit it for the
  // business isn't stated either (onBehalf "unstated"). Until both are seen on the live pages, gb-food stays out of
  // FILER_AGENCIES: not ready for activation.
  "gb-food": {
    portal: "register.food.gov.uk",
    portalUrl: "https://register.food.gov.uk/new",
    noLogin: true,
    signature: "typed",
    payment: "none",
    onBehalf: "unstated",
    notReady: "The service's sign-off step and whether a filer may submit for the business weren't confirmed on the live pages.",
    checked: "2026-10-25",
    source: "https://www.gov.uk/guidance/food-business-registration",
    also: ["https://register.food.gov.uk/new", "https://www.food.gov.uk/business-guidance/getting-ready-to-start-your-food-business"],
  },
  // M5 (owner-approved batch, 2026-10-25): three GOV.UK services, each NOT ready for automatic filing (notReady) and
  // out of FILER_AGENCIES. Read with curl on 2026-10-25: each GOV.UK guide's start link, and where it lands.
  // - Companies House incorporation: "Use this service to register your company with Companies House." The start link
  //   (tax.service.gov.uk/register-your-company/setting-up-new-limited-company) answered 200 with "Are you starting a
  //   new application?". The guide says "It costs £100 and can be paid by debit or credit card", that each director
  //   may need "the Companies House personal code you received after verifying your identity", and "You'll need to
  //   create a Government Gateway user ID and password for your company when you register it."
  // - HMRC VAT: "You need to sign in to register for VAT". The start link redirected to "Sign in with Government
  //   Gateway". No fee is stated on the pages read.
  // - HMRC PAYE: "Most limited companies can register online". The start link redirected to the same Government
  //   Gateway sign-in. No fee is stated on the pages read.
  // Each needs an account and identity checks (Government Gateway, GOV.UK One Login, a director's personal code) that
  // are the person's own. Placetta never creates an account (worker/filer/src/guards.ts makesAccount, identity), and
  // whether an agent may submit for the business, and its sign-off, weren't seen. So: notReady, and no fee unless the
  // page states one.
  "gb-incorporate": {
    portal: "www.tax.service.gov.uk",
    portalUrl: "https://www.tax.service.gov.uk/register-your-company/setting-up-new-limited-company", tenant: "/register-your-company",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    notReady: "Each director's GOV.UK One Login identity check and the company's new Government Gateway account are the person's own; the service's sign-off and whether an agent may submit weren't seen.",
    checked: "2026-10-25", source: "https://www.gov.uk/limited-company-formation/register-your-company",
  },
  "gb-vat": {
    portal: "www.tax.service.gov.uk",
    portalUrl: "https://www.tax.service.gov.uk/register-for-vat", tenant: "/register-for-vat",
    signature: "typed", onBehalf: "unstated",
    notReady: "HMRC's service needs the business's own Government Gateway sign-in; the pages past sign-in and its rules for agents weren't seen.",
    checked: "2026-10-25", source: "https://www.gov.uk/register-for-vat/how-register-for-vat",
  },
  "gb-paye": {
    portal: "www.tax.service.gov.uk",
    portalUrl: "https://www.tax.service.gov.uk/register-for-paye/start-pay-as-you-earn", tenant: "/register-for-paye",
    signature: "typed", onBehalf: "unstated",
    notReady: "HMRC's service needs the business's own Government Gateway sign-in; the pages past sign-in and its rules for agents weren't seen.",
    checked: "2026-10-25", source: "https://www.gov.uk/register-employer",
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
  // 2026-10-24: each of these agencies files online, but its own page refused an automated read (a bot check), so the
  // route can't be copied from it yet. A person reads the page and moves the entry into DEST.
  "ny-dos-foreign-llc": { source: "https://dos.ny.gov/application-authority-foreign-limited-liability-companies", note: "dos.ny.gov refused an automated read (403), so the Department of State's online filing route wasn't confirmed." },
  "ny-assumed-name": { source: "https://dos.ny.gov/certificate-assumed-name-domestic-and-foreign-business-corporations", note: "dos.ny.gov refused an automated read (403), so the Department of State's online filing route wasn't confirmed." },
  "ga-sos-foreign": { source: "https://sos.ga.gov/how-to-guide/how-to-guide-register-foreign-entity", note: "sos.ga.gov refused an automated read (403); eCorp (ecorp.sos.ga.gov) files Georgia's domestic LLCs, but the foreign registration guide wasn't read." },
  "ma-sos-foreign-llc": { source: "https://www.sec.state.ma.us/divisions/corporations/download/c156cs48fllcregistration.pdf", note: "sec.state.ma.us answers automated reads with a bot check, so the online route for the foreign LLC registration wasn't confirmed." },
  "lac-fbn": { source: "https://lavote.gov/home/county-clerk/fictitious-business-names/frequently-asked-questions", note: "lavote.gov refused an automated read (403), so the Registrar-Recorder's online filing route wasn't confirmed." },
  "scc-fbn": { source: "https://www.santaclaracounty.gov/node/286", note: "santaclaracounty.gov answers automated reads with a bot check, so the Clerk-Recorder's filing route wasn't confirmed." },
  "hen-license": { source: "https://www.cityofhenderson.com/government/departments/finance/business-licensing/apply-for-a-business-license", note: "cityofhenderson.com refused an automated read (403), so the online application's address wasn't confirmed." },
  "fre-business-tax": { source: "https://fremont.gov/government/departments/finance/revenue/business-tax/apply-for-a-business-tax-account", note: "fremont.gov refused an automated read (403), so the online application's address wasn't confirmed." },
};

/**
 * Researched, and the Placetta team files these: the agency publishes no route Placetta can send on (in person only,
 * a licensed professional or contractor files it, there's nothing to file, or the route couldn't be confirmed).
 * Each says why and which page says so. Never used to send anything; the coverage report reads it.
 */
export const TEAM_ONLY: Record<string, { why: string; source: string; checked: string }> = {
  "chi-building": { why: "\"Only an Illinois-licensed architect or engineer or City-licensed expediter can apply for a plan-based building permit\"; the Express Permit Program is for nonstructural work up to 2,000 square feet (500 in an assembly space such as a restaurant dining room).", source: "https://www.chicago.gov/city/en/sites/guide-to-building-permits/home/apply.html", checked: "2026-10-24" },
  "lv-building": { why: "\"Only a Nevada licensed contractor may obtain a building permit for commercial construction.\"", source: "https://www.lasvegasnevada.gov/Business/Permits-Licenses/Building-Permits", checked: "2026-10-24" },
  "irv-building": { why: "Plans go in through the IrvineReady! portal, whose address the city's page doesn't print, and are signed by the licensed architect, engineer, contractor or interior designer who prepared them.", source: "https://cityofirvine.gov/node/69516", checked: "2026-10-24" },
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
  "il-sos": { why: "ilsos.gov refuses automated reads, so the online filing's address couldn't be confirmed on the Secretary's own page.", source: "https://www.ilsos.gov/departments/business-services/incorporation.html", checked: "2026-10-18" },
  "nv-silverflume": { why: "nvsilverflume.gov now redirects to the new ORION portal (orion.nv.gov), and nvsos.gov's pages refuse automated reads, so the new portal's route couldn't be confirmed on the Secretary's own page.", source: "https://www.nvsilverflume.gov/checklist", checked: "2026-10-18" },
  "nyc-dob-alt": { why: "\"Most kitchen and bathroom renovations require an ALT2 permit application, which must be filed by a PE or RA\": the design professional files it.", source: "https://www.nyc.gov/site/buildings/property-or-business-owner/renovating-kitchens-bathrooms.page", checked: "2026-10-18" },
  "nyc-cb-notice": { why: "The notice goes to the community board for the address 30 days before the SLA filing, but the SLA's page doesn't say how it is delivered, and each board has its own address.", source: "https://sla.ny.gov/community-board-faqs", checked: "2026-10-18" },
  "la-alcohol-cup": { why: "\"Visit the Development Services Center to apply for a Conditional Use Permit\"; it needs a public hearing and usually 4 to 5 months.", source: "https://business.lacity.gov/sites/g/files/wph1606/files/2021-02/Restaurant_Bar%20Checklist_0.pdf", checked: "2026-10-18" },
  "hou-buildout": { why: "Filed in iPermits, whose address the page doesn't print, with plans uploaded on the city's emailed invitation; trade inspections are \"scheduled by the appropriate registered licensed contractor\".", source: "https://www.houstonpermittingcenter.org/hpwcode1148", checked: "2026-10-18" },
  "bos-building": { why: "\"The permit applicant must be the contractor performing the work\"; \"Only the licensed contractor can apply.\"", source: "https://www.boston.gov/boston-permitting/permits/long-form-permits", checked: "2026-10-18" },
  "bos-co": { why: "The process is \"managed almost entirely by your licensed general contractor\" after every building permit inspection passes.", source: "https://www.boston.gov/departments/fire-prevention/certificate-occupancy", checked: "2026-10-18" },
  "phl-building": { why: "The city's page names no application route for the building permit: \"Call 311 and ask to speak to an L&I Building Unit representative.\"", source: "https://business.phila.gov/?p=1402", checked: "2026-10-18" },
  "moco-plan-review": { why: "Health and Human Services reviews the plans before any building permit issues; they go in with the building permit to the permitting office for the address (the county's Department of Permitting Services, or the City of Rockville's or Gaithersburg's), filed by the design professional.", source: "https://montgomerycountymd.gov/HHS/Resources/Files/L%26R/Guidance%20-%20DHHS%20Plan%20Review%20via%20DPS%2010_2024.pdf", checked: "2026-10-18" },
  "smc-plan-check": { why: "San Mateo County's plan check page didn't load past its navigation for us, so the plan submission route (MyEHS or paper) wasn't confirmed.", source: "https://www.smchealth.org/food-facility-plan-check-process", checked: "2026-10-18" },
  "gln-brc": { why: "Applied for in the city's GlendalePermits portal, whose address the city's page doesn't print.", source: "https://www.glendaleca.gov/government/departments/community-development/licenses-permits-and-applications/license-and-permit-applications/business-registration-certificate", checked: "2026-10-18" },
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
/** Hosts where every app is one agency's, so its apps' different paths are not different agencies: latax.lacity.org is
    the Los Angeles Office of Finance's (business tax registration at /businessregapp, police alarm permits at
    /policepermitapp, both linked from finance.lacity.gov). */
const ONE_AGENCY_HOSTS = new Set(["latax.lacity.org"]);

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

/** The first folder of a portal link's path, where a shared host keeps each agency (Accela's /dallastx). A page at the
    host's root (efile.sunbiz.org/llc_file.html) has none: two pages of one agency's site are not two agencies. */
const firstSegment = (u: string | undefined) => {
  const parts = urlOf(u)?.pathname.split("/").filter(Boolean) ?? [];
  return parts.length > 1 || (parts[0] && !/\.[a-z0-9]+$/i.test(parts[0])) ? parts[0].toLowerCase() : "";
};

/** Every reason an entry can't ship. The tests and CI fail on any. */
export function destinationProblems(dest: Record<string, Dest> = DEST): string[] {
  const out: string[] = [];
  for (const [id, d] of Object.entries(dest)) {
    if (!d.checked || !DATE.test(d.checked) || Number.isNaN(Date.parse(d.checked))) out.push(`${id}: checked must be the date it was confirmed (YYYY-MM-DD)`);
    if (!d.source || !/^https:\/\//.test(d.source) || !urlOf(d.source)) out.push(`${id}: source must be the agency's https page`);
    for (const a of d.also ?? []) if (!/^https:\/\//.test(a) || !urlOf(a)) out.push(`${id}: every page in also must be https`);
    if (!d.email && !d.fax && !d.mail && !d.portal && !d.owner && !d.byState) out.push(`${id}: has no destination`);
    if (d.byState) {
      const b = d.byState, seen = new Map<string, number>();
      if (!b.from?.length) out.push(`${id}: name the lines a by-state route reads the state from`);
      if (d.mail || d.fax) out.push(`${id}: a by-state route keeps its addresses in its groups, not on the entry`);
      for (const g of b.groups ?? []) {
        if (!g.mail && !g.fax) out.push(`${id}: every state group needs an address or a fax number`);
        for (const st of g.states) {
          if (!US_STATES.includes(st)) out.push(`${id}: ${st} isn't a state code`);
          seen.set(st, (seen.get(st) ?? 0) + 1);
        }
        out.push(...addressProblems(id, g.mail, "state group mail"));
        if (g.fax && !US_FAX.test(g.fax)) out.push(`${id}: a state group's fax must be a US number`);
      }
      for (const st of US_STATES) if (seen.get(st) !== 1) out.push(`${id}: ${st} must be in exactly one state group`);
      if (b.abroad) {
        if (!b.abroad.mail && !b.abroad.fax) out.push(`${id}: the row for abroad needs an address or a fax number`);
        out.push(...addressProblems(id, b.abroad.mail, "abroad mail"));
        if (b.abroad.fax && !US_FAX.test(b.abroad.fax)) out.push(`${id}: the fax for abroad must be a US number`);
      }
    }
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
    if (d.notReady !== undefined && d.notReady.trim().length < 10) out.push(`${id}: say why it isn't ready for automatic filing`);
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
    // OpenGov gives each agency its own subdomain (sanfranciscoca.portal.opengov.com): its paths are pages of one agency
    if (/\.portal\.opengov\.com$/i.test(host)) continue;
    if (ONE_AGENCY_HOSTS.has(host)) continue;
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
