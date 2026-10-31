import { useRef, useState } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./bi";
import { fmtAgo, fmtDay } from "./time";
import { I } from "./ui";
import { openSettings } from "./Settings";
import { LocalHold, useApprovalHold } from "./SendHold";
import { awayWait, cadence, continuePrompt, family, nextAction, nextRun, progress, proven, storeOf, type Job, type Routine } from "./jobs";
import { reportLines } from "./finish";
import { PREVIEW } from "./cloud/api";
import { toolbox } from "./jobs";
import { hasReplay } from "./replay";
import { AgentBot, StoreBot } from "./Bot";
import type { Approval, Store, Workspace } from "./model";
import { AskPerson, jobContext } from "./AskPerson";
import { AssignPicker, CommentsButton } from "./Comments";

/* Work: everything Odelia is on, run like an engineer's tickets, and grouped the way the business is: each store has
   its own bot working that store's jobs, and Odelia coordinates whatever spans stores, like a chief of staff over a
   team. Each job shows its plan and where it stands; what she needs from you comes first in every group; what you gave
   her while she was busy waits in order; routines repeat on schedule. Every job can be watched back, moment by moment. */

const today = () => new Date().toISOString().slice(0, 10);
const open = (j: Job) => j.status !== "done" && j.status !== "stopped";
const ORDER: Record<string, number> = { waiting: 0, running: 1, away: 2, queued: 3, done: 4, stopped: 5 };
/** A job's place in its group: what needs the person first, then what's moving, then what's with the agency. */
const rank = (j: Job) => ORDER[awayWait(j) ? "away" : j.status] ?? 6;
const byNeed = (a: Job, b: Job) => rank(a) - rank(b) || b.updated.localeCompare(a.updated);
/** "With the agency" or "With Placetta's team": a job waiting on a filing, not on the person. */
const awayLabel = (j: Job): Bi => (j.on === "team" ? B("With Placetta's team", "快哉团队办理中") : B("With the agency", "机构办理中"));
/** A job that's waiting, in the words its card shows: on the person, or on the agency. */
const needsYou = (j: Job) => j.status === "waiting" && !awayWait(j);

/** Where one store's part of a split job stands, in a word or two. */
function partState(k: Job): { key: string; label: Bi } {
  if (k.status === "queued") return { key: "queued", label: B("Waiting its turn", "排队中") };
  if (k.status === "running") return { key: "running", label: B("Working", "进行中") };
  if (awayWait(k)) return { key: "away", label: awayLabel(k) };
  if (k.status === "waiting") return { key: "waiting", label: B("Needs you", "需要您") };
  if (k.status === "stopped") return { key: "stopped", label: B("Stopped", "已停止") };
  return proven(k) ? { key: "done", label: B("Done and checked", "已完成并通过检查") } : { key: "unchecked", label: B("Done, not checked yet", "已完成，待检查") };
}

/** "Watch how she did it": opens the job's replay, when it has one. */
export function WatchLink({ job }: { job: Job }) {
  const { lang, ws, openReplay } = useApp();
  if (!hasReplay(ws, job)) return null;
  return <button type="button" className="lnk watch" onClick={() => openReplay(job.id)}><I.play />{lang === "zh" ? "看她是怎么做的" : "Watch how she did it"}</button>;
}

