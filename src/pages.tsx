import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { useApp } from "./ctx";
import type { Approval, Application, Fact, FactGroup, Level, LicenseHit, Status } from "./model";
import { daysUntil, fmtAgo, fmtDay, fmtIn, fmtMonth, fmtStamp, money } from "./time";
import { FileCard, Footer, I, Pill, StatusChip, feeTotal } from "./ui";
import type { Key } from "./i18n";
import { AgentBot, TaskBot, Working } from "./Bot";
import { StoresStrip } from "./Stores";
import { B } from "./model";
import { takeAutostart } from "./cloud/handoff";

export const INK = "#4D73A3";
const LEVELS: Level[] = ["federal", "state", "county", "city"];
const ORDER: Status[] = ["ready", "needs", "draft", "review", "waiting", "todo", "approved"];
const byPriority = (a: Application, b: Application) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || Number(!!b.critical) - Number(!!a.critical);

/* ------------------------------ shared bits ------------------------------ */

function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="ph">
      <div className="ph-tx"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="ph-act">{children}</div>}
    </header>
  );
}

function SecHead({ title, count, more, onMore }: { title: string; count?: number; more?: string; onMore?: () => void }) {
  return (
    <div className="sec-h">
      <h2>{title}{count ? <em>{count}</em> : null}</h2>
      {more && onMore && <button type="button" className="more" onClick={onMore}>{more}<I.chevR /></button>}
    </div>
  );
}

const KIND_ICON = { file: I.form, send: I.message, upload: I.clip, pay: I.card };

/** Something only you can do: frosted, with the one action it needs. */
export function NeedRow({ a, compact }: { a: Approval; compact?: boolean }) {
  const { b, t, lang, ws, busy, openApproval, openApp, approve, cloud } = useApp();
  const app = a.app ? ws.apps.find(x => x.id === a.app) : undefined;
  const fee = a.kind === "pay" ? a.fee ?? 0 : app && a.kind === "file" ? feeTotal(app) : 0;
  const Icon = KIND_ICON[a.kind];
  const sub = [a.agency && b(a.agency), (a.kind === "file" || a.kind === "pay") && (fee ? money(fee) : t("free"))].filter(Boolean).join(lang === "zh" ? "，" : ", ");
  if (a.kind === "pay") return (
    <div className={"appr k-pay" + (compact ? " compact" : "")}>
      <span className={"appr-ico k-" + a.kind}><Icon /></span>
      <span className="appr-tx"><b>{b(a.title)}</b>{sub && <span>{sub}</span>}</span>
      <span className="appr-btns">
        <button type="button" className="pill quiet sm" disabled={busy} onClick={() => a.filing && void cloud?.markPaid(a.filing)}>{b(B("I've paid", "我已付款"))}</button>
        <Pill onClick={() => approve(a.id)} sm={compact}>{b(B("Pay the agency", "去付款"))}</Pill>
      </span>
    </div>
  );
  return (
    <div className={"appr" + (compact ? " compact" : "")}>
      <span className={"appr-ico k-" + a.kind}><Icon /></span>
      <span className="appr-tx"><b>{b(a.title)}</b>{sub && <span>{sub}</span>}</span>
      {a.kind === "upload"
        ? <Pill onClick={() => app && openApp(app.id, "check")} disabled={busy} sm={compact}>{t("addFiles")}</Pill>
        : <Pill onClick={() => openApproval(a.id)} disabled={busy} sm={compact}>{t("review")}</Pill>}
    </div>
  );
}

function AppRow({ a }: { a: Application }) {
  const { b, openApp } = useApp();
  return (
    <Working on={a.status === "draft"} size="line">
      <button type="button" className={"row arow" + (a.critical ? " crit" : "")} onClick={() => openApp(a.id)}>
        <span className="arow-n"><b>{b(a.name)}</b><small>{a.next ? b(a.next) : b(a.agency)}</small></span>
        <StatusChip s={a.status} />
      </button>
    </Working>
  );
}

