// The instant plan a new workspace starts with: every license, permit and registration Placetta's own registry knows
// for this kind of business in this place, in the order the agencies want them, with each one's agency, fee, usual
// time, official source and the form's own lines, empty. No model is called: this runs in the browser the moment the
// person presses Start, so the first screen already shows the plan. Each row is marked preview; Odelia verifies it
// against the agency's current source when the plan starts (src/live.ts), keeping the ids.
// Pure functions: Root.tsx writes the result into the new workspace; the tests call it directly.
import { B, same, type Bi } from "../bi";
import { YOURS } from "../core";
import { formsEntity as formsEntityFor, formsFor, placeInfo, placesOf, segmentOf, selfStep, type OfficialForm, type Segment, type Where } from "../forms/registry";
import { usPlace } from "../forms/usplace";
import { FURNITURE_KINDS, SECTOR_KINDS, kindFactsAt, kindsOf, type KindFact, type StoreKind } from "../forms/kinds";
import { FURNITURE, furnitureNeeds } from "../forms/furniture";
import { sectorNeeds } from "../forms/sectors";
import { FOOD_PERMITTER, MUNICIPAL_BUILDING, proofCurrent, whoToAsk, type Src } from "./ask";
import type { Application, CheckItem, Deadline, Field, Level, Store, Workspace } from "../model";
import { publishedDays } from "../plan";
import { openingPath } from "../smart";
import { daysFromNow } from "../time";
import { nextRenewal, PROJECTED_RENEWAL, renewalCycle } from "../renewal";
import { alsoFor, haveOf, type AlsoRow } from "./also";
import type { Have } from "../forms/lifecycle";

export type PreviewOptions = {
  entity?: string;          // the legal entity, if it exists already (then no formation step)
  /** where that entity was formed: a two-letter state, or "abroad" (a company from another country). A company formed
   *  in another state or abroad registers here (foreign qualification) instead of forming again (src/forms/entities.ts). */
  formedIn?: string;
  /** the company is (or will be) a corporation, not an LLC: its formation or registration is the corporation's. Read
   *  from the entity's name ("Inc.", "Corp.") when not given. */
  corp?: boolean;
  employees?: boolean;      // hires staff (default yes)
  signage?: boolean;        // puts up a sign (default yes)
  buildout?: boolean;       // builds out the space (default yes)
  imports?: boolean;        // imports the goods it sells (default: read from what it is, "importer", "进口")
  alcohol?: boolean;        // sells beer, wine or spirits (default: read from what it is)
  terrace?: boolean;        // puts tables outside (default: read from what it is)
  // the intake's answers (src/plan/intake.ts), each one only when asked; otherwise read from what it is
  manufactures?: boolean;   // makes what it sells
  online?: boolean;         // sells online
  upholstered?: boolean;    // furniture: sells upholstered pieces
  children?: boolean;       // makes or sells products for children 12 or younger
  today?: string;           // YYYY-MM-DD, for tests
  storeId?: string;         // the store the rows belong to, for the projected opening
};
export type PreviewPlan = {
  apps: Application[];
  deadlines: Deadline[];
  projectedOpen: string | null;          // where the chain of permits puts the opening, counted from today
  segment: Segment;
  food: boolean;
  country: string;                       // ISO country, "US" for a US city
  places: Where[];                       // the registry's jurisdictions for the place
  local: boolean;                        // the city has its own local steps in the registry
  fromRegistry: number;                  // rows from the forms library
  generic: number;                       // rows from the generic path (a place the library doesn't cover yet)
  abstained: number;                     // rows that claim nothing and name who to ask (src/plan/ask.ts)
  conflicts: string[];                   // steps two sources disagree on, abstained rather than picked
  layers: Record<Level, number>;
  fees: number;                          // the fees the registry publishes, added up
  varies: number;                        // rows whose fee the agency sets
  kinds: StoreKind[];                    // the kinds of business the words name: food, or furniture (src/forms/kinds.ts)
  facts: PlanFact[];                     // what an official page says differs for those kinds here, each quoted and current
  withheld: string[];                    // facts for this place and kind whose quote isn't current: not stated (fail closed)
  have: Have;                            // what the business does, for the lifecycle's triggers (src/forms/lifecycle.ts)
  also: AlsoRow[];                       // beyond the permits: conditional filings, labels, workplace rules, what an agency decides (src/plan/also.ts)
};
/** A fact about this kind of business here, as the plan states it: only with a current quote from its official page. */
export type PlanFact = { id: string; kinds: StoreKind[]; title: Bi; text: Bi; agency: Bi; level: Level; app?: string; source: { label: string; url: string; quote: string; checked: string } };

/* --------------------------------------------------------------- the US states */

