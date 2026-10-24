import { B, type Bi } from "./bi.ts";
import type { Application, Level, Status, Store, Workspace } from "./model.ts";
import { formById, METHOD } from "./forms/registry.ts";
import { renewalCycle, nextRenewal } from "./renewal.ts";
import { runway, type RunwayItem } from "./runway.ts";

/* The license report: one location's licenses and permits as the document incumbents sell, built from the workspace in
   the moment it's asked for.

   Copied, in substance, from what customers pay for today:
   - BizFilings' business license package ($149 for one city, $66 each added location, 5 to 7 business days, by email):
     "an overview of relevant state and local licenses, permits, and tax registrations", "contact information for each
     licensing authority", the applications, and "filing instructions".
   - MyCorporation's package ($149 plus state fees): "a complete list of associated fees and where you need to send them".
   - CT Corporation's CLiC: "View all licenses, including renewal and issue dates, jurisdiction fees and application
     status", and "Run Excel reports" (the spreadsheet export here).
   - Avalara License Guidance: "one clear, actionable report"; and its platform's "Share license status updates with
     external stakeholders" (the report is what an owner sends a landlord, a franchisor or a lender).
   - Harbor Compliance: copies of filings and approved licenses for each license (the proof on file).

   Their gaps, filled: theirs is a kit the owner fills in and files, days later, in English, priced per location, with
   no source for each requirement and (MyCorporation's) no renewal information. This one is ready when asked, in
   English, Chinese or both side by side, included in the store plan, every row with the agency's own page, its words
   and the day Placetta read them, how often it renews and the next date, what's still needed, and where it stands now.

   Fail closed, as the plan does: a row without a current quote from an official page says it isn't confirmed and names
   the agency to ask; a fee the agency sets is "set by the agency", never estimated. */

export type ReportLang = "en" | "zh" | "both";
const LEVELS: Level[] = ["federal", "state", "county", "city"];
export const LEVEL_WORDS: Record<Level, Bi> = { federal: B("Federal", "联邦"), state: B("State", "州"), county: B("County", "县"), city: B("City", "市") };

export const STATE_WORDS: Record<Status | "held", Bi> = {
  approved: B("Approved", "已批准"), held: B("On file", "已持有"), review: B("With the agency", "机构审核中"), filing: B("Being filed", "正在提交"),
  ready: B("Ready for your approval", "待您批准"), needs: B("Needs something from you", "需要您提供资料"), draft: B("Being prepared", "正在准备"),
  waiting: B("Waits on another permit", "等待其他许可"), todo: B("Not started", "未开始"),
};

export type ReportRow = {
  id: string;
  level: Level;
  name: Bi;
  plain?: Bi;
  agency: Bi;
  form?: Bi;
  status: Status | "held";
  fee: Bi;
  feeKnown: number;
  feeOpen: boolean;
  currency: string;
  /** how and where it's filed: the agency's channel and its address */
  how?: Bi;
  fileAt?: string;
  /** who files it */
  who: Bi;
  takes?: Bi;
  renews?: Bi;
  nextRenewal?: string;
  expires?: string;
  missing: Bi[];
  source?: { label: string; url: string; quote?: string; checked?: string };
  /** quoted: the official page's own words and the day read are on the row. linked: the agency's page, not quoted.
   *  open: no official page, or Odelia doesn't claim it (abstain): the row names who to ask. */
  proof: "quoted" | "linked" | "open";
  confirmed: boolean;
  approved?: { on?: string; confirmation?: string; doc?: string };
  critical?: boolean;
  /** not tied to one store: the company's own (an EIN, a state registration) */
  shared?: boolean;
  /** what's different for an owner based in China */
  foreign?: Bi;
};

export type Report = {
  business: Bi;
  scope: Bi;
  address?: string;
  asOf: string;
  rows: ReportRow[];
  counts: { total: number; approved: number; moving: number; toDo: number };
  fees: { known: number; currency: string; open: number; mixed: boolean };
  renewals: RunwayItem[];
  unconfirmed: number;
  /** where the store's opening stands, when it has a date */
  opening?: { planned?: string; projected?: string };
};

const money = (n: number, c = "USD") => {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
  catch { return `${c} ${n}`; }
};

