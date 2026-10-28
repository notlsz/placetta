import { B, type Bi } from "./bi";

/* Odelia's work, run like an engineer's: each job she takes on has a plan she keeps current (Work, in the app), and
   routines are jobs the business asked her to repeat on a schedule. The monitor starts due routines each morning. */

/** What proves a step (or a done item) from the workspace itself, so nobody has to say it's done:
 *  - app + items: those checklist items on the application have their documents
 *  - approval: the approval has been put up (waiting, or already decided)
 *  - closed: the person approved it and it went out
 *  - status: the application has reached one of these statuses
 *  - jobs: those jobs are done and proven (a store's part of a job split across stores)
 *  - proof: the agency has the application (app): "submitted" with its confirmation number or receipt on file, or
 *    "issued" once it approved it. A filing approved by the person isn't done until then.
 *  Every condition given has to hold. */
export type StepCheck = { app?: string; items?: string[]; approval?: string; closed?: string; status?: string[]; jobs?: string[]; proof?: "submitted" | "issued" };
export type JobStep = { title: Bi; done: boolean; check?: StepCheck };
/** One line of what finished looks like, with the checker's verdict once it has looked. */
export type DoneItem = { text: Bi; ok?: boolean; why?: Bi; check?: StepCheck };
/** What a seat did and what's next, written when an agent hands the job to a fresh one. */
export type Handoff = { at: string; seat: number; note: string };
/** queued: a store's part waiting for a free hand (Odelia works a few jobs at once; the rest wait their turn). */
export type JobStatus = "queued" | "running" | "waiting" | "done" | "stopped";
/** Who a waiting job waits on: the person, the agency, Placetta's filing team, or Odelia herself (she stopped partway
 *  and picks it back up on her own). */
export type WaitOn = "you" | "agency" | "team" | "odelia";
/** One filing a finished job leaves on record: where it went and the proof the agency has it. */
export type DoneFiling = { app: string; name: Bi; agency: Bi; stage: "submitted" | "issued"; confirmation?: string; receipt?: string; date?: string; channel?: string };
/** What a finished job leaves behind, written the moment it's done (src/finish.ts). */
export type DoneReport = { at: string; filed: DoneFiling[] };
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
  // Store bots under a chief of staff (split_job in src/live.ts): a request across stores becomes one job per store,
  // each worked by that store's own bot on the server, side by side, and the main Odelia writes one summary at the end.
  parent?: string;            // the job this is one store's part of
  store?: string;             // the store whose bot works it
  children?: string[];        // the store jobs it was split into
  runs?: string[];            // the runs that worked it, oldest first: their moments are its replay (src/replay.ts)
  on?: WaitOn;                // while waiting: who it waits on
  report?: DoneReport;        // once done: what was filed and the proof
  // Odelia asked a Placetta specialist (ask_specialist, src/escalate.ts): the job waits on them until they answer, and
  // nothing the workspace shows moves it back to Odelia before then. The next plan she writes clears it.
  specialist?: { asked: string; due: string; question: string };
};
/** The main Odelia, as the bot on a replay's moments; a store's bot is its store id. */
export const MAIN_BOT = "odelia";
/** The most stores one split_job call takes. */
export const MAX_CHILDREN = 12;
/** The most store jobs one run starts, across its split_job calls: a 20-store franchise's renewal season is two splits in
 *  one request (12, then 8), not a second request. Each store job is its own run under the workspace's parallel cap,
 *  its own token cap and the allowance. */
export const MAX_RUN_CHILDREN = 48;
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

/** Done, and every line of what finished looks like proven (by the workspace, or by the separate reviewer). A done
 *  job whose list was never checked isn't proven. */
export const proven = (j: Job | undefined) => !!j && j.status === "done" && (j.done ?? []).every(d => d.ok === true) && (!j.checked || j.checked.passed === j.checked.of);

/** Where a job split across stores stands: its store jobs, and how many are proven, working, waiting their turn,
 *  waiting on the person, or stopped. */
