import type { OrbState } from "thinking-orbs";
import { B, MATCH_FREMONT, MATCH_SJ, SRC, genericMatch, same, type Application, type Approval, type Bi, type Doc, type Fact, type Workspace } from "./model";
import { inDays, nowIso } from "./time";

/* ------------------------------------------------------------------ *
 * The contract between the workspace and whatever runs the agent.
 *
 * A request is something the person said, an approval, an upload to a
 * checklist item, or a license search. The agent streams the steps it
 * takes (each names the tool or site it's using, so the person can see
 * its hands), patches to the workspace, then a reply that can carry
 * approvals, documents, application previews and new memories.
 *
 * Rule the demo follows and a real backend must too: nothing is filed,
 * paid or sent without an approval the person answered.
 * ------------------------------------------------------------------ */

export * from "./core";
import { setApp, setCheck, addCheck, setField, addApp, addDoc, audit, dropApproval, addApproval, addTask, dropTask, addDeadline, dropDeadline, dropNudge, setFact, type P, type Step, type Request, type Reply, type Context, type AgentBackend } from "./core";
let seq = 0;
const all = (...fs: P[]): P => w => fs.reduce((acc, f) => f(acc), w);

const remember = (text: Bi): P => audit("agent", B("Committed to memory", "存入记忆"), B("Context", "资料"), text);

/* --------------------------- prepared approvals --------------------------- */

const PORTAL = { sj: B("San Jose's permit portal", "圣何塞许可证门户"), edd: B("EDD e-Services", "加州就业发展局在线服务"), scc: B("the county's Environmental Health portal", "县环境卫生局门户"), sos: B("bizfile Online", "bizfile 在线服务") };
const filing = (id: string, app: string, title: Bi, agency: Bi, portal: Bi, fee: number, attachments: number): Approval => ({
  id, kind: "file", app, title, agency, action: B("Approve & file", "批准并提交"),
  does: [
    B(`Sign in to ${portal.en} with your saved account`, `使用您保存的账户登录${portal.zh}`),
    attachments ? B(`Submit the application below with ${attachments === 1 ? "its attachment" : `its ${attachments} attachments`}`, `提交下方申请及 ${attachments} 个附件`) : B("Submit the application below", "提交下方申请"),
    ...(fee ? [B(`Pay $${fee.toLocaleString("en-US")} with the card ending 4821`, `使用尾号 4821 的银行卡支付 $${fee.toLocaleString("en-US")}`)] : []),
    B("Save the receipt to Documents", "将收据保存到文件"),
  ],
});
export const A_EDD = filing("a-edd", "edd", B("File the employer registration", "提交雇主登记"), B("California EDD", "加州就业发展局"), PORTAL.edd, 0, 0);
export const A_PLAN = filing("a-plan", "plancheck", B("File the plan check", "提交图纸审查"), B("Santa Clara County", "圣克拉拉县"), PORTAL.scc, 1385, 5);
export const A_SOI = filing("a-soi", "soi", B("File the Statement of Information", "提交信息声明"), B("California Secretary of State", "加州州务卿"), PORTAL.sos, 20, 0);

const SOI_APP: Application = {
  id: "soi", name: B("LLC Statement of Information", "有限责任公司信息声明"), agency: B("California Secretary of State", "加州州务卿"), level: "state", status: "ready",
  next: B("Drafted from Context. Due in 21 days", "已根据资料起草，21 天后到期"), fees: [{ label: B("Filing fee", "申报费"), amount: 20 }], est: B("Filed online the same day", "网上当天提交"),
  source: SRC.sos, form: B("Form LLC-12 on bizfile Online", "bizfile 在线服务 LLC-12 表"), renews: B("Every 2 years", "每 2 年"),
  fields: [
    { id: "name", label: B("Entity name", "实体名称"), value: "Moonleaf Tea LLC", from: B("From Context", "来自资料") },
    { id: "office", label: B("Principal office", "主要办公地址"), value: "North First Street, San Jose, CA (sample)", from: B("From your lease", "来自租约") },
    { id: "mgmt", label: B("Managed by", "管理方式"), value: "Sole member", from: B("From Context", "来自资料") },
    { id: "agent", label: B("Agent for service of process", "法律文书送达代理人"), value: "The member (you)", from: B("You told me", "您告诉我的") },
    { id: "biz", label: B("Type of business", "业务类型"), value: "Beverage shop", from: B("From Context", "来自资料") },
  ],
  checklist: [
    { id: "art", label: B("Articles of organization", "组织章程"), state: "done", doc: "d-art" },
    { id: "form", label: B("Form LLC-12", "LLC-12 表"), state: "auto", doc: "d-soi", note: B("Filled by Placetta", "快哉已填写") },
  ],
};

const doc = (id: string, name: string, size: number, by: Doc["by"], app: string, tag: Bi): Doc => ({ id, name, kind: (name.split(".").pop() ?? "pdf") as Doc["kind"], size, by, at: nowIso(), app, tag });

