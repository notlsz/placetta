import { B, type Bi } from "./bi.ts";

/* Odelia's spending: what she may ask to buy for an organization, from whom, how much, and from which budget. The same
   rules run in the app (to show what would happen) and on the server (supabase/functions/spend), which is the one that
   decides. A purchase outside the boundaries is refused and recorded; one inside them waits for an owner to approve it
   (two owners above the two-person amount). Nothing is ever paid without that approval, and the payment itself is
   made on the payee's own page. */

export type SpendCategory = "gov_fees" | "filing_services" | "mail" | "training" | "background" | "inspections" | "supplies" | "signage";

export const SPEND_CATEGORIES: { id: SpendCategory; label: Bi; hint: Bi; gov: boolean }[] = [
  { id: "gov_fees", label: B("Government fees and permits", "政府规费与许可证"), hint: B("Filing, license, permit and plan-check fees an agency charges.", "机构收取的申报、执照、许可与图纸审核费用。"), gov: true },
  { id: "inspections", label: B("Inspection fees", "检查费用"), hint: B("Health, fire and building inspection or re-inspection fees.", "卫生、消防、建筑检查或复检费用。"), gov: true },
  { id: "filing_services", label: B("Registered agent and filing services", "注册代理与申报服务"), hint: B("A registered agent, certified copies, apostilles.", "注册代理、核证副本、海牙认证。"), gov: false },
  { id: "mail", label: B("Certified mail and courier", "挂号信与快递"), hint: B("Certified mail with tracking, overnight courier to an agency.", "带追踪的挂号信、寄往机构的隔夜快递。"), gov: false },
  { id: "training", label: B("Food safety certificates and courses", "食品安全证书与课程"), hint: B("Food manager and food handler courses and exams.", "食品经理与食品从业人员课程及考试。"), gov: false },
  { id: "background", label: B("Fingerprints and background checks", "指纹与背景调查"), hint: B("Live Scan and the background checks a license asks for.", "执照所需的 Live Scan 指纹与背景调查。"), gov: false },
  { id: "signage", label: B("Required signs and postings", "法定标识与公示"), hint: B("Posters, placards and signs a rule requires on site.", "法规要求在店内张贴的海报、标牌与标识。"), gov: false },
  { id: "supplies", label: B("Compliance supplies", "合规用品"), hint: B("Thermometers, test strips, first-aid and fire extinguisher service.", "温度计、试纸、急救用品与灭火器维护。"), gov: false },
];

export type Budget = {
  id: string;
  label?: Bi;
  store?: string;                 // a store's own budget; absent: the whole organization
  category?: SpendCategory;       // one kind of purchase; absent: everything
  period: "month" | "opening" | "total";   // opening: from today until the store opens
  amount: number;                 // USD
  by?: "you" | "agent";           // agent: Odelia suggested it and someone accepted
};

export type SpendPolicy = {
  on: boolean;                    // Odelia may buy at all
  allowed: SpendCategory[];       // what she may buy
  perPurchase: number;            // never more than this in one purchase
  secondOver?: number;            // above this, a second person approves too
  payees: "government" | "listed" | "any";   // government: only agencies; listed: agencies plus the payees below
  listed: string[];               // payees allowed by name or web address
  blocked: string[];              // never these
  budgets: Budget[];
};

export const DEFAULT_POLICY: SpendPolicy = {
  on: false, allowed: ["gov_fees", "inspections"], perPurchase: 1000, secondOver: 2500,
  payees: "government", listed: [], blocked: [], budgets: [],
};

export type PurchaseStatus = "asked" | "approved" | "paid" | "declined" | "blocked" | "failed" | "canceled";
export type Purchase = {
  id: string;
  at: string;
  category: SpendCategory;
  payee: string;                  // who gets paid, as the agency or seller names itself
  payeeUrl?: string;              // where it's paid (the agency's own payment page)
  amount: number;                 // USD
  store?: string;
  app?: string;
  why: Bi;                        // what it's for, in one line
  status: PurchaseStatus;
  by: "agent" | "you";
  approvals?: { who: string; at: string }[];
  method?: "link";                // paid by a person in the workspace on the payee's own page
  receipt?: string;               // the stored receipt's path
  reasons?: Bi[];                 // why it was blocked or needs approval
};

/** Whether a payee is a government agency: a .gov (or .mil) address, or a payee the forms library lists as an agency. */
export function isGovernment(payee: string, url?: string): boolean {
  const host = (() => { try { return url ? new URL(url).hostname.toLowerCase() : ""; } catch { return ""; } })();
  if (/(^|\.)[a-z0-9-]+\.(gov|mil)$/.test(host) || /\.gov\.[a-z]{2}$/.test(host)) return true;
  return /\b(department|dept\.?|county|city of|state of|secretary of state|franchise tax board|internal revenue|irs|board of equalization|cdtfa|public health|fire (department|marshal)|building (and|&) safety|planning|comptroller|treasurer|tax collector)\b/i.test(payee);
}

const norm = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const listedHit = (list: string[], payee: string, url?: string) => {
  const p = payee.toLowerCase(), h = url ? norm(url) : "";
  return list.some(x => { const n = norm(x); return !!n && (p.includes(n) || (!!h && (h === n || h.endsWith("." + n)))); });
};

const monthKey = (iso: string) => iso.slice(0, 7);

/** What a budget has already spent: purchases approved or paid, in its scope and period. */
export function spentIn(b: Budget, purchases: Purchase[], now = new Date().toISOString()): number {
  return purchases.filter(p => (p.status === "paid" || p.status === "approved")
    && (!b.store || p.store === b.store) && (!b.category || p.category === b.category)
    && (b.period !== "month" || monthKey(p.at) === monthKey(now)))
    .reduce((s, p) => s + p.amount, 0);
}

