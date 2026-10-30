import { useEffect, useMemo, useState } from "react";
import { useApp } from "./ctx";
import { B, type Approval, type Bi, type Store } from "./model";
import { addApproval } from "./core";
import { I, Pill } from "./ui";
import { inDays } from "./time";
import { EstimateDate, HingeLine } from "./OpeningEstimate";
import { COVERAGE_SAY, compareTable, missingFacts, openDoes, parseTargets, priceSay, replicate, setLocationFacts, type LocationFacts, type ReplicaKind, type TargetPlan } from "./replicate";
import { SuggestInput } from "./Suggest";
import { placeSource } from "./suggestions";
import "./replicate.css";

/* Replicate this store: pick a store that works, name the new places, see each one's plan side by side, give each
   location's address, size and opening date in one form, and open them all with one approval (src/replicate.ts). */

const GROUPS: { kind: ReplicaKind; title: Bi }[] = [
  { kind: "new", title: B("New for this location", "该地新增") },
  { kind: "same", title: B("Same: carries over", "相同：直接沿用") },
  { kind: "covered", title: B("Already covered by the company", "公司已覆盖") },
  { kind: "not_needed", title: B("Not needed there", "当地不需要") },
];

const money = (n: number, cur: string) => (cur === "USD" ? "$" + n.toLocaleString("en-US") : `${n.toLocaleString("en-US")} ${cur}`);

