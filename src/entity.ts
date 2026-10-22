import { B, type Bi } from "./bi.ts";

/* Entity compliance: the annual reports and statements of information each legal entity owes in each state where it is
   registered, the CT Corporation and Harbor Compliance pattern, done by Odelia instead of handed back to the customer.

   Fail closed. A due date is given only from a rule that carries the official page's own words, its address and the day
   Placetta read it there, and only while that read is no older than MAX_RULE_AGE days (the same 90 as the plan's
   proofs, src/plan/ask.ts). A state or entity kind without such a rule gets no date: it says so and names the office.
   Every filing still goes through an owner's approval like any other: the module only puts the date on the renewal
   calendar and asks Odelia to prepare it.

   Placetta is not a registered agent. The registered agent is a partner hand-off: the founder chooses a commercial
   registered agent partner (FOUNDER STEP), and until then the app says to keep the one the entity has. */

export const MAX_RULE_AGE = 90;
export type EntityKind = "llc" | "corp";
export type Registration = { state: string; date: string; foreign?: boolean };
export type Entity = { id: string; name: string; kind: EntityKind; registrations: Registration[] };

/** How the next due date falls:
 *   fixed       every year by a month and day (only for years after the year it registered)
 *   formation   by the last day of the month it registered, every `every` years
 *   window      as formation, opening `opens` months before; plus an initial statement `initialDays` after registering */
type Cadence = { type: "fixed"; month: number; day: number } | { type: "formation"; every: number } | { type: "window"; every: number; opens: number; initialDays: number };
export type EntityRule = {
  state: string; kinds: EntityKind[]; form: Bi; agency: Bi; cadence: Cadence;
  /** the official page's own words, where Placetta read them, and the day */
  quote: string; url: string; read: string;
  fee?: Bi;
};

const READ = "2026-10-22";
/** Read on each agency's own page on READ. Re-read before MAX_RULE_AGE runs out, or the dates stop showing. */
export const ENTITY_RULES: EntityRule[] = [
  {
    state: "CA", kinds: ["llc"], form: B("Statement of Information (Form LLC-12)", "信息声明（LLC-12 表）"), agency: B("California Secretary of State", "加州州务卿"),
    cadence: { type: "window", every: 2, opens: 5, initialDays: 90 },
    quote: "Every California and registered foreign limited liability company must file a Statement of Information with the California Secretary of State, within 90 days of registering with the California Secretary of State, and every two years thereafter during a specific 6-month filing period based on the original registration date",
    url: "https://bpd.cdn.sos.ca.gov/llc/forms/llc-12.pdf", read: READ, fee: B("$20", "20 美元"),
  },
  {
    state: "DE", kinds: ["corp"], form: B("Annual Franchise Tax Report", "年度特许经营税报告"), agency: B("Delaware Division of Corporations", "特拉华州公司处"),
    cadence: { type: "fixed", month: 3, day: 1 },
    quote: "All active Domestic Corporation Annual Reports and Franchise Taxes for the prior year are due annually on or before March 1st and are required to be filed online.",
    url: "https://corp.delaware.gov/paytaxes/", read: READ,
  },
  {
    state: "DE", kinds: ["llc"], form: B("LLC annual tax (no report)", "LLC 年度税（无需年报）"), agency: B("Delaware Division of Corporations", "特拉华州公司处"),
    cadence: { type: "fixed", month: 6, day: 1 },
    quote: "There is no requirement to file an Annual Report. The annual taxes for the prior year are due on or before June 1st.",
    url: "https://corp.delaware.gov/alt-entitytaxinstructions/", read: READ, fee: B("$400", "400 美元"),
  },
  {
    state: "NY", kinds: ["llc", "corp"], form: B("Biennial Statement", "双年报"), agency: B("New York Department of State", "纽约州务院"),
    cadence: { type: "formation", every: 2 },
    quote: "The filing period for a business corporation or LLC is the calendar month in which its original … The Biennial Statement must be filed every two years.",
    url: "https://dos.ny.gov/biennial-statements-business-corporations-and-limited-liability-companies", read: READ, fee: B("$9", "9 美元"),
  },
  {
    state: "WA", kinds: ["llc", "corp"], form: B("Annual Report", "年度报告"), agency: B("Washington Secretary of State", "华盛顿州州务卿"),
    cadence: { type: "formation", every: 1 },
    quote: "This annual report is due by the last day of the month in which the business was originally formed or registered.",
    url: "https://www.sos.wa.gov/corporations-charities/business-entities/maintain-business-compliance/annual-reports", read: READ,
  },
  {
    state: "FL", kinds: ["llc", "corp"], form: B("Annual Report", "年度报告"), agency: B("Florida Division of Corporations", "佛罗里达州公司处"),
    cadence: { type: "fixed", month: 5, day: 1 },
    quote: "Any profit corporation, limited liability company, limited partnership or limited liability limited partnership annual report filing will have until 11:59 PM EST on Friday May 1, 2026, before a $400 late fee is assessed.",
    url: "https://dos.fl.gov/sunbiz/manage-business/efile/annual-report/", read: READ,
  },
  {
    state: "TX", kinds: ["llc", "corp"], form: B("Franchise Tax Report and Public Information Report", "特许经营税报告及公开信息报告"), agency: B("Texas Comptroller of Public Accounts", "德州审计长办公室"),
    cadence: { type: "fixed", month: 5, day: 15 },
    quote: "The annual franchise tax report is due May 15. If May 15 falls on a weekend or holiday, the due date will be the next business day.",
    url: "https://comptroller.texas.gov/taxes/franchise/", read: READ,
  },
];

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(Math.min(d, lastDay(y, m)))}`;
const ageDays = (from: string, to: string) => Math.floor((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 864e5);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** A rule Placetta may give a date from today: its quote, its official address and a read no older than MAX_RULE_AGE. */
export function ruleCurrent(r: EntityRule | undefined, today: string): boolean {
  if (!r || !r.quote.trim() || !r.read) return false;
  try { const u = new URL(r.url); if (u.protocol !== "https:" || !u.hostname.endsWith(".gov")) return false; } catch { return false; }
  const a = ageDays(r.read, today);
  return a >= 0 && a <= MAX_RULE_AGE;
}

export const ruleFor = (state: string, kind: EntityKind) => ENTITY_RULES.find(r => r.state === state.toUpperCase() && r.kinds.includes(kind));

/** The next due date on or after today for one registration under a rule, with the window it opens (if any). */
export function nextDue(rule: EntityRule, reg: Registration, today: string): { due: string; opens?: string; initial?: boolean } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reg.date)) return null;
  const [y, m] = reg.date.split("-").map(Number);
  const c = rule.cadence;
  if (c.type === "fixed") {
    for (let yy = Math.max(y + 1, Number(today.slice(0, 4))); yy < y + 200; yy++) { const d = iso(yy, c.month, c.day); if (d >= today) return { due: d }; }
    return null;
  }
  if (c.type === "window") {
    const first = addDays(reg.date, c.initialDays);
    if (first >= today) return { due: first, initial: true };
  }
  for (let k = 1; k < 200; k++) {
    const yy = y + k * c.every, d = iso(yy, m, 31);
    if (d < today) continue;
    if (c.type === "window") { const om = m - c.opens, oy = om <= 0 ? yy - 1 : yy; return { due: d, opens: iso(oy, ((om + 11) % 12) + 1, 1) }; }
    return { due: d };
  }
  return null;
}

export type Obligation = {
  id: string; entity: Entity; reg: Registration;
  /** null when Placetta has no current official rule for it: no date is given, and `ask` names who to ask */
  rule: EntityRule | null; due: string | null; opens?: string; initial?: boolean; ask?: Bi;
};

/** Every report each entity owes in each state it's registered in, soonest first; the ones without a verified rule last. */
export function obligations(entities: Entity[], today: string): Obligation[] {
  const out: Obligation[] = [];
  for (const e of entities) for (const reg of e.registrations) {
    const st = reg.state.toUpperCase();
    const rule = ruleFor(st, e.kind);
    const id = `ent-${e.id}-${st}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!rule || !ruleCurrent(rule, today)) {
      out.push({ id, entity: e, reg, rule: null, due: null, ask: B(`No verified due date on record for a${e.kind === "llc" ? "n LLC" : " corporation"} in ${st}. Odelia can read the ${st} Secretary of State's own page and quote it before any date goes on the calendar.`, `没有 ${st} 州${e.kind === "llc" ? " LLC" : "公司"}经核实的到期日。Odelia 可先查阅 ${st} 州务卿官方页面并引用原文，再把日期加入日历。`) });
      continue;
    }
    const n = nextDue(rule, reg, today);
    out.push({ id, entity: e, reg, rule, due: n?.due ?? null, opens: n?.opens, initial: n?.initial });
  }
  return out.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.id.localeCompare(b.id));
}

