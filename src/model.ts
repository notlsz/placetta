import type { OrbState } from "thinking-orbs";

/* Everything the agent tracks for one location: the goal, every filing, what it's doing right now,
   what it needs from you, and a log of every action taken. */

export type Bi = { en: string; zh: string };
export type Level = "federal" | "state" | "county" | "city";
export type Status = "approved" | "filed" | "review" | "needs" | "waiting" | "ready" | "todo" | "draft";
export type Actor = "agent" | "you" | "agency";
export type Autonomy = "prepare" | "ask" | "submit";

export type Filing = {
  id: string;
  name: Bi;
  agency: Bi;
  level: Level;
  status: Status;
  next?: Bi;          // the next thing that happens, in plain words
  critical?: boolean; // on the chain that sets the opening date
};

export type Task = { id: string; state: OrbState; label: Bi; detail?: Bi };

export type ApprovalKind = "pay" | "sign" | "upload" | "send" | "submit";
export type Approval = { id: string; kind: ApprovalKind; title: Bi; detail: Bi; agency?: Bi; action: Bi };

export type Activity = { id: string; when: Bi; actor: Actor; who?: Bi; text: Bi };

export type Connection = { id: string; name: Bi; level: Level | "vault"; state: "connected" | "missing"; detail: Bi };

export type Case = {
  id: string;
  name: Bi;
  place: Bi;
  goal: Bi;
  filings: Filing[];
  running: Task[];
  approvals: Approval[];
  closed: Approval[];   // approvals already answered, so earlier messages can show them as done
  activity: Activity[];
  connections: Connection[];
};

const B = (en: string, zh: string): Bi => ({ en, zh });