type StateRow = { en: string; zh: string; tax?: [string, string, string]; taxName?: [string, string] };
/** Every state's sales tax agency (none where there is no state sales tax), with its official site. */
const STATES: Record<string, StateRow> = {
  AL: { en: "Alabama", zh: "阿拉巴马州", tax: ["Alabama Department of Revenue", "阿拉巴马州税务局", "https://www.revenue.alabama.gov"] },
  AK: { en: "Alaska", zh: "阿拉斯加州" },
  AZ: { en: "Arizona", zh: "亚利桑那州", tax: ["Arizona Department of Revenue", "亚利桑那州税务局", "https://azdor.gov"] },
  AR: { en: "Arkansas", zh: "阿肯色州", tax: ["Arkansas Department of Finance and Administration", "阿肯色州财政与行政部", "https://www.dfa.arkansas.gov"] },
  CA: { en: "California", zh: "加州", tax: ["California Department of Tax and Fee Administration", "加州税费管理局", "https://www.cdtfa.ca.gov"] },
  CO: { en: "Colorado", zh: "科罗拉多州", tax: ["Colorado Department of Revenue", "科罗拉多州税务局", "https://tax.colorado.gov"] },
  CT: { en: "Connecticut", zh: "康涅狄格州", tax: ["Connecticut Department of Revenue Services", "康涅狄格州税务局", "https://portal.ct.gov/drs"] },
  DE: { en: "Delaware", zh: "特拉华州", tax: ["Delaware Division of Revenue", "特拉华州税务处", "https://revenue.delaware.gov"], taxName: ["Delaware state business license", "特拉华州营业执照"] },
  DC: { en: "District of Columbia", zh: "华盛顿特区", tax: ["DC Office of Tax and Revenue", "华盛顿特区税务局", "https://otr.cfo.dc.gov"] },
  FL: { en: "Florida", zh: "佛罗里达州", tax: ["Florida Department of Revenue", "佛罗里达州税务局", "https://floridarevenue.com"] },
  GA: { en: "Georgia", zh: "佐治亚州", tax: ["Georgia Department of Revenue", "佐治亚州税务局", "https://dor.georgia.gov"] },
  HI: { en: "Hawaii", zh: "夏威夷州", tax: ["Hawaii Department of Taxation", "夏威夷州税务局", "https://tax.hawaii.gov"], taxName: ["General excise tax license", "一般消费税执照"] },
  ID: { en: "Idaho", zh: "爱达荷州", tax: ["Idaho State Tax Commission", "爱达荷州税务委员会", "https://tax.idaho.gov"] },
  IL: { en: "Illinois", zh: "伊利诺伊州", tax: ["Illinois Department of Revenue", "伊利诺伊州税务局", "https://tax.illinois.gov"] },
  IN: { en: "Indiana", zh: "印第安纳州", tax: ["Indiana Department of Revenue", "印第安纳州税务局", "https://www.in.gov/dor"] },
  IA: { en: "Iowa", zh: "艾奥瓦州", tax: ["Iowa Department of Revenue", "艾奥瓦州税务局", "https://tax.iowa.gov"] },
  KS: { en: "Kansas", zh: "堪萨斯州", tax: ["Kansas Department of Revenue", "堪萨斯州税务局", "https://www.ksrevenue.gov"] },
  KY: { en: "Kentucky", zh: "肯塔基州", tax: ["Kentucky Department of Revenue", "肯塔基州税务局", "https://revenue.ky.gov"] },
  LA: { en: "Louisiana", zh: "路易斯安那州", tax: ["Louisiana Department of Revenue", "路易斯安那州税务局", "https://revenue.louisiana.gov"] },
  ME: { en: "Maine", zh: "缅因州", tax: ["Maine Revenue Services", "缅因州税务局", "https://www.maine.gov/revenue"] },
  MD: { en: "Maryland", zh: "马里兰州", tax: ["Comptroller of Maryland", "马里兰州审计长办公室", "https://www.marylandtaxes.gov"] },
  MA: { en: "Massachusetts", zh: "马萨诸塞州", tax: ["Massachusetts Department of Revenue", "马萨诸塞州税务局", "https://www.mass.gov/orgs/massachusetts-department-of-revenue"] },
  MI: { en: "Michigan", zh: "密歇根州", tax: ["Michigan Department of Treasury", "密歇根州财政部", "https://www.michigan.gov/treasury"] },
  MN: { en: "Minnesota", zh: "明尼苏达州", tax: ["Minnesota Department of Revenue", "明尼苏达州税务局", "https://www.revenue.state.mn.us"] },
  MS: { en: "Mississippi", zh: "密西西比州", tax: ["Mississippi Department of Revenue", "密西西比州税务局", "https://www.dor.ms.gov"] },
  MO: { en: "Missouri", zh: "密苏里州", tax: ["Missouri Department of Revenue", "密苏里州税务局", "https://dor.mo.gov"] },
  MT: { en: "Montana", zh: "蒙大拿州" },
  NE: { en: "Nebraska", zh: "内布拉斯加州", tax: ["Nebraska Department of Revenue", "内布拉斯加州税务局", "https://revenue.nebraska.gov"] },
  NV: { en: "Nevada", zh: "内华达州", tax: ["Nevada Department of Taxation", "内华达州税务局", "https://tax.nv.gov"] },
  NH: { en: "New Hampshire", zh: "新罕布什尔州" },
  NJ: { en: "New Jersey", zh: "新泽西州", tax: ["New Jersey Division of Taxation", "新泽西州税务处", "https://www.nj.gov/treasury/taxation"] },
  NM: { en: "New Mexico", zh: "新墨西哥州", tax: ["New Mexico Taxation and Revenue Department", "新墨西哥州税务局", "https://www.tax.newmexico.gov"], taxName: ["Gross receipts tax registration", "总收入税登记"] },
  NY: { en: "New York", zh: "纽约州", tax: ["New York State Department of Taxation and Finance", "纽约州税务与财政局", "https://www.tax.ny.gov"] },
  NC: { en: "North Carolina", zh: "北卡罗来纳州", tax: ["North Carolina Department of Revenue", "北卡罗来纳州税务局", "https://www.ncdor.gov"] },
  ND: { en: "North Dakota", zh: "北达科他州", tax: ["North Dakota Office of State Tax Commissioner", "北达科他州税务专员办公室", "https://www.tax.nd.gov"] },
  OH: { en: "Ohio", zh: "俄亥俄州", tax: ["Ohio Department of Taxation", "俄亥俄州税务局", "https://tax.ohio.gov"] },
  OK: { en: "Oklahoma", zh: "俄克拉荷马州", tax: ["Oklahoma Tax Commission", "俄克拉荷马州税务委员会", "https://oklahoma.gov/tax.html"] },
  OR: { en: "Oregon", zh: "俄勒冈州" },
  PA: { en: "Pennsylvania", zh: "宾夕法尼亚州", tax: ["Pennsylvania Department of Revenue", "宾夕法尼亚州税务局", "https://www.revenue.pa.gov"] },
  RI: { en: "Rhode Island", zh: "罗德岛州", tax: ["Rhode Island Division of Taxation", "罗德岛州税务处", "https://tax.ri.gov"] },
  SC: { en: "South Carolina", zh: "南卡罗来纳州", tax: ["South Carolina Department of Revenue", "南卡罗来纳州税务局", "https://dor.sc.gov"] },
  SD: { en: "South Dakota", zh: "南达科他州", tax: ["South Dakota Department of Revenue", "南达科他州税务局", "https://dor.sd.gov"] },
  TN: { en: "Tennessee", zh: "田纳西州", tax: ["Tennessee Department of Revenue", "田纳西州税务局", "https://www.tn.gov/revenue"] },
  TX: { en: "Texas", zh: "德州", tax: ["Texas Comptroller of Public Accounts", "德州审计长办公室", "https://comptroller.texas.gov"] },
  UT: { en: "Utah", zh: "犹他州", tax: ["Utah State Tax Commission", "犹他州税务委员会", "https://tax.utah.gov"] },
  VT: { en: "Vermont", zh: "佛蒙特州", tax: ["Vermont Department of Taxes", "佛蒙特州税务局", "https://tax.vermont.gov"] },
  VA: { en: "Virginia", zh: "弗吉尼亚州", tax: ["Virginia Department of Taxation", "弗吉尼亚州税务局", "https://www.tax.virginia.gov"] },
  WA: { en: "Washington", zh: "华盛顿州", tax: ["Washington Department of Revenue", "华盛顿州税务局", "https://dor.wa.gov"] },
  WV: { en: "West Virginia", zh: "西弗吉尼亚州", tax: ["West Virginia Tax Division", "西弗吉尼亚州税务处", "https://tax.wv.gov"] },
  WI: { en: "Wisconsin", zh: "威斯康星州", tax: ["Wisconsin Department of Revenue", "威斯康星州税务局", "https://www.revenue.wi.gov"] },
  WY: { en: "Wyoming", zh: "怀俄明州", tax: ["Wyoming Department of Revenue", "怀俄明州税务局", "https://revenue.wyo.gov"] },
};

/** A state's name and, where it has a sales tax, the agency that registers sellers, with its official site. */
export function stateAgency(code: string): { en: string; zh: string; url: string; state: string; stateZh: string } | undefined {
  const st = STATES[code.toUpperCase()];
  return st?.tax ? { en: st.tax[0], zh: st.tax[1], url: st.tax[2], state: st.en, stateZh: st.zh } : undefined;
}

/** The two-letter state in "Flushing, NY", "Columbus, Ohio 43215" or "俄亥俄州哥伦布". */
export function stateOf(where: string): string | undefined {
  const t = where.trim();
  const m = /,\s*([A-Za-z]{2})\.?(\s+\d{5}(-\d{4})?)?\s*$/.exec(t);
  if (m && STATES[m[1].toUpperCase()]) return m[1].toUpperCase();
  const w = t.toLowerCase();
  if (/district of columbia|washington,?\s*d\.?c\b|华盛顿特区/.test(w)) return "DC";
  for (const [code, s] of Object.entries(STATES)) if (code !== "DC" && (new RegExp(`\\b${s.en.toLowerCase()}\\b`).test(w) || t.includes(s.zh))) return code;
  return undefined;
}
/** The city in "Flushing, NY 11354" or "100 W Main St, Alhambra, CA 91801" (never the street). */
const cityOf = (where: string) => { const c = usPlace(where).city; if (c) return c; const first = where.split(",")[0].replace(/\d{5}(-\d{4})?/g, "").trim(); return /^\d/.test(first) ? "" : first; };

