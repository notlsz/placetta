/* How long each step takes, and what the agency charges to make it faster. One table each, read from the agencies' own
   pages, so the opening estimate (src/smart.ts openingPath) and every expedite option (the approval card, the plan row)
   come from the same place.

   Rules this file keeps:
     Times and fees come from the issuing agency: its processing-time page, its form, its fee schedule, or its own
     performance report. A number from anywhere else is labeled a statistic. Where the agency publishes no time, the
     estimate says "no published time" and uses a 30-day default, labeled a default. Nothing here is invented: a span is
     the agency's own numbers, and where it adds them up (a first review plus a recheck) the note says how.
     An expedite fee is the agency's own, passed through to the agency at cost. Placetta never marks it up and never
     charges it: the owner pays the agency, on the agency's page or through the approval card's existing pay step.

   One Expedite type for the whole library (src/forms/registry.ts): the Secretary of State tiers sit on the registry
   rows themselves (src/forms/entities.ts, read through src/forms/speed.ts, fail closed on their proof); this file's
   table holds the rest (plan reviews, building departments, the IRS). expediteOptions merges both, each once. */
import { B, type Bi } from "../bi";
import { formById, type Expedite, type Span } from "./registry";
import { expediteOf as currentTiers, processingOf } from "./speed";
import RESEARCHED from "./times.json";
import { daysFromNow } from "../time";

export type { Expedite, Span };

/** Where a step's time comes from:
 *    agency     the agency's published processing time
 *    report     the agency's own performance report or dashboard (an official average, not a promise)
 *    statistic  a reputable source that isn't the agency, labeled as such
 *    measured   Placetta's own filings of the form (3 or more)
 *    default    no published time: a conservative default, labeled a default */
export type TimeKind = "agency" | "report" | "statistic" | "measured" | "default";

export type Timing = Span & { say: Bi; source?: string; checked?: string; kind: TimeKind; note?: Bi };

const CHECKED = "2026-10-27";

/* ------------------------------------------------------------------ times */

const IRS_EIN = "https://www.irs.gov/businesses/small-businesses-self-employed/how-to-apply-for-an-ein";
const SJ_TIMES = "https://www.sanjoseca.gov/businesses/development-services-permit-center/building-permit-services/standard-plan-review-service/plan-review-time-frames";
const SJ_STAR = "https://sanjoseca.gov/businesses/development-services-permit-center/building-permit-services/streamlined-tenant-alteration-review-star-service";
const SCC_PLAN = "https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/submit-plan-review-restaurants-grocery-stores-and";
const LAC_FORM = "http://publichealth.lacounty.gov/eh/docs/inspection/retail-food-facility-plan-review-service-request.pdf";
const LADBS_RPC = "https://dbs.lacity.gov/services/plan-review-permitting/plan-check-permit/regular-plan-check";
const SF_FEES = "https://media.api.sf.gov/documents/Table_1A-B_-_Other_Building_Permit_and_Plan_Review_Fees_2026.pdf";
const NYC_MMR = "https://www.nyc.gov/assets/operations/downloads/pdf/mmr2026/dob.pdf";
const PHL_PLAN = "https://phila.gov/services/permits-violations-licenses/get-a-license/business-licenses/food-businesses/apply-for-a-plan-review-for-a-stationary-food-business/";
const DAL_QTEAM = "https://dallascityhall.com/departments/sustainabledevelopment/DCH%20documents/Service_First_Bulletins/ServiceFirstBulletinMinorQ-TeamProjects_FINAL_1.17.2023.pdf";
const HOU_EXP = "https://www.houstonhealth.org/media/4206/download";
const AC_GUIDE = "https://health.alamedacountyca.gov/alameda-county-plan-check-guide-for-retail-food-facilities/";
const CMH_FOOD = "https://www.columbus.gov/Services/Food-Protection-Program";

const bd = (fast: number, typical: number, slow: number): Span => ({ fast, typical, slow, unit: "business" });
const cd = (fast: number, typical: number, slow: number): Span => ({ fast, typical, slow, unit: "calendar" });

/** Times read from the agency where its own words need adding up or choosing between (a first review and a recheck, a
 *  form filed by fax rather than mail). Everything else is read from the registry's own "takes" sentence. */