export function family(w: { jobs?: Job[] }, parent: Job) {
  const kids = (parent.children ?? []).map(id => (w.jobs ?? []).find(j => j.id === id)).filter((j): j is Job => !!j);
  return {
    kids,
    all: (parent.children ?? []).length,
    done: kids.filter(proven).length,
    working: kids.filter(k => k.status === "running").length,
    queued: kids.filter(k => k.status === "queued").length,
    needs: kids.filter(k => (k.status === "waiting" && !awayWait(k)) || (k.status === "done" && !proven(k))).length,
    // with the agency or Placetta's filing team: nothing for the person to do
    away: kids.filter(awayWait).length,
    stopped: kids.filter(k => k.status === "stopped").length,
  };
}
/** Waiting on the agency or Placetta's filing team, not on the person. */
export const awayWait = (j: Job) => j.status === "waiting" && (j.on === "agency" || j.on === "team");
/** What a job that stopped partway says while it waits for Odelia to pick it back up. */
export const STOPPED_HERE = B("Odelia stopped here. Ask her to carry on.", "Odelia 停在这一步。请让她继续。");
/** The store a job is for: its own, or the store whose applications it's about (named on the job, or in what proves
 *  its steps). undefined for a job about the whole business. */
export function storeOf<S extends { id: string; apps?: string[] }>(stores: S[] | undefined, j: Job): S | undefined {
  const all = stores ?? [];
  if (j.store) return all.find(s => s.id === j.store);
  const apps = [...(j.apps ?? []), ...j.steps.map(s => s.check?.app), ...(j.done ?? []).map(d => d.check?.app)].filter((a): a is string => !!a);
  return apps.length ? all.find(s => s.apps?.some(a => apps.includes(a))) : undefined;
}

/** An application with the agency past its usual time: days it has waited, and the agency's usual days. The agency's
    time comes from its own published processing time; a week of grace before Placetta chases it. */
export function overdue(submittedAt: string | null | undefined, agencyDays: number | null, today: string): { waited: number; usual: number } | null {
  if (!submittedAt || !agencyDays) return null;
  const waited = Math.round((parse(today).getTime() - parse(submittedAt.slice(0, 10)).getTime()) / DAY);
  return waited > agencyDays + 7 ? { waited, usual: agencyDays } : null;
}

/** When a run ends, a job it left "running" isn't being worked on any more: done when every step is, otherwise it
    waits for the person to say carry on. Only jobs this run touched (updated since it started). A store's part is
    settled only by its own bot's run (o.child), and a job split across stores waits on its stores instead. */
export function settleJobs<W extends { jobs?: Job[] }>(since: string, o: { child?: string } = {}): (w: W) => W {
  const mine = (j: Job) => j.status === "running" && j.updated >= since && !j.children?.length && (o.child ? j.id === o.child : !j.parent);
  return w => {
    if (!(w.jobs ?? []).some(mine)) return w;
    return { ...w, jobs: (w.jobs ?? []).map(j => !mine(j) ? j
      // every step done, but the checker found the done list short: it waits, saying what's missing
      : j.steps.every(x => x.done) && j.checked && j.checked.passed < j.checked.of ? { ...j, status: "waiting" as const, waiting: j.waiting ?? B("The reviewer found parts not done yet.", "检查发现仍有未完成的部分。") }
      // every step done, but a filing on it isn't with the agency yet (no confirmation or receipt on file): it waits,
      // and the proof loop (reconcile) says on whom
      : j.steps.every(x => x.done) && (j.done ?? []).some(d => d.check?.proof && d.ok !== true) ? { ...j, status: "waiting" as const, on: "agency" as const, waiting: j.waiting ?? B("Done on Odelia's side. Waiting for the agency's confirmation.", "Odelia 这边已完成，等待机构确认。") }
      : j.steps.every(x => x.done) ? { ...j, status: "done" as const }
      // nothing named what it waits on: she stopped partway, and she's the one to pick it back up (the monitor does,
      // src/finish.ts resumable)
      : { ...j, status: "waiting" as const, ...(j.waiting ? {} : { on: "odelia" as const }), waiting: j.waiting ?? STOPPED_HERE }) };
  };
}

