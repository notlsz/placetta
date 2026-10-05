import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { VoiceBeam, useMicrophone } from "voice-glow";
import { useApp } from "./ctx";
import { unlockAudio, useSimulatedVoice, useSpeechToText, type Speaker } from "./hooks";
import { SUGGESTIONS } from "./model";
import { I } from "./ui";

const INK = "#3F7FC4";
const BEAM = ["#7DB3EA", "#A5CDF5", "#6FA7E3", "#8FD5EE", "#BCD2F7", "#B2E0F4", "#C9C2F5"];
const BAND = { core: "#FFFFFF", above: "#94C2F0", mid: "#C6DEF8", below: "#A3D9EF" };

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
  const { t, b, lang, busy, live, ask, upload } = useApp();
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

  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 128) + "px"; }, [draft]);
  const attach = useRef<HTMLInputElement>(null);
  const send = () => { const q = draft.trim(); if (q && !busy) { setDraft(""); ask(q); } };
  const level = useCallback(() => Math.max(sim.level(), tts.level()), [sim, tts]);
  const orb: OrbState = busy && live ? live.state : tts.speaking ? "composing" : "breathing";
  const dock = variant === "dock";

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
          {dock && <span className="c-orb" aria-hidden="true"><ThinkingOrb state={orb} size={20} theme="light" color={INK} /></span>}
          {!dock && <button type="button" className="ic" aria-label={t("attach")} title={t("attach")} onClick={() => attach.current?.click()} disabled={busy}><I.plus /></button>}
          <input ref={attach} type="file" multiple hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) upload("", "", f); }} />
          <label htmlFor={"ask-" + variant} className="sr">{t("askPh")}</label>
          <textarea id={"ask-" + variant} ref={ta} rows={1} value={draft} placeholder={t("askPh")} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          <button type="button" className="ic mic" aria-label={t("talk")} title={t("talk")} onClick={startVoice} disabled={busy}><I.mic /></button>
          <button type="submit" className="sendb" disabled={!draft.trim() || busy} aria-label={t("send")}><I.send /></button>
        </form>
      </VoiceBeam>
      {note && !listening && <p className="c-note">{t(note)}</p>}

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
              <button type="button" className="vbtn primary" onClick={() => endVoice(true)}><I.check />{t("done")}</button>
            </div>
          </VoiceBeam>
        </div>
      )}
    </div>
  );
}