/** One job's plan: the steps in order, the next one marked, done ones ticked. */
/** actions: show the one button that moves the job now even on a compact card (Home, Needs you). */
export function PlanCard({ job, compact, actions, approve }: { job: Job; compact?: boolean; actions?: boolean; approve?: Approval }) {
  const { b, lang, ws, openApp } = useApp();
  const p = progress(job), next = job.steps.findIndex(s => !s.done);
  const zh = lang === "zh";
  const state = awayWait(job) ? awayLabel(job) : job.status === "waiting" ? B("Needs you", "需要您") : job.status === "done" ? B("Done", "已完成") : job.status === "stopped" ? B("Stopped", "已停止") : job.status === "queued" ? B("Waiting its turn", "排队中") : B("In progress", "进行中");
  const parent = job.parent ? (ws.jobs ?? []).find(j => j.id === job.parent) : undefined;
  return (
    <section className={"job " + job.status + (compact ? " compact" : "")} aria-label={b(job.title)}>
      <header>
        <span className="job-t"><b>{b(job.title)}</b><small>{zh ? `${p.done}/${p.all} 步，${fmtAgo(job.updated, lang)}更新` : `${p.done} of ${p.all} steps, updated ${fmtAgo(job.updated, lang).replace(/^Just/, "just")}`}</small></span>
        <em className={"job-s " + (awayWait(job) ? "away" : job.status)}>{b(state)}</em>
      </header>
      {parent && !compact && <p className="job-from">{zh ? `属于“${parent.title.zh || parent.title.en}”，由 Odelia 统筹` : `Part of “${parent.title.en}”, which Odelia coordinates`}</p>}
      {/* one segment a step, the same bar as Home and Stores (panels 3 and 7) */}
      <span className="job-bar segs" aria-hidden="true">{Array.from({ length: Math.max(p.all, 1) }, (_, i) => <i key={i} className={i < p.done ? "done" : ""} />)}</span>
      <ol className="job-steps">
        {job.steps.map((s, i) => (
          <li key={i} className={s.done ? "done" : i === next && job.status !== "stopped" ? "now" : ""}>
            <span className="tick" aria-hidden="true">{s.done ? <I.check /> : <em>{i + 1}</em>}</span>
            <span>{b(s.title)}</span>
          </li>
        ))}
      </ol>
      {job.status === "waiting" && job.waiting && !approve && <p className={"job-need" + (awayWait(job) ? " away" : "")}><b>{awayWait(job) ? (zh ? "进度：" : "Where it is: ") : zh ? "需要：" : "Needs: "}</b>{b(job.waiting)}</p>}
      {job.status === "done" && <DoneReport job={job} compact={compact} />}
      {(!compact || actions) && <JobActions job={job} />}
      {(needsYou(job) || (job.checked && job.checked.passed < job.checked.of && !awayWait(job))) && <AskPerson context={() => jobContext(job)} />}
      <Harness job={job} compact={compact} />
      {approve && <PlanApprove a={approve} />}
      {!compact && job.apps?.length ? (
        <p className="job-apps">{job.apps.map(id => { const a = ws.apps.find(x => x.id === id); return a ? <button key={id} type="button" className="lnk" onClick={() => openApp(id)}>{b(a.name)}</button> : null; })}</p>
      ) : null}
      {(!compact || hasReplay(ws, job)) && <div className="job-foot"><WatchLink job={job} />
        {/* Team review: who has this job, and its comments */}
        {!compact && <span className="job-team"><AssignPicker item={{ kind: "job", id: job.id }} title={job.title} compact /><CommentsButton item={{ kind: "job", id: job.id }} title={job.title} label /></span>}</div>}
    </section>
  );
}

/** The chief of staff's row: a job Odelia split across stores, with each store's bot and where its part stands. The
 *  job is done only when every store's part is done and checked. compact: Home's version, one line per store. */
