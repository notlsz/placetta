/* Status lookups: where each agency publishes a filing's status, and the code that reads it without a model.

   Copied from what works: package tracking (UPS, FedEx, Amazon, Shopify's order timeline) reads a carrier's scan
   events, not a person's guess; Vanta runs automated tests on a schedule instead of point-in-time audits; Visualping
   and Distill.io fetch a page, compare it with the last copy and alert only on a change that matters
   (https://distill.io/docs/web-monitor/using-conditions-to-get-alert-on-important-changes/). Here:
     open_data  the city's own open-data feed (Socrata), queried by the permit or job number on the filing. Structured,
                so it is read in code: no model, no cost. Each was queried on 2026-10-22 and its fields read from a
                live row (`verified`).
     page       an agency lookup page that needs a search form (a nonce, a session), so it can't be fetched in code.
                The status check there is Odelia's, with the page named so she goes straight to it.
   A filing whose agency has neither is checked by Odelia too, less often when nothing moves (src/tracking).

   Each playbook names the lookups for its kind of filing (`lookups` in ./index.ts); scripts/lifecycle-test.ts checks
   every lookup belongs to a playbook and every parser against a row in the shape the feed returns.
   Pure: no imports beyond types, so the monitor (Deno) and the app share it. */
import type { Bi } from "../bi";

/** What a status means, whatever the agency calls it. */
export type Norm = "received" | "in_review" | "needs_info" | "approved" | "issued" | "denied" | "withdrawn" | "expired" | "unknown";
export type LookupId = "sf_dbi_permits" | "la_ladbs_permits" | "nyc_dob_now_jobs" | "ca_abc_license" | "ny_sla_license" | "tx_tabc_license"
  | "chicago_building_permits" | "chicago_business_licenses" | "austin_permits" | "seattle_permits" | "boston_permits" | "philly_permits" | "philly_business_licenses"
  | "nyc_dcwp_applications";
export type Parsed = { status: string; norm: Norm; date: string | null; detail?: string; confidence: number };

