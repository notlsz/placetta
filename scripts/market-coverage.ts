// npm run test:markets (npm run markets:write rewrites the document): for every target market (src/forms/markets.ts), what the planner lists for a new milk tea
// shop there, and for each filing its official form or portal, whether Placetta fills the agency's own PDF, and the
// route it is sent on (supabase/functions/file/destinations.ts), with the reason for every gap. Writes
// docs/MARKET_COVERAGE.md; the test fails when:
//   - a filing in a market points at another jurisdiction's form (its registry `where` isn't the market's federal,
//     state, city or county code), or a state row lists a city or county form;
//   - a mapped form's PDF isn't on its own agency's site (the map's link and the registry's links share no domain);
//   - the document is out of date.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { previewPlan } from "../src/plan/preview";
import { formById, placesOf, type OfficialForm } from "../src/forms/registry";
import { MAPS } from "../src/forms/maps/index";
import { MARKETS, STATE_MARKETS, type Market } from "../src/forms/markets";
import { DEST, TEAM_ONLY, type Dest } from "../supabase/functions/file/destinations";

const OUT = `${process.cwd()}/docs/MARKET_COVERAGE.md`;
const check = !process.argv.includes("--write");
const TODAY = "2026-10-18";

/** Agency PDFs that exist but aren't filled by a box map, and why. */
const NOT_MAPPED: Record<string, string> = {
  "irs-ss4": "Filed online by most owners (the IRS's EIN assistant); the paper SS-4 goes to the team, which fills it with the owner's ITIN or SSN line left for them.",
  "ny-dos-1336": "dos.ny.gov refuses automated downloads, so the paper Articles of Organization (DOS-1336-f) couldn't be read; filed online on the Department of State's site.",
  "ny-dos-pub": "Two newspapers publish the notice; the Certificate of Publication (DOS-1708-f) comes from them with their affidavits.",
  "fda-ffr": "The paper Form 3537 is an encrypted PDF Placetta doesn't unlock; registration is online at FDA Industry Systems.",
  "scc-plan-check": "Santa Clara County's application PDFs didn't download (blocked); filed by email to the county.",
  "scc-health-permit": "Santa Clara County's application PDFs didn't download (blocked); filed by email to the county.",
  "ffx-bpol": "Fairfax County's BPOL application PDF now returns \"not found\".",
  "hi-llc": "Hawaii's Form LLC-1 is an encrypted PDF Placetta doesn't unlock; the same filing is made online in Hawaii Business Express.",
  "sgb-license": "San Gabriel's business license application is a scanned image with no text to place answers by; the city takes it by email after the zoning and occupancy checks.",
  "cc-business-license":"Clark County's application is filed online; its apply page builds its options in script the page text doesn't carry.",
};

const host = (u?: string) => { try { return u ? new URL(u).hostname.toLowerCase() : ""; } catch { return ""; } };
/** The site a link is on: the last two labels, or three under a state's .gov (sos.ca.gov) or a .gov.xx. */
const site = (h: string) => { const p = h.split("."); return (p.length > 2 && (/^[a-z]{2}$/.test(p.at(-2)!) || p.at(-2) === "gov") ? p.slice(-3) : p.slice(-2)).join("."); };

