// What counts as an official source for the accuracy eval: a .gov, .us or .mil site, or one of the government sites that
// aren't on .gov (city and county agencies' own domains and portals). A link to a law firm, a filing service or a blog
// is never a source. Two content hosts serve documents the government itself published, and count only on the paths
// that hold that government's files: CivicPlus's asset store (Plano's PDFs) and Revize's document center (Edison's).
const OFFICIAL_HOSTS = /(^|\.)(sfplanning\.org|sftreasurer\.org|sfdph\.org|sf-fire\.org|sfgov\.org|ochealthinfo\.com|southernnevadahealthdistrict\.org|houstonpermittingcenter\.org|houstonhealth\.org|denvergov\.org|phila\.gov|sjpermits\.org|nvsilverflume\.gov|cityofirvine\.(org|gov)|lacity\.org|sjeconomy\.com|chicago\.gov|boston\.gov|kingcounty\.gov|cityofnewyork\.us|dalycity\.org|duluthga\.net|cityofhenderson\.com|fortleenj\.org|gnrhealth\.com|smchealth\.org|acgov\.org|edisonnj\.org|njoag\.gov|myfloridalicense\.com|cityofsanmateo\.org)$/;
const OFFICIAL_PATHS: [RegExp, RegExp][] = [[/^content\.civicplus\.com$/, /^\/api\/assets\//], [/^cms2\.revize\.com$/, /^\/revize\/edisonnj\//]];
export const hostOf = (u?: string) => { try { return new URL(u ?? "").hostname.replace(/^www\d?\./, ""); } catch { return ""; } };
export const officialSource = (u?: string) => {
  const h = hostOf(u);
  if (!h) return false;
  if (/\.(gov|mil|us)$/.test(h) || OFFICIAL_HOSTS.test(h)) return true;
  const path = (() => { try { return new URL(u!).pathname; } catch { return ""; } })();
  return OFFICIAL_PATHS.some(([hr, pr]) => hr.test(h) && pr.test(path));
};
