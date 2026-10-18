import { useMemo, useState, type ReactNode } from "react";
import { B, same, type Bi, type Workspace } from "./model";
import type { Lang } from "./i18n";
import { useApp } from "./ctx";
import { I, Select } from "./ui";
import { countyOf } from "./counties";
import { daysFromNow, fmtDay } from "./time";
import { normalizeState } from "./core";
import { stateOf } from "./plan/preview";
import { checkStores, findingLine, KINDS, RANK, readPlace, requiredFor, toPlan, totals, type Answer, type Answers, type Have, type StoreInput, type StoreResult } from "./plan/existing";
import "./ode.css";

/* The free compliance check for stores a business already runs: city and kind per store, then a checklist from
   Placetta's registry (have it, not sure, don't have it, and the renewal date when known), then the gaps and lapse
   risks per store, turned into the plan. No model is called. Used in onboarding ("I already have stores") and on the
   Stores page. The website has the same check, signed out (src/site/stores-check.ts). */

const CITIES = ["Flushing, NY", "Brooklyn, NY", "Manhattan, NY", "Jersey City, NJ", "Edison, NJ", "Boston, MA", "Philadelphia, PA", "Washington, DC", "Chicago, IL",
  "Houston, TX", "Dallas, TX", "Austin, TX", "Atlanta, GA", "Miami, FL", "Seattle, WA", "Bellevue, WA", "Portland, OR", "San Francisco, CA", "San Jose, CA", "Oakland, CA",
  "Fremont, CA", "Los Angeles, CA", "Arcadia, CA", "Irvine, CA", "San Gabriel, CA", "San Diego, CA", "Las Vegas, NV", "Phoenix, AZ", "Denver, CO"];
const HAVE: [Have, Bi][] = [["have", B("Have it", "已有")], ["unsure", B("Not sure", "不确定")], ["missing", B("Don't have", "没有")]];
const KIND_TAG: Record<string, Bi> = {
  lapsed: B("Expired", "已过期"), gap: B("Missing", "缺少"), due_soon: B("Renew soon", "即将续期"), unsure: B("Not sure", "不确定"), no_date: B("No renewal date", "无续期日期"), ok: B("In order", "已具备"),
};
let n = 0;
const blank = (): StoreInput => ({ id: "s" + (++n) + Date.now().toString(36), city: "", what: KINDS[0].en, name: "" });

