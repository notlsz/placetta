import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../ctx";
import { B, type Bi } from "../model";
import { fmtAgo, fmtDay } from "../time";
import { I, Modal } from "../ui";
import type * as api from "./api";
import * as ops from "./opsApi";
import * as pa from "./partnersApi";
import { KIND as PARTNER_KIND } from "../Partner";
import "../ode.css";

/* The team's pages beside the filing queue (src/cloud/Ops.tsx): the specialist review queue with its one-business-day
   target, Agent health (how Odelia runs: speed, first-try checks, tool errors, cost by vendor and model, saver mode,
   throttles, the slowest and most expensive runs with a replay of each, and the weekly summaries), partners (approve,
   set the share, record payouts) and the incident log. Each opens at /app/queue/<tab>. */

export type OpsTab = "filings" | "reviews" | "health" | "partners" | "incidents";
const TABS: { id: OpsTab; label: Bi }[] = [
  { id: "filings", label: B("Filing queue", "申报队列") }, { id: "reviews", label: B("Review queue", "审核队列") },
  { id: "health", label: B("Agent health", "Agent 健康") }, { id: "partners", label: B("Partners", "合作伙伴") }, { id: "incidents", label: B("Incident log", "事件记录") },
];
export const useOpsTab = (): OpsTab => { const { sub } = useApp(); return TABS.some(t => t.id === sub) ? (sub as OpsTab) : "filings"; };

export function OpsTabs({ tab }: { tab: OpsTab }) {
  const { b, go } = useApp();
  return (
    <div className="seg tabs ops-tabs" role="tablist" data-hscroll>
      {TABS.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => go("queue", t.id === "filings" ? undefined : t.id)}>{b(t.label)}</button>)}
    </div>
  );
}