/** The calendar entries for the obligations with a verified date: one renewal each, with Odelia's prompt to prepare it
 *  for approval. Never a date without a rule. */
export function entityDeadlines(list: Obligation[]): { id: string; date: string; kind: "renewal"; title: Bi; agency: Bi; ask: Bi; prompt: Bi }[] {
  return list.filter(o => o.rule && o.due).map(o => ({
    id: `${o.id}-${o.due}`, date: o.due!, kind: "renewal" as const, agency: o.rule!.agency,
    title: B(`${o.rule!.form.en} for ${o.entity.name} (${o.reg.state.toUpperCase()})`, `${o.entity.name}（${o.reg.state.toUpperCase()}）的${o.rule!.form.zh}`),
    ask: B("Prepare it for my approval", "准备好等我批准"),
    prompt: filePrompt(o),
  }));
}

/** What Odelia is asked: prepare it from the official page quoted, and put it up for approval. Never file it unasked. */
export function filePrompt(o: Obligation): Bi {
  const r = o.rule!;
  return B(`Prepare the ${r.form.en} for ${o.entity.name} in ${o.reg.state.toUpperCase()}, due ${o.due}. Use ${r.agency.en}'s official page (${r.url}), which says: "${r.quote}" Fill it from the workspace and put it up for my approval. Don't file or pay anything until I approve.`,
    `为 ${o.entity.name} 准备 ${o.reg.state.toUpperCase()} 州的${r.form.zh}，${o.due} 到期。依据${r.agency.zh}的官方页面（${r.url}），原文为："${r.quote}" 根据工作区资料填写，并提交给我批准。在我批准前不要提交或付款。`);
}

/** The registered agent: a partner's job, never Placetta's. */
export const REGISTERED_AGENT = {
  line: B("Placetta is not a registered agent. Keep the registered agent each entity has now. A commercial registered agent partner is being chosen, and Placetta will hand the entity over to them only with your approval.",
    "快哉不是注册代理人。请保留各实体现有的注册代理人。我们正在选择商业注册代理合作伙伴，只有经您批准，快哉才会把实体转交给对方。"),
  /** FOUNDER STEP: set to the partner's name and page once one is chosen; until then no hand-off is offered. */
  partner: null as null | { name: string; url: string },
};
