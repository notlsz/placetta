import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./bi";
import type { Diff, Step } from "./core";
import { I, Sheet } from "./ui";
import { BotOf } from "./Bot";
import { MAIN_BOT } from "./jobs";
import { momentsFor, runsOf, type RunLog } from "./replay";
import * as api from "./cloud/api";

/* Watch how she did it: a job's replay, like a recording of an engineer's session. A player at the top (play, pause, a
   moment back or forward, and a scrubber over every moment); the moment it's on, in full: which bot, when, what it
   did, what it gave a tool and what came back, what changed in the workspace, the reviewer's verdict; and the whole
   timeline below, where any moment can be picked. Moments come from the runs that worked the job (src/replay.ts). */

const KIND: Record<string, Bi> = {
  tool: B("Used a tool", "使用工具"), approval: B("Put up for approval", "提交批准"), check: B("Reviewed", "独立检查"),
  shift: B("New shift", "换班"), split: B("Split across stores", "分给各门店"), reply: B("Answered", "回复"), step: B("Step", "步骤"),
};
const PLAY_MS = 1400;

/** When a moment happened, as a clock time ("2:41 PM", "14:41"), with the day when it isn't today (or never, for the
 *  timeline, which says the day once above each day's moments). */
function clock(at: string | undefined, lang: "en" | "zh", withDay = true) {
  if (!at) return "";
  const d = new Date(at);
  const t = d.toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", { hour: "numeric", minute: "2-digit" });
  return !withDay || new Date().toDateString() === d.toDateString() ? t : `${day(at, lang)} ${t}`;
}
/** The day a moment happened: "Today", or "Oct 16". */
function day(at: string | undefined, lang: "en" | "zh") {
  if (!at) return "";
  const d = new Date(at);
  if (new Date().toDateString() === d.toDateString()) return lang === "zh" ? "今天" : "Today";
  return d.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
}
/** How long the work took, from its first moment to its last. */
function span(ms: number, lang: "en" | "zh") {
  const m = Math.round(ms / 60000);
  if (m < 1) return lang === "zh" ? "不到 1 分钟" : "under a minute";
  if (m < 90) return lang === "zh" ? `${m} 分钟` : `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  if (h < 36) return lang === "zh" ? `${h} 小时` : `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return lang === "zh" ? `${d} 天` : `${d} days`;
}

/** The runs behind a job, read once: the browser's own log, and the server's runs for an account. */
function useLogs(jobId: string): RunLog[] | null {
  const { ws, cloud } = useApp();
  const job = (ws.jobs ?? []).find(j => j.id === jobId);
  const ids = job ? runsOf(ws, job).join(",") : "";
  const server = !!cloud && !api.PREVIEW && !!ids;
  const [remote, setRemote] = useState<{ ids: string; logs: RunLog[] } | null>(null);
  // while the job is still being worked, its new moments come in every few seconds
  const live = !!job && (job.status === "running" || job.status === "queued");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!server || !live) return;
    const t = window.setInterval(() => { if (document.visibilityState === "visible") setTick(n => n + 1); }, 6000);
    return () => window.clearInterval(t);
  }, [server, live]);
  useEffect(() => {
    if (!server) return;
    let on = true;
    api.runMoments(ids.split(",")).then(r => { if (on) setRemote({ ids, logs: r }); }, () => { if (on) setRemote(x => x?.ids === ids ? x : { ids, logs: [] }); });
    return () => { on = false; };
  }, [server, ids, tick]);
  if (!server) return ws.runLog ?? [];
  return remote?.ids === ids ? [...(ws.runLog ?? []), ...remote.logs] : null;
}

