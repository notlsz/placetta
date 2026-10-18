// What counts as an official source for the accuracy eval: a .gov, .us or .mil site, or one of the government sites that
// aren't on .gov (city and county agencies' own domains and portals). A link to a law firm, a filing service or a blog
// is never a source.
const OFFICIAL_HOSTS = /(^|\.)(sfplanning\.org|sftreasurer\.org|sfdph\.org|sf-fire\.org|sfgov\.org|ochealthinfo\.com|southernnevadahealthdistrict\.org|houstonpermittingcenter\.org|houstonhealth\.org|denvergov\.org|phila\.gov|sjpermits\.org|nvsilverflume\.gov|cityofirvine\.(org|gov)|lacity\.org|sjeconomy\.com|chicago\.gov|boston\.gov|kingcounty\.gov|cityofnewyork\.us)$/;
export const hostOf = (u?: string) => { try { return new URL(u ?? "").hostname.replace(/^www\./, ""); } catch { return ""; } };
export const officialSource = (u?: string) => { const h = hostOf(u); return !!h && (/\.(gov|mil|us)$/.test(h) || OFFICIAL_HOSTS.test(h)); };
