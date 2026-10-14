import type { OrbState } from "thinking-orbs";
import { ago, inDays } from "./time";

/* The workspace the agent keeps for one business: every application with its checklist, filled form,
   fees and source; the documents behind them; deadlines; the approval queue; an audit trail of every
   action; and the facts the agent has committed to memory. Everything here is sample data. */

import { B, same, type Bi } from "./bi";
export { B, same, type Bi };

export type Level = "federal" | "state" | "county" | "city";
/** approved: issued. review: filed, the agency is reviewing. ready: complete, waiting for your approval.
 *  filing: approved by you, with Placetta's filing team. needs: needs a document or answer from you. draft: Placetta is preparing it. waiting: blocked by another application. todo: not started. */
export type Status = "approved" | "review" | "filing" | "ready" | "needs" | "draft" | "waiting" | "todo";
export type Actor = "agent" | "you" | "agency" | "team";

export type Field = { id: string; label: Bi; value: string; from?: Bi; quote?: string };   // quote: the document's own words the value came from
export type Fee = { label: Bi; amount: number; tbd?: boolean };   // tbd: the agency sets it (by size, risk or sales); amount is 0 or a floor
/** ISO currency of an application's fees; USD when absent. */
export type Currency = string;
export type CheckItem = {
  id: string;
  label: Bi;
  state: "done" | "missing" | "auto";   // auto: Placetta prepares it
  doc?: string;                          // document id once it's in
  note?: Bi;
  extracted?: [Bi, string, string?][];   // what the agent read out of the upload, with the words it read it from
  dep?: string;                          // comes from another application, not an upload
};

export type Application = {
  id: string;
  name: Bi;
  agency: Bi;
  level: Level;
  status: Status;
  next?: Bi;
  critical?: boolean;        // on the chain that sets the opening date
  fees: Fee[];
  currency?: Currency;
  feeNote?: Bi;
  est: Bi;                   // how long the agency usually takes
  source: { label: string; url: string };
  form?: Bi;                 // the form Placetta fills
  fields: Field[];
  checklist: CheckItem[];
  receipt?: string;          // document id
  renews?: Bi;
  official?: string;         // the official form in the library (src/forms/registry.ts) this application is
};

export type DocKind = "pdf" | "xlsx" | "jpg" | "docx" | "csv" | "zip";
export type Doc = { id: string; name: string; kind: DocKind; size: number; by: Actor; at: string; app?: string; tag: Bi; path?: string };   // path: stored file in the account

export type Deadline = { id: string; date: string; kind: "due" | "renewal" | "estimate" | "milestone"; title: Bi; agency?: Bi; app?: string; ask?: Bi; prompt?: Bi };
export type Nudge = { id: string; tone: "warn" | "info"; text: Bi; ask: Bi; prompt: Bi; sample?: boolean };

export type ApprovalKind = "file" | "send" | "upload" | "pay" | "change";
export type Approval = {
  id: string;
  kind: ApprovalKind;
  app?: string;
  title: Bi;
  agency?: Bi;
  does: Bi[];               // exactly what Placetta will do, in order
  data?: Field[];           // for messages; filings show the application's own fields
  action: Bi;
  url?: string;             // pay: the agency's payment link
  fee?: number;             // pay: the amount the agency asks for
  filing?: string;          // pay: the filing it belongs to
  change?: Change;          // change: what the agent will change once you confirm
};
/** A change to something that already exists, which the agent only makes after you confirm it. */
export type Change =
  | { op: "move_store"; store: string; name?: string; address?: string; city: string; state: string; planned_open?: string }
  | { op: "remove_store"; store: string }
  | { op: "remove_app"; app: string };

/** Something that changed or is coming up, found by the daily monitor (or, in the sample, worked out from the deadlines). */
export type UpdateItem = { id: string; kind: "deadline" | "renewal" | "filing" | "payment" | "team" | "mail"; title: Bi; body?: Bi; app?: string; at: string; read: boolean; prompt?: Bi };

export type Audit = { id: string; at: string; actor: Actor; who?: Bi; action: Bi; object: Bi; detail?: Bi };
export type FactGroup = "business" | "location" | "operations" | "rules";
export type Fact = { id: string; group: FactGroup; label: Bi; value: Bi; source: Bi; locked?: boolean };
export type Task = { id: string; state: OrbState; label: Bi; detail?: Bi };
export type Connection = { id: string; name: Bi; level: Level | "vault"; state: "connected" | "missing"; detail: Bi };
export type Location = { id: string; name: Bi; county: Bi; state: "active" | "mapping" };

/* ----------------------------- stores (daily compliance) ----------------------------- */
// Vanta's shape for restaurants: every store inspection-ready every day, measured, with the three numbers that
// show the value: opened on time, stayed open, no fines.
export type LogKind = "temps" | "cleaning" | "pest";
export type DailyLog = { date: string; kind: LogKind; done: boolean; by?: string; reading?: string };
export type Cert = { id: string; person: string; kind: Bi; expires: string };
export type MockCheck = { id: string; area: Bi; label: Bi; ok: boolean | null };
export type StoreRule = "nyc_grades" | "nyc_fww";
export type Store = {
  id: string;
  name: Bi;
  address: string;
  stage: "open" | "opening";
  plannedOpen?: string;          // the date the brand planned to open
  opened?: string;               // the date it opened
  projectedOpen?: string;        // for stores still opening: where the critical path lands now
  grade?: { letter: "A" | "B" | "C" | "P"; date: string };   // P: grade pending
  rules: StoreRule[];            // local regimes that apply (NYC letter grades, NYC Fair Workweek)
  logs: DailyLog[];              // the last two weeks of daily food-safety logs
  certs: Cert[];                 // staff certificates and their expiry
  schedule?: { postedThrough: string; changes: number; premiumOwed: number; source: Bi };
  mock?: { date: string; checks: MockCheck[] };
  value: { closures: number; fines: number; caught: number };   // fines paid; problems caught before an inspector did
  apps?: string[];               // applications that belong to this store
  permits?: { name: Bi; expires: string }[];   // permits on file for an open store
};