/* ------------------------------ demo agent ----------------------------- */

type Plan = { steps: Step[]; updates?: P[]; reply: Reply };
const S = (state: OrbState, en: string, zh: string, tool?: string): Step => ({ state, label: B(en, zh), tool });

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); }, { once: true });
});

const pendingFilings = (w: Workspace) => w.approvals.filter(a => a.kind === "file").map(a => a.id);

function fileReady(ctx: Context): Plan {
  const edd = ctx.current.apps.find(a => a.id === "edd");
  if (!edd || edd.status !== "draft") {
    const ids = pendingFilings(ctx.current);
    return {
      steps: [S("searching", "Checking which applications are complete", "查看哪些申请已经完成")],
      reply: ids.length
        ? { text: [B("Everything that's complete is waiting for your approval. Nothing gets filed until you approve it.", "所有已完成的申请都在等待您批准。您批准之前，任何申请都不会提交。")], approvals: ids }
        : { text: [B("Nothing else is complete yet. The plan check is next: it needs your floor plan and equipment list.", "目前没有其他已完成的申请。下一项是图纸审查，需要您的平面图和设备清单。")], approvals: ["a-docs"] },
    };
  }
  const signOpen = ctx.current.approvals.some(a => a.id === "a-sign");
  return {
    steps: [
      S("searching", "Checking which applications are complete", "查看哪些申请已经完成"),
      S("shaping", "Filling the employer registration on edd.ca.gov", "在 edd.ca.gov 上填写雇主登记", "edd.ca.gov"),
      S("solving", "Checking every answer against the EDD's requirements", "对照加州就业发展局的要求逐项核对", "edd.ca.gov"),
    ],
    updates: [all(
      setApp("edd", { status: "ready", next: B("Ready to file. Waiting for your approval", "可以提交，等待您批准") }),
      setCheck("edd", "form", { state: "done", doc: "d-edd", note: B("Filled by Placetta", "快哉已填写") }),
      addDoc(doc("d-edd", "employer-registration.pdf", 164_000, "agent", "edd", B("Prepared", "已准备"))),
      dropTask("r-edd"),
      audit("agent", B("Filled application", "填写申请"), B("Employer payroll tax registration", "雇主工资税登记"), B("6 fields from Context", "根据资料填写 6 项")),
      addApproval(A_EDD),
      audit("agent", B("Asked for approval", "请求批准"), B("Employer payroll tax registration", "雇主工资税登记"), B("No fee", "无需费用")),
    )],
    reply: {
      text: [signOpen
        ? B("Two applications are ready to file: the employer registration, which has no fee, and the sign permit, with a $410 fee. I never file without your OK, so both are waiting for your approval.", "有两项申请可以提交：雇主登记（无需费用）和招牌许可（费用 $410）。没有您的同意我不会提交，所以两项都在等您批准。")
        : B("The employer registration is ready to file, and it has no fee. I never file without your OK, so it's waiting for your approval.", "雇主登记可以提交了，无需费用。没有您的同意我不会提交，所以它在等您批准。")],
      apps: ["edd"],
      approvals: ["a-edd", ...pendingFilings(ctx.current)],
    },
  };
}

function blocking(): Plan {
  return {
    steps: [
      S("searching", "Checking the status of every application", "查看每项申请的进度"),
      S("connecting", "Tracing which permits depend on others", "梳理许可证之间的依赖关系"),
      S("solving", "Finding the longest chain to opening day", "找出通往开业日最长的环节"),
    ],
    reply: {
      text: [
        B("One chain sets your opening date. Everything else can run alongside it.", "开业日期由一条链决定，其余事项都可以同步推进。"),
        B("The city won't issue the build-out permit for a food facility until the county approves your plans, and the plan check is waiting on two documents from you.", "在县政府批准您的图纸之前，市政府不会签发食品设施的装修许可，而图纸审查正在等您提供两份文件。"),
      ],
      chain: [B("Plan check", "图纸审查"), B("Building permit", "建筑许可"), B("Build-out", "装修施工"), B("Fire and health inspections", "消防与卫生检查"), B("Permit to operate", "经营许可")],
      approvals: ["a-docs"],
    },
  };
}