function feeOf(a: Application): { fee: Bi; known: number; open: boolean } {
  const known = a.fees.reduce((s, f) => s + (Number.isFinite(f.amount) ? f.amount : 0), 0), open = a.fees.some(f => f.tbd);
  const c = a.currency ?? "USD";
  if (known && open) return { fee: B(`${money(known, c)} plus what the agency sets`, `${money(known, c)}，另加机构核定的部分`), known, open };
  if (known) return { fee: B(money(known, c), money(known, c)), known, open };
  if (open) return { fee: B("Set by the agency", "由机构核定"), known, open };
  return { fee: B("No agency fee", "无机构费用"), known, open };
}

/** A row is confirmed when an official page's own words and the day they were read are on it, and Odelia claims it. */
const proofOf = (a: Application): ReportRow["proof"] => a.abstain || !a.source?.url ? "open" : a.source.quote && a.source.checked ? "quoted" : "linked";

function whoFiles(a: Application, how?: string): Bi {
  if (a.status === "approved") return B("Done", "已完成");
  if (a.specialist) return B(`Only ${a.specialist.en} may file it. Placetta prepares it and hands it over.`, `只能由${a.specialist.zh}提交。快哉准备好后转交。`);
  if (how === "insurer") return B("Your insurer issues it. Placetta asks for it.", "由保险公司出具，快哉代为索取。");
  if (how === "none") return B("Nothing to file", "无需申报");
  return B("Placetta fills and files it after your approval. You pay the agency directly.", "快哉填写并在您批准后提交，机构费用由您直接支付。");
}

function rowOf(a: Application, ws: Pick<Workspace, "deadlines" | "docs">, shared: boolean): ReportRow {
  const off = a.official ? formById(a.official) : undefined;
  const f = feeOf(a);
  const renewDl = ws.deadlines.filter(d => d.kind === "renewal" && d.app === a.id).sort((x, y) => x.date.localeCompare(y.date))[0];
  // the next renewal: the reminder on Deadlines, else counted from the approval day by the agency's own cycle
  let next = renewDl?.date;
  const decided = a.filed?.decided?.slice(0, 10);
  if (!next && a.status === "approved" && decided && a.renews) { const c = renewalCycle(a.renews.en); if (c) next = nextRenewal(decided, c); }
  const receipt = a.receipt ?? a.filed?.receipt;
  const doc = receipt ? ws.docs.find(d => d.id === receipt) : undefined;
  return {
    id: a.id, level: a.level, name: a.name, plain: a.plain, agency: a.agency, form: a.form ?? (off ? B(off.form, off.form) : undefined),
    status: a.status, fee: f.fee, feeKnown: f.known, feeOpen: f.open, currency: a.currency ?? "USD",
    how: off ? B(`${METHOD[off.method].en}. ${off.how.en}`, `${METHOD[off.method].zh}。${off.how.zh}`) : undefined,
    fileAt: off?.url, who: whoFiles(a, off?.method), takes: a.est, renews: a.renews ?? off?.renews, nextRenewal: next,
    missing: a.status === "approved" ? [] : [...a.checklist.filter(c => c.state === "missing").map(c => c.label), ...a.fields.filter(x => !x.value).map(x => x.label)],
    source: a.source?.url ? a.source : undefined, proof: proofOf(a), confirmed: proofOf(a) === "quoted",
    approved: a.status === "approved" ? { on: decided, confirmation: a.filed?.confirmation, doc: doc?.name } : undefined,
    critical: a.critical, shared, foreign: off?.foreign,
  };
}

/** A store's permits on file (an open store that came to Placetta with them): name and expiry, nothing invented. */
function heldRows(s: Store, taken: Set<string>, today: string): ReportRow[] {
  return (s.permits ?? []).filter(p => !taken.has(p.name.en.toLowerCase())).map((p, i) => ({
    // the level isn't on record for a permit the store came with: the report lists these on their own
    id: `held-${s.id}-${i}`, level: "city" as Level, name: p.name, agency: B(`On file for ${s.name.en}`, `${s.name.zh}已持有`), status: "held" as const,
    fee: B("", ""), feeKnown: 0, feeOpen: false, currency: "USD", who: B("Done", "已完成"), missing: [], proof: "open" as const, confirmed: false,
    // a permit dated ten years or more out is a "does not expire" placeholder
    expires: /^\d{4}-\d{2}-\d{2}$/.test(p.expires) && Date.parse(p.expires) - Date.parse(today) < 3650 * 864e5 ? p.expires : undefined,
  }));
}

