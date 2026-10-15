import { inspectionsFor } from "./inspections/forStore";
import { useEffect, useMemo, useState } from "react";
import { openSettings } from "./Settings";
import { useApp } from "./ctx";
import { B, type Cert, type Store } from "./model";
import { countyOf, stateCode, cityName } from "./counties";
import { FWW_SOURCE, FWW_THRESHOLD, GRADES_SOURCE, readiness, todayLogs, usLocations, valueOf, type Readiness } from "./stores";
import { daysFromNow, daysUntil, fmtDay, fmtIn, inDays } from "./time";
import { basisLine, openingLine, openingPath, type Evidence } from "./smart";
import { I, Pill, StatusChip } from "./ui";
import { saveFile } from "./files";
import { parseStoreList, permitsOnOpening, planCsv, planStores, toWorkspace, type FormStat } from "./plan";
import * as api from "./cloud/api";

/* Stores: every store inspection-ready every day. A score per store, today's logs, staff certificates, schedules,
   a mock inspection, and the three numbers that show the value: opened on time, stayed open, no fines. */

function Ring({ score, band, size = 64 }: { score: number; band: Readiness["band"]; size?: number }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  return (
    <svg className={"ring b-" + band} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" strokeDasharray={`${(c * score) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{score}</text>
    </svg>
  );
}

function Grade({ s }: { s: Store }) {
  const { b, lang } = useApp();
  if (!s.grade) return null;
  return (
    <span className={"grade g-" + s.grade.letter} title={b(B(`Health inspection grade, ${fmtDay(s.grade.date, "en", true)}`, `卫生检查评级，${fmtDay(s.grade.date, "zh", true)}`))}>
      <b>{s.grade.letter === "P" ? (lang === "zh" ? "待定" : "Pending") : s.grade.letter}</b>
    </span>
  );
}

function Value({ s, big }: { s: Store; big?: boolean }) {
  const { b } = useApp();
  const v = valueOf(s);
  const rows = [
    { k: B("Open on time", "按期开业"), v: v.onTime, ok: v.good[0] },
    { k: B("Stay open", "持续营业"), v: v.open, ok: v.good[1] },
    { k: B("No fines", "零罚款"), v: v.fines, ok: v.good[2] },
  ];
  return (
    <dl className={"value" + (big ? " big" : "")}>
      {rows.map((r, i) => <div key={i} className={r.ok ? "ok" : "warn"}><dt>{b(r.k)}</dt><dd>{b(r.v)}</dd></div>)}
    </dl>
  );
}

/** Placetta's own filing times (once per page load) and when each application went to the agency. */
let statsOnce: Promise<FormStat[]> | null = null;
function useEvidence(): Evidence {
  const { cloud } = useApp();
  const [stats, setStats] = useState<FormStat[]>([]);
  useEffect(() => { if (!cloud) return; statsOnce ??= api.filingStats().catch(() => []); void statsOnce.then(setStats); }, [cloud]);
  return useMemo(() => {
    const submitted: Record<string, string> = {};
    for (const f of cloud?.filings ?? []) if (f.submitted_at && f.status !== "canceled" && !submitted[f.app_id]) submitted[f.app_id] = f.submitted_at;
    return { submitted, stats };
  }, [cloud?.filings, stats]);
}

/** A store still opening, with its projected opening where its permits put it today. */
function withPath(s: Store, ws: Parameters<typeof openingPath>[1], ev: Evidence = {}) {
  const p = s.stage === "opening" ? openingPath(s, ws, daysFromNow(0), ev) : null;
  return { p, line: p ? openingLine(p) : null, s: p?.landing && p.verdict !== "not_mapped" ? { ...s, projectedOpen: p.landing } : s };
}

