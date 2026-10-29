// The review gate on a skill Odelia records for herself (run.ts learn). Hermes Agent writes its own skills from what it
// did and runs them again; that is its strength and its attack surface: one poisoned page, and the next unattended run
// carries the poison. A recording here is only ever the steps a run actually carried out on the agency's site, and the
// replay still goes through every guard. On top of that, a new recording that does more than the one before it waits
// for the Placetta team before it runs on its own:
//   a new host      a step on a host the earlier skill never visited, or off the run's own portal hosts
//   a payment step  a card line, or a step on a pay, checkout or billing page, that the earlier skill didn't have (a first
//                   recording with any payment step waits too)
//   a new recipient a line that sends a copy or a notice somewhere (an email, cc, notify, phone or fax line) that the
//                   earlier skill never filled
// A held skill is saved switched off with its reasons (filer_hold_skill), and a later run can't switch it back on: only
// the team's review does (skill_review_clear). Pure.
import type { TraceStep } from "./types.ts";

export type SkillReview = { hold: boolean; why: string[] };

const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
const within = (h: string, list: string[]) => list.some((x) => { const y = x.toLowerCase().replace(/^www\./, ""); return h === y || h.endsWith("." + y); });
const PAY = /\b(pay|payment|payments|checkout|check out|card number|credit card|debit card|cvv|cvc|security code|expiration|billing|remit)\b/i;
const RECIPIENT = /\b(e-?mail|cc|bcc|recipient|send (a )?copy|copy to|notify|notification|forward|phone|fax|mobile|text me)\b/i;
const words = (s: TraceStep) => `${s.selector} ${s.heading}`;
const isPay = (s: TraceStep) => (s.action === "fill" && !!s.card) || PAY.test(words(s)) || PAY.test(s.url);
const isRecipient = (s: TraceStep) => s.action === "fill" && !s.login && RECIPIENT.test(s.selector);

/** Whether a new recording may replace the one before it without a person: old is the skill's current steps (none for a
 *  first recording), hosts the run's own portal hosts. */
export function reviewSkill(old: TraceStep[] | null | undefined, next: TraceStep[], hosts: string[]): SkillReview {
  const why: string[] = [];
  const before = old ?? [];
  const oldHosts = [...new Set(before.map((s) => hostOf(s.url)).filter(Boolean))];
  const oldSel = new Set(before.map((s) => s.selector));
  for (const h of [...new Set(next.map((s) => hostOf(s.url)).filter(Boolean))]) {
    if (!within(h, hosts) || (before.length && !within(h, oldHosts))) why.push(`a new host: ${h}`);
  }
  const pays = next.filter((s) => isPay(s) && !(before.length && oldSel.has(s.selector) && before.some((o) => o.selector === s.selector && isPay(o))));
  if (pays.length) why.push(`a payment step: ${pays[0].selector}`);
  if (before.length) {
    const added = next.filter((s) => isRecipient(s) && !oldSel.has(s.selector));
    if (added.length) why.push(`a new recipient line: ${added[0].selector}`);
  }
  return { hold: why.length > 0, why: why.slice(0, 6).map((w) => w.slice(0, 200)) };
}