export function ChiefRow({ job, compact }: { job: Job; compact?: boolean }) {
  const { b, lang, ws, busy, ask, stopJob } = useApp();
  const zh = lang === "zh";
  const f = family(ws, job);
  const act = nextAction(ws, job);
  const state = job.status === "done" ? B("Done", "已完成") : job.status === "stopped" ? B("Stopped", "已停止") : awayWait(job) ? awayLabel(job) : job.status === "waiting" ? B("Needs you", "需要您") : B("In progress", "进行中");
  const name = (k: Job): Bi => storeOf(ws.stores, k)?.name ?? k.title;
  return (
    <section className={"cos " + job.status + (compact ? " compact" : "")} aria-label={b(job.title)}>
      <header className="cos-h">
        <span className="cos-bot" aria-hidden="true"><AgentBot size={compact ? 30 : 38} busy={f.working > 0} interactive={false} /></span>
        <span className="cos-t">
          <small>{zh ? `Odelia 统筹 ${f.all} 家门店` : `Odelia, coordinating ${f.all} store${f.all === 1 ? "" : "s"}`}</small>
          <b>{b(job.title)}</b>
        </span>
        <em className={"job-s " + (awayWait(job) ? "away" : job.status)}>{b(state)}</em>
      </header>
      <div className="cos-prog">
        <span className="job-bar" aria-hidden="true"><i style={{ width: `${f.all ? (100 * f.done) / f.all : 0}%` }} /></span>
        <span className="cos-n">{zh ? `${f.all} 家门店中 ${f.done} 家已完成` : `${f.done} of ${f.all} stores done`}</span>
      </div>
      <ul className="cos-kids">
        {f.kids.map(k => {
          const s = partState(k), p = progress(k);
          return (
            <li key={k.id} className={"cos-kid " + s.key}>
              <span className="kid-bot" aria-hidden="true"><StoreBot id={k.store ?? k.id} size={compact ? 22 : 28} label={b(name(k))} busy={k.status === "running"} /></span>
              <span className="kid-tx">
                <b>{b(name(k))}</b>
                {!compact && <small>{k.status === "waiting" && k.waiting ? b(k.waiting) : zh ? `已完成 ${p.done}/${p.all} 步` : `${p.done} of ${p.all} steps`}</small>}
              </span>
              <em className={"kid-s " + s.key}>{b(s.label)}</em>
            </li>
          );
        })}
      </ul>
      {!compact && (
        <div className="job-act">
          {act?.who === "odelia" && <button type="button" className="sbtn ink" disabled={busy} onClick={() => ask(continuePrompt(job, lang))}><I.spark />{zh ? "让 Odelia 写汇总" : "Have Odelia write the summary"}</button>}
          <WatchLink job={job} />
          {open(job) && <button type="button" className="lnk quiet" onClick={() => stopJob(job.id)}>{zh ? "停止所有门店的这项工作" : "Stop it at every store"}</button>}
        </div>
      )}
      {compact && <div className="job-foot"><WatchLink job={job} /></div>}
    </section>
  );
}

/** One store's group: its bot, and the jobs it's working there, what needs you first. */
function StoreGroup({ store, jobs }: { store?: Store; jobs: Job[] }) {
  const { b, lang } = useApp();
  const zh = lang === "zh";
  const needs = jobs.filter(needsYou).length, working = jobs.filter(j => j.status === "running").length, queued = jobs.filter(j => j.status === "queued").length;
  const line = [needs ? (zh ? `${needs} 项需要您` : `${needs} need${needs === 1 ? "s" : ""} you`) : "", working ? (zh ? `${working} 项进行中` : `${working} working`) : "", queued ? (zh ? `${queued} 项排队中` : `${queued} waiting their turn`) : ""].filter(Boolean).join(zh ? "，" : ", ");
  const title = store ? b(store.name) : zh ? "整个企业" : "Whole business";
  return (
    <section className="sec bot-group" aria-label={title}>
      <div className="sec-h bot-h">
        <h2>
          <span className="bot-ico" aria-hidden="true">{store ? <StoreBot id={store.id} size={30} label={title} busy={working > 0} /> : <AgentBot size={30} busy={working > 0} interactive={false} />}</span>
          <span className="bot-name"><span>{title}</span><small>{store ? (zh ? "这家店的助手" : "This store's bot") : (zh ? "Odelia 本人" : "Odelia herself")}{line ? (zh ? `：${line}` : `: ${line}`) : ""}</small></span>
        </h2>
      </div>
      {jobs.map(j => <PlanCard key={j.id} job={j} />)}
    </section>
  );
}