function fremont(): Plan {
  return {
    steps: [
      S("searching", "Checking fremont.gov requirements", "查阅 fremont.gov 的要求", "fremont.gov"),
      S("searching", "Checking Alameda County Environmental Health rules", "查阅阿拉米达县环境卫生局的规定", "acgov.org"),
      S("weaving", "Reusing what carries over from San Jose", "复用圣何塞已有的材料"),
    ],
    updates: [all(
      w => ({ ...w, locations: w.locations.some(l => l.id === "fremont") ? w.locations : [...w.locations, { id: "fremont", name: B("Fremont", "弗里蒙特"), county: B("Alameda County", "阿拉米达县"), state: "mapping" }] }),
      setFact({ id: "f-second", group: "location", label: B("Second shop", "第二家店"), value: B("Planned in Fremont, Alameda County", "计划在阿拉米达县弗里蒙特市"), source: B("You told me", "您告诉我的") }),
      remember(B("Second shop planned in Fremont", "计划在弗里蒙特开第二家店")),
      addTask({ id: "r-fremont", state: "weaving", label: B("Mapping the licenses for a Fremont shop", "梳理弗里蒙特门店所需的许可证"), detail: B("Waiting for the address", "等待地址") }),
    )],
    reply: {
      text: [
        B("Fremont is in Alameda County, so the health filings move to Alameda County Environmental Health. Your EIN and EDD account carry over, and the state wants a seller's permit for each location, which I can add under your existing account.", "弗里蒙特属于阿拉米达县，因此卫生相关申请改由阿拉米达县环境卫生局受理。您的 EIN 和就业发展局账户可以沿用；州政府要求每个门店单独办理销售许可证，我可以在您现有的账户下添加。"),
        B("Send me the address when you have it and I'll start preparing the filings.", "有了地址就发给我，我会开始准备申请材料。"),
      ],
      memory: [B("Second shop planned in Fremont", "计划在弗里蒙特开第二家店")],
      next: { label: B("See the Fremont licenses", "查看弗里蒙特所需许可证"), req: { match: { what: "Milk tea shop", where: "Fremont, CA" } } },
    },
  };
}

function prepareSoi(ctx: Context): Plan {
  if (ctx.current.apps.some(a => a.id === "soi")) {
    const open = ctx.current.approvals.some(a => a.id === "a-soi");
    return { steps: [S("searching", "Checking the Statement of Information", "查看信息声明")], reply: open
      ? { text: [B("It's drafted and waiting for your approval.", "已起草好，正在等您批准。")], approvals: ["a-soi"], apps: ["soi"] }
      : { text: [B("It's already filed. The next one is due in two years, and it's on your Deadlines.", "已经提交。下一次在两年后到期，已列入您的截止日期。")] } };
  }
  return {
    steps: [
      S("weaving", "Reading your LLC details from Context", "从资料中读取公司信息"),
      S("shaping", "Filling Form LLC-12 on bizfile Online", "在 bizfile 在线服务上填写 LLC-12 表", "sos.ca.gov"),
      S("solving", "Checking it against your articles of organization", "对照组织章程核对"),
    ],
    updates: [all(
      addApp(SOI_APP),
      addDoc(doc("d-soi", "statement-of-information-llc-12.pdf", 118_000, "agent", "soi", B("Prepared", "已准备"))),
      audit("agent", B("Filled application", "填写申请"), B("LLC Statement of Information", "有限责任公司信息声明"), B("5 fields from Context", "根据资料填写 5 项")),
      addApproval(A_SOI),
      audit("agent", B("Asked for approval", "请求批准"), B("LLC Statement of Information", "有限责任公司信息声明"), B("Fee $20", "费用 $20")),
      dropNudge("n-soi"),
      w => ({ ...w, deadlines: w.deadlines.map(d => (d.id === "dl-soi" ? { ...d, app: "soi", ask: B("Review", "查看"), prompt: undefined } : d)) }),
    )],
    reply: {
      text: [B("Your Statement of Information is drafted from what I already know. It's a $20 filing with the Secretary of State, due in 21 days. Check it over and approve when you're ready.", "已根据现有资料起草好您的信息声明。这是向州务卿提交的申报，费用 $20，21 天后到期。请核对，准备好后批准即可。")],
      apps: ["soi"],
      approvals: ["a-soi"],
    },
  };
}

function ruleChange(ctx: Context): Plan {
  const done = ctx.current.apps.find(a => a.id === "plancheck")?.checklist.some(c => c.id === "grease");
  return {
    steps: [
      S("searching", "Reading the county's notice", "阅读县政府的通知", "sccgov.org"),
      S("solving", "Checking whether it applies to your shop", "判断是否适用于您的门店"),
      ...(done ? [] : [S("shaping", "Starting the worksheet from your plans", "根据您的图纸开始填写计算表")]),
    ],
    updates: done ? [] : [all(
      addCheck("plancheck", { id: "grease", label: B("Grease interceptor worksheet (new, sample notice)", "隔油池计算表（新增，示例通知）"), state: "auto", note: B("Started by Placetta. Finished once the equipment list is in", "快哉已开始填写，设备清单到位后完成") }),
      dropNudge("n-rule"),
      audit("agent", B("Added checklist item", "新增清单项"), B("Food facility plan check", "食品设施图纸审查"), B("Grease interceptor worksheet (sample notice)", "隔油池计算表（示例通知）")),
    )],
    reply: {
      text: [B("The county now asks for a grease interceptor worksheet with food facility plan checks. It applies to you, so I added it to your plan check checklist and started it. I'll finish it once your equipment list is in.", "县政府现在要求食品设施图纸审查附上隔油池计算表。这适用于您，所以我已把它加入图纸审查清单并开始填写，设备清单到位后我会完成。")],
      apps: ["plancheck"],
    },
  };
}

