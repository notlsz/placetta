/* What needs the owner, in one ordered list, and the one thing to do first (Home's "Do this next" card).

   One list instead of separate boxes for approvals, stuck jobs and missing documents (Linear's Inbox, Ramp's "Things to
   do"), and one big next action at the top (Duolingo). Odelia orders it by urgency:
     1. a date: anything due within 30 days (or overdue), soonest first
     2. blocking the opening: a permit on the chain that sets the opening date
     3. waiting on the owner: approvals first, then documents, oldest first
   Pure: Home renders it, scripts/home-next-test.ts tests it. */
import { B, type Bi } from "./bi";
import type { Application, Approval, Deadline } from "./model";
import { awayWait, nextAction, type Job } from "./jobs";

type Ws = { apps: Application[]; approvals: Approval[]; deadlines: Deadline[]; jobs?: Job[]; closed: Approval[]; stores?: { id: string; name: Bi }[] };

export type Todo =
  | { key: string; kind: "approval"; a: Approval; app?: Application; due?: Deadline; days?: number; blocks: boolean }
  | { key: string; kind: "job"; job: Job; app?: Application; due?: Deadline; days?: number; blocks: boolean }
  | { key: string; kind: "doc"; app: Application; item: string; label: Bi; due?: Deadline; days?: number; blocks: boolean };

/** How soon a date counts as urgent. */
export const SOON_DAYS = 30;

const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3);
/** The application a card is about: named on it, or (a message card) the one its title names in two or more words. */
function appOf(ws: Ws, a: Approval): Application | undefined {
  if (a.app) return ws.apps.find(x => x.id === a.app);
  const t = words(a.title.en);
  return ws.apps.find(x => words(x.name.en).filter(w => t.includes(w)).length >= 2);
}

const dayNum = (iso: string) => Math.round(Date.parse(iso.slice(0, 10) + "T12:00:00Z") / 86_400_000);

/** Every document still missing on an open permit that no card already covers: what a person has to hand over. */
export function stillRows(ws: Ws): { key: string; app: Application; label: Bi; id: string }[] {
  const planned = new Set(ws.approvals.map(a => appOf(ws, a)?.id).filter(Boolean));
  return ws.apps.filter(a => !["approved", "review", "filing"].includes(a.status) && !a.preview && !planned.has(a.id))
    .flatMap(a => a.checklist.filter(c => c.state === "missing" && !c.dep).map(c => ({ key: `${a.id}:${c.id}`, app: a, label: c.label, id: c.id })));
}

/** The jobs stuck on the owner that no card already covers (a job with the agency or the filing team needs nobody). */
export function waitingJobs(ws: Ws): Job[] {
  return (ws.jobs ?? []).filter(j => j.status === "waiting" && !j.children?.length && !awayWait(j)).filter(j => {
    const act = nextAction(ws, j);
    if (!act || act.who !== "you") return true;
    if (act.kind === "approve") return !ws.approvals.some(a => a.id === act.id);
    if (act.kind === "answer") return !ws.approvals.some(a => a.kind === "pay" && a.app === act.app);
    return !ws.approvals.some(a => a.kind === "upload" && a.app === act.app);
  });
}

/** Everything waiting on the owner, most urgent first. keep: the Mine filter (an application id, or a job). */
export function todos(ws: Ws, today: string, keep: { app?: (id?: string) => boolean; job?: (j: Job) => boolean } = {}): Todo[] {
  const t0 = dayNum(today);
  const dueFor = (app?: Application) => {
    if (!app) return {};
    const d = ws.deadlines.filter(x => x.app === app.id && (x.kind === "due" || x.kind === "renewal") && dayNum(x.date) - t0 <= SOON_DAYS)
      .sort((x, y) => x.date.localeCompare(y.date))[0];
    return d ? { due: d, days: dayNum(d.date) - t0 } : {};
  };
  const out: Todo[] = [];
  for (const a of ws.approvals) {
    const app = appOf(ws, a);
    if (keep.app && !keep.app(a.app)) continue;
    out.push({ key: "a:" + a.id, kind: "approval", a, app, blocks: !!app?.critical, ...dueFor(app) });
  }
  for (const j of waitingJobs(ws)) {
    if (keep.job && !keep.job(j)) continue;
    const app = (j.apps ?? []).map(id => ws.apps.find(x => x.id === id)).find(Boolean);
    out.push({ key: "j:" + j.id, kind: "job", job: j, app, blocks: !!app?.critical, ...dueFor(app) });
  }
  if (!keep.app) for (const r of stillRows(ws)) out.push({ key: "d:" + r.key, kind: "doc", app: r.app, item: r.id, label: r.label, blocks: !!r.app.critical, ...dueFor(r.app) });
  const rank = (x: Todo) => [
    x.days != null ? 0 : 1, x.days ?? 0,                        // 1. a date
    x.blocks ? 0 : 1,                                           // 2. blocking the opening
    x.kind === "approval" ? 0 : x.kind === "job" ? 1 : 2,       // 3. waiting on the owner
    x.kind === "approval" && x.a.at ? Date.parse(x.a.at) : Infinity,
  ];
  const order = new Map(out.map((x, i) => [x.key, i]));
  return out.sort((x, y) => {
    const a = rank(x), b = rank(y);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return order.get(x.key)! - order.get(y.key)!;
  });
}

/** The one thing to do first, or null when nothing needs the owner (Home shows the calm state then). */
export const doNext = (ws: Ws, today: string, keep?: Parameters<typeof todos>[2]): Todo | null => todos(ws, today, keep)[0] ?? null;

/** The next renewal on file, for the calm state: the soonest renewal date from today on. */
export function nextRenewal(ws: Ws, today: string): Deadline | null {
  return [...ws.deadlines].filter(d => d.kind === "renewal" && d.date >= today).sort((x, y) => x.date.localeCompare(y.date))[0] ?? null;
}

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** The headline of a to-do, as a plain instruction. */
export function headline(x: Todo): Bi {
  if (x.kind === "approval") return x.a.title;
  if (x.kind === "doc") return B(`Upload the ${lowerFirst(x.label.en)}`, `上传${x.label.zh}`);
  return x.job.title;
}
