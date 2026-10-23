import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { speakTag } from "./langs";
import { VoiceBeam, useMicrophone } from "voice-glow";
import { useApp } from "./ctx";
import { unlockAudio, useNarrow, useSimulatedVoice, useSpeechToText, type Speaker } from "./hooks";
import { B, LIVE_SUGGESTIONS, SUGGESTIONS, type Bi } from "./model";
import { I } from "./ui";
import { suggestions } from "./smart";
import { daysFromNow } from "./time";
import { BorderBeam } from "border-beam";
import { AgentBot, LiveBot } from "./Bot";
import { taskVerb } from "./tasks";
import { useSlash } from "./SlashMenu";
import { cleanSpeech, recordClip } from "./speech";
import { transcribe } from "./cloud/api";
import { TalkButton } from "./Talk";

const BEAM = ["#7399C6", "#9DB8DA", "#5F88BA", "#B9CFE8", "#8FAED3", "#C9D8EC", "#A7BFE0"];
const BAND = { core: "#FFFFFF", above: "#8FAED3", mid: "#C9D8EC", below: "#B9CFE8" };
/* The pill's own corners: 999 for the floating dock, 24 in the agent panel (styles.css .composer, .panel .composer).
   Passed to both beams so neither has to guess from its first child. */
const RADIUS = { dock: 999, panel: 24 };
/* A soft beam that always rides the pill's edge, in Placetta's blue. On a light page border-beam draws its stroke and bloom
   as a grey sweep with its palette ("ice", a cyan) tinted over it, so the stroke and bloom are redrawn here in the BEAM
   blues, and the inner glow keeps ice turned 20° and about half as saturated, which lands it at hue 208, between #A4C8E1 and #7399C6. */
const EDGE_CSS = `
[data-beam="{id}"][data-active]::after, [data-beam="{id}"][data-fading]::after {
  background: conic-gradient(from var(--beam-angle-{id}), transparent 0%, transparent 52%, rgba(185, 207, 232, .35) 57%, rgba(143, 174, 211, .75) 62%,
    #5F88BA 66.5%, #7399C6 69%, rgba(157, 184, 218, .6) 73%, rgba(201, 216, 236, .2) 77%, transparent 80%, transparent 100%);
  opacity: calc(var(--beam-opacity-{id}) * var(--beam-strength, 1));
}
[data-beam="{id}"][data-active]::before, [data-beam="{id}"][data-fading]::before {
  filter: hue-rotate(20deg) saturate(.55);
  box-shadow: inset 0 0 6px 1px rgba(115, 153, 198, .22);
}
[data-beam="{id}"] [data-beam-bloom] {
  background: conic-gradient(from var(--beam-angle-{id}), transparent 0%, transparent 58%, rgba(143, 174, 211, .25) 64%, rgba(115, 153, 198, .9) 69.5%,
    rgba(143, 174, 211, .25) 75%, transparent 82%);
}`;

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
/** The first three things to try, for a workspace with little in it yet. The workspace's own suggestions come first
 *  when it has any (src/smart.ts); "Upload my lease" opens the file picker instead of asking. */
const STARTERS = [B("Map my permits", "梳理我的许可"), B("What's due this week", "本周有什么到期"), B("Upload my lease", "上传我的租约")];
const isUploadChip = (s: Bi) => s.en === STARTERS[2].en;

