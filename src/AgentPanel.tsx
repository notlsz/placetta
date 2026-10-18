import { useCallback, useEffect, useRef, useState } from "react";
import { speakTag } from "./langs";
import { Composer } from "./Composer";
import { useApp } from "./ctx";
import type { FeedItem, Turn } from "./feed";
import type { Bi } from "./model";
import { unlockAudio, type Speaker } from "./hooks";
import { NeedRow } from "./pages";
import { AppArtifact, FileCard, I, Prose, feeTotal } from "./ui";
import { preflight } from "./smart";
import { readyToFile } from "./core";
import { formById } from "./forms/registry";
import { money, daysFromNow, fmtAgo } from "./time";
import type { Approval, Workspace } from "./model";
import { FilingLive } from "./FilingLive";
import { LiveBot, Working } from "./Bot";
import { taskVerb } from "./tasks";
import { PlanCard } from "./Work";
import { RememberedChips } from "./Remembered";
import { NOT_CHECKED, splitSources } from "./sources";
import { LocalHold, useApprovalHold } from "./SendHold";
import { AskPerson } from "./AskPerson";
import { AllowanceNote } from "./Allowance";
import { UndoTurn } from "./UndoTurn";
import { PlanGate } from "./PlanGate";
import { planApprovalId } from "./autonomy";

/** The agent, beside the work (dock), over it on a phone (sheet), or as her own page (page: Odelia, Chat): what it's
 *  doing now, every step with the site it used, and what each run produced. */
export function AgentPanel({ feed, tts, mode, onHide, asked }: {
  feed: FeedItem[]; tts: Speaker; mode: "dock" | "sheet" | "page"; onHide?: () => void; asked: string[];
}) {
  const { t, b, lang, ws, busy, live } = useApp();

  const scroller = useRef<HTMLDivElement>(null);
  const last = feed[feed.length - 1];
  const sig = feed.length + ":" + (last && last.kind === "turn" ? last.steps.length + (last.reply ? "r" : "") : "");
  useEffect(() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [sig]);

  const agencies = ws.connections.filter(c => c.state === "connected" && c.level !== "vault").length;
  const say = useCallback((text: string) => { unlockAudio(); if (tts.speaking === text) tts.stop(); else tts.speak(text, speakTag(lang)); }, [tts, lang]);

  return (
    <aside className={"panel " + (mode === "page" ? "full" : mode)} aria-label={t("agentName")}>
      <header className="pn-h">
        <span className="pn-bot"><LiveBot size={44} busy={busy} task={busy && live ? live.state : undefined} label={t("agentName")} interactive /></span>
        <span className="pn-t">
          <b>{t("agentName")}</b>
          <small aria-live="polite">{busy && live ? <><em className="pn-verb">{b(taskVerb(live.state))}…</em>{b(live.label)}</> : agencies ? t("idle", { n: agencies }) : t("idleNew")}</small>
        </span>
        <AskPerson compact context={() => panelContext(feed)} />
        {onHide && <button type="button" className="icbtn" onClick={onHide} aria-label={t("hidePanel")} title={t("hidePanel")}><I.x /></button>}
      </header>

      <div className="feed" ref={scroller}>
        {mode === "page" && !feed.length && (
          <div className="feed-empty">
            <b>{lang === "zh" ? "有什么需要我做的？" : "What can I do for you?"}</b>
            <p>{lang === "zh" ? "比如：梳理我的许可、本周有什么到期、上传我的租约。您说，我来做；提交、付款和发送都先经您批准。" : "Try: map my permits, what's due this week, or upload your lease. You say it, I do it; nothing is filed, paid or sent without your approval."}</p>
          </div>
        )}
        {feed.map(m => m.kind === "user" ? <div key={m.id} className="you"><p>{m.text}</p></div>
          : m.kind === "memory" ? <Memory key={m.id} text={m.text} />
            : <TurnView key={m.id} m={m} last={m === last} speaking={tts.speaking} onSay={say} asked={askedBefore(feed, m)} />)}
      </div>

      <div className="pn-dock"><Composer variant="panel" tts={tts} asked={asked} /></div>
    </aside>
  );
}

