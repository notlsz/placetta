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
export type LookupId = "sf_dbi_permits" | "la_ladbs_permits" | "nyc_dob_now_jobs" | "ca_abc_license" | "ny_sla_license" | "tx_tabc_license";
export type Parsed = { status: string; norm: Norm; date: string | null; detail?: string; confidence: number };

export type Lookup = {
  id: LookupId;
  agency: Bi;
  kind: "open_data" | "page";
  /** The city the lookup covers ("sf", "la", "nyc"), or the state ("CA", "NY", "TX"). */
  where: string;
  /** What on the filing it searches by. */
  key: "permit number" | "job filing number" | "license number";
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
const soql = (s: string) => encodeURIComponent(s);

/** The agency's words to a status that means the same everywhere. Unknown words keep the agency's text, at lower
 *  confidence, so a new status still shows (and is still a change) without a model guessing what it means. */
export function normStatus(raw: string): { norm: Norm; confidence: number } {
  const s = raw.trim().toLowerCase();
  const rules: [RegExp, Norm][] = [
    [/withdr|cancel+ed|void/, "withdrawn"],
    [/disapprov|denied|deny|reject|disallow|refus/, "denied"],
    [/expired|lapsed/, "expired"],
    [/incomplete|objection|correction|deficien|on hold|hold|need|pending (info|document|applicant)|resubmi/, "needs_info"],
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
export function cityKey(address: string): "sf" | "la" | "nyc" | null {
  if (NYC.test(address)) return "nyc";
  if (/san francisco|,\s*CA\s*941\d{2}/i.test(address)) return "sf";
  if (/los angeles|,\s*CA\s*900\d{2}/i.test(address)) return "la";
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
  if (/building|alteration|tenant improvement|build-?out|construction|\bDOB\b|LADBS|\bDBI\b/i.test(what)) {
    const c = cityKey(address);
    return LOOKUPS.find((l) => l.kind === "open_data" && l.where === c) ?? null;
  }
  return null;
}
