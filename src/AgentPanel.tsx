import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { VoiceBeam, useMicrophone } from "voice-glow";
import type { Step } from "./agent";
import { useApp } from "./ctx";
import type { FeedItem, Turn } from "./feed";
import { SUGGESTIONS, type Bi } from "./model";
import { unlockAudio, useSimulatedVoice, useSpeechToText, type Speaker } from "./hooks";
import { NeedRow, INK } from "./pages";
import { AppArtifact, FileCard, I } from "./ui";

const BEAM = ["#7DB3EA", "#A5CDF5", "#6FA7E3", "#8FD5EE", "#BCD2F7", "#B2E0F4", "#C9C2F5"];
const BAND = { core: "#FFFFFF", above: "#94C2F0", mid: "#C6DEF8", below: "#A3D9EF" };

const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
const micAllowedHere = () => {
  const d = document as unknown as { permissionsPolicy?: { allowsFeature(f: string): boolean }; featurePolicy?: { allowsFeature(f: string): boolean } };
  const p = d.permissionsPolicy ?? d.featurePolicy;
  try { return p ? p.allowsFeature("microphone") : true; } catch { return true; }
};

export function AgentPanel({ feed, step, tts, mode, onHide, asked }: {
  feed: FeedItem[]; step: Step | null; tts: Speaker; mode: "dock" | "sheet"; onHide: () => void; asked: string[];
}) {
  const { t, b, lang, ws, busy, ask, upload } = useApp();
  const [draft, setDraft] = useState("");

  /* voice */
  const mic = useMicrophone();
  const sim = useSimulatedVoice();
  const [voice, setVoice] = useState<"off" | "mic" | "sim">("off");
  const [heard, setHeard] = useState("");
  const [note, setNote] = useState<"" | "simNote" | "deniedNote" | "noSttNote">("");
  const stt = useSpeechToText(useCallback((s: string) => setHeard(s), []));
  const typer = useRef<number[]>([]);
  const clearTyper = () => { typer.current.forEach(clearTimeout); typer.current = []; };
  const listening = (voice === "mic" && mic.state === "live") || voice === "sim";
  const open = useMemo(() => SUGGESTIONS.filter(s => !asked.includes(s.en) && !asked.includes(s.zh)), [asked]);

  const endVoice = useCallback((send: boolean, text?: string) => {
    clearTyper(); mic.stop(); stt.stop(); sim.stop(); setVoice("off");
    const said = (text ?? heard).trim(); setHeard("");
    if (send && said) ask(said, true);
  }, [mic, stt, sim, ask, heard]);

  // No microphone here: a speech-shaped level drives the glow while the next suggestion is "heard", then it sends like a real turn.
  const simulate = useCallback(() => {
    const line = b(open[0] ?? SUGGESTIONS[1]);
    setVoice("sim"); setNote("simNote"); sim.start(); setHeard("");
    const per = lang === "zh" ? 210 : 62;
    for (let i = 1; i <= line.length; i++) typer.current.push(window.setTimeout(() => setHeard(line.slice(0, i)), 700 + i * per));
    typer.current.push(window.setTimeout(() => endVoice(true, line), 700 + line.length * per + 1000));
  }, [open, b, lang, sim, endVoice]);

  const startVoice = useCallback(async () => {
    if (busy) return;
    unlockAudio(); tts.stop(); setNote(""); setHeard("");
    if (!mic.supported || !micAllowedHere()) { simulate(); return; }
    const s = await mic.start();
    if (s) { setVoice("mic"); if (!stt.start(lang === "zh" ? "zh-CN" : "en-US")) setNote("noSttNote"); return; }
    if (inFrame) simulate(); else setNote("deniedNote");
  }, [busy, tts, mic, simulate, stt, lang]);
  useEffect(() => () => clearTyper(), []);

  /* feed scroll */
  const scroller = useRef<HTMLDivElement>(null);
  const last = feed[feed.length - 1];
  const sig = feed.length + ":" + (last && last.kind === "turn" ? last.steps.length + (last.reply ? "r" : "") : "");
  useEffect(() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [sig]);

  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 128) + "px"; }, [draft]);
  const attach = useRef<HTMLInputElement>(null);
  const send = () => { const q = draft.trim(); if (q && !busy) { setDraft(""); ask(q); } };

  const orb: OrbState = listening ? "listening" : busy && step ? step.state : tts.speaking ? "composing" : "breathing";
  const agencies = ws.connections.filter(c => c.state === "connected" && c.level !== "vault").length;
  const level = useCallback(() => Math.max(sim.level(), tts.level()), [sim, tts]);
  const say = useCallback((text: string) => { unlockAudio(); if (tts.speaking === text) tts.stop(); else tts.speak(text, lang === "zh" ? "zh-CN" : "en-US"); }, [tts, lang]);

  return (
    <aside className={"panel " + mode} aria-label={t("agentName")}>
      <header className="pn-h">
        <span className="pn-orb"><ThinkingOrb state={orb} size={32} theme="light" color={INK} dotSize={1.1} aria-label={t("agentName")} /></span>
        <span className="pn-t">
          <b>{t("agentName")}</b>
          <small aria-live="polite">{busy && step ? b(step.label) + "…" : tts.speaking ? t("listen") : t("idle", { n: agencies })}</small>
        </span>
        <button type="button" className="icbtn" onClick={onHide} aria-label={t("hidePanel")} title={t("hidePanel")}>{mode === "dock" ? <I.panel /> : <I.x />}</button>
      </header>

      <div className="feed" ref={scroller}>
        {feed.map(m => m.kind === "user" ? <div key={m.id} className="you"><p>{m.text}</p></div>
          : m.kind === "memory" ? <Memory key={m.id} text={m.text} />
            : <TurnView key={m.id} m={m} speaking={tts.speaking} onSay={say} />)}
      </div>

      <div className="pn-dock">
        {open.length > 0 && !busy && (
          <div className="sugg">{open.map(s => <button key={s.en} type="button" onClick={() => ask(b(s))}>{b(s)}</button>)}</div>
        )}
        <VoiceBeam className="beam" level={level} processing={busy} theme="light" colors={BEAM} bandColors={BAND} idle={0.1} scale={0.9}>
          <form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
            <label htmlFor="ask" className="sr">{t("askPh")}</label>
            <textarea id="ask" ref={ta} rows={1} value={draft} placeholder={t("askPh")} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
            <div className="cbar">
              <button type="button" className="ic" aria-label={t("attach")} title={t("attach")} onClick={() => attach.current?.click()} disabled={busy}><I.plus /></button>
              <input ref={attach} type="file" multiple hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) upload("", "", f); }} />
              <span className="grow" />
              <button type="button" className="ic mic" aria-label={t("talk")} title={t("talk")} onClick={startVoice} disabled={busy}><I.mic /></button>
              <button type="submit" className="sendb" disabled={!draft.trim() || busy} aria-label={t("send")}><I.send /></button>
            </div>
          </form>
        </VoiceBeam>
        {note && !listening && <p className="pn-note">{t(note)}</p>}
      </div>

      {listening && (
        <div className="voice" role="dialog" aria-modal="true" aria-label={t("listening")}>
          <button type="button" className="vclose" aria-label={t("close")} onClick={() => endVoice(false)}><I.x /></button>
          <div className="vmid">
            <div className="vorb lens"><ThinkingOrb state="listening" size={64} theme="light" color={INK} dotSize={1.2} aria-label={t("listening")} /></div>
            <p className="vlabel">{t("listening")}</p>
            <p className={"vtext" + (heard ? "" : " hint")} aria-live="polite">{heard || t("tapDone")}</p>
            {note && <p className="vnote">{t(note)}</p>}
          </div>
          <VoiceBeam className="vbeam" type="mobile" stream={voice === "mic" ? mic.stream : null} level={sim.level} theme="light"
            colors={BEAM} bandColors={BAND} scale={window.innerWidth < 760 ? 1 : 1.6} reach={window.innerWidth < 760 ? 3 : 2.6} idle={0.2}>
            <div className="vbar">
              <button type="button" className="vbtn" onClick={() => endVoice(false)}>{t("cancel")}</button>
              <button type="button" className="vbtn main" onClick={() => endVoice(true)}><I.check />{t("done")}</button>
            </div>
          </VoiceBeam>
        </div>
      )}
    </aside>
  );
}