function staff(ctx: Context): Plan {
  const open = ctx.current.approvals.some(a => a.id === "a-staff");
  return {
    steps: [S("searching", "Checking which staff still need cards", "查看哪些员工还没有证书")],
    reply: open
      ? { text: [B("4 of your 6 staff still need food handler cards. The text is written; approve it and I'll send it from your shop's number.", "6 名员工中还有 4 名没有食品从业人员卡。短信已写好，您批准后我会用门店号码发送。")], approvals: ["a-staff"] }
      : { text: [B("I've already texted them. I'll add each card to the checklist as it comes in.", "我已经发过短信了。证书交回后我会逐一加入清单。")], apps: ["handler"] },
  };
}

const SCRIPTS: { match: RegExp; plan: (ctx: Context) => Plan }[] = [
  { match: /statement|biennial|llc-12|信息声明|申报/i, plan: prepareSoi },
  { match: /changed|county plan check|rule|notice|变化|规定|通知/i, plan: ruleChange },
  { match: /staff|handler|remind|员工|提醒|从业/i, plan: staff },
  { match: /fremont|second|another|new (shop|store|location)|弗里蒙特|第二|新店|分店/i, plan: fremont },
  { match: /block|opening|critical|delay|阻|拖|开业|延误/i, plan: blocking },
  { match: /file|submit|ready|apply|提交|就绪/i, plan: fileReady },
];

const FALLBACK = (): Plan => ({
  steps: [S("searching", "Looking up the rules that apply", "查找适用的法规"), S("composing", "Writing a reply", "撰写回复")],
  reply: { text: [
    B("I can take that on. Tell me the city and what the location will do, for example serve food, store goods or sell retail.", "这件事我可以接手。请告诉我城市名称，以及门店的用途，例如餐饮、仓储或零售。"),
    B("I'll list every license from the city up to the national level, prepare each one and bring it to you to approve before anything is filed.", "我会列出从市级到国家的每一张许可证，逐一准备好，并在提交前交给您批准。"),
  ] },
});

/* --------------------------------- filing --------------------------------- */

type FileCfg = { app: string; portal: Bi; tool: string; fee: number; receipt: string; est: Bi; days: number; next: Bi; watch: Bi; reply: Bi[]; also?: P[] };
const FILE: Record<string, FileCfg> = {
  "a-sign": { app: "sign", portal: PORTAL.sj, tool: "sanjoseca.gov", fee: 410, receipt: "sign-permit-receipt.pdf", est: B("Sign permit decision expected", "招牌许可预计出结果"), days: 18,
    next: B("Filed just now. Decision in about 2 to 3 weeks", "刚刚提交，约 2 至 3 周出结果"), watch: B("Watching San Jose for the sign permit", "跟进圣何塞市招牌许可"),
    reply: [B("Filed the sign permit with the City of San Jose and paid the $410 fee. The receipt is in Documents, and I'll watch for the decision.", "已向圣何塞市提交招牌许可并支付 $410 费用。收据在文件中，我会跟进审批结果。")] },
  "a-edd": { app: "edd", portal: PORTAL.edd, tool: "edd.ca.gov", fee: 0, receipt: "employer-registration-confirmation.pdf", est: B("Employer account number expected", "预计收到雇主账号"), days: 14,
    next: B("Filed just now. Account number in about 2 weeks", "刚刚提交，约 2 周内获得账号"), watch: B("Watching the EDD for your employer account number", "跟进加州就业发展局的雇主账号"),
    reply: [B("Filed your employer registration with the EDD. There was no fee. I'll watch for your employer account number, usually about two weeks.", "已向加州就业发展局提交雇主登记，无需费用。我会跟进您的雇主账号，通常约两周。")],
    also: [dropDeadline("dl-wages")] },
  "a-plan": { app: "plancheck", portal: PORTAL.scc, tool: "sccgov.org", fee: 1385, receipt: "plan-check-receipt.pdf", est: B("Plan check comments or approval expected", "预计收到图纸审查意见或批准"), days: 26,
    next: B("Filed just now. The county usually replies in 15 to 20 business days", "刚刚提交，县政府通常 15 至 20 个工作日内回复"), watch: B("Watching the county for plan check comments", "跟进县政府的图纸审查意见"),
    reply: [B("Filed the plan check with Santa Clara County and paid the fee. If the county sends comments, I'll draft the changes and bring them to you.", "已向圣克拉拉县提交图纸审查并支付费用。如果县政府提出意见，我会起草修改并交给您确认。")],
    also: [dropDeadline("dl-plan"), setApp("building", { next: B("Starts when the county approves the plans", "县政府批准图纸后开始") })] },
  "a-soi": { app: "soi", portal: PORTAL.sos, tool: "sos.ca.gov", fee: 20, receipt: "statement-of-information-receipt.pdf", est: B("Next Statement of Information due", "下次信息声明到期"), days: 730,
    next: B("Filed just now. Next one due in 2 years", "刚刚提交，下次在 2 年后"), watch: B("Confirming the Statement of Information was accepted", "确认信息声明已被受理"),
    reply: [B("Filed your Statement of Information with the Secretary of State and paid the $20 fee. The next one is due in two years, and it's on your Deadlines.", "已向州务卿提交信息声明并支付 $20 费用。下一次在两年后到期，已列入您的截止日期。")],
    also: [dropDeadline("dl-soi")] },
};