export const TIMES: Record<string, Timing> = {
  // the IRS: fax is how Odelia sends an SS-4 for an owner without an SSN or ITIN
  "irs-ss4": { ...bd(4, 4, 4), kind: "agency", source: IRS_EIN, checked: CHECKED,
    say: B("4 business days by fax", "传真 4 个工作日") },
  "scc-plan-check": { ...bd(20, 20, 20), kind: "agency", source: SCC_PLAN, checked: "2026-10-10",
    say: B("up to 20 business days after payment", "付款后最长 20 个工作日") },
  // San José's Standard Plan Review Service, "Miscellaneous commercial project": 10 working days for the first round, 5
  // for each one after; the span runs from approval on the first review (10) to two rechecks (20)
  "sj-building-ti": { ...bd(10, 15, 20), kind: "agency", source: SJ_TIMES, checked: CHECKED,
    say: B("10 to 20 working days: 10 for the first review, 5 for each recheck", "10 至 20 个工作日：首次审查 10 个，每次复审 5 个"),
    note: B("The range runs from approval on the first review to two rechecks.", "范围从首次审查即获批到两次复审。") },
  // the county issues the operating permit after the final inspection, and publishes no time for that inspection (its
  // "up to 20 business days" is the plan review's, counted on the plan check above, not again here)
  "scc-health-permit": { ...cd(30, 30, 30), kind: "default",
    say: B("issued after the final inspection; no published time, a 30-day default", "竣工检查后签发；未公布办理时间，按默认 30 天估算") },
  "lac-plan-check": { ...bd(20, 20, 20), kind: "agency", source: LAC_FORM, checked: CHECKED,
    say: B("within 20 working days after payment", "付款后 20 个工作日内") },
  // the Mayor's Management Report, FY2026: average days to the first plan review, 4.4 for a minor alteration and 8.4
  // for one that changes the Certificate of Occupancy (DOB NOW). The first review, not the permit.
  "nyc-dob-alt": { ...cd(5, 9, 9), kind: "report", source: NYC_MMR, checked: CHECKED,
    say: B("an average of 4.4 to 8.4 days to the first plan review (FY2026)", "首次图纸审查平均 4.4 至 8.4 天（2026 财年）"),
    note: B("The city's own average to the first plan review, not a promise; corrections add to it.", "市政府公布的首次审查平均天数，并非承诺；需修改时另计。") },
  "phl-plan-review": { ...bd(60, 60, 60), kind: "agency", source: PHL_PLAN, checked: CHECKED,
    say: B("30 business days for the worksheet and fee letter, then 30 for the review", "工作表和缴费通知 30 个工作日，审查再 30 个工作日") },
};

/* ---------------------------------------------------------------- expedite */

/** Los Angeles County's restaurant plan review: the regular fee line and its expedited one, as the form prints them. */
const LAC_TIERS: [string, number, number][] = [
  ["Restaurant/Caterer - NEW: 500 Sq. Ft. or less", 1044, 1566],
  ["Restaurant/Caterer - NEW: 501 - 1,999 Sq. Ft.", 1530, 2295],
  ["Restaurant/Caterer - Remodel: 501 - 1,999 Sq. Ft.", 1530, 2295],
  ["Restaurant/Caterer - NEW: 2,000 - 3,999 Sq. Ft.", 1865, 2798],
  ["Restaurant/Caterer - Remodel: 2,000 - 3,999 Sq. Ft.", 1865, 2798],
  ["Restaurant/Caterer - NEW: 4,000 - 9,999 Sq. Ft.", 2276, 3414],
  ["Restaurant/Caterer - Remodel: 4,000 - 9,999 Sq. Ft.", 2276, 3414],
  ["Restaurant/Caterer - NEW: 10,000 Sq. Ft. or more", 2723, 4085],
  ["Restaurant/Caterer - Remodel: 10,000 Sq. Ft. or more", 2723, 4085],
  ["Restaurant/Caterer - Remodel: 300 Sq. Ft. or less", 315, 473],
  ["Restaurant/Caterer - Remodel: 301 - 500 Sq. Ft.", 1044, 1566],
];
const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LAC_MAP = Object.fromEntries(LAC_TIERS.map(([k, r, e]) => [`${k} - ${usd(r)}`, `${k} (Expedited) - ${usd(e)}`]));
const LAC_EXTRA = Object.fromEntries(LAC_TIERS.map(([k, r, e]) => [`${k} - ${usd(r)}`, e - r]));

