// The instant plan a new workspace starts with: every license, permit and registration Placetta's own registry knows
// for this kind of business in this place, in the order the agencies want them, with each one's agency, fee, usual
// time, official source and the form's own lines, empty. No model is called: this runs in the browser the moment the
// person presses Start, so the first screen already shows the plan. Each row is marked preview; Odelia verifies it
// against the agency's current source when the plan starts (src/live.ts), keeping the ids.
// Pure functions: Root.tsx writes the result into the new workspace; the tests call it directly.
import { B, same, type Bi } from "../bi";
import { formsFor, placeInfo, placesOf, segmentOf, type OfficialForm, type Segment, type Where } from "../forms/registry";
import { countyOf } from "../counties";
import type { Application, CheckItem, Deadline, Field, Level, Store, Workspace } from "../model";
import { publishedDays } from "../plan";
import { openingPath } from "../smart";
import { daysFromNow } from "../time";

export type PreviewOptions = {
  entity?: string;          // the legal entity, if it exists already (then no formation step)
  employees?: boolean;      // hires staff (default yes)
  signage?: boolean;        // puts up a sign (default yes)
  buildout?: boolean;       // builds out the space (default yes)
  imports?: boolean;        // imports the goods it sells (default: read from what it is, "importer", "进口")
  alcohol?: boolean;        // sells beer, wine or spirits (default: read from what it is)
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
  layers: Record<Level, number>;
  fees: number;                          // the fees the registry publishes, added up
  varies: number;                        // rows whose fee the agency sets
};

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
/** The city in "Flushing, NY 11354". */
const cityOf = (where: string) => where.split(",")[0].replace(/\d{5}(-\d{4})?/g, "").trim();

/* --------------------------------------------------------------- the rows */

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const BUFFER = 7;            // a week to gather documents and fix what the agency bounces, as in src/plan.ts
const AFTER_OPENING = 88;    // library order from which forms are yearly taxes and reports, not steps to open
const FEE_SET = B("Set by the agency's fee schedule. Odelia confirms it before you pay.", "按机构收费标准计算，付款前 Odelia 会确认。");
const FEE_PUB = B("The agency's published fee. Odelia confirms it before you pay.", "机构公布的费用，付款前 Odelia 会确认。");
const NO_TIME = B("The agency doesn't publish a processing time. Placetta tracks it from the day it's filed.", "机构未公布办理时间。快哉从提交之日起跟踪。");
const CONFIRMS = B("Odelia confirms the time with the agency", "Odelia 向机构核实办理时间");
const SRC_DOL = { label: "oui.doleta.gov", url: "https://oui.doleta.gov/unemploy/agencies.asp" };
const SRC_FDA = { label: "fda.gov", url: "https://www.fda.gov/food/retail-food-protection" };
const SRC_SBA = { label: "sba.gov", url: "https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits" };
const SRC_EU = { label: "europa.eu", url: "https://europa.eu/youreurope/business/running-business/start-ups/starting-business/index_en.htm" };
const EU = new Set(["FR", "DE", "ES", "IT", "NL", "IE", "BE", "PT", "AT", "SE", "DK", "FI", "PL", "CZ", "HU", "GR"]);

/** The registry forms that register the business for state sales tax, and those that also register it as an employer. */
const TAX_FORMS = new Set(["md-cra", "hi-bb1", "ut-tax", "ny-dtf-17", "ca-cdtfa", "tx-ap201", "az-tpt", "il-tax", "ma-tax", "fl-dor", "dc-otr", "ga-tax", "pa-tax", "wa-bls", "nj-formation",
  "nj-reg", "nv-tax", "va-tax", "co-tax", "mn-tax", "oh-vendor"]);
// Colorado's sales tax registration doesn't open the unemployment account (CDLE does, co-ui); Washington's business
// license does (ESD and L&I open theirs from it), as do Arizona's joint application and Pennsylvania's myPATH.
const EMPLOYER_FORMS = new Set(["md-cra", "hi-ui", "ut-ui", "ny-dol-100", "ca-edd-de1", "tx-twc", "az-tpt", "wa-bls", "nj-formation",
  "nj-reg", "pa-tax", "fl-dor", "co-ui", "ma-dua", "il-ides", "nv-esd", "dc-does", "va-vec", "mn-ui", "oh-ui", "or-payroll"]);
/** What it is says it sells alcohol: "restaurant serving beer and wine", "wine bar", "酒吧" (not "no alcohol"). */
const ALCOHOL = /\b(beer|wine|liquor|alcohol(ic)?|spirits|cocktails?|sake|soju|brewery|brewpub|pub|tavern|wine bar|cocktail bar|sports bar)\b|啤酒|葡萄酒|白酒|洋酒|酒吧|酒水|卖酒/i;
const NO_ALCOHOL = /\b(no|without|non-?)\s*(alcohol|beer|wine|liquor)|alcohol-free|不(卖|售)酒|无酒精/i;
export const sellsAlcohol = (what: string) => ALCOHOL.test(what) && !NO_ALCOHOL.test(what);
/** What it is says it imports what it sells. */
export const imports = (what: string) => /\bimport(s|er|ers|ing)?\b|进口|跨境/i.test(what);

