import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import type { Application } from "./model";
import * as api from "./cloud/api";
import { ago, sla, NORM_WORDS } from "./tracking";
import { publishedDays } from "./plan";

/*
 * A filing's timeline, the way a parcel's is: UPS and FedEx tracking, Amazon's and Shopify's order timelines
 * (https://help.shopify.com/manual/orders/manage-orders/managing-orders). Newest event first, each with when, who or
 * what reported it, and how sure it is; "last checked" on top, from the daily status check (src/tracking). The SLA
 * badge copies Zendesk's and Linear's (https://linear.app/changelog/2023-03-16-slas): on track, at risk, past due.
 */

const SOURCE: Record<string, { en: string; zh: string }> = {
  team: { en: "Placetta team", zh: "快哉团队" }, owner: { en: "You", zh: "您" }, placetta: { en: "Placetta", zh: "快哉" },
  open_data: { en: "City's open data", zh: "城市公开数据" }, agency_page: { en: "Agency's status page", zh: "机构状态页面" }, odelia: { en: "Odelia", zh: "Odelia" },
};
const BADGE = {
  on_track: { en: "On track", zh: "进度正常", cls: "ok" },
  at_risk: { en: "Near the agency's usual time", zh: "接近机构通常时间", cls: "warn" },
  breached: { en: "Past the agency's usual time", zh: "已超过机构通常时间", cls: "bad" },
} as const;

export function StatusTimeline({ a, filing }: { a: Application; filing: api.Filing }) {
  const { lang } = useApp();
  const zh = lang === "zh";
  const [t, setT] = useState<api.Timeline | null>(null);
  const [now, setNow] = useState(() => Date.now());
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
      {t.events.length > 0 && (
        <ol className="tl-events">
          {t.events.map((e, i) => (
            <li key={i} className={"tl-ev k-" + e.kind + (i === 0 ? " now" : "")}>
              <time dateTime={e.at}>{when(e.at)}</time>
              <div>
                <span>{zh ? e.title.zh || e.title.en : e.title.en}</span>
                <small>{[zh ? SOURCE[e.source]?.zh ?? e.source : SOURCE[e.source]?.en ?? e.source, conf(e.confidence)].filter(Boolean).join(zh ? "，" : ", ")}
                  {e.url && <> <a href={e.url} target="_blank" rel="noopener noreferrer">{zh ? "查看来源" : "See the source"}</a></>}</small>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