/* ---- The proof loop: steps and done items with a check are ticked from the workspace, never by say-so ---- */

type Checklist = { id: string; label: Bi; state: string; dep?: string };
/** What the agency side shows for an application's latest filing (src/finish.ts stampFilings writes it from the
 *  filings table): its status there, the confirmation number and receipt once they're on file, the days it was sent and
 *  decided, how it went, what the agency or the team noted, and whether a fee is waiting to be paid. */
export type Filed = { status: string; confirmation?: string; receipt?: string; submitted?: string; decided?: string; channel?: string; note?: string; pay?: boolean };
type AppLike = { id: string; name: Bi; status: string; checklist: Checklist[]; agency?: Bi; receipt?: string; filed?: Filed; next?: Bi };
type ApprovalLike = { id: string; title: Bi; kind?: string; app?: string; withdrawn?: unknown };
/** The parts of a workspace the proof loop reads. */
export type Evidence = { jobs?: Job[]; apps: AppLike[]; approvals: ApprovalLike[]; closed: ApprovalLike[]; stores?: { id: string; name: Bi }[] };

/** Where an application's filing stands with the agency:
 *  none      nothing put up to file yet
 *  approval  waiting for the person's approval
 *  team      approved; Placetta (its team, or its own sending) has it and hasn't reached the agency yet
 *  needs     the agency or the team needs something (a fee, a document, an answer)
 *  returned  the agency sent it back
 *  submitted the agency has it
 *  issued    the agency approved it */
export type FilingStage = "none" | "approval" | "team" | "needs" | "returned" | "submitted" | "issued";
export function stageOf(w: Pick<Evidence, "approvals" | "closed">, a: AppLike): FilingStage {
  switch (a.filed?.status) {
    case "accepted": return "issued";
    case "submitted": return "submitted";
    case "rejected": return "returned";
    case "needs_info": return "needs";
    case "requested": case "in_progress": return "team";
  }
  if (a.status === "approved") return "issued";
  if (a.status === "review") return "submitted";
  if (a.status === "filing") return "team";
  if (w.approvals.some(x => x.kind === "file" && x.app === a.id)) return "approval";
  // approved by the person (its card closed, not taken back): with Placetta until the record says otherwise
  return (w.closed ?? []).some(x => x.kind === "file" && x.app === a.id && !x.withdrawn) ? "team" : "none";
}
/** The agency has it, with proof: issued, or submitted with a confirmation number or a receipt on file. Never on
 *  anyone's say-so. */
export function proofMet(w: Evidence, appId: string, want: "submitted" | "issued"): boolean {
  const a = w.apps.find(x => x.id === appId);
  if (!a) return false;
  const s = stageOf(w, a);
  if (s === "issued") return true;
  return want === "submitted" && s === "submitted" && !!(a.filed?.confirmation || a.filed?.receipt || a.receipt);
}
/** A filing is under way for this application: put up for approval, approved, or with Placetta or the agency. */
export function inMotion(w: Evidence, appId: string): boolean {
  const a = w.apps.find(x => x.id === appId);
  return !!a && (!!a.filed || w.approvals.some(x => x.kind === "file" && x.app === appId) || w.closed.some(x => x.kind === "file" && x.app === appId && !x.withdrawn));
}
/** Every application a job is about: named on it, or in what proves its steps and its done list. */
export const jobApps = (j: Job) => [...new Set([...(j.apps ?? []), ...j.steps.map(s => s.check?.app), ...(j.done ?? []).map(d => d.check?.app)].filter((a): a is string => !!a))];
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
/** The line a filing adds to a job's done list: the agency has it, with proof. */
export const proofText = (name: Bi): Bi => B(`The agency has the ${lower(name.en)}, with its confirmation number or receipt on file`, `机构已收到${name.zh}，确认号或回执已存档`);

/** A job that files something isn't done when it's drafted, or when the person approves it: it's done when the agency
 *  has it. Every application of the job's with a filing under way gets that line on its done list, proven from the
 *  filing's own record (confirmation number, receipt or the agency's approval), never by the agent's word. Returns the
 *  same job when nothing was missing. A job split across stores gets it through its stores' parts. */