const usd = (n: number | null | undefined, d = 2) => (n == null ? "-" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 4) }));
const pct = (n: number | null | undefined) => (n == null ? "-" : `${n}%`);
/** Seconds as people say them: 3.2s, 41s, 3m 10s. */
export function dur(s: number | null | undefined): string {
  if (s == null) return "-";
  if (s < 10) return `${Number(s).toFixed(1)}s`;
  if (s < 90) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : r ? `${m}m ${r}s` : `${m}m`;
}
const stamp = (iso: string, zh: boolean) => new Date(iso).toLocaleString(zh ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The page around each tab: its own title and the tab strip. */
function Frame({ tab, title, sub, children, act }: { tab: OpsTab; title: Bi; sub: Bi; children: React.ReactNode; act?: React.ReactNode }) {
  const { b } = useApp();
  return (
    <div className="page queue ops-more">
      <header className="ph"><div className="ph-tx"><h1>{b(title)}</h1><p>{b(sub)}</p></div>{act && <div className="ph-acts">{act}</div>}</header>
      <OpsTabs tab={tab} />
      {children}
    </div>
  );
}

export function OpsMore({ tab }: { tab: Exclude<OpsTab, "filings"> }) {
  if (tab === "reviews") return <ReviewQueue />;
  if (tab === "health") return <AgentHealth />;
  if (tab === "partners") return <PartnersAdmin />;
  return <Incidents />;
}

/* ------------------------------ the review queue ------------------------------ */

/** "Due in 5h 20m" or "Late by 2h", ticking each minute. Late reads in the warm accent, never red. */
function Sla({ due }: { due: string }) {
  const { lang } = useApp();
  const zh = lang === "zh";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const ms = new Date(due).getTime() - now, late = ms < 0, m = Math.round(Math.abs(ms) / 60_000);
  const t = m >= 60 * 24 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  return <span className={"sla" + (late ? " late" : ms < 3 * 3600_000 ? " soon" : "")}>{late ? (zh ? `已超时 ${t}` : `Late by ${t}`) : (zh ? `剩余 ${t}` : `Due in ${t}`)}</span>;
}

function ReviewQueue() {
  const { b, lang, say } = useApp();
  const zh = lang === "zh";
  const [rows, setRows] = useState<ops.QueueReview[] | null>(null);
  const [form, setForm] = useState<Record<string, { outcome: "looks_right" | "changes_needed"; comment: string }>>({});
  const load = useCallback(async () => { try { setRows(await ops.reviewQueue()); } catch (e) { say((e as api.ApiError).message); setRows([]); } }, [say]);
  useEffect(() => { void load(); const id = setInterval(() => void load(), 60_000); return () => clearInterval(id); }, [load]);
  const open = (rows ?? []).filter(r => r.status === "requested"), done = (rows ?? []).filter(r => r.status === "done");
  const late = open.filter(r => new Date(r.due_at).getTime() < Date.now()).length;
  const finish = async (r: ops.QueueReview) => {
    const f = form[r.id] ?? { outcome: "looks_right", comment: "" };
    if (f.outcome === "changes_needed" && !f.comment.trim()) { say(zh ? "请说明需要修改什么。" : "Say what needs to change."); return; }
    try { await ops.reviewFinish(r.id, f.outcome, f.comment.trim() || undefined); say(zh ? "已完成，客户会收到通知。" : "Done. The owner gets an update."); await load(); } catch (e) { say((e as api.ApiError).message); }
  };
  return (
    <Frame tab="reviews" title={B("Review queue", "审核队列")} sub={B("Applications owners asked a specialist to check. The target is one business day; your first name and the time show on their filing card.", "客户请专员审核的申请。目标是一个工作日内完成；您的名字和审核时间会显示在客户的申报卡片上。")}>
      <dl className="hq-tot ops-tot">
        <div><dt>{zh ? "待审核" : "Waiting"}</dt><dd>{open.length}</dd></div>
        <div className={late ? "warn" : ""}><dt>{zh ? "已超时" : "Past target"}</dt><dd>{late}</dd></div>
        <div><dt>{zh ? "近 7 天完成" : "Done in 7 days"}</dt><dd>{done.length}</dd></div>
        <div><dt>{zh ? "目标" : "Target"}</dt><dd className="ops-small">{zh ? "1 个工作日" : "1 business day"}</dd></div>
      </dl>
      {rows === null ? <p className="quiet">{zh ? "加载中…" : "Loading…"}</p> : open.length === 0 ? <div className="empty"><p>{zh ? "没有等待审核的申请。" : "No reviews waiting."}</p></div> : (
        <div className="rq-list">{open.map(r => {
          const f = form[r.id] ?? { outcome: "looks_right" as const, comment: "" };
          return (
            <article key={r.id} className="rq">
              <header><span><b>{b(r.title)}</b><small>{r.business}{r.requested_by ? (zh ? `，${r.requested_by}` : `, ${r.requested_by}`) : ""}</small></span><Sla due={r.due_at} /></header>
              {r.note && <q className="rq-note">{r.note}</q>}
              <p className="rq-meta">{zh ? `${stamp(r.requested_at, zh)} 提出，目标 ${stamp(r.due_at, zh)}` : `Asked ${stamp(r.requested_at, zh)}, target ${stamp(r.due_at, zh)}`}</p>
              <form className="rq-form" onSubmit={e => { e.preventDefault(); void finish(r); }}>
                <div className="seg sm" role="radiogroup">
                  {([["looks_right", B("Looks right", "内容无误")], ["changes_needed", B("Changes needed", "需要修改")]] as const).map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={f.outcome === v} aria-pressed={f.outcome === v} onClick={() => setForm(x => ({ ...x, [r.id]: { ...f, outcome: v } }))}>{b(l)}</button>
                  ))}
                </div>
                <input value={f.comment} onChange={e => setForm(x => ({ ...x, [r.id]: { ...f, comment: e.target.value } }))} maxLength={1000} placeholder={zh ? "给客户的说明（需要修改时必填）" : "A note for the owner (needed for changes)"} aria-label={zh ? "说明" : "Note"} />
                <button type="submit" className="sbtn ink">{zh ? "完成审核" : "Finish review"}</button>
              </form>
            </article>
          );
        })}</div>
      )}
      {done.length > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>{zh ? "近 7 天完成" : "Done in the last 7 days"}</h2></div>
          <div className="tray">{done.map(r => (
            <div key={r.id} className="row rq-done"><span className="arow-n"><b>{b(r.title)}</b><small>{[r.business, r.reviewer_name, r.outcome === "changes_needed" ? (zh ? "需要修改" : "changes needed") : (zh ? "无误" : "looks right")].filter(Boolean).join(zh ? "，" : ", ")}</small></span><small className="ago">{r.reviewed_at ? fmtAgo(r.reviewed_at, lang) : ""}</small></div>
          ))}</div>
        </section>
      )}
    </Frame>
  );
}

/* ------------------------------ Agent health ------------------------------ */

