import { useState } from "react";
import { useApp } from "./ctx";
import { B } from "./bi";
import { fmtAgo, fmtDay } from "./time";
import { I } from "./ui";
import { cadence, nextRun, progress, type Job, type Routine } from "./jobs";
import { toolbox } from "./harness";

/* Work: everything Odelia is on, run like an engineer's tickets. Each job shows her plan and where it stands; what
   she needs from you comes first; what you gave her while she was busy waits in order; routines repeat on schedule. */

const today = () => new Date().toISOString().slice(0, 10);

/** One job's plan: the steps in order, the next one marked, done ones ticked. */
export function PlanCard({ job, compact }: { job: Job; compact?: boolean }) {
  const { b, lang, ws, openApp } = useApp();
  const p = progress(job), next = job.steps.findIndex(s => !s.done);
  const zh = lang === "zh";
  const state = job.status === "waiting" ? B("Waiting", "等待中") : job.status === "done" ? B("Done", "已完成") : job.status === "stopped" ? B("Stopped", "已停止") : B("In progress", "进行中");
  return (
    <section className={"job " + job.status + (compact ? " compact" : "")} aria-label={b(job.title)}>
      <header>
        <span className="job-t"><b>{b(job.title)}</b><small>{zh ? `${p.done}/${p.all} 步，${fmtAgo(job.updated, lang)}更新` : `${p.done} of ${p.all} steps, updated ${fmtAgo(job.updated, lang)}`}</small></span>
        <em className={"job-s " + job.status}>{b(state)}</em>
      </header>
      <span className="job-bar" aria-hidden="true"><i style={{ width: `${p.all ? (100 * p.done) / p.all : 0}%` }} /></span>
      <ol className="job-steps">
        {job.steps.map((s, i) => (
          <li key={i} className={s.done ? "done" : i === next && job.status !== "stopped" ? "now" : ""}>
            <span className="tick" aria-hidden="true">{s.done ? <I.check /> : null}</span>
            <span>{b(s.title)}</span>
          </li>
        ))}
      </ol>
      {job.status === "waiting" && job.waiting && <p className="job-need"><b>{zh ? "需要：" : "Needs: "}</b>{b(job.waiting)}</p>}
      {!compact && <Harness job={job} />}
      {!compact && job.apps?.length ? (
        <p className="job-apps">{job.apps.map(id => { const a = ws.apps.find(x => x.id === id); return a ? <button key={id} type="button" className="lnk" onClick={() => openApp(id)}>{b(a.name)}</button> : null; })}</p>
      ) : null}
    </section>
  );
}

/** The job's harness: what finished looks like and the checker's verdict on each, the playbook it follows, the files
 *  in its toolbox, and the handoffs between agents. */
function Harness({ job }: { job: Job }) {
  const { b, lang, ws } = useApp();
  const [open, setOpen] = useState(false);
  const zh = lang === "zh";
  const pb = job.playbook ? (ws.skills ?? []).find(s => s.id === job.playbook) : undefined;
  const files = toolbox(ws, job), hand = job.handoffs ?? [];
  if (!job.done?.length && !pb && !files.length && !hand.length) return null;
  const c = job.checked;
  const proof = c ? (c.passed === c.of ? (zh ? `独立检查：${c.of} 项全部完成` : `Checked by a separate reviewer: all ${c.of} done`) : (zh ? `独立检查：${c.of} 项中完成 ${c.passed} 项` : `Checked by a separate reviewer: ${c.passed} of ${c.of} done`))
    : job.done?.length ? (zh ? `完成标准 ${job.done.length} 项，完成后由独立检查核对` : `${job.done.length} things define done; a separate reviewer checks them at the end`) : "";
  return (
    <div className="hz">
      {proof && <p className={"hz-proof" + (c ? (c.passed === c.of ? " ok" : " short") : "")}>{!c || c.passed === c.of ? <I.check /> : null}<span>{proof}{c ? <small>{zh ? `，${fmtAgo(c.at, lang)}` : `, ${fmtAgo(c.at, lang)}`}</small> : null}</span></p>}
      <button type="button" className="lnk hz-tog" onClick={() => setOpen(v => !v)} aria-expanded={open}>{open ? (zh ? "收起" : "Hide") : (zh ? "查看完成标准、手册和交接" : "What done means, playbook and handoffs")}</button>
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
            <section><h3>{zh ? "交接" : "Handoffs"}</h3>
              <ol className="hz-hand">{hand.map((h, i) => <li key={i}><b>{zh ? `第 ${h.seat} 棒交给第 ${h.seat + 1} 棒` : `Seat ${h.seat} to seat ${h.seat + 1}`}</b><small>{fmtAgo(h.at, lang)}</small><p>{h.note}</p></li>)}</ol>
            </section>) : null}
        </div>
      )}
    </div>
  );
}

function RoutineRow({ r }: { r: Routine }) {
  const { b, lang, editWs } = useApp();
  const zh = lang === "zh", n = nextRun(r, today());
  const set = (f: (x: Routine) => Routine | null) => editWs(w => ({ ...w, routines: (w.routines ?? []).flatMap(x => (x.id === r.id ? (f(x) ? [f(x)!] : []) : [x])) }));
  return (
    <li className="row rt-row">
      <span className="lr-tx"><b>{b(r.title)}</b><small>{b(cadence(r))}{r.paused ? (zh ? "，已暂停" : ", paused") : n ? (zh ? `，下次 ${fmtDay(n, lang)}` : `, next ${fmtDay(n, lang)}`) : ""}{r.last ? (zh ? `，上次 ${fmtDay(r.last, lang)}` : `, last ${fmtDay(r.last, lang)}`) : ""}</small></span>
      <span className="rt-act">
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

export function WorkPage() {
  const { b, lang, ws, busy, live, ask, queued, unqueue } = useApp();
  const [showDone, setShowDone] = useState(false);
  const zh = lang === "zh";
  const jobs = ws.jobs ?? [], routines = ws.routines ?? [];
  const waiting = jobs.filter(j => j.status === "waiting"), running = jobs.filter(j => j.status === "running");
  const done = jobs.filter(j => j.status === "done" || j.status === "stopped");
  const empty = !jobs.length && !routines.length && !queued.length && !busy;
  return (
    <div className="page work">
      <header className="ph">
        <div className="ph-tx">
          <h1>{zh ? "工作" : "Work"}</h1>
          <p>{zh ? "Odelia 手上的每项工作：她的计划、进度，以及需要您提供什么。她可同时处理三项，更多的会排队接着做。" : "Every job Odelia is on: her plan, where it stands, and what she needs from you. She works on up to three at once; more wait their turn."}</p>
        </div>
      </header>

      {busy && live && <p className="work-now"><I.spark /><span>{zh ? "正在做：" : "Working now: "}{b(live.label)}…</span></p>}

      {waiting.length > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>{zh ? "需要您" : "Needs you"}<em>{waiting.length}</em></h2></div>
          {waiting.map(j => <PlanCard key={j.id} job={j} />)}
        </section>
      )}

      {running.length > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>{zh ? "进行中" : "In progress"}<em>{running.length}</em></h2></div>
          {running.map(j => <PlanCard key={j.id} job={j} />)}
        </section>
      )}

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
          {showDone && done.slice(0, 20).map(j => <PlanCard key={j.id} job={j} />)}
        </section>
      )}
    </div>
  );
}