export type Decision = {
  verdict: "ask" | "blocked";
  reasons: Bi[];                  // blocked: why not; ask: anything the approver should know
  approvers: number;              // how many owners must approve
  budgets: { budget: Budget; left: number }[];   // every budget this purchase counts against, with what's left after it
};

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** The rules, in order: on, allowed kind, allowed payee, amount cap, every budget it falls under. Inside all of them it
 *  waits for an owner's approval (two owners above the two-person amount); outside any of them it is refused. */
export function decide(p: Pick<Purchase, "category" | "payee" | "payeeUrl" | "amount" | "store">, policy: SpendPolicy, purchases: Purchase[], now = new Date().toISOString()): Decision {
  const no: Bi[] = [], ask: Bi[] = [];
  if (!policy.on) no.push(B("Purchases by Odelia are turned off in Spending settings.", "已在支出设置中关闭 Odelia 代为购买。"));
  if (!(p.amount > 0) || !isFinite(p.amount)) no.push(B("The amount is missing.", "缺少金额。"));
  const cat = SPEND_CATEGORIES.find(c => c.id === p.category);
  if (!cat) no.push(B("Unknown kind of purchase.", "未知的购买类别。"));
  else if (!policy.allowed.includes(p.category)) no.push(B(`${cat.label.en} isn't on the list of what Odelia may buy.`, `“${cat.label.zh}”不在 Odelia 可购买的范围内。`));
  const gov = isGovernment(p.payee, p.payeeUrl);
  if (listedHit(policy.blocked, p.payee, p.payeeUrl)) no.push(B(`${p.payee} is on the blocked list.`, `${p.payee} 在禁止名单中。`));
  else if (policy.payees === "government" && !gov) no.push(B(`${p.payee} isn't a government agency, and Odelia may only pay agencies.`, `${p.payee} 不是政府机构，而 Odelia 只能向政府机构付款。`));
  else if (policy.payees === "listed" && !gov && !listedHit(policy.listed, p.payee, p.payeeUrl)) no.push(B(`${p.payee} isn't an agency or on your list of payees.`, `${p.payee} 既不是政府机构，也不在您的收款方名单中。`));
  if (p.amount > policy.perPurchase) no.push(B(`${money(p.amount)} is over the ${money(policy.perPurchase)} limit for one purchase.`, `${money(p.amount)} 超过单笔上限 ${money(policy.perPurchase)}。`));
  const hits = policy.budgets.filter(b => (!b.store || b.store === p.store) && (!b.category || b.category === p.category));
  const budgets = hits.map(b => ({ budget: b, left: b.amount - spentIn(b, purchases, now) - p.amount }));
  for (const { budget, left } of budgets) if (left < 0) {
    const name = budget.label ?? B("a budget", "某项预算");
    no.push(B(`Over ${name.en}: ${money(budget.amount - spentIn(budget, purchases, now))} left of ${money(budget.amount)}.`, `超出“${name.zh}”：${money(budget.amount)} 中仅剩 ${money(budget.amount - spentIn(budget, purchases, now))}。`));
  }
  if (no.length) return { verdict: "blocked", reasons: no, approvers: 0, budgets };
  if (!hits.length) ask.push(B("No budget covers it yet.", "尚无覆盖它的预算。"));
  for (const { budget, left } of budgets) ask.push(B(`${budget.label?.en ?? "Budget"}: ${money(Math.max(0, left))} left after this.`, `${budget.label?.zh ?? "预算"}：此笔之后剩余 ${money(Math.max(0, left))}。`));
  const second = policy.secondOver != null && p.amount > policy.secondOver;
  if (second) ask.push(B(`Over ${money(policy.secondOver!)}, so two owners approve it.`, `超过 ${money(policy.secondOver!)}，需两位所有者批准。`));
  return { verdict: "ask", reasons: ask, approvers: second ? 2 : 1, budgets };
}

/** Checks a policy someone is saving: numbers sane, budgets positive. Returns what's wrong, empty when fine. */
export function policyProblems(p: SpendPolicy): Bi[] {
  const out: Bi[] = [];
  if (!(p.perPurchase > 0)) out.push(B("Set a limit for one purchase.", "请设置单笔上限。"));
  if (p.secondOver != null && p.secondOver < 0) out.push(B("The two-person amount can't be negative.", "双人审批金额不能为负。"));
  for (const b of p.budgets) if (!(b.amount > 0)) out.push(B("Every budget needs an amount above $0.", "每项预算金额都须大于 $0。"));
  if (p.allowed.some(c => !SPEND_CATEGORIES.some(x => x.id === c))) out.push(B("Unknown kind of purchase in the allowed list.", "可购买范围中有未知类别。"));
  return out;
}

/** Odelia's suggested budgets: for each store, the agency fees its applications list (fees the agency sets by size are
 *  counted at their floor), plus 15% for re-inspections and changes, rounded up to $50. Nothing is guessed: a store with
 *  no listed fees gets no budget. */
export function suggestBudgets(stores: { id: string; name: Bi; apps: { fees: { amount: number; tbd?: boolean }[] }[] }[]): Budget[] {
  return stores.flatMap(s => {
    const fees = s.apps.flatMap(a => a.fees).reduce((t, f) => t + (f.amount || 0), 0);
    if (!fees) return [];
    const amount = Math.ceil((fees * 1.15) / 50) * 50;
    return [{ id: `b-${s.id}`, store: s.id, period: "opening" as const, amount, by: "agent" as const, label: B(`${s.name.en} opening`, `${s.name.zh}开业`) }];
  });
}