/** What the person asked right before a run, for the allowance note on a long job. */
const askedBefore = (feed: FeedItem[], m: FeedItem) => { const i = feed.indexOf(m), u = i > 0 ? feed[i - 1] : undefined; return u?.kind === "user" ? u.text : ""; };
/** What goes to a person with "Ask a person" from the panel: the last exchange with Odelia. */
function panelContext(feed: FeedItem[]): Record<string, unknown> {
  const turn = [...feed].reverse().find((x): x is Extract<FeedItem, { kind: "turn" }> => x.kind === "turn" && !!x.reply);
  const asked = turn ? askedBefore(feed, turn) : "";
  return { from: "odelia_panel", ...(asked ? { asked: asked.slice(0, 600) } : {}), ...(turn?.reply ? { last_reply: turn.reply.text.map(x => x.en).join(" ").slice(0, 800) } : {}) };
}

function Memory({ text }: { text: Bi }) {
  const { t, b } = useApp();
  return <p className="mem"><I.spark /><span><b>{t("committed")}</b>{b(text)}</span></p>;
}

/** One run: a quiet log of the steps, then the answer and whatever it produced. */
function TurnView({ m, last, speaking, onSay, asked }: { m: Turn; last: boolean; speaking: string | null; onSay: (text: string) => void; asked: string }) {
  const { b, t, lang, ws, busy, run, go, cloud } = useApp();
  const [show, setShow] = useState(false);
  const live = !m.reply;
  const r = m.reply;
  const said = r ? r.text.map(b).join(" ") : "";
  const pending = (r?.approvals ?? []).filter(id => ws.approvals.some(a => a.id === id));
  const done = (r?.approvals ?? []).filter(id => !pending.includes(id) && ws.closed.some(a => a.id === id));
  // filings that passed every check go out together from one card; anything flagged, unsigned or not a filing stays its own row
  const group = pending.filter(id => batchable(ws, ws.approvals.find(a => a.id === id)!, !!cloud));
  const rows = group.length > 1 ? pending.filter(id => !group.includes(id)) : pending;
  const asking = pending.some(id => ws.approvals.find(a => a.id === id)?.kind !== "upload");
  const covered = new Set([...pending, ...done].map(id => (ws.approvals.find(a => a.id === id) ?? ws.closed.find(a => a.id === id))?.app).filter(Boolean));
  const filed = r?.filed ?? [];
  const cur = live ? m.steps[m.active] : undefined;
  // the plan this run kept: the job it last updated
  const plan = !last ? undefined : (ws.jobs ?? []).filter(j => j.updated >= m.at).sort((x, y) => y.updated.localeCompare(x.updated))[0];
  const listen = said ? (
    <button type="button" className={"say" + (speaking === said ? " on" : "")} onClick={() => onSay(said)} aria-label={speaking === said ? t("stopListen") : t("listen")}>
      {speaking === said ? <I.stopSq /> : <I.speaker />}<span>{speaking === said ? t("stopListen") : t("listen")}</span>
    </button>
  ) : null;
  return (
    <div className="turn">
      <div className={"work-hd" + (!live && asking ? " wait" : "")}>
        {live && cur ? <LiveBot task={cur.state} size={26} label={b(cur.label)} solo />
          : !live && asking ? <span className="wico"><I.pause /></span> : <span className="spark"><I.spark /></span>}
        {live && cur
          ? <span className="wh-now" aria-live="polite"><b>{b(taskVerb(cur.state))}…</b><small>{b(cur.label)}</small></span>
          : <span>{live ? t("working") : asking ? t("waitingYou") : m.ms ? t("workedFor", { s: Math.max(1, Math.round(m.ms / 1000)) }) : fmtAgo(m.at, lang)}</span>}
        {!live && m.steps.length > 0 && <button type="button" className="steps-t" onClick={() => setShow(s => !s)} aria-expanded={show}>{t("stepsN", { n: m.steps.length })}<span className={show ? "up" : ""}><I.chev /></span></button>}
        {listen}
      </div>
      {(live || show) && m.steps.length > 0 && (
        <Working on={live} size="sm">
        <ol className={"steps" + (live ? " live" : "")}>
          {m.steps.map((s, i) => {
            const st = live ? (i < m.active ? "done" : i === m.active ? "now" : "next") : "done";
            return (
              <li key={i} className={st}>
                <i aria-hidden="true" />
                <span>{b(s.label)}{st === "now" ? "…" : ""}{s.tool && <em>{s.tool}</em>}</span>
              </li>
            );
          })}
        </ol>
        </Working>
      )}
      {live && last && <AllowanceNote asked={asked} />}
      {plan && <PlanCard job={plan} compact />}
      {plan && <PlanGate job={plan} />}
      {live && m.draft && <p className="drafting" aria-live="polite">{m.draft}</p>}
      {r && (
        <div className="answer">
          {r.text.map((p, i) => { const body = splitSources(b(p))[0]; return body ? <Prose key={i} text={body} /> : null; })}
          {r.chain && <ol className="chain">{r.chain.map((c, i) => <li key={i}>{b(c)}</li>)}</ol>}
          {filed.map(id => <FilingLive key={id} app={id} />)}
          {(r.apps?.some(id => !covered.has(id) && !filed.includes(id)) || (r.files?.length && !filed.length)) ? (
            <div className="made">
              {r.apps?.filter(id => !covered.has(id) && !filed.includes(id)).map(id => { const a = ws.apps.find(x => x.id === id); return a ? <AppArtifact key={id} a={a} /> : null; })}
              {!filed.length && r.files?.map(id => { const d = ws.docs.find(x => x.id === id); return d ? <FileCard key={id} d={d} compact /> : null; })}
            </div>
          ) : null}
          {r.table && r.table.rows.length > 0 && (
            <figure className="gtable">
              <figcaption>{b(r.table.title)}</figcaption>
              <div className="gt-scroll"><table>
                <thead><tr>{r.table.columns.map((c, i) => <th key={i} scope="col">{b(c)}</th>)}</tr></thead>
                <tbody>{r.table.rows.map((row, i) => <tr key={i}>{row.map((c, j) => { const q = r.table?.cite?.[i]?.[j]; return <td key={j}><span className="cv">{c}</span>{q && <q className="cite">{q}</q>}</td>; })}</tr>)}</tbody>
              </table></div>
            </figure>
          )}
          {group.length > 1 && <ApproveGroup ids={group} />}
          {rows.filter(id => !(plan && id === planApprovalId(plan.id))).map(id => { const a = ws.approvals.find(x => x.id === id)!; return <NeedRow key={id} a={a} compact />; })}
          {done.map(id => { const a = ws.closed.find(x => x.id === id)!; return <p key={id} className="resolved"><span className="ok-dot"><I.check /></span><span>{b(a.title)}</span><em>{t("approvedIt")}</em></p>; })}
          {r.memory?.map((x, i) => <Memory key={i} text={x} />)}
          {r.remembered?.length ? <RememberedChips items={r.remembered} /> : null}
          {r.skills?.map((x, i) => <p key={"s" + i} className="mem"><I.spark /><span><b>{t("learned")}</b>{b(x)}</span></p>)}
          <SourcesRow said={said} links={r.sources} />
          {r.matches && <button type="button" className="pill quiet" onClick={() => go("find")}>{b({ en: "Open the results", zh: "查看结果" })}</button>}
          {r.next && <button type="button" className="pill primary sm" disabled={busy} onClick={() => run(r.next!.req, b(r.next!.label))}><span>{b(r.next.label)}</span><i aria-hidden="true"><I.arrow /></i></button>}
          {r.undo && <UndoTurn id={r.undo} />}
        </div>
      )}
    </div>
  );
}

