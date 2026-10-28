import { useMemo } from "react";
import { useApp } from "./ctx";
import { doneSummary, setRenewals } from "./done";
import { nowIso, fmtDay } from "./time";

/* The one screen at the end (src/done.ts): every license approved, the documents behind them in the vault, and each
   renewal on the calendar. Shown on Home only when the opening is done; nothing else asks anything of the owner here. */
export function DoneScreen() {
  const { b, lang, ws, editWs, go } = useApp();
  const zh = lang === "zh";
  const d = useMemo(() => doneSummary(ws, nowIso()), [ws]);
  if (!d.done) return null;
  const unset = d.renewals.filter(r => !r.set).length;
  return (
    <section className="done-card" aria-labelledby="done-h">
      <h2 id="done-h">{zh ? "完成了" : "Done"}</h2>
      <p>{zh ? `${d.licenses.length} 项许可均已批准，${d.docs.length} 份文件已存入保险库。` : `${d.licenses.length} licenses approved. ${d.docs.length} documents in your vault.`}</p>
      <ul className="done-list">
        {d.licenses.map(l => <li key={l.app}><b>{b(l.name)}</b><small>{b(l.agency)}{l.receipt ? (zh ? "，已存档" : ", on file") : ""}</small></li>)}
      </ul>
      {d.renewals.length > 0 && <>
        <h3>{zh ? "续期" : "Renewals"}</h3>
        <ul className="done-list">
          {d.renewals.map(r => <li key={r.app}><b>{b(r.title)}</b><small>{fmtDay(r.date, lang, true)}{r.set ? "" : (zh ? "（待加入日历）" : " (not on the calendar yet)")}</small></li>)}
        </ul>
        {unset > 0 && <button type="button" className="sbtn line" onClick={() => editWs(setRenewals(nowIso()))}>{zh ? "把续期加入日历" : "Put renewals on the calendar"}</button>}
      </>}
      <button type="button" className="sbtn quiet" onClick={() => go("permits", "documents")}>{zh ? "查看文件" : "See documents"}</button>
    </section>
  );
}