/* --------------------------------------------------------------- the rows */

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const BUFFER = 7;            // a week to gather documents and fix what the agency bounces, as in src/plan.ts
const AFTER_OPENING = 88;    // library order from which forms are yearly taxes and reports, not steps to open
const FEE_SET = B("Set by the agency's fee schedule. Odelia confirms it before you pay.", "按机构收费标准计算，付款前 Odelia 会确认。");
const FEE_PUB = B("The agency's published fee. Odelia confirms it before you pay.", "机构公布的费用，付款前 Odelia 会确认。");
const NO_TIME = B("The agency doesn't publish a processing time. Placetta tracks it from the day it's filed.", "机构未公布办理时间。快哉从提交之日起跟踪。");
const CONFIRMS = B("Odelia confirms the time with the agency", "Odelia 向机构核实办理时间");
// The generic rows' sources, each with the sentence read on it on 2026-10-18 (scripts/eval/proof-log.json)
const READ = "2026-10-18";
const SRC_DOL = { label: "oui.doleta.gov", url: "https://oui.doleta.gov/unemploy/agencies.asp", quote: "Contacts for State UI Tax Information and Assistance", checked: READ };
const SRC_SBA = { label: "sba.gov", url: "https://www.sba.gov/counseling/launch-your-business/", quote: "You’ll need to register your business, pay taxes, and get licenses and permits in the place you choose to locate your business.", checked: READ };
/** California's plan approval rule (Health and Safety Code 114380), as Los Angeles County's page quotes it: statewide. */
const SRC_CA_PLAN = { label: "publichealth.lacounty.gov", url: "https://admin.publichealth.lacounty.gov/eh/inspection/construction-requirements-retail-food-facilities.htm", quote: "shall receive plan approval before starting any new construction or remodeling of any facility for use as a retail food", checked: READ };
/** Alameda County's plan check guide: the other local agencies a California build-out goes through. */
const SRC_CA_LOCAL = { label: "health.alamedacountyca.gov", url: "https://health.alamedacountyca.gov/alameda-county-plan-check-guide-for-retail-food-facilities/", quote: "Other agencies including local building, fire, zoning and sanitation districts may have jurisdiction over various aspects of a project.", checked: READ };
/** Los Angeles County: the city's building and safety office approves a food facility's plans after the county. */
const SRC_LAC_BUILDING = { label: "publichealth.lacounty.gov", url: "https://admin.publichealth.lacounty.gov/eh/inspection/how-to-obtain-restaurant-food-facility-permit.htm", quote: "then submit the plans to your local building and safety office for approval.", checked: READ };
/** Who licenses alcohol where the state's own license isn't in the library: named, so the row says whose page Odelia reads. */
const ALCOHOL_AGENCY: Record<string, [string, string]> = {
  IL: ["the Illinois Liquor Control Commission, after the local liquor control commissioner", "伊利诺伊州酒类管理委员会（须先取得地方酒类管理专员许可）"],
  NV: ["the city or county liquor licensing office (Nevada licenses alcohol locally)", "所在市或县的酒类执照办公室（内华达州由地方发放酒类执照）"],
  MD: ["the county Board of License Commissioners (liquor board)", "所在县酒类执照委员会"],
  NY: ["the New York State Liquor Authority", "纽约州酒类管理局"],
  AZ: ["the Arizona Department of Liquor Licenses and Control", "亚利桑那州酒类执照与管制局"],
  HI: ["the county liquor commission (the Honolulu Liquor Commission on Oahu)", "所在县酒类委员会（瓦胡岛为檀香山酒类委员会）"],
};
/** The state agency that opens the unemployment insurance account, where the library has no form for it. */
const EMPLOYER_AGENCY: Record<string, [string, string]> = { UT: ["Utah Department of Workforce Services", "犹他州劳动力服务局"] };
/** Who forms a company where it isn't the Secretary of State (the generic formation row names it). */
const FORMATION_AGENCY: Record<string, [string, string]> = {
  DC: ["District of Columbia Department of Licensing and Consumer Protection, Corporations Division", "华盛顿特区许可与消费者保护局公司处"],
  AZ: ["Arizona Corporation Commission", "亚利桑那州公司委员会"], VA: ["Virginia State Corporation Commission", "弗吉尼亚州公司委员会"],
  MD: ["Maryland State Department of Assessments and Taxation", "马里兰州评估与税务局"], HI: ["Hawaii Department of Commerce and Consumer Affairs, Business Registration Division", "夏威夷州商业与消费者事务部企业登记处"],
  UT: ["Utah Division of Corporations and Commercial Code", "犹他州公司与商业法典处"], NJ: ["New Jersey Division of Revenue and Enterprise Services", "新泽西州税务与企业服务处"],
  NY: ["New York Department of State, Division of Corporations", "纽约州州务厅公司处"], PA: ["Pennsylvania Department of State", "宾夕法尼亚州州务厅"],
  MA: ["Massachusetts Secretary of the Commonwealth, Corporations Division", "马萨诸塞州联邦秘书公司处"], FL: ["Florida Department of State, Division of Corporations", "佛罗里达州州务厅公司处"],
  OR: ["Oregon Secretary of State, Corporation Division", "俄勒冈州州务卿公司处"],
};
const confirm = (en: string, zh: string) => B(`We'll confirm with ${en}`, `我们会向${zh}核实`);
/** What a state calls the permit that lets a food place open, where its own term differs from the generic one. */
const FOOD_PERMIT_NAME: Record<string, [string, string]> = {
  MA: ["Food establishment permit", "食品经营场所许可证"], TX: ["Retail food establishment permit", "零售食品经营场所许可证"], NJ: ["Retail food establishment license", "零售食品经营场所执照"],
};
/** The generic rows' sources, for the proof check (scripts/eval/proof.ts). */
export const GENERIC_SOURCES = [SRC_DOL, SRC_SBA, SRC_CA_PLAN, SRC_CA_LOCAL, SRC_LAC_BUILDING];
const SRC_EU = { label: "europa.eu", url: "https://europa.eu/youreurope/business/running-business/start-ups/starting-business/index_en.htm" };
const EU = new Set(["FR", "DE", "ES", "IT", "NL", "IE", "BE", "PT", "AT", "SE", "DK", "FI", "PL", "CZ", "HU", "GR"]);

/** The registry forms that register the business for state sales tax, and those that also register it as an employer. */
const TAX_FORMS = new Set(["md-cra", "hi-bb1", "ut-tax", "ny-dtf-17", "ca-cdtfa", "tx-ap201", "az-tpt", "il-tax", "ma-tax", "fl-dor", "dc-otr", "ga-tax", "pa-tax", "wa-bls", "nj-formation",
  "nj-reg", "nv-tax", "va-tax", "co-tax", "mn-tax", "oh-vendor"]);
// Colorado's sales tax registration doesn't open the unemployment account (CDLE does, co-ui); Washington's business
// license does (ESD and L&I open theirs from it), as do Arizona's joint application and Pennsylvania's myPATH.
const EMPLOYER_FORMS = new Set(["md-cra", "hi-ui", "ut-ui", "ny-dol-100", "ca-edd-de1", "tx-twc", "az-tpt", "wa-bls", "nj-formation",
  "nj-reg", "pa-tax", "fl-dor", "co-ui", "ma-dua", "il-ides", "nv-esd", "dc-does", "va-vec", "mn-ui", "oh-ui", "or-payroll", "ga-dol"]);
/** What it is says it sells alcohol: "restaurant serving beer and wine", "wine bar", "酒吧" (not "no alcohol"). */
const ALCOHOL = /\b(beer|wine|liquor|alcohol(ic)?|spirits|cocktails?|sake|soju|brewery|brewpub|pub|tavern|wine bar|cocktail bar|sports bar)\b|啤酒|葡萄酒|白酒|洋酒|酒吧|酒水|卖酒/i;
const NO_ALCOHOL = /\b(no|without|non-?)\s*(alcohol|beer|wine|liquor)|alcohol-free|不(卖|售)酒|无酒精/i;
export const sellsAlcohol = (what: string) => ALCOHOL.test(what) && !NO_ALCOHOL.test(what);
/** What it is says it sells food from a vehicle or cart: "food truck", "taco truck", "餐车". */
export const mobileFood = (what: string) => /\b(food trucks?|food carts?|mobile food|catering trucks?|taco trucks?|ice cream trucks?|food trailers?)\b|餐车|流动餐|流动摊/i.test(what);
/** What it is says it imports what it sells. */
export const imports = (what: string) => /\bimport(s|er|ers|ing)?\b|进口|跨境/i.test(what);
/** What it is says it puts tables outside: "café with a terrace", "outdoor seating", "露台". */
export const terrace = (what: string) => /\bterrace\b|\bterrasse\b|outdoor (seating|tables)|sidewalk (cafe|café|seating|tables)|pavement (cafe|café|tables)|patio|露台|外摆/i.test(what);