/** What the agent is doing right now, or the last thing it did. */
function LiveLine() {
  const { b, lang, ws, busy, live } = useApp();
  const last = ws.audit.find(a => a.actor === "agent");
  if (busy && live) return <Working on size="line"><p className="liveline on" aria-live="polite"><ThinkingOrb state={live.state} size={20} theme="light" color={INK} aria-hidden="true" /><span>{b(live.label)}…</span>{live.tool && <em className="site">{live.tool}</em>}</p></Working>;
  if (!last) return null;
  return <p className="liveline"><span className="ll-dot" aria-hidden="true" /><span>{b(last.action)}: {b(last.object)}</span><em>{fmtAgo(last.at, lang)}</em></p>;
}

/* -------------------------------- overview -------------------------------- */

function Welcome() {
  const { b, ws, ask, busy, cloud, mode } = useApp();
  const place = ws.meta?.city ?? (ws.locations[0] ? b(ws.locations[0].name) : "");
  const what = ws.meta?.what ?? "";
  const start = () => ask(b(B(`Map every license, permit and registration ${b(ws.business)} needs to open its store${place ? ` in ${place}` : ""}${what ? `, which sells ${what.charAt(0).toLowerCase() + what.slice(1)}` : ""}. Prepare an application for each one, fill what you can from Context, and tell me what you need from me.`, `梳理${b(ws.business)}${place ? `在${place}` : ""}${what ? `开设${what}` : "开店"}所需的全部执照、许可和登记，为每一项准备申请，用资料填写能填的内容，并告诉我还需要我提供什么。`)));
  // Came from the website's "Get my plan": start mapping as soon as the agent is ready, once.
  useEffect(() => { if (cloud && mode === "server" && cloud.plan !== "none" && takeAutostart()) setTimeout(start, 0); }, [mode]);   // after this commit, once the agent is wired up // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="page home">
      <header className="hero">
        <div className="hero-bot"><AgentBot size={96} busy={busy} /></div>
        <h1>{b(B(`Let's get ${b(ws.business)} licensed.`, `一起为${b(ws.business)}办齐执照。`))}</h1>
        <p className="lede">{b(B("Placetta maps every license your store needs, in order, from the city to the federal government, and prepares each application. You approve; our team files.", "快哉按顺序梳理门店从市级到联邦所需的全部执照，并准备好每一份申请。您批准，团队提交。"))}</p>
        <div className="hero-act">
          {cloud && cloud.plan === "none"
            ? <Pill kind="ink" onClick={() => cloud.openPlans("start")}>{b(B("Get your entry plan, $299", "开通开店计划，$299"))}</Pill>
            : <Pill kind="ink" disabled={busy} onClick={start}>{b(B("Map my licenses", "梳理我的执照"))}</Pill>}
        </div>
        {cloud && cloud.plan === "none" && <p className="ctx">{b(B("One market, one time. Credited toward your first year.", "每个市场一次性付费，可抵扣首年费用。"))}</p>}
      </header>
      <Footer />
    </div>
  );
}

