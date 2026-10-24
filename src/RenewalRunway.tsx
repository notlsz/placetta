import { useMemo } from "react";
import { useApp } from "./ctx";
import { B } from "./bi";
import { LANES, runway } from "./runway";
import { daysFromNow, fmtDay, fmtIn } from "./time";
import "./corrections.css";

/* The renewal runway (src/runway.ts) on the Deadlines tab: what renews in 30, 60 and 90 days, licenses and people's
   certificates alike, and who does what next. A license opens its application; one with no application hands the
   renewal to Odelia. */

export function RenewalRunway() {
  const { ws, lang, b, openApp, ask, busy } = useApp();
  const items = useMemo(() => runway(ws, daysFromNow(0)), [ws]);
  const zh = lang === "zh";
  if (!items.length) return null;
  return (
    <section className="rw" aria-labelledby="rw-h">
      <header className="rw-h">
        <h2 id="rw-h">{zh ? "未来 90 天的续期" : "Renewals in the next 90 days"}<span>{items.length}</span></h2>
        <p>{zh ? "执照提前 60 天由 Odelia 开始续办，等您批准；员工证书由本人续期，Odelia 用对方看得懂的语言提醒。" : "Odelia starts each license's renewal 60 days out and puts it up for your approval. A person's certificate is theirs to renew, and Odelia reminds them in the language they read."}</p>
      </header>
      <div className="rw-lanes">
        {LANES.map(ln => {
          const xs = items.filter(x => x.lane === ln.lane);
          if (!xs.length) return null;
          return (
            <div key={String(ln.lane)} className={"rw-lane ln-" + ln.lane}>
              <h3>{b(ln.label)}<span>{xs.length}</span></h3>
              <ul>
                {xs.map(x => (
                  <li key={x.id}>
                    <div className="rw-tx">
                      <b>{b(x.name)}</b>
                      <small>{[x.holder && b(x.holder), x.agency && b(x.agency)].filter(Boolean).join(zh ? "，" : ", ")}</small>
                      <p>{b(x.next)}</p>
                    </div>
                    <div className="rw-act">
                      <em>{fmtDay(x.date, lang)}</em>
                      <small>{x.days < 0 ? (zh ? `已过期 ${-x.days} 天` : `${-x.days} day${x.days === -1 ? "" : "s"} ago`) : fmtIn(x.days, lang)}</small>
                      {x.app ? <button type="button" className="pill quiet sm" onClick={() => openApp(x.app!)}>{zh ? "打开" : "Open"}</button>
                        : x.kind === "license" && x.days <= 60 ? <button type="button" className="pill quiet sm" disabled={busy} onClick={() => ask(b(B(`Start the renewal of the ${x.name.en}${x.holder ? ` for ${x.holder.en}` : ""}, which expires ${x.date}.`, `开始续办${x.holder ? x.holder.zh + "的" : ""}${x.name.zh}，${x.date} 到期。`)))}>{zh ? "开始续办" : "Start it"}</button> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
