import { B, type Bi } from "./bi.ts";

/* Plan review corrections: the agency's comments, one by one, to a resubmittal.

   Copied from permit expediters, the one incumbent customers praise for this: "When reviewers send back correction
   comments, we coordinate with your architect or engineer to address them and resubmit", handled "within 24-48 hours"
   (Permit Place, permitplace.com/permit-expediting-services). The deliverable is the response letter every plan reviewer
   expects: each comment, the response, and the sheet it was revised on.

   Their gap, filled: an expediter costs $7,500 to $12,500 for a restaurant (same page), the owner sees a status in a
   portal but not which comment waits on whom, and the comments arrive in English. Here each comment becomes a line with
   who fixes it (the architect or engineer, the owner, or Odelia), its response and whether it's done; a target date two
   business days out (the expediter's 24 to 48 hours, the owner's to change); the letter written from the lines; and
   Odelia explains every comment in Chinese and drafts the responses on request.

   Pure: parsing, routing, the clock and the letter are tested in scripts/incumbents-test.ts. */

export type CorrectionWho = "designer" | "owner" | "odelia";
export type CorrectionItem = { id: string; n: number; text: string; sheet?: string; who: CorrectionWho; response: string; done: boolean };
/** One round of comments on one application: when it came, the target to send it back, and each comment. */
export type CorrectionRound = {
  id: string;
  app: string;
  round: number;
  received: string;
  target: string;
  reference?: string;
  items: CorrectionItem[];
  /** the day it went back to the agency */
  sent?: string;
};

export const WHO: Record<CorrectionWho, Bi> = {
  designer: B("Architect or engineer", "建筑师或工程师"),
  owner: B("You", "您"),
  odelia: B("Odelia", "Odelia"),
};

/** Business days the response goes back in: the expediter's 24 to 48 hours. The owner can move it. */
export const TARGET_DAYS = 2;
const MAX_ITEMS = 60, MAX_TEXT = 1200;

const pad = (n: number) => String(n).padStart(2, "0");
const ms = (d: string) => Date.parse(d + "T00:00:00Z");
const fmt = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

/** `n` business days after `from` (Saturday and Sunday skipped; agency holidays aren't known here). */
export function addBusinessDays(from: string, n: number): string {
  let t = ms(from), left = Math.max(0, Math.floor(n));
  while (left > 0) { t += 864e5; const w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) left--; }
  return fmt(t);
}
/** Business days from `from` to `to` (negative when `to` has passed). */
export function businessDaysBetween(from: string, to: string): number {
  const a = ms(from), b = ms(to), sign = b >= a ? 1 : -1;
  let n = 0;
  for (let t = a; sign > 0 ? t < b : t > b; t += sign * 864e5) { const w = new Date(t + sign * 864e5).getUTCDay(); if (w !== 0 && w !== 6) n += sign; }
  return n;
}

/* A comment's number at the start of a line: "1.", "1)", "#1", "Item 1:", "Comment 1 -", "No. 1", "1、", "第1条", "一、". */
const CN = "一二三四五六七八九十";
const LEAD = new RegExp(String.raw`^\s*(?:(?:item|comment|correction|no\.?)\s*#?\s*|#\s*)(\d{1,3})\s*[.):、:\-]?\s+|^\s*(\d{1,3})\s*(?:\.(?!\d)|[)、:]|\s-\s)\s*|^\s*第\s*(\d{1,3})\s*[条项]\s*[、.:：]?\s*|^\s*([${CN}]{1,3})\s*[、.]\s*`, "i");
const cnNum = (s: string) => s.length === 1 ? CN.indexOf(s) + 1 : s.startsWith("十") ? 10 + (CN.indexOf(s[1]) + 1) : (CN.indexOf(s[0]) + 1) * 10 + (s[2] ? CN.indexOf(s[2]) + 1 : 0);

