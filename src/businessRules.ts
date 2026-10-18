/* Business rules: when-then rules an owner sets without code, the way Claude Code runs hooks around its tools.
   "When a filing is put up for approval, tell Kevin by email." "When a fee over $500 is requested, a second owner
   approves it too." "When an inspection is booked, add 'Clean the hood filters' to its checklist."

   They're evaluated where the event happens, on the server: when Odelia puts an approval up or books an inspection
   (src/autonomy.ts, inside the agent's tool loop), when a job she worked is done (src/serverRun.ts), every morning for
   deadlines (supabase/functions/monitor), and at filing time for the two-owner rule (the database's filings trigger).
   A rule can only tell someone, ask for a second owner's approval, or add a checklist item. It can never file, pay or
   send a filing: any other action in a saved rule is dropped.

   Shared by the app, the agent (browser and server) and the monitor (Deno), so it imports nothing. */

export type Bi = { en: string; zh: string };
const B = (en: string, zh: string): Bi => ({ en, zh });

export type BrEventKind = "filing_approval" | "deadline_soon" | "fee_over" | "job_done" | "inspection_booked";
export type BrAction = "notify" | "second_owner" | "checklist";
export type BrVia = "email" | "text" | "slack" | "lark" | "wechat";
export type BusinessRule = {
  id: string;
  when: { event: BrEventKind; days?: number; amount?: number };
  then: { action: BrAction; via?: BrVia; to?: string; item?: string };
  on?: boolean;          // off when false
  at: string;            // when it was added
  by?: string;           // who added it (an email in an account)
};
/** Something that happened, as a rule sees it. key: what makes it this event and not another, so a rule fires once. */
export type BrEvent = { kind: BrEventKind; key: string; title: Bi; app?: string; approval?: string; fee?: number; days?: number };
/** A message a rule asks the server to deliver through the business's own channels. */
export type Notice = { rule: string; key: string; via: BrVia; to?: string; text: Bi };

export const BR_EVENTS: { id: BrEventKind; label: Bi; needs?: "days" | "amount"; app: boolean }[] = [
  { id: "filing_approval", label: B("A filing is put up for approval", "有申请等待批准"), app: true },
  { id: "deadline_soon", label: B("A deadline is under N days away", "截止日期不到 N 天"), needs: "days", app: true },
  { id: "fee_over", label: B("A fee over $N is requested", "申请支付超过 $N 的费用"), needs: "amount", app: true },
  { id: "job_done", label: B("A job is done", "一项工作完成"), app: false },
  { id: "inspection_booked", label: B("An inspection is booked", "预约了检查"), app: true },
];
export const BR_ACTIONS: { id: BrAction; label: Bi }[] = [
  { id: "notify", label: B("Tell someone", "通知某人") },
  { id: "second_owner", label: B("A second owner approves it too", "需要第二位所有者批准") },
  { id: "checklist", label: B("Add a checklist item", "添加清单项") },
];
/** to: what "who" means for the channel: any email address, a teammate (by the email they sign in with), or the
 *  business's own group, which needs no name. */
export const BR_VIAS: { id: BrVia; label: Bi; to: "email" | "member" | "group" }[] = [
  { id: "email", label: B("Email", "邮件"), to: "email" },
  { id: "text", label: B("Text message", "短信"), to: "member" },
  { id: "slack", label: B("Slack", "Slack"), to: "group" },
  { id: "lark", label: B("Lark", "飞书"), to: "group" },
  { id: "wechat", label: B("WeChat", "微信"), to: "member" },
];
/** Which actions make sense for an event: a second owner only where something waits for approval, a checklist item
 *  only where there's an application to put it on. */
export function actionsFor(kind: BrEventKind): BrAction[] {
  return kind === "filing_approval" || kind === "fee_over" ? ["notify", "second_owner", "checklist"]
    : kind === "job_done" ? ["notify"] : ["notify", "checklist"];
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : NaN);

/** A saved rule, checked: unknown events and any action but the three are dropped (a rule that says "file" or "pay"
 *  is never run), numbers are kept in range, a message needs somewhere to go. null when it can't run. */