/** The open jobs, grouped by store, groups that need you first. Jobs that span stores (and their parts) aren't here:
 *  the chief of staff's rows carry them, and each part shows under its own store. */
function groupsOf(ws: Workspace, jobs: Job[]) {
  const stores = ws.stores ?? [];
  const groups = stores.map(s => ({ store: s as Store | undefined, jobs: jobs.filter(j => !j.children?.length && storeOf(stores, j)?.id === s.id).sort(byNeed) }));
  groups.push({ store: undefined, jobs: jobs.filter(j => !j.children?.length && !storeOf(stores, j)).sort(byNeed) });
  return groups.filter(g => g.jobs.length).sort((x, y) => Number(y.jobs.some(needsYou)) - Number(x.jobs.some(needsYou)));
}

/** The one thing that moves this job forward now: your upload, your approval, or Odelia carrying on. Nothing here
 *  ticks a step by hand; steps tick when the workspace shows the work (src/jobs.ts, reconcile). */
export function JobActions({ job }: { job: Job }) {
  const { lang, ws, busy, ask, upload, openApproval, openApp, stopJob, cloud } = useApp();
  const zh = lang === "zh";
  const pick = useRef<HTMLInputElement>(null);
  const [item, setItem] = useState<{ app: string; id: string } | null>(null);
  const act = nextAction(ws, job);
  if (!act) return null;
  const stop = () => stopJob(job.id);
  const sample = !cloud || PREVIEW;
  return (
    <div className="job-act">
      {act.who === "you" && act.kind === "upload" && (
        <>
          <input ref={pick} type="file" hidden multiple onChange={e => { const f = [...(e.target.files ?? [])]; if (item && f.length) upload(item.app, item.id, f); e.target.value = ""; }} />
          {act.items.slice(0, 3).map(i => (
            <button key={i.id} type="button" className="sbtn ink" disabled={busy} onClick={() => { setItem({ app: act.app, id: i.id }); pick.current?.click(); }}>
              <I.upload />{zh ? `上传${i.label.zh}` : `Upload ${/^[A-Z][a-z]/.test(i.label.en) ? i.label.en.charAt(0).toLowerCase() + i.label.en.slice(1) : i.label.en}`}
            </button>
          ))}
          {sample && <button type="button" className="sbtn line" disabled={busy} onClick={() => upload(act.app, act.items[0].id)}>{zh ? "用示例文件" : "Use a sample file"}</button>}
        </>
      )}
      {act.who === "you" && act.kind === "approve" && (
        <button type="button" className="sbtn ink" onClick={() => openApproval(act.id)}><I.check />{zh ? "查看并批准" : "Review and approve"}</button>
      )}
      {act.who === "you" && act.kind === "answer" && (
        <button type="button" className="sbtn ink" onClick={() => openApp(act.app)}><I.chevR />{zh ? `打开${act.appName.zh}` : `Open the ${act.appName.en.charAt(0).toLowerCase() + act.appName.en.slice(1)}`}</button>
      )}
      {(act.who === "team" || act.who === "agency") && <span className="job-bot-on">{zh ? "您现在无需处理，确认号或回执存档后自动完成" : "Nothing for you to do. It finishes on its own once the confirmation is on file"}</span>}
      {act.who === "odelia" && (job.parent && (job.status === "running" || job.status === "queued")
        // a store's part its bot is working (or about to): nothing to ask, it says so
        ? <span className="job-bot-on">{job.status === "queued" ? (zh ? "这家店的助手排队中，轮到时开始" : "This store's bot starts when a hand is free") : (zh ? "这家店的助手正在处理" : "This store's bot is on it")}</span>
        : <button type="button" className="sbtn ink" disabled={busy} onClick={() => ask(continuePrompt(job, lang))}>
          <I.spark />{busy ? (zh ? "Odelia 正在工作" : "Odelia is working") : zh ? "让 Odelia 继续" : "Have Odelia carry on"}
        </button>)}
      <button type="button" className="lnk quiet" onClick={stop}>{zh ? "停止这项工作" : "Stop this job"}</button>
    </div>
  );
}