/** Where the answer came from (src/sources.ts): the Sources line the reply ends with, shown as links where there's a
 *  page; the plain note when it states a rule nothing was checked against; the cited pages of an older reply otherwise. */
function SourcesRow({ said, links }: { said: string; links?: { title: string; url: string }[] }) {
  const { b } = useApp();
  const line = splitSources(said)[1];
  if (line === NOT_CHECKED.en || line === NOT_CHECKED.zh) return <p className="sources unchecked"><span>{line}</span></p>;
  const named = line ? line.replace(/^(Sources: |来源：)/, "").split(/, |、/) : [];
  if (!links?.length && !named.length) return null;
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  // a name in the line with no page behind it (a document, an email) shows as plain text
  const plain = named.filter(n => !(links ?? []).some(x => n.startsWith(x.title)));
  return (
    <p className="sources"><span>{b({ en: "Sources", zh: "来源" })}</span>
      {(links ?? []).map(x => <a key={x.url} href={x.url} target="_blank" rel="noreferrer" title={x.url}>{line ? x.title : host(x.url)}{line && x.title !== host(x.url) && <small>{host(x.url)}</small>}</a>)}
      {plain.map(n => <em key={n}>{n}</em>)}
    </p>
  );
}

/** A filing that can go out with others from one tap: complete, nothing the second look flags, no signature to draw. */
function batchable(w: Workspace, a: Approval | undefined, account: boolean): boolean {
  if (!a || a.kind !== "file" || a.second) return false;   // two owners under a business rule: one at a time
  const app = w.apps.find(x => x.id === a.app);
  if (!app || !readyToFile(app)) return false;
  const off = app.official ? formById(app.official) : undefined;
  if (account && off?.sign && off.esign) return false;
  const pf = preflight(w, a, daysFromNow(0));
  return !pf.errors.length && !pf.warnings.length;
}