export function ReplayDrawer({ job: jobId, onClose }: { job: string; onClose: () => void }) {
  const { b, lang, ws } = useApp();
  const zh = lang === "zh";
  const job = (ws.jobs ?? []).find(j => j.id === jobId);
  const logs = useLogs(jobId);
  const moments = useMemo(() => (job && logs ? momentsFor(ws, job, logs) : []), [job, logs, ws]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const last = Math.max(0, moments.length - 1);
  const cur = moments[Math.min(at, last)];

  // play: a moment every 1.4 seconds, stopping at the end
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setAt(i => { if (i >= last) { setPlaying(false); return i; } return i + 1; }), PLAY_MS);
    return () => window.clearInterval(t);
  }, [playing, last]);
  // the moment it's on is always in view: back to the top of the drawer, where its card is, at each move
  useEffect(() => { body.current?.scrollTo?.({ top: 0 }); }, [at]);
  // arrow keys step, the space bar plays and pauses
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" && (e.target as HTMLInputElement).type !== "range") return;
      if (e.key === "ArrowRight") { e.preventDefault(); setPlaying(false); setAt(i => Math.min(last, i + 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setPlaying(false); setAt(i => Math.max(0, i - 1)); }
      else if (e.key === " " && (e.target as HTMLElement)?.tagName !== "BUTTON") { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [last]);

  if (!job) return null;
  const bots = [...new Set(moments.map(m => m.bot ?? MAIN_BOT))];
  const first = moments[0]?.at, end = moments[last]?.at;
  const took = first && end ? span(Date.parse(end) - Date.parse(first), lang) : "";
  const botName = (bot?: string): Bi => {
    if (!bot || bot === MAIN_BOT) return B("Odelia", "Odelia");
    const s = (ws.stores ?? []).find(x => x.id === bot);
    return s ? B(`${s.name.en}'s bot`, `${s.name.zh}的助手`) : B("A store's bot", "门店助手");
  };
  const meta = zh
    ? [`${moments.length} 个时刻`, took && `历时 ${took}`, bots.length > 1 && `${bots.length} 个助手`].filter(Boolean).join("，")
    : [`${moments.length} moment${moments.length === 1 ? "" : "s"}`, took && `over ${took}`, bots.length > 1 && `${bots.length} bots`].filter(Boolean).join(", ");
  const go = (i: number) => { setPlaying(false); setAt(Math.max(0, Math.min(last, i))); };

  return (
    <Sheet label={zh ? `她是怎么做的：${job.title.zh || job.title.en}` : `How she did it: ${job.title.en}`} onClose={onClose}>
      <header className="sh-h wb-h">
        <div className="sh-top">
          <span className="wb-kicker"><I.play />{zh ? "她是怎么做的" : "How she did it"}</span>
          <button type="button" className="icbtn close" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><I.x /></button>
        </div>
        <h2>{b(job.title)}</h2>
        {moments.length > 0 && <p className="wb-meta">{meta}</p>}
        {moments.length > 0 && (
          <div className="wb-player" role="group" aria-label={zh ? "回放控制" : "Replay controls"}>
            <button type="button" className="icbtn" onClick={() => go(at - 1)} disabled={at <= 0} aria-label={zh ? "上一个时刻" : "Back one moment"}><I.chevL /></button>
            <button type="button" className="wb-play" onClick={() => { if (at >= last) setAt(0); setPlaying(p => !p); }} aria-label={playing ? (zh ? "暂停" : "Pause") : (zh ? "播放" : "Play")} aria-pressed={playing}>
              {playing ? <I.pause /> : <I.play />}<span>{playing ? (zh ? "暂停" : "Pause") : at >= last && at > 0 ? (zh ? "重播" : "Replay") : (zh ? "播放" : "Play")}</span>
            </button>
            <button type="button" className="icbtn" onClick={() => go(at + 1)} disabled={at >= last} aria-label={zh ? "下一个时刻" : "Forward one moment"}><I.chevR /></button>
            <input className="wb-scrub" type="range" min={0} max={last} value={Math.min(at, last)} onChange={e => go(Number(e.target.value))}
              aria-label={zh ? "拖动查看每个时刻" : "Scrub through the moments"} aria-valuetext={cur ? b(cur.label) : ""} style={{ ["--pct" as string]: `${last ? (100 * at) / last : 100}%` }} />
            <span className="wb-pos">{zh ? `${Math.min(at, last) + 1}/${moments.length}` : `${Math.min(at, last) + 1} of ${moments.length}`}</span>
          </div>
        )}
      </header>
      <div className="sh-body wb-body" ref={body}>
        {logs === null ? <p className="quiet">{zh ? "正在载入…" : "Loading…"}</p>
          : !moments.length ? <p className="quiet">{zh ? "这项工作还没有可以回看的记录。Odelia 下次处理它时会记下每一步。" : "Nothing to watch back for this job yet. Odelia records every moment the next time she works on it."}</p>
          : <>
            {cur && <Moment m={cur} who={botName(cur.bot)} />}
            <h3 className="wb-h3">{zh ? "全部时刻" : "Every moment"}</h3>
            <ol className="wb-list">
              {moments.map((m, i) => {
                const newDay = i === 0 ? moments.length > 1 && day(m.at, lang) !== day(moments[last].at, lang) : day(m.at, lang) !== day(moments[i - 1].at, lang);
                return [
                  newDay ? <li key={"d" + i} className="wb-day" aria-hidden="true">{day(m.at, lang)}</li> : null,
                  <li key={i} className={(i === at ? "now" : i < at ? "past" : "next") + (m.ok === false ? " bad" : "") + (m.kind ? " k-" + m.kind : "")}>
                    <button type="button" onClick={() => go(i)} aria-current={i === at ? "step" : undefined}>
                      <span className="wb-time">{clock(m.at, lang, false)}</span>
                      <span className="wb-what"><b>{b(m.label)}</b>{bots.length > 1 && <small>{b(botName(m.bot))}</small>}</span>
                      {m.ok === false && <em className="wb-flag">{m.kind === "check" ? (zh ? "未通过" : "Not yet") : (zh ? "未成功" : "Didn't work")}</em>}
                    </button>
                  </li>,
                ];
              })}
            </ol>
          </>}
      </div>
    </Sheet>
  );
}

/** The moment the replay is on, in full. */
function Moment({ m, who }: { m: Step; who: Bi }) {
  const { b, lang } = useApp();
  const zh = lang === "zh";
  return (
    <article className={"wb-card" + (m.ok === false ? " bad" : "") + (m.kind ? " k-" + m.kind : "")} aria-live="polite">
      <header className="wb-card-h">
        <span className="wb-bot" aria-hidden="true"><BotOf bot={m.bot} size={34} label={b(who)} /></span>
        <span className="wb-who"><b>{b(who)}</b><small>{clock(m.at, lang)}</small></span>
        <em className="wb-kind">{b(KIND[m.kind ?? "step"])}</em>
      </header>
      <p className="wb-label">{b(m.label)}</p>
      {m.in && <p className="wb-io"><span>{zh ? "她提供的" : "What she gave it"}</span>{b(m.in)}</p>}
      {m.out && <p className={"wb-io" + (m.ok === false ? " bad" : "")}><span>{m.ok === false ? (zh ? "出了什么问题" : "What went wrong") : m.kind === "reply" ? (zh ? "她的回复" : "What she said") : (zh ? "返回的结果" : "What came back")}</span>{b(m.out)}</p>}
      {m.diff && <Changes d={m.diff} />}
      {m.items?.length ? (
        <ul className="hz-done wb-items">{m.items.map((x, i) => (
          <li key={i} className={x.ok ? "ok" : "no"}>
            <span className="mark" aria-label={x.ok ? (zh ? "已核对" : "Checked") : (zh ? "未完成" : "Not yet")}>{x.ok ? <I.check /> : <I.x />}</span>
            <span>{b(x.text)}{x.why && (x.why.en || x.why.zh) ? <small>{b(x.why)}</small> : null}</span>
          </li>))}
        </ul>
      ) : null}
    </article>
  );
}

/** What a moment changed in the workspace. */
function Changes({ d }: { d: Diff }) {
  const { b, lang } = useApp();
  const zh = lang === "zh";
  const blocks: { h: Bi; rows: React.ReactNode[] }[] = [
    { h: B("Lines filled", "填写的栏目"), rows: (d.fields ?? []).map((f, i) => <li key={i}><span className="wb-k">{b(f.label)}</span><span className="wb-v">{f.value}</span><small>{b(f.app)}</small></li>) },
    { h: B("Documents added", "新增的文件"), rows: (d.docs ?? []).map((x, i) => <li key={i}><span className="wb-v">{x}</span></li>) },
    { h: B("Put up for your approval", "提交给您批准"), rows: (d.approvals ?? []).map((x, i) => <li key={i}><span className="wb-v">{b(x)}</span></li>) },
    { h: B("Deadlines", "截止日期"), rows: (d.deadlines ?? []).map((x, i) => <li key={i}><span className="wb-k">{x.date}</span><span className="wb-v">{b(x.title)}</span></li>) },
    { h: B("Checklist items in", "已备齐的清单项"), rows: (d.items ?? []).map((x, i) => <li key={i}><span className="wb-v">{b(x.item)}</span><small>{b(x.app)}</small></li>) },
    { h: B("Stores added", "新增的门店"), rows: (d.stores ?? []).map((x, i) => <li key={i}><span className="wb-v">{b(x)}</span></li>) },
    { h: B("Business facts", "企业资料"), rows: (d.facts ?? []).map((x, i) => <li key={i}><span className="wb-k">{b(x.label)}</span><span className="wb-v">{x.value}</span></li>) },
    { h: B("Jobs started", "开始的工作"), rows: (d.jobs ?? []).map((x, i) => <li key={i}><span className="wb-v">{b(x)}</span></li>) },
  ].filter(x => x.rows.length);
  if (!blocks.length) return null;
  return (
    <div className="wb-diff">
      <p className="wb-diff-h">{zh ? "工作区里的变化" : "What changed in the workspace"}</p>
      {blocks.map((x, i) => <section key={i}><h4>{b(x.h)}</h4><ul>{x.rows}</ul></section>)}
      {d.more ? <p className="wb-more">{zh ? `还有 ${d.more} 处变化` : `and ${d.more} more`}</p> : null}
    </div>
  );
}