export type Workspace = {
  business: Bi;
  goal: Bi;
  locations: Location[];
  apps: Application[];
  docs: Doc[];
  deadlines: Deadline[];
  nudges: Nudge[];
  approvals: Approval[];
  closed: Approval[];       // answered approvals, so earlier messages can show them as done
  audit: Audit[];
  facts: Fact[];
  running: Task[];
  connections: Connection[];
  stores?: Store[];
  meta?: { mapped?: boolean; city?: string; region?: string; entity?: string; what?: string };   // account workspaces only
  memories?: Record<string, MemoryBook>;   // each person's memory, by user id
  chats?: Record<string, ChatLine[]>;      // each person's past chats with the agent, by user id, for "search past chats"
  skills?: Skill[];                        // how Placetta gets things done here: learned as it works, or written by you
  skillsAuto?: boolean;                    // let Placetta create skills as it works (on unless turned off)
};
/** A skill: instructions Placetta follows for one kind of job. "auto" ones it wrote itself from a job it finished;
 *  "form" skills also carry where each line of an official form came from, so the next filing of it fills itself. */
export type SkillSource = "placetta" | "auto" | "you";
export type Skill = {
  id: string; name: Bi; description: Bi; body: string; source: SkillSource; on: boolean;
  kind: "form" | "place" | "workflow" | "custom";
  key?: string;                            // form:<official form id> or place:<city code>
  fills?: { line: string; from: string }[]; // form skills: each line and where its value came from (never the value)
  uses: number; created: string; updated: string; lastSteps?: number; firstSteps?: number;
};
export type MemoryKind = "you" | "topic" | "area";
export type MemoryFile = { id: string; kind: MemoryKind; name: string; summary: string; lines: string[]; updated: string; sensitive?: boolean };
export type MemorySettings = { searchChats: boolean; generate: boolean; sensitive: boolean };
export type MemoryBook = { settings: MemorySettings; files: MemoryFile[] };
export type ChatLine = { at: string; role: "you" | "agent"; text: string };

/* ------------------------------------------------------------------ */

const SJ = B("City of San Jose", "圣何塞市");
const PBCE = B("San Jose Planning, Building and Code Enforcement", "圣何塞市规划、建筑与执法局");
const DEH = B("Santa Clara County Environmental Health", "圣克拉拉县环境卫生局");
const SRC = {
  irs: { label: "irs.gov", url: "https://www.irs.gov" },
  cdtfa: { label: "cdtfa.ca.gov", url: "https://www.cdtfa.ca.gov" },
  edd: { label: "edd.ca.gov", url: "https://edd.ca.gov" },
  cdph: { label: "cdph.ca.gov", url: "https://www.cdph.ca.gov" },
  sos: { label: "sos.ca.gov", url: "https://www.sos.ca.gov" },
  scc: { label: "sccgov.org", url: "https://www.sccgov.org" },
  sj: { label: "sanjoseca.gov", url: "https://www.sanjoseca.gov" },
  fremont: { label: "fremont.gov", url: "https://www.fremont.gov" },
  acgov: { label: "acgov.org", url: "https://www.acgov.org" },
};
export { SRC };

const NAME = "Moonleaf Tea LLC";
const ADDR = "North First Street, San Jose, CA (sample)";
const F = (id: string, en: string, zh: string, value: string, from?: Bi): Field => ({ id, label: B(en, zh), value, from });
const fromCtx = B("From Context", "来自资料");
const fromLease = B("From your lease", "来自租约");
const fromPhotos = B("From storefront photos", "来自门店照片");
const fromYou = B("You told me", "您告诉我的");

/* Sample stores: one open in Queens (NYC rules apply), one opening in San Jose. All sample data. */
const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => inDays(from + i));
const LOG_MISSED = new Set([inDays(-9) + "pest", inDays(-4) + "cleaning"]);
export const SAMPLE_STORES: Store[] = [
  {
    id: "flushing", name: B("Flushing, Main St", "法拉盛 Main St 店"), address: "Main St, Flushing, NY (sample)", stage: "open",
    plannedOpen: inDays(-131), opened: inDays(-131), grade: { letter: "A", date: inDays(-41) }, rules: ["nyc_grades", "nyc_fww"],
    logs: days(-13, -1).flatMap(d => (["temps", "cleaning", "pest"] as LogKind[]).map((k): DailyLog => ({ date: d, kind: k, done: !LOG_MISSED.has(d + k), by: k === "temps" ? "Wen" : "Marco", reading: k === "temps" ? "Walk-in 38°F, reach-in 36°F" : undefined })))
      .concat([{ date: inDays(0), kind: "temps", done: true, by: "Wen", reading: "Walk-in 37°F, reach-in 36°F" }, { date: inDays(0), kind: "cleaning", done: true, by: "Marco" }, { date: inDays(0), kind: "pest", done: false }]),
    certs: [
      { id: "c1", person: "Wen L.", kind: B("Food Protection Certificate", "食品保护证书"), expires: inDays(412) },
      { id: "c2", person: "Marco D.", kind: B("Food Protection Certificate", "食品保护证书"), expires: inDays(19) },
      { id: "c3", person: "Ana P.", kind: B("Food Protection Certificate", "食品保护证书"), expires: inDays(233) },
    ],
    schedule: { postedThrough: inDays(15), changes: 1, premiumOwed: 0, source: B("Entered by you", "您录入的") },
    mock: { date: inDays(-6), checks: [
      { id: "m1", area: B("Temperature", "温度"), label: B("Cold food held at 41°F or below", "冷藏食品保持在 41°F 以下"), ok: true },
      { id: "m2", area: B("Temperature", "温度"), label: B("Thermometer in every fridge", "每台冰箱都有温度计"), ok: false },
      { id: "m3", area: B("Hygiene", "卫生"), label: B("Hand sink stocked and unblocked", "洗手池备品齐全且畅通"), ok: true },
      { id: "m4", area: B("Hygiene", "卫生"), label: B("Gloves or utensils for ready-to-eat food", "即食食品使用手套或器具"), ok: true },
      { id: "m5", area: B("Pests", "虫害"), label: B("No signs of pests; service log current", "无虫害迹象，防治记录最新"), ok: true },
      { id: "m6", area: B("Storage", "存放"), label: B("Food stored 6 inches off the floor", "食品离地 6 英寸存放"), ok: true },
      { id: "m7", area: B("People", "人员"), label: B("A certified supervisor on duty", "有持证主管在岗"), ok: true },
      { id: "m8", area: B("Posting", "张贴"), label: B("Letter grade and permit displayed", "字母评级和许可证已张贴"), ok: true },
    ] },
    value: { closures: 0, fines: 0, caught: 3 },
    permits: [
      { name: B("Food Service Establishment permit", "餐饮服务场所许可证"), expires: inDays(212) },
      { name: B("Certificate of Authority (sales tax)", "销售税授权证书"), expires: inDays(9999) },
      { name: B("Sidewalk sign approval", "人行道招牌批准"), expires: inDays(41) },
    ],
  },
  {
    id: "sanjose", name: B("San Jose, North First St", "圣何塞 North First St 店"), address: ADDR, stage: "opening",
    plannedOpen: inDays(162), projectedOpen: inDays(154), rules: [], logs: [], certs: [
      { id: "c4", person: "Jun H.", kind: B("California Food Handler Card", "加州食品从业人员卡"), expires: inDays(1080) },
    ],
    value: { closures: 0, fines: 0, caught: 1 },
    apps: ["ein", "seller", "edd", "handler", "plancheck", "pto", "btc", "building", "sign", "fire"],
  },
];

