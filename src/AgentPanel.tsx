import { useCallback, useEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { Composer } from "./Composer";
import { useApp } from "./ctx";
import type { FeedItem, Turn } from "./feed";
import type { Bi } from "./model";
import { unlockAudio, type Speaker } from "./hooks";
import { NeedRow, INK } from "./pages";
import { AppArtifact, FileCard, I } from "./ui";
import { AgentBot, Working } from "./Bot";

/** The agent, beside the work: what it's doing now, every step with the site it used, and what each run produced. */
export function AgentPanel({ feed, tts, mode, onHide, asked }: {
  feed: FeedItem[]; tts: Speaker; mode: "dock" | "sheet"; onHide: () => void; asked: string[];
}) {
  const { t, b, lang, ws, busy, live } = useApp();

  const scroller = useRef<HTMLDivElement>(null);
  const last = feed[feed.length - 1];
  const sig = feed.length + ":" + (last && last.kind === "turn" ? last.steps.length + (last.reply ? "r" : "") : "");
  useEffect(() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [sig]);

  const agencies = ws.connections.filter(c => c.state === "connected" && c.level !== "vault").length;
  const say = useCallback((text: string) => { unlockAudio(); if (tts.speaking === text) tts.stop(); else tts.speak(text, lang === "zh" ? "zh-CN" : "en-US"); }, [tts, lang]);

  return (
    <aside className={"panel " + mode} aria-label={t("agentName")}>
      <header className="pn-h">
        <span className="pn-bot"><AgentBot size={44} busy={busy} label={t("agentName")} /></span>
        <span className="pn-t">
          <b>{t("agentName")}</b>
          <small aria-live="polite">{busy && live ? b(live.label) + "…" : t("idle", { n: agencies })}</small>
        </span>
        <button type="button" className="icbtn" onClick={onHide} aria-label={t("hidePanel")} title={t("hidePanel")}><I.x /></button>
      </header>

      <div className="feed" ref={scroller}>
        {feed.map(m => m.kind === "user" ? <div key={m.id} className="you"><p>{m.text}</p></div>
          : m.kind === "memory" ? <Memory key={m.id} text={m.text} />
            : <TurnView key={m.id} m={m} speaking={tts.speaking} onSay={say} />)}
      </div>

      <div className="pn-dock"><Composer variant="panel" tts={tts} asked={asked} /></div>
    </aside>
  );
}

function Memory({ text }: { text: Bi }) {
  const { t, b } = useApp();
  return <p className="mem"><I.spark /><span><b>{t("committed")}</b>{b(text)}</span></p>;
}

/** One run: a quiet log of the steps, then the answer and whatever it produced. */
function TurnView({ m, speaking, onSay }: { m: Turn; speaking: string | null; onSay: (text: string) => void }) {
  const { b, t, ws, busy, run, go } = useApp();
  const [show, setShow] = useState(false);
  const live = !m.reply;
  const r = m.reply;
  const said = r ? r.text.map(b).join(" ") : "";
  const pending = (r?.approvals ?? []).filter(id => ws.approvals.some(a => a.id === id));
  const done = (r?.approvals ?? []).filter(id => !pending.includes(id) && ws.closed.some(a => a.id === id));
  const cur = live ? m.steps[m.active] : undefined;
  const listen = said ? (
    <button type="button" className={"say" + (speaking === said ? " on" : "")} onClick={() => onSay(said)} aria-label={speaking === said ? t("stopListen") : t("listen")}>
      {speaking === said ? <I.stopSq /> : <I.speaker />}<span>{speaking === said ? t("stopListen") : t("listen")}</span>
    </button>
  ) : null;
  return (
    <div className="turn">
      <div className={"work-hd" + (!live && pending.length ? " wait" : "")}>
        {live && cur ? <ThinkingOrb state={cur.state} size={20} theme="light" color={INK} aria-label={b(cur.label)} />
          : !live && pending.length ? <span className="wico"><I.pause /></span> : <span className="spark"><I.spark /></span>}
        <span>{live ? t("working") : pending.length ? t("waitingYou") : m.ms ? t("workedFor", { s: Math.max(1, Math.round(m.ms / 1000)) }) : t("fromPlacetta")}</span>
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
      {live && m.draft && <p className="drafting" aria-live="polite">{m.draft}</p>}
      {r && (
        <div className="answer">
          {r.text.map((p, i) => <p key={i}>{b(p)}</p>)}
          {r.chain && <ol className="chain">{r.chain.map((c, i) => <li key={i}>{b(c)}</li>)}</ol>}
          {(r.apps?.length || r.files?.length) ? (
            <div className="made">
              {r.apps?.map(id => { const a = ws.apps.find(x => x.id === id); return a ? <AppArtifact key={id} a={a} /> : null; })}
              {r.files?.map(id => { const d = ws.docs.find(x => x.id === id); return d ? <FileCard key={id} d={d} compact /> : null; })}
            </div>
          ) : null}
          {pending.map(id => { const a = ws.approvals.find(x => x.id === id)!; return <NeedRow key={id} a={a} compact />; })}
          {done.map(id => { const a = ws.closed.find(x => x.id === id)!; return <p key={id} className="resolved"><span className="ok-dot"><I.check /></span><span>{b(a.title)}</span><em>{t("approvedIt")}</em></p>; })}
          {r.memory?.map((x, i) => <Memory key={i} text={x} />)}
          {r.matches && <button type="button" className="pill quiet" onClick={() => go("find")}>{b({ en: "Open the results", zh: "查看结果" })}</button>}
          {r.next && <button type="button" className="pill primary sm" disabled={busy} onClick={() => run(r.next!.req, b(r.next!.label))}><span>{b(r.next.label)}</span><i aria-hidden="true"><I.arrow /></i></button>}
        </div>
      )}
    </div>
  );
}
