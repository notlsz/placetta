import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioContext } from "voice-glow";

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

/** True below the given width. */
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

// Young, natural-sounding female voices the browser may have, best first; used for live replies, which have no recording.
// Edge ships Microsoft's neural voices (Emma and Ava read young); Safari and Chrome on a Mac have Samantha, Ava and Google's.
const FEMALE: Record<string, RegExp[]> = {
  en: [/Emma.*(Natural|Online)/i, /Ava.*(Natural|Online|Premium|Enhanced)/i, /Jenny.*Natural/i, /Aria.*Natural/i, /Michelle.*Natural/i, /Samantha.*(Premium|Enhanced)/i, /^Google US English$/i, /^Ava\b/i, /Allison/i, /Samantha/i, /Zoe/i, /Susan/i, /Karen/i, /female/i],
  zh: [/Xiaoyi.*(Natural|Online)/i, /Xiaoxiao.*(Natural|Online)/i, /Xiaohan.*Natural/i, /Xiaomo.*Natural/i, /Google\s*普通话/, /普通话/, /Ting-?Ting/i, /Lili/i, /Meijia/i, /female/i],
};
if (typeof window !== "undefined" && "speechSynthesis" in window) { try { window.speechSynthesis.getVoices(); } catch { /* voices load later */ } }
function pickVoice(lang: string) {
  const all = window.speechSynthesis.getVoices(), two = lang.slice(0, 2).toLowerCase();
  const mine = all.filter(v => v.lang.toLowerCase().startsWith(two));
  for (const re of FEMALE[two] ?? []) { const v = mine.find(x => re.test(x.name)); if (v) return v; }
  return mine[0];
}

// The recorded clips are large, so they load after the page is up, not with it.
type Clips = Record<string, string>;
let clipsP: Promise<Clips> | null = null;
export const loadClips = () => (clipsP ??= import("./voices.generated").then(m => m.CLIPS).catch(() => ({} as Clips)));
/* The recorded clips are the demo's scripted replies. The signed-in app speaks live replies with the server voice, so it never downloads them. */
const DEMO = !(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_KEY);
if (DEMO && typeof window !== "undefined") (window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500)))(() => void loadClips());

const toBytes = (dataUrl: string) => { const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1), bin = atob(b64), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; };

/**
 * Speak a reply in a natural young female voice, best source first:
 *   1. the recorded clip for a scripted reply (Kokoro, recorded ahead of time),
 *   2. the account's server voice (Azure neural) for anything else,
 *   3. the browser's best female voice.
 * Audio is decoded straight into Web Audio, so it plays inside embedded previews whose security policy
 * blocks media URLs, and the glow follows the real audio through an analyser.
 */
export function useSpeak(remote?: (text: string, lang: string) => Promise<ArrayBuffer | null>) {
  const supported = typeof window !== "undefined" && ("speechSynthesis" in window || "AudioContext" in window);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const last = useRef(0);
  const src = useRef<AudioBufferSourceNode | null>(null);
  const el = useRef<HTMLAudioElement | null>(null);
  const an = useRef<AnalyserNode | null>(null);
  const buf = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const token = useRef(0);
  const stop = useCallback(() => {
    token.current++;
    try { src.current?.stop(); } catch { /* already stopped */ }
    src.current = null;
    if (el.current) { el.current.pause(); el.current = null; }
    an.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(null);
  }, []);

  const playBytes = useCallback(async (bytes: ArrayBuffer, text: string, my: number) => {
    const ctx = getAudioContext();
    if (!ctx) throw new Error("no audio");
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    const audio = await ctx.decodeAudioData(bytes.slice(0));
    if (token.current !== my) return;
    const s = ctx.createBufferSource(), x = ctx.createAnalyser();
    s.buffer = audio; x.fftSize = 1024; s.connect(x); x.connect(ctx.destination);
    src.current = s; an.current = x; buf.current = new Uint8Array(x.fftSize);
    s.onended = () => { if (src.current === s) { src.current = null; an.current = null; setSpeaking(null); } };
    setSpeaking(text); s.start();
  }, []);

  const browserVoice = useCallback((text: string, lang: string) => {
    if (!("speechSynthesis" in window)) return;
    const ss = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = lang.startsWith("zh") ? 1.03 : 1.06; u.pitch = 1.08;
    const v = pickVoice(lang); if (v) u.voice = v;
    u.onstart = () => { last.current = performance.now(); setSpeaking(text); };
    u.onboundary = () => { last.current = performance.now(); };
    u.onend = () => setSpeaking(null);
    u.onerror = () => setSpeaking(null);
    ss.speak(u);
  }, []);

  const speak = useCallback((text: string, lang: string) => {
    if (!text) return;
    stop();
    const my = token.current;
    try { const ctx = getAudioContext(); if (ctx?.state === "suspended") void ctx.resume(); } catch { /* no Web Audio */ }   // inside the click
    void (async () => {
      const clip = remote ? undefined : (await loadClips())[(lang.startsWith("zh") ? "zh" : "en") + ":" + fnv(text)];
      if (token.current !== my) return;
      if (clip) {
        try { await playBytes(toBytes(clip), text, my); return; } catch { /* try an element next */ }
        try {
          const a = new Audio(clip); el.current = a;
          a.onplay = () => setSpeaking(text);
          a.onended = a.onerror = () => { if (el.current === a) { el.current = null; setSpeaking(null); } };
          await a.play(); return;
        } catch { el.current = null; }
      }
      if (remote) {
        try { const bytes = await remote(text, lang); if (token.current !== my) return; if (bytes) { await playBytes(bytes, text, my); return; } } catch { /* fall back */ }
      }
      if (token.current === my) browserVoice(text, lang);
    })();
  }, [stop, playBytes, browserVoice, remote]);

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
export type Speaker = ReturnType<typeof useSpeak>;

/* ------------------------------- appearance ------------------------------- */

export type Theme = "light" | "dark" | "system";
const THEME_KEY = "placetta-theme";
export const readTheme = (): Theme => { try { const v = localStorage.getItem(THEME_KEY); if (v === "light" || v === "dark" || v === "system") return v; } catch { /* storage blocked */ } return "light"; };
const systemDark = () => { try { return matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; } };
/** Put the theme on the page: Light, Dark, or whatever the device uses. */
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t === "system" ? (systemDark() ? "dark" : "light") : t;
}
/** The appearance setting, kept in this browser and followed live when it's "system". */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>(readTheme);
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage blocked */ }
    if (theme !== "system") return;
    let mq: MediaQueryList | null = null;
    try { mq = matchMedia("(prefers-color-scheme: dark)"); } catch { return; }
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq?.removeEventListener("change", on);
  }, [theme]);
  return [theme, set];
}