export const SAMPLE: Workspace = {
  business: B("Moonleaf Tea", "Moonleaf Tea 奶茶"),
  goal: B("Open by March 2027", "2027 年 3 月开业"),
  locations: [
    { id: "sj", name: B("San Jose", "圣何塞"), county: B("Santa Clara County", "圣克拉拉县"), state: "active" },
  ],
  apps: [
    {
      id: "ein", name: B("Employer Identification Number", "雇主识别号码（EIN）"), agency: B("IRS", "美国国税局"), level: "federal", status: "approved",
      next: B("Issued. On file in Documents", "已签发，存于文件中"), fees: [{ label: B("Application", "申请"), amount: 0 }], est: B("Issued right away online", "网上申请即时签发"),
      source: SRC.irs, form: B("Online EIN application", "EIN 网上申请"), receipt: "d-ein",
      fields: [F("name", "Legal name", "法定名称", NAME, fromCtx), F("type", "Entity type", "实体类型", "Limited liability company", fromCtx), F("reason", "Reason for applying", "申请原因", "Started a new business", fromYou)],
      checklist: [{ id: "art", label: B("Articles of organization", "公司章程（组织章程）"), state: "done", doc: "d-art" }],
    },
    {
      id: "seller", name: B("Seller's permit", "销售许可证"), agency: B("California Department of Tax and Fee Administration", "加州税费管理局"), level: "state", status: "approved",
      next: B("Issued. First sales tax return later this year", "已签发，年内需提交首次销售税申报"), fees: [{ label: B("Permit", "许可证"), amount: 0 }], est: B("Usually 1 to 3 business days online", "网上申请通常 1 至 3 个工作日"),
      source: SRC.cdtfa, form: B("Online seller's permit registration", "销售许可证网上登记"), receipt: "d-seller",
      fields: [F("name", "Business name", "企业名称", NAME, fromCtx), F("addr", "Business address", "营业地址", ADDR, fromLease), F("sells", "What you sell", "销售内容", "Milk tea, fruit tea, packaged snacks", fromCtx)],
      checklist: [{ id: "ein", label: B("EIN", "EIN"), state: "done", doc: "d-ein" }, { id: "lease", label: B("Lease", "租约"), state: "done", doc: "d-lease" }],
    },
    {
      id: "edd", name: B("Employer payroll tax registration", "雇主工资税登记"), agency: B("California Employment Development Department", "加州就业发展局"), level: "state", status: "draft",
      next: B("Placetta is finishing it. No fee", "快哉正在完成填写，无需费用"), fees: [{ label: B("Registration", "登记"), amount: 0 }], est: B("Employer account number in about 2 weeks", "约 2 周内获得雇主账号"),
      source: SRC.edd, form: B("Commercial employer registration (e-Services for Business)", "商业雇主登记（企业在线服务）"),
      fields: [
        F("name", "Business legal name", "企业法定名称", NAME, fromCtx), F("fein", "Federal EIN", "联邦 EIN", "••-•••4471", fromCtx),
        F("type", "Ownership type", "所有权类型", "Limited liability company", fromCtx), F("naics", "Industry (NAICS)", "行业（NAICS）", "722515 Snack and nonalcoholic beverage bars", B("Placetta matched your menu", "快哉根据菜单匹配")),
        F("staff", "Employees", "员工人数", "6", fromYou), F("wages", "First date wages paid", "首次发薪日", inDays(27), fromYou),
      ],
      checklist: [
        { id: "ein", label: B("EIN", "EIN"), state: "done", doc: "d-ein" },
        { id: "payroll", label: B("First payroll date", "首次发薪日"), state: "done", note: fromYou },
        { id: "form", label: B("Registration form", "登记表"), state: "auto", note: B("Placetta is filling it", "快哉正在填写") },
      ],
    },
    {
      id: "handler", name: B("Food handler cards (6 staff)", "食品从业人员卡（6 名员工）"), agency: B("California Retail Food Code", "加州零售食品法规"), level: "state", status: "needs",
      next: B("2 of 6 cards in", "6 张中已收到 2 张"), fees: [{ label: B("Course and exam, 6 × $15 (typical)", "课程与考试，6 × $15（常见价格）"), amount: 90 }], est: B("About 2 hours per person. Due within 30 days of hire", "每人约 2 小时，入职 30 天内须取得"),
      source: SRC.cdph,
      fields: [F("staff", "Staff who handle food", "接触食品的员工", "6", fromYou)],
      checklist: [
        { id: "s1", label: B("A. Lin", "A. Lin"), state: "done", doc: "d-fh1" },
        { id: "s2", label: B("B. Kim", "B. Kim"), state: "done", doc: "d-fh2" },
        { id: "s3", label: B("C. Ortiz", "C. Ortiz"), state: "missing" },
        { id: "s4", label: B("D. Nguyen", "D. Nguyen"), state: "missing" },
        { id: "s5", label: B("E. Chen", "E. Chen"), state: "missing" },
        { id: "s6", label: B("F. Patel", "F. Patel"), state: "missing" },
      ],
    },
    {
      id: "plancheck", name: B("Food facility plan check", "食品设施图纸审查"), agency: DEH, level: "county", status: "needs", critical: true,
      next: B("Needs your floor plan and equipment list", "需要您的平面图和设备清单"), fees: [{ label: B("Plan review, beverage facility", "图纸审查，饮品类设施"), amount: 1385 }], feeNote: B("Sample estimate. Placetta confirms the fee before you pay.", "示例估算。付款前快哉会核实费用。"),
      est: B("15 to 20 business days after a complete submission", "材料齐全后 15 至 20 个工作日"), source: SRC.scc, form: B("Food facility plan check application", "食品设施图纸审查申请"),
      fields: [
        F("name", "Facility name", "设施名称", "Moonleaf Tea", fromCtx), F("addr", "Site address", "场地地址", ADDR, fromLease),
        F("type", "Operation", "经营类型", "Beverages made to order, prepackaged snacks. No cooking", fromCtx), F("area", "Floor area", "面积", "1,150 sq ft", fromLease),
        F("seats", "Seats", "座位", "", B("Waiting for the floor plan", "等待平面图")), F("sinks", "Hand sinks", "洗手池", "", B("Waiting for the floor plan", "等待平面图")),
        F("heater", "Water heater", "热水器", "", B("Waiting for the equipment list", "等待设备清单")),
      ],
      checklist: [
        { id: "lease", label: B("Lease", "租约"), state: "done", doc: "d-lease" },
        { id: "menu", label: B("Menu", "菜单"), state: "done", doc: "d-menu" },
        { id: "fp", label: B("Floor plan, to scale", "按比例绘制的平面图"), state: "missing" },
        { id: "eq", label: B("Equipment list with spec sheets", "设备清单及规格表"), state: "missing" },
        { id: "finish", label: B("Finish schedule (floors, walls, ceilings)", "装修材料表（地面、墙面、天花）"), state: "auto", doc: "d-finish", note: B("Drafted by Placetta from your photos", "快哉根据照片起草") },
      ],
    },
    {
      id: "pto", name: B("Health permit to operate", "食品经营卫生许可"), agency: DEH, level: "county", status: "waiting", critical: true,
      next: B("Issued at the final inspection", "最终检查通过后签发"), fees: [{ label: B("Annual permit, beverage facility", "年度许可，饮品类设施"), amount: 919 }], feeNote: B("Sample estimate.", "示例估算。"),
      est: B("Issued on the day of the final inspection", "最终检查当天签发"), source: SRC.scc, renews: B("Every year", "每年"),
      fields: [], checklist: [{ id: "plan", label: B("Approved plan check", "已批准的图纸审查"), state: "missing", dep: "plancheck" }],
    },
    {
      id: "btc", name: B("Business Tax Certificate", "营业税证书"), agency: B("San Jose Finance Department", "圣何塞市财政局"), level: "city", status: "review",
      next: B("Filed 2 days ago. Decision expected in about 12 days", "2 天前已提交，预计约 12 天后出结果"), fees: [{ label: B("Business tax, 6 employees", "营业税，6 名员工"), amount: 243 }], feeNote: B("Paid. Sample amount.", "已支付。示例金额。"),
      est: B("Usually 1 to 2 weeks", "通常 1 至 2 周"), source: SRC.sj, form: B("Business tax registration", "营业税登记"), receipt: "d-btc", renews: B("Every year", "每年"),
      fields: [F("name", "Business name", "企业名称", NAME, fromCtx), F("addr", "Business address", "营业地址", ADDR, fromLease), F("staff", "Employees", "员工人数", "6", fromYou), F("start", "Start date in San Jose", "在圣何塞开始营业日期", "March 2027", fromYou)],
      checklist: [{ id: "ein", label: B("EIN", "EIN"), state: "done", doc: "d-ein" }, { id: "seller", label: B("Seller's permit", "销售许可证"), state: "done", doc: "d-seller" }],
    },
    {
      id: "building", name: B("Building permit for the build-out", "店面装修建筑许可"), agency: PBCE, level: "city", status: "waiting", critical: true,
      next: B("Starts once the county approves the plans", "县政府批准图纸后开始"), fees: [{ label: B("Plan review and permit, based on valuation", "按工程估值计算的审图与许可费"), amount: 2800 }], feeNote: B("Sample estimate. Depends on the construction value.", "示例估算，取决于工程造价。"),
      est: B("4 to 8 weeks of plan review", "审图 4 至 8 周"), source: SRC.sj, form: B("Tenant improvement permit", "租户装修许可"),
      fields: [F("addr", "Site address", "场地地址", ADDR, fromLease), F("scope", "Scope", "工程范围", "Tenant improvement for a beverage shop", fromCtx)],
      checklist: [
        { id: "plan", label: B("Approved county plan check", "县政府批准的图纸审查"), state: "missing", dep: "plancheck" },
        { id: "coi", label: B("Contractor license and insurance certificate", "承包商执照及保险证明"), state: "missing" },
        { id: "dwg", label: B("Construction drawings", "施工图"), state: "missing", note: B("From your architect", "由您的建筑师提供") },
      ],
    },
    {
      id: "sign", name: B("Sign permit", "招牌许可"), agency: PBCE, level: "city", status: "ready",
      next: B("Ready to file. Waiting for your approval", "可以提交，等待您批准"), fees: [{ label: B("Sign permit", "招牌许可"), amount: 386 }, { label: B("Processing", "手续费"), amount: 24 }], feeNote: B("Sample amounts.", "示例金额。"),
      est: B("About 2 to 3 weeks", "约 2 至 3 周"), source: SRC.sj, form: B("Sign permit application", "招牌许可申请"),
      fields: [
        F("app", "Applicant", "申请人", NAME, fromCtx), F("addr", "Site address", "场地地址", ADDR, fromLease),
        F("type", "Sign type", "招牌类型", "Wall sign, internally lit", fromPhotos), F("size", "Size", "尺寸", "8 ft × 2 ft (16 sq ft)", fromPhotos),
        F("text", "Sign text", "招牌文字", "MOONLEAF TEA", fromPhotos), F("light", "Lighting", "照明", "LED, internal", fromPhotos),
        F("owner", "Property owner consent", "业主同意书", "Attached", B("From the landlord's letter", "来自房东同意函")), F("value", "Sign value", "招牌价值", "$3,200", fromYou),
      ],
      checklist: [
        { id: "photos", label: B("Storefront photos", "门店照片"), state: "done", doc: "d-photo" },
        { id: "dwg", label: B("Sign drawing with dimensions", "带尺寸的招牌图纸"), state: "auto", doc: "d-signdwg", note: B("Drawn by Placetta from the photos", "快哉根据照片绘制") },
        { id: "consent", label: B("Landlord consent letter", "房东同意函"), state: "done", doc: "d-consent" },
      ],
    },
    {
      id: "fire", name: B("Fire inspection", "消防检查"), agency: B("San Jose Fire Department", "圣何塞消防局"), level: "city", status: "todo", critical: true,
      next: B("Booked after the build-out", "装修完成后预约"), fees: [{ label: B("Inspection", "检查"), amount: 0 }], feeNote: B("Fee confirmed when booked.", "预约时确认费用。"),
      est: B("Usually booked within a week", "通常一周内可约"), source: SRC.sj, fields: [],
      checklist: [{ id: "building", label: B("Finished build-out", "装修完工"), state: "missing", dep: "building" }],
    },
  ],
  docs: [
    { id: "d-signapp", name: "sign-permit-application.pdf", kind: "pdf", size: 342_000, by: "agent", at: ago(185), app: "sign", tag: B("Prepared", "已准备") },
    { id: "d-signdwg", name: "sign-drawing.pdf", kind: "pdf", size: 518_000, by: "agent", at: ago(190), app: "sign", tag: B("Prepared", "已准备") },
    { id: "d-btc", name: "business-tax-receipt.pdf", kind: "pdf", size: 84_000, by: "agent", at: ago(2 * 1440 + 40), app: "btc", tag: B("Receipt", "收据") },
    { id: "d-finish", name: "finish-schedule.xlsx", kind: "xlsx", size: 41_000, by: "agent", at: ago(3 * 1440), app: "plancheck", tag: B("Prepared", "已准备") },
    { id: "d-seller", name: "sellers-permit.pdf", kind: "pdf", size: 121_000, by: "agency", at: ago(1440 + 120), app: "seller", tag: B("Issued", "已签发") },
    { id: "d-ein", name: "ein-confirmation-cp575.pdf", kind: "pdf", size: 96_000, by: "agency", at: ago(7 * 1440), app: "ein", tag: B("Issued", "已签发") },
    { id: "d-fh2", name: "food-handler-card-b-kim.pdf", kind: "pdf", size: 88_000, by: "you", at: ago(5 * 1440), app: "handler", tag: B("Uploaded", "已上传") },
    { id: "d-fh1", name: "food-handler-card-a-lin.pdf", kind: "pdf", size: 91_000, by: "you", at: ago(5 * 1440 + 30), app: "handler", tag: B("Uploaded", "已上传") },
    { id: "d-consent", name: "landlord-consent-letter.pdf", kind: "pdf", size: 152_000, by: "you", at: ago(6 * 1440), app: "sign", tag: B("Uploaded", "已上传") },
    { id: "d-photo", name: "storefront-photos.zip", kind: "zip", size: 8_400_000, by: "you", at: ago(6 * 1440 + 10), tag: B("Uploaded", "已上传") },
    { id: "d-lease", name: "lease-agreement.pdf", kind: "pdf", size: 2_400_000, by: "you", at: ago(6 * 1440 + 20), tag: B("Uploaded", "已上传") },
    { id: "d-menu", name: "menu.pdf", kind: "pdf", size: 380_000, by: "you", at: ago(6 * 1440 + 25), tag: B("Uploaded", "已上传") },
    { id: "d-art", name: "articles-of-organization.pdf", kind: "pdf", size: 212_000, by: "you", at: ago(8 * 1440), tag: B("Uploaded", "已上传") },
  ],
  deadlines: [
    { id: "dl-fh", date: inDays(5), kind: "due", app: "handler", title: B("Food handler cards due for 4 staff", "4 名员工的食品从业人员卡到期"), agency: B("California Retail Food Code", "加州零售食品法规"), ask: B("Remind them", "提醒他们"), prompt: B("Remind staff about food handler cards", "提醒员工办理食品从业人员卡") },
    { id: "dl-btc", date: inDays(12), kind: "estimate", app: "btc", title: B("Business Tax Certificate decision expected", "营业税证书预计出结果"), agency: SJ },
    { id: "dl-soi", date: inDays(21), kind: "due", title: B("LLC Statement of Information due ($20)", "有限责任公司信息声明到期（$20）"), agency: B("California Secretary of State", "加州州务卿"), ask: B("Prepare it", "准备申报"), prompt: B("Prepare the Statement of Information", "准备信息声明") },
    { id: "dl-wages", date: inDays(27), kind: "due", app: "edd", title: B("First payroll: employer registration must be filed first", "首次发薪：须先完成雇主登记"), agency: B("California EDD", "加州就业发展局"), ask: B("File what's ready", "提交已就绪的申请"), prompt: B("File everything that's ready", "把能提交的都提交") },
    { id: "dl-plan", date: inDays(38), kind: "estimate", app: "plancheck", title: B("Plan check decision, if it's filed this week", "如本周提交，图纸审查预计出结果"), agency: DEH },
    { id: "dl-open", date: "2027-03-01", kind: "milestone", title: B("Target opening", "目标开业日"), agency: B("Moonleaf Tea", "Moonleaf Tea") },
    { id: "dl-btcr", date: inDays(363), kind: "renewal", app: "btc", title: B("Business Tax Certificate renewal", "营业税证书续期"), agency: SJ },
  ],
  nudges: [
    { id: "n-soi", tone: "warn", text: B("Your LLC Statement of Information is due in 21 days. I can draft it from what I already know.", "您的有限责任公司信息声明将在 21 天后到期。我可以根据已有资料起草。"), ask: B("Draft it", "起草"), prompt: B("Prepare the Statement of Information", "准备信息声明") },
    { id: "n-rule", tone: "info", sample: true, text: B("Santa Clara County added a grease interceptor worksheet to food facility plan checks.", "圣克拉拉县在食品设施图纸审查中新增了隔油池计算表。"), ask: B("See what changed", "查看变化"), prompt: B("What changed in the county plan check?", "县里的图纸审查有什么变化？") },
  ],
  approvals: [
    {
      id: "a-sign", kind: "file", app: "sign", title: B("File the sign permit", "提交招牌许可"), agency: SJ, action: B("Approve & file", "批准并提交"),
      does: [B("Sign in to San Jose's permit portal with your saved account", "使用您保存的账户登录圣何塞许可证门户"), B("Submit the application below with its 3 attachments", "提交下方申请及 3 个附件"), B("Pay $410 with the card ending 4821", "使用尾号 4821 的银行卡支付 $410"), B("Save the receipt to Documents", "将收据保存到文件")],
    },
    {
      id: "a-docs", kind: "upload", app: "plancheck", title: B("Add the floor plan and equipment list", "上传平面图和设备清单"), agency: B("Santa Clara County", "圣克拉拉县"), action: B("Add files", "添加文件"),
      does: [B("The county plan check can't be filed without them, and it sets your opening date", "缺少这两份文件就无法提交县政府的图纸审查，而它决定了您的开业日期")],
    },
    {
      id: "a-staff", kind: "send", title: B("Text 4 staff about food handler cards", "短信提醒 4 名员工办理食品从业人员卡"), action: B("Approve & send", "批准并发送"),
      does: [B("Send one text to each person below from your shop's number", "以门店号码给下方每人发送一条短信"), B("Collect their cards as they reply and add them to the checklist", "收到回复后收集证书并加入清单")],
      data: [
        F("to", "To", "收件人", "C. Ortiz, D. Nguyen, E. Chen, F. Patel"), F("from", "From", "发件人", "Moonleaf Tea, (408) •••-0192"),
        F("msg", "Message", "内容", "Hi, it's Moonleaf Tea. California requires a food handler card within 30 days of starting. The course takes about 2 hours: reply with a photo of your card when you're done. Thank you!"),
      ],
    },
  ],
  closed: [],
  audit: [
    { id: "x1", at: ago(12), actor: "agent", action: B("Checked status", "查看进度"), object: B("Business Tax Certificate", "营业税证书"), detail: B("sanjoseca.gov: still in review", "sanjoseca.gov：仍在审核中") },
    { id: "x2", at: ago(64), actor: "agent", action: B("Checked for rule changes", "检查法规变化"), object: B("San Jose and Santa Clara County", "圣何塞市与圣克拉拉县"), detail: B("1 change found: plan check worksheet (sample)", "发现 1 项变化：图纸审查计算表（示例）") },
    { id: "x3", at: ago(180), actor: "agent", action: B("Asked for approval", "请求批准"), object: B("Sign permit", "招牌许可"), detail: B("Fee $410", "费用 $410") },
    { id: "x4", at: ago(185), actor: "agent", action: B("Filled application", "填写申请"), object: B("Sign permit", "招牌许可"), detail: B("8 fields from storefront photos, lease and landlord letter", "根据门店照片、租约和房东函填写 8 项") },
    { id: "x5", at: ago(190), actor: "agent", action: B("Drew sign drawing", "绘制招牌图纸"), object: B("sign-drawing.pdf", "sign-drawing.pdf"), detail: B("From storefront photos", "根据门店照片") },
    { id: "x6", at: ago(1440 + 120), actor: "agency", who: B("CDTFA", "加州税费管理局"), action: B("Approved", "批准"), object: B("Seller's permit", "销售许可证") },
    { id: "x7", at: ago(2 * 1440 + 40), actor: "agent", action: B("Saved receipt", "保存收据"), object: B("business-tax-receipt.pdf", "business-tax-receipt.pdf") },
    { id: "x8", at: ago(2 * 1440 + 41), actor: "agent", action: B("Paid fee", "支付费用"), object: B("Business Tax Certificate", "营业税证书"), detail: B("$243, card ending 4821", "$243，尾号 4821 的银行卡") },
    { id: "x9", at: ago(2 * 1440 + 42), actor: "agent", action: B("Submitted application", "提交申请"), object: B("Business Tax Certificate", "营业税证书"), detail: B("sanjoseca.gov", "sanjoseca.gov") },
    { id: "x10", at: ago(2 * 1440 + 45), actor: "you", action: B("Approved filing", "批准提交"), object: B("Business Tax Certificate", "营业税证书"), detail: B("Fee $243", "费用 $243") },
    { id: "x11", at: ago(5 * 1440), actor: "you", action: B("Uploaded", "上传"), object: B("food-handler-card-b-kim.pdf", "food-handler-card-b-kim.pdf") },
    { id: "x12", at: ago(6 * 1440 - 30), actor: "agent", action: B("Committed to memory", "存入记忆"), object: B("Context", "资料"), detail: B("Floor area 1,150 sq ft, lease term 5 years", "面积 1,150 平方英尺，租期 5 年") },
    { id: "x13", at: ago(6 * 1440 - 31), actor: "agent", action: B("Extracted data", "提取信息"), object: B("lease-agreement.pdf", "lease-agreement.pdf"), detail: B("Address, term, floor area, landlord", "地址、租期、面积、房东") },
    { id: "x14", at: ago(7 * 1440), actor: "agency", who: B("IRS", "美国国税局"), action: B("Issued", "签发"), object: B("Employer Identification Number", "雇主识别号码") },
    { id: "x15", at: ago(7 * 1440 + 5), actor: "you", action: B("Approved filing", "批准提交"), object: B("Employer Identification Number", "雇主识别号码") },
    { id: "x16", at: ago(8 * 1440), actor: "you", action: B("Created workspace", "创建工作区"), object: B("Moonleaf Tea, San Jose", "Moonleaf Tea，圣何塞") },
  ],
  facts: [
    { id: "f-name", group: "business", label: B("Legal name", "法定名称"), value: same(NAME), source: B("Articles of organization", "组织章程") },
    { id: "f-entity", group: "business", label: B("Entity", "实体类型"), value: B("California limited liability company", "加州有限责任公司"), source: B("Articles of organization", "组织章程") },
    { id: "f-ein", group: "business", label: B("EIN", "EIN"), value: same("••-•••4471"), source: B("IRS letter CP 575", "国税局 CP 575 函") },
    { id: "f-owner", group: "business", label: B("Owner", "所有人"), value: B("You, sole member", "您，唯一成员"), source: fromYou },
    { id: "f-addr", group: "location", label: B("Storefront", "门店"), value: same(ADDR), source: fromLease },
    { id: "f-area", group: "location", label: B("Floor area", "面积"), value: B("1,150 sq ft", "1,150 平方英尺"), source: fromLease },
    { id: "f-lease", group: "location", label: B("Lease", "租约"), value: B("5 years, starts Nov 1", "5 年，11 月 1 日起"), source: fromLease },
    { id: "f-open", group: "location", label: B("Target opening", "目标开业"), value: B("March 2027", "2027 年 3 月"), source: fromYou },
    { id: "f-sell", group: "operations", label: B("What you sell", "销售内容"), value: B("Milk tea, fruit tea, packaged snacks", "奶茶、果茶、预包装零食"), source: B("Menu", "菜单") },
    { id: "f-prep", group: "operations", label: B("Food prep", "食品制作"), value: B("Drinks made to order. No cooking", "饮品现做，不涉及烹饪"), source: B("Menu", "菜单") },
    { id: "f-staff", group: "operations", label: B("Staff", "员工"), value: B("6 (2 full time, 4 part time)", "6 人（2 名全职，4 名兼职）"), source: fromYou },
    { id: "f-sign", group: "operations", label: B("Signage", "招牌"), value: B("One lit wall sign, 8 × 2 ft", "一块发光墙面招牌，8 × 2 英尺"), source: fromPhotos },
    { id: "f-appr", group: "rules", label: B("Needs your approval", "需要您批准"), value: B("Every filing, payment and message", "每一次提交、付款和消息"), source: B("Always on", "始终开启"), locked: true },
    { id: "f-reach", group: "rules", label: B("Reach me by", "联系方式"), value: B("Email for updates, text for anything due this week", "更新用邮件，本周到期事项用短信"), source: fromYou },
  ],
  running: [
    { id: "r-btc", state: "searching", label: B("Watching San Jose for the Business Tax Certificate", "跟进圣何塞市营业税证书"), detail: B("Every 2 hours", "每 2 小时") },
    { id: "r-rules", state: "working", label: B("Watching rule changes in San Jose and Santa Clara County", "监测圣何塞市和圣克拉拉县的法规变化"), detail: B("Daily", "每天") },
    { id: "r-edd", state: "shaping", label: B("Finishing the employer registration", "完成雇主登记"), detail: B("Ready today", "今天可完成") },
  ],
  stores: SAMPLE_STORES,
  connections: [
    { id: "c-irs", name: B("IRS", "美国国税局"), level: "federal", state: "connected", detail: B("EIN on file", "EIN 已存档") },
    { id: "c-cdtfa", name: B("CDTFA online services", "加州税费管理局在线服务"), level: "state", state: "connected", detail: B("Seller's permit account", "销售许可证账户") },
    { id: "c-edd", name: B("EDD e-Services for Business", "加州就业发展局企业在线服务"), level: "state", state: "connected", detail: B("For the employer registration", "用于雇主登记") },
    { id: "c-sos", name: B("California bizfile Online", "加州 bizfile 在线服务"), level: "state", state: "connected", detail: B("Statements of Information", "信息声明") },
    { id: "c-county", name: B("Santa Clara County Environmental Health", "圣克拉拉县环境卫生局"), level: "county", state: "connected", detail: B("Plan check and health permits", "图纸审查与卫生许可") },
    { id: "c-city", name: B("City of San Jose permits", "圣何塞市许可证服务"), level: "city", state: "connected", detail: B("Business tax, building and sign permits", "营业税、建筑与招牌许可") },
    { id: "c-fire", name: B("San Jose Fire Department", "圣何塞消防局"), level: "city", state: "missing", detail: B("Connect so Placetta can book the inspection", "连接后快哉即可预约检查") },
    { id: "c-card", name: B("Card ending 4821", "尾号 4821 的银行卡"), level: "vault", state: "connected", detail: B("Pays fees only after you approve. Placetta never sees the number.", "仅在您批准后支付费用，快哉看不到卡号。") },
  ],
};