/** The check's three steps. onApply gets the plan rows the gaps become. */
export function StoresCheck({ lang, onApply, applyLabel, busy, footer, err, intro = true }: {
  lang: Lang; onApply: (results: StoreResult[], today: string) => void; applyLabel: Bi; busy?: boolean; footer?: ReactNode; err?: string; intro?: boolean;
}) {
  const L = (x: Bi) => x[lang];
  const zh = lang === "zh";
  const today = daysFromNow(0);
  const [stores, setStores] = useState<StoreInput[]>(() => [blank()]);
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState<"stores" | "check" | "results">("stores");
  const [warn, setWarn] = useState("");
  const ready = stores.filter(s => readPlace(s.city));
  // whole-business permits (the EIN) are asked once, under "biz", and count for every store
  const merged = useMemo<Answers>(() => Object.fromEntries(ready.map(s => [s.id, { ...(answers[s.id] ?? {}), ...(answers.biz ?? {}) }])), [ready, answers]);
  const results = useMemo(() => checkStores(ready, merged, today), [ready, merged, today]);
  const tot = totals(results);
  const whole = useMemo(() => { const seen = new Map<string, ReturnType<typeof requiredFor>[number]>(); for (const r of results) for (const q of r.required) if (q.whole && !seen.has(q.key)) seen.set(q.key, q); return [...seen.values()]; }, [results]);

  const set = (sid: string, key: string, a: Partial<Answer>) => setAnswers(x => ({ ...x, [sid]: { ...(x[sid] ?? {}), [key]: { ...(x[sid]?.[key] ?? {}), ...a } } }));
  const edit = (id: string, f: Partial<StoreInput>) => setStores(l => l.map(s => (s.id === id ? { ...s, ...f } : s)));
  const next = () => {
    const bad = stores.find(s => !readPlace(s.city));
    if (bad) { setWarn(L(B("Add each store's city and state, like Flushing, NY.", "请为每家门店填写城市和州，例如 Flushing, NY。"))); return; }
    setWarn(""); setStep("check");
  };

  const row = (sid: string, q: ReturnType<typeof requiredFor>[number]) => {
    const a = answers[sid]?.[q.key] ?? {};
    return (
      <li key={q.key} className="sc-item">
        <span className="sc-name"><b>{L(q.name)}</b><small>{L(q.agency)}{q.every !== null ? (zh ? "，需要续期" : ", renews") : ""}</small></span>
        <span className="seg sm sc-have" role="radiogroup" aria-label={L(q.name)}>
          {HAVE.map(([v, label]) => <button key={v} type="button" role="radio" aria-checked={a.have === v} aria-pressed={a.have === v} onClick={() => set(sid, q.key, { have: v })}>{L(label)}</button>)}
        </span>
        {a.have === "have" && q.every !== null && (
          <label className="sc-date"><span>{L(B("Renews on", "续期日期"))}</span><input type="date" value={a.renews ?? ""} onChange={e => set(sid, q.key, { renews: e.target.value })} /></label>
        )}
      </li>
    );
  };

  if (step === "stores") return (
    <div className="sc">
      {intro && <>
        <h1 className="sc-h">{L(B("Which stores do you already run?", "您已经在经营哪些门店？"))}</h1>
        <p className="sc-sub">{L(B("Add each store's city and what it sells. Placetta lists what each one has to hold, from its registry of official forms, and shows any gaps. Free, and no AI involved.",
          "填写每家门店的城市和业态。快哉会根据官方表格登记库列出每家店必须持有的许可，并找出缺口。免费，不使用 AI。"))}</p>
      </>}
      <datalist id="sc-cities">{CITIES.map(c => <option key={c} value={c} />)}</datalist>
      <ol className="sc-stores">
        {stores.map((s, i) => (
          <li key={s.id}>
            <span className="sc-num">{i + 1}</span>
            <label className="sc-f"><span>{L(B("City and state", "城市和州"))}</span><input list="sc-cities" value={s.city} onChange={e => edit(s.id, { city: e.target.value })} placeholder="Flushing, NY" autoComplete="off" aria-invalid={!!s.city && !readPlace(s.city)} /></label>
            <label className="sc-f"><span>{L(B("What it sells", "业态"))}</span>
              <Select sz="lg" value={s.what} onChange={e => edit(s.id, { what: e.target.value })}>{KINDS.map(k => <option key={k.en} value={k.en}>{L(k)}</option>)}</Select></label>
            <label className="sc-f"><span>{L(B("Name (optional)", "店名（选填）"))}</span><input value={s.name ?? ""} onChange={e => edit(s.id, { name: e.target.value })} placeholder={L(B("Main St", "主街店"))} maxLength={60} /></label>
            {stores.length > 1 && <button type="button" className="icbtn sc-x" onClick={() => setStores(l => l.filter(x => x.id !== s.id))} aria-label={L(B("Remove this store", "移除这家门店"))}><I.x /></button>}
          </li>
        ))}
      </ol>
      <div className="sc-act">
        {stores.length < 20 && <button type="button" className="sbtn line" onClick={() => setStores(l => [...l, blank()])}><I.plus />{L(B("Add another store", "再添加一家"))}</button>}
        <button type="button" className="sbtn ink" disabled={!ready.length} onClick={next}>{L(B("Check my stores", "检查我的门店"))}<I.arrow /></button>
      </div>
      {warn && <p className="pt-warn" role="alert">{warn}</p>}
    </div>
  );

  if (step === "check") return (
    <div className="sc">
      <h2 className="sc-h2">{L(B("What each store holds", "每家门店持有的许可"))}</h2>
      <p className="sc-sub">{L(B("Tick what you have. Add the renewal date from the certificate when you know it; leave anything you're not sure about as not sure, and Odelia checks it.",
        "勾选您已有的许可。知道续期日期的，请按证书填写；不确定的保留“不确定”，Odelia 会核实。"))}</p>
      {whole.length > 0 && (
        <section className="sc-store">
          <header><b>{L(B("For the whole business", "整个企业"))}</b><small>{L(B("Held once, for every store", "只需持有一份，覆盖所有门店"))}</small></header>
          <ul>{whole.map(q => row("biz", q))}</ul>
        </section>
      )}
      {results.map(r => (
        <section key={r.store.id} className="sc-store">
          <header><b>{r.store.name?.trim() || r.place}</b><small>{r.store.name?.trim() ? r.place + (zh ? "，" : ", ") : ""}{L(KINDS.find(k => k.en === r.store.what) ?? same(r.store.what))}</small></header>
          {r.required.length ? <ul>{r.required.filter(q => !q.whole).map(q => row(r.store.id, q))}</ul> : <p className="quiet">{L(B("Placetta's registry doesn't cover this place yet.", "快哉的登记库暂未覆盖这个地方。"))}</p>}
        </section>
      ))}
      <div className="sc-act">
        <button type="button" className="sbtn quiet" onClick={() => setStep("stores")}>{L(B("Back", "返回"))}</button>
        <button type="button" className="sbtn ink" onClick={() => setStep("results")}>{L(B("Show my gaps", "查看缺口"))}<I.arrow /></button>
      </div>
    </div>
  );

  const work = tot.gap + tot.lapsed + tot.unsure;
  const wholeKeys = new Set(whole.map(q => q.key));
  const wholeTodo = (results[0]?.findings ?? []).filter(f => wholeKeys.has(f.key) && f.kind !== "ok").sort((a, b) => RANK[a.kind] - RANK[b.kind]);
  const finding = (f: StoreResult["findings"][number]) => (
    <li key={f.key} className={"sc-find k-" + f.kind}><span className="sc-tag">{L(KIND_TAG[f.kind])}</span><span className="sc-name"><b>{L(f.name)}</b><small>{L(findingLine(f))}</small></span></li>
  );
  return (
    <div className="sc">
      <h2 className="sc-h2">{work ? L(B(`${tot.stores} store${tot.stores === 1 ? "" : "s"} checked: ${work} thing${work === 1 ? "" : "s"} to sort out`, `已检查 ${tot.stores} 家门店：${work} 项需要处理`)) : L(B("Everything you told us is in order", "您填写的各项均已具备"))}</h2>
      <dl className="sc-tot">
        <div className={tot.lapsed ? "warm" : ""}><dt>{L(B("Expired", "已过期"))}</dt><dd>{tot.lapsed}</dd></div>
        <div className={tot.gap ? "warm" : ""}><dt>{L(B("Missing", "缺少"))}</dt><dd>{tot.gap}</dd></div>
        <div><dt>{L(B("Renew within 60 days", "60 天内续期"))}</dt><dd>{tot.due_soon}</dd></div>
        <div><dt>{L(B("Not sure", "不确定"))}</dt><dd>{tot.unsure}</dd></div>
      </dl>
      {wholeTodo.length > 0 && (
        <section className="sc-store">
          <header><b>{L(B("For the whole business", "整个企业"))}</b></header>
          <ul>{wholeTodo.map(f => finding(f))}</ul>
        </section>
      )}
      {results.map(r => {
        const todo = r.findings.filter(f => f.kind !== "ok" && !wholeKeys.has(f.key)).sort((a, b) => RANK[a.kind] - RANK[b.kind]);
        const okN = r.findings.filter(f => f.kind === "ok" && !wholeKeys.has(f.key)).length;
        return (
          <section key={r.store.id} className="sc-store">
            <header><b>{r.store.name?.trim() || r.place}</b><small>{zh ? `${okN} 项已具备` : `${okN} in order`}</small></header>
            {todo.length ? <ul>{todo.map(f => finding(f))}</ul> : <p className="quiet">{L(B("Nothing to fix for this store.", "这家门店没有需要处理的事项。"))}</p>}
          </section>
        );
      })}
      <p className="note">{L(B(`From Placetta's registry of official forms, checked ${fmtDay(today, lang, true)}. Odelia confirms each one with the agency before anything is filed.`, `依据快哉的官方表格登记库，检查日期 ${fmtDay(today, lang, true)}。提交前，Odelia 会向机构逐项核实。`))}</p>
      {footer}
      <div className="sc-act">
        <button type="button" className="sbtn quiet" onClick={() => setStep("check")}>{L(B("Back", "返回"))}</button>
        <button type="button" className="sbtn ink" disabled={busy} onClick={() => onApply(results, today)}>{busy ? "…" : L(applyLabel)}</button>
      </div>
      {err && <p className="pt-warn" role="alert">{err}</p>}
    </div>
  );
}

