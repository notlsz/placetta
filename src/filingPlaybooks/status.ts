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
export type Norm = "received" | "in_review" | "needs_info" | "approved" | "issued" | "denied" | "withdrawn" | "expired" | "suspended" | "unknown";
export type LookupId = "sf_dbi_permits" | "la_ladbs_permits" | "nyc_dob_now_jobs" | "ca_abc_license" | "ny_sla_license" | "tx_tabc_license"
  | "chicago_building_permits" | "chicago_business_licenses" | "austin_permits" | "seattle_permits" | "boston_permits" | "philly_permits" | "philly_business_licenses"
  | "nyc_dcwp_applications";
export type Parsed = { status: string; norm: Norm; date: string | null; detail?: string; confidence: number;
  /** The expiration date on the agency's own record (YYYY-MM-DD), when the feed publishes one: the renewal date that
   *  counts, whatever a calendar computed. */
  expires?: string | null };

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
  /** More than one request for the same key (an agency that publishes pending, active and inactive records as separate
   *  datasets): every one is fetched, and `parse` gets their answers as an array, in this order. url() is the first. */
  urls?: (key: string) => string[];
  /** Where a person sees it. */
  see: string;
  /** Reads the feed's answer (an array of answers, in order, when `urls` is set): the newest matching record, or null
   *  when there is none yet. */
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
    [/\bsuspend/, "suspended"],
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

/** The SLA's three datasets on data.ny.gov, by the record's own number. */
const NY_SLA = {
  pending: (k: string) => `https://data.ny.gov/resource/f8i8-k2gm.json?$limit=5&$where=${soql(`application_id='${k}'`)}`,
  active: (k: string) => `https://data.ny.gov/resource/9s3h-dpkz.json?$limit=5&$where=${soql(`licensepermitid='${k}'`)}`,
  inactive: (k: string) => `https://data.ny.gov/resource/6dg3-2z7i.json?$limit=5&$where=${soql(`license_permit_id='${k}'`)}`,
};
/** The SLA's pending statuses, which the general words don't read: "IntakeComplete" is received, "Conditionally
 *  Approved" is approved with conditions still to meet, "Reconsideration" is a second look after a disapproval. */
const NY_PENDING: Record<string, { norm: Norm; confidence: number }> = {
  intakecomplete: { norm: "received", confidence: 0.95 }, "under review": { norm: "in_review", confidence: 0.95 },
  "conditionally approved": { norm: "approved", confidence: 0.9 }, reconsideration: { norm: "in_review", confidence: 0.9 },
};
/** TABC's two datasets on data.texas.gov. */
const TX_TABC = {
  license: (k: string) => `https://data.texas.gov/resource/7hf9-qc9f.json?$limit=5&$where=${soql(`license_id='${k}'`)}`,
  pending: (k: string) => `https://data.texas.gov/resource/mxm5-tdpj.json?$limit=5&$where=${soql(`primary_license_id='${k}'`)}`,
};
/** TABC's license statuses: a renewal pending on an active license is still active; surrendered and cancelled are
 *  withdrawn; a suspension is its own state, out of good standing. */
