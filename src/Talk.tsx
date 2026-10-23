import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { VoiceBeam } from "voice-glow";
import { useApp } from "./ctx";
import * as api from "./cloud/api";
import { Guard } from "./SafeBoundary";
import { I } from "./ui";
import "./voice.css";
import { type Heard, type Live, type LiveState, pairLines, startLive } from "./voice/realtime";

/*
 * Talking live with Odelia, in three modes, in one sheet:
 *   talk         a real-time conversation (ChatGPT's voice mode): she answers from the workspace, and real work she
 *                starts lands in the chat like a typed request, where anything final still waits for approval.
 *   interpreter  the phone on the counter between the owner and an inspector or clerk (Google's interpreter mode,
 *                Microsoft Translator's conversations): the top half faces the clerk in English, the bottom half the
 *                owner in Chinese, with the trade's words translated as the trade says them.
 *   rehearse     try an agency call live ("try it live", as Retell and Vapi let you hear an agent before it calls):
 *                you play the clerk, nothing is dialed and nothing is written.
 * Barge-in and turn-taking happen in the voice brain; this sheet shows captions, keeps the transcript and ends the
 * session (which saves the transcript and its price on the server).
 */

const WORDS = {
  talk: { en: "Talking with Odelia", zh: "正在与 Odelia 通话" },
  interpreter: { en: "Interpreter", zh: "翻译" },
  rehearse: { en: "Rehearsing the agency call", zh: "演练机构通话" },
  connecting: { en: "Connecting", zh: "正在连接" },
  live: { en: "Live: talk any time, she stops when you do", zh: "通话中：随时说话，您开口她就会停下" },
  ended: { en: "Ended", zh: "已结束" },
  failed: { en: "Couldn't connect. Check the microphone, or type to Odelia instead.", zh: "无法连接。请检查麦克风，或改为打字。" },
  end: { en: "End", zh: "结束" },
  mute: { en: "Mute", zh: "静音" },
  unmute: { en: "Unmute", zh: "取消静音" },
  clerk: { en: "For the inspector or clerk: speak English. Odelia, an AI, translates.", zh: "For the inspector or clerk: speak English. Odelia, an AI, translates." },
  owner: { en: "老板请说中文，Odelia（AI）会翻译成英文。", zh: "老板请说中文，Odelia（AI）会翻译成英文。" },
  rehearseNote: { en: "You're the clerk. Nothing is dialed or saved to the filing.", zh: "您扮演机构办事员。不会拨出电话，也不会写入申请。" },
  saved: { en: "Saved to Calls", zh: "已保存到通话记录" },
};