export function ensureProof(w: Evidence, j: Job): Job {
  if (j.children?.length || j.status === "done" || j.status === "stopped") return j;
  const add: DoneItem[] = [];
  for (const id of jobApps(j)) {
    if (!inMotion(w, id) || (j.done ?? []).some(d => d.check?.proof && d.check.app === id)) continue;
    const a = w.apps.find(x => x.id === id)!;
    add.push({ text: proofText(a.name), check: { app: id, proof: "submitted" } });
  }
  // (never cut short: a proof line that didn't fit would be added again on every pass)
  return add.length ? { ...j, done: [...(j.done ?? []), ...add] } : j;
}

/** What a filing waits on now, as the next action for a job whose proof it is. */
function waitOn(w: Evidence, appId: string): NextAction {
  const a = w.apps.find(x => x.id === appId);
  if (!a) return null;
  const nm = a.name, ag = a.agency ?? B("the agency", "机构");
  switch (stageOf(w, a)) {
    case "approval": { const ap = w.approvals.find(x => x.kind === "file" && x.app === a.id)!; return { who: "you", kind: "approve", id: ap.id, title: ap.title }; }
    case "none": return { who: "odelia", step: B(`Put the ${lower(nm.en)} up for your approval`, `把${nm.zh}提交给您批准`) };
    case "team": return { who: "team", app: a.id, appName: nm, line: B(`Placetta is sending the ${lower(nm.en)} to ${ag.en}. Done once its confirmation number or receipt is on file.`, `快哉正在向${ag.zh}提交${nm.zh}。确认号或回执存档后即完成。`) };
    case "submitted": return { who: "agency", app: a.id, appName: nm, line: B(`Sent to ${ag.en}. Done once its confirmation number or receipt is on file.`, `已提交${ag.zh}。确认号或回执存档后即完成。`) };
    case "needs": return { who: "you", kind: "answer", app: a.id, appName: nm, note: a.filed?.pay ? B(`Pay ${ag.en}'s fee for the ${lower(nm.en)}; the link is with your approvals. Placetta submits it right after.`, `支付${ag.zh}的${nm.zh}费用，付款链接在待批准事项中。付款后快哉随即提交。`)
      : a.filed?.note ? B(`${ag.en} asked about the ${lower(nm.en)}: ${a.filed.note}`, `${ag.zh}就${nm.zh}提出：${a.filed.note}`) : B(`${ag.en} needs more for the ${lower(nm.en)}.`, `${ag.zh}需要补充${nm.zh}的材料。`) };
    case "returned": return { who: "you", kind: "answer", app: a.id, appName: nm, note: a.filed?.note ? B(`${ag.en} returned the ${lower(nm.en)}: ${a.filed.note}`, `${ag.zh}退回了${nm.zh}：${a.filed.note}`) : B(`${ag.en} returned the ${lower(nm.en)}.`, `${ag.zh}退回了${nm.zh}。`) };
    default: return null;
  }
}

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
  if (c.jobs?.length && !c.jobs.every(id => proven((w.jobs ?? []).find(j => j.id === id)))) return false;
  if (c.proof && (!c.app || !proofMet(w, c.app, c.proof))) return false;
  return true;
}

/** What has to happen next on a job, and who does it. "answer": the agency (or a fee) needs the person; "team" and
 *  "agency": a filing is with Placetta's filing team or the agency, and nobody needs to do anything. */
export type NextAction =
  | { who: "you"; kind: "upload"; app: string; appName: Bi; items: { id: string; label: Bi }[] }
  | { who: "you"; kind: "approve"; id: string; title: Bi }
  | { who: "you"; kind: "answer"; app: string; appName: Bi; note: Bi }
  | { who: "team"; app: string; appName: Bi; line: Bi }
  | { who: "agency"; app: string; appName: Bi; line: Bi }
  | { who: "odelia"; step: Bi }
  | null;

