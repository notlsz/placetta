import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import type { Application } from "./model";
import * as api from "./cloud/api";
import { ago, sla, NORM_WORDS } from "./tracking";
import { publishedDays } from "./plan";
import { CallsList } from "./Calls";
import { TalkSheet } from "./Talk";
import { useChannels } from "./channels";

/*
 * A filing's timeline, the way a parcel's is: UPS and FedEx tracking, Amazon's and Shopify's order timelines
 * (https://help.shopify.com/manual/orders/manage-orders/managing-orders). Newest event first, each with when, who or
 * what reported it, and how sure it is; "last checked" on top, from the daily status check (src/tracking). The SLA
 * badge copies Zendesk's and Linear's (https://linear.app/changelog/2023-03-16-slas): on track, at risk, past due.
 * A phone call with the agency is an event too, with its recording, transcript and summary one tap away (Calls).
 */

const SOURCE: Record<string, { en: string; zh: string }> = {
  team: { en: "Placetta team", zh: "快哉团队" }, owner: { en: "You", zh: "您" }, placetta: { en: "Placetta", zh: "快哉" },
  open_data: { en: "City's open data", zh: "城市公开数据" }, agency_page: { en: "Agency's status page", zh: "机构状态页面" }, odelia: { en: "Odelia", zh: "Odelia" },
  phone_call: { en: "Odelia's call to the agency", zh: "Odelia 致电机构" },
};
const BADGE = {
  on_track: { en: "On track", zh: "进度正常", cls: "ok" },
  at_risk: { en: "Near the agency's usual time", zh: "接近机构通常时间", cls: "warn" },
  breached: { en: "Past the agency's usual time", zh: "已超过机构通常时间", cls: "bad" },
} as const;

export function StatusTimeline({ a, filing }: { a: Application; filing: api.Filing }) {
  const { lang, cloud } = useApp();
  const zh = lang === "zh";
  const [t, setT] = useState<api.Timeline | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [calls, setCalls] = useState(false);
  const [sheet, setSheet] = useState<api.VoiceMode | null>(null);
  const [said, setSaid] = useState("");
  const ch = useChannels();   // before any return: a hook runs on every render
  useEffect(() => {
    let live = true;
    api.filingTimeline(filing.id).then(x => { if (live) setT(x); }, () => { if (live) setT(null); });
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => { live = false; clearInterval(tick); };
  }, [filing.id, filing.status, filing.updated_at]);
  if (!t) return null;
  const tr = t.tracking;
  const s = filing.status === "submitted" ? sla(filing.submitted_at, publishedDays(a.est), new Date(now).toISOString().slice(0, 10), tr?.last_movement_at) : null;
  const when = (iso: string) => new Date(iso).toLocaleString(zh ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const conf = (c: number | null) => (c == null || c >= 1 ? "" : zh ? `可信度 ${Math.round(c * 100)}%` : `${Math.round(c * 100)}% sure`);
  const withAgency = ["submitted", "needs_info", "in_progress"].includes(filing.status);
  const acts = !!cloud && !cloud.viewer;
  const phone = async () => {
    if (!cloud) return;
    setSaid(zh ? "正在安排…" : "Arranging…");
    const r = await api.agencyCall(cloud.wsId, filing.id, zh ? "zh" : "en");
    setSaid(r.ok ? (zh ? "Odelia 正在致电机构，结果会出现在这条时间线上。" : "Odelia is calling the agency. The answer will appear on this timeline.") : (zh ? r.say?.zh : r.say?.en) ?? "");
  };
  return (
    <section className="tl" aria-label={zh ? "办理时间线" : "Status timeline"}>
      <header className="tl-head">
        <b>{zh ? "办理时间线" : "Status timeline"}</b>
        {s && <span className={"tl-badge " + BADGE[s.state].cls}>{zh ? BADGE[s.state].zh : BADGE[s.state].en}{zh ? `：${s.waited} / ${s.usual} 天` : `: day ${s.waited} of about ${s.usual}`}</span>}
      </header>
      <p className="tl-checked">
        <span>{zh ? `上次检查：${ago(tr?.last_checked_at, now, "zh")}` : `Last checked ${ago(tr?.last_checked_at, now, "en")}`}</span>
        {tr?.agency_norm && <span>{zh ? `机构记录：${NORM_WORDS[tr.agency_norm]?.zh ?? tr.agency_status}` : `Agency's record: ${NORM_WORDS[tr.agency_norm]?.en ?? tr.agency_status}`}</span>}
        <span className="quiet">{zh ? "每天检查，有真正变化才通知您" : "Checked daily; you hear only when something really changes"}</span>
      </p>
      {/* each voice action only where its channel is set up (src/channels.ts); with none, a quiet Coming soon */}
      {acts && ch && (ch.calls && withAgency || ch.rehearse || ch.interpreter ? (
        <div className="tl-voice">
          {ch.calls && withAgency && <button type="button" className="vc-btn" onClick={() => void phone()}>{zh ? "让 Odelia 致电机构" : "Have Odelia call the agency"}</button>}
          {ch.rehearse && <button type="button" className="vc-btn" onClick={() => setSheet("rehearse")}>{zh ? "先试听这通电话" : "Hear the call first"}</button>}
          {ch.interpreter && <button type="button" className="vc-btn" onClick={() => setSheet("interpreter")}>{zh ? "现场翻译" : "Interpreter"}</button>}
        </div>
      ) : <p className="tl-soon quiet">{zh ? "致电机构和现场翻译即将推出。" : "Agency calls and the interpreter are coming soon."}</p>)}
      {said && <p className="tl-said" role="status">{said}</p>}
      {t.events.length > 0 && (
        <ol className="tl-events">
          {t.events.map((e, i) => (
            <li key={i} className={"tl-ev k-" + e.kind + (i === 0 ? " now" : "")}>
              <time dateTime={e.at}>{when(e.at)}</time>
              <div>
                <span>{zh ? e.title.zh || e.title.en : e.title.en}</span>
                <small>{[zh ? SOURCE[e.source]?.zh ?? e.source : SOURCE[e.source]?.en ?? e.source, conf(e.confidence)].filter(Boolean).join(zh ? "，" : ", ")}
                  {e.url && <> <a href={e.url} target="_blank" rel="noopener noreferrer">{zh ? "查看来源" : "See the source"}</a></>}
                  {e.call_id && <> <button type="button" className="linkish" onClick={() => setCalls(true)}>{zh ? "回听通话" : "Listen back"}</button></>}</small>
              </div>
            </li>
          ))}
        </ol>
      )}
      {calls && <CallsList filingId={filing.id} />}
      {sheet && <TalkSheet mode={sheet} filingId={filing.id} onClose={() => { setSheet(null); setCalls(true); }} />}
    </section>
  );
}
