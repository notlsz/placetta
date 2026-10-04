import type { OrbState } from "thinking-orbs";
import type { Approval, Autonomy, Bi, Case, Filing, Task } from "./model";
import type { Lang } from "./i18n";

/* ------------------------------------------------------------------ *
 * The contract between the app and whatever runs the agent.
 *
 * A request is either something the person said, or their answer to an
 * approval. The agent streams back the steps it takes (each with the
 * orb animation that fits), updates to the case (a filing changes
 * status, a log entry, a new approval), and a reply. Swap `demoAgent`
 * for a backend that drives your model and its tools — agency portals,
 * document filling, payments behind approvals — and keep the events.
 * ------------------------------------------------------------------ */

export type Step = { state: OrbState; label: Bi };
export type Reply = { text: Bi[]; chain?: Bi[]; approvals?: string[] };
export type Request = { text: string } | { approve: string; files?: string[] };
export type Context = { lang: Lang; autonomy: Autonomy; current: Case };
export type AgentEvent =
  | { type: "step"; index: number; step: Step }
  | { type: "update"; patch: (c: Case) => Case }
  | { type: "reply"; reply: Reply };

export interface AgentBackend {
  run(req: Request, ctx: Context, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void>;
}

/* ---------------------------- case updates ---------------------------- */

const B = (en: string, zh: string): Bi => ({ en, zh });
const NOW = B("Just now", "刚刚");
let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;

export const setFiling = (id: string, f: Partial<Filing>) => (c: Case): Case => ({ ...c, filings: c.filings.map(x => (x.id === id ? { ...x, ...f } : x)) });
export const log = (actor: "agent" | "you" | "agency", text: Bi) => (c: Case): Case => ({ ...c, activity: [{ id: uid("x"), when: NOW, actor, text }, ...c.activity] });
export const dropApproval = (id: string) => (c: Case): Case => ({ ...c, approvals: c.approvals.filter(a => a.id !== id), closed: [...c.closed, ...c.approvals.filter(a => a.id === id)] });
export const addApproval = (a: Approval) => (c: Case): Case => ({ ...c, approvals: c.approvals.some(x => x.id === a.id) ? c.approvals : [a, ...c.approvals] });
export const addTask = (t: Task) => (c: Case): Case => ({ ...c, running: [t, ...c.running.filter(x => x.id !== t.id)] });
export const setTask = (id: string, t: Partial<Task>) => (c: Case): Case => ({ ...c, running: c.running.map(x => (x.id === id ? { ...x, ...t } : x)) });
const all = (...fs: ((c: Case) => Case)[]) => (c: Case) => fs.reduce((acc, f) => f(acc), c);

/* ------------------------------ approvals ------------------------------ */

const A_EDD: Approval = {
  id: "a-edd", kind: "submit", title: B("Submit the employer registration", "提交雇主登记"), agency: B("California EDD", "加州就业发展局"),
  detail: B("Filled in and checked. No fee and no signature needed.", "已填写并核对，无需费用或签名。"), action: B("Approve and submit", "批准并提交"),
};
const A_PLAN: Approval = {
  id: "a-plan", kind: "sign", title: B("Sign and submit the plan check", "签署并提交图纸审查"), agency: B("Santa Clara County", "圣克拉拉县"),
  detail: B("All 38 fields filled from your lease, menu, floor plan and equipment list. Your signature goes on the application.", "已根据租约、菜单、平面图和设备清单填写全部 38 项，申请需要您的签名。"),
  action: B("Sign and submit", "签署并提交"),
};

/* ------------------------------ demo agent ----------------------------- */

type Plan = { steps: Step[]; updates?: ((c: Case) => Case)[]; reply: Reply };

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); }, { once: true });
});

