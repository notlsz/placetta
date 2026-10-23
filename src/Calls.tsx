import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import * as api from "./cloud/api";
import { I } from "./ui";
import "./voice.css";

/*
 * Listen back: every conversation with Odelia, newest first, the way a voicemail inbox or Gong's call library shows them:
 * what it was, when, how long, the summary, what it set in motion, the transcript, and the recording when everyone
 * agreed to one. The recording plays from a signed link that expires in ten minutes and only ever points into this
 * workspace's own folder. Calls past the workspace's retention keep no words or audio.
 */

const KIND: Record<string, { en: string; zh: string }> = {
  owner_phone: { en: "Phone call with Odelia", zh: "与 Odelia 的电话" },
  app_talk: { en: "Talked in the app", zh: "应用内语音对话" },
  agency_phone: { en: "Odelia called the agency", zh: "Odelia 致电机构" },
  interpreter_phone: { en: "Interpreted phone call", zh: "电话翻译" },
  app_interpreter: { en: "Interpreted at the counter", zh: "现场翻译" },
};
const WHO: Record<string, { en: string; zh: string }> = {
  odelia: { en: "Odelia", zh: "Odelia" }, agency: { en: "Agency", zh: "机构" }, owner: { en: "You", zh: "您" }, clerk: { en: "Clerk", zh: "办事员" },
};

export function CallsList({ filingId, title = true }: { filingId?: string; title?: boolean }) {
  const { lang, cloud } = useApp();
  const zh = lang === "zh";
  const [calls, setCalls] = useState<api.VoiceCall[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [audio, setAudio] = useState<Record<string, string>>({});
  const [why, setWhy] = useState("");
  useEffect(() => {
    if (!cloud) return;
    let live = true;
    api.voiceCalls(cloud.wsId, filingId).then(r => { if (live) setCalls(r.calls); }, () => { if (live) setCalls([]); });
    return () => { live = false; };
  }, [cloud, filingId]);
  if (!cloud || !calls || (!calls.length && filingId)) return null;

  const play = async (id: string) => {
    setWhy("");
    try { const m = await api.callMedia(cloud.wsId, id); setAudio(a => ({ ...a, [id]: m.url })); }
    catch (e) { const x = e as api.ApiError; setWhy(zh ? x.message_zh ?? x.message : x.message); }
  };
  const when = (iso: string) => new Date(iso).toLocaleString(zh ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const mins = (s: number) => (zh ? `${Math.max(1, Math.round(s / 60))} 分钟` : `${Math.max(1, Math.round(s / 60))} min`);

  return (
    <section className="calls" aria-label={zh ? "通话记录" : "Calls"}>
      {title && <h3 className="calls-h">{zh ? "通话记录" : "Calls"}</h3>}
      {!calls.length && <p className="quiet">{zh ? "还没有通话。点麦克风旁的电话图标即可与 Odelia 语音对话。" : "No calls yet. Tap the phone next to the microphone to talk with Odelia."}</p>}
      <ul className="calls-list">
        {calls.map(c => {
          const k = KIND[c.kind] ?? { en: c.kind, zh: c.kind };
          const shown = open === c.id;
          return (
            <li key={c.id} className="call">
              <button type="button" className="call-row" aria-expanded={shown} onClick={() => setOpen(shown ? null : c.id)}>
                <I.phone />
                <span className="call-what"><b>{zh ? k.zh : k.en}</b><small>{[when(c.started_at), c.seconds ? mins(c.seconds) : ""].filter(Boolean).join(zh ? "，" : ", ")}</small></span>
                <I.chev />
              </button>
              {shown && (
                <div className="call-body">
                  {c.summary && <p className="call-sum">{zh ? c.summary.zh || c.summary.en : c.summary.en}</p>}
                  {c.actions.length > 0 && (
                    <div className="call-acts">
                      <b>{zh ? "这通电话带来的操作" : "What it set in motion"}</b>
                      {c.actions.filter(a => a.title).map((a, i) => <p key={i}>{zh ? a.title!.zh || a.title!.en : a.title!.en}</p>)}
                    </div>
                  )}
                  {c.recorded
                    ? audio[c.id] ? <audio className="call-audio" controls autoPlay src={audio[c.id]} /> : <button type="button" className="vc-btn" onClick={() => void play(c.id)}><I.play />{zh ? "收听录音" : "Listen back"}</button>
                    : <p className="quiet">{c.consent === "refused" ? (zh ? "对方不同意录音，所以没有录音。" : "Not recorded: someone on the call asked not to be.") : (zh ? "这次对话没有录音。" : "No recording of this one.")}</p>}
                  {why && <p className="err">{why}</p>}
                  {c.transcript.length > 0 && (
                    <ol className="call-tx">
                      {c.transcript.map((l, i) => l.said !== undefined ? (
                        <li key={i} className={"bi" + (l.missing_terms?.length ? " warn" : "")}>
                          <small>{zh ? WHO[l.who]?.zh ?? l.who : WHO[l.who]?.en ?? l.who}</small>
                          <span lang={l.lang}>{l.said}</span>
                          <span lang={l.lang === "zh" ? "en" : "zh"} className="tr">{l.translated}</span>
                          {l.missing_terms?.length ? <em>{zh ? `请核对术语：${l.missing_terms.join("、")}` : `Check the term: ${l.missing_terms.join(", ")}`}</em> : null}
                        </li>
                      ) : (
                        <li key={i}><small>{zh ? WHO[l.who]?.zh ?? l.who : WHO[l.who]?.en ?? l.who}</small><span>{l.text}</span></li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
