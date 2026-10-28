import { B, type Bi } from "./bi";
import type { Application } from "./model";

/* ------------------------------------------------------------------ *
 * When Odelia isn't sure, a person is. Town pairs its AI with named CPAs
 * who answer within a day; general agents guess instead (Dots "pushed
 * forward on tasks without permission", Instinct's founder built a
 * hallucination layer after an incident). Odelia asks a Placetta
 * specialist (ask_specialist) and the job waits on them, with the time
 * they answer by shown in the thread. The specialist's answer wakes the
 * job (the monitor) and Odelia carries on from it.
 * Pure: the tool (src/live.ts), the monitor and the tests share it.
 * ------------------------------------------------------------------ */

export type UnsureWhy = "no_source" | "sources_disagree" | "judgment" | "deadline" | "agency_unclear";
export const UNSURE: Record<UnsureWhy, Bi> = {
  no_source: B("No current official page says it", "没有现行官方页面说明"),
  sources_disagree: B("Two official sources disagree", "两个官方来源说法不一"),
  judgment: B("The agency's call needs judgment", "机构的要求需要专业判断"),
  deadline: B("The deadline's rule isn't confirmed", "期限规则未经确认"),
  agency_unclear: B("The agency's request is unclear", "机构的要求不明确"),
};
export const UNSURE_IDS = Object.keys(UNSURE) as UnsureWhy[];

/** What only judgment settles: discretionary decisions an agency makes case by case. */
export const JUDGMENT = /\b(variance|conditional use|special use|hearing|change of use|zoning (determination|interpretation|review)|waiver|exception|grandfather\w*|nonconforming|discretionary|board of (appeals|adjustment)|community board)\b|变更用途|听证|豁免|分区审查/i;

/** The reasons, in the workspace itself, that a step on this application is for a specialist rather than for a guess.
 *  Empty when nothing says so. */
export function unsureAbout(app: Pick<Application, "abstain" | "notes" | "filed" | "source">, agencySaid = ""): UnsureWhy[] {
  const out: UnsureWhy[] = [];
  if (app.abstain) out.push("no_source");
  if (JUDGMENT.test(agencySaid) || JUDGMENT.test(app.filed?.note ?? "")) out.push("judgment");
  return out;
}

/* ------------------------------------------------------------------ one business day, New York time */

const NY = "America/New_York";
function parts(t: Date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: NY, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(t).map(x => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
/** New York local time to UTC (the offset read at that moment, so daylight saving is right). */
function fromNy(y: number, mo: number, d: number, h: number, mi: number, s: number): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const p = parts(new Date(guess));
  const off = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - guess;
  return new Date(guess - off);
}
/** When a specialist answers by: the same rule as the database's one_business_day (migration
 *  20261017210200_specialist_reviews). A weekday: the same time the next weekday. Saturday or Sunday: Monday 6pm. */
export function oneBusinessDay(at: Date): Date {
  const p = parts(at);
  const day = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  if (p.wd === 6 || p.wd === 0) {
    const add = p.wd === 6 ? 2 : 1, m = new Date(day.getTime() + add * 864e5);
    return fromNy(m.getUTCFullYear(), m.getUTCMonth() + 1, m.getUTCDate(), 18, 0, 0);
  }
  const add = p.wd === 5 ? 3 : 1, n = new Date(day.getTime() + add * 864e5);
  return fromNy(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate(), p.h, p.mi, p.s);
}

/** "by Tue, Nov 3, 6:00 PM ET", in either language. */
export function byWhen(iso: string): Bi {
  const t = new Date(iso);
  const en = new Intl.DateTimeFormat("en-US", { timeZone: NY, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(t);
  const zh = new Intl.DateTimeFormat("zh-CN", { timeZone: NY, month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(t);
  return B(`by ${en} ET`, `美东时间 ${zh} 前`);
}
/** What the thread and the job say while a specialist has it. */
export const withSpecialist = (question: string, due: string): Bi => {
  const by = byWhen(due), q = question.replace(/\s+/g, " ").trim().slice(0, 160);
  return B(`With a Placetta specialist, who answers ${by.en}: ${q}`, `快哉专员处理中，${by.zh}答复：${q}`);
};
