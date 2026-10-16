import { B, type Bi } from "./bi";

/* Odelia's work, run like an engineer's: each job she takes on has a plan she keeps current (Work, in the app), and
   routines are jobs the business asked her to repeat on a schedule. The monitor starts due routines each morning. */

export type JobStep = { title: Bi; done: boolean };
export type JobStatus = "running" | "waiting" | "done" | "stopped";
export type Job = {
  id: string; title: Bi; status: JobStatus; steps: JobStep[];
  waiting?: Bi;               // what she needs, and from whom, while it's waiting
  started: string; updated: string;   // ISO times
  apps?: string[];            // the applications this job is about
  routine?: string;           // started by this routine
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
      : j.steps.every(x => x.done) ? { ...j, status: "done" as const }
      : { ...j, status: "waiting" as const, waiting: j.waiting ?? B("Odelia stopped here. Ask her to carry on.", "Odelia 停在这一步。请让她继续。") }) };
  };
}
