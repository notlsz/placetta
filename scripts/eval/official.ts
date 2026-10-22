// What counts as an official source for the accuracy eval: a .gov, .us or .mil site, or one of the government sites that
// aren't on .gov (city and county agencies' own domains and portals). A link to a law firm, a filing service or a blog
// is never a source. Two content hosts serve documents the government itself published, and count only on the paths
// that hold that government's files: CivicPlus's asset store (Plano's PDFs) and Revize's document center (Edison's).
// Added 2026-10-21, each fetched that day and naming its agency as owner: dallascityhall.com ("Welcome to the City of
// Dallas, Texas"), lafd.org ("© Los Angeles Fire Department"), octaxcol.com ("© 2026 Orange County Tax Collector"),
// floridarevenue.com ("Florida Department of Revenue, 5050 West Tennessee Street, Tallahassee"), and
// cookcountypublichealth.org ("Copyright © Cook County Department of Public Health").
const OFFICIAL_HOSTS = /(^|\.)(dallascityhall\.com|lafd\.org|octaxcol\.com|floridarevenue\.com|cookcountypublichealth\.org|sfplanning\.org|sftreasurer\.org|sfdph\.org|sf-fire\.org|sfgov\.org|ochealthinfo\.com|southernnevadahealthdistrict\.org|houstonpermittingcenter\.org|houstonhealth\.org|denvergov\.org|phila\.gov|sjpermits\.org|nvsilverflume\.gov|cityofirvine\.(org|gov)|lacity\.org|sjeconomy\.com|chicago\.gov|boston\.gov|kingcounty\.gov|cityofnewyork\.us|dalycity\.org|duluthga\.net|cityofhenderson\.com|fortleenj\.org|gnrhealth\.com|smchealth\.org|acgov\.org|edisonnj\.org|njoag\.gov|myfloridalicense\.com|cityofsanmateo\.org|sangabrielcity\.com)$/;
// Abroad (added 2026-10-21 for the furniture set's EU and UK cases): the European Union's own domain (europa.eu: the
// Commission, EUR-Lex), the UK government's (gov.uk, legislation.gov.uk) and France's (gouv.fr), each reserved to that
// government.
const ABROAD = /(^|\.)(europa\.eu|gov\.uk|gouv\.fr)$/;
const OFFICIAL_PATHS: [RegExp, RegExp][] = [[/^content\.civicplus\.com$/, /^\/api\/assets\//], [/^cms2\.revize\.com$/, /^\/revize\/edisonnj\//]];
export const hostOf = (u?: string) => { try { return new URL(u ?? "").hostname.replace(/^www\d?\./, ""); } catch { return ""; } };
export const officialSource = (u?: string) => {
  const h = hostOf(u);
  if (!h) return false;
  if (/\.(gov|mil|us)$/.test(h) || OFFICIAL_HOSTS.test(h) || ABROAD.test(h)) return true;
  const path = (() => { try { return new URL(u!).pathname; } catch { return ""; } })();
  return OFFICIAL_PATHS.some(([hr, pr]) => hr.test(h) && pr.test(path));
};
