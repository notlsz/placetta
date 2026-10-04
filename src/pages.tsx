import { useMemo, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { useApp } from "./ctx";
import type { Approval, Application, Fact, FactGroup, Level, LicenseHit, Status } from "./model";
import { daysUntil, fmtAgo, fmtDay, fmtIn, fmtMonth, fmtStamp, money } from "./time";
import { FileCard, Footer, I, LevelTag, Sample, StatusChip, feeTotal } from "./ui";
import type { Key } from "./i18n";

export const INK = "#3F7FC4";
const LEVELS: Level[] = ["federal", "state", "county", "city"];
const ORDER: Status[] = ["ready", "needs", "draft", "review", "waiting", "todo", "approved"];
const byPriority = (a: Application, b: Application) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || Number(!!b.critical) - Number(!!a.critical);

/* ------------------------------ shared bits ------------------------------ */

function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="ph">
      <div className="ph-tx"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="ph-act">{children}</div>}
    </header>
  );
}

const KIND_ICON = { file: I.form, send: I.message, upload: I.clip };

export function NeedRow({ a }: { a: Approval }) {
  const { b, t, lang, ws, busy, openApproval, openApp } = useApp();
  const app = a.app ? ws.apps.find(x => x.id === a.app) : undefined;
  const fee = app && a.kind === "file" ? feeTotal(app) : 0;
  const Icon = KIND_ICON[a.kind];
  return (
    <div className="need">
      <span className={"need-ico k-" + a.kind}><Icon /></span>
      <span className="need-tx">
        <b>{b(a.title)}</b>
        <span>{[a.agency && b(a.agency), a.kind === "file" && (fee ? money(fee) : t("free"))].filter(Boolean).join(lang === "zh" ? "，" : ", ")}</span>
      </span>
      {a.kind === "upload"
        ? <button type="button" className="btn soft" onClick={() => app && openApp(app.id, "check")} disabled={busy}>{t("addFiles")}</button>
        : <button type="button" className="btn soft" onClick={() => openApproval(a.id)} disabled={busy}>{t("review")}<I.arrow /></button>}
    </div>
  );
}

function AppRow({ a }: { a: Application }) {
  const { b, openApp } = useApp();
  return (
    <button type="button" className={"arow" + (a.critical ? " crit" : "")} onClick={() => openApp(a.id)}>
      <span className="arow-n"><b>{b(a.name)}</b><small>{a.next ? b(a.next) : b(a.agency)}</small></span>
      <StatusChip s={a.status} />
      <span className="achev" aria-hidden="true"><I.chevR /></span>
    </button>
  );
}

/* -------------------------------- overview -------------------------------- */

/** What the agent is doing right now, or the last thing it did, so its work is visible from the workspace too. */
function LiveLine() {
  const { b, lang, ws, busy, live } = useApp();
  const last = ws.audit.find(a => a.actor === "agent");
  if (busy && live) return <p className="liveline on" aria-live="polite"><ThinkingOrb state={live.state} size={20} theme="light" color={INK} aria-hidden="true" /><span>{b(live.label)}…</span>{live.tool && <code>{live.tool}</code>}</p>;
  if (!last) return null;
  return <p className="liveline"><span className="ll-dot" aria-hidden="true" /><span>{b(last.action)}: {b(last.object)}{last.detail ? (lang === "zh" ? `（${b(last.detail)}）` : ` (${b(last.detail)})`) : ""}</span><em>{fmtAgo(last.at, lang)}</em></p>;
}