function TargetDetail({ t }: { t: TargetPlan }) {
  const { b, lang } = useApp();
  const zh = lang === "zh";
  return (
    <details className="rep-t">
      <summary>
        <b>{b(t.label)}</b>
        <span>{b(COVERAGE_SAY[t.coverage])}</span>
      </summary>
      {t.opening && (
        <div className="rep-open">
          <span>{zh ? "预计取得全部许可：" : "Licenses in hand around "}</span><EstimateDate date={t.opening.date} range={t.opening.range} lang={lang} />
          <HingeLine hinge={t.opening.hinge} lang={lang} />
        </div>
      )}
      {GROUPS.map(g => {
        const rows = t.rows.filter(r => r.kind === g.kind);
        if (!rows.length) return null;
        return (
          <div key={g.kind} className={"rep-g g-" + g.kind}>
            <h4>{b(g.title)}<small>{rows.length}</small></h4>
            <ul>
              {rows.map((r, k) => (
                <li key={k}>
                  <span className="rep-n">{b(r.name)}</span>
                  <span className="rep-a">{b(r.agency)}</span>
                  <span className="rep-w">{b(r.why)}{r.kind === "new" && <> {r.fee == null ? (zh ? "费用未公布。" : "Fee not published.") : r.fee === 0 ? (zh ? "免费。" : "No fee.") : (zh ? `规费 ${money(r.fee, r.currency)}。` : `Fee ${money(r.fee, r.currency)}.`)}</>}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p className="rep-touch">{b(t.touchWhy)}</p>
    </details>
  );
}

export function ReplicateSheet({ onClose, source: first }: { onClose: () => void; source?: string }) {
  const { b, lang, ws, editWs, approve, cloud } = useApp();
  const zh = lang === "zh";
  const stores = ws.stores ?? [];
  const [source, setSource] = useState(first ?? stores.find(s => s.stage === "open")?.id ?? stores[0]?.id ?? "");
  const [text, setText] = useState("");
  // each new place is suggested as it's typed, from the places the registry maps
  const placeSrc = useMemo(() => placeSource(lang), [lang]);
  const [facts, setFacts] = useState<Record<string, LocationFacts>>({});
  const [pending, setPending] = useState<string | null>(null);
  const today = inDays(0);
  const parsed = useMemo(() => parseTargets(text), [text]);
  const r = useMemo(() => (source && parsed.places.length ? replicate(ws, source, parsed.places, { today, facts }) : null), [ws, source, parsed.places, today, facts]);
  const table = r ? compareTable(r) : null;
  // the card goes up and is approved by this same press: one approval, the owner's own
  useEffect(() => {
    // after the app has the card (its own effects run after this one's), so the approval finds it
    if (pending && ws.approvals.some(a => a.id === pending)) { const id = pending; setPending(null); setTimeout(() => { void approve(id); onClose(); }, 0); }
  }, [pending, ws.approvals, approve, onClose]);
  const set = (place: string, k: keyof LocationFacts, v: string) => setFacts(f => ({ ...f, [place]: { ...f[place], [k]: v } }));
  const open = () => {
    if (!r) return;
    const n = r.targets.length, id = `ap-rep-${Date.now().toString(36)}`;
    const ap: Approval = {
      id, kind: "change", title: B(`Open all ${n} location${n === 1 ? "" : "s"} like ${r.source.store.name.en}`, `按${r.source.store.name.zh}开设全部 ${n} 家新门店`),
      action: B(`Open all ${n}`, `开设全部 ${n} 家`), does: openDoes(r),
      change: { op: "replicate", source, targets: r.targets.map(t => ({ place: t.place, ...cleanFacts(facts[t.place]) })) },
    };
    editWs(addApproval(ap));
    setPending(id);
  };
  if (!stores.length) return null;
  const n = r?.targets.length ?? 0;
  return (
    <section className="bulk rep">
      <header className="bulk-h">
        <h2>{zh ? "复制这家门店" : "Replicate this store"}</h2>
        <button type="button" className="icbtn" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><I.x /></button>
      </header>
      <p className="bulk-sub">{zh ? "选择一家运营良好的门店，写下新的城市、州或国家。快哉用这家店已确认的资料规划每个地点：哪些沿用，哪些公司已覆盖，哪些是新增，哪些不需要。" : "Pick a store that works and name the new cities, states or countries. Placetta plans each place from that store's approved facts: what carries over, what the company already covers, what's new and what isn't needed."}</p>
      <div className="rep-in">
        <label>
          <span>{zh ? "复制哪家门店" : "Store to copy"}</span>
          <select value={source} onChange={e => setSource(e.target.value)}>
            {stores.map(s => <option key={s.id} value={s.id}>{b(s.name)}</option>)}
          </select>
        </label>
        <label>
          <span>{zh ? "新地点" : "New places"}</span>
          <SuggestInput lang={lang} many value={text} onValue={setText} source={placeSrc} placeholder={zh ? "达拉斯、休斯顿、奥斯汀和多伦多" : "Dallas, Houston, Austin, and Toronto"} />
        </label>
      </div>
      {parsed.unknown.length > 0 && <p className="rep-warn">{zh ? `无法确定这些地点在哪里，请加上州或国家：${parsed.unknown.join("、")}` : `Couldn't tell where ${parsed.unknown.join(", ")} ${parsed.unknown.length === 1 ? "is" : "are"}: add the state or country.`}</p>}
      {r && table && (<>
        <div className="rep-tbl" role="table" aria-label={b(table.title)}>
          <div className="rep-tr rep-th" role="row">{table.columns.map((c, k) => <span key={k} role="columnheader">{b(c)}</span>)}</div>
          {r.targets.map((t, k) => (
            <div key={t.place} className="rep-tr" role="row">
              {table.rows[lang][k].map((cell, j) => <span key={j} role="cell" data-l={b(table.columns[j])}>{cell}</span>)}
            </div>
          ))}
        </div>
        <p className="rep-price">{b(priceSay(r))}</p>
        <div className="rep-list">{r.targets.map(t => <TargetDetail key={t.place} t={t} />)}</div>
        <fieldset className="rep-form">
          <legend>{zh ? "每家门店的信息（可稍后再填）" : "Each location's details (you can add them later)"}</legend>
          {r.targets.map(t => (
            <div key={t.place} className="rep-row">
              <b>{b(t.label)}</b>
              <input aria-label={zh ? "地址" : "Address"} placeholder={zh ? "街道地址" : "Street address"} value={facts[t.place]?.address ?? ""} onChange={e => set(t.place, "address", e.target.value)} />
              <input aria-label={zh ? "面积（平方英尺）" : "Square feet"} placeholder={zh ? "面积（平方英尺）" : "Square feet"} inputMode="numeric" value={facts[t.place]?.sqft ?? ""} onChange={e => set(t.place, "sqft", e.target.value)} />
              <input aria-label={zh ? "开业日期" : "Opening date"} type="date" value={facts[t.place]?.opening ?? ""} onChange={e => set(t.place, "opening", e.target.value)} />
            </div>
          ))}
        </fieldset>
        <p className="rep-note">{zh ? "批准后：新门店及其申请会创建，并按原门店已确认的资料预填。在每项申请经过正常批准（或自动驾驶在限额内）之前，什么都不会提交。" : "On approval the new stores and their applications are created, prefilled from the source store's approved facts. Nothing is filed until each filing has its normal approval (or Autopilot within its caps)."}</p>
        <div className="m-btns">
          <Pill kind="ink" disabled={!!pending || (!!cloud && !cloud.owner)} onClick={open}>{zh ? `开设全部 ${n} 家门店` : `Open all ${n} location${n === 1 ? "" : "s"}`}</Pill>
        </div>
        {!!cloud && !cloud.owner && <p className="rep-note">{zh ? "只有所有者可以开设新门店。" : "Only an owner can open new locations."}</p>}
      </>)}
    </section>
  );
}

const cleanFacts = (f?: LocationFacts): LocationFacts => {
  const out: LocationFacts = {};
  if (f?.address?.trim()) out.address = f.address.trim().slice(0, 160);
  if (f?.sqft?.trim()) out.sqft = f.sqft.trim().slice(0, 20);
  if (f?.opening && /^\d{4}-\d{2}-\d{2}$/.test(f.opening)) out.opening = f.opening;
  return out;
};

/** The one batched form for locations already opened from a copy: only what's still missing, every store at once. */
export function ReplicaFacts() {
  const { b, lang, ws, editWs, say } = useApp();
  const zh = lang === "zh";
  const need = (ws.stores ?? []).filter((s: Store) => missingFacts(s).length);
  const [facts, setFacts] = useState<Record<string, LocationFacts>>({});
  if (!need.length) return null;
  const set = (id: string, k: keyof LocationFacts, v: string) => setFacts(f => ({ ...f, [id]: { ...f[id], [k]: v } }));
  const save = () => {
    const clean = Object.fromEntries(Object.entries(facts).map(([id, f]) => [id, cleanFacts(f)]).filter(([, f]) => Object.keys(f).length));
    if (!Object.keys(clean).length) return;
    editWs(w => setLocationFacts(w, clean));
    setFacts({});
    say(zh ? "已保存，相关申请已重新填写。" : "Saved. Their applications are filled again from it.");
  };
  return (
    <section className="bulk rep">
      <header className="bulk-h"><h2>{zh ? `${need.length} 家新门店的信息` : `Details for ${need.length} new location${need.length === 1 ? "" : "s"}`}</h2></header>
      <p className="bulk-sub">{zh ? "每家店只需填写地址、面积和开业日期，其余已按原门店的资料预填。" : "Only each location's address, square footage and opening date. Everything else is prefilled from the store it copies."}</p>
      <fieldset className="rep-form">
        <legend className="sr">{zh ? "门店信息" : "Location details"}</legend>
        {need.map(s => {
          const miss = missingFacts(s);
          return (
            <div key={s.id} className="rep-row">
              <b>{b(s.name)}</b>
              {miss.includes("address") ? <input aria-label={zh ? "地址" : "Address"} placeholder={zh ? "街道地址" : "Street address"} value={facts[s.id]?.address ?? ""} onChange={e => set(s.id, "address", e.target.value)} /> : <span className="rep-have">{s.address}</span>}
              {miss.includes("sqft") ? <input aria-label={zh ? "面积（平方英尺）" : "Square feet"} placeholder={zh ? "面积（平方英尺）" : "Square feet"} inputMode="numeric" value={facts[s.id]?.sqft ?? ""} onChange={e => set(s.id, "sqft", e.target.value)} /> : <span className="rep-have">{s.replica?.sqft}</span>}
              {miss.includes("opening") ? <input aria-label={zh ? "开业日期" : "Opening date"} type="date" value={facts[s.id]?.opening ?? ""} onChange={e => set(s.id, "opening", e.target.value)} /> : <span className="rep-have">{s.plannedOpen}</span>}
            </div>
          );
        })}
      </fieldset>
      <div className="m-btns"><Pill kind="ink" onClick={save}>{zh ? "保存" : "Save"}</Pill></div>
    </section>
  );
}