/** What a finished job leaves behind: each filing, where it went, its proof, and the next renewal. */
function DoneReport({ job, compact }: { job: Job; compact?: boolean }) {
  const { lang, ws } = useApp();
  const lines = reportLines(ws, job, lang, today());
  if (!lines.length) return null;
  const zh = lang === "zh";
  return (
    <div className="job-report" aria-label={zh ? "完成报告" : "What was filed"}>
      <h3>{zh ? "已办好" : "What was filed"}</h3>
      <ul>{(compact ? lines.slice(0, 2) : lines).map((l, i) => <li key={i}><I.check /><span>{l}</span></li>)}</ul>
    </div>
  );
}

/** How she checks her work: what finished looks like and the reviewer's verdict on each, the playbook it follows,
 *  the files in its toolbox, and the notes left between shifts. */
function Harness({ job, compact }: { job: Job; compact?: boolean }) {
  const { b, lang, ws } = useApp();
  const [open, setOpen] = useState(false);
  const zh = lang === "zh";
  const pb = job.playbook ? (ws.skills ?? []).find(s => s.id === job.playbook) : undefined;
  const files = toolbox(ws, job), hand = job.handoffs ?? [];
  if (!job.done?.length && !pb && !files.length && !hand.length) return null;
  const c = job.checked;
  const proof = c ? (c.passed === c.of ? (zh ? `独立检查：${c.of} 项全部完成` : `Checked by a separate reviewer: all ${c.of} done`) : c.passed === 0 && job.status !== "done" && job.status !== "stopped" ? (zh ? "完成前会再由独立检查核对一遍" : "A second check runs before it counts as done") : (zh ? `独立检查：${c.of} 项中完成 ${c.passed} 项` : `Checked by a separate reviewer: ${c.passed} of ${c.of} done`))
    : job.done?.length ? (zh ? `完成标准 ${job.done.length} 项，完成后由独立检查核对` : `${job.done.length} things define done; a separate reviewer checks them at the end`) : "";
  // a check still short on a job that's under way is pending, not a warning; short on a finished job is the warning
  const short = job.status === "done" || job.status === "stopped" ? " short" : " pending";
  if (compact) return c ? <div className="hz"><p className={"hz-proof" + (c.passed === c.of ? " ok" : short)}>{c.passed === c.of ? <I.check /> : <I.shield />}<span>{proof}</span></p></div> : null;
  return (
    <div className="hz">
      {proof && <p className={"hz-proof" + (c ? (c.passed === c.of ? " ok" : short) : "")}>{!c || c.passed === c.of ? <I.check /> : null}<span>{proof}{c ? <small>{zh ? `，${fmtAgo(c.at, lang)}` : `, ${fmtAgo(c.at, lang)}`}</small> : null}</span></p>}
      <button type="button" className="lnk hz-tog" onClick={() => setOpen(v => !v)} aria-expanded={open}>{open ? (zh ? "收起" : "Hide") : (zh ? "她如何检查自己的工作" : "How she checks her work")}</button>
      {open && (
        <div className="hz-body">
          {job.done?.length ? (
            <section><h3>{zh ? "完成标准" : "Done means"}</h3>
              <ul className="hz-done">{job.done.map((d, i) => (
                <li key={i} className={d.ok === true ? "ok" : d.ok === false ? "no" : ""}>
                  <span className="mark" aria-label={d.ok === true ? (zh ? "已核对" : "Checked") : d.ok === false ? (zh ? "未完成" : "Not yet") : (zh ? "未检查" : "Not checked yet")}>{d.ok === true ? <I.check /> : d.ok === false ? <I.x /> : null}</span>
                  <span>{b(d.text)}{d.why && (d.why.en || d.why.zh) ? <small>{b(d.why)}</small> : null}</span>
                </li>))}
              </ul>
            </section>) : null}
          {pb && <section><h3>{zh ? "手册" : "Playbook"}</h3><p>{b(pb.name)}{pb.interviewed ? <small>{zh ? "根据您的回答编写" : "Written from your answers"}</small> : null}</p></section>}
          {files.length ? <section><h3>{zh ? "工具箱" : "Toolbox"}</h3><p className="hz-files">{files.map(f => <span key={f.id}>{f.name}</span>)}</p></section> : null}
          {hand.length ? (
            <section><h3>{zh ? "班次之间的备注" : "Notes between shifts"}</h3>
              <ol className="hz-hand">{hand.map((h, i) => <li key={i}><b>{zh ? `第 ${h.seat} 班交给第 ${h.seat + 1} 班` : `Shift ${h.seat} to shift ${h.seat + 1}`}</b><small>{fmtAgo(h.at, lang)}</small><p>{h.note}</p></li>)}</ol>
            </section>) : null}
        </div>
      )}
    </div>
  );
}

