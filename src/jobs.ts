import { B, type Bi } from "./bi";

/* Odelia's work, run like an engineer's: each job she takes on has a plan she keeps current (Work, in the app), and
   routines are jobs the business asked her to repeat on a schedule. The monitor starts due routines each morning. */

/** What proves a step (or a done item) from the workspace itself, so nobody has to say it's done:
 *  - app + items: those checklist items on the application have their documents
 *  - approval: the approval has been put up (waiting, or already decided)
 *  - closed: the person approved it and it went out
 *  - status: the application has reached one of these statuses
 *  Every condition given has to hold. */
export type StepCheck = { app?: string; items?: string[]; approval?: string; closed?: string; status?: string[] };
export type JobStep = { title: Bi; done: boolean; check?: StepCheck };
/** One line of what finished looks like, with the checker's verdict once it has looked. */
export type DoneItem = { text: Bi; ok?: boolean; why?: Bi; check?: StepCheck };
/** What a seat did and what's next, written when an agent hands the job to a fresh one. */
export type Handoff = { at: string; seat: number; note: string };
export type JobStatus = "running" | "waiting" | "done" | "stopped";
export type Job = {
  id: string; title: Bi; status: JobStatus; steps: JobStep[];
  waiting?: Bi;               // what she needs, and from whom, while it's waiting
  started: string; updated: string;   // ISO times
  apps?: string[];            // the applications this job is about
  routine?: string;           // started by this routine
  // The harness: everything any agent needs to put this job on and work it (src/harness.ts).
  playbook?: string;          // the skill it follows
  done?: DoneItem[];          // what finished looks like; a separate checker verifies each before it's done
  checked?: { at: string; passed: number; of: number };
  files?: string[];           // its toolbox: documents made for it
  handoffs?: Handoff[];       // seat to seat
  seat?: number;              // which agent has it now (1 for the first)
};
export type Every = "daily" | "weekly" | "monthly";
export type Routine = {
  id: string; title: Bi; prompt: string; every: Every;
  day?: number;               // weekly: 0 (Sunday) to 6; monthly: 1 to 31 (the last day of a shorter month)
  from: string;               // first day it may run, YYYY-MM-DD
  paused?: boolean; last?: string; created: string;
};

const DAY = 864e5;
const parse = (d: string) => new Date(d + "T12:00:00Z");
const iso = (t: Date) => t.toISOString().slice(0, 10);
const lastOfMonth = (t: Date) => new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0, 12)).getUTCDate();

/** Whether a routine runs on this day. */
export function runsOn(r: Routine, day: string): boolean {
  if (r.paused || day < r.from) return false;
  const t = parse(day);
  if (r.every === "daily") return true;
  if (r.every === "weekly") return t.getUTCDay() === (r.day ?? parse(r.from).getUTCDay());
  const want = r.day ?? parse(r.from).getUTCDate();
  return t.getUTCDate() === Math.min(want, lastOfMonth(t));
}

/** The next day a routine runs, today included, or null when it's paused. */
export function nextRun(r: Routine, today: string): string | null {
  if (r.paused) return null;
  let t = parse(today < r.from ? r.from : today);
  for (let i = 0; i < 62; i++, t = new Date(t.getTime() + DAY)) if (runsOn(r, iso(t))) return iso(t);
  return null;
}

const WD = [B("Sunday", "周日"), B("Monday", "周一"), B("Tuesday", "周二"), B("Wednesday", "周三"), B("Thursday", "周四"), B("Friday", "周五"), B("Saturday", "周六")];
/** "Every Monday", "Every day", "On the 1st of each month". */
export function cadence(r: Routine): Bi {
  if (r.every === "daily") return B("Every day", "每天");
  if (r.every === "weekly") { const w = WD[r.day ?? parse(r.from).getUTCDay()]; return B(`Every ${w.en}`, `每${w.zh}`); }
  const d = r.day ?? parse(r.from).getUTCDate();
  const th = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return B(`On the ${d}${th} of each month`, `每月 ${d} 日`);
}

/** A job's progress: steps done and in all. */
export const progress = (j: Job) => ({ done: j.steps.filter(s => s.done).length, all: j.steps.length });

/** An application with the agency past its usual time: days it has waited, and the agency's usual days. The agency's
    time comes from its own published processing time; a week of grace before Placetta chases it. */
export function overdue(submittedAt: string | null | undefined, agencyDays: number | null, today: string): { waited: number; usual: number } | null {
  if (!submittedAt || !agencyDays) return null;
  const waited = Math.round((parse(today).getTime() - parse(submittedAt.slice(0, 10)).getTime()) / DAY);
  return waited > agencyDays + 7 ? { waited, usual: agencyDays } : null;
}

/** When a run ends, a job it left "running" isn't being worked on any more: done when every step is, otherwise it
    waits for the person to say carry on. Only jobs this run touched (updated since it started). */
export function settleJobs<W extends { jobs?: Job[] }>(since: string): (w: W) => W {
  return w => {
    if (!(w.jobs ?? []).some(j => j.status === "running" && j.updated >= since)) return w;
    return { ...w, jobs: (w.jobs ?? []).map(j => j.status !== "running" || j.updated < since ? j
      // every step done, but the checker found the done list short: it waits, saying what's missing
      : j.steps.every(x => x.done) && j.checked && j.checked.passed < j.checked.of ? { ...j, status: "waiting" as const, waiting: j.waiting ?? B("The checker found parts not done yet.", "检查发现仍有未完成的部分。") }
      : j.steps.every(x => x.done) ? { ...j, status: "done" as const }
      : { ...j, status: "waiting" as const, waiting: j.waiting ?? B("Odelia stopped here. Ask her to carry on.", "Odelia 停在这一步。请让她继续。") }) };
  };
}

