import { B, type Bi } from "./bi.ts";
import type { Workspace } from "./model.ts";

/* The renewal runway: everything that renews in the next 90 days, firm licenses and people's certificates alike, in
   three lanes (30, 60 and 90 days out) plus what has lapsed. Harbor Compliance's License Manager shows "licensing
   events due within 90 days" for "firm and individual licenses"; Gamut's agents send "tiered renewal alerts". Their
   gap is what happens next: the reminder is the product, and the renewal is still the customer's job. Here each line
   says who does what and when: Odelia starts a license's renewal 60 days out (RENEW_AHEAD in the monitor) and puts it
   up for approval; a person's certificate is theirs to renew, and Odelia reminds them in their own language.

   Pure: the dates come from the workspace (renewal reminders on Deadlines, each store's permits and staff certificates)
   and today's date is passed in, so the same lanes show in the app, the license report and the tests. */

/** The monitor starts a renewal job this many days before expiry (supabase/functions/monitor RENEW_AHEAD). */
export const RENEW_AHEAD = 60;
export const HORIZON = 90;
/** A store permit dated this far out is a "does not expire" placeholder, not a renewal. */
const FAR = 3650;

export type Lane = "lapsed" | 30 | 60 | 90;
export type RunwayItem = {
  id: string;
  name: Bi;
  /** the store, or the person who holds a certificate */
  holder?: Bi;
  agency?: Bi;
  date: string;
  days: number;
  lane: Lane;
  kind: "license" | "person";
  app?: string;
  store?: string;
  /** what happens next, and who does it */
  next: Bi;
};

const pad = (n: number) => String(n).padStart(2, "0");
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const ms = (d: string) => Date.parse(d + "T00:00:00Z");
export const between = (from: string, to: string) => Math.round((ms(to) - ms(from)) / 864e5);
export const addDays = (d: string, n: number) => { const t = new Date(ms(d) + n * 864e5); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };

export function laneOf(days: number): Lane | null {
  if (days < 0) return days >= -HORIZON ? "lapsed" : null;
  return days <= 30 ? 30 : days <= 60 ? 60 : days <= HORIZON ? 90 : null;
}

/** "Renew the sign permit" names the sign permit. */
const permitName = (t: Bi): Bi => ({
  en: t.en.replace(/^renew(al of)?\s+(the\s+)?/i, "").replace(/\s+renewal$/i, "").replace(/^./, c => c.toUpperCase()),
  zh: t.zh.replace(/^(为.+?)?续期/, "").replace(/续期$/, "") || t.zh,
});

function nextStep(kind: RunwayItem["kind"], days: number, date: string, holder?: Bi): Bi {
  if (kind === "person") {
    const who = holder ?? B("The holder", "持证人");
    if (days < 0) return B(`Lapsed on ${date}. ${who.en} can't do the work it covers until it's renewed.`, `已于 ${date} 过期。续期前，${who.zh}不能从事相应工作。`);
    return B(`${who.en} renews it. Odelia reminds them in the language they read.`, `由${who.zh}本人续期，Odelia 会用对方看得懂的语言提醒。`);
  }
  if (days < 0) return B(`Lapsed on ${date}. Operating without it risks a fine or a closure. Renew now.`, `已于 ${date} 过期。无证经营可能被罚款或停业，请立即续办。`);
  if (days <= 30) return B("Urgent. Odelia prepares the renewal for your approval now.", "紧急。Odelia 现在就准备续办，等您批准。");
  if (days <= RENEW_AHEAD) return B("In the renewal window. Odelia prepares it and puts it up for your approval.", "已进入续办期。Odelia 会准备好并提交给您批准。");
  const start = addDays(date, -RENEW_AHEAD);
  return B(`Odelia starts the renewal on ${start}. Anything the agency wants first, such as an inspection, can start now.`, `Odelia 将于 ${start} 开始续办。机构要求先做的事（如检查）现在就可以开始。`);
}

/** Everything renewing within 90 days of `today`, or lapsed within 90, soonest first. `store` keeps one store's lines
 *  and the business-wide ones (reminders not tied to another store's application). */
export function runway(ws: Pick<Workspace, "deadlines" | "stores" | "apps">, today: string, o: { store?: string } = {}): RunwayItem[] {
  const out: RunwayItem[] = [];
  const stores = ws.stores ?? [];
  const storeOf = (app?: string) => app ? stores.find(s => s.apps?.includes(app))?.id : undefined;
  const seen = new Set<string>();
  for (const d of ws.deadlines ?? []) {
    if (d.kind !== "renewal" || !isDay(d.date)) continue;
    const days = between(today, d.date), lane = laneOf(days);
    if (lane === null) continue;
    const st = storeOf(d.app);
    if (o.store && st && st !== o.store) continue;
    const app = d.app ? ws.apps.find(a => a.id === d.app) : undefined;
    // a person's certificate reminder ("Renew Marco's food protection certificate") is the person's to renew
    const person = /\b\w+'s\b/.test(d.title.en) && /certificat|card|licen[cs]e/i.test(d.title.en) && !app;
    const key = (app ? "app:" + app.id : "t:" + permitName(d.title).en.toLowerCase()) + ":" + d.date;
    if (seen.has(key)) continue;
    seen.add(key);
    const holder = person ? (() => { const m = /\b([A-Z][\w-]*)'s\b/.exec(d.title.en); return m ? { en: m[1], zh: m[1] } : undefined; })() : undefined;
    out.push({ id: d.id, name: app?.name ?? permitName(d.title), agency: d.agency ?? app?.agency, date: d.date, days, lane, kind: person ? "person" : "license",
      app: d.app, store: st, holder, next: nextStep(person ? "person" : "license", days, d.date, holder) });
  }
  for (const s of stores) {
    if (o.store && s.id !== o.store) continue;
    for (const p of s.permits ?? []) {
      if (!isDay(p.expires)) continue;
      const days = between(today, p.expires);
      if (days > FAR) continue;
      const lane = laneOf(days);
      if (lane === null) continue;
      const key = "t:" + p.name.en.toLowerCase() + ":" + p.expires;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `rw-${s.id}-${p.name.en}`, name: p.name, holder: s.name, date: p.expires, days, lane, kind: "license", store: s.id, next: nextStep("license", days, p.expires) });
    }
    for (const c of s.certs ?? []) {
      if (!isDay(c.expires)) continue;
      const days = between(today, c.expires), lane = laneOf(days);
      if (lane === null) continue;
      const first = c.person.split(/\s+/)[0];
      // the same certificate may also sit on Deadlines as "Renew Marco's ..."; one line is enough
      if (out.some(x => x.kind === "person" && x.holder?.en === first && Math.abs(between(x.date, c.expires)) <= 31)) continue;
      const holder = { en: c.person, zh: c.person };
      out.push({ id: `rw-${s.id}-${c.id}`, name: c.kind, holder, date: c.expires, days, lane, kind: "person", store: s.id, next: nextStep("person", days, c.expires, holder) });
    }
  }
  return out.sort((a, b) => a.days - b.days || a.name.en.localeCompare(b.name.en));
}

export const LANES: { lane: Lane; label: Bi }[] = [
  { lane: "lapsed", label: B("Lapsed", "已过期") },
  { lane: 30, label: B("Within 30 days", "30 天内") },
  { lane: 60, label: B("31 to 60 days", "31 至 60 天") },
  { lane: 90, label: B("61 to 90 days", "61 至 90 天") },
];