export function nextAction(w: Evidence, job: Job): NextAction {
  if (job.status === "done" || job.status === "stopped") return null;
  if (job.children?.length) {
    // split across stores: while a store's bot works, or a store waits on the person (its own card says what for),
    // nothing moves this job but them; after that, the summary is Odelia's
    const f = family(w, job);
    if (f.working || f.queued || f.kids.some(k => k.status === "waiting")) return null;
    if (job.steps.every(x => x.done) && !(job.done ?? []).every(d => d.ok === true)) return { who: "odelia", step: B("Write one summary of every store", "汇总每家门店的结果") };
  }
  const s = job.steps.find(x => !x.done);
  if (!s) {
    // every step done: a filing the agency doesn't have yet is what it waits on; with the agency's proof in, what's left
    // is checking the work against its done list, which is Odelia's
    const pend = (job.done ?? []).find(d => d.check?.proof && d.check.app && !met(w, d.check));
    if (pend) return waitOn(w, pend.check!.app!);
    if (job.status === "waiting" && (job.done ?? []).some(d => d.ok !== true)) return { who: "odelia", step: B("Check the finished work against what done means", "对照完成标准核对已完成的工作") };
    return null;
  }
  const c = s.check;
  if (c) {
    const need = missing(w, c);
    if (need.length) { const app = w.apps.find(a => a.id === c.app)!; return { who: "you", kind: "upload", app: app.id, appName: app.name, items: need.map(x => ({ id: x.id, label: x.label })) }; }
    if (c.closed) { const a = w.approvals.find(x => x.id === c.closed); if (a) return { who: "you", kind: "approve", id: a.id, title: a.title }; }
    if (c.proof && c.app && !met(w, c)) return waitOn(w, c.app);
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
  const open = (j: Job) => j.status !== "done" && j.status !== "stopped";
  const checks = (j: Job) => j.steps.some(s => s.check) || !!j.done?.some(d => d.check);
  // a job with a filing under way and no proof line yet gets one (ensureProof), so it counts as having checks
  if (!jobs.some(j => open(j) && (checks(j) || j.children?.length || ensureProof(w, j) !== j))) return w;
  let changed = false;
  const one = (ev: Evidence, j0: Job): Job => {
    if (!open(j0)) return j0;
    const j = ensureProof(ev, j0);
    if (j !== j0) changed = true;
    if (!checks(j) && !j.children?.length) return j;
    // a step with a check is done when its evidence is there; steps without one keep what the agent set
    const steps = j.steps.map(s => (s.check ? { ...s, done: met(ev, s.check) } : s));
    const done = j.done?.map(d => (d.check ? { ...d, ok: met(ev, d.check) } : d));
    let n: Job = { ...j, steps, ...(done ? { done } : {}) };
    const allProven = (done ?? []).every(d => d.ok === true);
    if (j.children?.length) {
      // split across stores: done only when every store's part is done and proven, and so is its own list; working
      // while any store's bot works or waits its turn; waiting on the person when a store does
      const f = family(ev, n);
      const nameOf = (k: Job) => (ev.stores ?? []).find(s => s.id === k.store)?.name ?? k.title;
      if (steps.every(s => s.done) && allProven && f.done === f.all) n = { ...n, status: "done", waiting: undefined, on: undefined };
      else if (f.working || f.queued) n = { ...n, status: "running", waiting: undefined, on: undefined };
      else if (f.kids.some(k => k.status === "waiting" && !awayWait(k))) {
        const names = f.kids.filter(k => k.status === "waiting" && !awayWait(k)).map(nameOf);
        n = { ...n, status: "waiting", on: "you", waiting: B(`${andList(names.map(x => x.en))} ${names.length === 1 ? "needs you; its card says what for." : "need you; their cards say what for."}`, `${names.map(x => x.zh).join("、")}需要您处理，详见各自的卡片。`) };
      } else if (f.away) {
        // the rest are with the agencies: nothing for the person to do until each confirmation is on file
        const names = f.kids.filter(awayWait).map(nameOf);
        n = { ...n, status: "waiting", on: "agency", waiting: B(`${andList(names.map(x => x.en))}: with the agency. Done once each confirmation number or receipt is on file.`, `${names.map(x => x.zh).join("、")}：机构办理中。各项确认号或回执存档后即完成。`) };
      } else if (f.all && f.done === f.all) {
        // every store's part is proven; what's left is the one summary, checked like any other line
        n = { ...n, status: "waiting", on: "odelia", waiting: B("Every store is done and checked. One summary of them is next.", "每家门店都已完成并通过检查，接下来是一份汇总。") };
      }
    } else {
      const act = nextAction(ev, n);
      if (steps.every(s => s.done) && allProven) n = { ...n, status: "done", waiting: undefined, on: undefined };
      // with a Placetta specialist: it waits on them, whatever else moved
      else if (j.specialist && j.status === "waiting") n = { ...n, on: "team" };
      else if (act?.who === "you") n = { ...n, status: "waiting", on: "you", waiting: act.kind === "upload"
        ? B(`${andList(act.items.map(i => i.label.en))} for the ${act.appName.en.toLowerCase()}.`, `${act.appName.zh}：${act.items.map(i => i.label.zh).join("、")}。`)
        : act.kind === "answer" ? act.note
        : B(`Your approval: ${act.title.en}.`, `需要您批准：${act.title.zh}。`) };
      // a filing with Placetta's team or the agency: waiting, and on them, not on the person
      else if (act?.who === "team" || act?.who === "agency") n = { ...n, status: "waiting", on: act.who, waiting: act.line };
      else if (j.status === "waiting" && act?.who === "odelia" && steps.some((s, i) => s.done !== j.steps[i].done)) n = { ...n, status: "running", waiting: undefined, on: undefined };
      // the agency's proof came in (or the person did their part); checking the finished work is Odelia's, and she
      // picks it back up on her own
      else if (j.status === "waiting" && act?.who === "odelia" && j.on && j.on !== "odelia") n = { ...n, on: "odelia", waiting: B(`Ready for Odelia's last step: ${act.step.en.charAt(0).toLowerCase() + act.step.en.slice(1)}.`, `等待 Odelia 完成最后一步：${act.step.zh}。`) };
    }
    if (n.status !== "waiting" && n.on) n = { ...n, on: undefined };
    if (done?.some(d => d.check)) {
      const passed = (done ?? []).filter(d => d.ok === true).length;
      if (!j.checked || j.checked.passed !== passed || j.checked.of !== done!.length) n = { ...n, checked: { at: now, passed, of: done!.length } };
    }
    if (sameJob(n, j)) return j;
    changed = true;
    // "updated" moves only when the work moved: a step, a done item or the status
    const moved = n.status !== j.status || n.steps.some((s, i) => s.done !== j.steps[i]?.done) || (n.done ?? []).some((d, i) => d.ok !== j.done?.[i]?.ok);
    return moved ? { ...n, updated: now } : n;
  };
  // every store's part first, so a job split across stores sees them as they are now
  const first = jobs.map(j => (j.children?.length ? j : one(w, j)));
  const ev: Evidence = { ...w, jobs: first };
  const next = first.map(j => (j.children?.length ? one(ev, j) : j));
  return changed ? { ...w, jobs: next } : w;
}

/** What Odelia is asked when someone tells her to carry on with a job. */
export const continuePrompt = (j: Job, lang: "en" | "zh") => lang === "zh"
  ? `继续这项工作，直到完成：“${j.title.zh}”（job ${j.id}）。按计划做下一步，做完后对照完成标准逐项核对。`
  : `Carry on with the job "${j.title.en}" (job ${j.id}) until it's done. Do the next step in its plan, then check the work against its done list.`;

/** The files a job made or uses: its own, and its playbook's. */
export function toolbox(w: import("./model").Workspace, job: Job): { id: string; name: string }[] {
  const pb = job.playbook ? (w.skills ?? []).find(s => s.id === job.playbook) : undefined;
  const ids = [...new Set([...(job.files ?? []), ...(pb?.files ?? [])])];
  return ids.map(id => w.docs.find(d => d.id === id || d.name === id)).filter((d): d is NonNullable<typeof d> => !!d).map(d => ({ id: d.id, name: d.name }));
}
