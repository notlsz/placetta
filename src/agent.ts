import type { OrbState } from "thinking-orbs";
import type { Lang } from "./i18n";

/* ------------------------------------------------------------------ *
 * The contract between the chat UI and whatever runs the agent.
 *
 * The UI only needs a stream of events: each step the agent takes
 * (with the orb animation that fits it) and a final reply. Swap
 * `demoAgent` for a backend that calls your model and tools — keep
 * emitting the same events and nothing in the UI changes.
 * ------------------------------------------------------------------ */

export type Bi = { en: string; zh: string };
export type Step = { state: OrbState; label: Bi };
export type Status = "approved" | "filed" | "review" | "needs" | "waiting" | "ready" | "todo" | "draft";

export type Permit = {
  id: string;
  name: Bi;
  agency: Bi;
  status: Status;
  note?: Bi;
  critical?: boolean;
};

export type Reply = {
  text: Bi[];                 // paragraphs
  chain?: Bi[];               // an ordered dependency chain, drawn as a sequence
  followUp?: Bi;              // a one-tap next request
  patch?: (plan: Permit[]) => Permit[];
};

export type AgentEvent =
  | { type: "step"; index: number; step: Step }
  | { type: "reply"; reply: Reply };

export interface AgentBackend {
  run(input: string, lang: Lang, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void>;
}

/* ------------------------------ sample case ------------------------------ */

export const SAMPLE_PLAN: Permit[] = [
  { id: "btc", name: { en: "Business Tax Certificate", zh: "营业税证书" }, agency: { en: "City of San Jose, Finance Department", zh: "圣何塞市财政局" }, status: "filed" },
  { id: "seller", name: { en: "Seller's permit", zh: "销售许可证" }, agency: { en: "California Department of Tax and Fee Administration", zh: "加州税费管理局" }, status: "approved" },
  { id: "ein", name: { en: "Employer Identification Number", zh: "雇主识别号码（EIN）" }, agency: { en: "IRS", zh: "美国国税局" }, status: "approved" },
  { id: "plancheck", name: { en: "Food facility plan check", zh: "食品设施图纸审查" }, agency: { en: "Santa Clara County Environmental Health", zh: "圣克拉拉县环境卫生局" }, status: "needs", note: { en: "Needs a floor plan and equipment list", zh: "需要平面图和设备清单" } },
  { id: "building", name: { en: "Building permit for the build-out", zh: "店面装修建筑许可" }, agency: { en: "City of San Jose, Planning, Building and Code Enforcement", zh: "圣何塞市规划、建筑与执法局" }, status: "waiting", note: { en: "Waits on the plan check", zh: "等待图纸审查通过" } },
  { id: "sign", name: { en: "Sign permit", zh: "招牌许可" }, agency: { en: "City of San Jose, Planning, Building and Code Enforcement", zh: "圣何塞市规划、建筑与执法局" }, status: "ready" },
  { id: "fire", name: { en: "Fire inspection", zh: "消防检查" }, agency: { en: "San Jose Fire Department", zh: "圣何塞消防局" }, status: "todo" },
  { id: "pto", name: { en: "Health permit to operate", zh: "食品经营卫生许可" }, agency: { en: "Santa Clara County Environmental Health", zh: "圣克拉拉县环境卫生局" }, status: "todo", note: { en: "Issued after the final inspection", zh: "最终检查通过后签发" } },
  { id: "edd", name: { en: "Employer registration", zh: "雇主登记" }, agency: { en: "California Employment Development Department", zh: "加州就业发展局" }, status: "ready" },
  { id: "handler", name: { en: "Food handler cards", zh: "食品从业人员卡" }, agency: { en: "Each staff member", zh: "每位员工" }, status: "needs", note: { en: "2 of 6 staff done", zh: "6 名员工中已完成 2 名" } },
];

export const WELCOME: Reply = {
  text: [
    { en: "Welcome back. Your San Jose shop has 10 filings across 7 agencies, and 3 are done.", zh: "欢迎回来。您的圣何塞门店共有 10 项申请，涉及 7 个机构，其中 3 项已完成。" },
    { en: "Two need you this week: the documents for the county's plan check, and food handler cards for 4 more staff.", zh: "本周有两项需要您处理：县政府图纸审查所需的文件，以及另外 4 名员工的食品从业人员卡。" },
  ],
};

export const SUGGESTIONS: Bi[] = [
  { en: "What's blocking our opening date?", zh: "什么在拖慢我们的开业日期？" },
  { en: "Draft the plan check application", zh: "起草图纸审查申请" },
  { en: "Add a second shop in Fremont", zh: "在弗里蒙特开第二家店" },
];

/* ------------------------------ demo scripts ----------------------------- */

type Script = { match: RegExp; steps: Step[]; reply: Reply };

const SCRIPTS: Script[] = [
  {
    match: /block|opening|critical|delay|阻|拖|开业|延误/i,
    steps: [
      { state: "searching", label: { en: "Checking the status of every filing", zh: "查看每项申请的进度" } },
      { state: "connecting", label: { en: "Tracing which permits depend on others", zh: "梳理许可证之间的依赖关系" } },
      { state: "solving", label: { en: "Finding the longest chain to opening day", zh: "找出通往开业日最长的环节" } },
      { state: "composing", label: { en: "Writing it up", zh: "整理结论" } },
    ],
    reply: {
      text: [
        { en: "One chain sets your opening date. Everything else can run alongside it.", zh: "开业日期由一条链决定，其余事项都可以同步推进。" },
        { en: "The city won't issue the build-out permit for a food facility until the county approves your plans, and the plan check is waiting on two documents from you: a floor plan and an equipment list.", zh: "在县政府批准您的图纸之前，市政府不会签发食品设施的装修许可。而图纸审查目前正在等您提供两份文件：平面图和设备清单。" },
      ],
      chain: [
        { en: "Plan check", zh: "图纸审查" },
        { en: "Building permit", zh: "建筑许可" },
        { en: "Build-out", zh: "装修施工" },
        { en: "Fire and health inspections", zh: "消防与卫生检查" },
        { en: "Permit to operate", zh: "经营许可" },
      ],
      followUp: { en: "Draft the plan check application", zh: "起草图纸审查申请" },
      patch: plan => plan.map(p => ["plancheck", "building", "fire", "pto"].includes(p.id) ? { ...p, critical: true } : p),
    },
  },
  {
    match: /draft|plan check|application|form|起草|图纸|申请|表格/i,
    steps: [
      { state: "shaping", label: { en: "Filling in the county's plan check form", zh: "填写县政府的图纸审查表" } },
      { state: "connecting", label: { en: "Pulling details from your lease and menu", zh: "从租约和菜单中提取信息" } },
      { state: "solving", label: { en: "Checking each answer against the county's checklist", zh: "对照县政府清单逐项核对" } },
      { state: "composing", label: { en: "Writing the summary", zh: "撰写摘要" } },
    ],
    reply: {
      text: [
        { en: "The plan check application is drafted. I filled 31 of 38 fields from your lease and menu.", zh: "图纸审查申请已起草完毕，我根据您的租约和菜单填写了 38 项中的 31 项。" },
        { en: "The other 7 need you, mostly equipment model numbers and the grease interceptor size. Upload the equipment list and I'll finish it for your signature.", zh: "其余 7 项需要您补充，主要是设备型号和隔油池尺寸。上传设备清单后，我会补全并交给您签字。" },
      ],
      patch: plan => plan.map(p => p.id === "plancheck" ? { ...p, status: "draft", note: { en: "31 of 38 fields filled", zh: "已填写 31/38 项" } } : p),
    },
  },
  {
    match: /fremont|second|another|new (shop|store|location)|弗里蒙特|第二|新店|分店/i,
    steps: [
      { state: "searching", label: { en: "Reading Fremont and Alameda County rules", zh: "查阅弗里蒙特市和阿拉米达县的规定" } },
      { state: "weaving", label: { en: "Reusing what carries over from San Jose", zh: "复用圣何塞已有的材料" } },
      { state: "solving", label: { en: "Ordering the new filings", zh: "排定新申请的顺序" } },
      { state: "composing", label: { en: "Writing the plan", zh: "撰写计划" } },
    ],
    reply: {
      text: [
        { en: "Fremont is in Alameda County, so the health filings move to Alameda County Environmental Health. Your EIN carries over, and the state wants a seller's permit for each location, which I can add under your existing account.", zh: "弗里蒙特属于阿拉米达县，因此卫生相关申请改由阿拉米达县环境卫生局受理。您的 EIN 可以沿用；州政府要求每个门店单独办理销售许可证，我可以在您现有的账户下添加。" },
        { en: "New for Fremont: a city business tax registration, a plan check and permit to operate with the county, a building permit for the build-out, a sign permit and a fire inspection. I'll open it as a second case once you confirm the address.", zh: "弗里蒙特需要新办：市营业税登记、县里的图纸审查和经营许可、装修建筑许可、招牌许可以及消防检查。确认地址后，我会把它建成第二个案例。" },
      ],
    },
  },
];

const FALLBACK: Script = {
  match: /.*/,
  steps: [
    { state: "searching", label: { en: "Looking up the rules that apply", zh: "查找适用的法规" } },
    { state: "composing", label: { en: "Writing a reply", zh: "撰写回复" } },
  ],
  reply: {
    text: [
      { en: "I can map that out. Tell me the city and what the location will do, for example serve food, store goods or sell retail.", zh: "我可以为您梳理。请告诉我城市名称，以及门店的用途，例如餐饮、仓储或零售。" },
      { en: "I'll list every license, the agency that issues it and the order to file in.", zh: "我会列出每一张许可证、负责签发的机构以及提交顺序。" },
    ],
  },
};

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); }, { once: true });
});

/** Scripted stand-in for the real agent, so the UI can be designed and tested end to end. */
export const demoAgent: AgentBackend = {
  async run(input, _lang, onEvent, signal) {
    const s = SCRIPTS.find(x => x.match.test(input)) ?? FALLBACK;
    for (let i = 0; i < s.steps.length; i++) {
      onEvent({ type: "step", index: i, step: s.steps[i] });
      await wait(1150 + Math.random() * 650, signal);
    }
    onEvent({ type: "reply", reply: s.reply });
  },
};
