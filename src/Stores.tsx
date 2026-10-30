import { inspectionsFor } from "./inspections/forStore";
import { useEffect, useMemo, useState } from "react";
import { openSettings } from "./Settings";
import { useApp } from "./ctx";
import { B, type Cert, type Store, type Workspace } from "./model";
import { countyOf, stateCode, cityName } from "./counties";
import { FWW_SOURCE, FWW_THRESHOLD, GRADES_SOURCE, readiness, todayLogs, usLocations, valueOf, type Readiness } from "./stores";
import { daysFromNow, daysUntil, fmtAgo, fmtDay, fmtIn, inDays } from "./time";
import { basisLine, estimateSay, openingLine, openingPath, type Evidence } from "./smart";
import { EstimateDate, HingeLine } from "./OpeningEstimate";
import { useEvidence } from "./evidence";
import { I, Menu, Pill, StatusChip } from "./ui";
import { saveFile } from "./files";
import { parseStoreList, permitsOnOpening, planCsv, planStores, toWorkspace, type FormStat } from "./plan";
import * as api from "./cloud/api";
import { AgentBot, StoreBot } from "./Bot";
import { storeOf, type Job } from "./jobs";
import { PlanCard, WatchLink } from "./Work";
import { firstSentence } from "./phrase";
import { StaffLangPick } from "./StaffLang";
import { StoresCheckPanel } from "./StoresCheck";
import { NoticeEditor, StoreValue, ValueReportSheet } from "./ValueReport";
import { TrustShare } from "./TrustShare";
import { ChecksSheet, CheckList } from "./Checks";
import { QuestionnaireSheet } from "./Questionnaire";
import { checksFor, tally } from "./controls";
import { ReplicaFacts, ReplicateSheet } from "./ReplicateStore";

/* Stores: every store inspection-ready every day. A score per store, today's logs, staff certificates, schedules,
   a mock inspection, and the three numbers that show the value: opened on time, stayed open, no fines. Each store has
   its own bot (Odelia for that store), and its jobs show with it. */

/** A store's jobs: the ones its bot works there (a job split across stores counts by its parts). */
function jobsAt(ws: Workspace, s: Store) {
  const mine = (ws.jobs ?? []).filter(j => !j.children?.length && storeOf(ws.stores, j)?.id === s.id);
  const live = (j: Job) => j.status !== "done" && j.status !== "stopped";
  return { open: mine.filter(live).sort((a, b) => Number(b.status === "waiting") - Number(a.status === "waiting") || b.updated.localeCompare(a.updated)), done: mine.filter(j => !live(j)) };
}
/** The store's work in a line, in the owner's words: "1 job needs you", "Odelia is on 2 jobs here", "Nothing waiting". */
function botLine(jobs: Job[], zh: boolean, finished = 0, bare = false) {
  const needs = jobs.filter(j => j.status === "waiting").length, n = jobs.length;
  const s = (k: number) => (k === 1 ? "" : "s");
  if (!n && finished) return bare ? (zh ? `已完成 ${finished} 项，暂无待办` : `${finished} job${s(finished)} done, nothing waiting`) : zh ? `这家店已完成 ${finished} 项工作，暂无待办` : `${finished} job${s(finished)} done here, nothing waiting`;
  if (!n) return bare ? (zh ? "暂无待办" : "Nothing waiting") : zh ? "这家店暂无待办" : "Nothing waiting on this store";
  if (needs) return zh ? `${needs} 项工作需要您` : `${needs} job${s(needs)} need${needs === 1 ? "s" : ""} you`;
  return bare ? (zh ? `正在处理 ${n} 项工作` : `On ${n} job${s(n)}`) : zh ? `Odelia 正在处理这家店的 ${n} 项工作` : `Odelia is on ${n} job${s(n)} here`;
}

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
  const bot = jobsAt(ws, raw);
  return (
    <button type="button" className="store" onClick={onOpen}>
      <div className="store-top">
        <Ring score={r.score} band={r.band} />
        <div className="store-name">
          <b>{b(s.name)}</b>
          <span>{b(r.label)}{s.stage === "opening" && s.projectedOpen ? (lang === "zh" ? `，预计 ${b(estimateSay(s.projectedOpen, p?.range))} 开业` : `. Opening ${b(estimateSay(s.projectedOpen, p?.range))}`) : ""}</span>
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
      <span className={"store-bot" + (bot.open.some(j => j.status === "waiting") ? " needs" : "")}>
        <span className="sb-bot" aria-hidden="true"><StoreBot id={raw.id} size={22} label={b(s.name)} busy={bot.open.some(j => j.status === "running")} /></span>
        <span>{botLine(bot.open, lang === "zh", bot.done.filter(j => j.status === "done").length)}</span>
      </span>
    </button>
  );
}