function Replay({ id, onClose }: { id: string; onClose: () => void }) {
  const { b, lang } = useApp();
  const zh = lang === "zh";
  const [r, setR] = useState<ops.RunReplay | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { void ops.runReplay(id).then(setR).catch(e => setErr((e as api.ApiError).message)); }, [id]);
  const s = (iso: string | null) => (iso && r ? (new Date(iso).getTime() - new Date(r.created_at).getTime()) / 1000 : null);
  return (
    <Modal label={zh ? "运行回放" : "Run replay"} onClose={onClose} wide>
      <div className="rp">
        {err && <p className="pt-warn">{err}</p>}
        {!r ? !err && <p className="quiet">{zh ? "加载中…" : "Loading…"}</p> : (<>
          <header className="rp-h"><span className="m-eyebrow">{r.business}</span><h2>{r.title ? b(r.title) : r.prompt.slice(0, 120)}</h2>
            <p>{[r.kind, r.channel, r.status, stamp(r.created_at, zh)].filter(Boolean).join(zh ? "，" : ", ")}</p></header>
          <dl className="rp-kv">
            <div><dt>{zh ? "首次回复" : "First reply"}</dt><dd>{dur(s(r.first_reply_at))}</dd></div>
            <div><dt>{zh ? "完成" : "Done"}</dt><dd>{dur(s(r.done_at))}</dd></div>
            <div><dt>{zh ? "工具" : "Tools"}</dt><dd>{r.tool_calls == null ? "-" : zh ? `${r.tool_calls} 次，${r.tool_errors ?? 0} 次出错` : `${r.tool_calls}, ${r.tool_errors ?? 0} errors`}</dd></div>
            <div><dt>{zh ? "AI 成本（估算）" : "AI cost (estimate)"}</dt><dd>{usd(r.cost_usd, 4)}</dd></div>
          </dl>
          <h3>{zh ? "要求" : "What was asked"}</h3>
          <p className="rp-prompt">{r.prompt}</p>
          <h3>{zh ? "步骤" : "Steps, in order"}</h3>
          <ol className="rp-steps">{r.steps.map((x, i) => <li key={i}>{b(x.label)}{x.tool ? <code>{x.tool}</code> : null}</li>)}</ol>
          <h3>{zh ? "AI 调用" : "AI calls while it ran"}</h3>
          {r.calls.length ? (
            <div className="tscroll"><table className="ah-t"><thead><tr><th>{zh ? "时间" : "At"}</th><th>{zh ? "用途" : "Role"}</th><th>{zh ? "服务商" : "Vendor"}</th><th>{zh ? "模型" : "Model"}</th><th>{zh ? "成本" : "Cost"}</th><th>{zh ? "节省模式" : "Saver"}</th></tr></thead>
              <tbody>{r.calls.map((c, i) => <tr key={i}><td>+{dur(s(c.at))}</td><td>{c.role ?? c.kind}</td><td>{c.provider ?? "-"}</td><td>{c.model ?? "-"}</td><td>{usd(c.cost_usd, 4)}</td><td>{c.saver == null ? "-" : c.saver ? (zh ? "是" : "yes") : (zh ? "否" : "no")}</td></tr>)}</tbody></table></div>
          ) : <p className="quiet">{zh ? "这段时间没有 AI 调用记录。" : "No AI calls recorded in that window."}</p>}
          {r.checks.length > 0 && <><h3>{zh ? "独立核对" : "Independent checks of its jobs"}</h3><ul className="rp-checks">{r.checks.map(c => <li key={c.job_id}>{c.job_id}: {c.passed} / {c.of}{c.passed === c.of ? (zh ? "，首次通过" : ", passed first time") : ""}</li>)}</ul></>}
          {r.reply && <><h3>{zh ? "回复" : "The reply"}</h3><div className="rp-reply">{r.reply.map((t, i) => <p key={i}>{b(t)}</p>)}</div></>}
          {r.error && <p className="pt-warn">{r.error}</p>}
          <p className="note">{zh ? "成本按该工作区在运行期间的 AI 调用估算；同一工作区同时运行的任务会被计入。" : "Cost counts the workspace's AI calls while the run was going, so a run sharing its workspace with another at the same moment includes both."}</p>
        </>)}
      </div>
    </Modal>
  );
}

