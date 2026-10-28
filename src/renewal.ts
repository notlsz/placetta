// How often a permit renews and when the next renewal falls, from the agency's own published words. Shared by the
// renewal calendar after an approval (src/finish.ts scheduleRenewals) and the instant plan's projected renewals
// (src/plan/preview.ts), which stand until the approval day is on record.
/** The id prefix of a renewal the instant plan projects from the target opening; an approval replaces it. */
export const PROJECTED_RENEWAL = "pv-rn-";

/** How often a permit renews, read from the agency's own published words. Two shapes:
 *    { months }  a term counted from the approval ("Every year.", "Every 2 years.", "Valid for 5 years.", "Every year
 *                from the issue date.");
 *    { month, day }  a date the agency fixes for everyone ("Every year by May 15.", "all certificates expire December
 *                31", "receipts run October 1 to September 30"), with `years` when it comes round every few years
 *                ("expire December 31 of the fifth year"), `parity` when only even or odd years count ("of every
 *                even-numbered year"), and `opens` when renewing is only possible from a day ("between October 1 and
 *                December 31"): an approval inside that window counts as this round, so the next is a cycle later.
 *  Null for anything else ("Does not expire.", "by the tax return due date", "Every 2 or 4 years", "on the district's
 *  date", a date that depends on the kind of license or the owner's tax year): no date is made up. */
export type Cycle = { months: number } | { month: number; day: number; years?: number; parity?: "even" | "odd"; opens?: { month: number; day: number } };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10 };
const N = "(\\d{1,2}|one|two|three|four|five|ten)";
const num = (w: string) => WORDS[w] ?? Number(w);
const term = (n: number): Cycle | null => (n >= 1 && n <= 10 ? { months: n * 12 } : null);
const fixed = (mon: string, day: string, extra: Partial<{ years: number; parity: "even" | "odd"; opens: { month: number; day: number } }> = {}): Cycle | null => {
  const d = Number(day);
  return d >= 1 && d <= 31 ? { month: MONTHS.indexOf(mon.slice(0, 3)) + 1, day: d, ...extra } : null;
};
/** Words that make a date depend on something Placetta can't see on the form: the kind of license, the owner's tax
 *  year or start month, a district, endorsements, or a choice. */
const DEPENDS = /\bothers?\b|tax year|month (your|the) business|district|endorsement|as chosen|\bor \d|\d or \d|\bor (two|four)\b|certifying body|commercial registration/;

