import { useCallback, useEffect, useRef, useState } from "react";

/** Light or dark, from an explicit data-theme on <html> first, then the OS setting. */
export function useDark() {
  const read = () => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "dark") return true;
    if (t === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(read());
    mq.addEventListener("change", on);
    const mo = new MutationObserver(on);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { mq.removeEventListener("change", on); mo.disconnect(); };
  }, []);
  return dark;
}

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