export function Composer({ variant, tts, asked, showLive = true, starters = false }: { variant: "dock" | "panel"; tts: Speaker; asked: string[]; showLive?: boolean; starters?: boolean }) {
  const { t, b, lang, busy, live, ask, upload, stop, mode, ws, cloud } = useApp();
  const [draft, setDraft] = useState("");

  const mic = useMicrophone();
  const sim = useSimulatedVoice();
  const [voice, setVoice] = useState<"off" | "mic" | "sim">("off");
  const [heard, setHeard] = useState("");
  const [note, setNote] = useState<"" | "simNote" | "deniedNote" | "noSttNote" | "frameNote" | "sttFailed">("");
  // a voice note for the server to transcribe, where the browser has no speech recognition: recording, then turning to text
  const clip = useRef<ReturnType<typeof recordClip>>(null);
  const [noteState, setNoteState] = useState<"" | "rec" | "busy">("");
  const stt = useSpeechToText(useCallback((s: string) => setHeard(s), []));
  const typer = useRef<number[]>([]);
  const clearTyper = () => { typer.current.forEach(clearTimeout); typer.current = []; };
  const listening = (voice === "mic" && (mic.state === "live" || noteState === "busy")) || voice === "sim";
  // the sample's scripted demo answers its own suggestions; a live agent gets tasks it does end to end
  // a live agent's come from the workspace as it is now: a store slipping, filings waiting, a permit about to lapse
  const open = useMemo(() => (mode === "demo" ? SUGGESTIONS : suggestions(ws, daysFromNow(0), LIVE_SUGGESTIONS)).filter(s => !asked.some(q => near(q, s.en) || near(q, s.zh))).slice(0, 2), [asked, mode, ws]);
  // the dock's starter chips: an empty or nearly empty workspace gets three, the workspace's own first, no two alike
  // nothing verified or uploaded yet: a brand-new workspace, or one whose permits are still the registry's instant plan
  // (the application filled at sign-up and waiting for approval, src/plan/prefill.ts, doesn't make it any less new)
  const firstWin = ws.firstPlan?.win;
  const nearlyEmpty = !ws.approvals.some(a => !(firstWin && a.app === firstWin)) && !ws.docs.length && (ws.apps.length < 3 || ws.apps.every(a => a.preview || a.id === firstWin));
  // the first win waiting for Approve is the one next step: on a phone the floating chips would cover it, so they wait
  const winWaiting = !!firstWin && ws.approvals.some(a => a.app === firstWin);
  const narrow = useNarrow(560);
  const chips = useMemo(() => {
    if (!starters || !nearlyEmpty || (winWaiting && narrow)) return [] as Bi[];
    const out: Bi[] = [];
    for (const s of suggestions(ws, daysFromNow(0), STARTERS)) {
      if (asked.some(q => near(q, s.en) || near(q, s.zh)) || out.some(x => near(x.en, s.en) || near(s.en, x.en))) continue;
      out.push(s);
      if (out.length === 3) break;
    }
    return out;
  }, [starters, nearlyEmpty, ws, asked, winWaiting, narrow]);

  /* Done puts what was said, cleaned of um and uh, in the box to check before it goes (Wispr Flow, ChatGPT dictation);
     Send sends it as is; Cancel drops it. A voice note is transcribed on the server first. */
  const ta = useRef<HTMLTextAreaElement>(null);
  const place = useCallback((said: string, how: "edit" | "send") => {
    if (!said) return;
    if (how === "send") { ask(said, true); return; }
    setDraft(d => (d.trim() ? d.trim() + " " : "") + said);
    setTimeout(() => ta.current?.focus(), 0);
  }, [ask]);
  const endVoice = useCallback(async (how: "cancel" | "edit" | "send", text?: string) => {
    clearTyper(); stt.stop(); sim.stop();
    const c = clip.current; clip.current = null;
    const said = cleanSpeech(text ?? heard, lang === "zh" ? "zh" : "en"); setHeard("");
    if (c) {
      if (how === "cancel") { c.cancel(); mic.stop(); setNoteState(""); setVoice("off"); return; }
      setNoteState("busy");
      const blob = await c.stop(); mic.stop();
      const got = blob && cloud ? await transcribe(cloud.wsId, blob, lang === "zh" ? "zh" : "en") : null;
      setNoteState(""); setVoice("off");
      if (got == null) { setNote("sttFailed"); return; }
      place(cleanSpeech(got, lang === "zh" ? "zh" : "en"), how);
      return;
    }
    mic.stop(); setVoice("off");
    if (how !== "cancel") place(said, how);
  }, [mic, stt, sim, heard, lang, cloud, place]);

  // No microphone here: a speech-shaped level drives the glow while the next suggestion is "heard", then it sends like a real turn.
  const simulate = useCallback(() => {
    const line = b(open[0] ?? SUGGESTIONS[1]);
    setVoice("sim"); setNote("simNote"); sim.start(); setHeard("");
    const per = lang === "zh" ? 210 : 62;
    for (let i = 1; i <= line.length; i++) typer.current.push(window.setTimeout(() => setHeard(line.slice(0, i)), 700 + i * per));
    typer.current.push(window.setTimeout(() => void endVoice("send", line), 700 + line.length * per + 1000));
  }, [open, b, lang, sim, endVoice]);

  const startVoice = useCallback(async () => {
    if (busy) return;
    unlockAudio(); tts.stop(); setNote(""); setHeard("");
    // the sample demo shows what talking looks like; a real workspace never pretends to hear you
    if (!mic.supported || !micAllowedHere()) { if (mode === "demo") simulate(); else setNote("frameNote"); return; }
    const s = await mic.start();
    if (s) {
      setVoice("mic");
      if (stt.start(speakTag(lang))) return;
      // no speech recognition in this browser: record a voice note and let the server turn it into text
      const r = cloud ? recordClip(s) : null;
      if (r) { clip.current = r; setNoteState("rec"); } else setNote("noSttNote");
      return;
    }
    if (inFrame && mode === "demo") simulate(); else setNote(inFrame ? "frameNote" : "deniedNote");
  }, [busy, tts, mic, simulate, stt, lang, mode]);
  useEffect(() => () => clearTyper(), []);

  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 128) + "px"; }, [draft]);
  const attach = useRef<HTMLInputElement>(null);
  const pickFile = useCallback(() => attach.current?.click(), []);
  /* Commands ("/" in the box) and Plan first (src/SlashMenu.tsx): a command becomes its request when it's sent. */
  const slash = useSlash({ draft, setDraft, variant, onUpload: pickFile });
  /* The box keeps only the mic and send (or stop). Files come in by "/upload", by dropping them on the box, from the
     Upload she asks for in a reply, or from ⌘K; Plan first by "/plan", ⌘K or Settings. ⌘K sends "placetta:composer". */
  const { setPlan } = slash;
  useEffect(() => {
    const on = (e: Event) => {
      const what = (e as CustomEvent<"attach" | "plan-first">).detail;
      if (what === "attach") pickFile();
      if (what === "plan-first") { setPlan(true); setTimeout(() => ta.current?.focus(), 0); }
    };
    addEventListener("placetta:composer", on);
    return () => removeEventListener("placetta:composer", on);
  }, [pickFile, setPlan]);
  const [over, setOver] = useState(false);
  // while she's busy, what you send waits its turn (Work, Up next)
  const send = () => { const q = draft.trim(); if (q) { setDraft(""); slash.send(q); } };
  const level = useCallback(() => Math.max(sim.level(), tts.level()), [sim, tts]);
  const dock = variant === "dock";
  // voice mode fits any height: the bot shrinks on short screens (an embedded preview can be under 500px tall)
  const botSize = Math.round(Math.min(150, Math.max(78, (typeof window === "undefined" ? 800 : window.innerHeight) * 0.19)));

  return (
    <div className={"composer-wrap c-" + variant}>
      {dock && showLive && busy && live && (
        <p className="dock-live" aria-live="polite"><b>{b(taskVerb(live.state))}…</b><span>{b(live.label)}</span>{live.tool && <em>{live.tool}</em>}</p>
      )}
      {!dock && open.length > 0 && !busy && !asked.length && (
        <div className="sugg">{open.map(s => <button key={s.en} type="button" onClick={() => ask(b(s))}>{b(s)}</button>)}</div>
      )}
      {dock && chips.length > 0 && !busy && (
        <div className="sugg dock-chips">{chips.map(s => <button key={s.en} type="button" onClick={() => (isUploadChip(s) ? attach.current?.click() : ask(b(s)))}>{isUploadChip(s) ? <I.upload /> : null}{b(s)}</button>)}</div>
      )}
      {slash.menu}
      <VoiceBeam className="beam" level={level} processing={busy} theme="light" colors={BEAM} bandColors={BAND} idle={dock ? 0.16 : 0.1} scale={dock ? 1.1 : 0.9} borderRadius={RADIUS[variant]}>
        <BorderBeam className="c-edge" size="md" theme="light" colorVariant="ice" borderRadius={RADIUS[variant]} staticColors brightness={1} saturation={1} strength={0.85} css={EDGE_CSS}>
        <form className={"composer" + (over ? " drop" : "")} onSubmit={e => { e.preventDefault(); send(); }}
          onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
          onDrop={e => { const f = Array.from(e.dataTransfer.files ?? []); setOver(false); if (f.length) { e.preventDefault(); upload("", "", f); } }}>
          {dock && <span className="c-bot" aria-hidden="true"><LiveBot size={34} busy={busy} task={busy && live ? live.state : undefined} gaze={[2.8, 0]} /></span>}
          <input ref={attach} type="file" multiple hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) upload("", "", f); }} />
          <label htmlFor={"ask-" + variant} className="sr">{t("askPh")}</label>
          <textarea id={"ask-" + variant} ref={ta} rows={1} value={draft} placeholder={slash.plan ? (lang === "zh" ? "要做什么？她先写计划" : "What's the job? She plans it first") : narrow ? t("askPhShort") : t("askPh")} onChange={e => setDraft(e.target.value)}
            {...slash.inputProps} onKeyDown={e => { if (slash.onKey(e)) return; if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          {slash.toggle(busy)}
          {cloud && <TalkButton />}
          <button type="button" className="ic mic" aria-label={t("talk")} title={t("talk")} onClick={startVoice} disabled={busy}><I.mic /></button>
          {busy && !draft.trim()
            ? <button type="button" className="sendb stop" onClick={stop} aria-label={t("stop")} title={t("stop")}><I.stopSq /></button>
            : <button type="submit" className="sendb" disabled={!draft.trim()} aria-label={t("send")}><I.send /></button>}
        </form>
        </BorderBeam>
      </VoiceBeam>
      {note && !listening && <p className="c-note">{t(note)}</p>}

      {/* on the page itself, so no bar that makes its own layer (the phone's tab bar) can sit over its buttons */}
      {listening && createPortal(
        <div className="voice" role="dialog" aria-modal="true" aria-label={t("listening")}>
          <button type="button" className="vclose" aria-label={t("close")} onClick={() => void endVoice("cancel")}><I.x /></button>
          <div className="vmid">
            <div className="vbot" style={{ width: botSize, height: botSize }}><AgentBot size={botSize} busy task="listening" label={t("listening")} /></div>
            <p className="vlabel">{t("listening")}</p>
            <p className={"vtext" + (heard ? "" : " hint")} aria-live="polite">{noteState === "busy" ? t("transcribing") + "…" : heard ? cleanSpeech(heard, lang === "zh" ? "zh" : "en") : noteState === "rec" ? t("recording") : t("tapDone")}</p>
            {note && <p className="vnote">{t(note)}</p>}
          </div>
          <div className="vfoot">
            {/* The glow sits in its own tall layer behind the buttons and fades out toward the top, so it never shows an edge. */}
            <VoiceBeam className="vbeam" aria-hidden="true" type="mobile" stream={voice === "mic" ? mic.stream : null} level={sim.level} theme="light"
              colors={BEAM} bandColors={BAND} borderRadius={0} scale={window.innerWidth < 760 ? 1 : 1.6} reach={window.innerWidth < 760 ? 3 : 2.6} idle={0.2}>
              <div className="vbeam-fill" />
            </VoiceBeam>
            <div className="vbar">
              <button type="button" className="vbtn" disabled={noteState === "busy"} onClick={() => void endVoice("cancel")}>{t("cancel")}</button>
              <button type="button" className="vbtn" disabled={noteState === "busy"} onClick={() => void endVoice("send")}>{t("send")}</button>
              <button type="button" className="vbtn primary" disabled={noteState === "busy"} onClick={() => void endVoice("edit")}><I.check />{t("done")}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
