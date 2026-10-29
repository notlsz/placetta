import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./bi";
import type { Lang } from "./i18n";
import { S } from "./i18n";
import { anything, filingSpeed, monthMetrics, type Item, type MonthAcross, type MonthMetrics, type MonthRow } from "./monthly";
import { daysFromNow, fmtAgo, fmtDay, fmtMonth } from "./time";
import * as api from "./cloud/api";
import "./recall-metrics.css";

/* What Odelia did this month (src/monthly.ts): a compact card of measured numbers, each a button that opens the list
   behind it. On Home (this workspace), on Headquarters (every franchisee that shared with you) and for the Placetta
   team on the filing queue (every workspace). A number with no record behind it isn't shown. */

/** A duration as a person reads it: 400 ms, 2.4 s, 18 s, 4 min, 1.5 h. */
function dur(ms: number, lang: Lang): string {
  const zh = lang === "zh";
  if (ms < 1000) return zh ? `${Math.round(ms)} 毫秒` : `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) { const v = s < 10 ? Math.round(s * 10) / 10 : Math.round(s); return zh ? `${v} 秒` : `${v} s`; }
  const m = s / 60;
  if (m < 60) { const v = Math.round(m); return zh ? `${v} 分钟` : `${v} min`; }
  const h = Math.round((m / 60) * 10) / 10;
  // a filing can take days from approval to the agency: past two days, say days
  if (h >= 48) { const d = Math.round((h / 24) * 10) / 10; return zh ? `${d} 天` : `${d} days`; }
  return zh ? `${h} 小时` : `${h} h`;
}
const waitedFor = (iso: string, lang: Lang) => fmtAgo(iso, lang);

type Tile = { id: string; value: string; label: Bi; sub?: string; list: ReactNode; open?: { label: Bi; go: () => void } };

/** The card itself: the tiles, and the records behind whichever one is open. */
function Card({ title, month, tiles, note, lang }: { title: Bi; month: string; tiles: Tile[]; note: Bi; lang: Lang }) {
  const [open, setOpen] = useState<string | null>(null);
  const b = (x: Bi) => x[lang];
  const cur = tiles.find(t => t.id === open);
  if (!tiles.length) return null;
  return (
    <section className="sec met" aria-label={b(title)}>
      <div className="sec-h"><h2>{b(title)}<span className="for">{fmtMonth(month, lang)}</span></h2></div>
      <div className="met-card">
        <div className="met-grid">
          {tiles.map(t => (
            <button key={t.id} type="button" className={"met-tile" + (open === t.id ? " on" : "")} aria-expanded={open === t.id} aria-controls={`met-ev-${t.id}`} onClick={() => setOpen(o => (o === t.id ? null : t.id))}>
              <b>{t.value}</b><span>{b(t.label)}</span>{t.sub && <small>{t.sub}</small>}
            </button>
          ))}
        </div>
        {cur && (
          <div className="met-ev" id={`met-ev-${cur.id}`} role="region" aria-label={b(cur.label)}>
            <div className="met-ev-h"><b>{b(cur.label)}</b>{cur.open && <button type="button" className="more" onClick={cur.open.go}>{b(cur.open.label)}</button>}</div>
            {cur.list}
          </div>
        )}
        <p className="met-note">{b(note)}</p>
      </div>
    </section>
  );
}

const Rows = ({ rows }: { rows: { key: string; main: string; side?: string }[] }) => (
  <ul className="met-rows">{rows.map(r => <li key={r.key}><span>{r.main}</span>{r.side && <small>{r.side}</small>}</li>)}</ul>
);

/** One workspace's tiles. go: open the page a list lives on (Home), when there is one. */
function tilesOf(m: MonthMetrics, lang: Lang, go?: (v: "permits" | "odelia", sub?: string) => void): Tile[] {
  const zh = lang === "zh", b = (x: Bi) => x[lang];
  const t = (k: string) => (S as Record<string, Bi>)[k]?.[lang] ?? k;
  const items = (xs: Item[], side: (x: Item) => string | undefined) => <Rows rows={xs.map(x => ({ key: x.id, main: b(x.title), side: side(x) }))} />;
  const n = (k: number) => String(k);
  const out: Tile[] = [];
  if (m.plan_ms != null) out.push({ id: "plan", value: dur(m.plan_ms, lang), label: B("Time to plan", "生成计划用时"),
    list: <Rows rows={[{ key: "p", main: zh ? `从注册到计划出现在首页：梳理了 ${m.plan_apps ?? 0} 项许可` : `From your signup to the plan on Home: ${m.plan_apps ?? 0} permits mapped`, side: m.plan_at ? fmtDay(m.plan_at.slice(0, 10), lang, true) : undefined }]} /> });
  const timed = m.runs.filter(r => r.first_ms != null || r.done_ms != null);
  const runList = <Rows rows={timed.map(r => ({ key: r.id, main: r.prompt.length >= 120 ? r.prompt.trimEnd() + "…" : r.prompt, side: [r.first_ms != null ? (zh ? `首次回复 ${dur(r.first_ms, lang)}` : `first words in ${dur(r.first_ms, lang)}`) : "", r.done_ms != null ? (zh ? `完成 ${dur(r.done_ms, lang)}` : `done in ${dur(r.done_ms, lang)}`) : ""].filter(Boolean).join(zh ? "，" : ", ") }))} />;
  if (m.median_first_ms != null) out.push({ id: "first", value: dur(m.median_first_ms, lang), label: B("Median time to first reply", "首次回复中位用时"), sub: zh ? `${timed.length} 次请求` : `${timed.length} request${timed.length === 1 ? "" : "s"}`, list: runList, open: go && { label: B("Open the chat", "打开对话"), go: () => go("odelia", "chat") } });
  if (m.median_done_ms != null) out.push({ id: "done", value: dur(m.median_done_ms, lang), label: B("Median time to job done", "完成工作中位用时"), list: runList, open: go && { label: B("Open the chat", "打开对话"), go: () => go("odelia", "chat") } });
  if (m.mapped.length) out.push({ id: "mapped", value: n(m.mapped.length), label: B("Permits mapped", "已梳理许可"), list: items(m.mapped, x => (x.status ? t("s_" + x.status) : undefined)), open: go && { label: B("Open Permits", "打开许可"), go: () => go("permits") } });
  if (m.filled.length) out.push({ id: "filled", value: n(m.filled.length), label: B("Applications filled", "已填好申请"), list: items(m.filled, x => (x.status ? t("s_" + x.status) : undefined)), open: go && { label: B("Open Permits", "打开许可"), go: () => go("permits") } });
  const oldest = m.waiting.map(x => x.at).filter((x): x is string => !!x).sort()[0];
  if (m.waiting.length) out.push({ id: "waiting", value: n(m.waiting.length), label: B("Approvals waiting for you", "等您批准"), sub: oldest ? (zh ? `最早的 ${waitedFor(oldest, lang)}提出` : `oldest asked ${waitedFor(oldest, lang).toLowerCase()}`) : undefined,
    list: items(m.waiting, x => (x.at ? (zh ? `${waitedFor(x.at, lang)}提出` : `asked ${waitedFor(x.at, lang).toLowerCase()}`) : undefined)) });
  if (m.submitted.length) out.push({ id: "submitted", value: n(m.submitted.length), label: B("Filings submitted this month", "本月已提交"), list: items(m.submitted, x => (x.at ? fmtDay(x.at.slice(0, 10), lang) : undefined)), open: go && { label: B("Open licenses", "打开执照"), go: () => go("permits") } });
  // speed to filing, measured: approval to the agency having it, each filing with who sent it and its time from the plan
  if (m.filed?.length && m.median_filed_ms != null) {
    const who = (by: "odelia" | "team") => (by === "odelia" ? "Odelia" : zh ? "快哉团队" : "the Placetta team");
    const split = [m.median_odelia_ms != null ? (zh ? `Odelia ${dur(m.median_odelia_ms, lang)}` : `Odelia ${dur(m.median_odelia_ms, lang)}`) : "", m.median_team_ms != null ? (zh ? `团队 ${dur(m.median_team_ms, lang)}` : `team ${dur(m.median_team_ms, lang)}`) : ""].filter(Boolean).join(zh ? "，" : ", ");
    out.push({ id: "filed", value: dur(m.median_filed_ms, lang), label: B("Median time from your approval to filed", "从您批准到提交的中位用时"), sub: split || undefined,
      list: <Rows rows={m.filed.map(x => ({ key: x.id, main: b(x.title), side: [zh ? `${who(x.by)}用时 ${dur(x.ms, lang)}` : `${dur(x.ms, lang)} by ${who(x.by)}`, x.plan_ms != null ? (zh ? `距计划 ${dur(x.plan_ms, lang)}` : `${dur(x.plan_ms, lang)} from the plan`) : ""].filter(Boolean).join(zh ? "，" : ", ") }))} />,
      open: go && { label: B("Open licenses", "打开执照"), go: () => go("permits") } });
  }
  if (m.approved.length) out.push({ id: "approved", value: n(m.approved.length), label: B("Approved by agencies this month", "本月获机构批准"), list: items(m.approved, x => (x.at ? fmtDay(x.at.slice(0, 10), lang) : undefined)), open: go && { label: B("Open licenses", "打开执照"), go: () => go("permits") } });
  if (m.renewals.length) out.push({ id: "renewals", value: n(m.renewals.length), label: B("Renewals caught before they lapse", "提前盯住的续期"), list: items(m.renewals, x => (x.date ? fmtDay(x.date, lang, true) : undefined)), open: go && { label: B("Open Deadlines", "打开截止日期"), go: () => go("permits", "deadlines") } });
  return out;
}

const TITLE = B("What Odelia did this month", "Odelia 本月做了什么");
const NOTE = B("Measured from this workspace's own records. Tap a number to see the list behind it.", "全部来自本工作区的记录。点按数字即可查看背后的清单。");

/** Home: this workspace. In an account the numbers come from the server (agent_runs, filings and the saved workspace,
 *  odelia_month_detail); in the sample, from the workspace here and the requests timed in this browser. */
export function HomeMetrics() {
  const { lang, ws, cloud, go } = useApp();
  const [server, setServer] = useState<MonthMetrics | null>(null);
  const wsId = cloud?.wsId;
  useEffect(() => {
    if (!wsId) return;
    let on = true;
    const load = () => void api.odeliaMonth(wsId).then(m => { if (on && m) setServer(m); });
    load();
    const t = window.setInterval(load, 60_000);
    return () => { on = false; window.clearInterval(t); };
  }, [wsId]);
  const local = useMemo(() => monthMetrics(ws, { today: daysFromNow(0), ...(cloud ? { filings: cloud.filings } : {}) }), [ws, cloud]);
  // speed to filing is timed here from the filings rows (approved_at, submitted_at, channel), for the server's month too
  const m = useMemo(() => (server ? { ...server, ...(cloud ? filingSpeed(cloud.filings, server.month, ws.firstPlan?.at) : {}) } : local), [server, local, cloud, ws.firstPlan?.at]);
  if (!anything(m)) return null;
  return <Card title={TITLE} month={m.month} tiles={tilesOf(m, lang, go)} note={NOTE} lang={lang} />;
}

/** The tiles across workspaces: the totals, each opening the row for every workspace behind it. */
function acrossTiles(a: MonthAcross, lang: Lang, label: (r: MonthRow) => string): Tile[] {
  const zh = lang === "zh", tt = a.totals;
  const by = (pick: (r: MonthRow) => number | null, fmt: (v: number) => string) => <Rows rows={a.rows.filter(r => (pick(r) ?? 0) > 0).map(r => ({ key: r.workspace_id, main: label(r), side: fmt(pick(r)!) }))} />;
  const count = (v: number) => String(v);
  const out: Tile[] = [];
  if (tt.median_plan_ms != null) out.push({ id: "plan", value: dur(tt.median_plan_ms, lang), label: B("Median time to plan", "生成计划中位用时"), list: by(r => r.plan_ms, v => dur(v, lang)) });
  if (tt.median_first_ms != null) out.push({ id: "first", value: dur(tt.median_first_ms, lang), label: B("Median time to first reply", "首次回复中位用时"), sub: zh ? `${tt.runs} 次请求` : `${tt.runs} request${tt.runs === 1 ? "" : "s"}`, list: by(r => r.median_first_ms, v => dur(v, lang)) });
  if (tt.median_done_ms != null) out.push({ id: "done", value: dur(tt.median_done_ms, lang), label: B("Median time to job done", "完成工作中位用时"), list: by(r => r.median_done_ms, v => dur(v, lang)) });
  if (tt.mapped) out.push({ id: "mapped", value: count(tt.mapped), label: B("Permits mapped", "已梳理许可"), list: by(r => r.mapped, count) });
  if (tt.filled) out.push({ id: "filled", value: count(tt.filled), label: B("Applications filled", "已填好申请"), list: by(r => r.filled, count) });
  if (tt.waiting) out.push({ id: "waiting", value: count(tt.waiting), label: B("Approvals waiting", "等待批准"), sub: tt.oldest_waiting_at ? (zh ? `最早的 ${fmtAgo(tt.oldest_waiting_at, lang)}提出` : `oldest asked ${fmtAgo(tt.oldest_waiting_at, lang).toLowerCase()}`) : undefined, list: by(r => r.waiting, count) });
  if (tt.submitted) out.push({ id: "submitted", value: count(tt.submitted), label: B("Filings submitted this month", "本月已提交"), list: by(r => r.submitted, count) });
  if (tt.approved) out.push({ id: "approved", value: count(tt.approved), label: B("Approved by agencies this month", "本月获机构批准"), list: by(r => r.approved, count) });
  if (tt.renewals) out.push({ id: "renewals", value: count(tt.renewals), label: B("Renewals caught before they lapse", "提前盯住的续期"), list: by(r => r.renewals, count) });
  return out;
}

/** Headquarters: every franchisee that shared its stores with you, numbers only (never a prompt or a document). */
export function HqMetrics({ lang }: { lang: Lang }) {
  const [a, setA] = useState<MonthAcross | null>(null);
  useEffect(() => { void api.odeliaMonthHq().then(setA); }, []);
  if (!a || !a.rows.length) return null;
  return <Card title={B("What Odelia did for your franchisees this month", "Odelia 本月为加盟商做了什么")} month={a.month} lang={lang}
    tiles={acrossTiles(a, lang, r => r.name)} note={B(`Across ${a.workspaces} franchisee${a.workspaces === 1 ? "" : "s"}, from their own records. Tap a number to see each franchisee's.`, `涵盖 ${a.workspaces} 家加盟商，全部来自各自的记录。点按数字查看每家加盟商的数字。`)} />;
}

/** The Placetta team (Ops): every workspace, the numbers the founder may quote, each with the workspaces behind it. */
export function CompanyMetrics() {
  const { lang } = useApp();
  const [a, setA] = useState<MonthAcross | null>(null);
  useEffect(() => { void api.odeliaMonthCompany().then(setA); }, []);
  if (!a) return null;
  return <Card title={B("Odelia across Placetta this month", "本月 Odelia 在快哉的整体数字")} month={a.month} lang={lang}
    tiles={acrossTiles(a, lang, r => r.name || r.workspace_id.slice(0, 8))} note={B(`Every workspace (${a.workspaces}), from the records: agent runs, filings and each saved workspace. Quote these, and only these.`, `全部 ${a.workspaces} 个工作区，来自记录：Odelia 的运行、申报和保存的工作区。对外引用只用这些数字。`)} />;
}