function RoutineRow({ r }: { r: Routine }) {
  const { b, lang, editWs, ask, busy } = useApp();
  const zh = lang === "zh", n = nextRun(r, today());
  const set = (f: (x: Routine) => Routine | null) => editWs(w => ({ ...w, routines: (w.routines ?? []).flatMap(x => (x.id === r.id ? (f(x) ? [f(x)!] : []) : [x])) }));
  return (
    <li className="row rt-row">
      <span className="lr-tx"><b>{b(r.title)}</b><small>{b(cadence(r))}{r.paused ? (zh ? "，已暂停" : ", paused") : n ? (zh ? `，下次 ${fmtDay(n, lang)}` : `, next ${fmtDay(n, lang)}`) : ""}{r.last ? (zh ? `，上次 ${fmtDay(r.last, lang)}` : `, last ${fmtDay(r.last, lang)}`) : ""}</small></span>
      <span className="rt-act">
        <button type="button" className="lnk" disabled={busy} onClick={() => { set(x => ({ ...x, last: today() })); ask(r.prompt); }}>{zh ? "立即运行" : "Run now"}</button>
        <button type="button" className="lnk" onClick={() => set(x => ({ ...x, paused: !x.paused }))}>{r.paused ? (zh ? "恢复" : "Resume") : zh ? "暂停" : "Pause"}</button>
        <button type="button" className="lnk quiet" onClick={() => set(() => null)}>{zh ? "删除" : "Remove"}</button>
      </span>
    </li>
  );
}

const STARTERS = [
  B("Map every permit our next store needs, prepare each one and set the deadlines.", "梳理下一家门店需要的全部许可，逐项准备并设好截止日期。"),
  B("Get our open store ready for its next health inspection.", "让已开业门店为下一次卫生检查做好准备。"),
  B("Every Monday, check each filing that's with an agency and tell me only what changed.", "每周一检查在审的每项申请，只告诉我有变化的。"),
];