export const EXPEDITE: Record<string, Expedite[]> = {
  // free and faster: the IRS issues an EIN online at once (an owner with an SSN or ITIN), or on the phone to an
  // international applicant; Placetta's team does either with the owner
  "irs-ss4": [
    { id: "online", label: B("Online", "在线申请"), feeUsd: 0, turnaround: B("issued immediately", "当场签发"), hours: 0, span: cd(0, 0, 0), source: { url: IRS_EIN, quote: "an EIN is issued immediately", checked: CHECKED }, how: "team",
      only: B("Only when the responsible party has an SSN or ITIN.", "仅限负责人有 SSN 或 ITIN。") },
    { id: "phone", label: B("By phone (international applicants)", "电话申请（境外申请人）"), feeUsd: 0, turnaround: B("issued during the call, 267-941-1099", "通话中签发，267-941-1099"), hours: 0, span: cd(0, 0, 0), source: { url: IRS_EIN, quote: "267-941-1099 (not a toll-free number)", checked: CHECKED }, how: "team",
      only: B("For an applicant with no legal residence or place of business in the US.", "适用于在美国没有合法居所或营业地点的申请人。") },
  ],
  "lac-plan-check": [
    { id: "expedited", label: B("Expedited plan review", "加急图纸审查"), feeUsd: null, feeNote: B("50% more than the regular fee for the size: $1,530 becomes $2,295 for 501 to 1,999 sq ft.", "按面积档在常规费用上加 50%：501 至 1,999 平方英尺由 1,530 美元变为 2,295 美元。"),
      turnaround: B("within 10 working days after payment", "付款后 10 个工作日内"), hours: null, span: bd(10, 10, 10), source: { url: LAC_FORM, quote: "Plans shall be reviewed within 20 (regular) or 10 (expedited) working days after receipt of payment.", checked: CHECKED }, how: "form",
      fill: { line: "square_footage", value: LAC_MAP }, tiers: { line: "square_footage", extra: LAC_EXTRA },
      only: B("The county asks you to confirm the expedited service is available before paying for it.", "县政府要求付款前先确认可提供加急服务。") },
  ],
  "sj-building-ti": [
    { id: "star", label: B("STAR review (Streamlined Tenant Alteration Review)", "STAR 快速租户装修审查"), feeUsd: null,
      feeNote: B("A premium fee on the city's Building Fee Schedule; the STAR page doesn't state the amount.", "按市建筑收费表收取附加费；STAR 页面未列明金额。"),
      turnaround: B("one 90-minute review meeting at City Hall with Planning, Building, Public Works and Fire, instead of rounds of review", "在市政厅与规划、建筑、公共工程和消防部门开一次 90 分钟审查会，代替多轮审查"),
      hours: null, source: { url: SJ_STAR, quote: "a 90-minute, in-person meeting at City Hall", checked: CHECKED }, how: "team",
      only: B("For eligible tenant improvements: the city confirms eligibility from a request form first.", "限符合条件的租户装修：市政府先根据申请表确认资格。") },
  ],
  "la-ladbs": [
    { id: "expedited", label: B("Expedited plan check", "加急图纸审查"), feeUsd: null, feeNote: B("50% of the plan check fee, added to it.", "在图纸审查费基础上加收 50%。"),
      turnaround: B("reviewed ahead of the regular queue; LADBS publishes no time for it", "优先于常规队列审查；LADBS 未公布时间"), hours: null, source: { url: LADBS_RPC, quote: "With 50% more of the plan check fee paid, the plan check review will be expedited.", checked: CHECKED }, how: "team" },
  ],
  "sf-dbi-building": [
    { id: "premium", label: B("Premium plan review", "优先图纸审查"), feeUsd: null, feeNote: B("50% of the plan review fee plus $1,000 (Table 1A-B, permits issued from July 12, 2026).", "图纸审查费的 50% 另加 1,000 美元（1A-B 表，适用于 2026 年 7 月 12 日起签发的许可）。"),
      turnaround: B("reviewed ahead of standard plan review; DBI publishes no time for it", "优先于标准审查；DBI 未公布时间"), hours: null, source: { url: SF_FEES, quote: "50% of Plan Review Fee plus $1,000", checked: CHECKED }, how: "team" },
  ],
  "dal-building": [
    { id: "q-team", label: B("Minor Commercial Q-Team express plan review", "小型商业 Q-Team 快速审查"), feeUsd: null,
      feeNote: B("A $500 intake fee plus $1,000 an hour of review, at most $2,000: $1,500 to $2,500 on top of the permit fees.", "500 美元受理费，另加每小时 1,000 美元审查费、最多 2,000 美元：在许可费之外共 1,500 至 2,500 美元。"),
      turnaround: B("reviewed on the day of the appointment, booked at least 5 days ahead; corrections within 5 business days", "预约当天审查，须提前至少 5 天预约；修改后 5 个工作日内复审"),
      hours: null, span: cd(5, 5, 12), source: { url: DAL_QTEAM, quote: "Less than 10,000 square feet total including any expansions.", checked: CHECKED }, how: "form",
      fill: { line: "review_type", value: "Minor Commercial Q-Team Express Plan Review", standard: "Standard plan review" },
      only: B("Interior finish-outs under 10,000 sq ft in the existing footprint.", "限现有建筑范围内 10,000 平方英尺以下的室内装修。") },
  ],
  "phl-plan-review": [
    { id: "expedited", label: B("Expedited review", "加急审查"), feeUsd: 380, turnaround: B("completed within 10 business days", "10 个工作日内完成"), hours: null, span: bd(10, 10, 10),
      source: { url: PHL_PLAN, quote: "There is an expediting fee of $380 in addition to the fees based on the establishment's square footage.", checked: CHECKED }, how: "team", only: B("Requested by phone at (215) 685-7495, with every document in and the fee paid.", "致电 (215) 685-7495 申请，须材料齐全并已缴费。") },
  ],
  "ac-plan-check": [
    { id: "expedited", label: B("Expedited review", "加急审查"), feeUsd: null, feeNote: B("The county's guide doesn't list the expedite fee; the team confirms it.", "县指南未列出加急费用，由团队确认。"),
      turnaround: B("a first response within 7 working days", "7 个工作日内首次答复"), hours: null, span: bd(7, 7, 7), source: { url: AC_GUIDE, quote: "Expedited Plan Review provides 1st response time within 7 working days.", checked: CHECKED }, how: "team" },
  ],
  "cmh-plan-review": [
    { id: "expedited", label: B("Expedited review", "加急审查"), feeUsd: 1400, turnaround: B("plans reviewed within two business days", "两个工作日内审查图纸"), hours: null, span: bd(2, 2, 2), source: { url: CMH_FOOD, quote: "Requires an additional payment of $1,400 to be submitted with the application and plan review fee.", checked: CHECKED }, how: "team" },
  ],
  "hou-plan-review": [
    { id: "expedited", label: B("Expedited plan review", "加急图纸审查"), feeUsd: null,
      feeNote: B("Set by project value; the department's published schedule is from 2022 and has since gone up, so the team confirms it.", "按项目金额收费；卫生局公布的收费表为 2022 年版且已上调，由团队确认。"),
      turnaround: B("within 1 to 2 business days, at the plan analyst's earliest opening", "按审查员最早空档，1 至 2 个工作日内"), hours: null, span: bd(1, 2, 2), source: { url: HOU_EXP, quote: "Expedited review will be performed based on the earliest availability of the plan analyst within 1-2 business days.", checked: CHECKED }, how: "team" },
  ],
};

