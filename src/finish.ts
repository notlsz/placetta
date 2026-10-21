import { B, type Bi } from "./bi";
import { audit } from "./core";
import { continuePrompt, jobApps, nextAction, proofMet, reconcile, STOPPED_HERE, type DoneFiling, type DoneReport, type Filed, type Job } from "./jobs";
import type { Application, Deadline, Workspace } from "./model";

/* ------------------------------------------------------------------ *
 * Finishing: a job runs until the work is done in the real world, not
 * until it's drafted.
 *   stampFilings     the filings table (what Placetta's team, its sending
 *                    and the agencies did) onto each application, so the
 *                    proof loop reads a confirmation number, a receipt or
 *                    the agency's approval from the record itself
 *   scheduleRenewals once the agency approves, the next renewal goes on
 *                    Deadlines (from the approval day and the agency's
 *                    published cycle), so the monitor starts it in time
 *   finishWork       the proof loop (src/jobs.ts reconcile) plus the two
 *                    above, and a report on each job the moment it's done:
 *                    what was filed, where, and the proof
 *   resumable        jobs Odelia stopped partway, which she picks back up
 *                    on her own (the monitor starts them each morning)
 * Pure functions: the app, the server's runs, the monitor and the tests
 * all call them.
 * ------------------------------------------------------------------ */

/** A filing as the filings table has it (newest first by approval). */
export type FilingRow = {
  app_id: string; status: string; confirmation_number?: string | null; receipt_path?: string | null; submitted_at?: string | null; decided_at?: string | null;
  channel?: string | null; note?: string | null; payment_url?: string | null; customer_paid_at?: string | null;
};

/** The same record, field by field: a saved workspace comes back from the database (jsonb) with its keys in another
 *  order, and that's no change. */
const FILED_KEYS: (keyof Filed)[] = ["status", "confirmation", "receipt", "submitted", "decided", "channel", "note", "pay"];
const sameFiled = (a: Filed | undefined, b: Filed) => !!a && FILED_KEYS.every(k => (a[k] ?? null) === (b[k] ?? null)) && Object.keys(a).every(k => FILED_KEYS.includes(k as keyof Filed));
const day = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);

/** Each application's latest filing (a canceled one doesn't count), as the record the proof loop reads. Returns the
 *  same workspace when nothing changed, so it's safe to run whenever the filings are read. */
export function stampFilings<W extends Workspace>(w: W, rows: FilingRow[]): W {
  const latest = new Map<string, FilingRow>();
  for (const r of rows) if (r && r.status !== "canceled" && !latest.has(r.app_id)) latest.set(r.app_id, r);
  let changed = false;
  const apps = w.apps.map(a => {
    const r = latest.get(a.id);
    if (!r) { if (!a.filed) return a; changed = true; const { filed: _f, ...rest } = a; void _f; return rest as Application; }
    const filed: Filed = {
      status: r.status,
      ...(r.confirmation_number ? { confirmation: String(r.confirmation_number).slice(0, 80) } : {}),
      ...(r.receipt_path ? { receipt: String(r.receipt_path).slice(0, 300) } : {}),
      ...(day(r.submitted_at) ? { submitted: day(r.submitted_at) } : {}),
      ...(day(r.decided_at) ? { decided: day(r.decided_at) } : {}),
      ...(r.channel ? { channel: r.channel } : {}),
      ...(r.note ? { note: String(r.note).slice(0, 300) } : {}),
      ...(r.status === "needs_info" && r.payment_url && !r.customer_paid_at ? { pay: true } : {}),
    };
    if (sameFiled(a.filed, filed)) return a;
    changed = true;
    return { ...a, filed };
  });
  return changed ? { ...w, apps } : w;
}

/* ------------------------------------------------------------------ renewals */

/** How often a permit renews, read from the agency's own published words ("Every year.", "Every 2 years.", "Every year
 *  by May 15."). Null for anything else ("Does not expire.", "by the tax return due date"): no date is made up. */