function file(id: string, ctx: Context): Plan {
  const c = FILE[id];
  const a = ctx.current.apps.find(x => x.id === c.app)!;
  const rid = "d-r-" + c.app;
  return {
    steps: [
      S("connecting", `Signing in to ${c.portal.en} with your saved account`, `使用您保存的账户登录${c.portal.zh}`, c.tool),
      S("working", `Submitting the ${a.name.en.charAt(0).toLowerCase() + a.name.en.slice(1)}`, `提交${a.name.zh}`, c.tool),
      ...(c.fee ? [S("working", `Paying $${c.fee.toLocaleString("en-US")} with the card ending 4821`, `使用尾号 4821 的银行卡支付 $${c.fee.toLocaleString("en-US")}`)] : []),
      S("weaving", "Saving the receipt to Documents", "将收据保存到文件"),
    ],
    updates: [all(
      dropApproval(id),
      audit("you", B("Approved filing", "批准提交"), a.name, c.fee ? B(`Fee $${c.fee.toLocaleString("en-US")}`, `费用 $${c.fee.toLocaleString("en-US")}`) : B("No fee", "无需费用")),
      audit("agent", B("Submitted application", "提交申请"), a.name, same(c.tool)),
      ...(c.fee ? [audit("agent", B("Paid fee", "支付费用"), a.name, B(`$${c.fee.toLocaleString("en-US")}, card ending 4821`, `$${c.fee.toLocaleString("en-US")}，尾号 4821 的银行卡`))] : []),
      addDoc(doc(rid, c.receipt, 86_000 + c.receipt.length * 977, "agent", c.app, B("Receipt", "收据"))),
      audit("agent", B("Saved receipt", "保存收据"), same(c.receipt)),
      setApp(c.app, { status: id === "a-soi" ? "approved" : "review", receipt: rid, next: c.next }),
      addTask({ id: "r-" + c.app, state: "searching", label: c.watch, detail: B("Started just now", "刚刚开始") }),
      addDeadline({ id: "dl-r-" + c.app, date: inDays(c.days), kind: id === "a-soi" ? "renewal" : "estimate", app: c.app, title: c.est, agency: a.agency }),
      ...(c.also ?? []),
    )],
    reply: { text: c.reply, files: [rid] },
  };
}

function send(): Plan {
  return {
    steps: [S("composing", "Writing 4 texts", "撰写 4 条短信"), S("working", "Sending from your shop's number", "以门店号码发送")],
    updates: [all(
      dropApproval("a-staff"),
      audit("you", B("Approved message", "批准消息"), B("Text to 4 staff", "发给 4 名员工的短信")),
      audit("agent", B("Sent 4 texts", "发送 4 条短信"), B("Food handler cards", "食品从业人员卡"), B("C. Ortiz, D. Nguyen, E. Chen, F. Patel", "C. Ortiz、D. Nguyen、E. Chen、F. Patel")),
      setApp("handler", { next: B("2 of 6 in. Reminded the rest just now", "已收到 2/6，刚刚提醒了其余员工") }),
      addTask({ id: "r-staff", state: "connecting", label: B("Collecting food handler cards", "收集食品从业人员卡"), detail: B("2 of 6 in", "已收到 2/6") }),
      w => ({ ...w, deadlines: w.deadlines.map(d => (d.id === "dl-fh" ? { ...d, ask: undefined, prompt: undefined } : d)) }),
    )],
    reply: { text: [B("Sent. I'll collect the cards as they come in and add them to the checklist.", "已发送。证书交回后，我会收集并加入清单。")], apps: ["handler"] },
  };
}