/** The simple Stores list (CLASSIC_STORES off), the way Grok Bot lists its bots and Airbnb a host's listings: one row a
 *  store, its name, where it stands in one plain sentence, and what needs you there. The score, grade and checks live
 *  in the store itself. */
const CLASSIC_STORES = false as boolean;

function StoreRow({ s: raw, onOpen }: { s: Store; onOpen: () => void }) {
  const { b, ws, lang } = useApp();
  const zh = lang === "zh";
  const { p, s } = withPath(raw, ws, useEvidence());
  const r = readiness(s, ws);
  const bot = jobsAt(ws, raw);
  const waiting = bot.open.filter(j => j.status === "waiting").length;
  const expiring = s.certs.filter(c => { const d = daysUntil(c.expires); return d >= 0 && d <= 30; }).length;
  const where = s.stage === "opening"
    // the date is the row's own (sr-when): the line says how it's going, once (Rams)
    ? (s.projectedOpen && !CLASSIC_STORES ? (p && p.verdict === "on_track" ? (zh ? "筹备中，进度正常" : "Getting ready, on track") : (zh ? "筹备中" : "Getting ready to open")) : s.projectedOpen ? (zh ? `筹备中，预计 ${fmtDay(s.projectedOpen, lang, true)} 开业` : `Opening ${fmtDay(s.projectedOpen, lang, true)}`) + (p && p.verdict === "on_track" ? (zh ? "，进度正常" : ", on track") : "") : (zh ? "筹备中" : "Getting ready to open"))
    : (zh ? `已开业，${b(r.label)}` : `Open. ${b(r.label)}`);
  const needs = [waiting ? (zh ? `${waiting} 件事需要您` : `${waiting} thing${waiting === 1 ? " needs" : "s need"} you`) : "", expiring ? (zh ? `${expiring} 张证书即将到期` : `${expiring} certificate${expiring === 1 ? "" : "s"} expiring`) : ""].filter(Boolean).join(zh ? "，" : ", ");
  // the one next step, in words: what the first job waiting on the owner needs, else the certificate that expires first
  const ask = bot.open.find(j => j.status === "waiting" && j.waiting)?.waiting;
  const cert = [...s.certs].filter(c => { const d = daysUntil(c.expires); return d >= 0 && d <= 30; }).sort((x, y) => x.expires.localeCompare(y.expires))[0];
  const step = ask ? b(ask) : cert ? (zh ? `续期：${cert.person}的${b(cert.kind)}` : `Renew: ${cert.person}'s ${b(cert.kind)}`) : "";
  const mine = ws.apps.filter(a => (raw.apps ?? []).includes(a.id));
  const marks = [...mine.filter(a => a.status === "approved").map(() => "done"), ...mine.filter(a => a.status === "review" || a.status === "filing").map(() => "agency"), ...mine.filter(a => !["approved", "review", "filing"].includes(a.status)).map(() => "")];
  // the answer at the row's end (Chesky): the next date that matters, a renewal's days left or the opening day
  const when = cert ? (zh ? `${daysUntil(cert.expires)} 天后续期` : `Renews in ${daysUntil(cert.expires)} days`) : s.stage === "opening" && s.projectedOpen ? (zh ? `${fmtDay(s.projectedOpen, lang)} 开业` : `Opens ${fmtDay(s.projectedOpen, lang)}`) : "";
  return (
    <button type="button" className={"store-row" + (CLASSIC_STORES ? "" : " plain")} onClick={onOpen}>
      {CLASSIC_STORES
        ? <span className="sr-bot" aria-hidden="true"><StoreBot id={raw.id} size={28} label={b(s.name)} busy={bot.open.some(j => j.status === "running")} /></span>
        : <span className={"sr-ico" + (bot.open.some(j => j.status === "running") ? " on" : "")} aria-hidden="true"><I.store /></span>}
      <span className="sr-tx"><b>{b(s.name)}</b><small>{where.replace(/\.\s*$/, "")}{zh ? "。" : "."}</small>
        {/* the store's licenses, one mark each, the same signature as Home (Paul Smith): done, with the agency, to do */}
        {!CLASSIC_STORES && s.stage !== "open" && marks.length > 1 && marks.length <= 24 && <span className="hm-segs sr-segs" role="img" aria-label={zh ? `${marks.filter(m => m === "done").length}/${marks.length} 项执照已办好` : `${marks.filter(m => m === "done").length} of ${marks.length} licenses done`}>{marks.map((m, i) => <i key={i} className={m} />)}</span>}
        {!CLASSIC_STORES && needs && <em className="sr-step">{step ? `${step.replace(/^(your approval|您的批准)[:：]\s*/i, zh ? "批准：" : "Approve: ").replace(/[.。]\s*$/, "")}${waiting + expiring > 1 ? (zh ? `，另有 ${waiting + expiring - 1} 项` : `, and ${waiting + expiring - 1} more`) : ""}` : needs}</em>}</span>
      {CLASSIC_STORES ? (needs ? <em className="sr-need">{needs}</em> : <span className="sr-ok">{zh ? "没有需要您的" : "Nothing needs you"}</span>) : when ? <span className="sr-when">{when}</span> : null}
      <I.chevR />
    </button>
  );
}

