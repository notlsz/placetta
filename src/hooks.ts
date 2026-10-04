import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioContext } from "voice-glow";
import { CLIPS } from "./voices.generated";

/**
 * A stand-in voice for when there's no microphone (an embedded preview, a denied prompt):
 * a per-frame level shaped like speech — syllables riding on phrase swells — for VoiceBeam's `level` getter.
 */
export function useSimulatedVoice() {
  const [on, setOn] = useState(false);
  const t0 = useRef(0);
  const level = useCallback(() => {
    if (!on) return 0;
    const t = (performance.now() - t0.current) / 1000;
    const phrase = Math.max(0, Math.sin(t * 1.35) * 0.6 + 0.45);
    const syll = 0.55 + 0.45 * Math.abs(Math.sin(t * 9.3 + Math.sin(t * 2.1) * 2));
    const fadeIn = Math.min(1, t / 0.35);
    return Math.min(1, phrase * syll * 0.95 * fadeIn);
  }, [on]);
  const start = useCallback(() => { t0.current = performance.now(); setOn(true); }, []);
  const stop = useCallback(() => setOn(false), []);
  return { on, level, start, stop };
}

/** Browser speech-to-text where it exists (Chrome, Edge, Safari). Returns null when unsupported. */
type SR = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
export function useSpeechToText(onText: (text: string) => void) {
  const rec = useRef<SR | null>(null);
  const Ctor = typeof window !== "undefined" ? ((window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition) : undefined;
  const start = useCallback((lang: string) => {
    if (!Ctor) return false;
    try {
      const r = new Ctor(); r.lang = lang; r.interimResults = true; r.continuous = true;
      r.onresult = e => { let s = ""; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; onText(s); };
      r.onend = null; r.onerror = null; r.start(); rec.current = r; return true;
    } catch { return false; }
  }, [Ctor, onText]);
  const stop = useCallback(() => { try { rec.current?.stop(); } catch { /* already stopped */ } rec.current = null; }, []);
  useEffect(() => () => { try { rec.current?.abort(); } catch { /* noop */ } }, []);
  return { supported: !!Ctor, start, stop };
}

/** Narrow screens get the chat and the plan as two tabs. */
export function useNarrow(px = 1024) {
  const q = `(max-width: ${px - 1}px)`;
  const [n, setN] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const on = () => setN(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, [q]);
  return n;
}

/** FNV-1a over the reply text; the same function names the recorded clips in scripts/make-voices.py. */
export const fnv = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, "0"); };

/** Start (or resume) the shared audio context from a click, so replies can play when they arrive. */
export const unlockAudio = () => { try { getAudioContext(); } catch { /* no Web Audio */ } };

// Natural-sounding female voices the browser may have, best first; used when a reply has no recorded clip.
const FEMALE: Record<string, RegExp[]> = {
  en: [/Ava.*Natural/i, /Aria.*Natural/i, /Jenny.*Natural/i, /Emma.*Natural/i, /Michelle.*Natural/i, /^Google US English$/i, /Samantha/i, /^Ava\b/i, /Allison/i, /Zoe/i, /Susan/i, /Karen/i, /Serena/i, /female/i],
  zh: [/Xiaoxiao.*Natural/i, /Xiaoyi.*Natural/i, /Xiaohan.*Natural/i, /普通话/, /Ting-?Ting/i, /Lili/i, /Meijia/i, /Yu-?shu/i, /female/i],
};
function pickVoice(lang: string) {
  const all = window.speechSynthesis.getVoices(), two = lang.slice(0, 2).toLowerCase();
  const mine = all.filter(v => v.lang.toLowerCase().startsWith(two));
  for (const re of FEMALE[two] ?? []) { const v = mine.find(x => re.test(x.name)); if (v) return v; }
  return mine[0];
}

/**
 * Speak a reply in a natural female voice. Scripted replies play their recorded clip and the glow follows the
 * real audio through an analyser; anything else falls back to the browser's best female voice, with the glow
 * kicked on each word boundary.
 */
export function useSpeak() {
  const supported = typeof window !== "undefined" && ("speechSynthesis" in window || "Audio" in window);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const last = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const an = useRef<AnalyserNode | null>(null);
  const buf = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const stop = useCallback(() => {
    if (audio.current) { audio.current.pause(); audio.current = null; }
    an.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(null);
  }, []);
  const speak = useCallback((text: string, lang: string) => {
    if (!text) return;
    stop();
    const clip = CLIPS[(lang.startsWith("zh") ? "zh" : "en") + ":" + fnv(text)];
    if (clip) {
      const a = new Audio(clip); audio.current = a;
      try {
        const ctx = getAudioContext();
        if (ctx) { const node = ctx.createMediaElementSource(a), x = ctx.createAnalyser(); x.fftSize = 1024; node.connect(x); x.connect(ctx.destination); an.current = x; buf.current = new Uint8Array(x.fftSize); }
      } catch { an.current = null; }
      a.onplay = () => setSpeaking(text);
      const done = () => { if (audio.current === a) { audio.current = null; an.current = null; setSpeaking(null); } };
      a.onended = done; a.onerror = done;
      a.play().catch(() => setSpeaking(null));
      return;
    }
    if (!("speechSynthesis" in window)) return;
    const ss = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = 1; u.pitch = 1.05;
    const v = pickVoice(lang); if (v) u.voice = v;
    u.onstart = () => { last.current = performance.now(); setSpeaking(text); };
    u.onboundary = () => { last.current = performance.now(); };
    u.onend = () => setSpeaking(null);
    u.onerror = () => setSpeaking(null);
    ss.speak(u);
  }, [stop]);
  const level = useCallback(() => {
    if (!speaking) return 0;
    const x = an.current, b = buf.current;
    if (x && b) {
      x.getByteTimeDomainData(b); let sum = 0;
      for (let i = 0; i < b.length; i++) { const d = (b[i] - 128) / 128; sum += d * d; }
      return Math.min(1, Math.sqrt(sum / b.length) * 4.2);
    }
    const now = performance.now(), kick = Math.exp(-((now - last.current) / 1000) * 4.5);
    return Math.min(1, Math.max(kick * 0.85, 0.28 + 0.18 * Math.abs(Math.sin(now / 1000 * 6.3))));
  }, [speaking]);
  useEffect(() => () => stop(), [stop]);
  return { supported, speaking, speak, stop, level };
}