function RunRows({ rows, onOpen }: { rows: ops.HealthRun[]; onOpen: (id: string) => void }) {
  const { lang } = useApp();
  const zh = lang === "zh";
  if (!rows.length) return <p className="quiet">{zh ? "这段时间没有运行。" : "No runs in this window."}</p>;
  return (
    <div className="tray">{rows.map(r => (
      <div key={r.id} className="row ah-run">
        <span className="arow-n"><b title={r.title ?? ""}>{r.title || r.kind}</b><small>{[r.business, r.channel, r.status, stamp(r.created_at, zh)].filter(Boolean).join(zh ? "，" : ", ")}</small></span>
        <span className="ah-run-n"><b>{dur(r.done_s)}</b><small>{usd(r.cost_usd, 4)}</small></span>
        <a className="sbtn quiet" href={`/app/queue/health?run=${r.id}`} onClick={e => { if (e.button === 0 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); onOpen(r.id); } }}><I.play />{zh ? "回放" : "Replay"}</a>
      </div>
    ))}</div>
  );
}

function AgentHealth() {
  const { lang, say } = useApp();
  const zh = lang === "zh";
  const [days, setDays] = useState(14);
  const [h, setH] = useState<ops.Health | null>(null);
  const [reports, setReports] = useState<ops.GovernanceReport[]>([]);
  const [run, setRun] = useState<string | null>(() => { try { return new URLSearchParams(location.search).get("run"); } catch { return null; } });
  useEffect(() => { void ops.agentHealth(days).then(setH).catch(e => say((e as api.ApiError).message)); }, [days, say]);
  useEffect(() => { void ops.governanceReports().then(setReports).catch(() => setReports([])); }, []);
  const t = h?.totals;
  const donePct = t && t.runs ? Math.round((100 * t.done) / t.runs) : null;
  const ms = h?.measured_since;
  return (
    <Frame tab="health" title={B("Agent health", "Agent 健康")} sub={B("How Odelia is running across every workspace: speed, first-try checks, tool errors, cost, saver mode and throttles. The team gets the same summary every Monday.", "Odelia 在所有工作区的运行情况：速度、首次核对、工具出错、成本、节省模式和限流。团队每周一会收到同样的摘要。")}
      act={<div className="seg sm" role="group" aria-label={zh ? "时间范围" : "Period"}>{[7, 14, 30].map(d => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{zh ? `${d} 天` : `${d} days`}</button>)}</div>}>
      {!h ? <p className="quiet">{zh ? "加载中…" : "Loading…"}</p> : (<>
        <dl className="hq-tot ops-tot">
          <div><dt>{zh ? "运行" : "Runs"}</dt><dd>{t!.runs}</dd><small>{donePct == null ? "-" : zh ? `${donePct}% 完成，${t!.failed} 次失败` : `${donePct}% done, ${t!.failed} failed`}</small></div>
          <div><dt>{zh ? "首次通过率" : "First-try pass rate"}</dt><dd>{pct(t!.first_try_pct)}</dd><small>{t!.checked ? (zh ? `${t!.checked} 项任务经独立核对` : `${t!.checked} jobs checked independently`) : (zh ? "暂无核对" : "No checks yet")}</small></div>
          <div className={(t!.tool_error_pct ?? 0) > 5 ? "warn" : ""}><dt>{zh ? "工具出错率" : "Tool error rate"}</dt><dd>{pct(t!.tool_error_pct)}</dd><small>{zh ? `${t!.tool_calls} 次调用` : `${t!.tool_calls} tool calls`}</small></div>
          <div><dt>{zh ? "每次运行 AI 成本" : "AI cost per run"}</dt><dd>{usd(t!.cost_per_run_usd, 2)}</dd><small>{zh ? `共 ${usd(t!.ai_cost_usd)}` : `${usd(t!.ai_cost_usd)} in all`}</small></div>
          <div><dt>{zh ? "首次回复" : "Time to first reply"}</dt><dd>{dur(t!.reply_p50_s)}</dd><small>{zh ? `中位数，95 分位 ${dur(t!.reply_p95_s)}` : `median, 95th percentile ${dur(t!.reply_p95_s)}`}</small></div>
          <div><dt>{zh ? "完成用时" : "Time to done"}</dt><dd>{dur(t!.done_p50_s)}</dd><small>{zh ? `中位数，95 分位 ${dur(t!.done_p95_s)}` : `median, 95th percentile ${dur(t!.done_p95_s)}`}</small></div>
          <div><dt>{zh ? "节省模式" : "Saver mode"}</dt><dd>{pct(t!.saver_pct)}</dd><small>{zh ? "的 AI 调用" : "of AI calls"}</small></div>
          <div className={(t!.throttles ?? 0) > 0 ? "warn" : ""}><dt>{zh ? "限流" : "Throttles"}</dt><dd>{t!.throttles ?? 0}</dd><small>{zh ? "工作区当天被转入节省模式" : "workspaces put in saver mode for the day"}</small></div>
        </dl>

        <section className="sec">
          <div className="sec-h"><h2>{zh ? "每天" : "By day"}</h2></div>
          <div className="tscroll"><table className="ah-t">
            <thead><tr><th>{zh ? "日期" : "Day"}</th><th>{zh ? "运行" : "Runs"}</th><th>{zh ? "失败" : "Failed"}</th><th>{zh ? "首次通过" : "First try"}</th><th>{zh ? "工具出错" : "Tool errors"}</th><th>{zh ? "首次回复" : "First reply"}</th><th>{zh ? "完成" : "Done"}</th><th>{zh ? "每次成本" : "Cost a run"}</th><th>{zh ? "节省模式" : "Saver"}</th><th>{zh ? "限流" : "Throttles"}</th></tr></thead>
            <tbody>{[...h.by_day].reverse().map(d => (
              <tr key={d.day}><td>{fmtDay(d.day, lang)}</td><td>{d.runs}</td><td>{d.failed}</td><td>{pct(d.first_try_pct)}</td><td>{pct(d.tool_error_pct)}</td>
                <td>{dur(d.reply_p50_s)}<small> / {dur(d.reply_p95_s)}</small></td><td>{dur(d.done_p50_s)}<small> / {dur(d.done_p95_s)}</small></td><td>{usd(d.cost_per_run_usd, 2)}</td><td>{pct(d.saver_pct)}</td><td>{d.throttles}</td></tr>
            ))}</tbody>
          </table></div>
          <p className="note">{zh ? "时间为中位数 / 95 分位。" : "Times are median / 95th percentile."} {ms?.first_reply ? (zh ? `首次回复自 ${fmtDay(ms.first_reply, lang, true)} 起统计；` : `First replies measured since ${fmtDay(ms.first_reply, lang, true)}; `) : (zh ? "首次回复尚未统计；" : "First replies not measured yet; ")}{ms?.tools ? (zh ? `工具自 ${fmtDay(ms.tools, lang, true)} 起；` : `tools since ${fmtDay(ms.tools, lang, true)}; `) : ""}{ms?.saver ? (zh ? `节省模式自 ${fmtDay(ms.saver, lang, true)} 起。` : `saver mode since ${fmtDay(ms.saver, lang, true)}.`) : ""}</p>
        </section>

        <section className="sec">
          <div className="sec-h"><h2>{zh ? "按服务商和模型的成本" : "Cost by vendor and model"}</h2></div>
          {h.by_vendor.length ? (
            <div className="tscroll"><table className="ah-t"><thead><tr><th>{zh ? "服务商" : "Vendor"}</th><th>{zh ? "模型" : "Model"}</th><th>{zh ? "调用" : "Calls"}</th><th>{zh ? "成本" : "Cost"}</th></tr></thead>
              <tbody>{h.by_vendor.map(v => <tr key={v.provider + v.model}><td>{v.provider}</td><td>{v.model}</td><td>{v.calls}</td><td>{usd(v.cost_usd)}</td></tr>)}</tbody></table></div>
          ) : <p className="quiet">{zh ? "这段时间没有 AI 调用。" : "No AI calls in this window."}</p>}
        </section>

        <section className="sec"><div className="sec-h"><h2>{zh ? "最慢的 10 次运行" : "The 10 slowest runs"}</h2></div><RunRows rows={h.slowest} onOpen={setRun} /></section>
        <section className="sec"><div className="sec-h"><h2>{zh ? "最贵的 10 次运行" : "The 10 most expensive runs"}</h2></div><RunRows rows={h.costliest} onOpen={setRun} /></section>

        <section className="sec">
          <div className="sec-h"><h2>{zh ? "每周摘要" : "Weekly summaries"}</h2></div>
          {reports.length ? <div className="tray">{reports.map(r => (
            <div key={r.week} className="row"><span className="arow-n"><b>{zh ? `${fmtDay(r.week, lang, true)} 这周` : `Week of ${fmtDay(r.week, lang, true)}`}</b>
              <small>{[`${r.summary.totals?.runs ?? 0} ${zh ? "次运行" : "runs"}`, `${zh ? "首次通过" : "first try"} ${pct(r.summary.totals?.first_try_pct)}`, usd(r.summary.totals?.ai_cost_usd),
                zh ? `邮件 ${r.emailed_to} 人` : `emailed to ${r.emailed_to}`].join(zh ? "，" : ", ")}</small></span></div>
          ))}</div> : <p className="quiet">{zh ? "第一份摘要会在下周一发出。" : "The first summary goes out next Monday."}</p>}
        </section>
      </>)}
      {run && <Replay id={run} onClose={() => { setRun(null); try { if (location.search.includes("run=")) history.replaceState(history.state, "", location.pathname); } catch { /* fine */ } }} />}
    </Frame>
  );
}