/** The check's result as a new workspace: the stores (open), the gaps as applications, the renewals as deadlines. */
export function existingWorkspace(plan: ReturnType<typeof toPlan>, results: StoreResult[], name: string): Workspace {
  const first = results.find(r => r.ok)!;
  const what = first.store.what;
  const st = stateOf(first.place) ?? "";
  const cities = [...new Set(results.filter(r => r.ok).map(r => r.place))];
  return normalizeState(name, {
    business: same(name), goal: B("Keep every store compliant", "让每家门店保持合规"),
    locations: cities.map(c => { const city = c.split(",")[0].trim(), s = stateOf(c) ?? ""; const co = countyOf(city, s); return { id: city.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: same(city), county: B(co.en, co.zh), state: "active" }; }),
    apps: plan.apps, deadlines: plan.deadlines, stores: plan.stores, approvals: [],
    facts: [
      { id: "f-sell", group: "operations", label: B("What you sell", "销售内容"), value: same(what), source: B("You told me", "您告诉我的") },
      { id: "f-stores", group: "location", label: B("Stores open", "已开业门店"), value: same(String(plan.stores.length)), source: B("From the store check", "来自门店检查") },
      { id: "f-appr", group: "rules", label: B("Needs your approval", "需要您批准"), value: B("Every filing, payment and message", "每一次提交、付款和消息"), source: B("Always on", "始终开启"), locked: true },
    ],
    meta: { city: first.place.split(",")[0].trim(), region: st, what },
  } as unknown as Record<string, unknown>) as Workspace;
}