/** Approvals the live agent created: file any application, or send any drafted message, once the person approves. */
function generic(id: string, ctx: Context): Plan {
  const ap = ctx.current.approvals.find(a => a.id === id);
  if (!ap) return FALLBACK();
  if (ap.kind === "send") {
    const to = ap.data?.find(f => f.id === "to")?.value ?? "";
    return {
      steps: [S("working", `Sending the message to ${to}`, `向 ${to} 发送消息`)],
      updates: [all(dropApproval(id), audit("you", B("Approved message", "批准消息"), ap.title), audit("agent", B("Sent message", "发送消息"), same(to)))],
      reply: { text: [B(`Sent to ${to}.`, `已发送给 ${to}。`)] },
    };
  }
  const a = ctx.current.apps.find(x => x.id === ap.app);
  if (!a) return FALLBACK();
  const fee = a.fees.reduce((s, f) => s + f.amount, 0);
  const site = a.source.label || "";
  const portal = site ? B(`${site}`, `${site}`) : B("the agency's portal", "机构门户");
  const rid = "d-r-" + a.id, name = a.name.en.charAt(0).toLowerCase() + a.name.en.slice(1);
  const receipt = a.name.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-receipt.pdf";
  return {
    steps: [
      S("connecting", `Signing in to ${portal.en} with your saved account`, `使用您保存的账户登录 ${portal.zh}`, site || undefined),
      S("working", `Submitting the ${name}`, `提交${a.name.zh}`, site || undefined),
      ...(fee ? [S("working", `Paying $${fee.toLocaleString("en-US")} with the card ending 4821`, `使用尾号 4821 的银行卡支付 $${fee.toLocaleString("en-US")}`)] : []),
      S("weaving", "Saving the receipt to Documents", "将收据保存到文件"),
    ],
    updates: [all(
      dropApproval(id),
      audit("you", B("Approved filing", "批准提交"), a.name, fee ? same(`$${fee.toLocaleString("en-US")}`) : B("No fee", "无需费用")),
      audit("agent", B("Submitted application", "提交申请"), a.name, site ? same(site) : undefined),
      ...(fee ? [audit("agent", B("Paid fee", "支付费用"), a.name, B(`$${fee.toLocaleString("en-US")}, card ending 4821`, `$${fee.toLocaleString("en-US")}，尾号 4821 的银行卡`))] : []),
      addDoc(doc(rid, receipt, 90_000, "agent", a.id, B("Receipt", "收据"))),
      setApp(a.id, { status: "review", receipt: rid, next: B("Filed just now. Placetta is watching for a decision", "刚刚提交，快哉正在跟进审批") }),
      addTask({ id: "r-" + a.id, state: "searching", label: B(`Watching for a decision on the ${name}`, `跟进${a.name.zh}的审批`), detail: B("Started just now", "刚刚开始") }),
    )],
    reply: { text: [B(`Filed the ${name} with ${a.agency.en}${fee ? ` and paid the $${fee.toLocaleString("en-US")} fee` : ""}. The receipt is in Documents.`, `已向${a.agency.zh}提交${a.name.zh}${fee ? `并支付 $${fee.toLocaleString("en-US")} 费用` : ""}。收据在文件中。`)], files: [rid] },
  };
}

/* --------------------------------- uploads -------------------------------- */

const SAMPLE_FILES: Record<string, { name: string; size: number }> = {
  fp: { name: "floor-plan.pdf", size: 1_240_000 },
  eq: { name: "equipment-list.xlsx", size: 58_000 },
  coi: { name: "contractor-insurance-certificate.pdf", size: 204_000 },
};
export const sampleFileFor = (item: string) => SAMPLE_FILES[item] ?? { name: "document.pdf", size: 120_000 };

type Mem = { id: string; group: Fact["group"]; label: Bi; value: Bi; source: Bi };
const EXTRACT: Record<string, { reading: Bi; pulling: Bi; out: [Bi, string][]; fields?: [string, string][]; memory?: Mem[] }> = {
  fp: { reading: B("floor plan", "平面图"), pulling: B("Pulling out the seats, sinks and floor area", "提取座位、水池和面积"),
    out: [[B("Seats", "座位"), "18"], [B("Hand sinks", "洗手池"), "2"], [B("Floor area", "面积"), "1,150 sq ft"], [B("Restroom", "卫生间"), "1, accessible"]],
    fields: [["seats", "18"], ["sinks", "2"]], memory: [{ id: "f-seats", group: "operations", label: B("Seats", "座位"), value: same("18"), source: B("From floor-plan.pdf", "来自 floor-plan.pdf") }] },
  eq: { reading: B("equipment list", "设备清单"), pulling: B("Pulling out sinks, refrigeration and the water heater", "提取水池、冷藏设备和热水器"),
    out: [[B("Water heater", "热水器"), "50 gal, gas"], [B("Sinks", "水池"), "3-compartment, mop sink"], [B("Refrigeration", "冷藏"), "2 reach-in, 1 under-counter"], [B("Items", "设备数量"), "14"]],
    fields: [["heater", "50 gal, gas"]], memory: [{ id: "f-heater", group: "operations", label: B("Water heater", "热水器"), value: B("50 gal, gas", "50 加仑，燃气"), source: B("From equipment-list.xlsx", "来自 equipment-list.xlsx") }] },
  coi: { reading: B("insurance certificate", "保险证明"), pulling: B("Pulling out the contractor, coverage and expiry", "提取承包商、保额和到期日"),
    out: [[B("Contractor", "承包商"), "Brightline Builders (sample)"], [B("License", "执照"), "CSLB ••••812"], [B("General liability", "一般责任险"), "$1,000,000"], [B("Expires", "到期"), inDays(300)]],
    memory: [{ id: "f-contractor", group: "location", label: B("Contractor", "承包商"), value: B("Brightline Builders (sample), insured to $1,000,000", "Brightline Builders（示例），保额 $1,000,000"), source: B("From the insurance certificate", "来自保险证明") }] },
  card: { reading: B("food handler card", "食品从业人员卡"), pulling: B("Reading the name and expiry", "读取姓名和到期日"),
    out: [[B("Valid for", "有效期"), "3 years"], [B("Expires", "到期"), inDays(3 * 365)]] },
};

