// The free compliance check for stores a business already runs. The owner names each store's city and what it sells;
// Placetta's own registry (the same one the instant plan uses, src/plan/preview.ts) lists what that store has to hold;
// the owner ticks each one (have it, not sure, don't have it) and adds a renewal date when they know it. The check
// then shows the gaps and the lapse risks per store, with no model call, and turns them into plan rows.
// Pure functions: the onboarding path, the Stores page and the website's check (src/site/stores-check.ts) all call
// these, and scripts/stores-check-test.ts tests them.
import { B, same, type Bi } from "../bi";
import type { Application, Deadline, Level, Store } from "../model";
import { previewPlan, stateOf } from "./preview";

export type Have = "have" | "unsure" | "missing";
/** One store the owner already runs: its city ("Flushing, NY") and what it sells ("Milk tea"). */
export type StoreInput = { id: string; city: string; what: string; name?: string };
/** What the owner said about one permit: have it, not sure, don't have it, and its renewal date when known. */
export type Answer = { have?: Have; renews?: string };
/** Answers per store, then per permit key. */
export type Answers = Record<string, Record<string, Answer>>;

/** A permit, license or registration the registry says this store has to hold. */
export type Required = {
  key: string;                 // the registry id: the same for every store in the same city and line of business
  name: Bi;
  agency: Bi;
  level: Level;
  whole: boolean;              // held once by the whole business (the EIN), not per store
  every: number | null;        // renews every this many months; null when it doesn't renew
  renews?: Bi;                 // the agency's own words about renewing
  source: { label: string; url: string };
  app: Application;            // the registry row, which becomes a plan row when it's a gap
};

export type FindingKind = "gap" | "unsure" | "lapsed" | "due_soon" | "no_date" | "ok";
export type Finding = { key: string; name: Bi; agency: Bi; kind: FindingKind; date?: string; days?: number; every: number | null };
export type StoreResult = {
  store: StoreInput;
  place: string;               // the city as the registry reads it
  ok: boolean;                 // the city and state were understood
  required: Required[];
  findings: Finding[];
  counts: Record<FindingKind, number>;
};

/** The kinds of business the check offers as one tap each (what the onboarding and the website show). */
export const KINDS: Bi[] = [B("Milk tea", "奶茶"), B("Coffee", "咖啡"), B("Bakery and desserts", "烘焙甜品"), B("Restaurant", "餐厅"), B("Grocery", "超市"), B("Retail", "零售")];

/** How many days ahead a renewal counts as due soon. */
export const DUE_SOON_DAYS = 60;

const DAY = 864e5;
const isDay = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));
const between = (from: string, to: string) => Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / DAY);

