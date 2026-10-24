import { useMemo, useState } from "react";
import { useApp } from "./ctx";
import { SetSheet } from "./SetUI";
import { daysFromNow } from "./time";
import { AREA_WORDS, checksFor, tally, type Check, type CheckState } from "./controls";
import "./trust.css";

/* Checks (Stores): every store's compliance as pass or fail, failing first, each with the record behind it and one
   action for Odelia. Vanta's controls dashboard, for licenses and permits (src/controls.ts). */

type Filter = "open" | "pass" | "all";

export function CheckList({ checks, compact }: { checks: Check[]; compact?: boolean }) {
  const { b, lang, ask, busy, openApp, ws } = useApp();
  const zh = lang === "zh";
  const many = (ws.stores ?? []).length > 1 && !compact;
  const STATE: Record<CheckState, string> = { pass: zh ? "通过" : "passing", warn: zh ? "需留意" : "to watch", fail: zh ? "未通过" : "failing" };
  return (
    <ul className="ck-list">
      {checks.map(c => {
        const s = many ? (ws.stores ?? []).find(x => x.id === c.store) : undefined;
        return (
          <li key={c.id} className={"ck " + c.state}>
            <span className="ck-tx">
              <span className="ck-tag">{b(AREA_WORDS[c.area])}{zh ? "：" : ": "}{STATE[c.state]}{s ? (zh ? `（${b(s.name)}）` : ` (${b(s.name)})`) : ""}</span>
              <b>{c.app ? <button type="button" className="link" onClick={() => openApp(c.app!)}>{b(c.title)}</button> : b(c.title)}</b>
              <small>{b(c.why)}</small>
            </span>
            {c.fix && <button type="button" className="pill quiet sm" disabled={busy} onClick={() => ask(b(c.fix!))}>{zh ? "交给 Odelia" : "Fix with Odelia"}</button>}
          </li>
        );
      })}
    </ul>
  );
}

export function ChecksSheet({ onClose, store }: { onClose: () => void; store?: string }) {
  const { ws, lang, b } = useApp();
  const zh = lang === "zh";
  const [only, setOnly] = useState(store ?? "");
  const [filter, setFilter] = useState<Filter>("open");
  const all = useMemo(() => checksFor(ws, daysFromNow(0), { store: only || undefined }), [ws, only]);
  const n = tally(all);
  const shown = all.filter(c => filter === "all" || (filter === "pass" ? c.state === "pass" : c.state !== "pass"));
  const stores = ws.stores ?? [];
  return (
    <SetSheet title={zh ? "合规检查" : "Checks"} onClose={onClose} className="ts-body"
      sub={zh ? "每家门店的每项执照、续期、存档证明和员工证书，按通过与否列出。只有存档记录才算通过，没有记录就显示“未存档”。"
        : "Every license, renewal, proof on file and staff certificate at each store, as passing or failing. A check passes only on a record; with no record it says so."}>
      {stores.length > 1 && (
        <label className="ts-field">{zh ? "门店" : "Store"}
          <select value={only} onChange={e => setOnly(e.target.value)}>
            <option value="">{zh ? "全部门店" : "All stores"}</option>
            {stores.map(s => <option key={s.id} value={s.id}>{b(s.name)}</option>)}
          </select>
        </label>
      )}
      <p className="ck-sum"><b>{zh ? `${n.total} 项中 ${n.pass} 项通过` : `${n.pass} of ${n.total} passing`}</b>
        <span>{zh ? `${n.fail} 项未通过，${n.warn} 项需留意` : `${n.fail} failing, ${n.warn} to watch`}</span></p>
      <div className="ck-filter" role="group" aria-label={zh ? "筛选" : "Filter"}>
        {([["open", zh ? `未通过与需留意 ${n.fail + n.warn}` : `Failing and to watch ${n.fail + n.warn}`], ["pass", zh ? `通过 ${n.pass}` : `Passing ${n.pass}`], ["all", zh ? "全部" : "All"]] as [Filter, string][]).map(([k, l]) =>
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {shown.length ? <CheckList checks={shown} /> : <p className="quiet">{zh ? "这里没有项目。" : "Nothing here."}</p>}
    </SetSheet>
  );
}