type Role = "entity" | "ein" | "tax" | "employer" | "plan" | "food" | "license" | "building" | "publication" | "other";
/** What a form does in an opening, so the rows can be chained in order. */
function roleOf(f: OfficialForm | null, a: Application): Role {
  // an abstention's "We'll confirm with <office>" names who to ask, not what the step is
  const k = `${a.official ?? a.id} ${a.name.en.replace(/:\s*We'll confirm with .*$/, "")}`.toLowerCase();
  if (f?.id === "irs-ss4") return "ein";
  if (f?.id === "ny-dos-pub") return "publication";
  if (f?.needs?.newEntity || a.id === "pv-g-formation") return "entity";
  if (f ? TAX_FORMS.has(f.id) : /-tax$/.test(a.id)) return "tax";
  if (f ? EMPLOYER_FORMS.has(f.id) : /employer/.test(a.id)) return "employer";
  if (/plan (check|review)/.test(k)) return "plan";
  if (/building permit|tenant improvement|finish-out|build-out/.test(k)) return "building";
  // the permit that lets a food place open: a food form (or one only restaurants file) that issues a permit or licence,
  // not a course, a plan review, a sign or the building. Chicago's business licence is its food licence. Boston's common
  // victualler licence comes before the health permit, so it isn't the permit itself.
  // a general business license a county or city issues to restaurants among others (unincorporated Los Angeles County's)
  if (/business (tax|license|licence|registration|certificate)/.test(k) && !/food/.test(k) && (a.level === "city" || a.level === "county")) return "license";
  const foodForm = f ? !!f.needs?.food || f.id === "chi-license" || (f.level !== "federal" && f.segments.includes("restaurant") && !f.segments.includes("seller") && !f.segments.includes("warehouse")) : /food/.test(a.id);
  if (foodForm && /permit|licen|approval|dealer|food business registration/.test(k) && !/manager|handler|protection certificate|pre-opening|plan|\bsign|occupancy|publication|building|fire|hazard|insurance|assembly|formula|premises|victualler|wine|liquor|alcohol|beer|community board|cleanliness/.test(k)) return "food";
  if (/business (tax|license|licence|registration|certificate)|certificate of use|commercial activity|occupational tax/.test(k) && (a.level === "city" || a.level === "county")) return "license";   // a county licenses businesses in its unincorporated towns
  return "other";
}

const WHEN = {
  ship: B("Before the first shipment", "首批货物发运前"),
  sale: B("Before the first sale", "首笔销售前"),
  store: B("Before this store opens", "本店开业前"),
};

const ORDER: Record<Role, number> = { entity: 5, ein: 10, publication: 13, tax: 20, plan: 50, license: 55, employer: 60, building: 65, food: 76, other: 50 };

/** "the California Secretary of State", "your county's health department": an agency as the object of "confirm with". */
const theAgency = (a: Bi): Bi => B(/^(the|your)\b/i.test(a.en) ? a.en : `the ${a.en}`, a.zh);
const NO_QUOTE = B("Placetta has no current quote from the agency's own page saying this applies here, so Odelia doesn't claim it: she confirms with the agency before it counts in your plan, and never states a fee for it.",
  "快哉目前没有机构官方页面上说明此项适用于此地的最新原文，所以 Odelia 不会断言：她会先向机构核实，再计入您的计划，也不会为此报出费用。");
/** Fail closed: the row says Odelia doesn't know, names who to ask, and states no fee or time. Ids, forms and lines stay. */
function abstain(a: Application, ask: Bi, feeNote: Bi = NO_QUOTE): Application {
  const said = confirm(ask.en, ask.zh);
  const name = /We'll confirm with/.test(a.name.en) ? a.name : B(`${a.name.en}: ${said.en}`, `${a.name.zh}：${said.zh}`);
  const { quote: _q, checked: _c, quoteEn: _e, ...source } = a.source;
  return { ...a, name, abstain: true, fees: [{ label: B("Government fee", "政府规费"), amount: 0, tbd: true }], feeNote, est: CONFIRMS, source };
}

function fromForm(f: OfficialForm, today: string): Application {
  const fields: Field[] = f.fields.map(o => ({
    id: o.id,
    label: o.line ? B(`${/^\d/.test(o.line) ? "Line " : ""}${o.line}: ${o.label.en}`, `${/^\d/.test(o.line) ? "第 " + o.line + " 行" : o.line}：${o.label.zh}`) : o.label,
    value: "",
  }));
  const checklist: CheckItem[] = (f.attach ?? []).map((l, k) => ({ id: "c" + k, label: l, state: "missing" as const }));
  // the quote behind the row, as last seen on its page (src/plan/ask.ts): none, or none recent enough, and the row abstains
  const seen = f.proof ? proofCurrent(f.proof, today) : undefined;
  const a: Application = {
    id: "pv-" + f.id, name: f.title, agency: f.agency, level: f.level, status: "todo", official: f.id, preview: true, plain: f.plain ?? f.how,
    fees: [{ label: B("Government fee", "政府规费"), amount: f.fee ?? 0, ...(f.fee == null ? { tbd: true } : {}) }],
    ...(f.currency && f.currency !== "USD" ? { currency: f.currency } : {}),
    feeNote: f.feeNote ?? (f.fee == null ? FEE_SET : FEE_PUB),
    est: f.takes ?? NO_TIME, renews: f.renews,
    source: { label: host(f.info || f.url), url: f.info || f.url, ...(f.proof && seen ? { quote: f.proof.quote, checked: seen, ...(f.proof.en ? { quoteEn: f.proof.en } : {}) } : {}) }, form: same(f.form), fields, checklist,
    ...(f.specialist ? { specialist: f.specialist } : {}),
  };
  // a certificate staff earn or insurance from an insurer: the owner's step, with nothing for Placetta to fill
  const yours = selfStep(f);
  if (yours) { a.yours = yours; a.fields = []; a.next = YOURS[yours]; }
  return seen ? a : abstain(a, theAgency(f.agency));
}

/** A step the library has no form for. With `ask`, it claims nothing and names who to ask (an abstention); without it,
    it claims the step, which needs a quote from its source page seen recently, else it abstains too. */
type GenericRow = { id: string; level: Level; name: Bi; agency: Bi; plain: Bi; source: Src; ask?: Bi; est?: Bi; feeNote?: Bi; fee?: number; currency?: string };
function generic(g: GenericRow, today: string): Application {
  const a: Application = {
    id: "pv-g-" + g.id, name: g.name, agency: g.agency, level: g.level, status: "todo", preview: true, plain: g.plain,
    fees: [{ label: B("Government fee", "政府规费"), amount: g.fee ?? 0, ...(g.fee == null ? { tbd: true } : {}) }],
    ...(g.currency && g.currency !== "USD" ? { currency: g.currency } : {}),
    feeNote: g.feeNote ?? B("Not in Placetta's registry yet for this place. Odelia reads the agency's page and confirms the fee.", "这个地方的费用还没有收录在快哉的登记库中。Odelia 会查阅机构页面并确认。"),
    est: g.est ?? CONFIRMS, source: g.source, fields: [], checklist: [],
  };
  if (g.ask) return abstain(a, g.ask, a.feeNote);
  const seen = g.source.quote ? proofCurrent({ read: g.source.url, quote: g.source.quote }, today) : undefined;
  return seen ? { ...a, source: { ...g.source, checked: seen } } : abstain(a, theAgency(g.agency));
}

/* --------------------------------------------------------------- the plan */

/** Whether the business makes, serves, sells or imports food. An importer or seller of tea, coffee or drinks deals in
 *  food too (FDA registers it; CPSC's certificate isn't for it). Whole words, and never a furniture brand: "teak", a
 *  "coffee table" or a "tea cabinet" isn't food. The instant plan and find_official_forms read it the same way. */
export function dealsInFood(what: string, segment: Segment = segmentOf(what)): boolean {
  return segment === "restaurant" || /grocery|supermarket|market|food|snack|超市|生鲜|食品|零食/i.test(what)
    || (!FURNITURE.test(what) && /\b(teas?|coffees?|beverages?|drinks?|juices?|candy|candies|confectionery|spices?|sauces?|seasonings?|noodles?)\b|茶|咖啡|饮料|饮品|糖果|调料|酱/i.test(what));
}