const channels = (d: Dest) => [d.portal && `portal (${d.portal})`, d.email && "email", d.fax && "fax", d.mail && "mail"].filter(Boolean).join(", ");
function route(f: OfficialForm | undefined): string {
  if (!f) return "Placetta team: no official form to route yet";
  const d = DEST[f.id];
  if (d?.owner) return `Owner packet: ${d.owner.why}`;
  if (d) return channels(d) + (f.fee ? " (an agency fee keeps email, fax and mail with the team)" : "");
  const t = TEAM_ONLY[f.id];
  return t ? `Placetta team: ${t.why}` : "Placetta team: not researched";
}
function formCell(f: OfficialForm | undefined): string {
  if (!f) return "none";
  const d = DEST[f.id];
  const portal = d?.portal ? ` · portal ${d.portal}` : "";
  return `\`${f.id}\` ${f.form}${MAPS[f.id] ? ` · [PDF](${MAPS[f.id].url ?? f.pdf ?? f.url})` : f.pdf ? ` · [PDF](${f.pdf})` : ""}${portal}`;
}
function gap(f: OfficialForm | undefined, generic: string): string {
  if (!f) return `The planner lists "${generic}" with no official form in the registry for this place yet.`;
  if (MAPS[f.id]) return "";
  const d = DEST[f.id];
  if (NOT_MAPPED[f.id]) return NOT_MAPPED[f.id];
  if (f.method === "insurer" || f.method === "none") return "Nothing to fill: " + f.how.en;
  if (d?.owner) return "The owner (or the person certified) does it: " + d.owner.why;
  if (f.pdf && (f.method === "online" || f.method === "portal")) return `Filed online${d?.portal ? ` (${d.portal})` : ""}, where Placetta prepares the answers summary; the agency's paper PDF isn't mapped yet.`;
  if (f.method === "online" || f.method === "portal") return `Online only${d?.portal ? ` (${d.portal})` : host(f.url) ? ` (${host(f.url)})` : ""}: Placetta prepares the answers summary for the agency's site.`;
  if (f.method === "in_person") return "Filed in person; " + (TEAM_ONLY[f.id]?.why ?? "no PDF mapped.");
  return f.pdf ? "The agency's PDF isn't mapped yet." : "No agency PDF found.";
}

type Row = { filing: string; form: OfficialForm | undefined; mapped: boolean; route: string; gap: string };
const problems: string[] = [];
function rowsFor(m: Market): Row[] {
  const p = previewPlan("Milk tea shop", m.address, "2027-03-01", { today: TODAY });
  const out: Row[] = [];
  for (const a of p.apps) {
    const f = a.official ? formById(a.official) : undefined;
    if (m.kind === "state" && (f ? !["federal", "state"].includes(f.level) : a.level !== "federal" && a.level !== "state")) continue;
    if (f && !m.allowed.includes(f.where)) problems.push(`${m.name}: ${f.id} is ${f.where}'s form, not this market's (${m.allowed.join(", ")})`);
    if (f && MAPS[f.id]) {
      const own = [f.url, f.pdf, f.info].map(host).filter(Boolean).map(site);
      const link = MAPS[f.id].url ?? f.pdf ?? f.url, mapSite = site(host(link));
      if (!mapSite || !own.includes(mapSite)) problems.push(`${m.name}: ${f.id}'s mapped PDF (${link}) isn't on the agency's own site (${[...new Set(own)].join(", ")})`);
    }
    out.push({ filing: a.name.en, form: f, mapped: !!(f && MAPS[f.id]), route: route(f), gap: gap(f, a.name.en) });
  }
  return out;
}