function StoreCard({ s: raw, onOpen }: { s: Store; onOpen: () => void }) {
  const { b, t, ws, lang } = useApp();
  const { p, line, s } = withPath(raw, ws, useEvidence());
  const r = readiness(s, ws);
  const logs = todayLogs(s);
  const expiring = s.certs.filter(c => { const d = daysUntil(c.expires); return d >= 0 && d <= 30; });
  return (
    <button type="button" className="store" onClick={onOpen}>
      <div className="store-top">
        <Ring score={r.score} band={r.band} />
        <div className="store-name">
          <b>{b(s.name)}</b>
          <span>{b(r.label)}{s.stage === "opening" && s.projectedOpen ? (lang === "zh" ? `，预计 ${fmtDay(s.projectedOpen, lang, true)} 开业` : `. Opening ${fmtDay(s.projectedOpen, lang, true)}`) : ""}</span>
          {line && p && p.verdict !== "not_mapped" && <span className={"opening-line " + p.verdict}>{b(line)}</span>}
        </div>
        <Grade s={s} />
      </div>
      <Value s={s} />
      {s.stage === "open" && (
        <div className="store-today">
          <span className="st-lbl">{t("today")}</span>
          {logs.map(l => <span key={l.kind} className={"logdot" + (l.log?.done ? " on" : "")} title={b(l.label)}>{l.log?.done ? <I.check /> : null}{b(B(l.kind === "temps" ? "Temps" : l.kind === "cleaning" ? "Cleaning" : "Pests", l.kind === "temps" ? "温度" : l.kind === "cleaning" ? "清洁" : "虫害"))}</span>)}
          {expiring.length > 0 && <em className="warnline">{b(B(`${expiring.length} certificate expiring`, `${expiring.length} 张证书即将到期`))}</em>}
        </div>
      )}
    </button>
  );
}

function Section({ title, sub, children, side }: { title: string; sub?: string; children: React.ReactNode; side?: React.ReactNode }) {
  return (
    <section className="sec">
      <div className="sec-h"><h2>{title}</h2>{side}</div>
      {sub && <p className="sec-sub">{sub}</p>}
      {children}
    </section>
  );
}

