import { B, type Bi } from "./bi";
import type { Application, MemoryBook, Workspace } from "./model";
import { agencyEmail } from "./security/registry";

/* ------------------------------------------------------------------ *
 * Odelia goes first. Each morning the monitor asks this module what the
 * next unblocked step is for every store, the way Instinct texts first
 * and a Town "Townie" works between conversations, but for permits:
 *   chase      a document someone else holds (the landlord's lease, the
 *              contractor's stamped plans, the insurer's certificate),
 *              asked of the right person, followed up every three
 *              business days, at most MAX_ASKS times
 *   renewal    a license renewing 61 to 90 days out: she gets ahead of
 *              it (re-reads the agency's page, prepares, chases), files
 *              nothing; the monitor's renewal job takes over at 60
 * and what only a person can do, which is all the owner hears about:
 *   a signature, a payment, an approval, a fact only they know (their
 *   ID, who their landlord is), a person who stopped answering, and a
 *   portal that wants a code or a CAPTCHA typed by a human.
 * Stalled filings with an agency and inspections are already chased by
 * the daily status check and the inspection tasks (monitor), so they
 * aren't repeated here.
 * Pure: the monitor (supabase/functions/monitor/initiative.ts) does the
 * sending and starting; scripts/initiative-test.ts tests every edge.
 * ------------------------------------------------------------------ */

/** Who holds a missing document. "odelia": a status the agency or Odelia produces, nobody to ask. */
export type Holder = "landlord" | "builder" | "insurer" | "staff" | "owner" | "odelia";
export type Contact = { name: string; role?: string; email?: string; phone?: string };
/** What was asked so far, per chase key (application:item): how many asks, the last one's day, and of whom. */
export type ChaseLog = Record<string, { n: number; last: string; to?: string; replied?: boolean }>;

export type Chase = { kind: "chase"; key: string; app: string; appName: Bi; item: string; label: Bi; holder: Holder; to: Contact; ask: number; since?: string; critical: boolean; title: Bi };
export type RenewalPrep = { kind: "renewal"; key: string; deadline: string; app?: string; name: Bi; date: string; days: number; title: Bi };
export type Move = Chase | RenewalPrep;
export type NeedWhy = "signature" | "payment" | "approval" | "document" | "contact" | "no_answer" | "code";
export type Need = { key: string; why: NeedWhy; title: Bi; app?: string };
export type Morning = { moves: Move[]; needs: Need[] };

/** Asks before the owner hears that someone isn't answering. */
export const MAX_ASKS = 3;
/** Business days between asks. */
export const FOLLOW_UP_DAYS = 3;
/** How far ahead a renewal is prepared; the monitor's renewal job starts the filing at 60 (RENEW_AHEAD). */
export const PREP_FROM = 90, PREP_TO = 61;

/* ------------------------------------------------------------------ who holds what */

