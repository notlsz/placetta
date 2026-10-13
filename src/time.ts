import type { Lang } from "./i18n";

/* Dates in the sample workspace are relative to the moment it opens, so "due in 21 days" stays true. */

export const DAY = 86_400_000;
const T0 = Date.now();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const pad = (n: number) => String(n).padStart(2, "0");

/** A local calendar date n days from today, as YYYY-MM-DD. */
export const inDays = (n: number) => { const d = new Date(startOfDay(new Date(T0)).getTime() + n * DAY + DAY / 2); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** A local calendar date n days from right now (not from when the page or server instance started), as YYYY-MM-DD.
 *  For real dates: deadlines, "today", windows. inDays stays anchored for the sample workspace. */
export const daysFromNow = (n: number) => { const d = new Date(startOfDay(new Date()).getTime() + n * DAY + DAY / 2); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** A timestamp a number of minutes ago, as an ISO string. */
export const ago = (min: number) => new Date(T0 - min * 60_000).toISOString();
export const nowIso = () => new Date().toISOString();

const parseDay = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
export const daysUntil = (iso: string) => Math.round((parseDay(iso).getTime() - startOfDay(new Date()).getTime()) / DAY);

export const fmtDay = (iso: string, lang: Lang, year = false) => {
  const d = parseDay(iso);
  if (lang === "zh") return `${year ? d.getFullYear() + "年" : ""}${d.getMonth() + 1}月${d.getDate()}日`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
};
export const fmtMonth = (iso: string, lang: Lang) => {
  const d = parseDay(iso);
  return lang === "zh" ? `${d.getFullYear()}年${d.getMonth() + 1}月` : d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};
/** Audit-trail stamp: 2026-10-04 09:41:07, local time. */
export const fmtStamp = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
export const fmtAgo = (iso: string, lang: Lang) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 1) return lang === "zh" ? "刚刚" : "Just now";
  if (m < 60) return lang === "zh" ? `${m} 分钟前` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === "zh" ? `${h} 小时前` : `${h} h ago`;
  const d = Math.round(h / 24);
  return lang === "zh" ? `${d} 天前` : d === 1 ? "Yesterday" : `${d} days ago`;
};
export const fmtIn = (n: number, lang: Lang) => {
  if (lang === "zh") return n === 0 ? "今天" : n === 1 ? "明天" : n < 0 ? `已过期 ${-n} 天` : `${n} 天后`;
  return n === 0 ? "Today" : n === 1 ? "Tomorrow" : n < 0 ? `${-n} days late` : `In ${n} days`;
};

export const money = (n: number, currency = "USD") => {
  if (currency === "USD") return "$" + n.toLocaleString("en-US");
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); } catch { return `${n.toLocaleString("en-US")} ${currency}`; }
};
export const bytes = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1000)) + " KB");