export type Cycle = { months: number } | { month: number; day: number };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10 };
export function renewalCycle(text: string | undefined): Cycle | null {
  const s = (text ?? "").trim().toLowerCase().replace(/[.。]+$/, "").replace(/\s+/g, " ");
  if (!s || /not expire|never expires|永久/.test(s)) return null;
  if (/^(renew |update |certify )?(every year|yearly|annually)( renewal)?$/.test(s) || /^每年(续期一次|续期|一次)?$/.test(s)) return { months: 12 };
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

const lower = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** The renewal on Deadlines for an application approved by the agency, when the agency publishes a cycle and the
 *  approval day is on record: one per approval, never in the past, never twice. The monitor starts the renewal 60 days
 *  out (supabase/functions/monitor renewalJobs). */
export function scheduleRenewals<W extends Workspace>(w: W, today: string): W {
  let n: W = w;
  for (const a of w.apps) {
    const decided = a.filed?.status === "accepted" ? a.filed.decided : undefined;
    if (!decided) continue;
    const c = renewalCycle(a.renews?.en) ?? renewalCycle(a.renews?.zh);
    if (!c) continue;
    const date = nextRenewal(decided, c);
    if (date < today || n.deadlines.some(d => d.kind === "renewal" && d.app === a.id && d.date > decided)) continue;
    const ag = a.agency;
    const dl: Deadline = {
      id: `renew-${a.id}-${date}`, date, kind: "renewal", app: a.id, agency: ag,
      title: B(`Renew the ${lower(a.name.en)}`, `续办${a.name.zh}`),
      ask: B("Start the renewal", "开始续办"),
      prompt: B(`Start the renewal of the ${lower(a.name.en)}, due ${date}. Find ${ag.en}'s renewal form or online renewal, prepare it, fill it from the workspace and put it up for my approval.`, `开始续办${a.name.zh}，${date} 到期。找到${ag.zh}的续办表格或网上续办入口，准备好并根据工作区资料填写，然后提交给我批准。`),
    };
    const withDl: W = { ...n, deadlines: [...n.deadlines, dl] };
    n = { ...withDl, audit: audit("agent", B("Put the next renewal on Deadlines", "已把下次续办加入截止日期"), a.name,
      B(`${date}: counted from ${ag.en}'s approval on ${decided} and its published cycle ("${a.renews!.en}")`, `${date}：按${ag.zh}于 ${decided} 的批准日期及其公布的周期（“${a.renews!.zh || a.renews!.en}”）推算`))(withDl).audit };
  }
  return n;
}

/* ------------------------------------------------------------------ the done report */

/** A receipt's file name from its stored path: the file function and the portal worker keep receipts as
 *  "<workspace>/receipts/<filing id>-<time>-<name>", and a person reads only the name. */
export const receiptName = (path: string) => (path.split("/").pop() ?? path).replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+-/i, "");

/** What a finished job filed, from the record: each application of the job's the agency has, with its proof. */
export function doneReport(w: Workspace, job: Job, at: string): DoneReport | null {
  const filed: DoneFiling[] = [];
  for (const id of jobApps(job)) {
    const a = w.apps.find(x => x.id === id);
    if (!a || !proofMet(w, id, "submitted")) continue;
    const issued = proofMet(w, id, "issued");
    // a receipt: the filing's own (by its stored path), or the application's
    const receipt = a.filed?.receipt ? (w.docs.find(d => d.path === a.filed!.receipt)?.name ?? receiptName(a.filed.receipt)) : a.receipt ? w.docs.find(d => d.id === a.receipt)?.name : undefined;
    filed.push({ app: a.id, name: a.name, agency: a.agency, stage: issued ? "issued" : "submitted",
      ...(a.filed?.confirmation ? { confirmation: a.filed.confirmation } : {}), ...(receipt ? { receipt } : {}),
      ...((issued ? a.filed?.decided : a.filed?.submitted) ? { date: issued ? a.filed!.decided : a.filed!.submitted } : {}),
      ...(a.filed?.channel ? { channel: a.filed.channel } : {}) });
  }
  return filed.length ? { at, filed } : null;
}

const CHANNEL: Record<string, Bi> = {
  email: B("by email", "通过邮件"), fax: B("by fax", "通过传真"), mail: B("by certified mail", "通过挂号信"), portal: B("on the agency's site", "在机构网站上"), team: B("by Placetta's filing team", "由快哉团队"),
};
/** The next renewal of an application as Deadlines has it, or the agency's published cycle when there's no date yet. */
export function renewalOf(w: Workspace, appId: string, today: string): { date?: string; cycle?: Bi } | null {
  const a = w.apps.find(x => x.id === appId);
  const d = w.deadlines.filter(x => x.kind === "renewal" && x.app === appId && x.date >= today).sort((x, y) => x.date.localeCompare(y.date))[0];
  if (d) return { date: d.date };
  if (a?.renews && !/not expire|永久/i.test(a.renews.en)) return { cycle: a.renews };
  return null;
}

/** The done report as lines for a person: what went where, the proof, and the next renewal. Empty for a job that
 *  filed nothing. */
