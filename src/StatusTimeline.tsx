import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import type { Application } from "./model";
import * as api from "./cloud/api";
import { ago, sla, NORM_WORDS } from "./tracking";
import { publishedDays } from "./plan";
import { CallsList } from "./Calls";
import { TalkSheet } from "./Talk";
import { useChannels } from "./channels";
import { sendingIn, timeLeft } from "./hold";

/* The finished moment (supabase/functions/_shared/carry.ts licenseMoment): once the agency issues it, the license
   itself, one tap away, with its number and when it renews. And what Odelia wrote the agency as the business's agent,
   waiting out the undo window with Undo, then sent. */
function LicenseCard({ a, filing, lic, zh }: { a: Application; filing: api.Filing; lic: api.License; zh: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const name = zh ? a.name.zh : a.name.en;
  const open = async () => {
    if (!lic.path) return;
    setBusy(true); setErr("");
    try {
      const url = URL.createObjectURL(await api.downloadDoc(lic.path));
      window.open(url, "_blank", "noopener");
      void api.licenseSeen(filing.id).catch(() => undefined);
    } catch { setErr(zh ? "暂时打不开，请稍后再试。" : "It didn't open. Try again in a moment."); }
    finally { setBusy(false); }
  };
  return (
    <div className="tl-license" role="status">
      <b>{zh ? `您的${name}已获批准` : `Your ${name.charAt(0).toLowerCase() + name.slice(1)} is approved`}</b>
      <p>
        {lic.number && <span>{zh ? `编号 ${lic.number}` : `Number ${lic.number}`}</span>}
        {lic.expires && <span>{zh ? `有效期至 ${lic.expires}，Odelia 会提前 60 天开始续办` : `Valid until ${lic.expires}; Odelia starts the renewal 60 days before`}</span>}
        {!lic.path && <span className="quiet">{zh ? "Odelia 正在向机构索取执照文件。" : "Odelia is getting the license file from the agency."}</span>}
      </p>
      {lic.path && <button type="button" className="vc-btn" disabled={busy} onClick={() => void open()}>{busy ? (zh ? "正在打开…" : "Opening…") : (zh ? "打开执照 PDF" : "Open the license PDF")}</button>}
      {err && <small className="quiet">{err}</small>}
    </div>
  );
}

const SENT_KIND: Record<api.OutboxSend["kind"], { en: string; zh: string }> = {
  rfi_answer: { en: "Answer to the agency", zh: "答复机构" }, status_inquiry: { en: "Status inquiry", zh: "进度查询" },
  inspection_booking: { en: "Inspection request", zh: "检查预约" }, inspection_reschedule: { en: "New inspection time", zh: "改约检查" },
};
function Sends({ list, zh, acts, now, onUndo }: { list: api.OutboxSend[]; zh: boolean; acts: boolean; now: number; onUndo: (id: string) => void }) {
  const shown = list.filter(o => o.status === "held" || o.status === "sent" || o.status === "failed").slice(0, 4);
  if (!shown.length) return null;
  return (
    <div className="tl-sends">
      {shown.map(o => {
        const left = timeLeft(o.send_after, now);
        const k = SENT_KIND[o.kind] ?? SENT_KIND.rfi_answer;
        return (
          <details key={o.id} className={"tl-send s-" + o.status}>
            <summary>
              <span>{zh ? k.zh : k.en}{zh ? `，发往 ${o.to}` : ` to ${o.to}`}</span>
              <small>{o.status === "held" ? (zh ? sendingIn(left).zh : sendingIn(left).en) : o.status === "sent" ? (zh ? "已发送" : "Sent") : (zh ? "未发出，团队正在处理" : "Didn't go; the team has it")}</small>
              {o.status === "held" && acts && left > 0 && <button type="button" className="linkish" onClick={e => { e.preventDefault(); onUndo(o.id); }}>{zh ? "撤销" : "Undo"}</button>}
            </summary>
            <pre>{o.subject}{"\n\n"}{o.body}</pre>
          </details>
        );
      })}
    </div>
  );
}

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
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    api.filingTimeline(filing.id).then(x => { if (live) setT(x); }, () => { if (live) setT(null); });
    return () => { live = false; };
  }, [filing.id, filing.status, filing.updated_at, reload]);
  // a send waiting out its undo window counts down by the second; otherwise "last checked" moves by the minute
  const holding = !!t?.outbox?.some(o => o.status === "held");
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), holding ? 1000 : 60_000);
    return () => clearInterval(tick);
  }, [holding]);
  if (!t) return null;
  const undo = async (id: string) => {
    try { await api.outboxUndo(id); } catch { /* already sent: the reload shows it */ }
    setReload(n => n + 1);
  };
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
      {t.license && (t.license.path || filing.status === "accepted") && <LicenseCard a={a} filing={filing} lic={t.license} zh={zh} />}
      {t.outbox && <Sends list={t.outbox} zh={zh} acts={acts} now={now} onUndo={id => void undo(id)} />}
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