/** The Work tab of Odelia's page (App renders the page shell and the tab strip). */
export function WorkPage() {
  const { b, lang, ws, busy, live, ask, queued, unqueue, go } = useApp();
  const [showDone, setShowDone] = useState(false);
  const zh = lang === "zh";
  const jobs = ws.jobs ?? [], routines = ws.routines ?? [];
  const live_ = jobs.filter(open);
  const chiefs = live_.filter(j => j.children?.length);
  const groups = groupsOf(ws, live_);
  const done = jobs.filter(j => !open(j) && !j.parent);
  const empty = !jobs.length && !routines.length && !queued.length && !busy;
  return (
    <div className="work tabbed">
      <p className="tab-lede">{zh ? "Odelia 手上的每项工作，按门店分组。每项都可以回看。" : "Every job Odelia is on, by store. Watch back any of them."}</p>
      {/* Muse's avatar opens its activity log and the permissions you've approved: the same two, one tap from her work */}
      <nav className="wk-trust" aria-label={zh ? "她做过什么，她可以做什么" : "What she did, what she may do"}>
        <button type="button" className="lnk" onClick={() => openSettings(go, "activity")}>{zh ? "她做过的每件事" : "Everything she's done"}<I.chevR /></button>
        <button type="button" className="lnk" onClick={() => openSettings(go, "approvals")}>{zh ? "她不用问就能做的事" : "What she may do without asking"}<I.chevR /></button>
      </nav>

      {busy && live && <p className="work-now"><I.spark /><span>{zh ? "正在做：" : "Working now: "}{b(live.label)}…</span></p>}

      {chiefs.length > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>{zh ? "跨门店的工作" : "Across your stores"}<em>{chiefs.length}</em></h2></div>
          {chiefs.map(j => <ChiefRow key={j.id} job={j} />)}
        </section>
      )}

      {groups.map(g => <StoreGroup key={g.store?.id ?? "business"} store={g.store} jobs={g.jobs} />)}

      {queued.length > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>{zh ? "接下来" : "Up next"}<em>{queued.length}</em></h2></div>
          <ol className="tray q-list">
            {queued.map((q, i) => (
              <li key={q.id} className="row">
                <span className="q-n">{i + 1}</span>
                <span className="lr-tx"><b>{q.text}</b></span>
                <button type="button" className="icbtn" onClick={() => unqueue(q.id)} aria-label={zh ? "移除" : "Remove"}><I.x /></button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="sec">
        <div className="sec-h"><h2>{zh ? "例行任务" : "Routines"}{routines.length ? <em>{routines.length}</em> : null}</h2></div>
        {routines.length ? <ul className="tray">{routines.map(r => <RoutineRow key={r.id} r={r} />)}</ul>
          : <p className="quiet">{zh ? "告诉 Odelia 要定期做什么，例如“每周一检查在审的申请”，她会按时在后台完成并告诉您变化。" : "Tell Odelia what to do on a schedule, like \"every Monday, check the filings with agencies\", and she runs it in the background and tells you what changed."}</p>}
      </section>

      {empty && (
        <section className="sec">
          <div className="sec-h"><h2>{zh ? "交给 Odelia" : "Hand Odelia a job"}</h2></div>
          <div className="starters">{STARTERS.map((s, i) => <button key={i} type="button" className="starter" onClick={() => ask(b(s))}><span>{b(s)}</span><I.arrow /></button>)}</div>
        </section>
      )}

      {done.length > 0 && (
        <section className="sec">
          <button type="button" className="sec-h tog" onClick={() => setShowDone(v => !v)} aria-expanded={showDone}><h2>{zh ? "已完成" : "Done"}<em>{done.length}</em></h2><span className={showDone ? "up" : ""}><I.chev /></span></button>
          {showDone && done.slice(0, 20).map(j => (j.children?.length ? <ChiefRow key={j.id} job={j} /> : <PlanCard key={j.id} job={j} />))}
        </section>
      )}
    </div>
  );
}

/** The approval a plan waits on, inside the plan's own card (Jobs, Ive: one card, the task said once): just the button,
 *  or the undo window once approved. */
function PlanApprove({ a }: { a: Approval }) {
  const { lang, busy, openApproval } = useApp();
  const hold = useApprovalHold(a.id);
  return <div className="job-approve">{hold ? <LocalHold hold={hold} compact /> : <button type="button" className="pill ink sm" onClick={() => openApproval(a.id)} disabled={busy}><span>{lang === "zh" ? "查看并批准" : "Review and approve"}</span><i aria-hidden="true"><I.arrow /></i></button>}</div>;
}