function Memory({ text }: { text: Bi }) {
  const { t, b } = useApp();
  return <div className="mem"><span className="mem-ico"><I.spark /></span><span><b>{t("committed")}</b>{b(text)}</span></div>;
}

/** One run: the steps with the site each one used, then the answer with what it produced. */
function TurnView({ m, speaking, onSay }: { m: Turn; speaking: string | null; onSay: (text: string) => void }) {
  const { b, t, ws, busy, run, go } = useApp();
  const [show, setShow] = useState(false);
  const live = !m.reply;
  const r = m.reply;
  const said = r ? r.text.map(b).join(" ") : "";
  const pending = (r?.approvals ?? []).filter(id => ws.approvals.some(a => a.id === id));
  const done = (r?.approvals ?? []).filter(id => !pending.includes(id) && ws.closed.some(a => a.id === id));
  const cur = live ? m.steps[m.active] : undefined;
  return (
    <div className="turn">
      {m.steps.length > 0 && (
        <div className="work">
          <div className={"work-hd" + (!live && pending.length ? " wait" : "")}>
            {live && cur ? <ThinkingOrb state={cur.state} size={20} theme="light" color={INK} aria-label={b(cur.label)} />
              : !live && pending.length ? <span className="wico"><I.pause /></span> : <span className="spark"><I.spark /></span>}
            <span>{live ? t("working") : pending.length ? t("waitingYou") : m.ms ? t("workedFor", { s: Math.max(1, Math.round(m.ms / 1000)) }) : t("feedEarlier")}</span>
            {!live && <button type="button" onClick={() => setShow(s => !s)} aria-expanded={show}>{t("stepsN", { n: m.steps.length })}<span className={show ? "up" : ""}><I.chev /></span></button>}
          </div>
          {(live || show) && (
            <ol className="steps">
              {m.steps.map((s, i) => {
                const st = live ? (i < m.active ? "done" : i === m.active ? "now" : "next") : "done";
                return (
                  <li key={i} className={st}>
                    <i aria-hidden="true">{st === "done" && <I.check />}</i>
                    <span>{b(s.label)}{st === "now" ? "…" : ""}</span>
                    {s.tool && <code>{s.tool}</code>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
      {r && (
        <div className="answer">
          {r.text.map((p, i) => <p key={i}>{b(p)}</p>)}
          {r.chain && <ol className="chain">{r.chain.map((c, i) => <li key={i}>{b(c)}</li>)}</ol>}
          {r.matches && <button type="button" className="link" onClick={() => go("find")}>{b({ en: "Open the results in Find licenses", zh: "在“查找许可”中查看结果" })}<I.arrow /></button>}
          {r.apps?.map(id => { const a = ws.apps.find(x => x.id === id); return a ? <AppArtifact key={id} a={a} /> : null; })}
          {r.files?.map(id => { const d = ws.docs.find(x => x.id === id); return d ? <FileCard key={id} d={d} compact /> : null; })}
          {pending.map(id => { const a = ws.approvals.find(x => x.id === id)!; return <NeedRow key={id} a={a} />; })}
          {done.map(id => { const a = ws.closed.find(x => x.id === id)!; return <div key={id} className="resolved"><span className="ok-dot"><I.check /></span><span>{b(a.title)}</span><em>{t("approvedIt")}</em></div>; })}
          {r.memory?.map((x, i) => <Memory key={i} text={x} />)}
          {r.next && <button type="button" className="btn soft sm nextb" disabled={busy} onClick={() => run(r.next!.req, b(r.next!.label))}>{b(r.next.label)}<I.arrow /></button>}
          {said && (
            <div className="turn-f">
              <button type="button" className={"say" + (speaking === said ? " on" : "")} onClick={() => onSay(said)}>
                {speaking === said ? <I.stopSq /> : <I.speaker />}{speaking === said ? t("stopListen") : t("listen")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
