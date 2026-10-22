// How often a permit renews and when the next renewal falls, from the agency's own published words. Shared by the
// renewal calendar after an approval (src/finish.ts scheduleRenewals) and the instant plan's projected renewals
// (src/plan/preview.ts), which stand until the approval day is on record.
/** The id prefix of a renewal the instant plan projects from the target opening; an approval replaces it. */
export const PROJECTED_RENEWAL = "pv-rn-";

/** How often a permit renews, read from the agency's own published words ("Every year.", "Every 2 years.", "Every year
 *  by May 15."). Null for anything else ("Does not expire.", "by the tax return due date"): no date is made up. */
export type Cycle = { months: number } | { month: number; day: number };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10 };
export function renewalCycle(text: string | undefined): Cycle | null {
  const s = (text ?? "").trim().toLowerCase().replace(/[.。]+$/, "").replace(/\s+/g, " ");
  if (!s || /not expire|never expires|永久/.test(s)) return null;
  if (/^(renew |update |certify )?(every year|yearly|annually)( renewal)?$/.test(s) || /^每年(续期一次|续期|一次)?$/.test(s)) return { months: 12 };
  // "Continuous bonds renew yearly.": what renews, then the cycle (CBP Form 301)
  if (/^[a-z ]{3,40} renews? (every year|yearly|annually)$/.test(s)) return { months: 12 };
  let m = /^(?:renew |update )?every (\d{1,2}|one|two|three|four|five|ten) years?$/.exec(s);
  if (m) { const n = WORDS[m[1]] ?? Number(m[1]); return n >= 1 && n <= 10 ? { months: n * 12 } : null; }
  m = /^每\s*(\d{1,2}|两|二|三|五)\s*年(一次)?$/.exec(s);
  if (m) { const n = ({ 两: 2, 二: 2, 三: 3, 五: 5 } as Record<string, number>)[m[1]] ?? Number(m[1]); return n >= 1 && n <= 10 ? { months: n * 12 } : null; }
  m = /^(?:renew )?every year by (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (\d{1,2})$/.exec(s);
  if (m) { const d = Number(m[2]); return d >= 1 && d <= 31 ? { month: MONTHS.indexOf(m[1]) + 1, day: d } : null; }
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** The renewal after an approval on `from` (YYYY-MM-DD): that many months on (the last day of a shorter month), or the
 *  next named day after it. */
export function nextRenewal(from: string, c: Cycle): string {
  const [y, mo, d] = from.split("-").map(Number);
  if ("months" in c) {
    const t = mo - 1 + c.months, yy = y + Math.floor(t / 12), mm = (t % 12) + 1;
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return `${yy}-${pad(mm)}-${pad(Math.min(d, last))}`;
  }
  const at = (yy: number) => { const last = new Date(Date.UTC(yy, c.month, 0)).getUTCDate(); return `${yy}-${pad(c.month)}-${pad(Math.min(c.day, last))}`; };
  return at(y) > from ? at(y) : at(y + 1);
}