/** Everything that's ready, approved with one tap. Each filing still named, with its agency, its fee and what was checked. */
function ApproveGroup({ ids }: { ids: string[] }) {
  const { b, lang, ws, busy, approveAll, openApproval, cloud } = useApp();
  const [going, setGoing] = useState(false);
  const zh = lang === "zh";
  const list = ids.map(id => ws.approvals.find(a => a.id === id)!).filter(Boolean);
  const apps = list.map(a => ws.apps.find(x => x.id === a.app));
  const total = apps.reduce((n, a) => n + (a ? feeTotal(a) : 0), 0);
  const tbd = apps.some(a => a?.fees.some(f => f.tbd));
  const n = list.length;
  const hold = useApprovalHold(ids[0]);   // the undo window: approved together, not sent yet
  const go = () => { setGoing(true); approveAll(ids); };
  return (
    <div className="agroup" role="group" aria-label={zh ? `${n} 项可以提交` : `${n} ready to file`}>
      <div className="ag-h">
        <b>{zh ? `${n} 项可以提交` : `${n} ready to file`}</b>
        <span>{total ? (zh ? `机构费用共 ${money(total)}${tbd ? "起" : ""}` : `${money(total)}${tbd ? "+" : ""} in agency fees`) : (zh ? "均无费用" : "No fees")}</span>
      </div>
      <ul>
        {list.map((a, i) => {
          const app = apps[i], fee = app ? feeTotal(app) : 0, answers = app?.fields.filter(f => f.value).length ?? 0, docs = app?.checklist.filter(c => c.state === "done").length ?? 0;
          return (
            <li key={a.id}>
              <span className="ag-ok" aria-hidden="true"><I.check /></span>
              <span className="ag-tx">
                <b>{b(a.title)}</b>
                <small>{[a.agency && b(a.agency), fee ? money(fee, app?.currency) : (zh ? "无费用" : "No fee"),
                  zh ? `已核对 ${answers} 项回答${docs ? `和 ${docs} 份文件` : ""}` : `${answers} answer${answers === 1 ? "" : "s"}${docs ? ` and ${docs} document${docs === 1 ? "" : "s"}` : ""} checked`].filter(Boolean).join(zh ? "，" : ", ")}</small>
              </span>
              <button type="button" className="ag-open" onClick={() => openApproval(a.id)}>{zh ? "查看" : "Review"}<I.chevR /></button>
            </li>
          );
        })}
      </ul>
      <div className="ag-f">
        <small>{cloud ? (zh ? "点按之前不会提交任何内容。机构费用由您直接支付给机构。" : "Nothing goes out until you tap. Agency fees are paid to the agency.") : (zh ? "点按之前不会提交任何内容。" : "Nothing goes out until you tap.")}</small>
        {hold ? <LocalHold hold={hold} compact /> : <button type="button" className="pill ink sm" disabled={busy || going} onClick={go}><I.check />{zh ? (n === 2 ? "两项都批准" : `全部批准 ${n} 项`) : n === 2 ? "Approve both" : `Approve all ${n}`}</button>}
      </div>
    </div>
  );
}
