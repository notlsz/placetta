/* The compliance words an owner uses for the same thing, in English and Chinese: "COI" and "certificate of insurance",
   "房东" and "landlord", "TABC" and "liquor", "卫生局" and "DOHMH". Recall (retrieve.ts) adds one concept token for each
   entry a memory or a question mentions, so a fact saved in one language or one set of words is found from the other.
   General memory products leave this to an embedding model; this is free, the same every time, and explainable (the
   reason a memory came up names the concept). Only the trade's own vocabulary and the journeys' places: no person's
   name, nothing about one workspace.

   Each entry: English words or phrases (matched on whole words, lower case) and Chinese words (matched anywhere). */

type Entry = { id: string; en: string[]; zh: string[] };

export const GLOSSARY: Entry[] = [
  { id: "landlord", en: ["landlord", "landlords", "lessor", "property manager", "property management", "realty", "building owner"], zh: ["房东", "物业", "出租方"] },
  { id: "lease", en: ["lease", "leases", "rent", "tenancy", "free rent"], zh: ["租约", "租金", "租赁", "免租"] },
  { id: "insurance", en: ["insurance", "coi", "certificate of insurance", "insurer", "policy", "additional insured"], zh: ["保险", "保单", "投保"] },
  { id: "inspection", en: ["inspection", "inspections", "inspector", "inspectors", "inspected", "visited"], zh: ["检查", "检查员", "巡查", "稽查"] },
  { id: "health_dept", en: ["health department", "dohmh", "department of health", "county health", "environmental health", "health permit", "health inspection", "health plan", "health"], zh: ["卫生局", "卫生部门", "卫生"] },
  { id: "fire", en: ["fire marshal", "fire department", "fire inspection", "fire extinguisher", "extinguisher", "fire"], zh: ["消防"] },
  { id: "occupancy", en: ["certificate of occupancy", "co", "occupancy"], zh: ["使用证", "占用证", "入住许可"] },
  { id: "entity", en: ["incorporated", "incorporate", "incorporation", "registered", "formed", "llc", "inc", "corporation", "entity", "foreign llc"], zh: ["注册", "实体", "法人"] },
  { id: "owner", en: ["owner", "owners", "boss", "founder"], zh: ["老板", "东家", "所有者"] },
  { id: "updates", en: ["updates", "update", "notify", "notifications", "notification", "message", "messages", "reach", "contact"], zh: ["通知", "消息", "联系", "更新"] },
  { id: "wechat", en: ["wechat"], zh: ["微信"] },
  { id: "email", en: ["email", "emails", "e-mail"], zh: ["邮件", "电邮"] },
  { id: "staff", en: ["new hire", "new hires", "new employee", "new employees", "employee", "employees", "staff", "worker", "workers"], zh: ["新员工", "员工", "店员", "雇员"] },
  { id: "food_handler", en: ["food handler", "food handler card", "food handlers", "food safety certificate", "food manager certificate"], zh: ["食品从业", "食品安全证", "健康证", "食品从业证"] },
  { id: "accountant", en: ["accountant", "cpa", "bookkeeper", "tax preparer"], zh: ["会计", "会计师"] },
  { id: "sales_tax", en: ["sales tax", "seller's permit", "sellers permit", "seller permit", "resale certificate", "comptroller", "sales and use tax"], zh: ["销售税", "销售许可", "销售许可证", "营业税"] },
  { id: "contractor", en: ["contractor", "general contractor", "gc", "builder", "build"], zh: ["承包商", "施工方", "装修公司"] },
  { id: "construction", en: ["renovation", "renovations", "construction", "buildout", "build-out", "remodel", "tenant improvement", "change of use"], zh: ["装修", "施工", "改造", "改建"] },
  { id: "drawings", en: ["drawings", "plans", "floor plan", "construction drawings", "blueprints", "plan check", "plan review"], zh: ["施工图", "图纸", "平面图", "审图", "图纸审查"] },
  { id: "manager", en: ["manager", "store manager", "general manager", "gm"], zh: ["店长", "经理"] },
  { id: "temperature", en: ["temperature log", "temperature logs", "temps", "temperature", "temperatures"], zh: ["温度记录", "温度"] },
  { id: "alcohol", en: ["alcohol", "liquor", "beer", "wine", "tabc", "abc", "sla", "liquor license", "alcohol commission"], zh: ["酒牌", "酒类", "卖酒", "酒精"] },
  { id: "signage", en: ["sign", "signs", "signage", "sign permit"], zh: ["招牌", "标牌", "广告牌"] },
  { id: "business_license", en: ["business license", "business licence", "business tax certificate", "business registration"], zh: ["营业执照", "营业许可"] },
  { id: "custody", en: ["holds", "hold", "keeps", "custody", "safekeeping"], zh: ["保管", "持有"] },
  { id: "fee", en: ["fee", "fees", "cost", "charge", "deposit", "bond", "free"], zh: ["费用", "收费", "押金", "保证金", "不收费"] },
  { id: "language", en: ["language", "languages", "translated", "translation", "chinese", "mandarin", "english", "version"], zh: ["语言", "翻译", "中文", "中文版", "英文", "英文版", "英语"] },
  { id: "documents", en: ["documents", "document", "files", "papers", "applications", "application", "forms"], zh: ["文件", "资料", "申请", "表格", "材料"] },
  { id: "approval", en: ["approve", "approval", "approved", "sign off", "sign-off", "sign-offs"], zh: ["批准", "审批", "签字", "同意"] },
  { id: "hours", en: ["hours", "opening hours", "open", "closes", "10am", "10pm"], zh: ["营业时间", "开门", "关门"] },
  { id: "delivery", en: ["delivery", "deliveries", "deliver", "trucks", "truck", "loading"], zh: ["送货", "卸货", "配送"] },
  { id: "grease", en: ["grease trap", "grease interceptor", "grease"], zh: ["隔油池", "油脂"] },
  { id: "hood", en: ["hood", "exhaust hood", "kitchen hood", "hood cleaning"], zh: ["油烟罩", "排烟罩", "抽油烟"] },
  { id: "pest", en: ["pest", "pest control", "exterminator", "pest log"], zh: ["虫害", "灭虫", "除虫"] },
  { id: "music", en: ["bmi", "ascap", "music license", "music"], zh: ["音乐版权", "音乐"] },
  { id: "outdoor", en: ["patio", "outdoor dining", "sidewalk cafe", "outdoor seating", "seats", "seating"], zh: ["外摆", "户外座位", "露台"] },
  { id: "importer", en: ["importer of record", "importer", "customs", "distributor"], zh: ["进口商", "报关", "经销商"] },
  { id: "grade", en: ["grade", "letter grade", "rating"], zh: ["评级", "等级", "评分"] },
  { id: "warehouse", en: ["warehouse", "storage", "stock"], zh: ["仓库", "库存"] },
  { id: "backflow", en: ["backflow", "backflow test"], zh: ["回流", "防回流"] },
  { id: "mall", en: ["mall", "shopping center", "shopping centre"], zh: ["商场", "购物中心"] },
  { id: "permit", en: ["permit", "permits", "license", "licenses", "licence"], zh: ["许可证", "执照", "证照", "许可"] },
  { id: "supplier", en: ["supplier", "suppliers", "vendor", "vendors"], zh: ["供应商"] },
  { id: "renewal", en: ["renew", "renews", "renewal", "renewals", "expire", "expires", "expiry", "expiration"], zh: ["续期", "续签", "到期", "续约"] },
  { id: "decision", en: ["decided", "decide", "decision", "agreed", "chose"], zh: ["决定", "同意"] },
  { id: "franchise", en: ["franchise", "franchisee", "franchisees", "franchisor"], zh: ["加盟", "加盟商", "特许"] },
  // places: the cities, states and countries an owner names either way
  { id: "pl_california", en: ["california", "ca"], zh: ["加州", "加利福尼亚"] },
  { id: "pl_texas", en: ["texas", "tx"], zh: ["德州", "得州", "德克萨斯"] },
  { id: "pl_newyork", en: ["new york", "ny", "nyc"], zh: ["纽约"] },
  { id: "pl_flushing", en: ["flushing"], zh: ["法拉盛"] },
  { id: "pl_houston", en: ["houston"], zh: ["休斯顿", "休斯敦"] },
  { id: "pl_sanjose", en: ["san jose"], zh: ["圣何塞", "圣荷西"] },
  { id: "pl_irvine", en: ["irvine"], zh: ["尔湾"] },
  { id: "pl_austin", en: ["austin"], zh: ["奥斯汀"] },
  { id: "pl_la", en: ["los angeles", "la"], zh: ["洛杉矶"] },
  { id: "pl_sf", en: ["san francisco", "sf"], zh: ["旧金山", "三藩市"] },
  { id: "pl_mexico", en: ["mexico", "mexico city", "cdmx"], zh: ["墨西哥"] },
  { id: "pl_eu", en: ["eu", "europe", "european", "germany", "netherlands"], zh: ["欧盟", "欧洲", "德国", "荷兰"] },
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const EN = GLOSSARY.map(e => ({ id: e.id, re: new RegExp(`(?:^|[^a-z0-9'])(?:${e.en.map(esc).join("|")})(?=$|[^a-z0-9'])`, "i") }));

/** The concepts a text mentions, as tokens ("~landlord"), each once. The text is already lower case and plain. */
export function concepts(text: string): string[] {
  // "the landlord's agent" is about the landlord
  const t = String(text ?? "").toLowerCase().replace(/['’]s\b/g, "");
  const out: string[] = [];
  GLOSSARY.forEach((e, i) => { if (EN[i].re.test(t) || e.zh.some(z => t.includes(z))) out.push(`~${e.id}`); });
  return out;
}

/** A concept token in words, for "why this came up": its first English word, or its first Chinese one. */
export function conceptWord(token: string, lang: "en" | "zh" = "en"): string {
  const e = GLOSSARY.find(x => `~${x.id}` === token);
  return e ? (lang === "zh" ? e.zh[0] : e.en[0]) : token.replace(/^~/, "");
}
