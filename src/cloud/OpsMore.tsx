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
import { LawQueue } from "./LawQueue";
import { keep, SLOW_MS, totals, tree, type Span, type TraceFilter } from "../trace";
import { outcomesCsv, shown, type Measured, type OutcomeMetrics } from "../outcomes";

/* The team's pages beside the filing queue (src/cloud/Ops.tsx): the specialist review queue with its one-business-day
   target, Agent health (how Odelia runs: speed, first-try checks, tool errors, cost by vendor and model, saver mode,
   throttles, the slowest and most expensive runs with a replay of each, and the weekly summaries), partners (approve,
   set the share, record payouts), the measured outcomes (Outcomes: what each filing took, against what the alternative
   costs, with the export for investors) and the incident log. Each opens at /app/queue/<tab>. */

export type OpsTab = "filings" | "reviews" | "health" | "quality" | "outcomes" | "partners" | "incidents";
const TABS: { id: OpsTab; label: Bi }[] = [
  { id: "filings", label: B("Filing queue", "申报队列") }, { id: "reviews", label: B("Review queue", "审核队列") },
  { id: "health", label: B("Agent health", "Agent 健康") }, { id: "quality", label: B("Quality", "质量") }, { id: "outcomes", label: B("Outcomes", "成效") }, { id: "partners", label: B("Partners", "合作伙伴") }, { id: "incidents", label: B("Incident log", "事件记录") },
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

/** Dollars: cents for totals; four places for the small per-run and per-call amounts. */
const usd = (n: number | null | undefined, d = 2) => (n == null ? "-" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const usdRun = (n: number | null | undefined) => usd(n, n != null && Math.abs(n) < 1 ? 4 : 2);
const pct = (n: number | null | undefined) => (n == null ? "-" : `${n}%`);
/** Seconds as people say them: 3.2s, 41s, 3m 10s. */
export function dur(s: number | null | undefined): string {
  if (s == null) return "-";
  if (s < 10) return `${Number(s).toFixed(1)}s`;
  const t = Math.round(s);   // whole seconds first, so 359.6 reads 6m, not 5m 60s
  if (t < 60) return `${t}s`;
  const m = Math.floor(t / 60), r = t % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : r ? `${m}m ${r}s` : `${m}m`;
}
/** A run's kind, channel and status, and an AI call's role, in words. */
const WORDS: Record<string, Bi> = {
  task: B("Task", "任务"), watch: B("Weekly check", "每周检查"), app: B("In the app", "应用内"), sms: B("By text", "短信"), voice: B("By phone", "电话"), email: B("By email", "邮件"),
  slack: B("Slack", "Slack"), lark: B("Lark", "飞书"), wechat: B("WeChat", "微信"), done: B("Done", "完成"), failed: B("Failed", "失败"), stopped: B("Stopped", "已停止"), running: B("Running", "运行中"),
  plan: B("Planning", "规划"), review: B("Checking", "核对"), extract: B("Reading a document", "读取文件"), translate: B("Translating", "翻译"), draft: B("Drafting", "起草"),
  short: B("Short reply", "简短回复"), deep: B("Deep research", "深入研究"), call: B("Call", "调用"),
};
const word = (k: string | null | undefined, zh: boolean) => (k ? (WORDS[k] ? WORDS[k][zh ? "zh" : "en"] : k) : "");
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
  if (tab === "quality") return <QualityQueue />;
  if (tab === "outcomes") return <Outcomes />;
  return <Incidents />;
}

/* ------------------------------ the quality queue ------------------------------ */

const QA_KIND: Record<ops.QaFinding["kind"], Bi> = {
  drift: B("An agency's page no longer says what we quote", "机构网页已不再是我们引用的内容"),
  fee: B("An agency's fee may have changed", "机构费用可能已变"),
  stale: B("A rule due for its re-read date", "规则需要更新核对日期"),
  unreachable: B("An agency's page didn't open", "机构网页无法打开"),
  grader: B("A finished run broke a check", "已完成的运行未通过检查"),
  edge: B("A way of writing a business or address breaks a plan", "某种业务或地址写法导致方案出错"),
};
const QA_SEV: Record<ops.QaFinding["severity"], Bi> = { high: B("High", "高"), medium: B("Medium", "中"), low: B("Low", "低") };

/** What the nightly sweep, the mutation generator and the online grader found, the most severe first, each with how to
 *  see it again and the fix it proposes. Staff approve the fix, mark it fixed or dismiss it; nothing here changes what a
 *  customer sees or files anything. */
function QualityQueue() {
  const { b, lang, say } = useApp();
  const zh = lang === "zh";
  const [rows, setRows] = useState<ops.QaFinding[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(async () => { try { setRows(await ops.qaQueue()); } catch (e) { say((e as api.ApiError).message); setRows([]); } }, [say]);
  useEffect(() => { void load(); }, [load]);
  const decide = async (r: ops.QaFinding, status: "approved" | "dismissed" | "fixed") => {
    if (status === "dismissed" && !(notes[r.id] ?? "").trim()) { say(zh ? "请说明为什么不处理。" : "Say why it's dismissed."); return; }
    try { await ops.qaDecide(r.id, status, notes[r.id]); say(zh ? "已记录" : "Recorded"); await load(); } catch (e) { say((e as api.ApiError).message); }
  };
  const list = rows ?? [], count = (s: ops.QaFinding["severity"]) => list.filter(r => r.severity === s).length;
  return (
    <Frame tab="quality" title={B("Quality", "质量")} sub={B("What the nightly sweep of agency pages, the mutation generator and the online grader found. A safe fee fix arrives as a draft pull request; everything else waits for you here. Nothing here changes what a customer sees.", "每晚的机构网页核查、变体测试和在线评分发现的问题。安全的费用修正会以草稿合并请求提交；其他问题都在这里等您处理。这里的操作不会改变客户看到的内容。")}>
      <dl className="hq-tot ops-tot">
        <div className={count("high") ? "warn" : ""}><dt>{b(QA_SEV.high)}</dt><dd>{count("high")}</dd></div>
        <div><dt>{b(QA_SEV.medium)}</dt><dd>{count("medium")}</dd></div>
        <div><dt>{b(QA_SEV.low)}</dt><dd>{count("low")}</dd></div>
      </dl>
      {rows === null ? <p className="quiet">{zh ? "加载中…" : "Loading…"}</p> : list.length === 0 ? <div className="empty"><p>{zh ? "没有待处理的问题。" : "Nothing to look at."}</p></div> : (
        <div className="rq-list">{list.map(r => (
          <article key={r.id} className="rq">
            <header><span><b>{b(QA_KIND[r.kind])}</b><small>{[b(QA_SEV[r.severity]), r.subject, r.seen > 1 ? (zh ? `出现 ${r.seen} 次` : `seen ${r.seen} times`) : "", r.status === "approved" ? (zh ? "已批准修正" : "fix approved") : ""].filter(Boolean).join(zh ? "，" : ", ")}</small></span><Sla due={r.due_at} /></header>
            <p className="rq-meta">{r.repro}</p>
            <q className="rq-note">{r.fix}</q>
            {r.source.startsWith("https://") && <p className="rq-meta"><a href={r.source} target="_blank" rel="noreferrer">{r.source}<I.ext /></a></p>}
            <form className="rq-form" onSubmit={e => { e.preventDefault(); void decide(r, "fixed"); }}>
              <input value={notes[r.id] ?? ""} onChange={e => setNotes(x => ({ ...x, [r.id]: e.target.value }))} maxLength={2000} placeholder={zh ? "备注（不处理时必填）" : "A note (needed to dismiss)"} aria-label={zh ? "备注" : "Note"} />
              {r.status !== "approved" && <button type="button" className="sbtn" onClick={() => void decide(r, "approved")}>{zh ? "批准修正" : "Approve the fix"}</button>}
              <button type="button" className="sbtn" onClick={() => void decide(r, "dismissed")}>{zh ? "不处理" : "Dismiss"}</button>
              <button type="submit" className="sbtn ink">{zh ? "已修正" : "Mark fixed"}</button>
            </form>
          </article>
        ))}</div>
      )}
      <LawQueue />
      <TaughtQueue />
    </Frame>
  );
}

/* ------------------------------ steps Odelia learned (teach mode) ------------------------------ */

const TAUGHT_FLAG: Record<string, Bi> = {
  page_injection: B("A page had text aimed at the AI: check those steps by hand", "某个页面含有针对 AI 的文字：请人工核对这些步骤"),
  unmapped_fields: B("Some lines match nothing the customer approved: the person is asked for them", "有些栏目与客户批准的内容都不对应：会请客户填写"),
  not_in_registry: B("A line matched something the registry doesn't list for this form: it's asked instead", "某栏目对应的内容不在该表格的登记字段中：改为询问"),
  model_mapping_refused: B("A suggested match wasn't one of the business's facts and was refused", "有一项建议的对应不是企业资料，已拒绝"),
  no_confirmation: B("No confirmation number was seen at the end", "结尾没有看到确认号"),
  no_submit: B("No send step was seen", "没有看到提交步骤"),
  signs_in: B("Signs in with the business's saved login", "使用企业保存的登录信息登录"),
  names_scrubbed: B("Customer details in page or button names were replaced with placeholders", "页面或按钮名称中的客户信息已替换为占位符"),
  no_accessible_name: B("A control has no name and is found by its id", "有控件没有名称，按其编号定位"),
  labels_unavailable: B("Page names are plain: the AI labels weren't available", "页面名称为原文：未能生成 AI 标注"),
  confirm_pattern_refused: B("The confirmation number's pattern was refused", "确认号的格式规则被拒绝"),
};
const DO: Record<string, Bi> = {
  sign_in: B("Sign in", "登录"), open: B("Open", "打开"), choose: B("Choose", "选择"), fill: B("Fill", "填写"), upload: B("Attach", "上传"),
  agree: B("Agree", "同意"), review: B("Check", "核对"), submit: B("Send", "提交"), pay: B("The person pays", "由客户付款"), receipt: B("Confirmation", "确认"),
};

/** Drafts from "Show Odelia how" runs, then the approved ones with their record. A draft runs only with a person
 *  pressing submit; approving it lets it run for every business on that site, still under every check and approval. */
function TaughtQueue() {
  const { b, lang, say } = useApp();
  const zh = lang === "zh";
  const [rows, setRows] = useState<ops.TaughtPlaybook[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(async () => { try { setRows(await ops.playbookQueue()); } catch (e) { say((e as api.ApiError).message); setRows([]); } }, [say]);
  useEffect(() => { void load(); }, [load]);
  const decide = async (p: ops.TaughtPlaybook, status: "approved" | "rejected" | "draft") => {
    try { await ops.playbookDecide(p.id, status, notes[p.id]); say(zh ? "已记录" : "Recorded"); await load(); } catch (e) { say((e as api.ApiError).message); }
  };
  if (!rows?.length) return null;
  const line = (s: ops.TaughtStep) => s.login ? (zh ? "保存的登录信息" : "the saved login") : s.person ? (zh ? "客户每次亲自填写" : "the person types it, every time")
    : s.ask ? (zh ? "询问客户" : "asked") : s.option ? (zh ? `固定选项：${s.option}` : `fixed choice: ${s.option}`) : s.field ?? s.fact ?? "";
  return (
    <section className="sec taught">
      <div className="sec-h"><h2>{zh ? "Odelia 学会的步骤" : "Steps Odelia learned"}</h2></div>
      <p className="note">{zh ? "来自“教 Odelia 一次”的记录。未核对的步骤只在有人点击提交时运行；批准后，Odelia 会为每家在该网站办理的企业提交，仍需每次批准。记录中没有任何客户的资料。" : "From \"Show Odelia how\" runs. Until you approve them, these steps run only with a person pressing submit. Once approved, Odelia files this form on that site for every business, each filing still approved. Nothing in them is any customer's."}</p>
      <div className="rq-list">{rows.map(p => {
        const steps = Object.values(p.body.playbook?.forms ?? {})[0]?.steps ?? [];
        const special = (p.body.trace ?? []).filter(s => s.login || s.person || s.ask || s.option);
        return (
          <article key={p.id} className="rq">
            <header><span><b>{p.name}</b><small>{[p.host, p.official, p.status === "approved" ? (zh ? "已批准" : "approved") : p.demoted_at ? (zh ? `已退回核对：${p.demoted_reason ?? ""}` : `sent back: ${p.demoted_reason ?? ""}`) : (zh ? "待核对" : "to review"),
              p.runs ? (zh ? `${p.runs} 次中成功 ${p.successes} 次` : `${p.successes} of ${p.runs} runs filed`) : (zh ? "尚未运行" : "not run yet"), `v${p.version}`].join(zh ? "，" : ", ")}</small></span>
              <small>{fmtAgo(p.taught_at, lang)}</small></header>
            <ol className="taught-steps">{steps.map((s, i) => <li key={i}><b>{s.page}</b><small>{b(DO[s.do] ?? B(s.do, s.do))}{zh ? "：" : ": "}{s.note}</small></li>)}</ol>
            {(p.body.fields?.length ?? 0) > 0 && (
              <table className="q-margin-t"><thead><tr><th>{zh ? "页面上的栏目" : "Line on the page"}</th><th>{zh ? "填入的企业资料" : "Filled with"}</th><th>{zh ? "格式检查" : "Check"}</th></tr></thead>
                <tbody>{p.body.fields!.map((f, i) => <tr key={i}><td>{f.selector.replace(/^\w+:/, "")}</td><td>{f.label}</td><td>{f.validator ?? "-"}</td></tr>)}</tbody></table>
            )}
            {special.length > 0 && <p className="rq-meta">{special.map(s => `${s.selector.replace(/^\w+:/, "")} (${line(s)})`).join(zh ? "；" : "; ")}</p>}
            {p.body.playbook?.final?.[0] && <p className="rq-meta">{zh ? `提交按钮：${p.body.playbook.final[0].page} 页的“${p.body.playbook.final[0].button ?? ""}”` : `Sends with "${p.body.playbook.final[0].button ?? ""}" on ${p.body.playbook.final[0].page}`}</p>}
            {p.flags.filter(f => TAUGHT_FLAG[f]).map(f => <q key={f} className="rq-note">{b(TAUGHT_FLAG[f])}</q>)}
            <form className="rq-form" onSubmit={e => { e.preventDefault(); void decide(p, "approved"); }}>
              <input value={notes[p.id] ?? ""} onChange={e => setNotes(x => ({ ...x, [p.id]: e.target.value }))} maxLength={2000} placeholder={zh ? "备注（拒绝时必填）" : "A note (needed to reject)"} aria-label={zh ? "备注" : "Note"} />
              {p.status === "approved"
                ? <button type="button" className="sbtn" onClick={() => void decide(p, "draft")}>{zh ? "退回核对" : "Send back to review"}</button>
                : <button type="button" className="sbtn" onClick={() => void decide(p, "rejected")}>{zh ? "拒绝" : "Reject"}</button>}
              {p.status !== "approved" && <button type="submit" className="sbtn ink">{zh ? "批准" : "Approve"}</button>}
            </form>
          </article>
        );
      })}</div>
    </section>
  );
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
              <header><span><b>{b(r.title)}</b><small>{r.business}{r.requested_by ? (zh ? `，${r.requested_by}` : `, ${r.requested_by}`) : (zh ? "，Odelia 提问" : ", asked by Odelia")}</small></span><Sla due={r.due_at} /></header>
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

/** The run's trace: each model and tool call on one time line, with tokens, cache reads and price (src/trace.ts). */
function Trace({ spans }: { spans: Span[] }) {
  const { lang } = useApp();
  const zh = lang === "zh";
  const t = totals(spans);
  const [filter, setFilter] = useState<TraceFilter>("all");
  const rounds = useMemo(() => tree(spans), [spans]);
  const wall = Math.max(t.wall_ms, 1);
  const n = (x: number | undefined) => (x == null ? "-" : x.toLocaleString("en-US"));
  const sec = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
  return (<>
    <dl className="rr-kv">
      <div><dt>{zh ? "模型调用" : "Model calls"}</dt><dd>{zh ? `${t.calls} 次，${sec(t.model_ms)}` : `${t.calls}, ${sec(t.model_ms)}`}</dd></div>
      <div><dt>{zh ? "工具调用" : "Tool calls"}</dt><dd>{zh ? `${t.tools} 次，${sec(t.tool_ms)}，${t.tool_errors} 次出错` : `${t.tools}, ${sec(t.tool_ms)}, ${t.tool_errors} errors`}</dd></div>
      <div><dt>{zh ? "令牌（输入，输出）" : "Tokens in, out"}</dt><dd>{n(t.in + t.read + t.write)}, {n(t.out)}</dd></div>
      <div><dt>{zh ? "缓存命中" : "Cache hits"}</dt><dd>{t.hit == null ? "-" : `${t.hit}%`}{t.read ? (zh ? `，${n(t.read)} 个令牌` : `, ${n(t.read)} tokens`) : ""}</dd></div>
      <div><dt>{zh ? "成本" : "Cost"}</dt><dd>{usd(t.usd, 4)}</dd></div>
    </dl>
    <div className="seg sm tr-f" role="group" aria-label={zh ? "筛选" : "Filter"}>
      {FILTERS.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label[zh ? "zh" : "en"]}{f.id !== "all" ? ` ${spans.filter(s => keep(s, f.id)).length}` : ""}</button>)}
    </div>
    <div className="tscroll"><table className="ah-t tr-t">
      <thead><tr><th>{zh ? "开始" : "Start"}</th><th>{zh ? "调用" : "Call"}</th><th className="tr-line">{zh ? "时间线" : "Time line"}</th><th>{zh ? "耗时" : "Took"}</th><th>{zh ? "输入" : "In"}</th><th>{zh ? "缓存读取" : "Cache read"}</th><th>{zh ? "输出" : "Out"}</th><th>{zh ? "成本" : "Cost"}</th></tr></thead>
      {rounds.map((g, gi) => {
        const shown = g.spans.filter(s => keep(s, filter));
        if (!shown.length) return null;
        return (
          <tbody key={gi} className="tr-round">
            {g.r >= 0 && <tr className="tr-rh"><td>+{sec(g.at)}</td><td colSpan={2}><b>{g.r === 0 ? (zh ? "开始之前" : "Before the first round") : (zh ? `第 ${g.r} 轮` : `Round ${g.r}`)}</b><small>{zh ? `，${g.spans.length} 次调用${g.errors ? `，${g.errors} 次失败` : ""}` : `, ${g.spans.length} calls${g.errors ? `, ${g.errors} failed` : ""}`}</small></td><td>{sec(g.ms)}</td><td colSpan={3}>{g.tokens ? n(g.tokens) : ""}</td><td>{g.usd ? usd(g.usd, 4) : ""}</td></tr>}
            {shown.map((s, i) => (
              <tr key={i} className={(s.ok === false ? "bad " : "") + (g.r >= 0 && s.k === "tool" ? "tr-kid" : "")}>
                <td>+{sec(s.at)}</td>
                <td>{s.k === "model" ? <><b>{word(s.n, zh)}</b><small> {s.model ?? ""}</small></> : <code>{s.n}</code>}{s.ok === false && <small>{zh ? "，失败" : ", failed"}</small>}</td>
                <td className="tr-line"><span className={"tr-bar " + s.k} style={{ marginLeft: `${(100 * s.at) / wall}%`, width: `${Math.max(0.6, (100 * s.ms) / wall)}%` }} /></td>
                <td>{sec(s.ms)}</td>
                <td>{s.k === "model" ? n(s.in) : ""}</td><td>{s.k === "model" ? n(s.read) : ""}</td><td>{s.k === "model" ? n(s.out) : ""}</td>
                <td>{s.k === "model" ? usd(s.usd, 4) : ""}</td>
              </tr>
            ))}
          </tbody>
        );
      })}
    </table></div>
  </>);
}

const FILTERS: { id: TraceFilter; label: Bi }[] = [
  { id: "all", label: B("All", "全部") }, { id: "model", label: B("Model calls", "模型调用") }, { id: "tool", label: B("Tool calls", "工具调用") },
  { id: "failed", label: B("Failed", "失败") }, { id: "slow", label: B("Slow, 2 s or more", "慢，2 秒以上") },
];

/** Cost and tokens per workspace and day (agent_usage_by_workspace), and runs whose trace has a given tool, a failure
 *  or a slow call (agent_trace_find): the cross-run views LangSmith and Langfuse give a team. */
function UsageAndSearch({ days, onOpen }: { days: number; onOpen: (id: string) => void }) {
  const { lang, say } = useApp();
  const zh = lang === "zh";
  const [rows, setRows] = useState<ops.WorkspaceDay[] | null>(null);
  const [q, setQ] = useState<{ tool: string; failed: boolean; slow: boolean }>({ tool: "", failed: true, slow: false });
  const [found, setFound] = useState<ops.TraceHit[] | null>(null);
  useEffect(() => { void ops.usageByWorkspace(days).then(setRows).catch(e => say((e as api.ApiError).message)); }, [days, say]);
  const find = () => void ops.traceFind({ tool: q.tool.trim() || null, failed: q.failed, slowMs: q.slow ? SLOW_MS : null, days }).then(setFound).catch(e => say((e as api.ApiError).message));
  const n = (x: number) => x.toLocaleString("en-US");
  return (<>
    <section className="sec">
      <div className="sec-h"><h2>{zh ? "按工作区和日期的成本与令牌" : "Cost and tokens by workspace and day"}</h2></div>
      {!rows ? <p className="quiet">{zh ? "加载中…" : "Loading…"}</p> : rows.length ? (
        <div className="tscroll"><table className="ah-t"><thead><tr><th>{zh ? "日期" : "Day"}</th><th>{zh ? "企业" : "Business"}</th><th>{zh ? "运行" : "Runs"}</th><th>{zh ? "令牌（输入，输出）" : "Tokens in, out"}</th><th>{zh ? "缓存命中" : "Cache hits"}</th><th>{zh ? "工具出错" : "Tool errors"}</th><th>{zh ? "成本" : "Cost"}</th></tr></thead>
          <tbody>{rows.map(r => { const prompt = r.input + r.cache_read + r.cache_write; return (
            <tr key={r.workspace_id + r.day}><td>{fmtDay(r.day, lang)}</td><td>{r.business ?? r.workspace_id.slice(0, 8)}</td><td>{r.runs}</td><td>{n(prompt)}, {n(r.output)}</td>
              <td>{prompt ? `${Math.round((1000 * r.cache_read) / prompt) / 10}%` : "-"}</td><td>{r.tool_calls ? `${r.tool_errors} / ${r.tool_calls}` : "-"}</td><td>{usd(r.cost_usd, 4)}</td></tr>); })}</tbody></table></div>
      ) : <p className="quiet">{zh ? "这段时间没有运行。" : "No runs in this window."}</p>}
    </section>
    <section className="sec">
      <div className="sec-h"><h2>{zh ? "查找运行" : "Find runs by their trace"}</h2></div>
      <form className="tr-find" onSubmit={e => { e.preventDefault(); find(); }}>
        <input type="text" value={q.tool} maxLength={80} onChange={e => setQ({ ...q, tool: e.target.value })} placeholder={zh ? "工具名，例如 fill_fields" : "Tool name, e.g. fill_fields"} aria-label={zh ? "工具名" : "Tool name"} autoComplete="off" />
        <label className="check"><input type="checkbox" checked={q.failed} onChange={e => setQ({ ...q, failed: e.target.checked })} /><span>{zh ? "只看失败" : "Failed only"}</span></label>
        <label className="check"><input type="checkbox" checked={q.slow} onChange={e => setQ({ ...q, slow: e.target.checked })} /><span>{zh ? "只看慢调用" : "Slow calls only"}</span></label>
        <button type="submit" className="sbtn ink">{zh ? "查找" : "Find"}</button>
      </form>
      {found && (found.length ? <RunRows rows={found.map(h => ({ ...h, title: `${h.title || h.prompt} (${zh ? `${h.hits} 次匹配` : `${h.hits} matching`})` }))} onOpen={onOpen} />
        : <p className="quiet">{zh ? "没有符合的运行。" : "No runs match."}</p>)}
    </section>
  </>);
}

function Replay({ id, onClose }: { id: string; onClose: () => void }) {
  const { b, lang } = useApp();
  const zh = lang === "zh";
  const [r, setR] = useState<ops.RunReplay | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { void ops.runReplay(id).then(setR).catch(e => setErr((e as api.ApiError).message)); }, [id]);
  const s = (iso: string | null) => (iso && r ? (new Date(iso).getTime() - new Date(r.created_at).getTime()) / 1000 : null);
  return (
    <Modal label={zh ? "运行回放" : "Run replay"} onClose={onClose} wide>
      <header className="m-h rr-h">
        <span className="m-eyebrow"><I.play />{r?.business || (zh ? "运行回放" : "Run replay")}</span>
        {r && <h2>{r.title ? b(r.title) : r.prompt.slice(0, 120)}</h2>}
        {r && <p>{[word(r.kind, zh), word(r.channel, zh), word(r.status, zh), stamp(r.created_at, zh)].filter(Boolean).join(zh ? "，" : ", ")}</p>}
        <button type="button" className="icbtn close" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><I.x /></button>
      </header>
      <div className="m-body rr">
        {err && <p className="pt-warn">{err}</p>}
        {!r ? !err && <p className="quiet">{zh ? "加载中…" : "Loading…"}</p> : (<>
          <dl className="rr-kv">
            <div><dt>{zh ? "首次回复" : "First reply"}</dt><dd>{dur(s(r.first_reply_at))}</dd></div>
            <div><dt>{zh ? "完成" : "Done"}</dt><dd>{dur(s(r.done_at))}</dd></div>
            <div><dt>{zh ? "工具" : "Tools"}</dt><dd>{r.tool_calls == null ? "-" : zh ? `${r.tool_calls} 次，${r.tool_errors ?? 0} 次出错` : `${r.tool_calls}, ${r.tool_errors ?? 0} errors`}</dd></div>
            <div><dt>{zh ? "AI 成本（估算）" : "AI cost (estimate)"}</dt><dd>{usd(r.cost_usd, 4)}</dd></div>
          </dl>
          <h3>{zh ? "要求" : "What was asked"}</h3>
          <p className="rr-prompt">{r.prompt}</p>
          <h3>{zh ? "步骤" : "Steps, in order"}</h3>
          <ol className="rr-steps">{r.steps.map((x, i) => <li key={i}>{b(x.label)}{x.tool ? <code>{x.tool}</code> : null}</li>)}</ol>
          {r.trace && r.trace.length > 0 && <><h3>{zh ? "运行轨迹" : "Trace"}</h3><Trace spans={r.trace} /></>}
          <h3>{zh ? "AI 调用" : "AI calls while it ran"}</h3>
          {r.calls.length ? (
            <div className="tscroll"><table className="ah-t"><thead><tr><th>{zh ? "时间" : "At"}</th><th>{zh ? "用途" : "Role"}</th><th>{zh ? "服务商" : "Vendor"}</th><th>{zh ? "模型" : "Model"}</th><th>{zh ? "成本" : "Cost"}</th><th>{zh ? "节省模式" : "Saver"}</th></tr></thead>
              <tbody>{r.calls.map((c, i) => <tr key={i}><td>+{dur(s(c.at))}</td><td>{word(c.role ?? c.kind, zh)}</td><td>{c.provider ?? "-"}</td><td>{c.model ?? "-"}</td><td>{usd(c.cost_usd, 4)}</td><td>{c.saver == null ? "-" : c.saver ? (zh ? "是" : "yes") : (zh ? "否" : "no")}</td></tr>)}</tbody></table></div>
          ) : <p className="quiet">{zh ? "这段时间没有 AI 调用记录。" : "No AI calls recorded in that window."}</p>}
          {r.checks.length > 0 && <><h3>{zh ? "独立核对" : "Independent checks of its jobs"}</h3><ul className="rr-checks">{r.checks.map(c => <li key={c.job_id}>{c.job_id}: {c.passed} / {c.of}{c.passed === c.of ? (zh ? "，首次通过" : ", passed first time") : ""}</li>)}</ul></>}
          {r.reply && <><h3>{zh ? "回复" : "The reply"}</h3><div className="rr-reply">{r.reply.map((t, i) => <p key={i}>{b(t)}</p>)}</div></>}
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
        <span className="arow-n"><b title={r.title ?? ""}>{r.title || word(r.kind, zh)}</b><small>{[r.business, word(r.channel, zh), word(r.status, zh), stamp(r.created_at, zh)].filter(Boolean).join(zh ? "，" : ", ")}</small></span>
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
          <div><dt>{zh ? "每次运行 AI 成本" : "AI cost per run"}</dt><dd>{usdRun(t!.cost_per_run_usd)}</dd><small>{zh ? `共 ${usd(t!.ai_cost_usd)}` : `${usd(t!.ai_cost_usd)} in all`}</small></div>
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
                <td>{dur(d.reply_p50_s)}<small> / {dur(d.reply_p95_s)}</small></td><td>{dur(d.done_p50_s)}<small> / {dur(d.done_p95_s)}</small></td><td>{usdRun(d.cost_per_run_usd)}</td><td>{pct(d.saver_pct)}</td><td>{d.throttles}</td></tr>
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
        <section className="sec"><div className="sec-h"><h2>{zh ? "最贵的 10 次运行" : "The 10 most expensive runs"}</h2></div><RunRows rows={h.costliest} onOpen={setRun} />
          <p className="note">{zh ? "单次运行的成本，按运行期间该工作区的 AI 调用计算；同一工作区同时进行的运行会共享这些调用。" : "A run's cost counts its workspace's AI calls while it ran, so runs at the same moment in one workspace share them."}</p></section>

        <UsageAndSearch days={days} onOpen={setRun} />

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
  const [edit, setEdit] = useState<Record<string, { pct: string; months: string; fee: string }>>({});
  const [pay, setPay] = useState<Record<string, { amount: string; on: string; ref: string }>>({});
  const [terms, setTerms] = useState<{ plan: string; fee: string } | null>(null);
  const load = useCallback(async () => {
    try { setRows(await pa.partnerAdminList()); } catch (e) { say((e as api.ApiError).message); setRows([]); }
    try { const t = await pa.partnerTermsGet(); setTerms({ plan: String(t.plan_pct), fee: String(t.fee_pct) }); } catch { setTerms(null); }
  }, [say]);
  useEffect(() => { void load(); }, [load]);
  const set = async (p: pa.PartnerAdminRow, status: pa.PartnerStatus) => {
    const e = edit[p.id];
    // blank goes back to the default terms (-1); a number is this partner's own
    const own = (v: string | undefined, had: number | null | undefined) => (v === undefined ? null : v.trim() ? Number(v) : had != null ? -1 : null);
    const monthsN = e?.months.trim() ? Number(e.months) : null;
    try { await pa.partnerAdminSet(p.id, status, own(e?.pct, p.share_pct), monthsN, own(e?.fee, p.fee_pct)); say(zh ? "已保存" : "Saved"); await load(); } catch (x) { say((x as api.ApiError).message); }
  };
  const saveTerms = async () => {
    if (!terms) return;
    try { await pa.partnerTermsSet(Number(terms.plan), Number(terms.fee)); say(zh ? "默认佣金已保存" : "Default commission saved"); await load(); } catch (x) { say((x as api.ApiError).message); }
  };
  const payout = async (p: pa.PartnerAdminRow) => {
    const f = pay[p.id];
    if (!f || !(Number(f.amount) > 0) || !f.on) { say(zh ? "请填写金额和付款日期。" : "Enter the amount and the day it was paid."); return; }
    try { await pa.partnerPayoutAdd(p.id, Number(f.amount), f.on, f.ref); say(zh ? "已记录付款" : "Payout recorded"); setPay(x => ({ ...x, [p.id]: { amount: "", on: "", ref: "" } })); await load(); } catch (x) { say((x as api.ApiError).message); }
  };
  const pending = (rows ?? []).filter(p => p.status === "pending").length;
  return (
    <Frame tab="partners" title={B("Partners", "合作伙伴")} sub={B("Approve the people who bring brands to Placetta, set the commission (a default, or each partner's own), and record the payouts you make by hand. Nothing here moves money. Partners see only the referrals that agreed to share.", "审核把品牌带到快哉的合作伙伴，设定佣金（默认值或各自的比例），并记录您手动支付的款项。这里不会转出任何资金。合作伙伴只能看到同意共享的推荐商家。")}>
      {terms && (
        <form className="pa-row" onSubmit={x => { x.preventDefault(); void saveTerms(); }}>
          <label><span>{zh ? "默认方案佣金 %" : "Default plan %"}</span><input inputMode="decimal" value={terms.plan} onChange={x => setTerms({ ...terms, plan: x.target.value })} /></label>
          <label><span>{zh ? "默认执照服务费佣金 %" : "Default license fee %"}</span><input inputMode="decimal" value={terms.fee} onChange={x => setTerms({ ...terms, fee: x.target.value })} /></label>
          <button type="submit" className="sbtn line">{zh ? "保存默认值" : "Save defaults"}</button>
        </form>
      )}
      <dl className="hq-tot ops-tot">
        <div className={pending ? "warn" : ""}><dt>{zh ? "待审核" : "Waiting for review"}</dt><dd>{pending}</dd></div>
        <div><dt>{zh ? "已批准" : "Approved"}</dt><dd>{(rows ?? []).filter(p => p.status === "approved").length}</dd></div>
        <div><dt>{zh ? "推荐商家" : "Businesses referred"}</dt><dd>{(rows ?? []).reduce((s, p) => s + p.referred, 0)}</dd></div>
        <div><dt>{zh ? "待支付分成" : "Share not yet paid"}</dt><dd>{usd((rows ?? []).reduce((s, p) => s + Math.max(0, p.earned_usd - p.paid_usd), 0))}</dd><small>{zh ? "含本月进行中" : "including this month so far"}</small></div>
      </dl>
      {rows === null ? <p className="quiet">{zh ? "加载中…" : "Loading…"}</p> : rows.length === 0 ? <div className="empty"><p>{zh ? "还没有合作伙伴申请。" : "No partner applications yet."}</p></div> : (
        <div className="pa-list">{rows.map(p => {
          const e = edit[p.id] ?? { pct: p.share_pct == null ? "" : String(p.share_pct), months: String(p.share_months), fee: p.fee_pct == null ? "" : String(p.fee_pct) };
          const f = pay[p.id] ?? { amount: "", on: "", ref: "" };
          return (
            <article key={p.id} className="pa">
              <header><span><b>{p.org_name}</b><small>{[b(PARTNER_KIND[p.kind]), p.contact_name, p.email].filter(Boolean).join(zh ? "，" : ", ")}</small></span><span className={"pt-tag" + (p.status === "pending" ? " warm" : "")}>{b(STATUS[p.status])}</span></header>
              {p.note && <q className="rq-note">{p.note}</q>}
              <p className="rq-meta">{[p.website ?? "", p.code ? (zh ? `推荐码 ${p.code}` : `code ${p.code}`) : "", zh ? `推荐 ${p.referred} 家，${p.sharing} 家共享` : `${p.referred} referred, ${p.sharing} sharing`,
                zh ? `分成 ${usd(p.earned_usd)}，已付 ${usd(p.paid_usd)}` : `earned ${usd(p.earned_usd)}, paid ${usd(p.paid_usd)}`].filter(Boolean).join(zh ? "，" : ", ")}</p>
              <div className="pa-row">
                <label><span>{zh ? "方案佣金 %" : "Plan %"}</span><input inputMode="decimal" value={e.pct} onChange={x => setEdit(s => ({ ...s, [p.id]: { ...e, pct: x.target.value } }))} placeholder={zh ? `默认 ${terms?.plan ?? 15}` : `default ${terms?.plan ?? 15}`} /></label>
                <label><span>{zh ? "执照服务费佣金 %" : "License fee %"}</span><input inputMode="decimal" value={e.fee} onChange={x => setEdit(s => ({ ...s, [p.id]: { ...e, fee: x.target.value } }))} placeholder={zh ? `默认 ${terms?.fee ?? 10}` : `default ${terms?.fee ?? 10}`} /></label>
                <label><span>{zh ? "月数" : "Months"}</span><input inputMode="numeric" value={e.months} onChange={x => setEdit(s => ({ ...s, [p.id]: { ...e, months: x.target.value } }))} /></label>
                {p.status !== "approved" && <button type="button" className="sbtn ink" onClick={() => void set(p, "approved")}>{zh ? "批准" : "Approve"}</button>}
                {p.status === "approved" && <button type="button" className="sbtn line" onClick={() => void set(p, "approved")}>{zh ? "保存佣金" : "Save commission"}</button>}
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
            <article key={i.id} className="inc">
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

/* ------------------------------ measured outcomes ------------------------------ */

/** "n 23": the sample a number was measured on. */
const nOf = (n: number | null | undefined, zh: boolean) => (zh ? `样本 ${n ?? 0}` : `n ${n ?? 0}`);

/** What each filing really took (migration 20261105091400_outcomes.sql), every number with its sample, the sourced
    baseline, the flywheel and the export for investors. Probe workspaces never count. */
function Outcomes() {
  const { lang, say } = useApp();
  const zh = lang === "zh";
  const [m, setM] = useState<OutcomeMetrics | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { ops.outcomeMetrics().then(setM, e => say((e as api.ApiError).message)); }, [say]);
  const exportCsv = async () => {
    setBusy(true);
    try {
      const rows = await ops.outcomeExport();
      const url = URL.createObjectURL(new Blob([outcomesCsv(rows, m)], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `placetta-outcomes-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { say((e as api.ApiError).message); } finally { setBusy(false); }
  };
  const tile = (label: string, value: string, x: Measured | { n: number }, warn = false) => (
    <div className={warn ? "warn" : ""}><dt>{label}</dt><dd>{value}</dd><small>{nOf(x.n, zh)}</small></div>
  );
  const kind = (k: string) => (k === "diy" ? (zh ? "自己办" : "Do it yourself") : k === "expediter" ? (zh ? "代办公司" : "Expediter") : (zh ? "顾问" : "Consultant"));
  return (
    <Frame tab="outcomes" title={B("Outcomes", "成效")}
      sub={B("What each filing really took, measured from the log, with the sample under every number. Probe workspaces never count.", "每份申请实际花了多少，按记录测量，每个数字都注明样本数。测试工作区不计入。")}
      act={<button type="button" className="sbtn line" disabled={busy || !m} onClick={() => void exportCsv()}>{zh ? "导出 CSV" : "Export CSV"}</button>}>
      {!m ? <p className="quiet">{zh ? "加载中…" : "Loading…"}</p> : (<>
        <dl className="hq-tot ops-tot">
          {tile(zh ? "已批准的许可证" : "Licenses approved", shown(m.licenses_approved.value, "", 0), m.licenses_approved)}
          {tile(zh ? "批准用时中位数" : "Median days to approval", shown(m.median_days.value, zh ? " 天" : " days"), m.median_days)}
          {tile(zh ? "全程无人经手" : "Filed with no person", m.human_free.pct == null ? "-" : `${m.human_free.pct}%`, m.human_free)}
          {tile(zh ? "每张许可证店主操作次数" : "Owner touches per license", shown(m.owner_touches.mean), m.owner_touches)}
          {tile(zh ? "每张许可证店主小时（估算）" : "Owner hours per license (estimated)", shown(m.owner_touches.hours_mean, "", 2), m.owner_touches)}
          {tile(zh ? "每张许可证团队分钟" : "Team minutes per license", shown(m.team_minutes.mean), m.team_minutes)}
          {tile(zh ? "每张许可证 AI 成本" : "AI cost per license", shown(m.ai_usd.mean, "$"), m.ai_usd)}
          {tile(zh ? "每张许可证毛利" : "Gross margin per license", shown(m.margin.per_license_mean, "$"), m.margin, (m.margin.per_license_mean ?? 0) < 0)}
          {tile(zh ? "按时续期" : "Renewed on time", m.renewals.on_time_pct == null ? "-" : `${m.renewals.on_time_pct}%`, m.renewals)}
          {tile(zh ? "工作区留存（90 天）" : "Workspaces retained (90 days)", m.workspaces.retained_pct == null ? "-" : `${m.workspaces.retained_pct}%`, m.workspaces)}
        </dl>
        <p className="note">{zh
          ? `店主小时按每次操作估算：批准 ${m.rules.touch_minutes.approval} 分钟，上传 ${m.rules.touch_minutes.upload} 分钟，交回处理 ${m.rules.touch_minutes.hand_back} 分钟，回复 ${m.rules.touch_minutes.answer} 分钟。团队按每小时 $${m.rules.team_hour_usd} 计。已排除 ${m.probe_filings_left_out} 份测试申请。`
          : `Owner hours are estimated per touch: approving ${m.rules.touch_minutes.approval} min, an upload ${m.rules.touch_minutes.upload}, picking up a hand-back ${m.rules.touch_minutes.hand_back}, an answer ${m.rules.touch_minutes.answer}. Team time at $${m.rules.team_hour_usd} an hour. ${m.probe_filings_left_out} probe filings left out.`}</p>

        <section className="sec">
          <div className="sec-h"><h2>{zh ? "毛利" : "Gross margin"}<em className="pt-n">{nOf(m.margin.n, zh)}</em></h2></div>
          <div className="tscroll"><table className="ah-t">
            <thead><tr><th>{zh ? "收入" : "Revenue"}</th><th>Stripe</th><th>AI</th><th>{zh ? "浏览器" : "Browser"}</th><th>{zh ? "电话和传真" : "Phone and fax"}</th><th>{zh ? "团队" : "Team"}</th><th>{zh ? "毛利" : "Margin"}</th></tr></thead>
            <tbody><tr><td>{shown(m.margin.revenue, "$")}</td><td>{shown(m.margin.stripe, "$")}</td><td>{shown(m.margin.ai, "$")}</td><td>{shown(m.margin.browser, "$")}</td><td>{shown(m.margin.telephony, "$")}</td><td>{shown(m.margin.team, "$")}</td><td>{shown(m.margin.total, "$")}{m.margin.pct != null ? ` (${m.margin.pct}%)` : ""}</td></tr></tbody>
          </table></div>
          <p className="note">{zh ? `收入为每份申请的许可证收费，不含订阅。另有工作区内 Odelia 对话和规划的 AI：每张许可证 ${shown(m.ai_usd.other_per_license, "$")}。` : `Revenue is the license charge on each filing, not the plan subscription. Odelia's chat and planning AI in those workspaces adds ${shown(m.ai_usd.other_per_license, "$")} a license.`}</p>
        </section>

        <section className="sec">
          <div className="sec-h"><h2>{zh ? "飞轮：随同一表格申请次数增加" : "The flywheel: by how many times the form was filed before"}</h2></div>
          {m.flywheel.length === 0 ? <div className="empty"><p>{zh ? "还没有已批准的申请。" : "No approved filings yet."}</p></div> : (
            <div className="tscroll"><table className="ah-t">
              <thead><tr><th>{zh ? "第几次" : "Filing of the form"}</th><th>{zh ? "样本" : "n"}</th><th>{zh ? "成本中位数" : "Median cost"}</th><th>{zh ? "天数中位数" : "Median days"}</th><th>{zh ? "团队分钟中位数" : "Median team minutes"}</th><th>{zh ? "无人经手" : "No person"}</th></tr></thead>
              <tbody>{m.flywheel.map(b => <tr key={b.bucket}><td>{b.bucket}</td><td>{b.n}</td><td>{shown(b.median_cost_usd, "$")}</td><td>{shown(b.median_days)}</td><td>{shown(b.median_team_minutes)}</td><td>{b.human_free_pct == null ? "-" : `${b.human_free_pct}%`}</td></tr>)}</tbody>
            </table></div>
          )}
          {m.first_vs_tenth.length > 0 && (
            <div className="tscroll"><table className="ah-t">
              <thead><tr><th>{zh ? "表格" : "Form"}</th><th>{zh ? "第 1 次成本" : "1st cost"}</th><th>{zh ? "第 10 次成本" : "10th cost"}</th><th>{zh ? "第 1 次天数" : "1st days"}</th><th>{zh ? "第 10 次天数" : "10th days"}</th></tr></thead>
              <tbody>{m.first_vs_tenth.map(r => <tr key={r.form}><td>{r.form}</td><td>{shown(r.first_cost, "$")}</td><td>{shown(r.tenth_cost, "$")}</td><td>{shown(r.first_days)}</td><td>{shown(r.tenth_days)}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>

        <section className="sec">
          <div className="sec-h"><h2>{zh ? "各机构批准用时" : "Days to approval by agency"}</h2></div>
          {m.by_agency.length === 0 ? <div className="empty"><p>{zh ? "还没有已批准的申请。" : "No approved filings yet."}</p></div> : (
            <div className="tscroll"><table className="ah-t">
              <thead><tr><th>{zh ? "机构" : "Agency"}</th><th>{zh ? "样本" : "n"}</th><th>{zh ? "中位数" : "Median days"}</th><th>{zh ? "用于开业估算" : "Used in the opening estimate"}</th></tr></thead>
              <tbody>{m.by_agency.map(r => <tr key={r.agency ?? "?"}><td>{r.agency ?? "-"}</td><td>{r.n}</td><td>{shown(r.median_days)}</td><td>{r.n >= m.rules.agency_min_n ? (zh ? "是" : "Yes") : (zh ? `满 ${m.rules.agency_min_n} 份后` : `From ${m.rules.agency_min_n}`)}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>

        <section className="sec">
          <div className="sec-h"><h2>{zh ? "退回原因库" : "Why agencies sent filings back"}</h2></div>
          <p className="note">{zh ? `已退回 ${m.rejections.rejected ?? 0} 份，要求补件 ${m.rejections.returned ?? 0} 次，重新提交 ${m.rejections.resubmissions ?? 0} 次（样本 ${m.rejections.n}）。Odelia 提交同一表格前会对照这些原因。` : `${m.rejections.rejected ?? 0} rejected, ${m.rejections.returned ?? 0} sent back for more, ${m.rejections.resubmissions ?? 0} resubmissions (n ${m.rejections.n}). Odelia checks the next filing of a form against these before it goes.`}</p>
          {m.rejection_reasons.length > 0 && (
            <div className="tscroll"><table className="ah-t">
              <thead><tr><th>{zh ? "表格" : "Form"}</th><th>{zh ? "原因" : "Reason"}</th><th>{zh ? "次数" : "Seen"}</th></tr></thead>
              <tbody>{m.rejection_reasons.map(r => <tr key={r.form + r.reason}><td>{r.form}</td><td>{r.reason}</td><td>{r.seen}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>

        <section className="sec">
          <div className="sec-h"><h2>{zh ? "录制步骤的复用次数" : "Recorded steps, and how often they were reused"}</h2></div>
          {m.scripts.length + m.playbooks.length === 0 ? <div className="empty"><p>{zh ? "还没有复用。" : "Nothing reused yet."}</p></div> : (
            <div className="tscroll"><table className="ah-t">
              <thead><tr><th>{zh ? "步骤" : "Steps"}</th><th>{zh ? "复用" : "Reused"}</th><th>{zh ? "成功" : "Went through"}</th></tr></thead>
              <tbody>
                {m.scripts.map(x => <tr key={"s" + x.key}><td>{x.name}</td><td>{x.uses}</td><td>-</td></tr>)}
                {m.playbooks.map(x => <tr key={"p" + x.host + x.official}><td>{x.official} ({x.host})</td><td>{x.runs}</td><td>{x.successes}</td></tr>)}
              </tbody>
            </table></div>
          )}
        </section>

        <section className="sec">
          <div className="sec-h"><h2>{zh ? "对照：其他办法的花费" : "Against the alternative"}</h2></div>
          <div className="tscroll"><table className="ah-t">
            <thead><tr><th>{zh ? "表格" : "Form"}</th><th>{zh ? "办法" : "Way"}</th><th>{zh ? "价格" : "Price"}</th><th>{zh ? "天数" : "Days"}</th><th>{zh ? "小时" : "Hours"}</th><th>{zh ? "来源" : "Source"}</th></tr></thead>
            <tbody>{m.baseline.map(x => (
              <tr key={x.form + x.kind + x.provider}><td>{x.form}</td><td>{kind(x.kind)}: {x.provider}</td><td>{shown(x.price_usd, "$")}</td>
                <td>{x.days == null ? "-" : `${x.days}${x.days_unit === "business" ? (zh ? " 个工作日" : " business") : ""}`}</td><td>{shown(x.hours, "", 2)}</td>
                <td><a href={x.source_url} target="_blank" rel="noreferrer">{(() => { try { return new URL(x.source_url).hostname.replace(/^www\./, ""); } catch { return x.source_url; } })()}</a> <small>{fmtDay(x.read_on, lang, true)}</small></td></tr>
            ))}</tbody>
          </table></div>
          <p className="note">{zh ? `网站只在双方都有实测或有来源、且至少 ${m.rules.public_min_n} 份真实申请时才显示对照。` : `The website shows a comparison only where both sides are measured or sourced, with ${m.rules.public_min_n} or more real filings behind it.`}</p>
        </section>
      </>)}
    </Frame>
  );
}