function fileReady(ctx: Context): Plan {
  const edd = ctx.current.filings.find(f => f.id === "edd");
  if (edd && edd.status !== "ready") {
    return {
      steps: [{ state: "searching", label: B("Checking what's ready to file", "查看哪些申请可以提交") }],
      reply: { text: [B("Everything that can be filed without you is filed. The sign permit is the one left, and it has a fee, so it's waiting for you.", "无需您参与的申请都已提交。剩下的是招牌许可，因为需要缴费，正在等您批准。")], approvals: ["a-sign"] },
    };
  }
  const prep: Step[] = [
    { state: "connecting", label: B("Signing in to the state and city portals with your saved accounts", "使用您保存的账户登录州和市政府门户") },
    { state: "shaping", label: B("Filling in the employer registration", "填写雇主登记表") },
    { state: "solving", label: B("Checking every answer against the EDD's requirements", "对照加州就业发展局的要求逐项核对") },
  ];
  if (ctx.autonomy === "submit") {
    return {
      steps: [...prep, { state: "working", label: B("Submitting the employer registration to the EDD", "向加州就业发展局提交雇主登记") }],
      updates: [all(
        setFiling("edd", { status: "filed", next: B("Filed just now, waiting for your employer account number", "刚刚提交，等待雇主账号") }),
        log("agent", B("Filed the employer registration with the EDD", "向加州就业发展局提交了雇主登记")),
        addTask({ id: "r-edd", state: "searching", label: B("Watching the EDD for your employer account number", "跟进加州就业发展局的雇主账号"), detail: B("Started just now", "刚刚开始") }),
      )],
      reply: {
        text: [
          B("Filed your employer registration with the EDD. It has no fee and needs no signature, so your settings let me submit it on my own.", "已向加州就业发展局提交雇主登记。它无需费用或签名，按您的设置我可以直接提交。"),
          B("The sign permit is ready too, but it has a fee, so it's waiting for your approval.", "招牌许可也已就绪，但需要缴费，正在等您批准。"),
        ],
        approvals: ["a-sign"],
      },
    };
  }
  return {
    steps: prep,
    updates: [all(addApproval(A_EDD), log("agent", B("Prepared the employer registration for your approval", "已准备好雇主登记，等待您批准")))],
    reply: {
      text: [ctx.autonomy === "ask"
        ? B("Both are ready. Your settings ask me to check with you before submitting anything, so they're waiting below.", "两项都已就绪。按您的设置，我在提交前需要先征得您同意，所以它们在下方等待批准。")
        : B("Both are prepared. Your settings have me prepare filings without submitting them; approve below and I'll submit.", "两项都已准备好。按您的设置，我只准备不提交；在下方批准后我会提交。")],
      approvals: ["a-edd", "a-sign"],
    },
  };
}

const SCRIPTS: { match: RegExp; plan: (ctx: Context) => Plan }[] = [
  { match: /file|submit|ready|apply|提交|申请|就绪/i, plan: fileReady },
  {
    match: /block|opening|critical|delay|阻|拖|开业|延误/i,
    plan: () => ({
      steps: [
        { state: "searching", label: B("Checking the status of every filing", "查看每项申请的进度") },
        { state: "connecting", label: B("Tracing which permits depend on others", "梳理许可证之间的依赖关系") },
        { state: "solving", label: B("Finding the longest chain to opening day", "找出通往开业日最长的环节") },
        { state: "composing", label: B("Writing it up", "整理结论") },
      ],
      reply: {
        text: [
          B("One chain sets your opening date. Everything else can run alongside it.", "开业日期由一条链决定，其余事项都可以同步推进。"),
          B("The city won't issue the build-out permit for a food facility until the county approves your plans, and the plan check is waiting on two documents from you.", "在县政府批准您的图纸之前，市政府不会签发食品设施的装修许可，而图纸审查正在等您提供两份文件。"),
        ],
        chain: [B("Plan check", "图纸审查"), B("Building permit", "建筑许可"), B("Build-out", "装修施工"), B("Fire and health inspections", "消防与卫生检查"), B("Permit to operate", "经营许可")],
        approvals: ["a-docs"],
      },
    }),
  },
  {
    match: /fremont|second|another|new (shop|store|location)|弗里蒙特|第二|新店|分店/i,
    plan: () => ({
      steps: [
        { state: "searching", label: B("Reading Fremont and Alameda County rules", "查阅弗里蒙特市和阿拉米达县的规定") },
        { state: "weaving", label: B("Reusing what carries over from San Jose", "复用圣何塞已有的材料") },
        { state: "solving", label: B("Ordering the new filings", "排定新申请的顺序") },
        { state: "composing", label: B("Writing the plan", "撰写计划") },
      ],
      updates: [addTask({ id: "r-fremont", state: "weaving", label: B("Mapping the licenses for a Fremont shop", "梳理弗里蒙特门店所需的许可证"), detail: B("Waiting for the address", "等待地址") })],
      reply: {
        text: [
          B("Fremont is in Alameda County, so the health filings move to Alameda County Environmental Health. Your EIN carries over, and the state wants a seller's permit for each location, which I can add under your existing account.", "弗里蒙特属于阿拉米达县，因此卫生相关申请改由阿拉米达县环境卫生局受理。您的 EIN 可以沿用；州政府要求每个门店单独办理销售许可证，我可以在您现有的账户下添加。"),
          B("Send me the address and I'll open it as a second location and start filing.", "把地址发给我，我会把它建成第二个门店并开始办理。"),
        ],
      },
    }),
  },
];