export const SUGGESTIONS: Bi[] = [
  B("File everything that's ready", "把能提交的都提交"),
  B("What's blocking our opening date?", "什么在拖慢我们的开业日期？"),
  B("Add a second shop in Fremont", "在弗里蒙特开第二家店"),
];
/** With a live agent: tasks it does end to end. */
export const LIVE_SUGGESTIONS: Bi[] = [
  B("Where does everything stand, and what's next?", "现在各项进展如何，下一步是什么？"),
  B("Review my documents and set up renewal reminders", "审阅我的文件并设置续期提醒"),
  B("Draft the letter asking the landlord for consent", "起草请房东出具同意书的信"),
  B("Check my email for agency replies", "查看邮件中机构的回复"),
];

/* ------------------------- license matcher ------------------------- */

export type LicenseHit = { name: Bi; agency: Bi; level: Level; fee: Bi; est: Bi; source: { label: string; url: string }; have?: string; carry?: boolean };

const FREE = B("No fee", "免费");
const VARIES = B("Placetta confirms with the agency", "快哉向机构核实");

export const MATCH_SJ: LicenseHit[] = [
  ...SAMPLE.apps.map(a => ({ name: a.name, agency: a.agency, level: a.level, fee: a.fees.reduce((s, f) => s + f.amount, 0) ? same("$" + a.fees.reduce((s, f) => s + f.amount, 0).toLocaleString("en-US")) : FREE, est: a.est, source: a.source, have: a.id })),
  { name: B("LLC Statement of Information", "有限责任公司信息声明"), agency: B("California Secretary of State", "加州州务卿"), level: "state", fee: same("$20"), est: B("Every 2 years. Filed online the same day", "每 2 年一次，网上当天提交"), source: SRC.sos },
];