export function reportLines(w: Workspace, job: Job, lang: "en" | "zh", today: string): string[] {
  const r = job.report;
  if (!r?.filed.length) return [];
  const t = (b: Bi) => b[lang] || b.en;
  return r.filed.map(f => {
    const proof = [f.confirmation && (lang === "zh" ? `确认号 ${f.confirmation}` : `confirmation ${f.confirmation}`), f.receipt && (lang === "zh" ? `回执 ${f.receipt}` : `receipt ${f.receipt}`)].filter(Boolean).join(lang === "zh" ? "，" : ", ");
    const how = f.channel && CHANNEL[f.channel] ? t(CHANNEL[f.channel]) : "";
    const rn = renewalOf(w, f.app, today);
    const renew = rn?.date ? (lang === "zh" ? `下次续办 ${rn.date}，已加入截止日期` : `next renewal ${rn.date}, on Deadlines`)
      : rn?.cycle ? (lang === "zh" ? `续办周期：${t(rn.cycle)}` : `renews: ${t(rn.cycle).replace(/\.$/, "").replace(/^./, c => c.toLowerCase())}`) : "";
    if (lang === "zh") return `${t(f.name)}：${f.stage === "issued" ? `${t(f.agency)}已批准` : `已${how}提交${t(f.agency)}`}${f.date ? `（${f.date}）` : ""}${proof ? `，${proof}` : ""}${renew ? `；${renew}` : ""}。`;
    return `${t(f.name)}: ${f.stage === "issued" ? `approved by ${t(f.agency)}` : `filed with ${t(f.agency)}${how ? ` ${how}` : ""}`}${f.date ? ` on ${f.date}` : ""}${proof ? `, ${proof}` : ""}${renew ? `; ${renew}` : ""}.`;
  });
}

/* ------------------------------------------------------------------ the whole pass */

/** Brings the workspace in line with what really happened: renewals for what the agencies approved, every open job
 *  checked against its proof (src/jobs.ts reconcile), and a report on each job the moment it's done (or once its proof
 *  arrives after a reviewer passed the rest). Returns the same workspace when nothing changed. */
export function finishWork<W extends Workspace>(w: W, now = new Date().toISOString()): W {
  const today = now.slice(0, 10);
  const n = reconcile(scheduleRenewals(w, today), now);
  const jobs = n.jobs ?? [];
  if (!jobs.some(j => j.status === "done" && !j.report && j.updated >= since(now))) return n;
  let changed = false;
  const next = jobs.map(j => {
    if (j.status !== "done" || j.report || j.updated < since(now)) return j;
    const r = doneReport(n, j, now);
    if (!r) return j;
    changed = true;
    return { ...j, report: r };
  });
  return changed ? { ...n, jobs: next } : n;
}
/** Reports are written for jobs finished in the last 30 days (older ones stay as they were). */
const since = (now: string) => new Date(Date.parse(now) - 30 * 864e5).toISOString();

/* ------------------------------------------------------------------ picking work back up */

/** How long a job sits before the monitor picks it back up: long enough that the person isn't mid-conversation. */
export const RESUME_AFTER_MS = 2 * 3600e3;
/** A run that left a job "running" this long ago died (the watchdog gave up on it): it's picked back up too. */
export const DEAD_RUN_MS = 6 * 3600e3;
/** Most times the monitor picks one job back up; after that it waits for the person. */
export const MAX_RESUMES = 3;

/** The jobs Odelia stopped partway and should pick back up on her own: hers to do next (not the person's, not an
 *  agency's), not a store's part (its own bot works it), not waiting on an owner's approval of its plan. With the
 *  prompt that carries on and a title for the Update. */
export function resumable(w: Workspace, now = Date.now(), lang: "en" | "zh" = "en"): { job: string; prompt: string; title: Bi }[] {
  const plans = new Set((w.controls?.plans ?? []).filter(p => p.state === "waiting").map(p => p.job));
  const out: { job: string; prompt: string; title: Bi }[] = [];
  for (const j of w.jobs ?? []) {
    if (j.parent || plans.has(j.id)) continue;
    const age = now - Date.parse(j.updated);
    const stopped = j.status === "waiting" && (j.on === "odelia" || (!j.on && j.waiting?.en === STOPPED_HERE.en)) && age >= RESUME_AFTER_MS;
    const dead = j.status === "running" && !j.children?.length && age >= DEAD_RUN_MS;
    if (!stopped && !dead) continue;
    if (nextAction(w, j)?.who !== "odelia") continue;
    out.push({ job: j.id, prompt: continuePrompt(j, lang), title: B(`Picked back up: ${j.title.en}`, `继续处理：${j.title.zh || j.title.en}`) });
  }
  return out;
}