export function tabcStatus(raw: string): { norm: Norm; confidence: number } {
  const s = raw.trim().toLowerCase();
  if (/^suspended/.test(s)) return { norm: "suspended", confidence: 0.95 };
  if (/^active/.test(s)) return { norm: "issued", confidence: 0.95 };
  if (/^expired/.test(s)) return { norm: "expired", confidence: 0.95 };
  if (/surrender|cancel/.test(s)) return { norm: "withdrawn", confidence: 0.95 };
  return normStatus(raw);
}
/** Several answers, one per dataset, or empty ones when the shape is wrong. */
const answers = (b: unknown, n: number): Record<string, unknown>[][] =>
  Array.isArray(b) && b.length === n && b.every(Array.isArray) ? b as Record<string, unknown>[][] : Array.from({ length: n }, () => []);

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
    // Added 2026-10-24. Three datasets the SLA itself publishes on data.ny.gov, each refreshed daily: pending applications
    // (by application id, "NA-0071-26-227961"), active licenses and inactive ones (by license id, "0340-19-111757"). The
    // same key is looked up in all three, so one filing is followed from intake to issued, then for good standing and
    // its expiration date.
    id: "ny_sla_license", agency: { en: "New York State Liquor Authority", zh: "纽约州酒类管理局" }, kind: "open_data", where: "NY", key: "license number",
    url: (raw) => ((k) => k ? NY_SLA.pending(k) : null)(cleanKey(raw)),
    urls: (raw) => ((k) => k ? [NY_SLA.pending(k), NY_SLA.active(k), NY_SLA.inactive(k)] : [])(cleanKey(raw)),
    see: "https://data.ny.gov/Economic-Development/Current-Liquor-Authority-Active-Licenses/9s3h-dpkz",
    parse: (b) => {
      const [pending, active, inactive] = answers(b, 3);
      // an active license is the newest truth; then a pending application; an inactive record only when nothing else is
      const a = active[0];
      if (a) return { status: "Active", norm: "issued", date: day(a.lastissuedate) ?? day(a.effectivedate), expires: day(a.expirationdate), confidence: 0.95,
        ...(a.description ? { detail: String(a.description).slice(0, 160) } : {}) };
      const p = pick(pending, "status", ["received_date"], "description");
      if (p) return { ...p, ...(NY_PENDING[p.status.toLowerCase()] ?? {}) };
      const i = inactive[0];
      if (i) return { status: "Inactive", norm: "expired", date: day(i.expiration_date), expires: day(i.expiration_date), confidence: 0.9,
        ...(i.description ? { detail: String(i.description).slice(0, 160) } : {}) };
      return null;
    },
    verified: { on: "2026-10-24", how: "queried live: pending f8i8-k2gm by application_id NA-0071-26-227961 (status IntakeComplete, received_date); active 9s3h-dpkz by licensepermitid 0032-23-139868 (lastissuedate, expirationdate); inactive 6dg3-2z7i by license_permit_id 0340-19-111757 (expiration_date); pending statuses across the feed: IntakeComplete, Under Review, Conditionally Approved, Reconsideration" },
    source: "https://data.ny.gov/resource/9s3h-dpkz.json",
  },
  {
    // Added 2026-10-24. Two datasets TABC publishes on data.texas.gov, refreshed daily. A license id is assigned when the
    // application is filed, and the pending-applications feed carries it as primary_license_id, so one number finds the
    // application while it's pending and the license once issued.
    id: "tx_tabc_license", agency: { en: "Texas Alcoholic Beverage Commission", zh: "德州酒类委员会" }, kind: "open_data", where: "TX", key: "license number",
    url: (raw) => ((k) => k ? TX_TABC.license(k) : null)(cleanKey(raw)),
    urls: (raw) => ((k) => k ? [TX_TABC.license(k), TX_TABC.pending(k)] : [])(cleanKey(raw)),
    see: "https://data.texas.gov/dataset/TABC-License-Information/7hf9-qc9f",
    parse: (b) => {
      const [lic, pending] = answers(b, 2);
      const l = lic[0];
      if (l && String(l.license_status ?? "").trim()) {
        const status = String(l.license_status).trim(), m = tabcStatus(status);
        return { status, norm: m.norm, date: day(l.status_change_date) ?? day(l.current_issued_date), expires: day(l.expiration_date), confidence: m.confidence,
          ...(l.trade_name || l.owner ? { detail: String(l.trade_name ?? l.owner).slice(0, 160) } : {}) };
      }
      return pick(pending, "applicationstatus", ["submission_date", "application_submission_date"]);
    },
    verified: { on: "2026-10-24", how: "queried live: license 7hf9-qc9f by license_id 200212337 (license_status Active, status_change_date, expiration_date); pending mxm5-tdpj rows carry the license id as primary_license_id (applicationstatus \"Pending – In Review\" or \"Received\"); statuses across the license feed: Active, Active - Renewal Pending, Cancelled, Expired, Expired - Original Required, Surrendered, Suspended, Suspended - Renewal Pending, Temporarily Surrendered" },
    source: "https://data.texas.gov/resource/7hf9-qc9f.json",
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
    return LOOKUPS.find((l) => l.where === st && l.key === "license number") ?? null;
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