export const MATCH_FREMONT: LicenseHit[] = [
  { name: B("Employer Identification Number", "雇主识别号码（EIN）"), agency: B("IRS", "美国国税局"), level: "federal", fee: FREE, est: B("Already have it. Carries over", "已有，可沿用"), source: SRC.irs, carry: true },
  { name: B("Seller's permit for the new location", "新门店的销售许可证"), agency: B("California Department of Tax and Fee Administration", "加州税费管理局"), level: "state", fee: FREE, est: B("Added under your existing account", "在现有账户下添加"), source: SRC.cdtfa },
  { name: B("Employer payroll tax account", "雇主工资税账户"), agency: B("California EDD", "加州就业发展局"), level: "state", fee: FREE, est: B("Same account. Carries over", "同一账户，可沿用"), source: SRC.edd, carry: true },
  { name: B("Food handler cards for new staff", "新员工的食品从业人员卡"), agency: B("California Retail Food Code", "加州零售食品法规"), level: "state", fee: B("About $15 a person", "每人约 $15"), est: B("Within 30 days of hire", "入职 30 天内"), source: SRC.cdph },
  { name: B("Food facility plan check", "食品设施图纸审查"), agency: B("Alameda County Environmental Health", "阿拉米达县环境卫生局"), level: "county", fee: VARIES, est: B("Placetta checks current review times", "快哉核实当前审查周期"), source: SRC.acgov },
  { name: B("Health permit to operate", "食品经营卫生许可"), agency: B("Alameda County Environmental Health", "阿拉米达县环境卫生局"), level: "county", fee: VARIES, est: B("At the final inspection", "最终检查时签发"), source: SRC.acgov },
  { name: B("Business tax registration", "营业税登记"), agency: B("City of Fremont", "弗里蒙特市"), level: "city", fee: VARIES, est: B("Placetta checks", "快哉核实"), source: SRC.fremont },
  { name: B("Building permit for the build-out", "店面装修建筑许可"), agency: B("City of Fremont", "弗里蒙特市"), level: "city", fee: VARIES, est: B("After the county approves the plans", "县政府批准图纸后"), source: SRC.fremont },
  { name: B("Sign permit", "招牌许可"), agency: B("City of Fremont", "弗里蒙特市"), level: "city", fee: VARIES, est: B("Placetta checks", "快哉核实"), source: SRC.fremont },
  { name: B("Fire inspection", "消防检查"), agency: B("Fremont Fire Department", "弗里蒙特消防局"), level: "city", fee: VARIES, est: B("After the build-out", "装修完成后"), source: SRC.fremont },
];