/** On the Stores page: check the stores already open, then add them and their gaps to the workspace. */
export function StoresCheckPanel({ onClose }: { onClose: () => void }) {
  const { lang, ws, editWs, say } = useApp();
  const L = (x: Bi) => x[lang];
  const apply = (results: StoreResult[], today: string) => {
    const plan = toPlan(results, today, { stores: (ws.stores ?? []).map(s => s.id), apps: ws.apps.map(a => a.id) });
    editWs(w => ({ ...w, stores: [...(w.stores ?? []), ...plan.stores], apps: [...w.apps, ...plan.apps], deadlines: [...w.deadlines.filter(d => !plan.deadlines.some(x => x.id === d.id)), ...plan.deadlines] }));
    say(lang === "zh" ? `已添加 ${plan.stores.length} 家门店和 ${plan.apps.length} 项待办许可。` : `Added ${plan.stores.length} store${plan.stores.length === 1 ? "" : "s"} and ${plan.apps.length} permit${plan.apps.length === 1 ? "" : "s"} to sort out.`);
    onClose();
  };
  return (
    <section className="bulk sc-panel">
      <header className="bulk-h">
        <h2>{L(B("Check stores you already run", "检查已开业的门店"))}</h2>
        <button type="button" className="icbtn" onClick={onClose} aria-label={L(B("Close", "关闭"))}><I.x /></button>
      </header>
      <p className="bulk-sub">{L(B("Each store's city and what it sells, then what it holds. Placetta shows the gaps and the renewals at risk, from its own registry. No AI.", "填写每家门店的城市和业态，再勾选已持有的许可。快哉根据自己的登记库找出缺口和有过期风险的续期，不使用 AI。"))}</p>
      <StoresCheck lang={lang} intro={false} applyLabel={B("Add these stores and gaps to my plan", "把这些门店和缺口加入计划")} onApply={apply} />
    </section>
  );
}