function upload(u: { app: string; item: string; files: { name: string; size: number }[] }, ctx: Context): Plan {
  const app = ctx.current.apps.find(a => a.id === u.app)!;
  const items = u.item === "*" ? app.checklist.filter(c => c.state === "missing" && !c.dep).map(c => c.id) : [u.item];
  const files = items.map((id, i) => u.files[i] ?? u.files[0] ?? sampleFileFor(id));
  const kinds = items.map(id => (EXTRACT[id] ? id : u.app === "handler" ? "card" : ""));
  const steps: Step[] = [];
  const updates: P[] = [];
  const memory: Bi[] = [];
  items.forEach((id, i) => {
    const f = files[i], k = EXTRACT[kinds[i]], did = `d-up-${u.app}-${id}-${seq++}`;
    steps.push(S("shaping", `Reading ${f.name}`, `读取 ${f.name}`));
    if (k) steps.push({ state: "weaving", label: k.pulling });
    updates.push(
      addDoc({ id: did, name: f.name, kind: (f.name.split(".").pop()?.toLowerCase() ?? "pdf") as Doc["kind"], size: f.size, by: "you", at: nowIso(), app: u.app, tag: B("Uploaded", "已上传") }),
      audit("you", B("Uploaded", "上传"), same(f.name), app.name),
      setCheck(u.app, id, { state: "done", doc: did, extracted: k?.out }),
      ...(k ? [audit("agent", B("Extracted data", "提取信息"), same(f.name), B(k.out.map(o => o[0].en).join(", "), k.out.map(o => o[0].zh).join("、")))] : []),
      ...(k?.fields ?? []).map(([fid, v]) => setField(u.app, fid, v, B(`From ${f.name}`, `来自 ${f.name}`))),
    );
    for (const m of k?.memory ?? []) {
      const text = B(`${m.label.en}: ${m.value.en}`, `${m.label.zh}：${m.value.zh}`);
      memory.push(text); updates.push(setFact({ id: m.id, group: m.group, label: m.label, value: m.value, source: m.source }), remember(text));
    }
  });

  // What this upload completes.
  const stillMissing = app.checklist.filter(c => c.state === "missing" && !c.dep && !items.includes(c.id));
  let reply: Reply = { text: [B("Added it to the checklist.", "已加入清单。")], apps: [u.app], memory };
  if (u.app === "plancheck") {
    if (!stillMissing.length) {
      steps.push(S("solving", "Checking the plan check against the county's list", "对照县政府清单核对图纸审查", "sccgov.org"));
      updates.push(
        setCheck("plancheck", "grease", { state: "done", note: B("Finished by Placetta from the equipment list", "快哉根据设备清单完成") }),
        setApp("plancheck", { status: "ready", next: B("Ready to file. Waiting for your approval", "可以提交，等待您批准") }),
        dropApproval("a-docs"), addApproval(A_PLAN),
        audit("agent", B("Asked for approval", "请求批准"), B("Food facility plan check", "食品设施图纸审查"), B("Fee $1,385", "费用 $1,385")),
      );
      reply = { text: [B("I read your floor plan and equipment list and filled in the rest of the plan check. It's ready to file with the $1,385 fee once you approve.", "我已读取平面图和设备清单，并补全了图纸审查的其余内容。您批准后即可提交，费用 $1,385。")], apps: ["plancheck"], approvals: ["a-plan"], memory };
    } else {
      reply = { text: [B("Got it, and I filled in what it covers. One more document and the plan check is ready to file.", "收到，我已填入其中的信息。再补一份文件，图纸审查就可以提交了。")], apps: ["plancheck"], memory };
    }
  } else if (u.app === "building" && items.includes("coi")) {
    updates.push(addDeadline({ id: "dl-coi", date: inDays(270), kind: "renewal", app: "building", title: B("Contractor's insurance expires in 30 days: ask for a new certificate", "承包商保险 30 天后到期：索取新证明"), agency: B("Brightline Builders (sample)", "Brightline Builders（示例）") }));
    reply = { text: [B("I read the insurance certificate and added it to the building permit. I'll remind you a month before it expires.", "我已读取保险证明并加入建筑许可。到期前一个月我会提醒您。")], apps: ["building"], memory };
  } else if (u.app === "handler") {
    const left = stillMissing.length;
    updates.push(setApp("handler", left ? { next: B(`${6 - left} of 6 cards in`, `6 张中已收到 ${6 - left} 张`) } : { status: "approved", next: B("All 6 cards in", "6 张全部收到") }));
    if (!left) updates.push(dropTask("r-staff"), dropDeadline("dl-fh"));
    reply = { text: [left ? B("Added the card to the checklist.", "已把证书加入清单。") : B("That's all six food handler cards. This one is done.", "6 张食品从业人员卡已全部收齐，这一项完成了。")], apps: ["handler"], memory };
  }
  return { steps, updates: [all(...updates)], reply };
}