/** A first pass for anywhere else, by kind of business. Every row says it still needs checking. */
export function genericMatch(what: string, where: string): LicenseHit[] {
  const food = /tea|coffee|caf|restaurant|bak|food|truck|bar|kitchen|juice|boba|奶茶|餐|咖啡|面包|食|饮/i.test(what);
  const salon = /salon|hair|nail|barber|spa|beauty|美发|美甲|理发|美容/i.test(what);
  const place = same(where.trim() || "your city");
  const ca = /\b(ca|california)\b|加州|加利福尼亚/i.test(where) || /san jose|fremont|oakland|san francisco|los angeles|san diego|sacramento|圣何塞|旧金山|洛杉矶/i.test(where);
  const hits: LicenseHit[] = [
    { name: B("Employer Identification Number", "雇主识别号码（EIN）"), agency: B("IRS", "美国国税局"), level: "federal", fee: FREE, est: B("Issued right away online", "网上即时签发"), source: SRC.irs },
    { name: ca ? B("Seller's permit", "销售许可证") : B("State sales tax permit", "州销售税许可"), agency: ca ? B("California Department of Tax and Fee Administration", "加州税费管理局") : B("Your state's tax agency", "所在州税务机构"), level: "state", fee: ca ? FREE : VARIES, est: VARIES, source: ca ? SRC.cdtfa : SRC.irs },
    { name: B("Employer registration", "雇主登记"), agency: ca ? B("California EDD", "加州就业发展局") : B("Your state's labor agency", "所在州劳工机构"), level: "state", fee: ca ? FREE : VARIES, est: B("Before the first payroll", "首次发薪前"), source: ca ? SRC.edd : SRC.irs },
  ];
  if (salon) hits.push({ name: B("Establishment license for the salon", "美容美发场所执照"), agency: ca ? B("California Board of Barbering and Cosmetology", "加州理发与美容委员会") : B("Your state's cosmetology board", "所在州美容委员会"), level: "state", fee: VARIES, est: VARIES, source: ca ? { label: "barbercosmo.ca.gov", url: "https://www.barbercosmo.ca.gov" } : SRC.irs });
  if (food) hits.push(
    { name: B("Food facility plan check", "食品设施图纸审查"), agency: B("County environmental health", "县环境卫生部门"), level: "county", fee: VARIES, est: VARIES, source: SRC.irs },
    { name: B("Health permit to operate", "食品经营卫生许可"), agency: B("County environmental health", "县环境卫生部门"), level: "county", fee: VARIES, est: B("At the final inspection", "最终检查时签发"), source: SRC.irs },
    { name: B("Food handler cards", "食品从业人员卡"), agency: B("State food code", "州食品法规"), level: "state", fee: B("About $15 a person", "每人约 $15"), est: B("Within 30 days of hire", "入职 30 天内"), source: ca ? SRC.cdph : SRC.irs },
  );
  hits.push(
    { name: B("Business license or tax certificate", "营业执照或营业税证书"), agency: { en: place.en, zh: place.zh }, level: "city", fee: VARIES, est: VARIES, source: SRC.irs },
    { name: B("Building and sign permits, if you build out", "如需装修：建筑与招牌许可"), agency: { en: place.en, zh: place.zh }, level: "city", fee: VARIES, est: VARIES, source: SRC.irs },
  );
  // Non-specific rows point to irs.gov's small-business pages only as a starting place; mark them for checking.
  return hits.map(h => (h.source === SRC.irs && h.level !== "federal" ? { ...h, source: { label: "", url: "" } } : h));
}