// The jurisdiction rules the markets rest on, checked directly: a Las Vegas mailing address on the Strip is Clark
// County's, not the City of Las Vegas's; a city address keeps both licenses for Odelia to confirm; Glendale's and San
// Gabriel's food permits are Los Angeles County's; Rockville's are Montgomery County's.
const places = (a: string) => placesOf(a);
const expect = (ok: boolean, what: string) => { if (!ok) problems.push(`jurisdiction rule: ${what}`); };
expect(!places("3570 S Las Vegas Blvd, Las Vegas, NV 89109").includes("LVC") && places("3570 S Las Vegas Blvd, Las Vegas, NV 89109").includes("CCU"), "the Strip (89109) is unincorporated Clark County");
expect(places("495 S Main St, Las Vegas, NV 89101").includes("LVC"), "downtown Las Vegas keeps the city's license");
expect(!places("240 S Water St, Henderson, NV 89015").includes("LVC"), "Henderson isn't the City of Las Vegas");
expect(places("100 W Broadway, Glendale, CA 91210").includes("LAC") && !places("5850 W Glendale Ave, Glendale, AZ 85301").includes("LAC"), "Glendale, CA (not AZ) is in Los Angeles County");
expect(places("1066 Rockville Pike, Rockville, MD 20852").includes("MOCO") && !places("1066 Rockville Pike, Rockville, MD 20852").includes("CA"), "Rockville is Montgomery County, Maryland");
expect(!places("727 N Broadway, Los Angeles, CA 90012").includes("LACU"), "the City of Los Angeles isn't unincorporated county");
// And the check itself: a downtown Las Vegas plan read as if it were the Strip must be caught pointing at the City of
// Las Vegas's license.
{
  const before = problems.length;
  rowsFor({ id: "self-test", name: "self-test", kind: "city", state: "NV", address: "495 S Main St, Las Vegas, NV 89101", allowed: ["US", "NV", "LV", "CCU"] });
  const caught = problems.splice(before).some((p) => p.includes("lv-license is LVC's form"));
  expect(caught, "the check catches a filing on another jurisdiction's form");
}

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const lines: string[] = [
  "# Market coverage",
  "",
  "Generated by `npm run markets:write` (scripts/market-coverage.ts; `npm run test:markets` checks it) from the planner (src/plan/preview.ts), the forms registry and its box maps (src/forms), and the filing routes (supabase/functions/file/destinations.ts). Don't edit it by hand.",
  "",
  "Each market is read at a sample storefront address for a new milk tea shop with staff and a build-out, the way a new workspace's plan is made. For each filing the plan lists: the official form (or the agency's portal when it's online only), whether Placetta fills the agency's own PDF (a box map), and the route it goes on. The check fails if a filing points at another jurisdiction's form.",
  "",
];
const all = [...MARKETS, ...STATE_MARKETS];
const tables = all.map((m) => ({ m, rows: rowsFor(m) }));
const sum = (rs: Row[]) => {
  const forms = rs.filter((r) => r.form), pdf = forms.filter((r) => r.mapped).length;
  const routed = forms.filter((r) => DEST[r.form!.id]).length;
  return { n: rs.length, forms: forms.length, generic: rs.length - forms.length, pdf, routed };
};
lines.push("## Summary", "", "| Market | Filings | With an official form | Agency PDF filled | With a route | No form yet |", "|---|---:|---:|---:|---:|---:|");
for (const { m, rows } of tables) { const s = sum(rows); lines.push(`| ${m.kind === "city" && m.rank ? `${m.rank}. ` : ""}${m.name} | ${s.n} | ${s.forms} | ${s.pdf} | ${s.routed} | ${s.generic} |`); }
lines.push("");
for (const { m, rows } of tables) {
  lines.push(`## ${m.kind === "city" ? (m.rank ? `${m.rank}. ` : "") + m.name : `${m.name} (state filings)`}`, "", `Read at ${m.address}. Jurisdictions: ${m.allowed.join(", ")}.${m.note ? " " + m.note : ""}`, "");
  lines.push("| Filing | Official form or portal | Agency PDF filled | Route | Gap |", "|---|---|---|---|---|");
  for (const r of rows) lines.push(`| ${esc(r.filing)} | ${esc(formCell(r.form))} | ${r.mapped ? "yes" : "no"} | ${esc(r.route)} | ${esc(r.gap)} |`);
  lines.push("");
}
const md = lines.join("\n");

if (check) {
  if ((existsSync(OUT) ? readFileSync(OUT, "utf8") : "") !== md) problems.push("docs/MARKET_COVERAGE.md is out of date: run npm run markets:write and commit it");
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
  console.log(`market coverage: ${all.length} markets, every filing on its own jurisdiction's form`);
} else {
  if (problems.length) console.error(problems.join("\n"));
  writeFileSync(OUT, md);
  console.log(`wrote docs/MARKET_COVERAGE.md (${problems.length} problems)`);
  if (problems.length) process.exit(1);
}
