import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VoiceBeam, useMicrophone } from "voice-glow";
import { useApp } from "./ctx";
import { unlockAudio, useNarrow, useSimulatedVoice, useSpeechToText, type Speaker } from "./hooks";
import { LIVE_SUGGESTIONS, SUGGESTIONS } from "./model";
import { I } from "./ui";
import { AgentBot } from "./Bot";

const BEAM = ["#7399C6", "#9DB8DA", "#5F88BA", "#B9CFE8", "#8FAED3", "#C9D8EC", "#A7BFE0"];
const BAND = { core: "#FFFFFF", above: "#8FAED3", mid: "#C9D8EC", below: "#B9CFE8" };

/** Close enough to count as the same question: most of the suggestion's words are already in something asked. */
const STOP = new Set(["the", "a", "an", "our", "my", "we", "is", "are", "to", "of", "for", "from", "what", "whats", "what's", "do", "does", "can", "you", "me", "and", "in", "on"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff ]/g, " ").split(/\s+/).filter(w => w && !STOP.has(w));
const near = (asked: string, sugg: string) => {
  if (/[\u4e00-\u9fff]/.test(sugg)) { const a = new Set(asked), hit = [...sugg].filter(c => a.has(c)).length; return hit / sugg.length >= 0.6; }
  const a = new Set(words(asked)), s = words(sugg); return s.length > 0 && s.filter(w => a.has(w) || a.has(w.replace(/s$/, ""))).length / s.length >= 0.5;
};

const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
const micAllowedHere = () => {
  const d = document as unknown as { permissionsPolicy?: { allowsFeature(f: string): boolean }; featurePolicy?: { allowsFeature(f: string): boolean } };
  const p = d.permissionsPolicy ?? d.featurePolicy;
  try { return p ? p.allowsFeature("microphone") : true; } catch { return true; }
};

/**
 * The message box, wrapped in VoiceBeam: it glows with your voice, travels while the agent works and follows the
 * agent's voice when it reads a reply. "dock" floats at the bottom of the workspace (Muse); "panel" sits in the agent panel.
 * Voice mode lives here too, so there is only ever one microphone session.
 */
export function Composer({ variant, tts, asked, showLive = true }: { variant: "dock" | "panel"; tts: Speaker; asked: string[]; showLive?: boolean }) {
  const { t, b, lang, busy, live, ask, upload, stop, mode } = useApp();
  const [draft, setDraft] = useState("");

  const mic = useMicrophone();
  const sim = useSimulatedVoice();
  const [voice, setVoice] = useState<"off" | "mic" | "sim">("off");
  const [heard, setHeard] = useState("");
  const [note, setNote] = useState<"" | "simNote" | "deniedNote" | "noSttNote">("");
  const stt = useSpeechToText(useCallback((s: string) => setHeard(s), []));
  const typer = useRef<number[]>([]);
  const clearTyper = () => { typer.current.forEach(clearTimeout); typer.current = []; };
  const listening = (voice === "mic" && mic.state === "live") || voice === "sim";
  // the sample's scripted demo answers its own suggestions; a live agent gets tasks it does end to end
  const open = useMemo(() => (mode === "demo" ? SUGGESTIONS : LIVE_SUGGESTIONS).filter(s => !asked.some(q => near(q, s.en) || near(q, s.zh))).slice(0, 2), [asked, mode]);
  const narrow = useNarrow(560);

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

  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 128) + "px"; }, [draft]);
  const attach = useRef<HTMLInputElement>(null);
  const send = () => { const q = draft.trim(); if (q && !busy) { setDraft(""); ask(q); } };
  const level = useCallback(() => Math.max(sim.level(), tts.level()), [sim, tts]);
  const dock = variant === "dock";
  // voice mode fits any height: the bot shrinks on short screens (an embedded preview can be under 500px tall)
  const botSize = Math.round(Math.min(150, Math.max(78, (typeof window === "undefined" ? 800 : window.innerHeight) * 0.19)));

  return (
    <div className={"composer-wrap " + variant}>
      {dock && showLive && busy && live && (
        <p className="dock-live" aria-live="polite"><span>{b(live.label)}…</span>{live.tool && <em>{live.tool}</em>}</p>
      )}
      {!dock && open.length > 0 && !busy && (
        <div className="sugg">{open.map(s => <button key={s.en} type="button" onClick={() => ask(b(s))}>{b(s)}</button>)}</div>
      )}
      <VoiceBeam className="beam" level={level} processing={busy} theme="light" colors={BEAM} bandColors={BAND} idle={dock ? 0.16 : 0.1} scale={dock ? 1.1 : 0.9}>
        <form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
          {dock && <span className="c-bot" aria-hidden="true"><AgentBot size={34} busy={busy} interactive={false} /></span>}
          {!dock && <button type="button" className="ic" aria-label={t("attach")} title={t("attach")} onClick={() => attach.current?.click()} disabled={busy}><I.plus /></button>}
          <input ref={attach} type="file" multiple hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) upload("", "", f); }} />
          <label htmlFor={"ask-" + variant} className="sr">{t("askPh")}</label>
          <textarea id={"ask-" + variant} ref={ta} rows={1} value={draft} placeholder={narrow ? t("askPhShort") : t("askPh")} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          <button type="button" className="ic mic" aria-label={t("talk")} title={t("talk")} onClick={startVoice} disabled={busy}><I.mic /></button>
          {busy
            ? <button type="button" className="sendb stop" onClick={stop} aria-label={t("stop")} title={t("stop")}><I.stopSq /></button>
            : <button type="submit" className="sendb" disabled={!draft.trim()} aria-label={t("send")}><I.send /></button>}
        </form>
      </VoiceBeam>
      {note && !listening && <p className="c-note">{t(note)}</p>}

      {listening && (
        <div className="voice" role="dialog" aria-modal="true" aria-label={t("listening")}>
          <button type="button" className="vclose" aria-label={t("close")} onClick={() => endVoice(false)}><I.x /></button>
          <div className="vmid">
            <div className="vbot" style={{ width: botSize, height: botSize }}><AgentBot size={botSize} label={t("listening")} /></div>
            <p className="vlabel">{t("listening")}</p>
            <p className={"vtext" + (heard ? "" : " hint")} aria-live="polite">{heard || t("tapDone")}</p>
            {note && <p className="vnote">{t(note)}</p>}
          </div>
          <div className="vfoot">
            {/* The glow sits in its own tall layer behind the buttons and fades out toward the top, so it never shows an edge. */}
            <VoiceBeam className="vbeam" aria-hidden="true" type="mobile" stream={voice === "mic" ? mic.stream : null} level={sim.level} theme="light"
              colors={BEAM} bandColors={BAND} borderRadius={0} scale={window.innerWidth < 760 ? 1 : 1.6} reach={window.innerWidth < 760 ? 3 : 2.6} idle={0.2}>
              <div className="vbeam-fill" />
            </VoiceBeam>
            <div className="vbar">
              <button type="button" className="vbtn" onClick={() => endVoice(false)}>{t("cancel")}</button>
              <button type="button" className="vbtn primary" onClick={() => endVoice(true)}><I.check />{t("done")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