/* ------------------------------------------------------------- the helpers */

/** A tier's turnaround in hours as days for the estimate: same day or sooner is the day it's filed. */
const fromHours = (h: number | null): Span | undefined => (h == null ? undefined : cd(Math.ceil(h / 24), Math.ceil(h / 24), Math.ceil(h / 24)));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export type Option = Expedite & { id: string; span?: Span };

/** Every way the agency offers to go faster for a form, each once: the registry row's own tiers (the Secretary of State's,
 *  only while their quote is current, src/forms/speed.ts), then this file's. Each gets an id and a span for the estimate. */
export function expediteOptions(formId?: string, today = daysFromNow(0)): Option[] {
  if (!formId) return [];
  const f = formById(formId);
  const list: Expedite[] = [...currentTiers(f, today), ...(EXPEDITE[formId] ?? [])];
  const seen = new Set<string>();
  const out: Option[] = [];
  for (const x of list) {
    const id = x.id ?? (slug(x.label.en) || `option-${out.length + 1}`);
    if (seen.has(id) || seen.has("label:" + x.label.en.toLowerCase())) continue;
    seen.add(id); seen.add("label:" + x.label.en.toLowerCase());
    out.push({ ...x, id, how: x.how ?? "team", ...(x.span ?? fromHours(x.hours) ? { span: x.span ?? fromHours(x.hours) } : {}) });
  }
  return out;
}

/** The agency's extra fee for an option, for this application's answers (the size tier on the form), or null. */
export function extraFee(x: Expedite, fields: { id: string; value: string }[] = []): number | null {
  if (x.tiers) { const v = fields.find(f => f.id === x.tiers!.line)?.value?.trim(); const hit = v != null ? x.tiers.extra[v] : undefined; if (hit != null) return hit; }
  return x.feeUsd;
}

/** A span in calendar days: a business day is 7/5 of one. */
export const calendarDays = (n: number, unit: Span["unit"]) => (unit === "business" ? Math.ceil((n * 7) / 5) : Math.ceil(n));

const WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };

/** A span from the agency's own sentence: its first stated time ("2 to 3 business days", "up to 20 business days",
 *  "Average: 2 weeks", "Often issued the same day"). Weeks and months count as 7 and 30 days. null when the sentence
 *  states no time, or says none is published. */
export function spanFromWords(text?: string): Span | null {
  const t = (text ?? "").toLowerCase();
  if (!t || /^no standard time|doesn'?t publish|not publish|no published/.test(t)) return null;
  const m = /(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve)(?:\s*(?:to|-|–)\s*(\d+(?:\.\d+)?))?[\s-]*(business days?|working days?|days?|weeks?|months?)/.exec(t);
  if (!m) return /same day|instantly|immediately|on screen as soon as|issued on the call/.test(t) ? cd(1, 1, 1) : null;
  const lo = Number(WORD[m[1]] ?? m[1]), hi = Number(m[2] ?? lo);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const unit = m[3];
  const k = unit.startsWith("week") ? 7 : unit.startsWith("month") ? 30 : 1;
  const biz = unit.startsWith("business") || unit.startsWith("working");
  const typical = Math.ceil(((lo + hi) / 2) * k);
  return { fast: Math.ceil(lo * k), typical, slow: Math.ceil(hi * k), unit: biz ? "business" : "calendar" };
}

/** "10 to 20 working days", "4 business days", "2 weeks": a span said in words. */
export function spanSay(s: Span): Bi {
  const biz = s.unit === "business";
  const one = (n: number): Bi => !biz && n >= 14 && n % 7 === 0 ? B(`${n / 7} weeks`, `${n / 7} 周`) : B(`${n} ${biz ? "business " : ""}day${n === 1 ? "" : "s"}`, `${n} ${biz ? "个工作日" : "天"}`);
  if (s.fast === s.slow) return s.slow === 0 ? B("the same day", "当天") : one(s.slow);
  const weeks = !biz && s.fast >= 14 && s.slow % 7 === 0 && s.fast % 7 === 0;
  return weeks ? B(`${s.fast / 7} to ${s.slow / 7} weeks`, `${s.fast / 7} 至 ${s.slow / 7} 周`)
    : B(`${s.fast} to ${s.slow} ${biz ? "business " : ""}days`, `${s.fast} 至 ${s.slow} ${biz ? "个工作日" : "天"}`);
}

/** The conservative default for a step with no published time: 30 days, said as a default. */
export const DEFAULT_TIMING: Timing = { ...cd(30, 30, 30), kind: "default", say: B("no published time; a 30-day default", "未公布办理时间，按默认 30 天估算") };

/** The source part of a "takesSource" ("https://… (2026-10-10)"): the URL and the day it was read. */
export function splitSource(s?: string): { url?: string; checked?: string } {
  if (!s) return {};
  const m = /^(\S+)(?:\s+\((\d{4}-\d{2}-\d{2})\))?/.exec(s.trim());
  return m ? { url: m[1], checked: m[2] } : {};
}

/** How long a step takes, from the best source there is: this file's table, the registry's sentence and its source, the
 *  application's own sentence with the agency page it cites, or the default. */
export function timingOf(a: { official?: string; est?: Bi; source?: { url: string } }, today = daysFromNow(0)): Timing {
  const f = a.official ? formById(a.official) : undefined;
  if (f && TIMES[f.id]) return TIMES[f.id];
  // the registry row's own standard time (the Secretary of State's), while its quote is current (src/forms/speed.ts)
  const p = processingOf(f, today);
  if (p?.days != null) return { ...cd(p.days, p.days, p.days), kind: "agency", say: p.standard, source: p.source.url, checked: p.source.checked };
  // a time the research read from a page other than the one stating it (published: false) is no published time
  const r = f ? (RESEARCHED as Record<string, { published?: boolean }>)[f.id] : undefined;
  if (r && r.published === false && f && splitSource(f.takesSource).url) return DEFAULT_TIMING;
  const src = splitSource(f?.takesSource);
  const words = f?.takes ?? (f || a.source?.url ? a.est : undefined);
  const sp = spanFromWords(words?.en);
  if (sp && words) return { ...sp, kind: "agency", say: spanSay(sp), source: src.url ?? f?.info ?? a.source?.url, checked: src.checked };
  if (f?.takesDays != null) return { ...cd(f.takesDays, f.takesDays, f.takesDays), kind: "agency", say: spanSay(cd(f.takesDays, f.takesDays, f.takesDays)), source: src.url ?? f.info, checked: src.checked };
  return DEFAULT_TIMING;
}

/** The host of a source, for "per sanjoseca.gov". */
export const hostOf = (u?: string) => { if (!u) return ""; try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