/** A drawing sheet the comment names: "Sheet A-2.1", "A2.1", "M-1", "see P3", "图纸 A2". Discipline letters only. */
export function sheetOf(text: string): string | undefined {
  const m = /\b(?:sheets?\s+|see\s+|on\s+|图纸\s*)?((?:A|S|M|P|E|FP|FS|K|FD|C|L|T|G)-?\d{1,2}(?:\.\d{1,2})?[a-z]?)\b/.exec(text);
  if (!m) return undefined;
  const id = m[1].toUpperCase();
  // a fee or a code section is not a sheet ("P1" alone after "Title 24, Part" is rare; keep it simple)
  return /^(C|T)\d{3,}$/.test(id) ? undefined : id;
}

/** Who fixes a comment, by what it asks for. The owner can change it. */
export function whoFor(text: string): CorrectionWho {
  const s = text.toLowerCase();
  if (/\bfees?\b|\bpay(ment)?\b|balance due|plan review balance|application form|applicant (name|information)|signature|sign the|owner'?s? (name|information)|business name|\bform\b|填写|申请表|签名|费用/.test(s)) return "odelia";
  if (/spec(ification)? sheets?|cut sheets?|\bmenu\b|nsf|equipment (list|schedule)|manufacturer|certificate|lease|letter from|hours of operation|number of (seats|employees|staff)|菜单|设备清单|规格|租约/.test(s)) return "owner";
  if (/\bsheet|plan|drawing|detail|section|elevation|dimension|show|indicate|provide (a|the)? ?(note|detail|layout)|layout|floor|wall|ceiling|sink|drain|grease|interceptor|plumbing|mechanical|electrical|hood|exhaust|finish|cove|lighting|ventilation|egress|exit|ada|accessib|structural|title 24|图纸|平面|水槽|隔油|排风|装修/.test(s)) return "designer";
  return "owner";
}

/** The reviewer's comments as separate lines: numbered items when they're numbered, else one per paragraph or line. */
export function parseComments(raw: string): { n: number; text: string; sheet?: string }[] {
  const text = String(raw ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  if (!text) return [];
  const lines = text.split("\n");
  const numbered = lines.filter(l => LEAD.test(l)).length >= 2;
  const parts: { n?: number; text: string }[] = [];
  if (numbered) {
    for (const l of lines) {
      const m = LEAD.exec(l);
      if (m) parts.push({ n: m[1] || m[2] || m[3] ? Number(m[1] ?? m[2] ?? m[3]) : cnNum(m[4]), text: l.slice(m[0].length) });
      else if (parts.length && l.trim()) parts[parts.length - 1].text += " " + l.trim();
      // text before the first number (a heading such as "Plan check comments, round 1") is not a comment
    }
  } else {
    const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    for (const p of paras.length > 1 ? paras : lines.map(l => l.trim()).filter(Boolean)) parts.push({ text: p.replace(/\n/g, " ") });
  }
  const seen = new Set<number>();
  return parts.map(p => ({ ...p, text: p.text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) })).filter(p => p.text.length >= 3).slice(0, MAX_ITEMS).map((p, i) => {
    let n = p.n && !seen.has(p.n) ? p.n : i + 1;
    while (seen.has(n)) n++;
    seen.add(n);
    return { n, text: p.text, sheet: sheetOf(p.text) };
  });
}

let k = 0;
const rid = (p: string) => `${p}-${Date.now().toString(36)}-${(k++).toString(36)}`;

/** A new round from the reviewer's comments, numbered after any earlier round on the same application. */
export function newRound(app: string, raw: string, today: string, earlier: CorrectionRound[] = [], reference?: string): CorrectionRound | null {
  const items = parseComments(raw);
  if (!items.length) return null;
  const round = earlier.filter(r => r.app === app).reduce((m, r) => Math.max(m, r.round), 0) + 1;
  return {
    id: rid("cr"), app, round, received: today, target: addBusinessDays(today, TARGET_DAYS), reference: reference?.trim().slice(0, 60) || undefined,
    items: items.map(x => ({ id: rid("ci"), n: x.n, text: x.text, sheet: x.sheet, who: whoFor(x.text), response: "", done: false })),
  };
}

export const progress = (r: CorrectionRound) => ({ done: r.items.filter(i => i.done).length, of: r.items.length });
/** Responses written in Chinese: the letter goes to the agency in English, so these need Odelia's English first. */
export const notEnglish = (r: CorrectionRound) => r.items.filter(i => /[㐀-鿿]/.test(i.response));
/** What's left, by who has it. */
export function waitingOn(r: CorrectionRound): Record<CorrectionWho, number> {
  const out: Record<CorrectionWho, number> = { designer: 0, owner: 0, odelia: 0 };
  for (const i of r.items) if (!i.done) out[i.who]++;
  return out;
}

/** The response letter, in the form plan reviewers expect: each comment as written, the response, and the revised sheet.
 *  In English, because it goes to the agency. Lines without a response say so rather than leave a gap unnoticed. */
export function responseLetter(r: CorrectionRound, o: { business: string; address?: string; application: string; agency: string; today: string }): string {
  const head = [
    "RESPONSE TO PLAN REVIEW COMMENTS",
    "",
    `To: ${o.agency}`,
    `Project: ${o.business}${o.address ? `, ${o.address}` : ""}`,
    `Application: ${o.application}`,
    ...(r.reference ? [`Plan check or permit number: ${r.reference}`] : []),
    `Comments received: ${r.received}. Response round ${r.round}.`,
    `Date: ${o.today}`,
    "",
    "Each comment is repeated as issued, followed by our response and, where drawings changed, the sheet revised.",
    "",
  ];
  const body = [...r.items].sort((a, b) => a.n - b.n).flatMap(i => [
    `Comment ${i.n}: ${i.text}`,
    `Response: ${i.response.trim() || "[Response to be written]"}`,
    ...(i.sheet ? [`Revised on sheet: ${i.sheet}`] : []),
    "",
  ]);
  return [...head, ...body, "Revised sheets are marked with this round's revision number.", "", `Submitted for ${o.business}`].join("\n");
}

/** What Odelia is asked when the owner wants every comment explained in Chinese and a response drafted for each. */
export function explainPrompt(r: CorrectionRound, application: string, agency: string, lang: "en" | "zh"): string {
  const list = [...r.items].sort((a, b) => a.n - b.n).map(i => `${i.n}. ${i.text}`).join("\n");
  return lang === "zh"
    ? `${agency}对「${application}」发来第 ${r.round} 轮审图意见。请逐条用中文解释每条意见要求做什么、由谁来改（建筑师或工程师、我、还是你），并为每条起草一段英文回复，写不出的事实用 [方括号] 标出，不要编造：\n${list}`
    : `${agency} sent round ${r.round} of plan review comments on the ${application}. For each comment, say in plain words what it asks for and who should fix it (the architect or engineer, me, or you), and draft a response in English. Put any fact you don't have in [brackets]; never invent one:\n${list}`;
}

/** What Odelia is asked when the drawing comments go to the architect or engineer: a message for the owner to approve. */
export function designerPrompt(r: CorrectionRound, application: string, agency: string, lang: "en" | "zh"): string | null {
  const mine = r.items.filter(i => i.who === "designer" && !i.done);
  if (!mine.length) return null;
  const list = mine.map(i => `${i.n}. ${i.text}${i.sheet ? ` (sheet ${i.sheet})` : ""}`).join("\n");
  return lang === "zh"
    ? `请起草一封英文邮件给我的建筑师或工程师，转达${agency}对「${application}」第 ${r.round} 轮审图意见中需要改图的 ${mine.length} 条，请对方在 ${r.target} 前回复修改后的图纸和每条的说明。发送前给我批准：\n${list}`
    : `Draft an email to my architect or engineer with the ${mine.length} drawing comment${mine.length === 1 ? "" : "s"} from ${agency}'s round ${r.round} review of the ${application}, asking for the revised sheets and a one-line response to each by ${r.target}. Show it to me to approve before it goes:\n${list}`;
}