/** A store's permits beside its card: how many are done, and the next ones with their status and next step. */
function StoreNext({ s, onOpen }: { s: Store; onOpen: () => void }) {
  const { b, ws, lang, openApp } = useApp();
  const zh = lang === "zh";
  const apps = ws.apps.filter(a => s.apps?.includes(a.id));
  const done = apps.filter(a => a.status === "approved").length;
  const order: Record<string, number> = { ready: 0, needs: 1, draft: 2, todo: 3, waiting: 4, review: 5, filing: 6, approved: 9 };
  const next = [...apps].sort((x, y) => (order[x.status] ?? 7) - (order[y.status] ?? 7)).filter(a => a.status !== "approved").slice(0, 6);
  if (!apps.length) return null;
  return (
    <section className="store-next" aria-label={zh ? "这家店的许可" : "This store's permits"}>
      <div className="sn-h">
        <h2>{zh ? "这家店的许可" : "This store's permits"}</h2>
        <span>{zh ? `已批准 ${done}/${apps.length}` : `${done} of ${apps.length} approved`}</span>
      </div>
      <span className="sn-bar" aria-hidden="true"><i style={{ width: `${(done / apps.length) * 100}%` }} /></span>
      <ul className="sn-list">
        {next.map(a => (
          <li key={a.id}><button type="button" onClick={() => openApp(a.id)}>
            <span className="sn-n"><b>{b(a.name)}</b><small>{a.next ? firstSentence(b(a.next)) : b(a.agency)}</small></span>
            <StatusChip s={a.status} />
          </button></li>
        ))}
      </ul>
      <button type="button" className="lnk sn-more" onClick={onOpen}>{zh ? "打开门店" : "Open the store"}<I.chevR /></button>
    </section>
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

/** The store's own bot, and the jobs it works here: open ones in full, what needs you first; the last few done, each
 *  with its replay. */
function StoreBotSection({ s }: { s: Store }) {
  const { b, lang, ws } = useApp();
  const zh = lang === "zh";
  const { open, done } = jobsAt(ws, s);
  return (
    <section className="sec bot-group" aria-label={zh ? "这家店的助手" : "This store's bot"}>
      <div className="sec-h bot-h">
        <h2>
          <span className="bot-ico" aria-hidden="true"><StoreBot id={s.id} size={30} label={b(s.name)} busy={open.some(j => j.status === "running")} /></span>
          <span className="bot-name"><span>{zh ? "这家店的助手" : "This store's bot"}</span><small>{botLine(open, zh, done.filter(j => j.status === "done").length, true)}</small></span>
        </h2>
      </div>
      {open.map(j => <PlanCard key={j.id} job={j} compact actions />)}
      {!open.length && <p className="quiet">{zh ? `这家店的工作由它自己的助手负责，例如迎检准备或续期。让 Odelia 处理多家门店时，每家店的助手同时做自己的部分。` : `This store's jobs, like getting ready for an inspection or a renewal, are worked by its own bot. When you ask Odelia for something across stores, each store's bot does its part at the same time.`}</p>}
      {done.length > 0 && (
        <ul className="tray sb-done">
          {done.slice(0, 5).map(j => (
            <li key={j.id} className="row">
              <span className="lr-tx"><b>{b(j.title)}</b><small>{j.status === "stopped" ? (zh ? `已停止，${fmtAgo(j.updated, lang)}` : `Stopped ${fmtAgo(j.updated, lang)}`) : (zh ? `已完成，${fmtAgo(j.updated, lang)}` : `Done ${fmtAgo(j.updated, lang)}`)}</small></span>
              <WatchLink job={j} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A store's checks on its page: the failing ones first with their fix, then a link to all of them, the status page
 *  and the questionnaire (src/controls.ts, src/TrustShare.tsx, src/Questionnaire.tsx). */
function StoreChecks({ s }: { s: Store }) {
  const { b, ws, lang } = useApp();
  const zh = lang === "zh";
  const [sheet, setSheet] = useState<"checks" | "trust" | "q" | null>(null);
  const cs = useMemo(() => checksFor(ws, daysFromNow(0), { store: s.id }), [ws, s.id]);
  const n = tally(cs), open = cs.filter(c => c.state !== "pass");
  return (
    <Section title={b(B("Checks", "合规检查"))} sub={zh ? `${n.total} 项中 ${n.pass} 项通过，${n.fail} 项未通过。只有存档记录才算通过。` : `${n.pass} of ${n.total} passing, ${n.fail} failing. A check passes only on a record.`}
      side={<span className="ts-acts">
        <button type="button" className="pill quiet sm" onClick={() => setSheet("trust")}>{zh ? "共享状态页" : "Share status page"}</button>
        <button type="button" className="pill quiet sm" onClick={() => setSheet("q")}>{zh ? "回答问卷" : "Answer a questionnaire"}</button>
      </span>}>
      {open.length ? <CheckList checks={open.slice(0, 5)} compact /> : <p className="quiet">{zh ? "全部通过。" : "All passing."}</p>}
      {cs.length > 5 && <button type="button" className="pill quiet sm ck-all" onClick={() => setSheet("checks")}>{zh ? `查看全部 ${cs.length} 项` : `See all ${cs.length}`}</button>}
      {sheet === "checks" && <ChecksSheet store={s.id} onClose={() => setSheet(null)} />}
      {sheet === "trust" && <TrustShare store={s.id} onClose={() => setSheet(null)} />}
      {sheet === "q" && <QuestionnaireSheet store={s.id} onClose={() => setSheet(null)} />}
    </Section>
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
          {p.landing && <span className="opening-date"><span className="oe-k">{lang === "zh" ? "预计开业" : "Opening"}</span> <EstimateDate date={p.landing} range={p.range} lang={lang} /></span>}
          {b(line)}
          {p.blocker && (p.verdict === "late" || p.verdict === "tight") && <> <button type="button" className="pill quiet sm" disabled={busy} onClick={() => ask(lang === "zh" ? `${s.name.zh}进度落后，怎样追回？先处理${p.blocker!.name.zh}。` : `${s.name.en} is behind. How do we get it back on schedule? Start with the ${p.blocker!.name.en}.`)}>{lang === "zh" ? "让 Odelia 追回进度" : "Have Odelia catch it up"}</button></>}
          <HingeLine hinge={p.hinge} lang={lang} onOpen={id => openApp(id, "progress")} className="opening-basis" />
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

      <StoreChecks s={s} />

      <StoreBotSection s={s} />

      <Section title={b(B("What Placetta is worth here", "快哉在这家店的价值"))}>
        <Value s={withPath(s, ws, ev).s} big />
      </Section>

      <Section title={b(B("What Placetta delivered here", "快哉在这家店完成的工作"))} sub={b(B("From records only: filings, approval times against the agency median, renewals caught, and fines avoided where an agency notice is on file.", "只用存档记录：申报、与机构中位数对比的审批用时、按时续期，以及有机构通知存档时避免的罚款。"))}>
        <StoreValue storeId={s.id} />
        <NoticeEditor storeId={s.id} />
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
                  <StaffLangPick person={c.person} value={c.lang} />
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
          {(() => {
            // only the next inspection due starts open: the first one not fully ready, among those before opening while the
            // store is opening and the routine ones once it's open
            const ready = (i: typeof guide.inspections[number]) => i.checklist.every(c => s.ready?.[`${i.id}:${c.id}`]);
            const next = guide.inspections.find(i => i.stage === (s.stage === "opening" ? "opening" : "routine") && !ready(i))?.id;
            return guide.inspections.map(ins => {
            const done = ins.checklist.filter(c => s.ready?.[`${ins.id}:${c.id}`]).length;
            const first = ins.checklist.find(c => !s.ready?.[`${ins.id}:${c.id}`])?.id;
            return (
              <details key={ins.id} className="insp" open={ins.id === next}>
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
                      <li key={c.id} className={"row" + (on ? " done" : "") + (c.id === first ? " next" : "")}>
                        <label className="check"><input type="checkbox" checked={on} onChange={e => { const v = e.target.checked; updateStore(s.id, x => ({ ...x, ready: { ...x.ready, [k]: v } }), { action: v ? B("Ready for inspection", "检查项已到位") : B("Not ready for inspection", "检查项未到位"), object: s.name, detail: c.item }); }} />
                          <span><span className="ci">{b(c.item)}</span>{c.why && <small>{b(c.why)}</small>}</span></label>
                        {!on && <Pill sm kind="quiet" disabled={busy} onClick={() => ask(b(B(`How do we get this ready for the ${ins.name.en} at ${s.name.en}: ${c.item.en}?`, `如何为${s.name.zh}的${ins.name.zh}准备好这一项：${c.item.zh}？`)))}>{b(B("How", "怎么做"))}</Pill>}
                      </li>
                    );
                  })}
                </ul>
                <p className="note"><a href={ins.source} target="_blank" rel="noreferrer">{b(B("The agency's own page", "机构官方页面"))}<I.ext /></a> {b(B(`Read ${guide.read}.`, `${guide.read} 查阅。`))}</p>
              </details>
            );
          }); })()}
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
        <Section title={b(B("Licenses on file", "现有执照"))}>
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
  const [check, setCheck] = useState(false);
  const [report, setReport] = useState(false);
  const [sheet, setSheet] = useState<"checks" | "trust" | "q" | "replicate" | null>(null);
  const stores = ws.stores ?? [];
  const s = stores.find(x => x.id === open);
  const ev = useEvidence();
  if (s) return <StoreDetail s={s} onBack={() => setOpen(null)} />;
  // the page's sentence is where the stores stand, not a slogan (Chesky): "1 open, 1 opening Feb 7"
  const openN = stores.filter(x => x.stage === "open").length, next = stores.filter(x => x.stage !== "open").map(x => ({ x, d: withPath(x, ws, ev).s.projectedOpen ?? x.plannedOpen ?? "" })).sort((p, q) => p.d.localeCompare(q.d));
  const storesSay = !stores.length ? B("Every store ready for inspection, every day.", "每家门店，每天都做好迎检准备。")
    : B([openN ? `${openN} open` : "", next.length ? `${next.length} opening${next.length === 1 && next[0].d ? ` ${fmtDay(next[0].d, "en")}` : ""}` : ""].filter(Boolean).join(", ") + ".",
      [openN ? `${openN} 家已开业` : "", next.length ? `${next.length} 家筹备中${next.length === 1 && next[0].d ? `，${fmtDay(next[0].d, "zh")} 开业` : ""}` : ""].filter(Boolean).join("，") + "。");
  return (
    <div className="page stores-page">
      <header className="ph"><div className="ph-tx"><h1>{t("nav_stores")}</h1><p className="ph-long">{b(storesSay)}</p><p className="ph-short">{b(storesSay)}</p></div>
        {/* one action in view, the rest behind More: four pills in a row read as clutter, and stack four deep on a phone */}
        <div className="ph-acts st-acts">
          <Menu className="st-more" buttonClass="lnk st-tools" label={lang === "zh" ? "门店工具" : "Store tools"} button={<>{lang === "zh" ? "门店工具" : "Store tools"}<I.chev /></>} items={[
            ...(stores.length > 0 ? [{ key: "report", label: lang === "zh" ? "价值报告" : "Value report", onPick: () => setReport(true) }] : []),
            ...(!bulk ? [{ key: "bulk", label: lang === "zh" ? "规划多家门店" : "Plan many stores", onPick: () => setBulk(true) }] : []),
            ...(!check ? [{ key: "check", label: lang === "zh" ? "检查已开业门店" : "Check stores already open", onPick: () => setCheck(true) }] : []),
            ...(stores.length > 0 ? [{ key: "replicate", label: lang === "zh" ? "复制这家门店" : "Replicate this store", onPick: () => setSheet("replicate") },
              { key: "checks", label: lang === "zh" ? "合规检查" : "Checks", onPick: () => setSheet("checks") },
              { key: "trust", label: lang === "zh" ? "状态页" : "Status pages", onPick: () => setSheet("trust") },
              { key: "q", label: lang === "zh" ? "回答合规问卷" : "Answer a questionnaire", onPick: () => setSheet("q") }] : []),
            ...(cloud?.owner && stores.length > 0 ? [{ key: "hq", label: lang === "zh" ? "与总部共享" : "Share with headquarters", onPick: () => openSettings(go, "hq") }] : []),
          ]} />
        </div></header>
      {report && <ValueReportSheet onClose={() => setReport(false)} />}
      {bulk && <BulkPlan onClose={() => setBulk(false)} />}
      {check && <StoresCheckPanel onClose={() => setCheck(false)} />}
      {sheet === "checks" && <ChecksSheet onClose={() => setSheet(null)} />}
      {sheet === "trust" && <TrustShare onClose={() => setSheet(null)} />}
      {sheet === "q" && <QuestionnaireSheet onClose={() => setSheet(null)} />}
      {sheet === "replicate" && <ReplicateSheet onClose={() => setSheet(null)} />}
      <ReplicaFacts />
      {!CLASSIC_STORES && stores.length > 0 ? (<>
        <div className="store-rows">{stores.map(x => <StoreRow key={x.id} s={x} onOpen={() => setOpen(x.id)} />)}</div>
        {/* Odelia's one line under the stores (Paul Smith): the next thing a growing owner does, one tap to start it */}
        {!CLASSIC_STORES && <button type="button" className="st-next" disabled={busy} onClick={() => ask(lang === "zh" ? "我要再开一家店。" : "I'm opening another store.")}><span className="st-next-bot" aria-hidden="true"><AgentBot size={22} interactive={false} /></span><span className="st-next-tx">{lang === "zh" ? "要再开一家店？告诉我地址。" : "Opening another store? Tell me the address."}</span><I.chevR /></button>}
      </>) : stores.length === 1 ? (
        // one store: its card beside its permits, so the page is the store's own dashboard, not a card in an empty page
        <div className="stores one">
          <StoreCard s={stores[0]} onOpen={() => setOpen(stores[0].id)} />
          <StoreNext s={stores[0]} onOpen={() => setOpen(stores[0].id)} />
        </div>
      ) : stores.length ? (
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