const STATE_WORDS = /\b(approved|approval|issued|filed|registered|formed|opened|in hand|notified|verified|cleared|clearance|on file|number)\b|已批准|已签发|已登记|已注册|已成立|已通知/i;
const OWNER_ONLY = /\b(passport|driver'?s licen[cs]e|photo id|government id|identification|ssn|social security|itin|bank|signature|fingerprints?|personal (history|questionnaire)|background check)\b|护照|身份证|驾照|社会安全|签名|签字|银行|指纹/i;
const LANDLORD = /\b(lease|landlord|property owner|owner'?s (consent|authori[sz]ation|permission)|letter of (authori[sz]ation|consent)|rental agreement|sublease)\b|租约|租赁合同|房东|业主(同意|授权)/i;
const BUILDER = /\b(plans?|drawings?|floor ?plan|site plan|stamped|architect|engineer|contractor|equipment (list|schedule)|finish schedule|elevations?|plumbing|mechanical|hood|grease (trap|interceptor))\b|图纸|平面图|建筑师|工程师|承包商|施工/i;
const INSURER = /\b(insurance|certificate of insurance|coi|workers'? comp(ensation)?|liability|bond)\b|保险|保单/i;
const STAFF = /\b(food (handler|manager|protection|safety)|allergen|sanitation certificate|servsafe|exam|training|certified)\b|食品(处理|安全|经理)|培训|考试/i;

/** Who holds a checklist item, read from its label (English or Chinese). Statuses (approved, issued, registered) are
 *  the agency's or Odelia's; an ID, a signature or a bank detail is the owner's alone. */
export function holderOf(label: Bi): Holder {
  const t = `${label.en} ${label.zh}`;
  if (OWNER_ONLY.test(t)) return "owner";
  if (STATE_WORDS.test(t)) return "odelia";
  if (LANDLORD.test(t)) return "landlord";
  if (INSURER.test(t)) return "insurer";
  if (BUILDER.test(t)) return "builder";
  if (STAFF.test(t)) return "staff";
  return "owner";
}

const ROLE: Record<Exclude<Holder, "owner" | "odelia">, RegExp> = {
  landlord: /landlord|property (manager|owner|management)|leasing|房东|物业|业主/i,
  builder: /contractor|architect|engineer|designer|builder|\bgc\b|expediter|承包商|建筑师|工程师|设计师|施工/i,
  insurer: /insur|broker|保险/i,
  staff: /staff|manager|employee|chef|cook|店长|经理|员工|厨师/i,
};
export const HOLDER_WORD: Record<Holder, Bi> = {
  landlord: B("your landlord", "您的房东"), builder: B("your contractor or architect", "您的承包商或建筑师"), insurer: B("your insurance agent", "您的保险经纪人"),
  staff: B("the staff member who holds it", "持证员工"), owner: B("you", "您"), odelia: B("Odelia", "Odelia"),
};

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
/** An address at a government agency, or at a host an application cites as its agency's own page: never chased, and
 *  never written to without the owner's approval. */
export function agencyAddress(email: string, w?: Pick<Workspace, "apps">): boolean {
  const host = email.toLowerCase().split("@")[1] ?? "";
  if (!host) return false;
  if (agencyEmail(email) || /(^|\.)(gov|mil)(\.[a-z]{2})?$/.test(host) || /(^|\.)(gob|gouv|govt|gv|go|gc)\.[a-z]{2}$/.test(host) || /(^|\.)[a-z]{2}\.us$/.test(host)) return true;
  const cited = new Set((w?.apps ?? []).map(a => { try { return new URL(a.source.url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } }).filter(Boolean));
  return [...cited].some(h => host === h || host.endsWith("." + h));
}

/** The people the owners told Odelia about and confirmed in the app (memory "person" items, saved, never one that
 *  came from outside and still waits for confirmation). Nobody from a document or a page is ever a contact. */
export function contactsOf(books: (MemoryBook | undefined)[]): Contact[] {
  const out: Contact[] = [];
  for (const b of books) for (const x of b?.items ?? []) {
    if (x.kind !== "person" || x.status !== "saved" || x.via || !x.person?.name) continue;
    const email = (x.person.email ?? "").trim().toLowerCase();
    out.push({ name: x.person.name.slice(0, 80), ...(x.person.role ? { role: x.person.role.slice(0, 60) } : {}), ...(EMAIL.test(email) ? { email } : {}), ...(x.person.phone ? { phone: x.person.phone } : {}) });
  }
  // one per address (the newest wins: later books and items come later)
  const seen = new Map<string, Contact>();
  for (const c of out) seen.set(c.email ?? `name:${c.name.toLowerCase()}`, c);
  return [...seen.values()];
}
/** Every saved contact in a workspace's memory, across its people. */
export const workspaceContacts = (w: Pick<Workspace, "memories">) => contactsOf(Object.values(w.memories ?? {}));

/** The person to ask for what a holder holds: a saved contact whose role matches, with an email that isn't an agency's. */
export function contactFor(holder: Holder, contacts: Contact[], w?: Pick<Workspace, "apps">): Contact | undefined {
  if (holder === "owner" || holder === "odelia") return undefined;
  return [...contacts].reverse().find(c => !!c.role && ROLE[holder].test(c.role) && !!c.email && !agencyAddress(c.email, w));
}

/* ------------------------------------------------------------------ days */

const dayNum = (iso: string) => Math.floor(Date.parse(iso.slice(0, 10) + "T00:00:00Z") / 864e5);
/** Weekdays after `from` up to and including `to`. */
export function businessDays(from: string, to: string): number {
  let n = 0;
  for (let d = dayNum(from) + 1; d <= dayNum(to); d++) { const wd = new Date(d * 864e5).getUTCDay(); if (wd !== 0 && wd !== 6) n++; }
  return n;
}
export const weekday = (day: string) => { const wd = new Date(dayNum(day) * 864e5).getUTCDay(); return wd !== 0 && wd !== 6; };

/* ------------------------------------------------------------------ the morning */

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const open = (a: Application) => !["approved", "review", "filing"].includes(a.status) && !a.preview && !a.abstain && !a.yours;

/** The morning's work for one workspace: what Odelia starts on her own, and what only a person can do. */
export function morning(w: Workspace, today: string, o: { contacts: Contact[]; chased?: ChaseLog; filings?: { app_id: string; status: string; agent_state?: string | null }[]; maxChases?: number; maxPreps?: number }): Morning {
  const moves: Move[] = [], needs: Need[] = [], chased = o.chased ?? {};
  const declined = new Set((w.declined ?? []).map(d => d.official).filter(Boolean));
  const covered = new Set(w.approvals.map(a => a.app).filter(Boolean));
  const apps = w.apps.filter(a => open(a) && !(a.official && declined.has(a.official))).sort((x, y) => Number(!!y.critical) - Number(!!x.critical));
  const ask = new Set<string>();
  for (const a of apps) {
    for (const c of a.checklist) {
      if (c.state !== "missing" || c.dep) continue;
      const key = `${a.id}:${c.id}`, holder = holderOf(c.label);
      if (holder === "odelia") continue;
      const label = c.label;
      if (holder === "owner") {
        if (!covered.has(a.id)) needs.push({ key: "doc:" + key, why: "document", app: a.id, title: B(`Upload the ${lowerFirst(label.en)} for the ${lowerFirst(a.name.en)}`, `上传${a.name.zh}所需的${label.zh}`) });
        continue;
      }
      const to = contactFor(holder, o.contacts, w);
      if (!to) {
        const who = HOLDER_WORD[holder];
        if (!ask.has(holder)) needs.push({ key: "contact:" + holder, why: "contact", app: a.id, title: B(`Tell Odelia how to reach ${who.en}: she'll ask them for the ${lowerFirst(label.en)}`, `告诉 Odelia 如何联系${who.zh}：她会向对方索取${label.zh}`) });
        ask.add(holder);
        continue;
      }
      const log = chased[key];
      if (log?.replied) continue;                                   // they answered; the run that woke on it carries on
      if (log && log.n >= MAX_ASKS) {
        needs.push({ key: "quiet:" + key, why: "no_answer", app: a.id, title: B(`${to.name} hasn't answered ${log.n} asks for the ${lowerFirst(label.en)} since ${log.last}: call them, or tell Odelia who else to ask`, `${to.name} 自 ${log.last} 起已 ${log.n} 次未回复关于${label.zh}的请求：请致电对方，或告诉 Odelia 该问谁`) });
        continue;
      }
      if (log && businessDays(log.last, today) < FOLLOW_UP_DAYS) continue;   // asked recently: give them time
      const n = (log?.n ?? 0) + 1;
      moves.push({ kind: "chase", key, app: a.id, appName: a.name, item: c.id, label, holder, to, ask: n, ...(log ? { since: log.last } : {}), critical: !!a.critical,
        title: n === 1 ? B(`Asked ${to.name} for the ${lowerFirst(label.en)}`, `已向 ${to.name} 索取${label.zh}`) : B(`Followed up with ${to.name} on the ${lowerFirst(label.en)} (ask ${n} of ${MAX_ASKS})`, `已就${label.zh}再次联系 ${to.name}（第 ${n}/${MAX_ASKS} 次）`) });
    }
  }
  // renewals 61 to 90 days out: prepared ahead, filed by the renewal job from 60
  const t0 = dayNum(today);
  for (const d of w.deadlines) {
    if (d.kind !== "renewal") continue;
    const days = dayNum(d.date) - t0;
    if (days > PREP_FROM || days < PREP_TO) continue;
    const app = d.app ? w.apps.find(x => x.id === d.app) : undefined;
    const name = app?.name ?? d.title;
    moves.push({ kind: "renewal", key: `prep:${d.id}:${d.date}`, deadline: d.id, ...(app ? { app: app.id } : {}), name, date: d.date, days, title: B(`Getting ahead of the ${lowerFirst(name.en)} renewal (${d.date}, ${days} days)`, `提前准备${name.zh}续期（${d.date}，还有 ${days} 天）`) });
  }
  // what only a person can do: approvals, by what they are
  for (const a of w.approvals) {
    const why: NeedWhy = a.kind === "pay" ? "payment" : a.kind === "file" ? "signature" : a.kind === "upload" ? "document" : "approval";
    if (a.auto) continue;   // going out under the owner's own rule or Hands-off, after the undo window
    needs.push({ key: "a:" + a.id, why, ...(a.app ? { app: a.app } : {}), title: a.title });
  }
  // a portal that wants a code or a CAPTCHA typed by a person (the filer never solves one)
  for (const f of o.filings ?? []) if (f.agent_state === "needs_you" && !["canceled", "approved", "rejected"].includes(f.status)) {
    const a = w.apps.find(x => x.id === f.app_id);
    needs.push({ key: "code:" + f.app_id, why: "code", app: f.app_id, title: B(`The agency's site wants a code or a check only a person can do, for the ${lowerFirst(a?.name.en ?? "filing")}. Open it in Placetta`, `机构网站需要只有本人才能完成的验证码或核验（${a?.name.zh ?? "申请"}）。请在快哉中打开`) });
  }
  const byNeed = (x: Move) => (x.kind === "chase" ? (x.critical ? 0 : 1) : 2);
  moves.sort((x, y) => byNeed(x) - byNeed(y));
  const chases = moves.filter(m => m.kind === "chase").slice(0, o.maxChases ?? 5), preps = moves.filter(m => m.kind === "renewal").slice(0, o.maxPreps ?? 2);
  return { moves: [...chases, ...preps], needs: dedupe(needs) };
}
const dedupe = (xs: Need[]) => { const s = new Set<string>(); return xs.filter(x => (s.has(x.key) ? false : (s.add(x.key), true))); };

/** The morning's one Update: only what needs a person, then what Odelia started. Null on a quiet day. */
export function morningUpdate(m: Morning, started: Move[] = m.moves): { title: Bi; body: Bi } | null {
  const n = m.needs.length, k = started.length;
  if (!n && !k) return null;
  const list = (xs: Bi[], lang: "en" | "zh") => xs.slice(0, 5).map(x => `- ${x[lang]}`).join("\n") + (xs.length > 5 ? (lang === "zh" ? `\n- 另有 ${xs.length - 5} 项` : `\n- and ${xs.length - 5} more`) : "");
  const title = n
    ? B(`${n} thing${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} you today${k ? `. Odelia started ${k} on her own` : ""}`, `今天有 ${n} 项需要您${k ? `。Odelia 已主动开始 ${k} 项` : ""}`)
    : B(`Nothing needs you today. Odelia started ${k} thing${k === 1 ? "" : "s"} on her own`, `今天没有需要您处理的事。Odelia 已主动开始 ${k} 项`);
  const en = [n ? `Only you can do these:\n${list(m.needs.map(x => x.title), "en")}` : "", k ? `Odelia is on these, and tells you if anything changes:\n${list(started.map(x => x.title), "en")}` : "", "Nothing is filed, paid, signed or sent to an agency until you approve."].filter(Boolean).join("\n\n");
  const zh = [n ? `只有您能做：\n${list(m.needs.map(x => x.title), "zh")}` : "", k ? `Odelia 正在处理，有变化会告诉您：\n${list(started.map(x => x.title), "zh")}` : "", "您批准之前，不会提交、付款、签署或向机构发送任何内容。"].filter(Boolean).join("\n\n");
  return { title, body: B(en, zh) };
}

/* ------------------------------------------------------------------ the chase email */

/** A label or name as it may appear in an email to someone outside: no links, addresses, numbers or markup that a
 *  forged label could plant (a phishing link riding in Odelia's own email), one line, short. */
export function plain(s: string, max = 120): string {
  return String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\b(?:https?:\/\/|www\.)\S+/gi, "").replace(/\S+@\S+/g, "")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "").replace(/[<>[\]{}`|\\]/g, "").replace(/\b[a-z0-9-]+\.(com|net|org|io|xyz|info|top|ru|cn|co|app|link)\b\S*/gi, "").replace(/\s{2,}/g, " ").trim().slice(0, max);
}
/** The reference in the subject line that ties a reply back to its ask: the same as supabase/functions/_shared/chase.ts,
 *  which odelia-mail reads it back with (that module is the server's; scripts/initiative-test.ts checks they agree). */
export const chaseRef = (token: string) => `[P-${token}]`;
export const REF_RE = /\[P-([A-HJ-NP-Z2-9]{8})\]/;
export function newToken(rand: () => number = Math.random): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => abc[Math.floor(rand() * abc.length) % abc.length]).join("");
}

/** The email Odelia sends from her own address when Hands-off is on. It says up front that she's an AI assistant
 *  working for the business, asks for one thing, and never carries a link, a fee, a signature request or anything
 *  the agency needs from the owner. */
export function chaseMail(c: Chase, business: string, token: string, lang: "en" | "zh" = "en"): { subject: string; text: string } {
  const biz = plain(business, 80) || "the business", who = plain(c.to.name, 60) || "there";
  const item = plain(lang === "zh" ? c.label.zh : c.label.en, 100), app = plain(lang === "zh" ? c.appName.zh : c.appName.en, 100);
  if (lang === "zh") {
    return {
      subject: `${c.ask > 1 ? "跟进：" : ""}${biz}需要${item} ${chaseRef(token)}`,
      text: [`${who}，您好：`,
        `我是 Odelia，${biz}使用的 AI 助理（不是真人），负责办理许可证。${biz}正在申请${app}，需要${item}。`,
        c.ask > 1 ? `这是对 ${c.since} 那封邮件的跟进。` : "",
        "方便的话，请直接回复本邮件并附上文件（PDF 或照片）。如果这份文件不归您提供，也请回复告诉我，我就不再打扰。",
        `谢谢！\nOdelia（AI 助理），代表${biz}`].filter(Boolean).join("\n\n"),
    };
  }
  return {
    subject: `${c.ask > 1 ? "Following up: " : ""}${item} for ${biz} ${chaseRef(token)}`,
    text: [`Hello ${who},`,
      `I'm Odelia, the AI assistant ${biz} uses for its permits (I'm not a person). ${biz} is applying for the ${lowerFirst(app)}, and it needs the ${lowerFirst(item)}.`,
      c.ask > 1 ? `I'm following up on my note of ${c.since}.` : "",
      "Could you reply to this email with the file attached (a PDF or a photo is fine)? If it isn't yours to send, just reply and say so and I'll stop asking.",
      `Thank you,\nOdelia (an AI assistant) for ${biz}`].filter(Boolean).join("\n\n"),
  };
}