/** Where an existing company was formed, against the store's state: "here" (nothing to register), "other" (another US
 *  state: it registers here as a foreign company), "abroad" (another country: the same registration, and the federal
 *  filings a foreign company owes), or undefined when it isn't known. */
export function companyHome(formedIn: string | undefined, where: string): "here" | "other" | "abroad" | undefined {
  const f = (formedIn ?? "").trim();
  if (!f) return undefined;
  if (/^(abroad|foreign|overseas|境外|海外)$/i.test(f)) return "abroad";
  const st = usPlace(where).state ?? stateOf(where);
  const code = /^[A-Za-z]{2}$/.test(f) && STATES[f.toUpperCase()] ? f.toUpperCase() : stateOf(f);
  if (!code) return "abroad";   // a country, not a US state
  return st && code === st ? "here" : "other";
}

export function previewPlan(what: string, where: string, opening?: string, o: PreviewOptions = {}): PreviewPlan {
  const today = o.today ?? daysFromNow(0);
  const segment = segmentOf(what);
  const food = dealsInFood(what, segment);
  // a food truck or cart has no premises to build out or put a sign on
  const mobile = mobileFood(what);
  const employees = o.employees ?? true, buildout = o.buildout ?? !mobile;
  const alcohol = o.alcohol ?? sellsAlcohol(what);
  // a furniture brand: wood goods, upholstered furniture and clothing storage units, read from what it is (src/forms/furniture.ts)
  // the company: none yet, it's formed here; one formed in another state or abroad registers here instead
  const legal = (o.entity ?? "").trim(), home = companyHome(o.formedIn, where);
  const corp = o.corp ?? /\b(inc|incorporated|corp|corporation)\.?\s*$/i.test(legal);
  const needs = { food, employees, signage: o.signage ?? !mobile, buildout, newEntity: !legal, imports: o.imports ?? imports(what), alcohol, terrace: o.terrace ?? terrace(what), ...furnitureNeeds(what), ...sectorNeeds(what),
    ...(legal && home === "abroad" ? { foreignEntity: true } : legal && home === "other" ? { outOfState: true } : {}), ...(corp ? { corp: true } : {}),
    // the intake's answers win over what the words suggest
    ...(o.upholstered !== undefined && FURNITURE.test(what) ? { upholstered: o.upholstered } : {}), ...(o.children !== undefined ? { children: o.children } : {}) };
  const info = placeInfo(where), places = placesOf(where);
  const country = info.country ?? "US";
  const us = country === "US";
  const forms = formsFor({ segment, where, needs }).filter(f => f.order < AFTER_OPENING);
  const rows: { a: Application; f: OfficialForm | null; order: number }[] = forms.map(f => ({ a: fromForm(f, today), f, order: f.order }));
  const roles = () => new Set(rows.map(r => roleOf(r.f, r.a)));
  const city = cityOf(where);

  if (us) {
    const up = usPlace(where);
    const code = up.state ?? stateOf(where), st = code ? STATES[code] : undefined;
    const county = up.county;
    // who to ask about a city's own steps: its own .gov site (an unincorporated place's county's), else USA.gov's directory
    const wc = info.city, countyRun = !!wc && wc.country === "US" && /county/i.test(wc.en);
    const ask = whoToAsk((countyRun ? wc!.en : city) || undefined, code);
    const stEn = st?.en ?? "your state", stZh = st?.zh ?? "所在州";
    // the local office to confirm with: the county where the place is unincorporated, the city otherwise
    // a city the library names is incorporated when the county table lists it as a city or CISA's .gov registry has a city
    // domain for it; a covered county-run place (Fairfax County's Annandale and Tysons) is its county; anywhere else the
    // row can't say whether a city or the county decides, so it says so instead of naming a "City of" that may not exist
    const incorporated = !!city && ((!!county && !up.unincorporated) || ask.site === "city" || (!!wc && !countyRun));
    const localEn = up.unincorporated && county ? `${county.en}` : countyRun ? wc!.en : incorporated ? `the City of ${city}` : city ? `the local government for ${city} (city or county)` : "your city";
    const localZh = up.unincorporated && county ? county.zh : countyRun ? wc!.zh : incorporated ? `${city}市` : city ? `${city}当地政府（市或县）` : "所在城市";
    const buildingEn = !up.unincorporated && !countyRun && !incorporated && city ? `the building office for ${city} (city or county)` : `${localEn} building department`;
    const buildingZh = !up.unincorporated && !countyRun && !incorporated && city ? `${city}的建筑部门（市或县）` : `${localZh}建筑部门`;
    // whose health department: a city that runs its own (Pasadena, Berkeley), the county's named one; where the state's
    // own page says the city or town permits food places (Massachusetts's boards of health), the city's; where the state
    // leaves it to each place (Texas) or the library names no one, the row abstains and names both the city and the county
    const permitter = code ? FOOD_PERMITTER[code] : undefined;
    const named = up.ownHealth ?? county?.health;
    const cityBoard = permitter?.who === "city" && city && !up.unincorporated;
    const health = cityBoard ? B(`City of ${city} Board of Health`, `${city}市卫生局`)
      : named && permitter?.who !== "varies" ? B(named.en, named.zh)
      : city && county ? B(`the ${city} or ${county.en} health department`, `${city}或${county.zh}卫生部门`)
      : county ? B(`${county.en} health department`, `${county.zh}卫生部门`)
      : city ? B(`the ${city} health department`, `${city}卫生部门`) : B("your city or county health department", "所在市或县卫生部门");
    // a health office the library or the state's own page names is certain; otherwise who it is is part of what to confirm
    const healthKnown = !!cityBoard || (!!named && permitter?.who !== "varies");
    const healthLevel: Level = cityBoard || up.ownHealth || !county ? "city" : "county";
    const healthAsk = permitter?.who === "varies" && code === "TX" ? B(`${health.en} (or the Texas Department of State Health Services where neither permits food places)`, `${health.zh}（两者都不发证时为德州州卫生服务部）`) : health;
    const local = info.local && !up.unincorporated;
    // the state layer: sales tax, then the employer account. The state's tax agency is named, but with no quote from its
    // page on record the row abstains (src/plan/ask.ts) and names that agency as who to ask
    if (st?.tax && !forms.some(f => TAX_FORMS.has(f.id))) rows.push({ order: ORDER.tax, f: null, a: generic({
      id: `${code!.toLowerCase()}-tax`, level: "state", name: st.taxName ? B(st.taxName[0], st.taxName[1]) : B(`${st.en} sales tax permit`, `${st.zh}销售税许可证`), agency: B(st.tax[0], st.tax[1]),
      source: { label: host(st.tax[2]), url: st.tax[2] }, ask: B(`the ${st.tax[0]}`, st.tax[1]),
      plain: code === "DE" ? B("Delaware has no sales tax, but every business there holds a state business license from the Division of Revenue.", "特拉华州没有销售税，但每家企业都要向州税务处取得营业执照。")
        : B(`Lets you charge sales tax in ${st.en}. Apply before your first sale; most states issue it free.`, `让您可以在${st.zh}收取销售税。首笔销售前申请，多数州免费发放。`),
    }, today) });
    if (employees && !forms.some(f => EMPLOYER_FORMS.has(f.id))) {
      const ag = (code && EMPLOYER_AGENCY[code]) ?? [`${stEn} unemployment insurance agency`, `${stZh}失业保险机构`];
      rows.push({ order: ORDER.employer, f: null, a: generic({
        id: "employer", level: "state", name: B("New employer registration (unemployment insurance)", "新雇主登记（失业保险）"), ask: B(`the ${ag[0]}`, ag[1]), agency: B(ag[0], ag[1]), source: SRC_DOL,
        plain: B("Registers you as an employer with the state once you have staff on payroll. Odelia confirms the agency's form.", "有员工发薪后，向州政府登记为雇主。Odelia 会核实该机构的表格。"),
      }, today) });
    }
    // the company, where the library has no formation filing for the state
    const former = (code && FORMATION_AGENCY[code]) ?? [`${stEn} Secretary of State`, `${stZh}州务卿`];
    if (st && needs.newEntity && !forms.some(f => formsEntityFor(f))) rows.push({ order: ORDER.entity, f: null, a: generic({
      id: "formation", level: "state", name: B("Company formation (LLC or corporation)", "成立公司（LLC 或公司）"), ask: B(`the ${former[0]}`, former[1]),
      agency: B(former[0], former[1]), source: SRC_SBA,
      plain: B("The company is formed with the state first; its name and number go on every other filing.", "公司须先在州政府成立；其名称和编号会用在其他所有申请上。"),
    }, today) });
    // the local layer, where the registry has no steps for this city yet (a covered city's registry list stands as it
    // is, except that a food place always gets its operating permit listed). Every local abstention links the office's
    // own site (whoToAsk), so the person knows exactly where to ask.
    const foodPlace = food && (segment === "restaurant" || segment === "retail");
    // California's plan approval rule is statewide, so the step is certain and only the county is named; elsewhere,
    // where the library has no plan review for the place, the row says whom Odelia confirms it with
    if (foodPlace && buildout && !local && !roles().has("plan")) rows.push({ order: ORDER.plan, f: null, a: generic(code === "CA" && named ? {
      id: "plan-review", level: healthLevel, name: B("Food facility plan check", "食品设施图纸审查"), agency: health, source: SRC_CA_PLAN,
      plain: B("California requires the health department's approval of your plans before any construction starts.", "加州要求在任何施工开始前取得卫生部门对图纸的批准。"),
    } : {
      id: "plan-review", level: healthLevel, name: B("Food facility plan review", "食品设施图纸审查"), ask: healthAsk, agency: health, source: cityBoard || !healthKnown ? ask.source : code === "CA" ? SRC_CA_PLAN : SRC_SBA,
      plain: B("Most health departments review a food place's plans before construction. Odelia confirms this one's rules before you build.", "多数卫生部门会在施工前审查餐饮场所的图纸。Odelia 会在您施工前核实当地规定。"),
    }, today) });
    if (foodPlace && !roles().has("food")) {
      const term = (code && FOOD_PERMIT_NAME[code]) ?? ["Food establishment health permit", "餐饮场所卫生许可证"];
      rows.push({ order: ORDER.food, f: null, a: generic(cityBoard ? {
        // the state's own page: the city or town's board of health permits every food establishment
        id: "food-permit", level: "city", name: B(term[0], term[1]), agency: health, source: permitter!.src, est: B("Issued after the opening inspection", "开业检查通过后发放"),
        plain: B("The local board of health permits every food establishment and inspects it before it opens.", "当地卫生局为每家食品经营场所发放许可，并在开业前检查。"),
      } : {
        id: "food-permit", level: healthLevel, name: B(term[0], term[1]), ask: healthAsk, agency: health, source: !healthKnown ? permitter?.src ?? ask.source : SRC_SBA, est: B("Issued after the opening inspection", "开业检查通过后发放"),
        plain: B("The permit that lets a food place open, issued after an inspection. Odelia confirms the issuing office and its form.", "让餐饮场所开业的许可证，检查通过后发放。Odelia 会核实发证机构及其表格。"),
      }, today) });
    }
    // a food truck or cart: the fixed facility's plan check and health permit don't apply. The health office permits the
    // vehicle itself, usually with a commissary it works from; the library has none of those forms yet, so the row
    // abstains and names who decides, instead of listing a restaurant's permits
    if (mobile && foodPlace) {
      for (let k = rows.length - 1; k >= 0; k--) if (["food", "plan"].includes(roleOf(rows[k].f, rows[k].a))) rows.splice(k, 1);
      rows.push({ order: ORDER.food, f: null, a: generic({
        id: "mobile-food", level: healthLevel, name: B("Mobile food facility permit (the vehicle, and its commissary)", "流动食品设施许可（车辆及其后勤厨房）"), ask: healthAsk, agency: health, source: ask.source,
        plain: B("A food truck or cart is permitted as a vehicle, not a building: the health office inspects it and usually the commissary it works from. Odelia confirms the office and its forms.", "餐车或食品推车按车辆而非建筑发证：卫生部门检查车辆，通常还会检查其后勤厨房。Odelia 会核实办理机构及表格。"),
      }, today) });
    }
    if (alcohol && !forms.some(f => f.needs?.alcohol && f.level !== "federal")) {
      const ag = (code && ALCOHOL_AGENCY[code]) ?? [`the ${stEn} alcoholic beverage control agency`, `${stZh}酒类管理机构`];
      rows.push({ order: 71, f: null, a: generic({
        id: "alcohol", level: "state", name: B(`${stEn} alcohol license`, `${stZh}酒类执照`), ask: B(ag[0], ag[1]), agency: B(ag[0].replace(/^the /, ""), ag[1]), source: SRC_SBA,
        plain: B("Selling beer, wine or spirits takes a license, often from both the state and the city or county. Odelia confirms the agency and the license type for your place.", "销售啤酒、葡萄酒或烈酒须取得执照，通常须同时取得州和市或县的批准。Odelia 会核实您所在地的机构和执照类型。"),
      }, today) });
    }
    // the local license: named in the library for the cities it covers; Texas cities mostly have none; elsewhere the row
    // names the city (or, unincorporated, the county) Odelia confirms with, and the zoning or use sign-off many ask first
    if (!roles().has("license") && !local && code !== "TX") rows.push({ order: ORDER.license, f: null, a: generic({
      id: "local-license", level: up.unincorporated ? "county" : "city",
      name: B("Local business license or tax registration, and any zoning or use certificate it needs", "当地营业执照或营业税登记，以及所需的分区或用途证明"), ask: B(localEn, localZh),
      agency: up.unincorporated && county ? B(`${county.en} business licensing`, `${county.zh}营业执照部门`) : city ? B(localEn.replace(/^the /, ""), localZh) : B("Your city", "所在城市"), source: ask.source,
      plain: B("Most cities and some counties register every business inside their limits and charge a yearly tax, and many check the zoning first. Odelia confirms the office and the form for your address.", "多数城市和部分县会登记辖区内每家企业并收取年费，许多还会先核查分区。Odelia 会核实您地址所属的办理机构和表格。"),
    }, today) });
    // the occupancy sign-off after a build-out: Texas cities license through the Certificate of Occupancy instead of a
    // business license (Houston, Dallas, Plano and Sugar Land all do); elsewhere the building office's final approval
    if (code === "TX" && !info.local && segment !== "seller" && !forms.some(f => /certificate of occupancy/i.test(f.title.en))) rows.push({ order: 62, f: null, a: generic({
      id: "occupancy", level: "city", name: B("Certificate of Occupancy", "占用证"), ask: B(localEn, localZh),
      agency: city ? B(localEn.replace(/^the /, ""), localZh) : B("Your city", "所在城市"), source: ask.source,
      plain: B("Texas cities rarely sell a business license, but most require a Certificate of Occupancy before a business moves in. Odelia confirms your city's.", "德州城市很少发放营业执照，但多数要求企业入驻前取得占用证。Odelia 会核实您所在城市的要求。"),
    }, today) });
    else if (buildout && segment !== "seller" && !local && code !== "TX" && !forms.some(f => /occupancy/i.test(f.title.en))) rows.push({ order: 67, f: null, a: generic({
      id: "occupancy", level: up.unincorporated ? "county" : "city", name: B("Certificate of occupancy (or final sign-off) once the work passes inspection", "工程验收后的占用证（或最终验收）"), ask: B(buildingEn, buildingZh),
      agency: B(buildingEn.replace(/^the /, ""), buildingZh), source: ask.source,
      plain: B("After the final inspection, most building offices issue a certificate of occupancy or sign the work off before you open. Odelia confirms which one yours issues.", "最终检查后，多数建筑部门会在开业前签发占用证或验收。Odelia 会核实您所在地签发哪一种。"),
    }, today) });
    // the build-out: Los Angeles County's cities approve plans in their building and safety office after the county, and
    // New Jersey's construction permit comes from the municipality (both from their own pages); elsewhere the row names
    // the office Odelia confirms with
    if (buildout && segment !== "seller" && !local && !roles().has("building")) {
      const lacCity = county?.code === "LAC" && !up.unincorporated && city && !/^los angeles$/i.test(city);
      const municipal = code ? MUNICIPAL_BUILDING[code] : undefined;
      rows.push({ order: ORDER.building, f: null, a: generic(lacCity ? {
        id: "building", level: "city", name: B("Building permit for the build-out", "装修建筑许可证"), agency: B(`City of ${city} Building and Safety`, `${city}市建筑与安全部门`), source: SRC_LAC_BUILDING,
        plain: B("The city's building and safety office approves the plans and inspects the build-out.", "市建筑与安全部门审批图纸并检查装修。"),
      } : municipal && city ? {
        id: "building", level: "city", name: B("Construction permit for the build-out", "装修施工许可证"), agency: B(`${city} construction official (the municipal enforcing agency)`, `${city}施工官员（市镇执法机构）`), source: municipal,
        plain: B("New Jersey's Uniform Construction Code: work on an existing building needs a construction permit from the municipality's enforcing agency, which inspects it.", "新泽西州统一建筑规范：改建现有建筑须向市镇执法机构申请施工许可，并由其检查。"),
      } : {
        id: "building", level: up.unincorporated ? "county" : "city", name: B("Building permit for the build-out", "装修建筑许可证"), ask: B(buildingEn, buildingZh),
        agency: B(buildingEn.replace(/^the /, ""), buildingZh), source: ask.source,
        plain: B("Building out a space almost always takes a permit and inspections from the local building office. Odelia confirms which office and what it needs.", "装修场所几乎都需要当地建筑部门的许可和检查。Odelia 会核实具体机构及所需材料。"),
      }, today) });
    }
    // a covered city whose library steps hold no building permit: the build-out still needs one, so rather than leave it
    // out silently the row abstains and names the city's building office (Denver's and Miami's weren't quotable yet)
    if (buildout && segment !== "seller" && local && !roles().has("building")) rows.push({ order: ORDER.building, f: null, a: generic({
      id: "building", level: "city", name: B("Building permit for the build-out", "装修建筑许可证"), ask: B(buildingEn, buildingZh),
      agency: B(buildingEn.replace(/^the /, ""), buildingZh), source: ask.source,
      plain: B("Building out a space almost always takes a permit and inspections from the local building office. Odelia confirms which office and what it needs.", "装修场所几乎都需要当地建筑部门的许可和检查。Odelia 会核实具体机构及所需材料。"),
    }, today) });
  } else {
    // abroad: the registry's national and city steps; for a country it doesn't cover yet, the EU's common three
    const c = info.country, eu = !!c && EU.has(c), cur = info.currency;
    const cn = { en: info.city?.en ?? where, zh: info.city?.zh ?? where };
    if (!rows.length && eu) {
      rows.push({ order: 10, f: null, a: generic({ id: "company", level: "federal", name: B("Company registration", "公司注册"), agency: B(`${cn.en}'s national business register`, `${cn.zh}所在国的企业登记机关`), source: SRC_EU, currency: cur,
        plain: B("Registers the company in the national business register. Every EU country has one portal for it.", "在国家企业登记机关注册公司。每个欧盟国家都有一个统一的办理入口。") }, today) });
      rows.push({ order: 25, f: null, a: generic({ id: "vat", level: "federal", name: B("Tax and VAT registration", "税务与增值税登记"), agency: B("National tax authority", "国家税务机关"), source: SRC_EU, currency: cur,
        plain: B("Gives the company its tax and VAT numbers before it starts trading.", "在开始经营前为公司取得税号和增值税号。") }, today) });
    }
    if (food && !roles().has("food") && (eu || c === "GB")) rows.push({ order: ORDER.food, f: null, a: generic({ id: "food", level: "city", name: B("Food business registration", "食品企业登记"), agency: B("Local food safety authority", "当地食品安全监管机构"), source: SRC_EU, currency: cur,
      plain: B("Food businesses in the EU register with the local authority before opening, which then inspects.", "欧盟的食品企业在开业前向当地监管机构登记，之后接受检查。") }, today) });
  }

  // sources that disagree: two claimed permits to open the same food place from different offices at different levels
  // (a county's and a city's) mean the library's pages contradict each other about who issues it. Odelia doesn't pick
  // one: both rows abstain and name both offices.
  const conflicts: string[] = [];
  const openers = rows.filter(r => !r.a.abstain && roleOf(r.f, r.a) === "food");
  if (new Set(openers.map(r => r.a.agency.en)).size > 1 && new Set(openers.map(r => r.a.level)).size > 1) {
    const who = B(openers.map(r => theAgency(r.a.agency).en).join(" or "), openers.map(r => r.a.agency.zh).join("或"));
    conflicts.push(`the permit to open: ${openers.map(r => `${r.a.official ?? r.a.id} (${r.a.agency.en})`).join(" vs ")}`);
    for (const r of openers) r.a = abstain(r.a, who, B("Two official sources name different offices for this permit, so Odelia doesn't pick one: she confirms which office issues it before it counts in your plan.", "两个官方来源对发证机构说法不一，Odelia 不会自行选择：她会先核实由哪个机构发证，再计入您的计划。"));
  }

  // in filing order: the company first (its number goes on everything else), then the library's order
  rows.sort((x, y) => (roleOf(x.f, x.a) === "entity" ? ORDER.entity : x.order) - (roleOf(y.f, y.a) === "entity" ? ORDER.entity : y.order));
  // an importer's plan in three milestones, the way a broker, a test lab and a licensing service each split it: what
  // clears the first shipment (the importer number, bond, ISF, the entry declarations and product certificates), what
  // the first sale needs (sales tax, state product licenses, packaging EPR), and each store's own steps; the company
  // and the EIN come first and carry no milestone
  if (needs.imports) for (const r of rows) {
    const role = roleOf(r.f, r.a), lvl = r.a.level;
    if (role === "entity" || role === "ein" || role === "publication" || role === "employer") continue;
    const store = role === "plan" || role === "building" || role === "food" || (role === "license" && segment !== "seller");
    r.a.when = store ? WHEN.store : lvl === "federal" && r.order >= 30 && r.order < 45 ? WHEN.ship : role === "tax" || role === "license" || (r.order >= 45 && r.order < 50) ? WHEN.sale : undefined;
  }
  // and in that order: the company, then the first shipment, the first sale and the store (a stable sort keeps the
  // library's order inside each milestone)
  if (needs.imports) {
    const rank = (r: typeof rows[number]) => { const role = roleOf(r.f, r.a); return role === "entity" || role === "ein" || role === "publication" ? 0
      : r.a.when === WHEN.ship ? 1 : r.a.when === WHEN.sale ? 2 : r.a.when === WHEN.store ? 3 : r.order < 30 ? 0 : r.order < 45 ? 1 : r.order < 60 ? 2 : 3; };
    rows.sort((x, y) => rank(x) - rank(y));
  }
  const apps = rows.map(r => r.a);
  const byRole = new Map<Role, Application>();
  for (const r of rows) { const role = roleOf(r.f, r.a); if (!byRole.has(role)) byRole.set(role, r.a); }
  // what each step waits on, as the agencies ask for it: the company before the EIN, the EIN before every registration,
  // the plan review before the building permit and the operating permit
  const short = (a: Application): Bi => {
    const acr = /\(([A-Z]{2,6})\)/.exec(a.name.en)?.[1];
    if (acr) return B(acr, acr + " ");
    const en = a.name.en.replace(/:\s*We'll confirm with .*$/, ""), zh = a.name.zh.replace(/：我们会向.*核实$/, "");
    return B(en.replace(/^Application for (Registration as an? |)/, "").replace(/\s*\(.*\)$/, ""), zh.replace(/（.*）$/, "").replace(/申请$/, ""));
  };
  const link = (a: Application, d: Application | undefined, key: string, label: Bi) => { if (d && d.id !== a.id && !a.checklist.some(c => c.dep === d.id)) { const s = short(d); a.checklist = [{ id: "dep-" + key, label, state: "missing", dep: d.id }, ...a.checklist]; a.next = B(`After the ${s.en}`, `${s.zh}之后`); } };
  const dep = (a: Application, on: Role, label: Bi) => link(a, byRole.get(on), on, label);
  for (const r of rows) {
    const role = roleOf(r.f, r.a);
    if (role === "ein") dep(r.a, "entity", B("Company formed", "公司已成立"));
    if (role === "publication") dep(r.a, "entity", B("Articles filed", "组织章程已提交"));
    if (role === "tax" || role === "employer" || role === "license") dep(r.a, "ein", B("EIN issued", "EIN 已签发"));
    if (role === "building" || role === "food") dep(r.a, "plan", B("Approved plan review", "已批准的图纸审查"));
    // what the agency's own page says this step waits on, when that step is in the plan too
    for (const w of r.f?.after ?? []) link(r.a, apps.find(x => x.official === w.form), w.form, w.label);
    if (role === (food ? "food" : "license") || role === "plan") r.a.critical = true;
  }

  // what differs for this kind of food business here (a milk tea shop, a coffee shop, a bakery), each fact stated only
  // while its official quote is current; it goes on the row it bears on (the permit to open, the plan review, the build-out)
  // (food kinds only for a food business; furniture's for a showroom or an importer, but not a warehouse, which stores
  // goods it doesn't label or sell)
  const kinds = kindsOf(what).filter(k => segment === "restaurant" || (segment !== "warehouse" && (FURNITURE_KINDS.includes(k) || SECTOR_KINDS.includes(k))));
  const withheld: string[] = [];
  const near: Record<NonNullable<KindFact["about"]>, Role[]> = { food: ["food", "plan", "license"], plan: ["plan", "building", "food"], building: ["building", "plan", "food"], license: ["license", "food"] };
  const facts: PlanFact[] = kindFactsAt(kinds, places, needs).flatMap(k => {
    const seen = proofCurrent(k.proof, today);
    if (!seen) { withheld.push(k.id); return []; }
    const app = (k.form ?? []).map(id => apps.find(a => a.official === id)).find(Boolean) ?? (k.about ? near[k.about].map(x => byRole.get(x)).find(Boolean) : undefined);
    const source = { label: host(k.proof.read), url: k.proof.read, quote: k.proof.quote, checked: seen };
    if (app) app.notes = [...(app.notes ?? []), { id: k.id, title: k.title, text: k.text, source }];
    return [{ id: k.id, kinds: k.kinds.filter(x => kinds.includes(x)), title: k.title, text: k.text, agency: k.agency, level: k.level, ...(app ? { app: app.id } : {}), source }];
  });

  // deadlines: the opening, and the day each permit has to be filed by to be in hand for it
  const deadlines: Deadline[] = [];
  if (opening) {
    deadlines.push({ id: "pv-dl-open", date: opening, kind: "milestone", title: B("Target opening", "目标开业日") });
    for (const r of rows) {
      // an abstention states no processing time, so it sets no file-by date
      if (!r.f || r.a.abstain) continue;
      const days = r.f.takesDays !== undefined ? r.f.takesDays : publishedDays(r.f.takes);
      if (days == null) continue;
      deadlines.push({ id: "pv-dl-" + r.f.id, date: addDays(opening, -(days + BUFFER)), kind: "due", app: r.a.id, agency: r.a.agency, title: B(`File the ${r.a.name.en.replace(/^Application for (Registration as a |)/, "")}`, `提交${r.a.name.zh}`) });
    }
    // what recurs: a claimed step whose agency publishes a cycle ("Every year.", "Every 2 years.") lands on the renewal
    // calendar, counted from the target opening until the agency's approval day is on record (src/finish.ts
    // scheduleRenewals then replaces it with the date counted from that day)
    for (const r of rows) {
      if (r.a.abstain) continue;
      const c = renewalCycle(r.a.renews?.en);
      if (!c) continue;
      const name = r.a.name.en.replace(/^Application for (Registration as a |)/, "");
      deadlines.push({ id: PROJECTED_RENEWAL + (r.f?.id ?? r.a.id), date: nextRenewal(opening, c), kind: "renewal", app: r.a.id, agency: r.a.agency,
        title: B(`Renew: ${name} (counted from the target opening)`, `续办：${r.a.name.zh}（按目标开业日推算）`) });
    }
  }

  // where the chain puts the opening, with the same arithmetic the store cards use
  const store: Store = { id: o.storeId ?? "store", name: same(where), address: where, stage: "opening", plannedOpen: opening, rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: apps.map(a => a.id) };
  const w = { apps, approvals: [], stores: [store], facts: [], deadlines } as unknown as Workspace;
  const projectedOpen = apps.length ? openingPath(store, w, today).landing : null;

  const layers: Record<Level, number> = { federal: 0, state: 0, county: 0, city: 0 };
  for (const a of apps) layers[a.level]++;
  // beyond the permits to open: the conditional filings, the labels, the workplace rules and what an agency decides
  const have = haveOf(what, segment, needs, { manufactures: o.manufactures, online: o.online, mobile });
  const also = alsoFor({ places, segment, have, today });
  return {
    apps, deadlines, projectedOpen, segment, food, country, places, local: info.local,
    fromRegistry: rows.filter(r => r.f).length, generic: rows.filter(r => !r.f).length, layers, abstained: apps.filter(a => a.abstain).length, conflicts,
    fees: apps.reduce((s, a) => s + a.fees.reduce((t, f) => t + f.amount, 0), 0), varies: apps.filter(a => a.fees.some(f => f.tbd)).length,
    kinds, facts, withheld, have, also,
  };
}

/** What the agent's forms tool (find_official_forms, src/live.ts) says about a business and place, with the flags the
    model passes: for each library form whether Odelia may claim it (a current quote from its page, and no conflict), and
    the steps the library has no form for, as the instant plan lists them (claims with their quote, or abstentions that
    name who to ask with that office's own link). One source of truth with the instant plan. */
export function libraryAnswer(what: string, where: string, needs: { employees?: boolean; buildout?: boolean; signage?: boolean; newEntity?: boolean; imports?: boolean; alcohol?: boolean; manufactures?: boolean; online?: boolean; upholstered?: boolean; children?: boolean }, today = daysFromNow(0)) {
  const p = previewPlan(what, where, undefined, { entity: needs.newEntity ? undefined : "existing", employees: !!needs.employees, buildout: !!needs.buildout, signage: !!needs.signage, imports: !!needs.imports, alcohol: !!needs.alcohol,
    manufactures: needs.manufactures, online: needs.online, upholstered: needs.upholstered, children: needs.children, today });
  const byForm = new Map(p.apps.filter(a => a.official).map(a => [a.official!, a]));
  return {
    claim: (f: OfficialForm) => { const a = byForm.get(f.id); return a ? !a.abstain : !!(f.proof && proofCurrent(f.proof, today)); },
    row: (f: OfficialForm) => byForm.get(f.id),
    steps: p.apps.filter(a => !a.official), conflicts: p.conflicts,
    // what differs for this kind of business here, each with its official quote (only current ones)
    facts: p.facts,
    // beyond the permits: conditional filings, labels, workplace rules and what an agency decides (src/plan/also.ts)
    also: p.also, have: p.have,
  };
}

/** One line for the first screen and the plans sheet: "9 permits for Flushing, 4 with a published fee". */
export function previewLine(p: Pick<PreviewPlan, "apps" | "fees" | "varies">, placeEn: string, placeZh = placeEn): Bi {
  const n = p.apps.length, known = n - p.varies;
  return B(`${n} permit${n === 1 ? "" : "s"} for ${placeEn}, in order${known ? `, ${known} with a published fee` : ""}`, `${placeZh}的 ${n} 项许可，已按顺序排好${known ? `，其中 ${known} 项有公布的费用` : ""}`);
}