export const SAMPLE_CASE: Case = {
  id: "sj",
  name: B("Milk tea shop, San Jose", "圣何塞奶茶店"),
  place: B("Santa Clara County, California", "加利福尼亚州圣克拉拉县"),
  goal: B("Open by March 2027", "2027 年 3 月开业"),
  filings: [
    { id: "ein", name: B("Employer Identification Number", "雇主识别号码（EIN）"), agency: B("IRS", "美国国税局"), level: "federal", status: "approved" },
    { id: "seller", name: B("Seller's permit", "销售许可证"), agency: B("California Department of Tax and Fee Administration", "加州税费管理局"), level: "state", status: "approved" },
    { id: "edd", name: B("Employer registration", "雇主登记"), agency: B("California Employment Development Department", "加州就业发展局"), level: "state", status: "ready", next: B("No fee or signature: the agent can file it", "无需费用或签名，助理可直接提交") },
    { id: "handler", name: B("Food handler cards", "食品从业人员卡"), agency: B("Required by California for food staff", "加州对食品从业人员的要求"), level: "state", status: "needs", next: B("2 of 6 staff done", "6 名员工中已完成 2 名") },
    { id: "plancheck", name: B("Food facility plan check", "食品设施图纸审查"), agency: B("Santa Clara County Environmental Health", "圣克拉拉县环境卫生局"), level: "county", status: "needs", next: B("Needs a floor plan and equipment list", "需要平面图和设备清单"), critical: true },
    { id: "pto", name: B("Health permit to operate", "食品经营卫生许可"), agency: B("Santa Clara County Environmental Health", "圣克拉拉县环境卫生局"), level: "county", status: "todo", next: B("Issued after the final inspection", "最终检查通过后签发"), critical: true },
    { id: "btc", name: B("Business Tax Certificate", "营业税证书"), agency: B("City of San Jose, Finance Department", "圣何塞市财政局"), level: "city", status: "review", next: B("Filed Oct 2, the agent is watching for a decision", "10 月 2 日已提交，助理正在跟进审批结果") },
    { id: "building", name: B("Building permit for the build-out", "店面装修建筑许可"), agency: B("City of San Jose, Planning, Building and Code Enforcement", "圣何塞市规划、建筑与执法局"), level: "city", status: "waiting", next: B("Starts once the county approves the plans", "县政府批准图纸后开始"), critical: true },
    { id: "sign", name: B("Sign permit", "招牌许可"), agency: B("City of San Jose, Planning, Building and Code Enforcement", "圣何塞市规划、建筑与执法局"), level: "city", status: "ready", next: B("Drafted, has a fee: waiting for your approval", "已起草，需缴费，等待您批准") },
    { id: "fire", name: B("Fire inspection", "消防检查"), agency: B("San Jose Fire Department", "圣何塞消防局"), level: "city", status: "todo", next: B("Booked after the build-out", "装修完成后预约"), critical: true },
  ],
  running: [
    { id: "r-btc", state: "searching", label: B("Watching San Jose for the Business Tax Certificate decision", "跟进圣何塞市营业税证书的审批"), detail: B("Checked 12 minutes ago", "12 分钟前查看过") },
    { id: "r-rules", state: "working", label: B("Monitoring rule changes in San Jose and Santa Clara County", "监测圣何塞市和圣克拉拉县的法规变化"), detail: B("Daily", "每天") },
    { id: "r-staff", state: "connecting", label: B("Collecting staff food handler certificates", "收集员工的食品从业人员证书"), detail: B("2 of 6 in", "已收到 2/6") },
  ],
  approvals: [
    { id: "a-sign", kind: "pay", title: B("Pay and file the sign permit", "缴费并提交招牌许可"), agency: B("City of San Jose", "圣何塞市"),
      detail: B("Drafted from your storefront photos and lease. The fee is paid with your saved card; the agent never sees the card number.", "已根据您的门店照片和租约起草。费用使用您保存的银行卡支付，助理看不到卡号。"),
      action: B("Approve and file", "批准并提交") },
    { id: "a-docs", kind: "upload", title: B("Add the floor plan and equipment list", "上传平面图和设备清单"), agency: B("Santa Clara County", "圣克拉拉县"),
      detail: B("The county's plan check can't be filed without them, and it sets your opening date.", "没有这两份文件就无法提交县政府的图纸审查，而它决定了您的开业日期。"),
      action: B("Add files", "添加文件") },
    { id: "a-staff", kind: "send", title: B("Remind 4 staff about food handler cards", "提醒 4 名员工办理食品从业人员卡"),
      detail: B("A short text to each of them with the course link. Sent from your shop's number.", "给每人发送一条附带课程链接的短信，以门店号码发出。"),
      action: B("Send reminders", "发送提醒") },
  ],
  closed: [],
  activity: [
    { id: "x1", when: B("Today 9:41", "今天 9:41"), actor: "agent", text: B("Checked the city portal: the Business Tax Certificate is still in review", "查看了市政府门户：营业税证书仍在审核中") },
    { id: "x2", when: B("Today 9:12", "今天 9:12"), actor: "agent", text: B("Drafted the sign permit application from your storefront photos and lease", "根据门店照片和租约起草了招牌许可申请") },
    { id: "x3", when: B("Yesterday 4:05 PM", "昨天 16:05"), actor: "agency", who: B("CDTFA", "加州税费管理局"), text: B("Approved the seller's permit", "批准了销售许可证") },
    { id: "x4", when: B("Oct 2", "10 月 2 日"), actor: "agent", text: B("Filed the Business Tax Certificate with the City of San Jose", "向圣何塞市提交了营业税证书申请") },
    { id: "x5", when: B("Oct 2", "10 月 2 日"), actor: "you", text: B("Approved filing the Business Tax Certificate", "批准提交营业税证书申请") },
    { id: "x6", when: B("Sep 28", "9 月 28 日"), actor: "agent", text: B("Got your EIN from the IRS", "从美国国税局取得了 EIN") },
  ],
  connections: [
    { id: "c-irs", name: B("IRS", "美国国税局"), level: "federal", state: "connected", detail: B("EIN on file", "EIN 已存档") },
    { id: "c-cdtfa", name: B("CDTFA online services", "加州税费管理局在线服务"), level: "state", state: "connected", detail: B("Seller's permit account", "销售许可证账户") },
    { id: "c-edd", name: B("EDD e-Services for Business", "加州就业发展局企业在线服务"), level: "state", state: "connected", detail: B("Ready for the employer registration", "可用于雇主登记") },
    { id: "c-county", name: B("Santa Clara County Environmental Health", "圣克拉拉县环境卫生局"), level: "county", state: "connected", detail: B("Plan check and health permits", "图纸审查与卫生许可") },
    { id: "c-city", name: B("City of San Jose permits", "圣何塞市许可证服务"), level: "city", state: "connected", detail: B("Business tax, building and sign permits", "营业税、建筑与招牌许可") },
    { id: "c-fire", name: B("San Jose Fire Department", "圣何塞消防局"), level: "city", state: "missing", detail: B("Connect so the agent can book the inspection", "连接后助理即可预约检查") },
    { id: "c-card", name: B("Card ending 4821", "尾号 4821 的银行卡"), level: "vault", state: "connected", detail: B("Pays filing fees after you approve. Kept in your vault; the agent can't see it.", "在您批准后支付申请费。保存在您的保险库中，助理无法查看。") },
    { id: "c-docs", name: B("Documents", "文件"), level: "vault", state: "connected", detail: B("Lease, menu, storefront photos. Missing: floor plan, equipment list", "租约、菜单、门店照片。缺少：平面图、设备清单") },
  ],
};

export const WELCOME = {
  text: [
    B("Good afternoon. I'm working on 3 things in the background for the San Jose shop, and 3 need you.", "下午好。我正在后台为圣何塞门店处理 3 件事，另有 3 件需要您处理。"),
    B("The one that matters most is the floor plan and equipment list: the county's plan check is waiting on them, and it sets your opening date.", "最重要的是平面图和设备清单：县政府的图纸审查正等着这两份文件，而它决定了您的开业日期。"),
  ],
};

export const SUGGESTIONS: Bi[] = [
  B("File everything that's ready", "把能提交的都提交"),
  B("What's blocking our opening date?", "什么在拖慢我们的开业日期？"),
  B("Add a second shop in Fremont", "在弗里蒙特开第二家店"),
];