type Role = "entity" | "ein" | "tax" | "employer" | "plan" | "food" | "license" | "building" | "publication" | "other";
/** What a form does in an opening, so the rows can be chained in order. */
function roleOf(f: OfficialForm | null, a: Application): Role {
  const k = `${a.official ?? a.id} ${a.name.en}`.toLowerCase();
  if (f?.id === "irs-ss4") return "ein";
  if (f?.id === "ny-dos-pub") return "publication";
  if (f?.needs?.newEntity) return "entity";
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
  if (/business (tax|license|licence|registration|certificate)|certificate of use|commercial activity/.test(k) && (a.level === "city" || a.level === "county")) return "license";   // a county licenses businesses in its unincorporated towns
  return "other";
}

const ORDER: Record<Role, number> = { entity: 5, ein: 10, publication: 13, tax: 20, plan: 50, license: 55, employer: 60, building: 65, food: 76, other: 50 };

function fromForm(f: OfficialForm): Application {
  const fields: Field[] = f.fields.map(o => ({
    id: o.id,
    label: o.line ? B(`${/^\d/.test(o.line) ? "Line " : ""}${o.line}: ${o.label.en}`, `${/^\d/.test(o.line) ? "第 " + o.line + " 行" : o.line}：${o.label.zh}`) : o.label,
    value: "",
  }));
  const checklist: CheckItem[] = (f.attach ?? []).map((l, k) => ({ id: "c" + k, label: l, state: "missing" as const }));
  return {
    id: "pv-" + f.id, name: f.title, agency: f.agency, level: f.level, status: "todo", official: f.id, preview: true, plain: f.plain ?? f.how,
    fees: [{ label: B("Government fee", "政府规费"), amount: f.fee ?? 0, ...(f.fee == null ? { tbd: true } : {}) }],
    ...(f.currency && f.currency !== "USD" ? { currency: f.currency } : {}),
    feeNote: f.feeNote ?? (f.fee == null ? FEE_SET : FEE_PUB),
    est: f.takes ?? NO_TIME, renews: f.renews,
    source: { label: host(f.info || f.url), url: f.info || f.url }, form: same(f.form), fields, checklist,
  };
}

type GenericRow = { id: string; level: Level; name: Bi; agency: Bi; plain: Bi; source: { label: string; url: string }; est?: Bi; feeNote?: Bi; fee?: number; currency?: string };
function generic(g: GenericRow): Application {
  return {
    id: "pv-g-" + g.id, name: g.name, agency: g.agency, level: g.level, status: "todo", preview: true, plain: g.plain,
    fees: [{ label: B("Government fee", "政府规费"), amount: g.fee ?? 0, ...(g.fee == null ? { tbd: true } : {}) }],
    ...(g.currency && g.currency !== "USD" ? { currency: g.currency } : {}),
    feeNote: g.feeNote ?? B("Not in Placetta's registry yet for this place. Odelia reads the agency's page and confirms the fee.", "这个地方的费用还没有收录在快哉的登记库中。Odelia 会查阅机构页面并确认。"),
    est: g.est ?? CONFIRMS, source: g.source, fields: [], checklist: [],
  };
}

/* --------------------------------------------------------------- the plan */