/** The report for one store (its applications and the company's shared ones), or for the whole business. */
export function buildReport(ws: Workspace, today: string, o: { store?: string } = {}): Report {
  const stores = ws.stores ?? [];
  const store = o.store ? stores.find(s => s.id === o.store) : undefined;
  const owned = new Set(stores.flatMap(s => s.apps ?? []));
  const apps = store ? ws.apps.filter(a => store.apps?.includes(a.id) || !owned.has(a.id)) : ws.apps;
  const rows = apps.map(a => rowOf(a, ws, !!store && !store.apps?.includes(a.id)));
  const taken = new Set(rows.map(r => r.name.en.toLowerCase()));
  for (const s of store ? [store] : stores) rows.push(...heldRows(s, taken, today));
  rows.sort((x, y) => Number(x.status === "held") - Number(y.status === "held") || LEVELS.indexOf(x.level) - LEVELS.indexOf(y.level) || Number(!!y.critical) - Number(!!x.critical) || x.name.en.localeCompare(y.name.en));
  const approved = rows.filter(r => r.status === "approved" || r.status === "held").length;
  const moving = rows.filter(r => r.status === "review" || r.status === "filing" || r.status === "ready").length;
  const currencies = new Set(rows.filter(r => r.feeKnown).map(r => r.currency));
  const currency = currencies.size === 1 ? [...currencies][0] : "USD";
  const unpaid = rows.filter(r => r.status !== "approved" && r.status !== "held");
  return {
    business: ws.business,
    scope: store ? store.name : stores.length > 1 ? B(`All ${stores.length} locations`, `全部 ${stores.length} 家门店`) : B("The whole business", "整个企业"),
    address: store?.address,
    asOf: today,
    rows,
    counts: { total: rows.length, approved, moving, toDo: rows.length - approved - moving },
    fees: { known: unpaid.filter(r => r.currency === currency).reduce((s, r) => s + r.feeKnown, 0), currency, open: unpaid.filter(r => r.feeOpen).length, mixed: currencies.size > 1 },
    renewals: runway(ws, today, { store: store?.id }),
    unconfirmed: rows.filter(r => r.proof === "open" && r.status !== "held" && r.status !== "approved").length,
    opening: store && store.stage === "opening" ? { planned: store.plannedOpen, projected: store.projectedOpen } : undefined,
  };
}

/** Words in the report's language: one, or English with Chinese after it. */
export const say = (x: Bi | undefined, lang: ReportLang, sep = " / ") => !x ? "" : lang === "both" ? (x.en === x.zh || !x.zh ? x.en : `${x.en}${sep}${x.zh}`) : x[lang] || x.en;

const q = (s: string) => /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

/** Every row as a spreadsheet (CT Corporation's "Excel reports"), with a byte-order mark so Excel reads Chinese. */
export function reportCsv(r: Report, lang: ReportLang): string {
  const h = (en: string, zh: string) => say(B(en, zh), lang);
  const head = [h("Level", "层级"), h("License or permit", "执照或许可"), h("Agency", "机构"), h("Form", "表格"), h("Status", "状态"), h("Agency fee", "机构费用"),
    h("How it's filed", "办理方式"), h("Where it's filed", "办理地址"), h("Usually takes", "通常需要"), h("Renews", "续期"), h("Next renewal", "下次续期"),
    h("Expires", "到期"), h("Approved on", "批准日期"), h("Confirmation", "确认号"), h("Still needed", "仍需提供"), h("Official page", "官方页面"),
    h("The agency's words", "机构原文"), h("Read on", "核对日期"), h("Confirmed on an official page", "已在官方页面核实")];
  const lines = r.rows.map(x => [x.status === "held" ? h("On file", "已持有") : say(LEVEL_WORDS[x.level], lang), say(x.name, lang), say(x.agency, lang), say(x.form, lang), say(STATE_WORDS[x.status], lang), say(x.fee, lang),
    say(x.how, lang), x.fileAt ?? "", say(x.takes, lang), say(x.renews, lang), x.nextRenewal ?? "", x.expires ?? "", x.approved?.on ?? "", x.approved?.confirmation ?? "",
    x.missing.map(m => say(m, lang)).join("; "), x.source?.url ?? "", x.source?.quote ?? "", x.source?.checked ?? "", x.proof === "quoted" ? h("Yes, quoted", "是，有原文") : x.proof === "linked" ? h("Linked, not quoted", "有链接，无原文") : h("No", "否")]);
  return "﻿" + [head, ...lines].map(l => l.map(q).join(",")).join("\r\n");
}

/** The file name: the business, the scope and the day. */
export function reportName(r: Report, ext: "csv" | "pdf"): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return [slug(r.business.en) || "business", slug(r.scope.en), "licenses", r.asOf].filter(Boolean).join("-") + "." + ext;
}