const FALLBACK = (): Plan => ({
  steps: [
    { state: "searching", label: B("Looking up the rules that apply", "查找适用的法规") },
    { state: "composing", label: B("Writing a reply", "撰写回复") },
  ],
  reply: { text: [
    B("I can take that on. Tell me the city and what the location will do, for example serve food, store goods or sell retail.", "这件事我可以接手。请告诉我城市名称，以及门店的用途，例如餐饮、仓储或零售。"),
    B("I'll list every license from the city up to the federal level, file what I can on my own and bring you the rest to approve.", "我会列出从市级到联邦的每一张许可证，能自行提交的我直接提交，其余的交给您批准。"),
  ] },
});

function approve(id: string, files: string[] | undefined): Plan {
  switch (id) {
    case "a-sign": return {
      steps: [
        { state: "connecting", label: B("Opening the City of San Jose permit portal", "打开圣何塞市许可证门户") },
        { state: "working", label: B("Paying the fee with your saved card", "使用您保存的银行卡缴费") },
        { state: "weaving", label: B("Submitting the sign permit and saving the receipt", "提交招牌许可并保存收据") },
      ],
      updates: [all(
        dropApproval("a-sign"), log("you", B("Approved paying for and filing the sign permit", "批准缴费并提交招牌许可")),
        setFiling("sign", { status: "filed", next: B("Filed just now, receipt saved", "刚刚提交，收据已保存") }),
        log("agent", B("Filed the sign permit with the City of San Jose and saved the receipt", "向圣何塞市提交了招牌许可并保存了收据")),
        addTask({ id: "r-sign", state: "searching", label: B("Watching San Jose for the sign permit decision", "跟进圣何塞市的招牌许可审批"), detail: B("Started just now", "刚刚开始") }),
      )],
      reply: { text: [B("Filed the sign permit with the City of San Jose. The receipt is in Activity, and I'm watching for the decision.", "已向圣何塞市提交招牌许可。收据在“动态”中，我会跟进审批结果。")] },
    };
    case "a-docs": {
      const names = files && files.length ? files.join(", ") : "floor-plan.pdf, equipment-list.xlsx";
      return {
        steps: [
          { state: "shaping", label: B("Reading your floor plan and equipment list", "读取平面图和设备清单") },
          { state: "weaving", label: B("Finishing the plan check application", "补全图纸审查申请") },
          { state: "solving", label: B("Checking it against the county's checklist", "对照县政府清单核对") },
        ],
        updates: [all(
          dropApproval("a-docs"), log("you", B(`Added ${names}`, `上传了 ${names}`)),
          setFiling("plancheck", { status: "draft", next: B("Complete, waiting for your signature", "已填写完整，等待您签名") }),
          log("agent", B("Completed the plan check application", "补全了图纸审查申请")),
          addApproval(A_PLAN),
          (c: Case) => ({ ...c, connections: c.connections.map(x => x.id === "c-docs" ? { ...x, detail: B("Lease, menu, storefront photos, floor plan, equipment list", "租约、菜单、门店照片、平面图、设备清单") } : x) }),
        )],
        reply: { text: [B("The plan check application is complete: all 38 fields are filled. It needs your signature before I submit it to the county.", "图纸审查申请已填写完整，全部 38 项。提交给县政府前需要您签名。")], approvals: ["a-plan"] },
      };
    }
    case "a-plan": return {
      steps: [
        { state: "connecting", label: B("Opening the county's Environmental Health portal", "打开县环境卫生局门户") },
        { state: "working", label: B("Submitting the plan check with your signature", "提交带有您签名的图纸审查") },
      ],
      updates: [all(
        dropApproval("a-plan"), log("you", B("Signed the plan check application", "签署了图纸审查申请")),
        setFiling("plancheck", { status: "review", next: B("Submitted just now, the agent is watching for comments", "刚刚提交，助理正在跟进审查意见") }),
        log("agent", B("Submitted the plan check to Santa Clara County Environmental Health", "向圣克拉拉县环境卫生局提交了图纸审查")),
        addTask({ id: "r-plan", state: "searching", label: B("Watching the county for plan check comments", "跟进县政府的图纸审查意见"), detail: B("Started just now", "刚刚开始") }),
      )],
      reply: { text: [B("Submitted to Santa Clara County Environmental Health. If the county sends comments, I'll draft the changes and bring them to you.", "已提交至圣克拉拉县环境卫生局。如果县政府提出意见，我会起草修改并交给您确认。")] },
    };
    case "a-staff": return {
      steps: [
        { state: "composing", label: B("Writing the reminders", "撰写提醒") },
        { state: "working", label: B("Texting 4 staff from your shop's number", "以门店号码给 4 名员工发短信") },
      ],
      updates: [all(
        dropApproval("a-staff"), log("you", B("Approved reminders to 4 staff", "批准向 4 名员工发送提醒")),
        log("agent", B("Texted 4 staff the food handler course link", "给 4 名员工发送了食品从业人员课程链接")),
        setTask("r-staff", { detail: B("2 of 6 in, reminded the rest just now", "已收到 2/6，刚刚提醒了其余员工") }),
      )],
      reply: { text: [B("Sent. I'll collect the certificates as they come in and update the plan.", "已发送。证书陆续交回后，我会收集并更新计划。")] },
    };
    case "a-edd": return {
      steps: [{ state: "working", label: B("Submitting the employer registration to the EDD", "向加州就业发展局提交雇主登记") }],
      updates: [all(
        dropApproval("a-edd"), log("you", B("Approved submitting the employer registration", "批准提交雇主登记")),
        setFiling("edd", { status: "filed", next: B("Filed just now, waiting for your employer account number", "刚刚提交，等待雇主账号") }),
        log("agent", B("Filed the employer registration with the EDD", "向加州就业发展局提交了雇主登记")),
        addTask({ id: "r-edd", state: "searching", label: B("Watching the EDD for your employer account number", "跟进加州就业发展局的雇主账号"), detail: B("Started just now", "刚刚开始") }),
      )],
      reply: { text: [B("Submitted to the EDD. I'll watch for your employer account number.", "已提交至加州就业发展局，我会跟进雇主账号。")] },
    };
    default: return FALLBACK();
  }
}

/** Scripted stand-in for the real agent, so the product can be designed and tested end to end. */
export const demoAgent: AgentBackend = {
  async run(req, ctx, onEvent, signal) {
    const p = "approve" in req ? approve(req.approve, req.files) : (SCRIPTS.find(s => s.match.test(req.text))?.plan(ctx) ?? FALLBACK());
    for (let i = 0; i < p.steps.length; i++) {
      onEvent({ type: "step", index: i, step: p.steps[i] });
      await wait(1050 + Math.random() * 600, signal);
    }
    p.updates?.forEach(patch => onEvent({ type: "update", patch }));
    onEvent({ type: "reply", reply: p.reply });
  },
};
