// Many stores at once: a pasted store list becomes, per store, every official form in filing order with its fee,
// how long the agency really takes, the date to file by for the opening date, and what renews and when.
// Pure functions: the Stores page and the tests call them; nothing here talks to a server.
import { formsFor, segmentOf, type OfficialForm, type Segment } from "./forms/registry";
import { B, type Bi, type Deadline, type Store } from "./model";

export type StoreRow = { name: string; address: string; opening?: string };

/** What Placetta has seen on real filings of a form (from filing_stats on the server): only shown with 3 or more. */
export type FormStat = { form: string; n: number; median_days: number; p90_days: number; rejected_pct: number };

export type PlannedForm = {
  form: OfficialForm;
  days: number | null;                 // working estimate of agency time, in calendar days
  daysFrom: "placetta" | "agency" | null;   // where that number comes from: our own filings, or the agency's published time
  fileBy: string | null;               // the latest day to file and still open on time
  late: boolean;                       // fileBy is already past
  everyMonths: number | null;          // how often it renews
};
export type StorePlan = { row: StoreRow; forms: PlannedForm[]; fees: number; varies: number; fileFirst: string | null; late: number };

const DATE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b|\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;
const pad = (n: number) => String(n).padStart(2, "0");

/** One store per line. Name, address and opening date in any order, separated by tabs, semicolons or pipes;
    a line without separators is the address. Dates as 2026-11-02 or 11/2/2026. Header lines are skipped. */
export function parseStoreList(text: string): StoreRow[] {
  const rows: StoreRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || /^(name|store|门店)\b.*(address|地址)/i.test(line)) continue;
    let opening: string | undefined;
    const m = DATE.exec(line);
    if (m) {
      const [y, mo, d] = m[1] ? [+m[1], +m[2], +m[3]] : [+m[6] < 100 ? 2000 + +m[6] : +m[6], +m[4], +m[5]];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) opening = `${y}-${pad(mo)}-${pad(d)}`;
      line = line.replace(m[0], " ");
    }
    const parts = line.split(/\t|;|\|/).map(s => s.trim().replace(/^,|,$/g, "").trim()).filter(Boolean);
    if (!parts.length) continue;
    // the name is a part with no digits that isn't the only part; the address is the part with a street number or the longest
    const named = parts.length > 1 ? parts.find(p => !/\d/.test(p) && p.length < 60) : undefined;
    const rest = parts.filter(p => p !== named);
    const address = (rest.find(p => /\d/.test(p)) ?? rest.sort((a, b) => b.length - a.length)[0] ?? "").replace(/\s{2,}/g, " ");
    if (!address) continue;
    rows.push({ name: named ?? address.split(",")[0], address, opening });
  }
  return rows.slice(0, 200);
}

/** "about 4 business days", "4 to 5 weeks", "two weeks": the longer end, in calendar days. null when not stated. */
export function publishedDays(takes?: Bi): number | null {
  const t = (takes?.en ?? "").toLowerCase();
  if (!t) return null;
  const word: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12 };
  let best: number | null = null;
  for (const m of t.matchAll(/(\d+|one|two|three|four|five|six|eight|ten|twelve)(?:\s*(?:to|-|–)\s*(\d+))?\s*(business days?|days?|weeks?|months?)/g)) {
    const n = Number(m[2] ?? (word[m[1]] ?? m[1]));
    const unit = m[3];
    const days = unit.startsWith("business") ? Math.ceil(n * 7 / 5) : unit.startsWith("week") ? n * 7 : unit.startsWith("month") ? n * 30 : n;
    if (Number.isFinite(days)) best = Math.max(best ?? 0, days);
  }
  return best;
}

/** How often a form renews, from its own words. */
export function renewMonths(renews?: Bi): number | null {
  const t = (renews?.en ?? "").toLowerCase();
  if (!t) return null;
  const years = /(\d+)\s*years?/.exec(t);
  if (/valid up to/.test(t) && years) return Number(years[1]) * 12;
  if (/two years|biennial|even-numbered|every 2 years/.test(t)) return 24;
  if (/every year|annual|yearly|each year|renew every year|certify every year/.test(t)) return 12;
  if (/quarter/.test(t)) return 3;
  if (/month/.test(t)) return 1;
  return null;
}

const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const BUFFER = 7;   // a week to gather documents and fix anything the agency bounces

export function planStore(row: StoreRow, segment: Segment, stats: FormStat[], today: string): StorePlan {
  const food = segment === "restaurant" || segment === "warehouse";
  const list = formsFor({ segment, where: row.address, needs: { food, employees: true, signage: true, buildout: true } });
  const forms: PlannedForm[] = list.map(form => {
    const st = stats.find(s => s.form === form.id && s.n >= 3);
    const pub = publishedDays(form.takes);
    const days = st ? st.p90_days : pub;
    const fileBy = row.opening && days != null ? addDays(row.opening, -(days + BUFFER)) : null;
    return { form, days, daysFrom: st ? "placetta" : pub != null ? "agency" : null, fileBy, late: !!fileBy && fileBy < today, everyMonths: renewMonths(form.renews) };
  });
  const dated = forms.map(f => f.fileBy).filter((d): d is string => !!d).sort();
  return {
    row, forms,
    fees: forms.reduce((s, f) => s + (f.form.fee ?? 0), 0),
    varies: forms.filter(f => f.form.fee == null).length,
    fileFirst: dated[0] ?? null,
    late: forms.filter(f => f.late).length,
  };
}

export const planStores = (rows: StoreRow[], business: string, stats: FormStat[], today: string) => {
  const segment = segmentOf(business);
  return rows.map(r => planStore(r, segment, stats, today));
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "store";

/** The planned stores as workspace stores and their file-by dates as deadlines. */
export function toWorkspace(plans: StorePlan[], existing: Store[]): { stores: Store[]; deadlines: Deadline[] } {
  const taken = new Set(existing.map(s => s.id));
  const stores: Store[] = [], deadlines: Deadline[] = [];
  for (const p of plans) {
    let id = "st-" + slug(p.row.name);
    for (let i = 2; taken.has(id); i++) id = `st-${slug(p.row.name)}-${i}`;
    taken.add(id);
    stores.push({ id, name: B(p.row.name, p.row.name), address: p.row.address, stage: "opening", plannedOpen: p.row.opening, projectedOpen: p.row.opening,
      rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 } });
    for (const f of p.forms) if (f.fileBy) deadlines.push({
      id: `fb-${id}-${f.form.id}`, date: f.fileBy, kind: "due",
      title: B(`${p.row.name}: file ${f.form.form}`, `${p.row.name}：提交 ${f.form.form}`), agency: f.form.agency,
    });
  }
  return { stores, deadlines };
}

/** The plan as CSV, for the expansion team's own tracker. */
export function planCsv(plans: StorePlan[]): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Store", "Address", "Opening", "Form", "Title", "Agency", "How it's filed", "Fee (USD)", "Agency time (days)", "Time from", "File by", "Renews every (months)", "Official link"];
  const lines = [head.map(q).join(",")];
  for (const p of plans) for (const f of p.forms) lines.push([p.row.name, p.row.address, p.row.opening ?? "", f.form.form, f.form.title.en, f.form.agency.en, f.form.how.en,
    f.form.fee ?? "varies", f.days ?? "", f.daysFrom === "placetta" ? "Placetta filings" : f.daysFrom === "agency" ? "agency's published time" : "", f.fileBy ?? "", f.everyMonths ?? "", f.form.url].map(q).join(","));
  return lines.join("\n");
}