export function Overview() {
  const { t, b, ws, lang, go, ask, busy } = useApp();
  const n = ws.apps.length;
  if (!n) return <Welcome />;
  const c = (s: Status[]) => ws.apps.filter(a => s.includes(a.status)).length;
  const approved = c(["approved"]), agency = c(["review"]), you = c(["ready", "needs"]);
  const soon = [...ws.deadlines].filter(d => daysUntil(d.date) >= 0).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 4);
  const facts = ws.facts.filter(f => ["f-entity", "f-addr", "f-sell", "f-staff", "f-open"].includes(f.id));
  return (
    <div className="page home">
      <header className="hero">
        <div className="hero-bot"><AgentBot size={120} busy={busy} /></div>
        <h1>{n === 1 ? t("ov_title1") : t("ov_title", { n })}</h1>
        <p className="lede">{t("ov_state", { a: approved, r: agency, n: you })}</p>
        <div className="progress" aria-label={t("ov_done", { d: approved + agency, n })}>
          <span className="bar"><i style={{ width: `${((approved + agency) / n) * 100}%` }} /></span>
          <span className="pl">{t("ov_done", { d: approved + agency, n })}</span>
        </div>
        {ws.locations[0] && <p className="ctx">{t("ov_sub", { biz: b(ws.business), place: b(ws.locations[0].name), goal: b(ws.goal) })}</p>}
        <LiveLine />
      </header>

      {(ws.stores ?? []).length > 0 && (
        <section className="sec">
          <SecHead title={t("nav_stores")} more={t("viewAll")} onMore={() => go("stores")} />
          <StoresStrip onOpen={() => go("stores")} />
        </section>
      )}

      <section className="sec">
        <SecHead title={t("needsYou")} count={ws.approvals.length} />
        {ws.approvals.length ? <div className="stack">{ws.approvals.map(a => <NeedRow key={a.id} a={a} />)}</div> : <p className="quiet">{t("allClear")}</p>}
      </section>

      {ws.nudges.length > 0 && (
        <section className="sec">
          <SecHead title={t("fromPlacetta")} />
          <div className="notes">
            {ws.nudges.map(x => (
              <div key={x.id} className="note-card">
                <span className="nc-ico"><I.spark /></span>
                <p>{b(x.text)}{x.sample && <em className="sample">{t("sampleTag")}</em>}</p>
                <button type="button" className="pill quiet sm" disabled={busy} onClick={() => ask(b(x.prompt))}>{b(x.ask)}</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="sec">
        <SecHead title={t("nav_apps")} more={t("viewAll")} onMore={() => go("apps")} />
        <div className="tray">{[...ws.apps].sort(byPriority).slice(0, 6).map(a => <AppRow key={a.id} a={a} />)}</div>
      </section>

      <div className="two">
        <section className="sec">
          <SecHead title={t("comingUp")} more={t("viewAll")} onMore={() => go("deadlines")} />
          <ul className="tray soon">
            {soon.map(d => {
              const k = daysUntil(d.date);
              return (
                <li key={d.id} className="row">
                  <span className="soon-t">{b(d.title)}</span>
                  <span className={"soon-d" + (k <= 7 ? " hot" : "")}>{fmtDay(d.date, lang)}<small>{fmtIn(k, lang)}</small></span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="sec">
          <SecHead title={t("running")} />
          <ul className="tray runs">
            {ws.running.map(r => (
              <li key={r.id} className="row"><TaskBot id={r.id} label={b(r.label)} /><span>{b(r.label)}{r.detail && <small>{b(r.detail)}</small>}</span></li>
            ))}
          </ul>
        </section>
      </div>

      <section className="sec">
        <SecHead title={t("recentDocs")} more={t("viewAll")} onMore={() => go("docs")} />
        <div className="files">{ws.docs.slice(0, 4).map(d => <FileCard key={d.id} d={d} />)}</div>
      </section>

      <section className="sec">
        <SecHead title={t("whatIKnow")} more={t("edit")} onMore={() => go("context")} />
        <dl className="tray kv">{facts.map(f => <div key={f.id} className="row"><dt>{b(f.label)}</dt><dd>{b(f.value)}</dd></div>)}</dl>
      </section>
      <Footer />
    </div>
  );
}

/* ------------------------------ applications ------------------------------ */

export function Applications() {
  const { t, b, ws, openApp } = useApp();
  return (
    <div className="page">
      <PageHead title={t("nav_apps")} sub={t("apps_sub")} />
      <div className="table apps-t" role="table">
        <div className="tr th" role="row"><span>{t("th_app")}</span><span>{t("th_status")}</span><span>{t("th_fee")}</span><span>{t("th_takes")}</span><span>{t("th_next")}</span></div>
        {LEVELS.map(l => {
          const rows = ws.apps.filter(a => a.level === l);
          if (!rows.length) return null;
          return (
            <div key={l} role="rowgroup" className="tgroup">
              <p className="tg-h">{t(("lv_" + l) as Key)}<span>{rows.length}</span></p>
              <div className="tray">
                {rows.map(a => {
                  const fee = feeTotal(a);
                  return (
                    <Working key={a.id} on={a.status === "draft"} size="line">
                    <button type="button" className={"tr row" + (a.critical ? " crit" : "")} onClick={() => openApp(a.id)} role="row">
                      <span className="c-name"><b>{b(a.name)}</b><small>{b(a.agency)}</small><small className="c-est2">{b(a.est)}</small></span>
                      <span className="c-st"><StatusChip s={a.status} /></span>
                      <span className="c-fee">{fee ? money(fee) : t("free")}</span>
                      <span className="c-est">{b(a.est)}</span>
                      <span className="c-next">{a.critical && <em>{t("critical")}</em>}{a.next ? b(a.next) : ""}</span>
                    </button>
                    </Working>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="note">{t("estimates")}</p>
    </div>
  );
}

/* -------------------------------- documents -------------------------------- */

export function Documents() {
  const { t, ws, upload, busy } = useApp();
  const [f, setF] = useState<"all" | "you" | "agent" | "agency">("all");
  const input = useRef<HTMLInputElement>(null);
  const docs = ws.docs.filter(d => f === "all" || d.by === f);
  const chips: { k: typeof f; l: Key }[] = [{ k: "all", l: "f_all" }, { k: "you", l: "f_you" }, { k: "agent", l: "f_agent" }, { k: "agency", l: "f_agency" }];
  return (
    <div className="page">
      <PageHead title={t("nav_docs")} sub={t("docs_sub")}>
        <Pill kind="ink" disabled={busy} onClick={() => input.current?.click()}>{t("upload")}</Pill>
        <input ref={input} type="file" multiple hidden onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; if (fs.length) upload("", "", fs); }} />
      </PageHead>
      <div className="seg" role="group">
        {chips.map(c => <button key={c.k} type="button" aria-pressed={f === c.k} onClick={() => setF(c.k)}>{t(c.l)}<span>{c.k === "all" ? ws.docs.length : ws.docs.filter(d => d.by === c.k).length}</span></button>)}
      </div>
      <div className="files grid">{docs.map(d => <FileCard key={d.id} d={d} />)}</div>
    </div>
  );
}

/* -------------------------------- deadlines -------------------------------- */

export function Deadlines() {
  const { t, b, ws, lang, ask, openApp, busy } = useApp();
  const list = [...ws.deadlines].sort((x, y) => x.date.localeCompare(y.date));
  const months = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const d of list) { const k = d.date.slice(0, 7); m.set(k, [...(m.get(k) ?? []), d]); }
    return [...m.entries()];
  }, [list]);
  return (
    <div className="page">
      <PageHead title={t("nav_deadlines")} sub={t("dl_sub")} />
      {months.map(([k, ds]) => (
        <section key={k} className="sec tl-m">
          <SecHead title={fmtMonth(k + "-01", lang)} />
          <ol className="tray">
            {ds.map(d => {
              const n = daysUntil(d.date);
              const day = new Date(d.date + "T12:00:00");
              return (
                <li key={d.id} className={"row tl k-" + d.kind}>
                  <span className="tl-date"><b>{day.getDate()}</b><small>{day.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { weekday: "short" })}</small></span>
                  <span className="tl-body">
                    <b>{b(d.title)}</b>
                    <span><em className="kind">{t(("k_" + d.kind) as Key)}</em>{d.agency && <em>{b(d.agency)}</em>}</span>
                  </span>
                  <span className="tl-act">
                    <em className={"in" + (n <= 7 ? " hot" : "")}>{fmtIn(n, lang)}</em>
                    {d.prompt && d.ask ? <button type="button" className="pill primary sm" disabled={busy} onClick={() => ask(b(d.prompt!))}>{b(d.ask)}</button>
                      : d.app ? <button type="button" className="pill quiet sm" onClick={() => openApp(d.app!)}>{t("open")}</button> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      <p className="note">{t("estimates")}</p>
    </div>
  );
}

/* ------------------------------- audit trail ------------------------------- */

export function AuditTrail() {
  const { t, b, ws, exportAudit } = useApp();
  const [f, setF] = useState<"all" | "agent" | "you" | "agency">("all");
  const rows = ws.audit.filter(a => f === "all" || a.actor === f);
  const chips: { k: typeof f; l: Key }[] = [{ k: "all", l: "f_all" }, { k: "agent", l: "actor_agent" }, { k: "you", l: "actor_you" }, { k: "agency", l: "f_agency" }];
  return (
    <div className="page">
      <PageHead title={t("nav_audit")} sub={t("au_sub")}>
        <Pill kind="ink" onClick={exportAudit}>{t("exportCsv")}</Pill>
      </PageHead>
      <div className="seg" role="group">
        {chips.map(c => <button key={c.k} type="button" aria-pressed={f === c.k} onClick={() => setF(c.k)}>{t(c.l)}<span>{c.k === "all" ? ws.audit.length : ws.audit.filter(a => a.actor === c.k).length}</span></button>)}
      </div>
      <div className="table audit-t" role="table">
        <div className="tr th" role="row"><span>{t("au_time")}</span><span>{t("au_who")}</span><span>{t("au_action")}</span><span>{t("au_object")}</span><span>{t("au_detail")}</span></div>
        <div className="tray">
          {rows.map(a => (
            <div key={a.id} className="tr row" role="row">
              <span className="c-time">{fmtStamp(a.at)}</span>
              <span className={"c-who by-" + a.actor}><i aria-hidden="true" />{a.actor === "agency" && a.who ? b(a.who) : t(("actor_" + a.actor) as Key)}</span>
              <span className="c-act">{b(a.action)}</span>
              <span className="c-obj">{b(a.object)}</span>
              <span className="c-det">{a.detail ? b(a.detail) : ""}</span>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}

/* --------------------------------- context --------------------------------- */

function FactRow({ f }: { f: Fact }) {
  const { b, t, editFact } = useApp();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState("");
  const save = () => { const x = v.trim(); if (x && x !== b(f.value)) editFact(f.id, x); setEdit(false); };
  return (
    <div className="row fact">
      <dt>{b(f.label)}</dt>
      <dd>
        {edit ? (
          <form className="fact-edit" onSubmit={e => { e.preventDefault(); save(); }}>
            <input autoFocus value={v} onChange={e => setV(e.target.value)} aria-label={b(f.label)} onKeyDown={e => { if (e.key === "Escape") setEdit(false); }} />
            <button type="submit" className="pill ink sm">{t("save")}</button>
            <button type="button" className="pill quiet sm" onClick={() => setEdit(false)}>{t("cancel")}</button>
          </form>
        ) : <span className="fact-v">{b(f.value)}</span>}
      </dd>
      <span className="fact-src">{f.locked ? <><I.lock />{t("alwaysOn")}</> : b(f.source)}</span>
      {!f.locked && !edit && <button type="button" className="icbtn" aria-label={t("edit") + " " + b(f.label)} onClick={() => { setV(b(f.value)); setEdit(true); }}><I.pencil /></button>}
    </div>
  );
}

export function ContextPage() {
  const { t, ws } = useApp();
  const groups: FactGroup[] = ["business", "location", "operations", "rules"];
  return (
    <div className="page narrow">
      <PageHead title={t("nav_context")} sub={t("cx_sub")} />
      {groups.map(g => (
        <section key={g} className="sec">
          <SecHead title={t(("g_" + g) as Key)} />
          <dl className="tray facts">{ws.facts.filter(f => f.group === g).map(f => <FactRow key={f.id} f={f} />)}</dl>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------ find licenses ------------------------------ */

export function FindLicenses({ result, live }: { result: { what: string; where: string; hits: LicenseHit[] } | null; live: string | null }) {
  const { t, b, lang, run, busy, openApp, ask, mode } = useApp();
  const [what, setWhat] = useState(result?.what ?? "");
  const [where, setWhere] = useState(result?.where ?? "");
  const go = (w = what, p = where) => { const W = w.trim() || b({ en: "Milk tea shop", zh: "奶茶店" }), P = p.trim() || b({ en: "San Jose, CA", zh: "加州圣何塞" }); setWhat(W); setWhere(P); run({ match: { what: W, where: P } }, lang === "zh" ? `查找许可：${W}，${P}` : `Find licenses: ${W} in ${P}`); };
  const examples: [string, string][] = lang === "zh" ? [["奶茶店", "加州圣何塞"], ["奶茶店", "加州弗里蒙特"], ["美发店", "加州奥克兰"]] : [["Milk tea shop", "San Jose, CA"], ["Milk tea shop", "Fremont, CA"], ["Hair salon", "Oakland, CA"]];
  const isFremont = !!result && /fremont|弗里蒙特/i.test(result.where);
  return (
    <div className="page">
      <PageHead title={t("nav_find")} sub={t("fd_sub")} />
      <form className="matcher" onSubmit={e => { e.preventDefault(); go(); }}>
        <label><span>{t("fd_what")}</span><input value={what} onChange={e => setWhat(e.target.value)} placeholder={t("fd_whatPh")} /></label>
        <i aria-hidden="true" />
        <label><span>{t("fd_where")}</span><input value={where} onChange={e => setWhere(e.target.value)} placeholder={t("fd_wherePh")} /></label>
        <button type="submit" className="m-go" disabled={busy} aria-label={t("fd_go")}><I.find /></button>
      </form>
      <div className="examples">{examples.map(([w, p]) => <button key={w + p} type="button" disabled={busy} onClick={() => go(w, p)}>{w}, {p}</button>)}</div>

      {live && (
        <Working on size="line"><div className="matching" aria-live="polite">
          <ThinkingOrb state="searching" size={20} theme="light" color={INK} aria-label={live} />
          <span>{live}</span>
        </div></Working>
      )}

      {result && !live && (
        <section className="results">
          <div className="sec-h">
            <h2>{t("fd_found", { n: result.hits.length })}<span className="for">{result.what}, {result.where}</span></h2>
            {isFremont && <Pill disabled={busy} onClick={() => ask(lang === "zh" ? "在弗里蒙特开第二家店" : "Add a second shop in Fremont")}>{t("fd_addAll")}</Pill>}
          </div>
          {LEVELS.map(l => {
            const hits = result.hits.filter(h => h.level === l);
            if (!hits.length) return null;
            return (
              <div key={l} className="tgroup">
                <p className="tg-h">{t(("lv_" + l) as Key)}<span>{hits.length}</span></p>
                <div className="tray hits">
                  {hits.map((h, i) => (
                    <div key={i} className="row hit">
                      <span className="hit-n"><b>{b(h.name)}</b><small>{b(h.agency)}</small><small className="hit-e2">{b(h.est)}</small></span>
                      <span className="hit-f">{b(h.fee)}</span>
                      <span className="hit-e">{b(h.est)}</span>
                      <span className="hit-s">{h.source.url ? <a href={h.source.url} target="_blank" rel="noopener noreferrer">{h.source.label}<I.ext /></a> : <em>{t("fd_check")}</em>}</span>
                      <span className="hit-a">
                        {h.have ? <button type="button" className="pill quiet sm" onClick={() => openApp(h.have!)}><I.check />{t("fd_have")}</button>
                          : h.carry ? <em className="carry">{t("fd_carry")}</em>
                            : mode !== "demo" ? <button type="button" className="pill primary sm" disabled={busy} onClick={() => ask(lang === "zh" ? `把“${b(h.name)}”（${b(h.agency)}）加入我的申请，并尽量填好` : `Add the ${b(h.name)} (${b(h.agency)}) to my applications and fill what you can`)}><I.plus />{t("fd_add")}</button>
                          : /Statement of Information/.test(h.name.en) ? <button type="button" className="pill primary sm" disabled={busy} onClick={() => ask(lang === "zh" ? "准备信息声明" : "Prepare the Statement of Information")}><I.plus />{t("fd_add")}</button> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="note">{t("estimates")}</p>
        </section>
      )}
    </div>
  );
}

/* -------------------------------- settings -------------------------------- */
