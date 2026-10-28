import { useCallback, useEffect, useState } from "react";
import { useApp } from "../ctx";
import { B, type Bi } from "../model";
import { fmtAgo } from "../time";
import { I } from "../ui";
import { official, reviewProblems } from "../lawWatch";
import type * as api from "./api";
import * as ops from "./opsApi";

/* Law watch, the team's half (src/lawWatch.ts): each possible rule change from an official feed, the nightly sweep or
   Odelia's weekly check waits here. Read the source; if it changes something for owners, write what they hear in English
   and Chinese and approve; otherwise dismiss with why. Nothing reaches an owner until it's approved here, and an approved
   change goes to each business it affects once, by the channel they chose. Shown on the Quality tab. */

const ORIGIN: Record<ops.RuleAlert["origin"], Bi> = {
  register: B("Official register", "官方公报"),
  sweep: B("A page Placetta quotes changed", "快哉引用的页面有变化"),
  odelia: B("Odelia's weekly check", "Odelia 每周检查"),
};
type Form = { hen: string; hzh: string; ben: string; bzh: string; src: string; eff: string; note: string };
const EMPTY: Form = { hen: "", hzh: "", ben: "", bzh: "", src: "", eff: "", note: "" };

export function LawQueue() {
  const { b, lang, say } = useApp();
  const zh = lang === "zh";
  const [rows, setRows] = useState<ops.RuleAlert[] | null>(null);
  const [forms, setForms] = useState<Record<string, Form>>({});
  const load = useCallback(async () => { try { setRows(await ops.ruleAlertQueue()); } catch (e) { say((e as api.ApiError).message); setRows([]); } }, [say]);
  useEffect(() => { void load(); }, [load]);
  const f = (id: string) => forms[id] ?? EMPTY;
  const set = (id: string, k: keyof Form, v: string) => setForms(x => ({ ...x, [id]: { ...(x[id] ?? EMPTY), [k]: v } }));

  const approve = async (r: ops.RuleAlert) => {
    const v = f(r.id), draft = { headline: { en: v.hen.trim(), zh: v.hzh.trim() }, body: { en: v.ben.trim(), zh: v.bzh.trim() }, source_url: v.src.trim() || r.source_url, effective: v.eff.trim() || null };
    const problems = reviewProblems(draft);
    if (problems.length) { say(b(problems[0])); return; }
    try { await ops.ruleAlertDecide(r.id, "approved", { headline: draft.headline, body: draft.body, source_url: v.src.trim() || undefined, effective: v.eff.trim() || undefined, note: v.note }); say(zh ? "已批准，明早通知受影响的企业" : "Approved: the businesses it affects hear tomorrow morning"); await load(); }
    catch (e) { say((e as api.ApiError).message); }
  };
  const dismiss = async (r: ops.RuleAlert) => {
    if (!f(r.id).note.trim()) { say(zh ? "请说明为什么不通知。" : "Say why it's dismissed."); return; }
    try { await ops.ruleAlertDecide(r.id, "dismissed", { note: f(r.id).note }); say(zh ? "已记录" : "Recorded"); await load(); } catch (e) { say((e as api.ApiError).message); }
  };

  const list = rows ?? [], pending = list.filter(r => r.status === "pending"), done = list.filter(r => r.status !== "pending");
  return (
    <section className="sec law-queue">
      <div className="sec-h"><h2>{zh ? "法规变化" : "Rule changes"}{pending.length > 0 && <small>{zh ? `，${pending.length} 项待审` : `, ${pending.length} to review`}</small>}</h2></div>
      <p className="note">{zh
        ? "来自官方公报、每晚网页核查和 Odelia 每周检查的可能变化。请先阅读官方来源；如果对业主有影响，用中英文写下他们会看到的内容再批准。批准前，任何业主都不会收到通知；批准后，每家受影响的企业按其选择的方式收到一次。"
        : "Possible changes from official registers, the nightly page sweep and Odelia's weekly check. Read the official source first. If it changes something for owners, write what they hear in English and Chinese, then approve. No owner hears anything before you approve; after, each business it affects hears once, the way they chose."}</p>
      {rows === null ? <p className="quiet">{zh ? "加载中…" : "Loading…"}</p> : pending.length === 0 ? <div className="empty"><p>{zh ? "没有待审的变化。" : "No changes to review."}</p></div> : (
        <div className="rq-list">{pending.map(r => {
          const v = f(r.id), src = v.src.trim() || r.source_url || "";
          return (
            <article key={r.id} className="rq">
              <header><span><b>{r.title}</b><small>{[b(ORIGIN[r.origin]), r.jurisdiction, r.forms.join(" "), r.published ?? "", r.workspace_id ? (zh ? "仅一家企业" : "one business") : ""].filter(Boolean).join(zh ? "，" : ", ")}</small></span>
                <small>{fmtAgo(r.created_at, lang)}</small></header>
              {r.excerpt && <q className="rq-note">{r.excerpt}</q>}
              {r.source_url ? <p className="rq-meta"><a href={r.source_url} target="_blank" rel="noreferrer">{r.source_label || r.source_url}<I.ext /></a></p>
                : <p className="rq-meta">{zh ? "没有官方来源：批准前请填写 .gov 页面。" : "No official source yet: add the .gov page before approving."}</p>}
              <form className="rq-form law-form" onSubmit={e => { e.preventDefault(); void approve(r); }}>
                <input value={v.hen} onChange={e => set(r.id, "hen", e.target.value)} maxLength={120} placeholder="Headline, in English" aria-label="Headline in English" />
                <input value={v.hzh} onChange={e => set(r.id, "hzh", e.target.value)} maxLength={120} placeholder="标题（中文）" aria-label="中文标题" />
                <textarea value={v.ben} onChange={e => set(r.id, "ben", e.target.value)} maxLength={600} rows={2} placeholder="What changes for the owner, and what Odelia will do" aria-label="What changes, in English" />
                <textarea value={v.bzh} onChange={e => set(r.id, "bzh", e.target.value)} maxLength={600} rows={2} placeholder="对业主有什么影响，Odelia 会做什么" aria-label="影响（中文）" />
                <input value={v.src} onChange={e => set(r.id, "src", e.target.value)} maxLength={1000} placeholder={zh ? "官方来源（可选，替换上面的链接）" : "Official source (optional, replaces the link above)"} aria-label={zh ? "官方来源" : "Official source"} aria-invalid={!!v.src.trim() && !official(v.src.trim())} />
                <input value={v.eff} onChange={e => set(r.id, "eff", e.target.value)} type="date" aria-label={zh ? "生效日期" : "Takes effect"} />
                <input value={v.note} onChange={e => set(r.id, "note", e.target.value)} maxLength={2000} placeholder={zh ? "备注（不通知时必填）" : "A note (needed to dismiss)"} aria-label={zh ? "备注" : "Note"} />
                <button type="button" className="sbtn" onClick={() => void dismiss(r)}>{zh ? "不通知" : "Dismiss"}</button>
                <button type="submit" className="sbtn ink" disabled={!official(src)}>{zh ? "批准并通知" : "Approve and tell owners"}</button>
              </form>
            </article>
          );
        })}</div>
      )}
      {done.length > 0 && (
        <details className="q-margin-t"><summary>{zh ? `近 30 天已处理 ${done.length} 项` : `${done.length} decided in the last 30 days`}</summary>
          <ul className="law-done">{done.map(r => <li key={r.id}><b>{r.status === "approved" ? (zh ? "已通知" : "Told owners") : (zh ? "未通知" : "Dismissed")}</b> {r.status === "approved" && r.headline ? b(r.headline) : r.title}{r.note ? <small> ({r.note})</small> : null}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
