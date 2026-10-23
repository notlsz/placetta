/* Talking to Odelia, the way Wispr Flow and ChatGPT dictation do it: what you say appears as you say it, the filler is
   taken out, and it lands in the message box for a look before it's sent.

   Two ways in, cheapest first:
     the browser's own speech recognition (Chrome, Edge, Safari): free, instant, English and Mandarin
     where there's none (Firefox, some phones): the clip is recorded and transcribed on the server by Whisper on Groq
       (supabase/functions/tts, multipart), about $0.04 an hour of audio: a minute costs $0.0007
   Voice notes are the second path on purpose: a recorded clip, transcribed, edited, sent. */

/** English and Mandarin filler, as people say it into a microphone: um, uh, er, hmm; 嗯, 呃, 额. Only sounds, never words
 *  that can carry meaning ("like", "so", "那个", "就是" stay). */
const FILLER_EN = /\b(?:u+m+|u+h+m*|e+r+m*|h+m+|a+h+)\b[,.]?\s*/gi;
const FILLER_ZH = /(?:^|(?<=[，。！？\s]))[嗯呃额]+[，,。\s]*/g;

/** Cleans a transcript: drops filler sounds and words said twice in a row ("the the"), tidies spaces and punctuation,
 *  and starts English with a capital. Leaves everything else exactly as said. */
export function cleanSpeech(text: string, lang: "en" | "zh"): string {
  let s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(FILLER_ZH, "");
  s = s.replace(FILLER_EN, "");
  // a word said twice in a row, a slip of the tongue (but not "that that" across a comma)
  s = s.replace(/\b(\w+)(\s+\1\b)+/gi, (m, w: string) => (/^(had|that)$/i.test(w) ? m : w));
  s = s.replace(/\s+([,.?!，。？！])/g, "$1").replace(/([,，])\1+/g, "$1").replace(/^[,，.。\s]+/, "").replace(/\s{2,}/g, " ").trim();
  if (lang === "en" && /^[a-z]/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  if (lang === "en") s = s.replace(/\bi\b/g, "I");
  return s;
}

/** The recorder for the server path: the microphone stream as a compressed clip (Opus in WebM or MP4, whatever the
 *  browser makes), capped at two minutes. */
export function recordClip(stream: MediaStream, maxMs = 120_000): { stop(): Promise<Blob | null>; cancel(): void } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } });
  let rec: MediaRecorder;
  try { rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 24_000 } : undefined); } catch { return null; }
  const parts: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
  rec.start(1000);
  const cap = setTimeout(() => { if (rec.state === "recording") rec.stop(); }, maxMs);
  return {
    stop: () => new Promise(done => {
      clearTimeout(cap);
      const finish = () => done(parts.length ? new Blob(parts, { type: rec.mimeType || type || "audio/webm" }) : null);
      if (rec.state === "inactive") finish(); else { rec.onstop = finish; rec.stop(); }
    }),
    cancel: () => { clearTimeout(cap); try { rec.stop(); } catch { /* already stopped */ } parts.length = 0; },
  };
}

/** What talking costs, for docs/UNIT-ECONOMICS.md and the test that keeps it honest: Groq's Whisper large v3 turbo is
 *  $0.04 an hour of audio, billed at least 10 seconds a request. */
export const STT_USD_PER_HOUR = 0.04;
export const STT_MIN_SECONDS = 10;
export const sttCost = (seconds: number) => (Math.max(STT_MIN_SECONDS, seconds) / 3600) * STT_USD_PER_HOUR;