export function renewalCycle(text: string | undefined): Cycle | null {
  const s = (text ?? "").trim().toLowerCase().replace(/[.。]+$/, "").replace(/\s+/g, " ").replace(/\s*\((?:\$[\d,]+|registration)\)$/, "");
  if (!s || /not expire|never expires|need to be renewed|永久/.test(s)) return null;
  // the first term is fixed even when later ones vary ("The first card is valid 2 years; renewals 3 years, or 5 ...")
  let m = new RegExp(`^the first [a-z]+ is valid ${N} years?;`).exec(s);
  if (m) return term(num(m[1]));
  if (DEPENDS.test(s)) return null;
  if (/^(renew |update |certify )?(every year|yearly|annually)( renewal)?$/.test(s) || /^每年(续期一次|续期|一次)?$/.test(s)) return { months: 12 };
  // "Continuous bonds renew yearly.": what renews, then the cycle (CBP Form 301)
  if (/^[a-z ]{3,40} renews? (every year|yearly|annually)$/.test(s)) return { months: 12 };
  m = new RegExp(`^(?:renew |update )?every ${N} years?$`).exec(s);
  if (m) return term(num(m[1]));
  m = /^每\s*(\d{1,2}|两|二|三|五)\s*年(一次)?$/.exec(s);
  if (m) return term(({ 两: 2, 二: 2, 三: 3, 五: 5 } as Record<string, number>)[m[1]] ?? Number(m[1]));
  m = new RegExp(`^(?:renew )?every year by ${MON} (\\d{1,2})$`).exec(s);
  if (m) return fixed(m[1], m[2]);

  // a date every few years, or in even or odd years only (FDA's biennial food facility renewal)
  m = new RegExp(`^every ${N} years; [a-z ]*expire ${MON} (\\d{1,2}) of the (?:second|third|fourth|fifth|tenth) year$`).exec(s);
  if (m) { const n = num(m[1]); return n >= 2 && n <= 10 ? fixed(m[2], m[3], { years: n }) : null; }
  m = new RegExp(`^renew between ${MON} (\\d{1,2}) and ${MON} (\\d{1,2}) of every (even|odd)-numbered year$`).exec(s);
  if (m) return fixed(m[3], m[4], { parity: m[5] as "even" | "odd", opens: { month: MONTHS.indexOf(m[1].slice(0, 3)) + 1, day: Number(m[2]) } });

  // a term from the approval, with words that only say so ("from the issue date", "with 4 hours of continuing education")
  if (/^(?:every year|every 12 months)(?:,? (?:one year )?from the (?:issue|first registration) date| from the date of issue|, through [a-z ]+|; renew online before it expires)?(?:[.;] the renewal notice comes \d+ days before)?$/.test(s)) return { months: 12 };
  m = new RegExp(`^every ${N} years?(?:,? with [^;]+| from the first registration(?:; [a-z ]+)?|, in the anniversary month of formation[a-z ,]*)$`).exec(s);
  if (m) return term(num(m[1]));
  m = new RegExp(`^(?:[a-z]+ )?(?:biennial|annual) [a-z ]+ every ${N} years?$`).exec(s);
  if (m) return term(num(m[1]));
  m = new RegExp(`^valid (?:for )?${N} years?(?: from the (?:exam|issue) date)?$`).exec(s);
  if (m) return term(num(m[1]));

  // a date the agency fixes each year, said after "every year"
  if (!/^every year\b/.test(s)) return null;
  if (/last day of feb/.test(s)) return fixed("feb", "29");
  m = new RegExp(`\\bexpires? ${MON} (\\d{1,2})\\b`).exec(s);
  if (m) return fixed(m[1], m[2]);
  m = new RegExp(`\\bruns? (?:${MON} \\d{1,2} )?to ${MON} (\\d{1,2})\\b`).exec(s);
  if (m) return fixed(m[2], m[3]);
  m = new RegExp(`\\bbetween ${MON} (\\d{1,2}) and ${MON} (\\d{1,2})\\b`).exec(s);
  if (m) return fixed(m[3], m[4], { opens: { month: MONTHS.indexOf(m[1].slice(0, 3)) + 1, day: Number(m[2]) } });
  m = new RegExp(`\\b(?:due(?: by| on)?|by|are due) ${MON} (\\d{1,2})\\b`).exec(s);
  if (m) return fixed(m[1], m[2]);
  m = new RegExp(`\\byear starts ${MON} (\\d{1,2})\\b`).exec(s);
  if (m) return fixed(m[1], m[2]);
  m = new RegExp(`\\bpayments after ${MON} (\\d{1,2}) carry a penalty\\b`).exec(s);
  if (m) return fixed(m[1], m[2]);
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** The renewal after an approval on `from` (YYYY-MM-DD): that many months on (the last day of a shorter month), or the
 *  next fixed day after it that the cycle allows. */
export function nextRenewal(from: string, c: Cycle): string {
  const [y, mo, d] = from.split("-").map(Number);
  if ("months" in c) {
    const t = mo - 1 + c.months, yy = y + Math.floor(t / 12), mm = (t % 12) + 1;
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return `${yy}-${pad(mm)}-${pad(Math.min(d, last))}`;
  }
  const on = (yy: number, month: number, day: number) => { const last = new Date(Date.UTC(yy, month, 0)).getUTCDate(); return `${yy}-${pad(month)}-${pad(Math.min(day, last))}`; };
  const at = (yy: number) => on(yy, c.month, c.day);
  // "expire December 31 of the fifth year": the year of the approval is the first
  if (c.years) return at(y + c.years - 1) > from ? at(y + c.years - 1) : at(y + c.years);
  const counts = (yy: number) => !c.parity || (yy % 2 === 0) === (c.parity === "even");
  // an approval on or after the window opens is this round's renewal already
  const fresh = (yy: number) => at(yy) > from && (!c.opens || on(yy, c.opens.month, c.opens.day) > from);
  for (let yy = y; yy <= y + 3; yy++) if (counts(yy) && fresh(yy)) return at(yy);
  return at(y + 4);
}