function StoreDetail({ s, onBack }: { s: Store; onBack: () => void }) {
  const { b, t, lang, ws, ask, busy, updateStore, openApp } = useApp();
  const r = readiness(s, ws);
  const ev = useEvidence();
  const [reading, setReading] = useState("");
  const [askTemp, setAskTemp] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cert, setCert] = useState<Omit<Cert, "id">>({ person: "", kind: B("Food Protection Certificate", "食品保护证书"), expires: inDays(365) });
  const log = (kind: "temps" | "cleaning" | "pest", value?: string) => updateStore(s.id, x => ({
    ...x, logs: [...x.logs.filter(l => !(l.date === inDays(0) && l.kind === kind)), { date: inDays(0), kind, done: true, by: lang === "zh" ? "您" : "You", reading: value }],
  }), { action: B("Logged", "记录"), object: s.name, detail: B(kind === "temps" ? `Temperatures${value ? ": " + value : ""}` : kind === "cleaning" ? "Cleaning and sanitizing" : "Pest check", kind === "temps" ? `温度${value ? "：" + value : ""}` : kind === "cleaning" ? "清洁与消毒" : "虫害检查") });
  const covered = usLocations(ws) >= FWW_THRESHOLD;
  const guide = inspectionsFor(s.address);
  const apps = ws.apps.filter(a => s.apps?.includes(a.id));

  return (
    <div className="page narrow store-detail">
      <button type="button" className="back" onClick={onBack}><I.chevR />{t("nav_stores")}</button>
      <header className="sd-head">
        <Ring score={r.score} band={r.band} size={92} />
        <div>
          <h1>{b(s.name)}</h1>
          <p>{s.address}</p>
        </div>
        <Grade s={s} />
        {s.stage === "opening" && <Pill disabled={busy} onClick={() => {
          const today = inDays(0), est = permitsOnOpening({ name: s.name.en, address: s.address }, ws.business.en || ws.goal.en, today);
          updateStore(s.id, x => ({ ...x, stage: "open", opened: today, permits: [...(x.permits ?? []), ...est.filter(e => !(x.permits ?? []).some(p => p.name.en === e.name.en))] }),
            { action: B("Opened", "开业"), object: s.name, detail: B(`${est.length} renewals now tracked`, `已跟踪 ${est.length} 项续期`) });
        }}>{lang === "zh" ? "标记为已开业" : "Mark opened"}</Pill>}
      </header>
      {(() => { const { p, line } = withPath(s, ws, ev); const basis = p ? basisLine(p) : null; return line && p && p.verdict !== "not_mapped" ? (
        <p className={"opening-line " + p.verdict}>
          {b(line)}
          {p.blocker && (p.verdict === "late" || p.verdict === "tight") && <> <button type="button" className="pill quiet sm" disabled={busy} onClick={() => ask(lang === "zh" ? `${s.name.zh}进度落后，怎样追回？先处理${p.blocker!.name.zh}。` : `${s.name.en} is behind. How do we get it back on schedule? Start with the ${p.blocker!.name.en}.`)}>{lang === "zh" ? "让 Odelia 追回进度" : "Have Odelia catch it up"}</button></>}
          {basis && <small className="opening-basis">{b(basis)}</small>}
        </p>) : null; })()}

      <div className="parts">
        {r.parts.map(p => (
          <div key={p.key} className="part">
            <span className="part-l">{b(p.label)}</span>
            <span className="bar"><i style={{ width: `${(100 * p.got) / p.max}%` }} /></span>
            <span className="part-n">{b(p.note)}</span>
          </div>
        ))}
      </div>

      <Section title={b(B("What Placetta is worth here", "快哉在这家店的价值"))}>
        <Value s={withPath(s, ws, ev).s} big />
      </Section>

      {s.stage === "open" && (
        <Section title={b(B("Today's logs", "今日记录"))} sub={b(B("What an inspector asks to see. Takes a minute.", "检查员会查看的记录，一分钟完成。"))}>
          <ul className="tray">
            {todayLogs(s).map(l => (
              <li key={l.kind} className="row logrow">
                <span className={"logic" + (l.log?.done ? " on" : "")}>{l.log?.done ? <I.check /> : l.kind === "temps" ? <I.thermo /> : null}</span>
                <span className="lr-tx"><b>{b(l.label)}</b><small>{l.log?.done ? [l.log.reading, l.log.by && b(B(`by ${l.log.by}`, `记录人：${l.log.by}`))].filter(Boolean).join(lang === "zh" ? "，" : ", ") : b(l.hint)}</small></span>
                {!l.log?.done && (l.kind === "temps" && askTemp
                  ? <form className="inl" onSubmit={e => { e.preventDefault(); if (reading.trim()) { log("temps", reading.trim()); setReading(""); setAskTemp(false); } }}>
                      <input autoFocus value={reading} onChange={e => setReading(e.target.value)} placeholder={b(B("Walk-in 38°F, reach-in 36°F", "冷库 38°F，冷柜 36°F"))} aria-label={b(l.label)} />
                      <Pill kind="ink" sm>{b(B("Save", "保存"))}</Pill>
                    </form>
                  : <Pill sm onClick={() => (l.kind === "temps" ? setAskTemp(true) : log(l.kind))}>{b(B("Log it", "记录"))}</Pill>)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={b(B("Staff certificates", "员工证书"))} side={<button type="button" className="more" onClick={() => setAdding(a => !a)}>{b(B("Add", "添加"))}</button>}>
        {adding && (
          <form className="certform" onSubmit={e => { e.preventDefault(); if (!cert.person.trim()) return; updateStore(s.id, x => ({ ...x, certs: [...x.certs, { ...cert, person: cert.person.trim(), id: "c" + Date.now().toString(36) }] }), { action: B("Added certificate", "添加证书"), object: s.name, detail: B(`${cert.person}: ${cert.kind.en}`, `${cert.person}：${cert.kind.zh}`) }); setAdding(false); setCert(c => ({ ...c, person: "" })); }}>
            <input value={cert.person} onChange={e => setCert(c => ({ ...c, person: e.target.value }))} placeholder={b(B("Name", "姓名"))} aria-label={b(B("Name", "姓名"))} />
            <input value={b(cert.kind)} onChange={e => setCert(c => ({ ...c, kind: B(e.target.value, e.target.value) }))} aria-label={b(B("Certificate", "证书"))} />
            <input type="date" value={cert.expires} onChange={e => setCert(c => ({ ...c, expires: e.target.value }))} aria-label={b(B("Expires", "到期日"))} />
            <Pill kind="ink" sm>{b(B("Save", "保存"))}</Pill>
          </form>
        )}
        {s.certs.length ? (
          <ul className="tray">
            {[...s.certs].sort((x, y) => x.expires.localeCompare(y.expires)).map(c => {
              const d = daysUntil(c.expires);
              return (
                <li key={c.id} className="row certrow">
                  <span className="lr-tx"><b>{c.person}</b><small>{b(c.kind)}</small></span>
                  <span className={"cert-exp" + (d < 0 ? " bad" : d <= 30 ? " warn" : "")}>{d < 0 ? b(B("Expired", "已过期")) : fmtIn(d, lang)}<small>{fmtDay(c.expires, lang, true)}</small></span>
                  {d <= 30 && <Pill sm disabled={busy} onClick={() => ask(b(B(`Draft a text to ${c.person} to renew their ${c.kind.en} before ${c.expires}`, `起草短信提醒 ${c.person} 在 ${c.expires} 前续期${c.kind.zh}`)))}>{b(B("Remind", "提醒"))}</Pill>}
                </li>
              );
            })}
          </ul>
        ) : <p className="quiet">{b(B("No certificates yet.", "暂无证书。"))}</p>}
      </Section>

      {s.rules.includes("nyc_fww") && s.schedule && (
        <Section title={b(B("Schedules (NYC Fair Workweek)", "排班（纽约公平工作周法）"))}
          sub={covered
            ? b(B("Your chain is covered. Schedules go out 14 days ahead, and every late change owes the worker a premium.", "您的连锁品牌受该法约束：排班须提前 14 天发布，每次临时变更都需向员工支付补偿。"))
            : b(B(`Required once a chain has ${FWW_THRESHOLD} or more locations nationally. You have ${usLocations(ws)}, so this is tracked as good practice.`, `连锁品牌在全美达到 ${FWW_THRESHOLD} 家门店后适用。您目前有 ${usLocations(ws)} 家，此项按良好做法跟踪。`))}>
          <dl className="tray kv">
            <div className="row"><dt>{b(B("Posted through", "已排班至"))}</dt><dd>
              <input type="date" className="plain-date" value={s.schedule.postedThrough} onChange={e => { const v = e.target.value; if (v) updateStore(s.id, x => ({ ...x, schedule: x.schedule && { ...x.schedule, postedThrough: v } }), { action: B("Updated schedule", "更新排班"), object: s.name, detail: B(`Posted through ${v}`, `已排至 ${v}`) }); }} />
              <small>{daysUntil(s.schedule.postedThrough) >= 14 ? b(B("14 days ahead", "已提前 14 天")) : b(B("Less than 14 days ahead", "不足 14 天"))}</small>
            </dd></div>
            <div className="row"><dt>{b(B("Changes this week", "本周变更"))}</dt><dd>{s.schedule.changes}</dd></div>
            <div className="row"><dt>{b(B("Premium pay owed", "应付补偿"))}</dt><dd>${s.schedule.premiumOwed}</dd></div>
            <div className="row"><dt>{b(B("Source", "来源"))}</dt><dd>{b(s.schedule.source)}</dd></div>
          </dl>
          <p className="note"><a href={FWW_SOURCE} target="_blank" rel="noreferrer">nyc.gov<I.ext /></a> {b(B("Connect Square and schedules are checked automatically.", "连接 Square 后，排班会自动检查。"))}</p>
        </Section>
      )}

      {guide && (
        <Section title={b(B(`Inspections in ${guide.name.en}`, `${guide.name.zh}的检查`))}
          sub={b(B("Every inspection this store has to pass, how to book it, and the inspector's own list. Tick each item when it's in place; open items are what an inspector would cite.", "本店需要通过的每项检查、如何预约，以及检查员自己的清单。每项到位后打勾；未勾选的就是检查员会指出的问题。"))}>
          {guide.inspections.map(ins => {
            const done = ins.checklist.filter(c => s.ready?.[`${ins.id}:${c.id}`]).length;
            return (
              <details key={ins.id} className="insp" open={ins.stage === "opening" && s.stage === "opening" && done < ins.checklist.length}>
                <summary>
                  <span className="lr-tx"><b>{b(ins.name)}</b><small>{b(ins.agency)}{ins.stage === "routine" ? b(B(", after opening", "，开业后")) : ""}</small></span>
                  <span className={"insp-n" + (done === ins.checklist.length ? " ok" : "")}>{done}/{ins.checklist.length}</span>
                </summary>
                <dl className="tray kv">
                  <div className="row"><dt>{b(B("When", "时间"))}</dt><dd>{b(ins.when)}</dd></div>
                  <div className="row"><dt>{b(B("How to book", "如何预约"))}</dt><dd>{b(ins.book)}{ins.lead && <small>{b(ins.lead)}</small>}{(ins.bookUrl || ins.phone) && <small>{ins.bookUrl && <a href={ins.bookUrl} target="_blank" rel="noreferrer">{b(B("Book it", "去预约"))}<I.ext /></a>}{ins.phone && <> {ins.phone}</>}</small>}</dd></div>
                  {ins.fee !== undefined && <div className="row"><dt>{b(B("Fee", "费用"))}</dt><dd>{ins.fee === null ? b(B("Set by the agency", "由机构核定")) : `$${ins.fee.toLocaleString("en-US")}`}{ins.feeNote && <small>{b(ins.feeNote)}</small>}</dd></div>}
                  {ins.scoring && <div className="row"><dt>{b(B("How it's scored", "评分方式"))}</dt><dd>{b(ins.scoring)}</dd></div>}
                  {ins.failNext && <div className="row"><dt>{b(B("If it fails", "未通过时"))}</dt><dd>{b(ins.failNext)}</dd></div>}
                </dl>
                <ul className="tray insp-list">
                  {ins.checklist.map(c => {
                    const k = `${ins.id}:${c.id}`, on = !!s.ready?.[k];
                    return (
                      <li key={c.id} className={"row" + (on ? " done" : "")}>
                        <label className="check"><input type="checkbox" checked={on} onChange={e => { const v = e.target.checked; updateStore(s.id, x => ({ ...x, ready: { ...x.ready, [k]: v } }), { action: v ? B("Ready for inspection", "检查项已到位") : B("Not ready for inspection", "检查项未到位"), object: s.name, detail: c.item }); }} />
                          <span><b>{b(c.item)}</b>{c.why && <small>{b(c.why)}</small>}</span></label>
                        {!on && <Pill sm disabled={busy} onClick={() => ask(b(B(`How do we get this ready for the ${ins.name.en} at ${s.name.en}: ${c.item.en}?`, `如何为${s.name.zh}的${ins.name.zh}准备好这一项：${c.item.zh}？`)))}>{b(B("How", "怎么做"))}</Pill>}
                      </li>
                    );
                  })}
                </ul>
                <p className="note"><a href={ins.source} target="_blank" rel="noreferrer">{b(B("The agency's own page", "机构官方页面"))}<I.ext /></a> {b(B(`Read ${guide.read}.`, `${guide.read} 查阅。`))}</p>
              </details>
            );
          })}
        </Section>
      )}

      {s.mock && (
        <Section title={b(B("Mock inspection", "模拟检查"))} sub={b(B(`Last run ${fmtDay(s.mock.date, "en", true)}. Fix what fails before the real inspector finds it.`, `上次 ${fmtDay(s.mock.date, "zh", true)}。在真正检查前修好未通过的项目。`))}
          side={<button type="button" className="more" onClick={() => updateStore(s.id, x => ({ ...x, mock: x.mock && { date: inDays(0), checks: x.mock.checks.map(c => ({ ...c, ok: null })) } }), { action: B("Started a mock inspection", "开始模拟检查"), object: s.name })}>{b(B("Run again", "重新检查"))}</button>}>
          <ul className="tray mock">
            {s.mock.checks.map(c => (
              <li key={c.id} className="row">
                <span className="lr-tx"><b>{b(c.label)}</b><small>{b(c.area)}</small></span>
                <div className="seg sm" role="group" aria-label={b(c.label)}>
                  <button type="button" aria-pressed={c.ok === true} onClick={() => updateStore(s.id, x => ({ ...x, mock: x.mock && { ...x.mock, checks: x.mock.checks.map(y => (y.id === c.id ? { ...y, ok: true } : y)) } }))}>{b(B("Pass", "通过"))}</button>
                  <button type="button" aria-pressed={c.ok === false} onClick={() => updateStore(s.id, x => ({ ...x, mock: x.mock && { ...x.mock, checks: x.mock.checks.map(y => (y.id === c.id ? { ...y, ok: false } : y)) } }))}>{b(B("Fix", "待改"))}</button>
                </div>
                {c.ok === false && <Pill sm disabled={busy} onClick={() => ask(b(B(`How do we fix this before an inspection at ${s.name.en}: ${c.label.en}?`, `检查前如何整改${s.name.zh}的这一项：${c.label.zh}？`)))}>{b(B("How to fix", "如何整改"))}</Pill>}
              </li>
            ))}
          </ul>
          {s.rules.includes("nyc_grades") && <p className="note"><a href={GRADES_SOURCE} target="_blank" rel="noreferrer">{b(B("How NYC inspects and grades", "纽约市如何检查和评级"))}<I.ext /></a></p>}
        </Section>
      )}

      {s.permits && s.permits.length > 0 && (
        <Section title={b(B("Permits on file", "现有许可"))}>
          {s.permits.some(p => /\(estimated\)/.test(p.name.en)) && <p className="note">{b(B("Dates marked estimated follow each agency's renewal cycle from the opening day. Upload the certificates and Placetta sets the exact dates.", "标注“估算”的日期按各机构的续期周期从开业日推算。上传证书后，快哉会设置准确日期。"))}</p>}
          <ul className="tray">
            {s.permits.map((p, i) => { const d = daysUntil(p.expires); return (
              <li key={i} className="row certrow"><span className="lr-tx"><b>{b(p.name)}</b></span><span className={"cert-exp" + (d <= 45 ? " warn" : "")}>{d > 3000 ? b(B("No expiry", "长期有效")) : fmtIn(d, lang)}{d <= 3000 && <small>{fmtDay(p.expires, lang, true)}</small>}</span></li>
            ); })}
          </ul>
        </Section>
      )}

      {apps.length > 0 && (
        <Section title={t("nav_apps")}>
          <div className="tray">
            {apps.map(a => (
              <button key={a.id} type="button" className="row arow" onClick={() => openApp(a.id)}>
                <span className="arow-n"><b>{b(a.name)}</b><small>{a.next ? b(a.next) : b(a.agency)}</small></span>
                <StatusChip s={a.status} />
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* Many stores at once: paste the expansion list, get every permit per store with fees, real agency times and the date
   to file by, then add them all. The plan shows before anything is filed or paid. */
function BulkPlan({ onClose }: { onClose: () => void }) {
  const { b, lang, ws, editWs, say, cloud } = useApp();
  const zh = lang === "zh";
  const [text, setText] = useState("");
  const [stats, setStats] = useState<FormStat[]>([]);
  useEffect(() => { if (cloud) void api.filingStats().then(setStats); }, [cloud]);
  const today = inDays(0);
  const rows = useMemo(() => parseStoreList(text), [text]);
  const plans = useMemo(() => planStores(rows, ws.business.en || ws.goal.en, stats, today), [rows, ws.business.en, ws.goal.en, stats, today]);
  const fees = plans.reduce((s, p) => s + p.fees, 0), forms = plans.reduce((s, p) => s + p.forms.length, 0), late = plans.filter(p => p.late).length;
  const add = () => {
    const { stores, deadlines } = toWorkspace(plans, ws.stores ?? []);
    // every new store's city joins the sidebar's locations, the same as a store added one at a time
    const cities = plans.map(p => { const parts = p.row.address.split(",").map(x => x.trim()).filter(Boolean); const st = parts.length >= 2 ? stateCode(parts[parts.length - 1].replace(/\s*\d{5}(-\d{4})?$/, "")) : "";
      const city = parts.length >= 2 ? cityName(parts[parts.length - 2]) : ""; return city && !/\d/.test(city) ? { city, st } : null; }).filter((x): x is { city: string; st: string } => !!x);
    editWs(w => {
      const locations = [...w.locations];
      for (const { city, st } of cities) if (!locations.some(l => l.name.en.toLowerCase() === city.toLowerCase())) {
        const c = countyOf(city, st); locations.push({ id: city.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: B(city, city), county: B(c.en, c.zh), state: "active" });
      }
      return { ...w, stores: [...(w.stores ?? []), ...stores], locations, deadlines: [...w.deadlines.filter(d => !deadlines.some(x => x.id === d.id)), ...deadlines] };
    });
    if (cloud?.owner && cloud.plan === "monthly") void api.syncLocations(cloud.wsId).catch(() => undefined);
    say(zh ? `已添加 ${stores.length} 家门店和 ${deadlines.length} 个提交截止日期。` : `Added ${stores.length} store${stores.length === 1 ? "" : "s"} and ${deadlines.length} file-by date${deadlines.length === 1 ? "" : "s"}.`);
    onClose();
  };
  const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return (
    <section className="bulk">
      <header className="bulk-h">
        <h2>{zh ? "一次规划多家门店" : "Plan many stores at once"}</h2>
        <button type="button" className="icbtn" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><I.x /></button>
      </header>
      <p className="bulk-sub">{zh ? "每行一家门店：店名、地址、开业日期，用制表符、分号或竖线分隔。可直接从表格粘贴。" : "One store per line: name, address and opening date, separated by tabs, semicolons or pipes. Paste straight from your spreadsheet."}</p>
      <textarea className="bulk-in" rows={6} value={text} onChange={e => setText(e.target.value)} spellCheck={false}
        placeholder={"Flushing\t136-20 Roosevelt Ave, Flushing, NY 11354\t2026-12-15\nIrvine; 4250 Barranca Pkwy, Irvine, CA 92604; 1/20/2027"} />
      {plans.length > 0 && (<>
        <div className="bulk-sum">
          <span><b>{plans.length}</b>{zh ? " 家门店" : plans.length === 1 ? " store" : " stores"}</span>
          <span><b>{forms}</b>{zh ? " 份官方表格" : " official forms"}</span>
          <span><b>{usd(fees)}</b>{zh ? " 政府规费（已知部分）" : " in known government fees"}</span>
          {late > 0 && <span className="warn"><b>{late}</b>{zh ? " 家门店已来不及按期开业" : late === 1 ? " store already can't open on time" : " stores already can't open on time"}</span>}
        </div>
        <div className="bulk-list">
          {plans.map((p, i) => (
            <details key={i} className={"bulk-store" + (p.late ? " late" : "")} open={plans.length <= 3}>
              <summary>
                <b>{p.row.name}</b><span>{p.row.address}</span>
                <small>{p.row.opening ? (zh ? `${fmtDay(p.row.opening, lang, true)} 开业` : `Opens ${fmtDay(p.row.opening, lang, true)}`) : (zh ? "未填开业日期" : "No opening date")}{p.fileFirst ? (zh ? `，最早需在 ${fmtDay(p.fileFirst, lang, true)} 前提交` : `. First filing due ${fmtDay(p.fileFirst, lang, true)}`) : ""}</small>
              </summary>
              <ol>
                {p.forms.map(f => (
                  <li key={f.form.id} className={f.late ? "late" : ""}>
                    <span className="bf-n"><b>{f.form.form}</b> {b(f.form.title)}</span>
                    <span className="bf-a">{b(f.form.agency)}</span>
                    <span className="bf-m">
                      {f.form.fee == null ? (zh ? "费用视情况而定" : "Fee varies") : f.form.fee === 0 ? (zh ? "免费" : "No fee") : usd(f.form.fee)}
                      {f.days != null && <>{zh ? "，" : ", "}{f.daysFrom === "placetta" ? (zh ? `实际约 ${f.days} 天（快哉提交记录）` : `about ${f.days} days in Placetta's filings`) : (zh ? `机构公布约 ${f.days} 天` : `about ${f.days} days per the agency`)}</>}
                      {f.fileBy && <>{zh ? "，" : ", "}<b>{zh ? `${fmtDay(f.fileBy, lang, true)} 前提交` : `file by ${fmtDay(f.fileBy, lang, true)}`}</b></>}
                      {f.everyMonths && <>{zh ? "，" : ", "}{f.everyMonths === 12 ? (zh ? "每年续期" : "renews yearly") : f.everyMonths === 24 ? (zh ? "每两年续期" : "renews every 2 years") : (zh ? `每 ${f.everyMonths} 个月续期` : `renews every ${f.everyMonths} months`)}</>}
                    </span>
                  </li>
                ))}
              </ol>
              {p.varies > 0 && <p className="note">{zh ? `另有 ${p.varies} 项费用按机构标准计算，提交前会确认。` : `${p.varies} more fee${p.varies === 1 ? " is" : "s are"} set by the agency's schedule and confirmed before filing.`}</p>}
            </details>
          ))}
        </div>
        <div className="m-btns">
          <button type="button" className="pill quiet" onClick={() => void saveFile("placetta-store-plan.csv", new Blob([planCsv(plans)], { type: "text/csv" }))}><I.download />{zh ? "导出 CSV" : "Export CSV"}</button>
          <Pill kind="ink" onClick={add}>{zh ? `添加 ${plans.length} 家门店` : `Add ${plans.length} store${plans.length === 1 ? "" : "s"}`}</Pill>
        </div>
      </>)}
    </section>
  );
}

export function Stores() {
  const { t, b, ws, ask, busy, lang, cloud, go } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const stores = ws.stores ?? [];
  const s = stores.find(x => x.id === open);
  if (s) return <StoreDetail s={s} onBack={() => setOpen(null)} />;
  return (
    <div className="page">
      <header className="ph"><div className="ph-tx"><h1>{t("nav_stores")}</h1><p>{b(B("Every store inspection-ready every day, measured on what matters: opening on time, staying open, no fines.", "每家门店每天都做好迎检准备，用三件事衡量：按期开业、持续营业、零罚款。"))}</p></div>
        <div className="ph-acts">
          {cloud?.owner && stores.length > 0 && <Pill onClick={() => openSettings(go, "hq")}>{lang === "zh" ? "与总部共享" : "Share with headquarters"}</Pill>}
          {!bulk && <Pill onClick={() => setBulk(true)}>{lang === "zh" ? "规划多家门店" : "Plan many stores"}</Pill>}
        </div></header>
      {bulk && <BulkPlan onClose={() => setBulk(false)} />}
      {stores.length ? (
        <div className="stores">{stores.map(x => <StoreCard key={x.id} s={x} onOpen={() => setOpen(x.id)} />)}</div>
      ) : (
        <div className="empty">
          <p>{b(B("Add your first store and Placetta starts tracking its readiness every day.", "添加第一家门店，快哉每天跟踪它的迎检就绪度。"))}</p>
          <Pill kind="ink" disabled={busy} onClick={() => ask(b(B("Help me add my first store", "帮我添加第一家门店")))}>{b(B("Add a store", "添加门店"))}</Pill>
        </div>
      )}
    </div>
  );
}

/** A compact line per store for the overview. */
export function StoresStrip({ onOpen }: { onOpen: () => void }) {
  const { b, ws } = useApp();
  const stores = ws.stores ?? [];
  if (!stores.length) return null;
  return (
    <div className="stores-strip">
      {stores.map(s => { const r = readiness(s, ws); return (
        <button key={s.id} type="button" className="ss" onClick={onOpen}>
          <Ring score={r.score} band={r.band} size={44} />
          <span><b>{b(s.name)}</b><small>{b(r.label)}</small></span>
          <Grade s={s} />
        </button>
      ); })}
    </div>
  );
}