export function validRule(raw: unknown): BusinessRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>, when = (r.when ?? {}) as Record<string, unknown>, then = (r.then ?? {}) as Record<string, unknown>;
  const event = BR_EVENTS.find(e => e.id === when.event);
  const action = BR_ACTIONS.find(a => a.id === then.action)?.id;
  if (!event || !action || typeof r.id !== "string" || !r.id) return null;
  if (!actionsFor(event.id).includes(action)) return null;
  const out: BusinessRule = { id: r.id.slice(0, 60), when: { event: event.id }, then: { action }, on: r.on !== false, at: typeof r.at === "string" ? r.at : "", ...(typeof r.by === "string" ? { by: r.by.slice(0, 120) } : {}) };
  if (event.needs === "days") { const d = Math.round(num(when.days)); if (!(d >= 1 && d <= 365)) return null; out.when.days = d; }
  if (event.needs === "amount") { const a = num(when.amount); if (!(a >= 0 && a <= 1_000_000)) return null; out.when.amount = Math.round(a * 100) / 100; }
  if (action === "notify") {
    const via = BR_VIAS.find(v => v.id === then.via);
    if (!via) return null;
    const to = typeof then.to === "string" ? then.to.trim().slice(0, 160) : "";
    if (via.to !== "group" && !isEmail(to)) return null;
    out.then = { action, via: via.id, ...(via.to !== "group" ? { to } : {}) };
  }
  if (action === "checklist") {
    const item = typeof then.item === "string" ? then.item.trim().slice(0, 120) : "";
    if (!item) return null;
    out.then = { action, item };
  }
  return out;
}

/** The rules that run: each one checked, the ones turned off left out. */
export const liveRules = (rules: unknown): BusinessRule[] => (Array.isArray(rules) ? rules : []).map(validRule).filter((r): r is BusinessRule => !!r && r.on !== false);

/** Whether this rule fires for this event. */
export function matches(rule: BusinessRule, ev: BrEvent): boolean {
  if (rule.when.event !== ev.kind) return false;
  if (ev.kind === "fee_over") return typeof ev.fee === "number" && ev.fee > (rule.when.amount ?? 0);
  if (ev.kind === "deadline_soon") return typeof ev.days === "number" && ev.days >= 0 && ev.days < (rule.when.days ?? 0);
  return true;
}

const money = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
/** "When a fee over $500 is requested, a second owner approves it too", in both languages. */
export function ruleLabel(r: BusinessRule): Bi {
  const ev = BR_EVENTS.find(e => e.id === r.when.event)!;
  const when = B(ev.label.en.replace("N days", `${r.when.days ?? "N"} days`).replace("$N", money(r.when.amount ?? 0)).replace(/^A /, "a ").replace(/^An /, "an "),
    ev.label.zh.replace("N 天", `${r.when.days ?? "N"} 天`).replace("$N", money(r.when.amount ?? 0)));
  const via = BR_VIAS.find(v => v.id === r.then.via);
  const then = r.then.action === "notify"
    ? via?.to === "group" ? B(`post it in your ${via.label.en} group`, `发到您的${via.label.zh}群`) : B(`tell ${r.then.to} by ${via?.label.en.toLowerCase() ?? "email"}`, `通过${via?.label.zh ?? "邮件"}通知 ${r.then.to}`)
    : r.then.action === "second_owner" ? B("a second owner approves it too", "需要第二位所有者也批准")
    : B(`add "${r.then.item}" to its checklist`, `在其清单中添加“${r.then.item}”`);
  return B(`When ${when.en}, ${then.en}`, `当${when.zh}时，${then.zh}`);
}

/** What a rule's message says: the business, what happened, and nothing a filing holds (no form lines, no numbers). */
export function noticeText(ev: BrEvent, business: Bi): Bi {
  const what = ev.kind === "filing_approval" ? B(`A filing is waiting for approval: ${ev.title.en}.`, `有申请等待批准：${ev.title.zh}。`)
    : ev.kind === "fee_over" ? B(`A fee of ${money(ev.fee ?? 0)} was requested: ${ev.title.en}.`, `申请支付 ${money(ev.fee ?? 0)}：${ev.title.zh}。`)
    : ev.kind === "deadline_soon" ? B(`${ev.title.en} is due in ${ev.days} day${ev.days === 1 ? "" : "s"}.`, `${ev.title.zh}将在 ${ev.days} 天后到期。`)
    : ev.kind === "inspection_booked" ? B(`An inspection is booked: ${ev.title.en}.`, `已预约检查：${ev.title.zh}。`)
    : B(`Odelia finished a job: ${ev.title.en}.`, `Odelia 完成了一项工作：${ev.title.zh}。`);
  return B(`${business.en}: ${what.en} (Placetta business rule)`, `${business.zh}：${what.zh}（快哉业务规则）`);
}

/* ------------------------------------------------------------------ firing */