/** How often a permit renews, in months, from the agency's own words. null: it doesn't (or the agency doesn't say). */
export function renewEvery(renews?: Bi): number | null {
  const t = (renews?.en ?? "").toLowerCase();
  if (!t || /does not expire|doesn't expire|never expires|no renewal/.test(t)) return null;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, twelve: 12 };
  const n = (s: string) => Number(words[s] ?? s);
  let m = /(?:every|valid (?:up to|for))\s+(\d+|one|two|three|four|five|six|ten|twelve)\s+years?/.exec(t);
  if (m) return n(m[1]) * 12;
  m = /every\s+(\d+|one|two|three|four|five|six|twelve)\s+months?/.exec(t);
  if (m) return n(m[1]);
  if (/every year|each year|yearly|annual|calendar year|a year\b/.test(t)) return 12;
  if (/two years|biennial|every other year/.test(t)) return 24;
  if (/quarter/.test(t)) return 3;
  // "valid to the date on the card": it does expire, but the agency sets the date
  if (/expire|valid to|renew/.test(t)) return 0;
  return null;
}

/** "Flushing, NY", "Flushing NY" or "Irvine, California" as the registry reads a place; "" when there's no state. */
export function readPlace(city: string): string {
  const t = city.trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (stateOf(t)) return t;
  // "Flushing NY" (no comma)
  const m = /^(.+?)\s+([A-Za-z]{2})$/.exec(t);
  if (m && stateOf(`${m[1]}, ${m[2].toUpperCase()}`)) return `${m[1]}, ${m[2].toUpperCase()}`;
  return "";
}

/** What a store already open has to hold: the registry's rows for its line of business in its city, without the
    steps that only happen while opening (forming the company, construction and plan review). */
export function requiredFor(s: StoreInput): Required[] {
  const place = readPlace(s.city);
  if (!place || !s.what.trim()) return [];
  const plan = previewPlan(s.what, place, undefined, { entity: "existing", buildout: false });
  return plan.apps.map(a => ({
    key: a.official ?? a.id.replace(/^pv-(g-)?/, ""),
    name: a.name, agency: a.agency, level: a.level,
    whole: a.level === "federal",
    every: renewEvery(a.renews), renews: a.renews,
    source: a.source, app: a,
  }));
}

/** One store's findings from the owner's answers. Nothing answered counts as not sure: the check never assumes. */
export function checkStore(s: StoreInput, answers: Record<string, Answer>, today: string): StoreResult {
  const place = readPlace(s.city);
  const required = requiredFor(s);
  const findings: Finding[] = required.map(r => {
    const a = answers[r.key] ?? {};
    const base = { key: r.key, name: r.name, agency: r.agency, every: r.every };
    if (a.have === "missing") return { ...base, kind: "gap" };
    if (a.have !== "have") return { ...base, kind: "unsure" };
    if (r.every === null) return { ...base, kind: "ok" };
    if (!isDay(a.renews)) return { ...base, kind: "no_date" };
    const days = between(today, a.renews!);
    if (days < 0) return { ...base, kind: "lapsed", date: a.renews, days };
    if (days <= DUE_SOON_DAYS) return { ...base, kind: "due_soon", date: a.renews, days };
    return { ...base, kind: "ok", date: a.renews, days };
  });
  const counts: Record<FindingKind, number> = { gap: 0, unsure: 0, lapsed: 0, due_soon: 0, no_date: 0, ok: 0 };
  for (const f of findings) counts[f.kind]++;
  return { store: s, place, ok: !!place, required, findings, counts };
}

export const checkStores = (stores: StoreInput[], answers: Answers, today: string) => stores.map(s => checkStore(s, answers[s.id] ?? {}, today));

/** Every store's counts added up: what the summary line and the website's lead say. */
export function totals(results: StoreResult[]) {
  const t = { stores: results.length, required: 0, gap: 0, unsure: 0, lapsed: 0, due_soon: 0, no_date: 0, ok: 0 };
  // a permit the whole business holds once is counted once, from the first store that lists it
  const seen = new Set<string>();
  for (const r of results) for (const f of r.findings) {
    const whole = r.required.find(x => x.key === f.key)?.whole;
    if (whole) { if (seen.has(f.key)) continue; seen.add(f.key); }
    t.required++; t[f.kind]++;
  }
  return t;
}

/** What needs doing, worst first: lapsed, then missing, then due soon, then not sure, then no renewal date. */
export const RANK: Record<FindingKind, number> = { lapsed: 0, gap: 1, due_soon: 2, unsure: 3, no_date: 4, ok: 5 };
export const needsWork = (f: Finding) => f.kind !== "ok";

/** What each finding means, in one line, in both languages. */
export function findingLine(f: Finding): Bi {
  const d = f.date ?? "";
  switch (f.kind) {
    case "gap": return B("Missing. Placetta can file it.", "缺少此项，快哉可以为您办理。");
    case "unsure": return B("Not sure. Odelia checks the agency's records.", "不确定，Odelia 会查询机构记录。");
    case "lapsed": return B(`Expired on ${d}. Renew it before an inspector asks.`, `已于 ${d} 过期，请在检查前续期。`);
    case "due_soon": return B(`Renews by ${d}, in ${f.days} day${f.days === 1 ? "" : "s"}.`, `需在 ${d} 前续期，还剩 ${f.days} 天。`);
    case "no_date": return B("Renews, but the date isn't known. Add it from the certificate.", "需要续期，但日期未知。请从证书上补充日期。");
    default: return d ? B(`In order until ${d}.`, `有效期至 ${d}。`) : B("In order.", "已具备。");
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "store";

/** The check, turned into the plan: each store as an open store (with the permits it holds and their renewal dates),
    an application for each gap, lapse and permit nobody's sure of, and the renewal dates as deadlines. Rows for the
    whole business are added once. Ids are new and don't clash with what the workspace already has. */
export function toPlan(results: StoreResult[], today: string, taken: { stores?: string[]; apps?: string[] } = {}): { stores: Store[]; apps: Application[]; deadlines: Deadline[] } {
  const storeIds = new Set(taken.stores ?? []), appIds = new Set(taken.apps ?? []);
  const stores: Store[] = [], apps: Application[] = [], deadlines: Deadline[] = [];
  const wholeDone = new Map<string, string>();
  for (const r of results) {
    if (!r.ok) continue;
    const label = r.store.name?.trim() || r.place;
    let sid = "st-" + slug(label);
    for (let i = 2; storeIds.has(sid); i++) sid = `st-${slug(label)}-${i}`;
    storeIds.add(sid);
    const mine: string[] = [], permits: { name: Bi; expires: string }[] = [];
    for (const f of r.findings) {
      const req = r.required.find(x => x.key === f.key)!;
      if (f.date && (f.kind === "ok" || f.kind === "due_soon" || f.kind === "lapsed")) permits.push({ name: f.name, expires: f.date });
      if (f.date && f.kind !== "lapsed") deadlines.push({ id: `rn-${sid}-${f.key}`, date: f.date, kind: "renewal", title: B(`${label}: renew the ${f.name.en}`, `${label}：续期${f.name.zh}`), agency: f.agency });
      if (!needsWork(f) || f.kind === "due_soon" || f.kind === "no_date") continue;
      if (req.whole && wholeDone.has(f.key)) { mine.push(wholeDone.get(f.key)!); continue; }
      let id = `ex-${req.whole ? "biz" : sid}-${slug(f.key)}`;
      for (let i = 2; appIds.has(id); i++) id = `ex-${req.whole ? "biz" : sid}-${slug(f.key)}-${i}`;
      appIds.add(id);
      const next = f.kind === "lapsed" ? B(`Renew: it expired on ${f.date}`, `续期：已于 ${f.date} 过期`)
        : f.kind === "unsure" ? B("Check whether you hold it", "核实是否已持有") : B("File it", "提交申请");
      apps.push({ ...req.app, id, status: "todo", preview: true, next, critical: f.kind === "lapsed" || undefined, fields: req.app.fields.map(x => ({ ...x })), checklist: req.app.checklist.map(x => ({ ...x })) });
      if (f.kind === "lapsed") deadlines.push({ id: `lp-${sid}-${f.key}`, date: today, kind: "due", app: id, title: B(`${label}: the ${f.name.en} has expired`, `${label}：${f.name.zh}已过期`), agency: f.agency });
      if (req.whole) wholeDone.set(f.key, id);
      mine.push(id);
    }
    stores.push({
      id: sid, name: same(label), address: r.place, stage: "open", rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 },
      apps: [...new Set(mine)], ...(permits.length ? { permits } : {}),
    });
  }
  return { stores, apps, deadlines };
}