/* ------------------------------ partners ------------------------------ */

const STATUS: Record<pa.PartnerStatus, Bi> = { pending: B("Waiting for review", "待审核"), approved: B("Approved", "已批准"), declined: B("Declined", "未批准"), paused: B("Paused", "已暂停") };

function PartnersAdmin() {
  const { b, lang, say } = useApp();
  const zh = lang === "zh";
  const [rows, setRows] = useState<pa.PartnerAdminRow[] | null>(null);
  const [edit, setEdit] = useState<Record<string, { pct: string; months: string }>>({});
  const [pay, setPay] = useState<Record<string, { amount: string; on: string; ref: string }>>({});
  const load = useCallback(async () => { try { setRows(await pa.partnerAdminList()); } catch (e) { say((e as api.ApiError).message); setRows([]); } }, [say]);
  useEffect(() => { void load(); }, [load]);
  const set = async (p: pa.PartnerAdminRow, status: pa.PartnerStatus) => {
    const e = edit[p.id];
    const pctN = e?.pct.trim() ? Number(e.pct) : null, monthsN = e?.months.trim() ? Number(e.months) : null;
    try { await pa.partnerAdminSet(p.id, status, pctN, monthsN); say(zh ? "已保存" : "Saved"); await load(); } catch (x) { say((x as api.ApiError).message); }
  };
  const payout = async (p: pa.PartnerAdminRow) => {
    const f = pay[p.id];
    if (!f || !(Number(f.amount) > 0) || !f.on) { say(zh ? "请填写金额和付款日期。" : "Enter the amount and the day it was paid."); return; }
    try { await pa.partnerPayoutAdd(p.id, Number(f.amount), f.on, f.ref); say(zh ? "已记录付款" : "Payout recorded"); setPay(x => ({ ...x, [p.id]: { amount: "", on: "", ref: "" } })); await load(); } catch (x) { say((x as api.ApiError).message); }
  };
  const pending = (rows ?? []).filter(p => p.status === "pending").length;
  return (
    <Frame tab="partners" title={B("Partners", "合作伙伴")} sub={B("Approve the people who bring brands to Placetta, set each one's revenue share, and record the payouts you make by hand. Partners see only the referrals that agreed to share.", "审核把品牌带到快哉的合作伙伴，设定各自的收入分成，并记录您手动支付的款项。合作伙伴只能看到同意共享的推荐商家。")}>
      <dl className="hq-tot ops-tot">
        <div className={pending ? "warn" : ""}><dt>{zh ? "待审核" : "Waiting for review"}</dt><dd>{pending}</dd></div>
        <div><dt>{zh ? "已批准" : "Approved"}</dt><dd>{(rows ?? []).filter(p => p.status === "approved").length}</dd></div>
        <div><dt>{zh ? "推荐商家" : "Businesses referred"}</dt><dd>{(rows ?? []).reduce((s, p) => s + p.referred, 0)}</dd></div>
        <div><dt>{zh ? "待支付分成" : "Share not yet paid"}</dt><dd>{usd((rows ?? []).reduce((s, p) => s + Math.max(0, p.earned_usd - p.paid_usd), 0))}</dd><small>{zh ? "含本月进行中" : "including this month so far"}</small></div>
      </dl>
      {rows === null ? <p className="quiet">{zh ? "加载中…" : "Loading…"}</p> : rows.length === 0 ? <div className="empty"><p>{zh ? "还没有合作伙伴申请。" : "No partner applications yet."}</p></div> : (
        <div className="pa-list">{rows.map(p => {
          const e = edit[p.id] ?? { pct: p.share_pct == null ? "" : String(p.share_pct), months: String(p.share_months) };
          const f = pay[p.id] ?? { amount: "", on: "", ref: "" };
          return (
            <article key={p.id} className="pa">
              <header><span><b>{p.org_name}</b><small>{[b(PARTNER_KIND[p.kind]), p.contact_name, p.email].filter(Boolean).join(zh ? "，" : ", ")}</small></span><span className={"pt-tag" + (p.status === "pending" ? " warm" : "")}>{b(STATUS[p.status])}</span></header>
              {p.note && <q className="rq-note">{p.note}</q>}
              <p className="rq-meta">{[p.website ?? "", p.code ? (zh ? `推荐码 ${p.code}` : `code ${p.code}`) : "", zh ? `推荐 ${p.referred} 家，${p.sharing} 家共享` : `${p.referred} referred, ${p.sharing} sharing`,
                zh ? `分成 ${usd(p.earned_usd)}，已付 ${usd(p.paid_usd)}` : `earned ${usd(p.earned_usd)}, paid ${usd(p.paid_usd)}`].filter(Boolean).join(zh ? "，" : ", ")}</p>
              <div className="pa-row">
                <label><span>{zh ? "分成 %" : "Share %"}</span><input inputMode="decimal" value={e.pct} onChange={x => setEdit(s => ({ ...s, [p.id]: { ...e, pct: x.target.value } }))} placeholder={zh ? "未设定" : "not set"} /></label>
                <label><span>{zh ? "月数" : "Months"}</span><input inputMode="numeric" value={e.months} onChange={x => setEdit(s => ({ ...s, [p.id]: { ...e, months: x.target.value } }))} /></label>
                {p.status !== "approved" && <button type="button" className="sbtn ink" onClick={() => void set(p, "approved")}>{zh ? "批准" : "Approve"}</button>}
                {p.status === "approved" && <button type="button" className="sbtn line" onClick={() => void set(p, "approved")}>{zh ? "保存分成" : "Save share"}</button>}
                {p.status === "pending" && <button type="button" className="sbtn quiet" onClick={() => void set(p, "declined")}>{zh ? "不批准" : "Decline"}</button>}
                {p.status === "approved" && <button type="button" className="sbtn quiet" onClick={() => void set(p, "paused")}>{zh ? "暂停推荐码" : "Pause code"}</button>}
              </div>
              {(p.status === "approved" || p.status === "paused") && (
                <form className="pa-row" onSubmit={x => { x.preventDefault(); void payout(p); }}>
                  <label><span>{zh ? "已付金额" : "Paid"}</span><input inputMode="decimal" value={f.amount} onChange={x => setPay(s => ({ ...s, [p.id]: { ...f, amount: x.target.value } }))} placeholder="$" /></label>
                  <label><span>{zh ? "日期" : "On"}</span><input type="date" value={f.on} onChange={x => setPay(s => ({ ...s, [p.id]: { ...f, on: x.target.value } }))} /></label>
                  <label><span>{zh ? "凭证号" : "Reference"}</span><input value={f.ref} onChange={x => setPay(s => ({ ...s, [p.id]: { ...f, ref: x.target.value } }))} placeholder="ACH 1029" maxLength={120} /></label>
                  <button type="submit" className="sbtn line">{zh ? "记录付款" : "Record payout"}</button>
                </form>
              )}
            </article>
          );
        })}</div>
      )}
      <p className="note">{zh ? "暂停推荐码后，新注册不再记录；已推荐的商家继续计入分成。付款由团队手动完成，这里只做记录。" : "A paused code records no new sign-ups; businesses already referred keep counting. Payouts are made by hand; this only records them."}</p>
    </Frame>
  );
}