export function previewPlan(what: string, where: string, opening?: string, o: PreviewOptions = {}): PreviewPlan {
  const today = o.today ?? daysFromNow(0);
  const segment = segmentOf(what);
  const food = segment === "restaurant" || /grocery|supermarket|market|food|snack|超市|生鲜|食品|零食/i.test(what);
  const employees = o.employees ?? true, buildout = o.buildout ?? true;
  const alcohol = o.alcohol ?? sellsAlcohol(what);
  const needs = { food, employees, signage: o.signage ?? true, buildout, newEntity: !(o.entity ?? "").trim(), imports: o.imports ?? imports(what), alcohol };
  const info = placeInfo(where), places = placesOf(where);
  const country = info.country ?? "US";
  const us = country === "US";
  const forms = formsFor({ segment, where, needs }).filter(f => f.order < AFTER_OPENING);
  const rows: { a: Application; f: OfficialForm | null; order: number }[] = forms.map(f => ({ a: fromForm(f), f, order: f.order }));
  const roles = () => new Set(rows.map(r => roleOf(r.f, r.a)));
  const city = cityOf(where);

  if (us) {
    const code = stateOf(where), st = code ? STATES[code] : undefined;
    const county = code ? countyOf(city, code) : undefined;
    // a city the registry covers runs its own health department (New York City, Houston); elsewhere it's usually the county's
    const health = info.local && city ? B(`${city} health department`, `${city}卫生部门`)
      : county && /County/.test(county.en) ? B(`${county.en.split(",")[0]} health department`, `${county.zh.split("，")[0]}卫生部门`) : B("County or city health department", "县或市卫生部门");
    const stEn = st?.en ?? "your state", stZh = st?.zh ?? "所在州";
    // the state layer: sales tax, then the employer account
    if (st?.tax && !forms.some(f => TAX_FORMS.has(f.id))) rows.push({ order: ORDER.tax, f: null, a: generic({
      id: `${code!.toLowerCase()}-tax`, level: "state", name: st.taxName ? B(st.taxName[0], st.taxName[1]) : B(`${st.en} sales tax permit`, `${st.zh}销售税许可证`), agency: B(st.tax[0], st.tax[1]),
      source: { label: host(st.tax[2]), url: st.tax[2] },
      plain: code === "DE" ? B("Delaware has no sales tax, but every business there holds a state business license from the Division of Revenue.", "特拉华州没有销售税，但每家企业都要向州税务处取得营业执照。")
        : B(`Lets you charge sales tax in ${st.en}. Apply before your first sale; most states issue it free.`, `让您可以在${st.zh}收取销售税。首笔销售前申请，多数州免费发放。`),
    }) });
    if (employees && !forms.some(f => EMPLOYER_FORMS.has(f.id))) rows.push({ order: ORDER.employer, f: null, a: generic({
      id: "employer", level: "state", name: B("New employer registration (unemployment insurance)", "新雇主登记（失业保险）"), agency: B(`${stEn} unemployment insurance agency`, `${stZh}失业保险机构`), source: SRC_DOL,
      plain: B("Registers you as an employer with the state once you have staff on payroll. Free.", "有员工发薪后，向州政府登记为雇主。免费。"),
    }) });
    // the local layer, where the registry has no steps for this city yet (a covered city's registry list stands as it
    // is, except that a food place always gets its operating permit listed)
    const foodPlace = food && (segment === "restaurant" || segment === "retail");
    if (foodPlace && buildout && !info.local && !roles().has("plan")) rows.push({ order: ORDER.plan, f: null, a: generic({
      id: "plan-review", level: "county", name: B("Food facility plan review", "食品设施图纸审查"), agency: health, source: SRC_FDA,
      plain: B("The health department reviews your kitchen plans before you build. Nearly every county asks for it before a new food place opens.", "卫生部门在施工前审查厨房图纸。几乎每个县都在新餐饮场所开业前要求这一步。"),
    }) });
    if (foodPlace && !roles().has("food")) rows.push({ order: ORDER.food, f: null, a: generic({
      id: "food-permit", level: "county", name: B("Food establishment health permit", "餐饮场所卫生许可证"), agency: health, source: SRC_FDA, est: B("Issued after the opening inspection", "开业检查通过后发放"),
      plain: B("The permit that lets a food place open. Issued after an inspection, renewed every year.", "让餐饮场所开业的许可证。检查通过后发放，每年续期。"),
    }) });
    if (alcohol && !forms.some(f => f.needs?.alcohol && f.level !== "federal")) rows.push({ order: 71, f: null, a: generic({
      id: "alcohol", level: "state", name: B(`${stEn} alcohol license`, `${stZh}酒类执照`), agency: B(`${stEn} alcohol beverage control agency`, `${stZh}酒类管理机构`), source: SRC_SBA,
      plain: B("Selling beer, wine or spirits takes a state liquor license, and often a local approval too. Odelia finds the agency and the license type for your place.", "销售啤酒、葡萄酒或烈酒须取得州酒类执照，通常还需当地审批。Odelia 会查明您所在地的机构和执照类型。"),
    }) });
    if (!info.local && !roles().has("license")) rows.push({ order: ORDER.license, f: null, a: generic({
      id: "local-license", level: "city", name: B("Local business license or tax registration, if the city requires one", "当地营业执照或营业税登记（如所在城市要求）"), agency: city ? B(`City of ${city}`, `${city}市`) : B("Your city", "所在城市"), source: SRC_SBA,
      plain: B("Many cities register every business inside their limits and charge a yearly tax. Some, like most Texas cities, don't. Odelia checks yours.", "许多城市会登记市内每家企业并收取年费，有些城市（如德州多数城市）则不需要。Odelia 会核实您所在的城市。"),
    }) });
  } else {
    // abroad: the registry's national and city steps; for a country it doesn't cover yet, the EU's common three
    const c = info.country, eu = !!c && EU.has(c), cur = info.currency;
    const cn = { en: info.city?.en ?? where, zh: info.city?.zh ?? where };
    if (!rows.length && eu) {
      rows.push({ order: 10, f: null, a: generic({ id: "company", level: "federal", name: B("Company registration", "公司注册"), agency: B(`${cn.en}'s national business register`, `${cn.zh}所在国的企业登记机关`), source: SRC_EU, currency: cur,
        plain: B("Registers the company in the national business register. Every EU country has one portal for it.", "在国家企业登记机关注册公司。每个欧盟国家都有一个统一的办理入口。") }) });
      rows.push({ order: 25, f: null, a: generic({ id: "vat", level: "federal", name: B("Tax and VAT registration", "税务与增值税登记"), agency: B("National tax authority", "国家税务机关"), source: SRC_EU, currency: cur,
        plain: B("Gives the company its tax and VAT numbers before it starts trading.", "在开始经营前为公司取得税号和增值税号。") }) });
    }
    if (food && !roles().has("food") && (eu || c === "GB")) rows.push({ order: ORDER.food, f: null, a: generic({ id: "food", level: "city", name: B("Food business registration", "食品企业登记"), agency: B("Local food safety authority", "当地食品安全监管机构"), source: SRC_EU, currency: cur,
      plain: B("Food businesses in the EU register with the local authority before opening, which then inspects.", "欧盟的食品企业在开业前向当地监管机构登记，之后接受检查。") }) });
  }

  // in filing order: the company first (its number goes on everything else), then the library's order
  rows.sort((x, y) => (roleOf(x.f, x.a) === "entity" ? ORDER.entity : x.order) - (roleOf(y.f, y.a) === "entity" ? ORDER.entity : y.order));
  const apps = rows.map(r => r.a);
  const byRole = new Map<Role, Application>();
  for (const r of rows) { const role = roleOf(r.f, r.a); if (!byRole.has(role)) byRole.set(role, r.a); }
  // what each step waits on, as the agencies ask for it: the company before the EIN, the EIN before every registration,
  // the plan review before the building permit and the operating permit
  const short = (a: Application): Bi => {
    const acr = /\(([A-Z]{2,6})\)/.exec(a.name.en)?.[1];
    if (acr) return B(acr, acr + " ");
    return B(a.name.en.replace(/^Application for (Registration as an? |)/, "").replace(/\s*\(.*\)$/, ""), a.name.zh.replace(/（.*）$/, "").replace(/申请$/, ""));
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

  // deadlines: the opening, and the day each permit has to be filed by to be in hand for it
  const deadlines: Deadline[] = [];
  if (opening) {
    deadlines.push({ id: "pv-dl-open", date: opening, kind: "milestone", title: B("Target opening", "目标开业日") });
    for (const r of rows) {
      if (!r.f) continue;
      const days = r.f.takesDays !== undefined ? r.f.takesDays : publishedDays(r.f.takes);
      if (days == null) continue;
      deadlines.push({ id: "pv-dl-" + r.f.id, date: addDays(opening, -(days + BUFFER)), kind: "due", app: r.a.id, agency: r.a.agency, title: B(`File the ${r.a.name.en.replace(/^Application for (Registration as a |)/, "")}`, `提交${r.a.name.zh}`) });
    }
  }

  // where the chain puts the opening, with the same arithmetic the store cards use
  const store: Store = { id: o.storeId ?? "store", name: same(where), address: where, stage: "opening", plannedOpen: opening, rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: apps.map(a => a.id) };
  const w = { apps, approvals: [], stores: [store], facts: [], deadlines } as unknown as Workspace;
  const projectedOpen = apps.length ? openingPath(store, w, today).landing : null;

  const layers: Record<Level, number> = { federal: 0, state: 0, county: 0, city: 0 };
  for (const a of apps) layers[a.level]++;
  return {
    apps, deadlines, projectedOpen, segment, food, country, places, local: info.local,
    fromRegistry: rows.filter(r => r.f).length, generic: rows.filter(r => !r.f).length, layers,
    fees: apps.reduce((s, a) => s + a.fees.reduce((t, f) => t + f.amount, 0), 0), varies: apps.filter(a => a.fees.some(f => f.tbd)).length,
  };
}

/** One line for the first screen and the plans sheet: "9 permits for Flushing, 4 with a published fee". */
export function previewLine(p: Pick<PreviewPlan, "apps" | "fees" | "varies">, placeEn: string, placeZh = placeEn): Bi {
  const n = p.apps.length, known = n - p.varies;
  return B(`${n} permit${n === 1 ? "" : "s"} for ${placeEn}, in order${known ? `, ${known} with a published fee` : ""}`, `${placeZh}的 ${n} 项许可，已按顺序排好${known ? `，其中 ${known} 项有公布的费用` : ""}`);
}
