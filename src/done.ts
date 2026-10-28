import { B, type Bi } from "./bi";
import { addDeadline } from "./core";
import type { Doc, Workspace } from "./model";

/* The "Done" screen's facts (src/DoneScreen.tsx): every license in the plan approved, the documents behind them in the
   vault, and each renewal on the calendar. One function, so the screen, Odelia and the tests agree on when an opening
   is done and what it holds. */

export type DoneLicense = { app: string; name: Bi; agency: Bi; receipt?: Doc };
export type DoneRenewal = { app: string; title: Bi; date: string; set: boolean };
export type DoneSummary = { done: boolean; licenses: DoneLicense[]; docs: Doc[]; renewals: DoneRenewal[] };

const YEARLY = /every year|annual|每年/i;
const addYear = (d: string) => { const x = new Date(d.slice(0, 10) + "T00:00:00Z"); x.setUTCFullYear(x.getUTCFullYear() + 1); return x.toISOString().slice(0, 10); };

export function doneSummary(w: Workspace, now: string): DoneSummary {
  const lic = w.apps.filter(a => !a.yours && !a.abstain);
  const done = lic.length > 0 && lic.every(a => a.status === "approved");
  const licenses = lic.map(a => ({ app: a.id, name: a.name, agency: a.agency, ...(a.receipt ? { receipt: w.docs.find(d => d.id === a.receipt) } : {}) }));
  const ids = new Set(lic.map(a => a.id));
  const docs = w.docs.filter(d => d.app && ids.has(d.app));
  const renewals: DoneRenewal[] = lic.filter(a => a.renews && YEARLY.test(a.renews.en)).map(a => {
    const dl = w.deadlines.find(d => d.app === a.id && d.kind === "renewal");
    return { app: a.id, title: B(`${a.name.en} renewal`, `${a.name.zh}续期`), date: dl?.date.slice(0, 10) ?? addYear(now), set: !!dl };
  });
  return { done, licenses, docs, renewals };
}

/** Puts every yearly renewal that isn't on the calendar yet on it, a year from now (Odelia starts each 60 days out). */
export const setRenewals = (now: string) => (w: Workspace): Workspace =>
  doneSummary(w, now).renewals.filter(r => !r.set).reduce((x, r) => addDeadline({ id: `dl-renew-${r.app}`, date: r.date, kind: "renewal", app: r.app, title: r.title })(x), w);