export function TalkSheet({ mode, filingId, onClose }: { mode: api.VoiceMode; filingId?: string; onClose(): void }) {
  const { lang, cloud, ask } = useApp();
  const zh = lang === "zh";
  const w = (k: keyof typeof WORDS) => (zh ? WORDS[k].zh : WORDS[k].en);
  const [state, setState] = useState<LiveState>("connecting");
  const [lines, setLines] = useState<Heard[]>([]);
  const [muted, setMuted] = useState(false);
  const [why, setWhy] = useState("");
  const [saved, setSaved] = useState(false);
  const live = useRef<Live | null>(null);
  const call = useRef<{ id: string; t0: number } | null>(null);
  const linesRef = useRef<Heard[]>([]);

  const finish = useCallback(async () => {
    live.current?.stop();
    const c = call.current;
    call.current = null;
    if (!c || !cloud) return;
    const secs = Math.round((performance.now() - c.t0) / 1000);
    const l = linesRef.current;
    const transcript: api.CallLine[] = mode === "interpreter"
      ? pairLines(l).map(p => ({ who: "", at: p.at, text: p.said, translated: p.translated }))
      : l.map(x => ({ who: x.who === "odelia" ? "odelia" : "owner", at: x.at, text: x.text }));
    try { await api.voiceEnd(cloud.wsId, c.id, secs, transcript); setSaved(true); } catch { /* the call is priced from its start either way */ }
  }, [cloud, mode]);

  useEffect(() => {
    if (!cloud) { setState("failed"); return; }
    let gone = false;
    (async () => {
      let s: api.VoiceSession;
      try { s = await api.voiceSession(cloud.wsId, mode, zh ? "zh" : "en", filingId); }
      catch (e) { const x = e as api.ApiError; setWhy(zh ? x.message_zh ?? x.message : x.message); setState("failed"); return; }
      if (gone) return;
      call.current = { id: s.call_id, t0: performance.now() };
      live.current = await startLive({
        secret: s.secret, url: s.connect.url, maxMinutes: s.max_minutes,
        onState: st => { setState(st); if (st === "ended" || st === "failed") void finish(); },
        onHeard: h => { linesRef.current = [...linesRef.current, h].slice(-400); setLines(linesRef.current); },
        onTool: async t => {
          if (mode === "rehearse") return JSON.stringify({ ok: true, result: `Rehearsal: ${t.name} would run here. Carry on.` });
          const r = await api.voiceTool(cloud.wsId, s.call_id, t.name, t.args);
          if (r.start) ask(r.start, true);   // real work goes into the chat, exactly like a typed request
          return JSON.stringify({ ok: r.ok, result: r.result });
        },
      });
    })();
    return () => { gone = true; void finish(); };
    // one session per sheet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => { void finish(); onClose(); };
  const last = (who: Heard["who"]) => [...lines].reverse().find(l => l.who === who)?.text ?? "";
  const status = state === "failed" ? why || w("failed") : saved ? w("saved") : w(state === "live" ? "live" : state === "ended" ? "ended" : "connecting");

  return createPortal(
    <div className={"voice talk t-" + mode} role="dialog" aria-modal="true" aria-label={w(mode === "talk" ? "talk" : mode)}>
      {mode === "interpreter" ? (
        <div className="tk-split">
          {/* the clerk's half faces the other side of the counter */}
          <section className="tk-half tk-clerk" lang="en">
            <p className="tk-hint">{WORDS.clerk.en}</p>
            <p className="tk-cap" aria-live="polite">{pairLines(lines).filter(p => /[一-鿿]/.test(p.said)).slice(-1)[0]?.translated ?? ""}</p>
          </section>
          <section className="tk-half tk-owner" lang="zh">
            <p className="tk-hint">{WORDS.owner.zh}</p>
            <p className="tk-cap" aria-live="polite">{pairLines(lines).filter(p => !/[一-鿿]/.test(p.said)).slice(-1)[0]?.translated ?? ""}</p>
          </section>
        </div>
      ) : (
        <div className="vmid">
          <p className="vlabel">{w(mode === "talk" ? "talk" : "rehearse")}</p>
          {mode === "rehearse" && <p className="vnote">{w("rehearseNote")}</p>}
          <p className="vtext" aria-live="polite">{last("odelia") || (state === "live" ? "" : status)}</p>
          {last("them") && <p className="tk-you">{last("them")}</p>}
        </div>
      )}
      <div className="vfoot">
        <Guard quiet>
          <VoiceBeam className="vbeam" aria-hidden="true" type="mobile" stream={live.current?.stream ?? null} theme="light" borderRadius={0} idle={0.2}>
            <div className="vbeam-fill" />
          </VoiceBeam>
        </Guard>
        <p className="tk-status" role="status">{status}</p>
        <div className="vbar">
          <button type="button" className="vbtn" disabled={state !== "live"} onClick={() => { const m = !muted; setMuted(m); live.current?.mute(m); }}>{w(muted ? "unmute" : "mute")}</button>
          <button type="button" className="vbtn primary" onClick={close}><I.x />{w("end")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The live-talk button next to the microphone: a conversation, not dictation. Only where Placetta's server is. */
export function TalkButton() {
  const { lang, cloud, busy } = useApp();
  const [open, setOpen] = useState(false);
  if (!cloud || cloud.viewer) return null;
  const label = lang === "zh" ? "与 Odelia 通话" : "Talk with Odelia";
  return (
    <>
      <button type="button" className="ic talkb" aria-label={label} title={label} onClick={() => setOpen(true)} disabled={busy}><I.phone /></button>
      {open && <TalkSheet mode="talk" onClose={() => setOpen(false)} />}
    </>
  );
}