export type Lookup = {
  id: LookupId;
  agency: Bi;
  kind: "open_data" | "page";
  /** The city the lookup covers ("sf", "la", "nyc"), or the state ("CA", "NY", "TX"). */
  where: string;
  /** What on the filing it searches by. */
  key: "permit number" | "job filing number" | "license number" | "application number";
  /** The request, from a cleaned key; null when it can't be built in code. */
  url: (key: string) => string | null;
  /** Where a person sees it. */
  see: string;
  /** Reads the feed's answer: the newest matching record, or null when there is none yet. */
  parse?: (body: unknown) => Parsed | null;
  verified: { on: string; how: string } | null;
  source: string;
};

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
/** A permit, job or license number as typed: letters, digits and dashes only, so it can't change the query. */
export const cleanKey = (s: unknown) => String(s ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
/** The same, keeping one space between parts, for a city whose numbers have one ("2025-133771 PP" in Austin). */
export const cleanSpacedKey = (s: unknown) => String(s ?? "").trim().toUpperCase().replace(/[^A-Z0-9 -]/g, "").replace(/\s+/g, " ").trim().slice(0, 32);
const soql = (s: string) => encodeURIComponent(s);
/** A record that is in the feed only once the agency issued it (Chicago's building permits): present means issued. */
const issuedIfPresent = (rows: unknown, dateKey: string): Parsed | null => {
  if (!Array.isArray(rows) || !rows.length) return null;
  const r = rows[0] as Record<string, unknown>;
  return { status: "Issued", norm: "issued", date: day(r[dateKey]), confidence: 0.95 };
};
/** Chicago's license status codes, as the dataset's own description defines them. */
const CHICAGO_CODES: Record<string, string> = { AAI: "Issued (AAI)", AAC: "Cancelled during its term (AAC)", REV: "Revoked (REV)", REA: "Revocation appealed (REA)" };

/** The agency's words to a status that means the same everywhere. Unknown words keep the agency's text, at lower
 *  confidence, so a new status still shows (and is still a change) without a model guessing what it means. */
export function normStatus(raw: string): { norm: Norm; confidence: number } {
  const s = raw.trim().toLowerCase();
  const rules: [RegExp, Norm][] = [
    [/withdr|cancel+ed|void/, "withdrawn"],
    [/disapprov|denied|deny|reject|disallow|refus|\brevoked\b/, "denied"],
    [/expired|lapsed|\binactive\b/, "expired"],
    [/incomplete|objection|correction|deficien|on hold|hold|need|pending (info|document|applicant)|resubmi|info(rmation)? requested|\bair requested/, "needs_info"],
    // NYC DCWP's temporary operating letter: allowed to operate while the license is decided, not the license
    [/\btol\b|temporary operating/, "in_review"],
    [/^active$/, "issued"],
    [/issued|signed[- ]?off|complete(d)?$|finaled|final|loc issued|c of o issued|permit entire/, "issued"],
    [/approved|granted|plan approved|ready to issue/, "approved"],
    [/review|plan ?check|in process|processing|assigned|examin|under/, "in_review"],
    [/filed|received|submitted|accepted for|application|pre-?filing|intake|open/, "received"],
  ];
  for (const [re, norm] of rules) if (re.test(s)) return { norm, confidence: 0.95 };
  return { norm: "unknown", confidence: 0.6 };
}

const pick = (rows: unknown, statusKey: string, dateKeys: string[], detailKey?: string): Parsed | null => {
  if (!Array.isArray(rows) || !rows.length) return null;
  const r = [...rows as Record<string, unknown>[]].sort((a, b) => String(dateKeys.map(k => a[k]).find(Boolean) ?? "") < String(dateKeys.map(k => b[k]).find(Boolean) ?? "") ? 1 : -1)[0];
  const status = String(r[statusKey] ?? "").trim();
  if (!status) return null;
  const n = normStatus(status);
  return { status, norm: n.norm, date: day(dateKeys.map(k => r[k]).find(Boolean)), confidence: n.confidence,
    ...(detailKey && r[detailKey] ? { detail: String(r[detailKey]).slice(0, 160) } : {}) };
};

export const LOOKUPS: Lookup[] = [
  {
    id: "sf_dbi_permits", agency: { en: "San Francisco Department of Building Inspection", zh: "旧金山建筑检查局" }, kind: "open_data", where: "sf", key: "permit number",
    // data.sfgov.org now answers with a redirect page to data.sf.gov, so the feed is read at its new host
    url: (raw) => ((k) => k ? `https://data.sf.gov/resource/i98e-djp9.json?$limit=5&$where=${soql(`permit_number='${k}'`)}` : null)(cleanKey(raw)),
    see: "https://dbiweb02.sfgov.org/dbipts/",
    parse: (b) => pick(b, "status", ["status_date", "issued_date", "approved_date", "filed_date"], "description"),
    verified: { on: "2026-10-22", how: "queried live; fields permit_number, status, status_date read from a returned row" },
    source: "https://data.sf.gov/resource/i98e-djp9.json",
  },
  {
    id: "la_ladbs_permits", agency: { en: "Los Angeles Department of Building and Safety", zh: "洛杉矶建筑与安全局" }, kind: "open_data", where: "la", key: "permit number",
    url: (raw) => ((k) => k ? `https://data.lacity.org/resource/pi9x-tg5x.json?$limit=5&$where=${soql(`permit_nbr='${k}'`)}` : null)(cleanKey(raw)),
    see: "https://www.ladbsservices2.lacity.org/OnlineServices/",
    parse: (b) => pick(b, "status_desc", ["status_date", "issue_date"], "work_desc"),
    verified: { on: "2026-10-22", how: "queried live; fields permit_nbr, status_desc, status_date read from a returned row" },
    source: "https://data.lacity.org/resource/pi9x-tg5x.json",
  },
  {
    id: "nyc_dob_now_jobs", agency: { en: "NYC Department of Buildings (DOB NOW: Build)", zh: "纽约市建筑局（DOB NOW: Build）" }, kind: "open_data", where: "nyc", key: "job filing number",
    url: (raw) => ((k) => k ? `https://data.cityofnewyork.us/resource/w9ak-ipjd.json?$limit=5&$where=${soql(`job_filing_number='${k}'`)}` : null)(cleanKey(raw)),
    see: "https://a810-dobnow.nyc.gov/publish/Index.html#!/",
    parse: (b) => pick(b, "filing_status", ["current_status_date", "first_permit_date", "filing_date"]),
    verified: { on: "2026-10-22", how: "queried live; fields job_filing_number, filing_status, current_status_date read from a returned row" },
    source: "https://data.cityofnewyork.us/resource/w9ak-ipjd.json",
  },
  // Added 2026-10-22: each queried live by a real record's own number, and its fields read from the row it returned.
  {
    // the feed holds issued permits only: a row for the number means the city issued it
    id: "chicago_building_permits", agency: { en: "Chicago Department of Buildings", zh: "芝加哥建筑局" }, kind: "open_data", where: "chicago", key: "permit number",
    url: (raw) => ((k) => k ? `https://data.cityofchicago.org/resource/ydr8-5enu.json?$limit=5&$where=${soql(`permit_='${k}'`)}` : null)(cleanKey(raw)),
    see: "https://data.cityofchicago.org/Buildings/Building-Permits/ydr8-5enu",
    parse: (b) => issuedIfPresent(b, "issue_date"),
    verified: { on: "2026-10-22", how: "queried live by permit_ 101089151; issue_date and application_start_date read from the returned row; the feed has no status column (issued permits only)" },
    source: "https://data.cityofchicago.org/resource/ydr8-5enu.json",
  },
  {
    id: "chicago_business_licenses", agency: { en: "Chicago Department of Business Affairs and Consumer Protection", zh: "芝加哥商业事务与消费者保护局" }, kind: "open_data", where: "chicago", key: "license number",
    url: (raw) => ((k) => k ? `https://data.cityofchicago.org/resource/r5kz-chrr.json?$limit=5&$where=${soql(`license_number='${k}'`)}` : null)(cleanKey(raw)),
    see: "https://data.cityofchicago.org/Community-Economic-Development/Business-Licenses/r5kz-chrr",
    // "'AAI' means the license was issued. 'AAC' means the license was cancelled during its term. 'REV' means the
    // license was revoked. 'REA' means the license revocation has been appealed." (the dataset's description)
    parse: (b) => {
      const p = pick(Array.isArray(b) ? (b as Record<string, unknown>[]).map((r) => ({ ...r, license_status: CHICAGO_CODES[String(r.license_status ?? "")] ?? r.license_status })) : b,
        "license_status", ["license_status_change_date", "date_issued", "license_approved_for_issuance"], "application_type");
      return p;
    },
    verified: { on: "2026-10-22", how: "queried live by license_number 2757733 (4 rows); license_status AAI, date_issued, application_type read; status codes from the dataset's description" },
    source: "https://data.cityofchicago.org/resource/r5kz-chrr.json",
  },
  {
    id: "austin_permits", agency: { en: "City of Austin Development Services", zh: "奥斯汀市发展服务部" }, kind: "open_data", where: "austin", key: "permit number",
    // Austin's numbers have a space ("2025-133771 PP"), so the key keeps one
    url: (raw) => ((k) => k ? `https://data.austintexas.gov/resource/3syk-w9eu.json?$limit=5&$where=${soql(`permit_number='${k}'`)}` : null)(cleanSpacedKey(raw)),
    see: "https://data.austintexas.gov/d/3syk-w9eu",
    parse: (b) => pick(b, "status_current", ["statusdate", "issue_date", "applieddate"], "permit_type_desc"),
    verified: { on: "2026-10-22", how: "queried live by permit_number '2025-133771 PP'; status_current Active, statusdate read from the returned row" },
    source: "https://data.austintexas.gov/resource/3syk-w9eu.json",
  },
  {
    id: "seattle_permits", agency: { en: "Seattle Department of Construction and Inspections", zh: "西雅图建筑与检查局" }, kind: "open_data", where: "seattle", key: "permit number",
    url: (raw) => ((k) => k ? `https://data.seattle.gov/resource/76t5-zqzr.json?$limit=5&$where=${soql(`permitnum='${k}'`)}` : null)(cleanKey(raw)),
    see: "https://services.seattle.gov/portal/",
    parse: (b) => pick(b, "statuscurrent", ["issueddate", "applieddate"], "permittypedesc"),
    verified: { on: "2026-10-22", how: "queried live by permitnum 7163750-CN; statuscurrent \"Additional Info Requested\" read from the returned row (the row carried no dates)" },
    source: "https://data.seattle.gov/resource/76t5-zqzr.json",
  },
  {
    // CKAN, not Socrata: the approved building permits table, searched by permit number with a filter
    id: "boston_permits", agency: { en: "Boston Inspectional Services", zh: "波士顿检查服务局" }, kind: "open_data", where: "boston", key: "permit number",
    url: (raw) => ((k) => k ? `https://data.boston.gov/api/3/action/datastore_search?resource_id=6ddcd912-32a0-43df-9908-63574f8c7e77&limit=5&filters=${encodeURIComponent(JSON.stringify({ permitnumber: k }))}` : null)(cleanKey(raw)),
    see: "https://data.boston.gov/dataset/approved-building-permits",
    // every row is an approved permit; its status says whether the work is still open or closed out
    parse: (b) => {
      const rows = (b as { result?: { records?: Record<string, unknown>[] } })?.result?.records;
      if (!Array.isArray(rows) || !rows.length) return null;
      const r = rows[0], st = String(r.status ?? "").trim();
      return { status: `Issued${st ? ` (${st})` : ""}`, norm: "issued", date: day(r.issued_date), confidence: 0.95 };
    },
    verified: { on: "2026-10-22", how: "queried live with filters {permitnumber: A1000569}; status Closed, issued_date read from the returned record" },
    source: "https://data.boston.gov/api/3/action/datastore_search?resource_id=6ddcd912-32a0-43df-9908-63574f8c7e77",
  },
  {
    // Carto SQL: the key is cleaned to letters, digits and dashes before it's quoted, so it can't change the query
    id: "philly_permits", agency: { en: "Philadelphia Department of Licenses and Inspections", zh: "费城执照与检查局" }, kind: "open_data", where: "philadelphia", key: "permit number",
    url: (raw) => ((k) => k ? `https://phl.carto.com/api/v2/sql?q=${soql(`SELECT permitnumber, status, permitissuedate, permitcompleteddate, permitdescription FROM permits WHERE permitnumber = '${k}' LIMIT 5`)}` : null)(cleanKey(raw)),
    see: "https://li.phila.gov/",
    parse: (b) => pick((b as { rows?: unknown })?.rows, "status", ["permitcompleteddate", "permitissuedate"], "permitdescription"),
    verified: { on: "2026-10-22", how: "queried live by permitnumber ZP-2023-004901; status Refused, permitcompleteddate read from the returned row" },
    source: "https://phl.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20permits%20LIMIT%201",
  },
  {
    id: "philly_business_licenses", agency: { en: "Philadelphia Department of Licenses and Inspections", zh: "费城执照与检查局" }, kind: "open_data", where: "philadelphia", key: "license number",
    url: (raw) => ((k) => k ? `https://phl.carto.com/api/v2/sql?q=${soql(`SELECT licensenum, licensestatus, licensetype, mostrecentissuedate, inactivedate FROM business_licenses WHERE licensenum = '${k}' LIMIT 5`)}` : null)(cleanKey(raw)),
    see: "https://li.phila.gov/",
    parse: (b) => pick((b as { rows?: unknown })?.rows, "licensestatus", ["inactivedate", "mostrecentissuedate"], "licensetype"),
    verified: { on: "2026-10-22", how: "queried live by licensenum 246211; licensestatus Inactive, inactivedate read from the returned row" },
    source: "https://phl.carto.com/api/v2/sql?q=SELECT%20*%20FROM%20business_licenses%20LIMIT%201",
  },
  {
    // "all license applications submitted to the NYC Department of Consumer and Worker Protection ... issued or
    // renewed, denied, withdrawn, or remains in pending status" (the dataset's description)
    id: "nyc_dcwp_applications", agency: { en: "NYC Department of Consumer and Worker Protection", zh: "纽约市消费者与劳工保护局" }, kind: "open_data", where: "nyc", key: "application number",
    url: (raw) => ((k) => k ? `https://data.cityofnewyork.us/resource/ptev-4hud.json?$limit=5&$where=${soql(`application_id='${k}'`)}` : null)(cleanKey(raw)),
    see: "https://data.cityofnewyork.us/Business/License-Applications/ptev-4hud",
    parse: (b) => pick(b, "status", ["date_closed", "submission_date"], "license_number"),
    verified: { on: "2026-10-22", how: "queried live by application_id 16848-2026-RTTD; status Submitted, submission_date read; statuses seen across the feed: Submitted, Additional Info Requested, Approved, Denied, Withdrawn, TOL Issued, Closed" },
    source: "https://data.cityofnewyork.us/resource/ptev-4hud.json",
  },
  {
    // the License Query System searches by license number through a form with a WordPress nonce, so code can't fetch it
    id: "ca_abc_license", agency: { en: "California Department of Alcoholic Beverage Control", zh: "加州酒类管制局" }, kind: "page", where: "CA", key: "license number",
    url: () => null, see: "https://www.abc.ca.gov/licensing/license-lookup/license-number/",
    verified: { on: "2026-10-22", how: "page loads (200); its search posts a nonce, so the check is Odelia's" },
    source: "https://www.abc.ca.gov/licensing/license-lookup/",
  },
  {
    id: "ny_sla_license", agency: { en: "New York State Liquor Authority", zh: "纽约州酒类管理局" }, kind: "page", where: "NY", key: "license number",
    // UNVERIFIED: the SLA's public license query page wasn't opened here; Odelia searches sla.ny.gov for it
    url: () => null, see: "https://sla.ny.gov/",
    verified: null, source: "https://sla.ny.gov/",
  },
  {
    id: "tx_tabc_license", agency: { en: "Texas Alcoholic Beverage Commission", zh: "德州酒类委员会" }, kind: "page", where: "TX", key: "license number",
    // UNVERIFIED: TABC's public inquiry wasn't opened here; its protest page (read 2026-10-22) points to AIMS
    url: () => null, see: "https://tabc.texas.gov/contact-us/file-a-complaint-protest/protest-a-license/",
    verified: null, source: "https://tabc.texas.gov/contact-us/file-a-complaint-protest/protest-a-license/",
  },
];
export const lookupById = (id: string) => LOOKUPS.find((l) => l.id === id);

const NYC = /new york|nyc|manhattan|brooklyn|queens|bronx|staten island|flushing|astoria|long island city|\bNY\s*1[01]\d{3}\b/i;
/** The city of an address, as the lookups name it. */
export function cityKey(address: string): "sf" | "la" | "nyc" | "chicago" | "austin" | "seattle" | "boston" | "philadelphia" | null {
  if (NYC.test(address)) return "nyc";
  if (/san francisco|,\s*CA\s*941\d{2}/i.test(address)) return "sf";
  if (/los angeles|,\s*CA\s*900\d{2}/i.test(address)) return "la";
  if (/\bchicago\b|,\s*IL\s*606\d{2}/i.test(address)) return "chicago";
  if (/\baustin\b,?\s*(TX|texas)|,\s*TX\s*787\d{2}/i.test(address)) return "austin";
  if (/\bseattle\b|,\s*WA\s*981[0-9]{2}/i.test(address)) return "seattle";
  if (/\bboston\b,?\s*(MA|massachusetts)|,\s*MA\s*021[0-9]{2}/i.test(address)) return "boston";
  if (/\bphiladelphia\b|,\s*PA\s*191\d{2}/i.test(address)) return "philadelphia";
  return null;
}
const stateOf = (address: string) => /\b(CA|NY|TX)\b\s*\d{5}/.exec(address)?.[1] ?? (/california/i.test(address) ? "CA" : /new york/i.test(address) ? "NY" : /texas/i.test(address) ? "TX" : null);

/** The lookup for an application at an address: by what it is (its name and agency) and where. Kept to plain words so
 *  the monitor doesn't load the forms registry; the playbooks' `lookups` lists say the same per kind of filing. */
export function lookupFor(app: { name?: Bi; agency?: Bi }, address: string): Lookup | null {
  const what = `${app.name?.en ?? ""} ${app.agency?.en ?? ""}`;
  if (/liquor|alcohol|beer|wine|\bABC\b|\bSLA\b|TABC/i.test(what)) {
    const st = stateOf(address);
    return LOOKUPS.find((l) => l.kind === "page" && l.where === st) ?? null;
  }
  const c = cityKey(address);
  if (/building|alteration|tenant improvement|build-?out|construction|\bDOB\b|LADBS|\bDBI\b/i.test(what)) {
    return LOOKUPS.find((l) => l.kind === "open_data" && l.where === c && l.key !== "license number" && l.key !== "application number") ?? null;
  }
  // a city license the city publishes: New York's DCWP applications, Chicago's and Philadelphia's business licenses
  if (/\bDCWP\b|consumer (and worker )?protection|consumer affairs/i.test(what) && c === "nyc") return lookupById("nyc_dcwp_applications") ?? null;
  if (/business license|business licence|license|licence/i.test(what) && (c === "chicago" || c === "philadelphia")) return LOOKUPS.find((l) => l.where === c && l.key === "license number") ?? null;
  return null;
}