/* ---- The proof loop: steps and done items with a check are ticked from the workspace, never by say-so ---- */

type Checklist = { id: string; label: Bi; state: string; dep?: string };
type AppLike = { id: string; name: Bi; status: string; checklist: Checklist[] };
type ApprovalLike = { id: string; title: Bi };
/** The parts of a workspace the proof loop reads. */
export type Evidence = { jobs?: Job[]; apps: AppLike[]; approvals: ApprovalLike[]; closed: ApprovalLike[] };

/** The checklist items a check still needs documents for. */
function missing(w: Evidence, c: StepCheck): Checklist[] {
  if (!c.app || !c.items?.length) return [];
  const app = w.apps.find(a => a.id === c.app);
  return (app?.checklist ?? []).filter(x => c.items!.includes(x.id) && x.state === "missing");
}

/** Whether the workspace shows this check as met. */
export function met(w: Evidence, c: StepCheck): boolean {
  if (missing(w, c).length) return false;
  if (c.approval && !w.approvals.some(a => a.id === c.approval) && !w.closed.some(a => a.id === c.approval)) return false;
  if (c.closed && !w.closed.some(a => a.id === c.closed)) return false;
  if (c.status?.length) { const app = w.apps.find(a => a.id === c.app); if (!app || !c.status.includes(app.status)) return false; }
  return true;
}

/** What has to happen next on a job, and who does it. */
export type NextAction =
  | { who: "you"; kind: "upload"; app: string; appName: Bi; items: { id: string; label: Bi }[] }
  | { who: "you"; kind: "approve"; id: string; title: Bi }
  | { who: "odelia"; step: Bi }
  | null;

export function nextAction(w: Evidence, job: Job): NextAction {
  if (job.status === "done" || job.status === "stopped") return null;
  const s = job.steps.find(x => !x.done);
  if (!s) return null;
  const c = s.check;
  if (c) {
    const need = missing(w, c);
    if (need.length) { const app = w.apps.find(a => a.id === c.app)!; return { who: "you", kind: "upload", app: app.id, appName: app.name, items: need.map(x => ({ id: x.id, label: x.label })) }; }
    if (c.closed) { const a = w.approvals.find(x => x.id === c.closed); if (a) return { who: "you", kind: "approve", id: a.id, title: a.title }; }
  }
  return { who: "odelia", step: s.title };
}

const sameJob = (a: Job, b: Job) => JSON.stringify(a) === JSON.stringify(b);
const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Brings each open job in line with the workspace: ticks the steps and done items the evidence proves, records the
 *  check, says what it waits on, and finishes the job only when every step is done and every done item is proven.
 *  Returns the same object when nothing changed, so it is safe to run after every edit. */
export function reconcile<W extends Evidence>(w: W, now = new Date().toISOString()): W {
  const jobs = w.jobs ?? [];
  if (!jobs.some(j => j.status !== "done" && j.status !== "stopped" && (j.steps.some(s => s.check) || j.done?.some(d => d.check)))) return w;
  let changed = false;
  const next = jobs.map(j => {
    if (j.status === "done" || j.status === "stopped") return j;
    if (!j.steps.some(s => s.check) && !j.done?.some(d => d.check)) return j;
    // a step with a check is done when its evidence is there; steps without one keep what the agent set
    const steps = j.steps.map(s => (s.check ? { ...s, done: met(w, s.check) } : s));
    const done = j.done?.map(d => (d.check ? { ...d, ok: met(w, d.check) } : d));
    let n: Job = { ...j, steps, ...(done ? { done } : {}) };
    const act = nextAction(w, n);
    const proven = (done ?? []).every(d => d.ok === true);
    if (steps.every(s => s.done) && proven) n = { ...n, status: "done", waiting: undefined };
    else if (act?.who === "you") n = { ...n, status: "waiting", waiting: act.kind === "upload"
      ? B(`${andList(act.items.map(i => i.label.en))} for the ${act.appName.en.toLowerCase()}.`, `${act.appName.zh}：${act.items.map(i => i.label.zh).join("、")}。`)
      : B(`Your approval: ${act.title.en}.`, `需要您批准：${act.title.zh}。`) };
    else if (j.status === "waiting" && act?.who === "odelia" && steps.some((s, i) => s.done !== j.steps[i].done)) n = { ...n, status: "running", waiting: undefined };
    if (done?.some(d => d.check)) {
      const passed = (done ?? []).filter(d => d.ok === true).length;
      if (!j.checked || j.checked.passed !== passed || j.checked.of !== done!.length) n = { ...n, checked: { at: now, passed, of: done!.length } };
    }
    if (sameJob(n, j)) return j;
    changed = true;
    // "updated" moves only when the work moved: a step, a done item or the status
    const moved = n.status !== j.status || n.steps.some((s, i) => s.done !== j.steps[i]?.done) || (n.done ?? []).some((d, i) => d.ok !== j.done?.[i]?.ok);
    return moved ? { ...n, updated: now } : n;
  });
  return changed ? { ...w, jobs: next } : w;
}

/** What Odelia is asked when someone tells her to carry on with a job. */
export const continuePrompt = (j: Job, lang: "en" | "zh") => lang === "zh"
  ? `继续这项工作，直到完成：“${j.title.zh}”（job ${j.id}）。按计划做下一步，做完后对照完成标准逐项核对。`
  : `Carry on with the job "${j.title.en}" (job ${j.id}) until it's done. Do the next step in its plan, then check the work against its done list.`;
