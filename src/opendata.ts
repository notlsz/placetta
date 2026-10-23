// What the cities themselves publish about a store's address, read straight from their open-data portals (Socrata,
// no key needed): NYC restaurant inspections and letter grades (DOHMH), NYC building permits (DOB NOW), and building
// permits in San Francisco, Los Angeles and Austin. No model, no cost: the daily monitor and Odelia's tools use it to
// see an issued permit, a new grade or a failed inspection the day the city posts it.
// Shared by the monitor (Deno) and the agent (browser and server): plain fetch, no imports.

export type CityRecord = {
  source: "nyc_inspections" | "nyc_dob" | "sf_permits" | "la_permits" | "austin_permits";
  kind: "inspection" | "permit";
  id: string;                 // stable per record and state, for dedupe
  title: string;              // e.g. "Alteration permit" or "Health inspection"
  status: string;             // as the city words it: "Issued", "Grade A", "Approved"
  date: string | null;        // YYYY-MM-DD of that status
  detail?: string;            // the work description or the violation
  urgent?: boolean;           // a closure, a failed inspection, critical violations
  url: string;                // where a person can see it
};

/** "136-20 Roosevelt Ave, Flushing, NY 11354" → number, street core word, zip, city. */
export function parseAddress(address: string): { number: string; street: string; core: string; zip: string | null; city: string } | null {
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  const m = /^\s*(\d+(?:-\d+)?[A-Z]?)\s+(.+)$/i.exec(parts[0] ?? "");
  if (!m) return null;
  const street = m[2].toUpperCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  // the distinctive word: "ROOSEVELT" from "ROOSEVELT AVE", "MISSION" from "MISSION ST", "41" from "W 41ST ST"
  const words = street.split(" ").filter((w) => !/^(N|S|E|W|NORTH|SOUTH|EAST|WEST|ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|RD|ROAD|DR|DRIVE|LN|LANE|PL|PLACE|WAY|CT|COURT|PKWY|PARKWAY|HWY|HIGHWAY|SUITE|STE|UNIT|#.*)$/.test(w));
  const first = words[0] ?? street.split(" ")[0];
  const core = /^\d+(ST|ND|RD|TH)$/.test(first) ? first.replace(/(ST|ND|RD|TH)$/, "") : first;
  const zip = /\b(\d{5})(?:-\d{4})?\b/.exec(parts.slice(1).join(" "))?.[1] ?? null;
  const city = (parts.length >= 3 ? parts[parts.length - 2] : parts[1] ?? "").replace(/\b[A-Z]{2}\b\s*\d{5}.*$/, "").trim();
  return { number: m[1].toUpperCase(), street, core: core.replace(/'/g, ""), zip, city };
}

const NYC = /new york|nyc|manhattan|brooklyn|queens|bronx|staten island|flushing|astoria|jamaica|long island city|bayside|elmhurst|forest hills|jackson heights|sunset park|bensonhurst|williamsburg/i;
/** Which city's records apply to an address. */
export function cityOf(address: string): "nyc" | "sf" | "la" | "austin" | null {
  if (NYC.test(address) || /\bNY\s*1[01]\d{3}\b/.test(address)) return "nyc";
  if (/san francisco|\bSF\b|,\s*CA\s*941\d{2}/i.test(address)) return "sf";
  if (/los angeles|,\s*CA\s*900\d{2}/i.test(address)) return "la";
  if (/austin/i.test(address) && /\bTX\b|texas/i.test(address)) return "austin";
  return null;
}

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const q = (s: string) => encodeURIComponent(s);
const like = (s: string) => s.replace(/'/g, "''");

async function socrata(f: typeof fetch, url: string): Promise<Record<string, string>[]> {
  const res = await f(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`open data ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

/** Everything the city has published for this address in the last `days` days (newest first, at most 20). */
export async function cityRecords(address: string, o: { days?: number; f?: typeof fetch; today?: string } = {}): Promise<CityRecord[]> {
  const f = o.f ?? fetch, a = parseAddress(address), city = cityOf(address);
  if (!a || !city) return [];
  const since = new Date(Date.parse((o.today ?? new Date().toISOString().slice(0, 10)) + "T00:00:00Z") - (o.days ?? 365) * 864e5).toISOString().slice(0, 10);
  const out: CityRecord[] = [];
  if (city === "nyc") {
    const zip = a.zip ? ` AND zipcode='${a.zip}'` : "";
    const rows = await socrata(f, `https://data.cityofnewyork.us/resource/43nn-pn8j.json?$limit=40&$order=${q("inspection_date DESC")}&$where=${q(`building in ('${like(a.number)}','${like(a.number.replace(/-/g, ""))}') AND upper(street) like '%${like(a.core)}%'${zip} AND inspection_date >= '${since}'`)}`);
    // one record per inspection (the dataset has one row per violation)
    const by = new Map<string, Record<string, string>[]>();
    for (const r of rows) { const k = `${r.camis}:${day(r.inspection_date)}`; by.set(k, [...(by.get(k) ?? []), r]); }
    for (const [k, rs] of by) {
      const r = rs[0], crit = rs.filter((x) => x.critical_flag === "Critical").length;
      const closed = /closed/i.test(r.action ?? "");
      out.push({ source: "nyc_inspections", kind: "inspection", id: `nyc_inspections:${k}`, title: `Health inspection${r.dba ? ` (${r.dba})` : ""}`,
        status: r.grade ? `Grade ${r.grade}` : closed ? "Closed by the Health Department" : r.score ? `Score ${r.score}` : (r.action ?? "Inspected").slice(0, 80),
        date: day(r.grade_date) ?? day(r.inspection_date), detail: [crit && `${crit} critical violation${crit > 1 ? "s" : ""}`, rs.find((x) => x.critical_flag === "Critical")?.violation_description?.slice(0, 160)].filter(Boolean).join(": ") || undefined,
        urgent: closed || crit >= 2 || (Number(r.score) || 0) >= 28,
        url: `https://a816-health.nyc.gov/ABCEatsRestaurants/#/Search` });
    }
    const dob = await socrata(f, `https://data.cityofnewyork.us/resource/rbx6-tga4.json?$limit=20&$order=${q("approved_date DESC")}&$where=${q(`house_no in ('${like(a.number)}','${like(a.number.replace(/-/g, ""))}') AND upper(street_name) like '%${like(a.core)}%'${a.zip ? ` AND zip_code='${a.zip}'` : ""} AND approved_date >= '${since}'`)}`);
    for (const r of dob) out.push({ source: "nyc_dob", kind: "permit", id: `nyc_dob:${r.job_filing_number ?? r.tracking_number}:${r.work_type}:${r.permit_status}`,
      title: `${r.work_type ?? "Building"} permit`, status: r.permit_status ?? "Approved", date: day(r.approved_date), detail: r.job_description?.slice(0, 160),
      url: "https://a810-dobnow.nyc.gov/publish/Index.html#!/" });
  } else if (city === "sf") {
    const rows = await socrata(f, `https://data.sf.gov/resource/i98e-djp9.json?$limit=20&$order=${q("status_date DESC")}&$where=${q(`street_number='${like(a.number)}' AND upper(street_name) like '%${like(a.core)}%' AND status_date >= '${since}'`)}`);
    for (const r of rows) out.push({ source: "sf_permits", kind: "permit", id: `sf_permits:${r.permit_number}:${r.status}`, title: `${r.permit_type_definition ?? "Building"} permit`,
      status: r.status ?? "", date: day(r.status_date), detail: r.description?.slice(0, 160), url: `https://dbiweb02.sfgov.org/dbipts/default.aspx?page=Permit&PermitNumber=${q(r.permit_number ?? "")}` });
  } else if (city === "la") {
    const rows = await socrata(f, `https://data.lacity.org/resource/pi9x-tg5x.json?$limit=20&$order=${q("status_date DESC")}&$where=${q(`upper(primary_address) like '${like(a.number)} %${like(a.core)}%'${a.zip ? ` AND zip_code='${a.zip}'` : ""} AND status_date >= '${since}'`)}`);
    for (const r of rows) out.push({ source: "la_permits", kind: "permit", id: `la_permits:${r.permit_nbr}:${r.status_desc}`, title: `${r.permit_type ?? "Building"} permit`,
      status: r.status_desc ?? "", date: day(r.status_date), detail: r.work_desc?.slice(0, 160), url: "https://www.ladbsservices2.lacity.org/OnlineServices/" });
  } else if (city === "austin") {
    const rows = await socrata(f, `https://data.austintexas.gov/resource/3syk-w9eu.json?$limit=20&$order=${q("statusdate DESC")}&$where=${q(`upper(original_address1) like '${like(a.number)} %${like(a.core)}%' AND statusdate >= '${since}'`)}`);
    for (const r of rows) out.push({ source: "austin_permits", kind: "permit", id: `austin_permits:${r.permit_number}:${r.status_current}`, title: r.permit_type_desc ?? "Permit",
      status: r.status_current ?? "", date: day(r.statusdate), detail: r.description?.slice(0, 160),
      url: (r as unknown as { link?: { url?: string } }).link?.url ?? "https://abc.austintexas.gov/" });
  }
  return out.sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "")).slice(0, 20);
}
