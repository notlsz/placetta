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
// Added 2026-10-21 with the European and Mexican store filings (src/forms/europe.ts, src/forms/mexico.ts): each a
// national, state or city government's own site, or a public body the law charges with the filing (Urssaf, INPS, the
// Berufsgenossenschaften's DGUV, the Chambers of Commerce' registers).
const ABROAD = new RegExp("(^|\\.)(" + [
  "europa\\.eu", "gov\\.uk", "gouv\\.fr", "service-public\\.fr", "paris\\.fr", "lyon\\.fr", "urssaf\\.fr",
  "berlin\\.de", "elster\\.de", "arbeitsagentur\\.de", "dguv\\.de", "handelsregister\\.de", "transparenzregister\\.de", "zoll\\.de", "muenchen\\.de", "hamburg\\.de", "frankfurt\\.de", "bund\\.de",
  "gov\\.it", "comune\\.milano\\.it", "comune\\.roma\\.it", "registroimprese\\.it", "inps\\.it", "vigilfuoco\\.it",
  "gob\\.es", "madrid\\.es", "barcelona\\.cat", "seg-social\\.es", "paeelectronico\\.es",
  "overheid\\.nl", "business\\.gov\\.nl", "kvk\\.nl", "belastingdienst\\.nl", "amsterdam\\.nl", "rotterdam\\.nl", "nvwa\\.nl", "rijksoverheid\\.nl",
  "gov\\.ie", "revenue\\.ie", "cro\\.ie", "fsai\\.ie", "dublincity\\.ie", "corkcity\\.ie",
  "belgium\\.be", "fgov\\.be", "brussels\\.be", "bruxelles\\.be", "antwerpen\\.be", "afsca\\.be", "favv-afsca\\.be",
  "gov\\.pt", "cm-lisboa\\.pt", "cm-porto\\.pt",
  "admin\\.ch", "easygov\\.swiss", "stadt-zuerich\\.ch", "bern\\.ch", "zh\\.ch", "be\\.ch",
  "gv\\.at", "wien\\.gv\\.at", "graz\\.at",
  "verksamt\\.se", "skatteverket\\.se", "bolagsverket\\.se", "stockholm\\.se", "goteborg\\.se", "livsmedelsverket\\.se",
  "virk\\.dk", "skat\\.dk", "kk\\.dk", "aarhus\\.dk", "foedevarestyrelsen\\.dk",
  "altinn\\.no", "brreg\\.no", "skatteetaten\\.no", "oslo\\.kommune\\.no", "bergen\\.kommune\\.no", "mattilsynet\\.no",
  "gob\\.mx", "cdmx\\.gob\\.mx", "monterrey\\.gob\\.mx", "guadalajara\\.gob\\.mx", "qroo\\.gob\\.mx", "cancun\\.gob\\.mx", "nl\\.gob\\.mx", "jalisco\\.gob\\.mx",
  // added 2026-10-22 with the coverage audit (src/forms/intl.ts, src/forms/us-gaps.ts), each fetched that day: Canada's
  // federal, Ontario's, British Columbia's and the two cities' own sites, the provinces' workers' compensation boards and
  // Ontario's liquor regulator; Florida's Department of Financial Services (myfloridacfo.com); and the national registries
  // and tax authorities of the South American, Southeast Asian and African countries added (the Bogotá chamber of
  // commerce keeps Colombia's public commercial register by law)
  "canada\\.ca", "gc\\.ca", "ontario\\.ca", "toronto\\.ca", "wsib\\.ca", "agco\\.ca", "gov\\.bc\\.ca", "worksafebc\\.com", "vch\\.ca", "vancouver\\.ca",
  "myfloridacfo\\.com",
  // added 2026-10-22 with the finishing pass (src/forms/finish.ts), each fetched that day: the City of Stockholm's own
  // top-level domain (.stockholm, run by the city), the Danish Business Authority, Finland's registries and cities
  "stockholm", "erhvervsstyrelsen\\.dk", "prh\\.fi", "vero\\.fi", "ytj\\.fi", "suomi\\.fi", "hel\\.fi",
  // Poland's government domain (biznes.gov.pl, gunb.gov.pl) and the City of Warsaw's service portal; Belgium's social
  // security portal; Portugal's social security
  // China's government domain (the State Council's gov.cn, the ministries' and every city's own gov.cn sites)
  "gov\\.cn",
  // the UAE federal government's portal (u.ae) and the federal and emirate governments' gov.ae sites; Türkiye's gov.tr
  // and the Istanbul Metropolitan Municipality's own domain; Saudi Arabia's and Qatar's government domains
  // Québec's government portal and ministries, Revenu Québec, and the City of Montréal
  "quebec\\.ca", "gouv\\.qc\\.ca", "revenuquebec\\.ca", "montreal\\.ca",
  "u\\.ae", "gov\\.ae", "gov\\.tr", "bel\\.tr", "ibb\\.istanbul", "gov\\.sa", "gov\\.qa",
  // Germany's federal law site (the Federal Ministry of Justice's gesetze-im-internet.de)
  "gesetze-im-internet\\.de",
  "gov\\.pl", "warszawa19115\\.pl", "um\\.warszawa\\.pl", "socialsecurity\\.be", "seg-social\\.pt",
  "gov\\.br", "sii\\.cl", "registrodeempresasysociedades\\.cl", "dian\\.gov\\.co", "ccb\\.org\\.co", "argentina\\.gob\\.ar", "arca\\.gob\\.ar", "sunat\\.gob\\.pe", "gob\\.pe",
  "gov\\.sg", "ssm\\.com\\.my", "gov\\.my", "go\\.th", "gov\\.vn", "go\\.id", "gov\\.ph", "gov\\.ng", "go\\.ke", "cipc\\.co\\.za", "gov\\.za", "gov\\.ma", "gov\\.eg",
].join("|") + ")$");
const OFFICIAL_PATHS: [RegExp, RegExp][] = [[/^content\.civicplus\.com$/, /^\/api\/assets\//], [/^cms2\.revize\.com$/, /^\/revize\/edisonnj\//]];
export const hostOf = (u?: string) => { try { return new URL(u ?? "").hostname.replace(/^www\d?\./, ""); } catch { return ""; } };
export const officialSource = (u?: string) => {
  const h = hostOf(u);
  if (!h) return false;
  if (/\.(gov|mil|us)$/.test(h) || OFFICIAL_HOSTS.test(h) || ABROAD.test(h)) return true;
  const path = (() => { try { return new URL(u!).pathname; } catch { return ""; } })();
  return OFFICIAL_PATHS.some(([hr, pr]) => hr.test(h) && pr.test(path));
};