export function Overview() {
  const { t, b, ws, lang, go, ask, busy } = useApp();
  const n = ws.apps.length;
  const c = (s: Status[]) => ws.apps.filter(a => s.includes(a.status)).length;
  const tiles = [
    { k: "approved", v: c(["approved"]), l: t("st_approved") },
    { k: "agency", v: c(["review"]), l: t("st_agency") },
    { k: "you", v: c(["ready", "needs"]), l: t("st_you") },
    { k: "prep", v: c(["draft"]), l: t("st_prep") },
    { k: "later", v: c(["waiting", "todo"]), l: t("st_later") },
  ];
  const soon = [...ws.deadlines].filter(d => daysUntil(d.date) >= 0).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 4);
  const facts = ws.facts.filter(f => ["f-entity", "f-addr", "f-sell", "f-staff", "f-open"].includes(f.id));
  return (
    <div className="page">
      <header className="ph hero">
        <div className="ph-tx">
          <p className="eyebrow"><Sample />{b(ws.business)}<span aria-hidden="true" className="sep" />{b(ws.locations[0].name)}</p>
          <h1>{t("ov_title", { n })}</h1>
          <p>{t("ov_sub", { biz: b(ws.business), place: b(ws.locations[0].name), goal: b(ws.goal) })}</p>
          <LiveLine />
        </div>
      </header>

      <section className="stats" aria-label={t("nav_apps")}>
        {tiles.map(x => (
          <button key={x.k} type="button" className={"stat s-" + x.k} onClick={() => go("apps")}>
            <b>{x.v}</b><span>{x.l}</span>
          </button>
        ))}
        <div className="statbar" aria-hidden="true">{tiles.map(x => <i key={x.k} className={"s-" + x.k} style={{ flexGrow: x.v }} />)}</div>
      </section>

      <div className="split">
        <div className="maincol">
          <section className="sec">
            <h2 className="h2">{t("needsYou")}{ws.approvals.length > 0 && <em className="count">{ws.approvals.length}</em>}</h2>
            {ws.approvals.length ? <div className="needs">{ws.approvals.map(a => <NeedRow key={a.id} a={a} />)}</div> : <p className="quiet">{t("allClear")}</p>}
          </section>
          <section className="sec">
            <div className="h2row"><h2 className="h2">{t("nav_apps")}</h2><button type="button" className="link" onClick={() => go("apps")}>{t("viewAll")}<I.chevR /></button></div>
            <div className="card list">{[...ws.apps].sort(byPriority).slice(0, 7).map(a => <AppRow key={a.id} a={a} />)}</div>
          </section>
        </div>

        <aside className="sidecol">
          {ws.nudges.length > 0 && (
            <section className="sec">
              <h2 className="h2">{t("fromPlacetta")}</h2>
              <div className="nudges">
                {ws.nudges.map(x => (
                  <div key={x.id} className={"nudge " + x.tone}>
                    <p>{b(x.text)}{x.sample && <> <Sample /></>}</p>
                    <button type="button" className="link" disabled={busy} onClick={() => ask(b(x.prompt))}>{b(x.ask)}<I.arrow /></button>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="sec">
            <div className="h2row"><h2 className="h2">{t("comingUp")}</h2><button type="button" className="link" onClick={() => go("deadlines")}>{t("viewAll")}<I.chevR /></button></div>
            <ul className="card soon">
              {soon.map(d => {
                const n = daysUntil(d.date);
                return (
                  <li key={d.id}>
                    <span className="soon-d"><b>{fmtDay(d.date, lang)}</b><em className={n <= 7 ? "hot" : ""}>{fmtIn(n, lang)}</em></span>
                    <span className="soon-t">{b(d.title)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="sec">
            <div className="h2row"><h2 className="h2">{t("whatIKnow")}</h2><button type="button" className="link" onClick={() => go("context")}>{t("edit")}<I.chevR /></button></div>
            <dl className="card kv">{facts.map(f => <div key={f.id}><dt>{b(f.label)}</dt><dd>{b(f.value)}</dd></div>)}</dl>
          </section>
          <section className="sec">
            <h2 className="h2">{t("running")}</h2>
            <ul className="runs">
              {ws.running.map(r => (
                <li key={r.id}><ThinkingOrb state={r.state} size={20} theme="light" color={INK} aria-label={b(r.label)} /><span>{b(r.label)}</span>{r.detail && <small>{b(r.detail)}</small>}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <section className="sec">
        <div className="h2row"><h2 className="h2">{t("recentDocs")}</h2><button type="button" className="link" onClick={() => go("docs")}>{t("viewAll")}<I.chevR /></button></div>
        <div className="files">{ws.docs.slice(0, 4).map(d => <FileCard key={d.id} d={d} />)}</div>
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
              <div className="tg-h"><LevelTag l={l} /><span>{rows.length}</span></div>
              {rows.map(a => {
                const fee = feeTotal(a);
                return (
                  <button type="button" key={a.id} className={"tr" + (a.critical ? " crit" : "")} onClick={() => openApp(a.id)} role="row">
                    <span className="c-name"><b>{b(a.name)}</b><small>{b(a.agency)}</small><small className="c-est2">{b(a.est)}</small></span>
                    <span className="c-st"><StatusChip s={a.status} /></span>
                    <span className="c-fee">{fee ? money(fee) : t("free")}</span>
                    <span className="c-est">{b(a.est)}</span>
                    <span className="c-next">{a.critical && <em>{t("critical")}</em>}{a.next ? b(a.next) : ""}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="note">{t("estimates")}</p>
      <Footer />
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
        <button type="button" className="btn ink" disabled={busy} onClick={() => input.current?.click()}><I.upload />{t("upload")}</button>
        <input ref={input} type="file" multiple hidden onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; if (fs.length) upload("", "", fs); }} />
      </PageHead>
      <div className="chips" role="group">
        {chips.map(c => <button key={c.k} type="button" aria-pressed={f === c.k} onClick={() => setF(c.k)}>{t(c.l)}<span>{c.k === "all" ? ws.docs.length : ws.docs.filter(d => d.by === c.k).length}</span></button>)}
      </div>
      <div className="files grid">{docs.map(d => <FileCard key={d.id} d={d} />)}</div>
      <Footer />
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
      <div className="timeline">
        {months.map(([k, ds]) => (
          <section key={k} className="tl-m">
            <h2 className="h2">{fmtMonth(k + "-01", lang)}</h2>
            <ol>
              {ds.map(d => {
                const n = daysUntil(d.date);
                const day = new Date(d.date + "T12:00:00");
                return (
                  <li key={d.id} className={"tl k-" + d.kind}>
                    <span className="tl-date"><b>{day.getDate()}</b><small>{day.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { weekday: "short" })}</small></span>
                    <span className="tl-body">
                      <b>{b(d.title)}</b>
                      <span><em className="kind">{t(("k_" + d.kind) as Key)}</em>{d.agency && <em>{b(d.agency)}</em>}</span>
                    </span>
                    <span className="tl-act">
                      <em className={"in" + (n <= 7 ? " hot" : "")}>{fmtIn(n, lang)}</em>
                      {d.prompt && d.ask ? <button type="button" className="btn soft sm" disabled={busy} onClick={() => ask(b(d.prompt!))}>{b(d.ask)}</button>
                        : d.app ? <button type="button" className="btn ghost sm" onClick={() => openApp(d.app!)}>{t("open")}</button> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
      <p className="note">{t("estimates")}</p>
      <Footer />
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
        <button type="button" className="btn ink" onClick={exportAudit}><I.download />{t("exportCsv")}</button>
      </PageHead>
      <div className="chips" role="group">
        {chips.map(c => <button key={c.k} type="button" aria-pressed={f === c.k} onClick={() => setF(c.k)}>{t(c.l)}<span>{c.k === "all" ? ws.audit.length : ws.audit.filter(a => a.actor === c.k).length}</span></button>)}
      </div>
      <div className="table audit-t" role="table">
        <div className="tr th" role="row"><span>{t("au_time")}</span><span>{t("au_who")}</span><span>{t("au_action")}</span><span>{t("au_object")}</span><span>{t("au_detail")}</span></div>
        {rows.map(a => (
          <div key={a.id} className="tr" role="row">
            <span className="c-time">{fmtStamp(a.at)}</span>
            <span className={"c-who by-" + a.actor}><i aria-hidden="true" />{a.actor === "agency" && a.who ? b(a.who) : t(("actor_" + a.actor) as Key)}</span>
            <span className="c-act">{b(a.action)}</span>
            <span className="c-obj">{b(a.object)}</span>
            <span className="c-det">{a.detail ? b(a.detail) : ""}</span>
          </div>
        ))}
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
    <div className="fact">
      <dt>{b(f.label)}</dt>
      <dd>
        {edit ? (
          <form className="fact-edit" onSubmit={e => { e.preventDefault(); save(); }}>
            <input autoFocus value={v} onChange={e => setV(e.target.value)} aria-label={b(f.label)} onKeyDown={e => { if (e.key === "Escape") setEdit(false); }} />
            <button type="submit" className="btn ink sm">{t("save")}</button>
            <button type="button" className="btn ghost sm" onClick={() => setEdit(false)}>{t("cancel")}</button>
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
          <h2 className="h2">{t(("g_" + g) as Key)}</h2>
          <dl className="card facts">{ws.facts.filter(f => f.group === g).map(f => <FactRow key={f.id} f={f} />)}</dl>
        </section>
      ))}
      <Footer />
    </div>
  );
}

/* ------------------------------ find licenses ------------------------------ */

export function FindLicenses({ result, live }: { result: { what: string; where: string; hits: LicenseHit[] } | null; live: string | null }) {
  const { t, b, lang, run, busy, openApp, ask } = useApp();
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
        <label><span>{t("fd_where")}</span><input value={where} onChange={e => setWhere(e.target.value)} placeholder={t("fd_wherePh")} /></label>
        <button type="submit" className="btn ink lg" disabled={busy}><I.find />{t("fd_go")}</button>
      </form>
      <div className="examples"><span>{t("fd_try")}</span>{examples.map(([w, p]) => <button key={w + p} type="button" disabled={busy} onClick={() => go(w, p)}>{w}, {p}</button>)}</div>

      {live && (
        <div className="matching" aria-live="polite">
          <ThinkingOrb state="searching" size={20} theme="light" color={INK} aria-label={live} />
          <span>{live}</span>
        </div>
      )}

      {result && !live && (
        <section className="results">
          <div className="h2row"><h2 className="h2">{t("fd_found", { n: result.hits.length })}<span className="for">{result.what}, {result.where}</span></h2>
            {isFremont && <button type="button" className="btn soft" disabled={busy} onClick={() => ask(lang === "zh" ? "在弗里蒙特开第二家店" : "Add a second shop in Fremont")}>{t("fd_addAll")}<I.arrow /></button>}
          </div>
          {LEVELS.map(l => {
            const hits = result.hits.filter(h => h.level === l);
            if (!hits.length) return null;
            return (
              <div key={l} className="card hits">
                <div className="tg-h"><LevelTag l={l} /><span>{hits.length}</span></div>
                {hits.map((h, i) => (
                  <div key={i} className="hit">
                    <span className="hit-n"><b>{b(h.name)}</b><small>{b(h.agency)}</small><small className="hit-e2">{b(h.est)}</small></span>
                    <span className="hit-f">{b(h.fee)}</span>
                    <span className="hit-e">{b(h.est)}</span>
                    <span className="hit-s">{h.source.url ? <a href={h.source.url} target="_blank" rel="noopener noreferrer">{h.source.label}<I.ext /></a> : <em>{t("fd_check")}</em>}</span>
                    <span className="hit-a">
                      {h.have ? <button type="button" className="btn ghost sm" onClick={() => openApp(h.have!)}><I.check />{t("fd_have")}</button>
                        : h.carry ? <em className="carry">{t("fd_carry")}</em>
                          : /Statement of Information/.test(h.name.en) ? <button type="button" className="btn soft sm" disabled={busy} onClick={() => ask(lang === "zh" ? "准备信息声明" : "Prepare the Statement of Information")}><I.plus />{t("fd_add")}</button> : null}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
          <p className="note">{t("estimates")}</p>
        </section>
      )}
      <Footer />
    </div>
  );
}

/* -------------------------------- settings -------------------------------- */

export function Settings() {
  const { t, b, ws } = useApp();
  return (
    <div className="page narrow">
      <PageHead title={t("nav_settings")} sub={t("set_sub")} />
      <section className="sec">
        <h2 className="h2">{t("set_rules")}</h2>
        <ul className="card rules">
          {(["set_rule1", "set_rule2", "set_rule3"] as Key[]).map(k => <li key={k}><span>{t(k)}</span><em><I.lock />{t("alwaysOn")}</em></li>)}
        </ul>
        <p className="note">{t("set_ruleNote")}</p>
      </section>
      <section className="sec">
        <h2 className="h2">{t("set_conn")}</h2>
        <ul className="card conns">
          {ws.connections.map(c => (
            <li key={c.id}>
              <LevelTag l={c.level} />
              <span className="conn-tx"><b>{b(c.name)}</b><small>{b(c.detail)}</small></span>
              {c.state === "connected" ? <em className="ok"><i />{t("connected")}</em> : <button type="button" className="btn soft sm">{t("connect")}</button>}
            </li>
          ))}
        </ul>
      </section>
      <Footer />
    </div>
  );
}