/* --------------------------------- matcher -------------------------------- */

function match(what: string, where: string): Plan {
  const isSJ = /san jos|圣何塞/i.test(where), isFr = /fremont|弗里蒙特/i.test(where);
  const food = /tea|coffee|caf|restaurant|bak|food|truck|bar|kitchen|juice|boba|奶茶|餐|咖啡|面包|食|饮/i.test(what);
  const w = where.trim() || "your city";
  const steps: Step[] = [
    S("weaving", `Working out what a ${what.trim().toLowerCase() || "business"} does`, `分析“${what.trim() || "企业"}”的经营内容`),
    S("searching", "Checking federal requirements on irs.gov", "查阅 irs.gov 的联邦要求", "irs.gov"),
    S("searching", "Checking state requirements", "查阅州级要求", isSJ || isFr ? "cdtfa.ca.gov" : undefined),
    isSJ ? S("searching", "Checking Santa Clara County Environmental Health rules", "查阅圣克拉拉县环境卫生局规定", "sccgov.org")
      : isFr ? S("searching", "Checking Alameda County Environmental Health rules", "查阅阿拉米达县环境卫生局规定", "acgov.org")
        : S("searching", `Checking county rules for ${w}`, `查阅 ${w} 的县级规定`),
    isSJ ? S("searching", "Checking sanjoseca.gov requirements", "查阅 sanjoseca.gov 的要求", "sanjoseca.gov")
      : isFr ? S("searching", "Checking fremont.gov requirements", "查阅 fremont.gov 的要求", "fremont.gov")
        : S("searching", `Checking city rules for ${w}`, `查阅 ${w} 的市级规定`),
    S("connecting", "Comparing with your workspace", "与您的工作区比对"),
  ];
  if (isSJ && food) return { steps, reply: {
    text: [B("I found 11 licenses for a milk tea shop in San Jose. 10 are already in your workspace; the one to add is the LLC Statement of Information.", "圣何塞的奶茶店共需 11 项许可。其中 10 项已在您的工作区中，需要新增的是有限责任公司信息声明。")],
    matches: { what, where, hits: MATCH_SJ } } };
  if (isFr) return { steps, reply: {
    text: [B("A Fremont shop needs 10 licenses. Your EIN and EDD account carry over, so 8 are new, mostly with Alameda County and the City of Fremont.", "弗里蒙特门店共需 10 项许可。您的 EIN 和就业发展局账户可以沿用，因此新增 8 项，主要由阿拉米达县和弗里蒙特市受理。")],
    matches: { what, where, hits: MATCH_FREMONT } } };
  return { steps, reply: {
    text: [B("Here's a first pass at what this kind of business usually needs there. I check each one with the agency before anything is prepared or filed.", "以下是这类企业在当地通常需要的许可初步清单。准备或提交任何申请之前，我都会逐一向机构核实。")],
    matches: { what, where, hits: genericMatch(what, where) } } };
}

/* ---------------------------------- run ---------------------------------- */

function plan(req: Request, ctx: Context): Plan {
  if ("approve" in req) return req.approve === "a-staff" ? send() : FILE[req.approve] ? file(req.approve, ctx) : generic(req.approve, ctx);
  if ("upload" in req) return upload(req.upload, ctx);
  if ("match" in req) return match(req.match.what, req.match.where);
  return SCRIPTS.find(s => s.match.test(req.text))?.plan(ctx) ?? FALLBACK();
}

/** Scripted stand-in for the real agent, so the product can be designed and tested end to end. */
export const demoAgent: AgentBackend = {
  async run(req, ctx, onEvent, signal) {
    const p = plan(req, ctx);
    for (let i = 0; i < p.steps.length; i++) {
      onEvent({ type: "step", index: i, step: p.steps[i] });
      await wait(950 + Math.random() * 550, signal);
    }
    p.updates?.forEach(patch => onEvent({ type: "update", patch }));
    onEvent({ type: "reply", reply: p.reply });
  },
};

/** Every reply text the demo can say, for recording the voice clips (scripts/dump-replies.ts). */
export const __plansForRecording = { plan, SAMPLE_FILES };