/* ------------------------------ the incident log ------------------------------ */

function Incidents() {
  const { lang, say } = useApp();
  const zh = lang === "zh";
  const [log, setLog] = useState<{ since: string | null; incidents: ops.Incident[] } | null>(null);
  const nowLocal = useMemo(() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }, []);
  const [f, setF] = useState({ at: nowLocal, title: "", impact: "", fix: "", pub: false });
  const [fixes, setFixes] = useState<Record<string, string>>({});
  const load = useCallback(async () => { try { setLog(await ops.incidentsList()); } catch (e) { say((e as api.ApiError).message); } }, [say]);
  useEffect(() => { void load(); }, [load]);
  const add = async () => {
    if (!f.title.trim() || !f.impact.trim()) { say(zh ? "请填写发生了什么和影响。" : "Say what happened and the impact."); return; }
    try { await ops.incidentAdd({ happened_at: new Date(f.at).toISOString(), title: f.title, impact: f.impact, fix: f.fix, public: f.pub }); setF({ at: nowLocal, title: "", impact: "", fix: "", pub: false }); say(zh ? "已记录" : "Logged"); await load(); }
    catch (e) { say((e as api.ApiError).message); }
  };
  const save = async (i: ops.Incident, pub = i.public) => {
    try { await ops.incidentUpdate(i.id, fixes[i.id] ?? i.fix ?? "", pub); say(zh ? "已保存" : "Saved"); await load(); } catch (e) { say((e as api.ApiError).message); }
  };
  return (
    <Frame tab="incidents" title={B("Incident log", "事件记录")} sub={log?.since ? B(`Kept since ${fmtDay(log.since, "en", true)}. What happened, the impact and the fix. Entries you mark public show on the trust page.`, `自 ${fmtDay(log.since, "zh", true)} 起记录：发生了什么、影响和修复。标记为公开的条目会显示在信任页面上。`) : B("What happened, the impact and the fix. Entries you mark public show on the trust page.", "发生了什么、影响和修复。标记为公开的条目会显示在信任页面上。")}>
      <form className="in-form" onSubmit={e => { e.preventDefault(); void add(); }}>
        <label><span>{zh ? "时间" : "When"}</span><input type="datetime-local" value={f.at} max={nowLocal} onChange={e => setF({ ...f, at: e.target.value })} /></label>
        <label className="wide"><span>{zh ? "发生了什么" : "What happened"}</span><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} maxLength={300} placeholder={zh ? "例如：传真送达确认延迟" : "For example: fax confirmations were late"} /></label>
        <label className="wide"><span>{zh ? "影响" : "Impact"}</span><textarea rows={2} value={f.impact} onChange={e => setF({ ...f, impact: e.target.value })} maxLength={1000} placeholder={zh ? "谁受影响、多久" : "Who was affected, and for how long"} /></label>
        <label className="wide"><span>{zh ? "修复（选填）" : "Fix (optional)"}</span><textarea rows={2} value={f.fix} onChange={e => setF({ ...f, fix: e.target.value })} maxLength={1000} /></label>
        <label className="chk"><input type="checkbox" checked={f.pub} onChange={e => setF({ ...f, pub: e.target.checked })} />{zh ? "在信任页面公开（不含客户名称）" : "Show on the trust page (no customer names)"}</label>
        <button type="submit" className="sbtn ink">{zh ? "记录事件" : "Log it"}</button>
      </form>
      <section className="sec">
        <div className="sec-h"><h2>{zh ? "记录" : "The log"}{log?.incidents.length ? <em className="pt-n">{log.incidents.length}</em> : null}</h2></div>
        {!log ? <p className="quiet">{zh ? "加载中…" : "Loading…"}</p> : log.incidents.length === 0 ? <div className="empty"><p>{zh ? "暂无事件。" : "Nothing logged yet."}</p></div> : (
          <div className="in-list">{log.incidents.map(i => (
            <article key={i.id} className="in">
              <header><span><b>{i.title}</b><small>{[stamp(i.happened_at, zh), i.by ?? ""].filter(Boolean).join(zh ? "，" : ", ")}</small></span>
                <button type="button" className={"pt-tag" + (i.public ? "" : " muted")} onClick={() => void save(i, !i.public)} title={zh ? "切换是否公开" : "Switch public or not"}>{i.public ? (zh ? "公开" : "Public") : (zh ? "仅团队" : "Team only")}</button></header>
              <p><b>{zh ? "影响：" : "Impact: "}</b>{i.impact}</p>
              {i.fix ? <p><b>{zh ? "修复：" : "Fix: "}</b>{i.fix}</p> : (
                <form className="pt-inline" onSubmit={e => { e.preventDefault(); void save(i); }}>
                  <input value={fixes[i.id] ?? ""} onChange={e => setFixes(x => ({ ...x, [i.id]: e.target.value }))} maxLength={1000} placeholder={zh ? "补充修复" : "Add the fix"} aria-label={zh ? "修复" : "Fix"} />
                  <button type="submit" className="sbtn line">{zh ? "保存" : "Save"}</button>
                </form>
              )}
            </article>
          ))}</div>
        )}
      </section>
    </Frame>
  );
}