type AppLike = { id: string; checklist: { id: string; label: Bi; state: string; note?: Bi }[] };
type ApprovalLike = { id: string; does: Bi[]; second?: { by: string[]; rule: string } };
type AuditLike = { id: string; at: string; actor: string; action: Bi; object: Bi; detail?: Bi };
/** The parts of a workspace a rule reads and changes. */
export type RuleShape = {
  business: Bi;
  apps: AppLike[];
  approvals: ApprovalLike[];
  audit: AuditLike[];
  controls?: { business?: unknown; fired?: { key: string; at: string }[] };
};

let seq = 0;
const firedKey = (rule: BusinessRule, ev: BrEvent) => `${rule.id}|${ev.key}`;
/** The rules this event fires that haven't fired for it before. */
export function due(w: RuleShape, ev: BrEvent): BusinessRule[] {
  const seen = new Set((w.controls?.fired ?? []).map(f => f.key));
  return liveRules(w.controls?.business).filter(r => matches(r, ev) && !seen.has(firedKey(r, ev)));
}

/**
 * Fire the rules for one event: what to deliver (notices), and a patch that marks them fired and makes their changes
 * (an approval that now needs two owners, a checklist item). The patch checks again, so applying it twice, or after
 * another run fired the same rule, changes nothing more: a rule fires once per event.
 */
export function fire<W extends RuleShape>(w: W, ev: BrEvent, now = new Date().toISOString()): { rules: BusinessRule[]; notices: Notice[]; patch: (w: W) => W } {
  const rules = due(w, ev);
  const notices: Notice[] = rules.filter(r => r.then.action === "notify" && r.then.via)
    .map(r => ({ rule: r.id, key: ev.key, via: r.then.via!, ...(r.then.to ? { to: r.then.to } : {}), text: noticeText(ev, w.business) }));
  const patch = (cur: W): W => {
    const todo = due(cur, ev).filter(r => rules.some(x => x.id === r.id));
    if (!todo.length) return cur;
    let apps = cur.apps, approvals = cur.approvals;
    const lines: AuditLike[] = [];
    for (const r of todo) {
      if (r.then.action === "second_owner" && ev.approval && approvals.some(a => a.id === ev.approval)) {
        approvals = approvals.map(a => (a.id !== ev.approval || a.second ? a : { ...a, second: { by: [], rule: r.id },
          does: [...a.does, B("A second owner approves it too, under your business rule", "按您的业务规则，还需第二位所有者批准")] }));
      }
      if (r.then.action === "checklist" && ev.app && r.then.item) {
        const id = "br-" + r.id;
        apps = apps.map(a => (a.id !== ev.app || a.checklist.some(c => c.id === id) ? a : { ...a, checklist: [...a.checklist, { id, label: { en: r.then.item!, zh: r.then.item! }, state: "missing", note: B("Added by your business rule", "由您的业务规则添加") }] }));
      }
      const label = ruleLabel(r);
      lines.push({ id: `x-br-${Date.now().toString(36)}-${seq++}`, at: now, actor: "agent", action: B("Business rule", "业务规则"), object: ev.title, detail: label });
    }
    const fired = [...todo.map(r => ({ key: firedKey(r, ev), at: now })), ...(cur.controls?.fired ?? [])].slice(0, 300);
    return { ...cur, apps, approvals, audit: [...lines.reverse(), ...cur.audit], controls: { ...(cur.controls ?? {}), fired } };
  };
  return { rules, notices, patch };
}

/* ------------------------------------------------------------------ the morning check */

type DeadlineLike = { id: string; date: string; title: Bi; app?: string };
const dayMs = 864e5;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / dayMs);
/** Deadlines a "deadline under N days" rule covers today, as events: the monitor fires them each morning. Overdue
 *  deadlines aren't "under N days away"; the monitor's own overdue notices cover those. */
export function deadlineEvents(state: { deadlines?: unknown; controls?: { business?: unknown } } | null, today: string): BrEvent[] {
  const rules = liveRules(state?.controls?.business).filter(r => r.when.event === "deadline_soon");
  if (!rules.length) return [];
  const max = Math.max(...rules.map(r => r.when.days ?? 0));
  const list = (Array.isArray(state?.deadlines) ? state!.deadlines : []) as DeadlineLike[];
  return list.filter(d => d && typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.title)
    .map(d => ({ d, n: daysBetween(today, d.date) })).filter(x => x.n >= 0 && x.n < max)
    .map(({ d, n }) => ({ kind: "deadline_soon" as const, key: `deadline:${d.id}:${d.date}`, title: d.title, ...(d.app ? { app: d.app } : {}), days: n }));
}

/** An inspection, by its title: what a deadline or a calendar event Odelia adds has to say to count as one booked. */
export const isInspection = (title: string) => /\binspect(ion|ions|ed)?\b|\bwalk-?through\b|检查|检验|验收|巡检/i.test(title);
