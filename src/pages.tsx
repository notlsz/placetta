import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { useApp, type PermitsTab, type View } from "./ctx";
import type { Approval, Application, Fact, FactGroup, Level, LicenseHit, Status } from "./model";
import { daysFromNow, daysUntil, fmtAgo, fmtDay, fmtIn, fmtMonth, fmtStamp, money } from "./time";
import { FileCard, Footer, I, Modal, Pill, StatusChip, feeText, feeTotal } from "./ui";
import { openingPath, preflight } from "./smart";
import { readyToFile } from "./core";
import { formById } from "./forms/registry";
import type { Key } from "./i18n";
import { AgentBot, TaskBot, Working } from "./Bot";
import { taskVerb } from "./tasks";
import { StoresStrip } from "./Stores";
import { B, type Bi } from "./model";
import { takeAutostart } from "./cloud/handoff";
import { nextAction, nextRun } from "./jobs";
import { PlanCard } from "./Work";
import { hrefOf, plainClick } from "./route";

export const INK = "#4D73A3";
const LEVELS: Level[] = ["federal", "state", "county", "city"];
const ORDER: Status[] = ["ready", "needs", "draft", "review", "filing", "waiting", "todo", "approved"];
const byPriority = (a: Application, b: Application) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || Number(!!b.critical) - Number(!!a.critical);
/** Permits that are done with you for now: with the agency, with the team, or issued. */
const FILED: Status[] = ["review", "filing", "approved"];

/* A permit the instant plan listed from Placetta's registry at sign-up (src/plan/preview.ts): shown with a note until
   Odelia verifies it with the agency. */
const isPreview = (a: Application) => a.preview === true;

/* ------------------------------ shared bits ------------------------------ */

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
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

/** A page's tabs: real links (bookmark, open in a new tab), handled in place on a plain click. */
export function Tabs({ view, tabs, current }: { view: View; tabs: { id: string; label: string; count?: number }[]; current: string }) {
  const { go } = useApp();
  return (
    <nav className="ptabs" role="tablist">
      {tabs.map(x => (
        <a key={x.id} role="tab" href={hrefOf(view, x.id)} aria-selected={x.id === current} aria-current={x.id === current ? "page" : undefined}
          onClick={e => { if (!plainClick(e)) return; e.preventDefault(); go(view, x.id); }}>
          {x.label}{x.count ? <span>{x.count}</span> : null}
        </a>
      ))}
    </nav>
  );
}

const KIND_ICON = { file: I.form, send: I.message, upload: I.clip, pay: I.card, change: I.pencil };

/** Something only you can do: frosted, with the one action it needs. */
/**
 * Approval fatigue is how a rubber stamp starts. Filings that passed every check (complete, no line flagged, no
 * signature to draw) can be approved together, from one list that still names each one and its fee. Anything with a
 * flag, a signature or a payment stays one at a time.
 */
function BatchApprove() {
  const { b, lang, ws, busy, approve, cloud } = useApp();
  const [open, setOpen] = useState(false);
  const [going, setGoing] = useState(false);
  const zh = lang === "zh";
  const today = new Date().toISOString().slice(0, 10);
  const clean = ws.approvals.filter(a => {
    if (a.kind !== "file") return false;
    const app = ws.apps.find(x => x.id === a.app);
    if (!app || !readyToFile(app)) return false;
    const off = app.official ? formById(app.official) : undefined;
    if (cloud && off?.sign && off.esign) return false;
    const pf = preflight(ws, a, today);
    return !pf.errors.length && !pf.warnings.length;
  });
  if (clean.length < 2 || (cloud && cloud.plan !== "monthly")) return null;
  const go = async () => { setGoing(true); try { for (const a of clean) await approve(a.id); } finally { setGoing(false); setOpen(false); } };
  return (
    <>
      <div className="batch-row">
        <span>{zh ? `${clean.length} 份申请已通过全部核对，没有需要留意的地方。` : `${clean.length} filings passed every check with nothing flagged.`}</span>
        <Pill disabled={busy} sm onClick={() => setOpen(true)}>{zh ? `一起批准 ${clean.length} 份` : `Approve ${clean.length} together`}</Pill>
      </div>
      {open && (
        <Modal label={zh ? "一起批准" : "Approve together"} onClose={() => setOpen(false)}>
          <header className="m-h"><h2>{zh ? `批准 ${clean.length} 份申请` : `Approve ${clean.length} filings`}</h2><p>{zh ? "每份都已逐项核对。批准后交由快哉团队提交，机构费用由您直接支付。" : "Each was checked line by line. Once approved, Placetta's team files them; agency fees are paid by you directly."}</p></header>
          <div className="m-body">
            <ol className="batch-list">{clean.map(a => { const app = ws.apps.find(x => x.id === a.app)!; return <li key={a.id}><b>{b(a.title)}</b>{a.agency ? `, ${b(a.agency)}` : ""}. {feeTotal(app) ? money(feeTotal(app), app.currency) : zh ? "无费用" : "No fee"}</li>; })}</ol>
          </div>
          <footer className="m-f"><div className="m-btns">
            <button type="button" className="pill quiet" onClick={() => setOpen(false)}>{zh ? "逐份查看" : "Review one by one"}</button>
            <Pill kind="ink" disabled={busy || going} onClick={() => void go()}>{zh ? "全部批准" : "Approve all"}</Pill>
          </div></footer>
        </Modal>
      )}
    </>
  );
}

/** One thing only you can do, with its one tap: Approve opens the approval (you confirm there), Upload opens the file
 *  picker on the first missing document, Pay opens the agency's page. */
export function NeedRow({ a, compact }: { a: Approval; compact?: boolean }) {
  const { b, t, lang, ws, busy, openApproval, openApp, approve, upload, cloud } = useApp();
  const pick = useRef<HTMLInputElement>(null);
  const app = a.app ? ws.apps.find(x => x.id === a.app) : undefined;
  const fee = a.kind === "pay" ? a.fee ?? 0 : app && a.kind === "file" ? feeTotal(app) : 0;
  const Icon = KIND_ICON[a.kind];
  const sub = [a.agency && b(a.agency), (a.kind === "file" || a.kind === "pay") && (a.kind === "file" && app ? feeText(app, t) : fee ? money(fee) : t("free"))].filter(Boolean).join(lang === "zh" ? "，" : ", ");
  // the document this upload is for: the first one still missing on the permit (the checklist in the drawer otherwise)
  const missing = app?.checklist.find(c => c.state === "missing" && !c.dep);
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
      {a.kind === "upload" ? (
        <>
          <input ref={pick} type="file" hidden multiple onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (app && missing && f.length) upload(app.id, missing.id, f); }} />
          <Pill onClick={() => (app && missing ? pick.current?.click() : app && openApp(app.id, "check"))} disabled={busy} sm={compact}>{t("upload")}</Pill>
        </>
      ) : <Pill onClick={() => openApproval(a.id)} disabled={busy} sm={compact}>{t("approve")}</Pill>}
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
  if (busy && live) return <Working on size="line"><p className="liveline on" aria-live="polite"><ThinkingOrb state={live.state} size={20} theme="light" color={INK} aria-hidden="true" /><b className="ll-verb">{b(taskVerb(live.state))}…</b><span>{b(live.label)}</span>{live.tool && <em className="site">{live.tool}</em>}</p></Working>;
  if (!last) return null;
  return <p className="liveline"><span className="ll-dot" aria-hidden="true" /><span>{b(last.action)}: {b(last.object)}</span><em>{fmtAgo(last.at, lang)}</em></p>;
}

/* -------------------------------- overview -------------------------------- */

function Welcome() {
  const { t, b, ws, ask, busy, cloud, mode, go } = useApp();
  const place = ws.meta?.city ?? (ws.locations[0] ? b(ws.locations[0].name) : "");
  const what = ws.meta?.what ?? "";
  const ops = /importer|seller|warehouse|3pl/i.test(what);
  const whatZh = ({ "Importer or online seller": "进口商或电商卖家", "Warehouse or 3PL": "仓库或第三方物流" } as Record<string, string>)[what] ?? what;
  const start = () => ask(b(B(`Map every license, permit and registration ${b(ws.business)} needs ${ops ? `to operate${place ? ` in ${place}` : ""} as ${/^[aeiou]/i.test(what) ? "an" : "a"} ${what.toLowerCase()}` : `to open its store${place ? ` in ${place}` : ""}${what ? `, which sells ${what.charAt(0).toLowerCase() + what.slice(1)}` : ""}`}. Use the agencies' official forms. Prepare an application for each one, fill what you can from my business facts, and tell me what you need from me.`, `梳理${b(ws.business)}${place ? `在${place}` : ""}${ops ? `以${whatZh}身份经营` : what ? `开设${what}` : "开店"}所需的全部执照、许可和登记，使用各机构的官方表格，为每一项准备申请，用资料填写能填的内容，并告诉我还需要我提供什么。`)));
  // Came from the website's "Get my plan": start mapping as soon as the agent is ready, once.
  useEffect(() => { if (cloud && mode === "server" && cloud.plan !== "none" && takeAutostart()) setTimeout(start, 0); }, [mode]);   // after this commit, once the agent is wired up // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="page home">
      <header className="hero">
        <div className="hero-bot"><AgentBot size={96} busy={busy} /></div>
        <h1>{b(B(`Let's get ${b(ws.business)} licensed.`, `一起为${b(ws.business)}办齐执照。`))}</h1>
        <p className="lede">{b(B("Placetta maps every license your store needs, in order, from the city to the national government, and prepares each application. You approve; our team files.", "快哉按顺序梳理门店从市级到国家所需的全部执照，并准备好每一份申请。您批准，团队提交。"))}</p>
        <div className="hero-act">
          {cloud && cloud.plan === "none"
            ? <Pill kind="ink" onClick={() => cloud.openPlans("start")}>{b(B("Get your entry plan, $299", "开通开店计划，$299"))}</Pill>
            : <Pill kind="ink" disabled={busy} onClick={start}>{b(B("Map my licenses", "梳理我的执照"))}</Pill>}
          <button type="button" className="pill quiet" onClick={() => go("find")}><I.find />{t("nav_find")}</button>
        </div>
        {cloud && cloud.plan === "none" && <p className="ctx">{b(B("One market, one time. Credited toward your first year if you start a plan within 60 days.", "每个市场一次性付费；60 天内开通套餐可抵扣首年费用。"))}</p>}
      </header>
      <Footer />
    </div>
  );
}

/** Home answers three questions at a glance, in this order: what needs me, what is Odelia doing, what's next. A section
 *  shows only when it has something to say. */
export function Overview() {
  const { t, b, ws, lang, go, ask, busy, live, updates, queued } = useApp();
  const n = ws.apps.length;
  if (!n) return <Welcome />;
  const c = (s: Status[]) => ws.apps.filter(a => s.includes(a.status)).length;
  const approved = c(["approved"]), agency = c(["review", "filing"]), you = c(["ready", "needs"]);
  const today = daysFromNow(0);
  const zh = lang === "zh";

  /* 1. Needs you: every approval, and every job stuck on you that no approval row already covers */
  const jobs = ws.jobs ?? [];
  const waitingJobs = jobs.filter(j => j.status === "waiting").filter(j => {
    const act = nextAction(ws, j);
    if (!act || act.who !== "you") return true;
    if (act.kind === "approve") return !ws.approvals.some(a => a.id === act.id);
    return !ws.approvals.some(a => a.kind === "upload" && a.app === act.app);
  });
  const needs = ws.approvals.length + waitingJobs.length;

  /* 2. Odelia is working on: running jobs with their live plan, background watchers, what's queued, and the routines */
  const running = jobs.filter(j => j.status === "running");
  const routines = ws.routines ?? [], active = routines.filter(r => !r.paused);
  const nextRoutine = active.map(r => nextRun(r, today)).filter((d): d is string => !!d).sort()[0];
  const routineLine = !routines.length ? "" : !active.length ? t("hm_routinesPaused", { n: routines.length })
    : t(routines.length === 1 ? "hm_routines1" : "hm_routinesN", { n: routines.length, d: nextRoutine ? fmtDay(nextRoutine, lang) : "" });
  const working = running.length > 0 || ws.running.length > 0 || queued.length > 0 || routines.length > 0 || (busy && !!live);

  /* 3. The opening plan: the count, where it stands, when it lands, and the next permits in order */
  const fp = ws.firstPlan;
  const previews = ws.apps.filter(isPreview).length;
  const landing = fp?.projectedOpen
    ?? (ws.stores ?? []).filter(s => s.stage === "opening").map(s => openingPath(s, ws, today).landing).filter((d): d is string => !!d).sort().at(-1) ?? null;
  const nextUp = [...ws.apps].filter(a => a.status !== "approved").sort(byPriority).slice(0, 3);

  /* the line under the title: the business, its place (unless the name already says it) and the goal, whichever exist */
  const biz = b(ws.business), place = ws.locations[0] ? b(ws.locations[0].name) : "", goal = b(ws.goal);
  const ctxParts = [place && !biz.includes(place) ? t("ov_in", { biz, place }) : biz, goal].filter(Boolean);
  const ctxLine = ctxParts.length ? ctxParts.join(zh ? "。" : ". ") + (zh ? "。" : ".") : "";

  /* 4 and 5. Coming up, and the latest updates */
  const soon = [...ws.deadlines].filter(d => daysUntil(d.date) >= 0).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 5);
  const latest = updates.slice(0, 3);

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
        {ctxLine && <p className="ctx">{ctxLine}</p>}
        <LiveLine />
      </header>

      {needs > 0 && (
        <section className="sec hm-needs">
          <SecHead title={t("needsYou")} count={needs} />
          <BatchApprove />
          <div className="stack">
            {ws.approvals.map(a => <NeedRow key={a.id} a={a} />)}
            {waitingJobs.map(j => <PlanCard key={j.id} job={j} compact actions />)}
          </div>
        </section>
      )}

      {working && (
        <section className="sec hm-work">
          <SecHead title={t("hm_working")} more={t("nav_work")} onMore={() => go("odelia", "work")} />
          {running.map(j => <PlanCard key={j.id} job={j} compact />)}
          {(ws.running.length > 0 || queued.length > 0 || routineLine) && (
            <ul className="tray runs">
              {ws.running.map(r => (
                <li key={r.id} className="row"><TaskBot id={r.id} label={b(r.label)} /><span>{b(r.label)}{r.detail && <small>{b(r.detail)}</small>}</span></li>
              ))}
              {queued.length > 0 && <li className="row rt-line"><span className="rt-ico" aria-hidden="true"><I.queue /></span><span>{zh ? `${queued.length} 项排队中，当前任务完成后开始` : `${queued.length} waiting in line, next when she finishes`}</span></li>}
              {routineLine && <li className="row rt-line"><span className="rt-ico" aria-hidden="true"><I.deadlines /></span><button type="button" className="lnk" onClick={() => go("odelia", "work")}>{routineLine}</button></li>}
            </ul>
          )}
        </section>
      )}

      <section className="sec hm-plan">
        <SecHead title={t("hm_plan")} more={t("nav_apps")} onMore={() => go("permits")} />
        <div className="plan-card">
          <p className="plan-sum">{t(n === 1 ? "hm_plan1" : "hm_planN", { n, a: approved, r: agency, t: n - approved - agency })}</p>
          {landing && <p className="plan-open"><I.deadlines />{t("hm_open", { d: fmtDay(landing, lang, true) })}</p>}
          {nextUp.length > 0 && (
            <>
              <p className="plan-h">{t("hm_next")}</p>
              <ol className="plan-next">
                {nextUp.map((a, i) => (
                  <li key={a.id}>
                    <span className="plan-n">{i + 1}</span>
                    <AppRow a={a} />
                  </li>
                ))}
              </ol>
            </>
          )}
          {previews > 0 && <p className="plan-note"><I.spark />{t("hm_preview")}</p>}
          <div className="plan-act">
            <button type="button" className="pill quiet sm" onClick={() => go("permits")}>{t("viewAll")}<I.chevR /></button>
            <button type="button" className="pill quiet sm" onClick={() => go("find")}><I.find />{t("nav_find")}</button>
          </div>
        </div>
      </section>

      {(ws.stores ?? []).length > 0 && (
        <section className="sec">
          <SecHead title={t("nav_stores")} more={t("viewAll")} onMore={() => go("stores")} />
          <StoresStrip onOpen={() => go("stores")} />
        </section>
      )}

      {soon.length > 0 && (
        <section className="sec">
          <SecHead title={t("comingUp")} more={t("viewAll")} onMore={() => go("permits", "deadlines")} />
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
      )}

      {(latest.length > 0 || ws.nudges.length > 0) && (
        <section className="sec">
          <SecHead title={t("hm_updates")} more={t("hm_seeAll")} onMore={() => go("odelia", "updates")} />
          {ws.nudges.length > 0 && (
            <div className="notes">
              {ws.nudges.map(x => (
                <div key={x.id} className="note-card">
                  <span className="nc-ico"><I.spark /></span>
                  <p>{b(x.text)}{x.sample && <em className="sample">{t("sampleTag")}</em>}</p>
                  <button type="button" className="pill quiet sm" disabled={busy} onClick={() => ask(b(x.prompt))}>{b(x.ask)}</button>
                </div>
              ))}
            </div>
          )}
          {latest.length > 0 && <UpdateList items={latest} />}
        </section>
      )}
      <Footer />
    </div>
  );
}

/* --------------------------------- permits --------------------------------- */

/** Permits: one page for everything you file. To do (yours and Odelia's to finish), Filed (with an agency, the team or
 *  issued), the documents behind them and the dates they set. Find licenses is a button here, not a place of its own. */
export function Permits({ tab }: { tab: PermitsTab }) {
  const { t, ws, go } = useApp();
  const todo = ws.apps.filter(a => !FILED.includes(a.status)), filed = ws.apps.filter(a => FILED.includes(a.status));
  const soon = ws.deadlines.filter(d => { const k = daysUntil(d.date); return k >= 0 && k <= 30; }).length;
  const tabs = [
    { id: "todo", label: t("nav_todo"), count: todo.length }, { id: "filed", label: t("nav_filed"), count: filed.length },
    { id: "documents", label: t("nav_docs"), count: ws.docs.length }, { id: "deadlines", label: t("nav_deadlines"), count: soon },
  ];
  const sub = tab === "documents" ? t("docs_sub") : tab === "deadlines" ? t("dl_sub") : t("apps_sub");
  return (
    <div className="page permits">
      <PageHead title={t("nav_apps")} sub={sub}>
        <button type="button" className="pill quiet" onClick={() => go("find")}><I.find />{t("nav_find")}</button>
      </PageHead>
      <Tabs view="permits" tabs={tabs} current={tab} />
      {tab === "todo" && <PermitTable rows={todo} empty={t("allClear")} />}
      {tab === "filed" && <PermitTable rows={filed} empty={t("empty")} />}
      {tab === "documents" && <Documents />}
      {tab === "deadlines" && <Deadlines />}
    </div>
  );
}

function PermitTable({ rows: list, empty }: { rows: Application[]; empty: string }) {
  const { t, b, openApp } = useApp();
  if (!list.length) return <p className="quiet tab-empty">{empty}</p>;
  return (
    <>
      {list.some(isPreview) && <p className="prev-note"><I.spark />{t("hm_preview")}</p>}
      <div className="table apps-t" role="table">
        <div className="tr th" role="row"><span>{t("th_app")}</span><span>{t("th_status")}</span><span>{t("th_fee")}</span><span>{t("th_takes")}</span><span>{t("th_next")}</span></div>
        {LEVELS.map(l => {
          const rows = list.filter(a => a.level === l);
          if (!rows.length) return null;
          return (
            <div key={l} role="rowgroup" className="tgroup">
              <p className="tg-h">{t(("lv_" + l) as Key)}<span>{rows.length}</span></p>
              <div className="tray">
                {rows.map(a => {
                  return (
                    <Working key={a.id} on={a.status === "draft"} size="line">
                    <button type="button" className={"tr row" + (a.critical ? " crit" : "")} onClick={() => openApp(a.id)} role="row">
                      <span className="c-name"><b>{b(a.name)}</b><small>{b(a.agency)}</small><small className="c-est2">{b(a.est)}</small>{isPreview(a) && <small className="c-prev">{t("prevTag")}</small>}</span>
                      <span className="c-st"><StatusChip s={a.status} /></span>
                      <span className="c-fee">{feeText(a, t)}</span>
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
    </>
  );
}

/* -------------------------------- documents -------------------------------- */

/** The Documents tab of Permits. */
export function Documents() {
  const { t, b, ws, upload, busy, ask, mode } = useApp();
  const [f, setF] = useState<"all" | "you" | "agent" | "agency">("all");
  const input = useRef<HTMLInputElement>(null);
  const docs = ws.docs.filter(d => f === "all" || d.by === f);
  const chips: { k: typeof f; l: Key }[] = [{ k: "all", l: "f_all" }, { k: "you", l: "f_you" }, { k: "agent", l: "f_agent" }, { k: "agency", l: "f_agency" }];
  return (
    <div className="tabbed">
      <div className="tab-bar">
        <div className="seg" role="group">
          {chips.map(c => <button key={c.k} type="button" aria-pressed={f === c.k} onClick={() => setF(c.k)}>{t(c.l)}<span>{c.k === "all" ? ws.docs.length : ws.docs.filter(d => d.by === c.k).length}</span></button>)}
        </div>
        <div className="tab-act">
          {mode !== "demo" && ws.docs.some(d => d.by !== "agent") && <Pill kind="quiet" disabled={busy} onClick={() => ask(b(B("Review my documents: list each license, permit and certificate with its number and expiry, and set up renewal reminders.", "审阅我的文件：列出每项执照、许可和证书的编号与到期日，并设置续期提醒。")))}>{b(B("Review with Placetta", "让快哉审阅"))}</Pill>}
          <button type="button" className="pill ink" disabled={busy} onClick={() => input.current?.click()}><I.upload />{t("upload")}</button>
          <input ref={input} type="file" multiple hidden onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; if (fs.length) upload("", "", fs); }} />
        </div>
      </div>
      {docs.length ? <div className="files grid">{docs.map(d => <FileCard key={d.id} d={d} />)}</div> : <p className="quiet tab-empty">{t("empty")}</p>}
    </div>
  );
}

/* -------------------------------- deadlines -------------------------------- */

/** The Deadlines tab of Permits. */
export function Deadlines() {
  const { t, b, ws, lang, ask, openApp, busy } = useApp();
  const list = [...ws.deadlines].sort((x, y) => x.date.localeCompare(y.date));
  const months = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const d of list) { const k = d.date.slice(0, 7); m.set(k, [...(m.get(k) ?? []), d]); }
    return [...m.entries()];
  }, [list]);
  if (!months.length) return <p className="quiet tab-empty">{t("empty")}</p>;
  return (
    <div className="tabbed">
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

/* --------------------------------- updates --------------------------------- */

const UPDATE_KIND: Record<string, { label: { en: string; zh: string }; Icon: () => React.ReactElement }> = {
  deadline: { label: B("Deadline", "截止日期"), Icon: I.deadlines }, renewal: { label: B("Renewal", "续期"), Icon: I.deadlines },
  filing: { label: B("Filing", "申报"), Icon: I.apps }, payment: { label: B("Payment", "付款"), Icon: I.card }, team: { label: B("Team", "团队"), Icon: I.user },
  mail: { label: B("Reply", "回复"), Icon: I.message },
  purchase: { label: B("Purchase", "购买"), Icon: I.card },
};

/** Updates as rows: each one opens the permit or hands it to Odelia. Home shows the latest few; the Updates tab, all. */
function UpdateList({ items }: { items: import("./model").UpdateItem[] }) {
  const { b, lang, openApp, ask, ws } = useApp();
  return (
    <ul className="updates">
      {items.map(u => {
        const k = UPDATE_KIND[u.kind] ?? UPDATE_KIND.team, app = u.app ? ws.apps.find(a => a.id === u.app) : undefined;
        return (
          <li key={u.id} className={"upd k-" + u.kind + (u.read ? "" : " unread")}>
            <span className="upd-ic" aria-hidden="true"><k.Icon /></span>
            <div className="upd-tx">
              <p className="upd-t">{b(u.title)}</p>
              {u.body && <p className="upd-b">{b(u.body)}</p>}
              <p className="upd-m"><span>{b(k.label)}</span><span>{fmtAgo(u.at, lang)}</span>{!u.read && <em>{b(B("New", "新"))}</em>}</p>
            </div>
            <div className="upd-act">
              {app && <button type="button" className="sbtn quiet" onClick={() => openApp(app.id)}>{b(B("Open", "打开"))}</button>}
              {u.prompt && <button type="button" className="sbtn ink" onClick={() => ask(b(u.prompt!))}>{b(B("Handle it", "去处理"))}</button>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The inbox, the Updates tab of Odelia's page: what changed and what's coming up, found by the daily monitor. */
export function UpdatesPage() {
  const { b, updates, readUpdates, cloud } = useApp();
  const unread = updates.filter(u => !u.read).length;
  // seen once the page has been open a moment
  useEffect(() => { if (!unread) return; const id = setTimeout(readUpdates, 1500); return () => clearTimeout(id); }, [unread, readUpdates]);
  return (
    <div className="tabbed">
      <p className="tab-lede">{b(cloud
        ? B("Placetta checks every morning for filing changes, deadlines and renewals, and emails the owners when something needs them.", "快哉每天早上检查申报进展、截止日期和续期，有需要处理的事项时会发邮件通知所有者。")
        : B("What changed and what's coming up, checked every morning.", "每天早上检查的最新进展和即将到来的事项。"))}</p>
      {updates.length === 0 ? (
        <div className="empty-up"><p>{b(B("Nothing new. Deadlines, renewals and filing changes show up here as they happen.", "暂无新动态。截止日期、续期和申报进展会在发生时显示在这里。"))}</p></div>
      ) : <UpdateList items={updates} />}
      <Footer />
    </div>
  );
}

/** Activity (Settings): every action by Placetta, you and the agencies, with the time. */
export function AuditTrail() {
  const { t, b, ws, exportAudit } = useApp();
  const [f, setF] = useState<"all" | "agent" | "you" | "agency">("all");
  const rows = ws.audit.filter(a => f === "all" || a.actor === f);
  const chips: { k: typeof f; l: Key }[] = [{ k: "all", l: "f_all" }, { k: "agent", l: "actor_agent" }, { k: "you", l: "actor_you" }, { k: "agency", l: "f_agency" }];
  return (
    <section className="sg embed" id="set-activity" aria-labelledby="set-activity-h">
      <header className="embed-h">
        <div><h2 id="set-activity-h">{t("nav_audit")}</h2><p>{t("au_sub")}</p></div>
        <Pill kind="ink" onClick={exportAudit}>{t("exportCsv")}</Pill>
      </header>
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
    </section>
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

/** Business facts (Settings): what Placetta knows about the business, and fills every form from. */
export function ContextPage() {
  const { t, ws } = useApp();
  const groups: FactGroup[] = ["business", "location", "operations", "rules"];
  return (
    <section className="sg embed" id="set-facts" aria-labelledby="set-facts-h">
      <header className="embed-h"><div><h2 id="set-facts-h">{t("nav_context")}</h2><p>{t("cx_sub")}</p></div></header>
      {groups.map(g => (
        <section key={g} className="sec">
          <SecHead title={t(("g_" + g) as Key)} />
          <dl className="tray facts">{ws.facts.filter(f => f.group === g).map(f => <FactRow key={f.id} f={f} />)}</dl>
        </section>
      ))}
    </section>
  );
}

/* ------------------------------ find licenses ------------------------------ */

/** Find licenses: reached from the button on Permits (and the chip on Home); it lives at /permits/find. */
export function FindLicenses({ result, live }: { result: { what: string; where: string; hits: LicenseHit[] } | null; live: string | null }) {
  const { t, b, lang, run, busy, openApp, ask, mode, go: nav } = useApp();
  const [what, setWhat] = useState(result?.what ?? "");
  const [where, setWhere] = useState(result?.where ?? "");
  const go = (w = what, p = where) => { const W = w.trim() || b({ en: "Milk tea shop", zh: "奶茶店" }), P = p.trim() || b({ en: "San Jose, CA", zh: "加州圣何塞" }); setWhat(W); setWhere(P); run({ match: { what: W, where: P } }, lang === "zh" ? `查找许可：${W}，${P}` : `Find licenses: ${W} in ${P}`); };
  const examples: [string, string][] = lang === "zh" ? [["奶茶店", "加州圣何塞"], ["奶茶店", "加州弗里蒙特"], ["美发店", "加州奥克兰"]] : [["Milk tea shop", "San Jose, CA"], ["Milk tea shop", "Fremont, CA"], ["Hair salon", "Oakland, CA"]];
  const isFremont = !!result && /fremont|弗里蒙特/i.test(result.where);
  return (
    <div className="page">
      <a className="back" href={hrefOf("permits")} onClick={e => { if (!plainClick(e)) return; e.preventDefault(); nav("permits"); }}><I.chevR />{t("nav_apps")}</a>
      <PageHead title={t("nav_find")} sub={t("fd_sub")} />
      <form className="matcher" onSubmit={e => { e.preventDefault(); go(); }}>
        <label><span>{t("fd_what")}</span><input value={what} onChange={e => setWhat(e.target.value)} placeholder={t("fd_whatPh")} /></label>
        <i aria-hidden="true" />
        <label><span>{t("fd_where")}</span><input value={where} onChange={e => setWhere(e.target.value)} placeholder={t("fd_wherePh")} /></label>
        <button type="submit" className="m-go" disabled={busy} aria-label={t("fd_go")}><I.find /></button>
      </form>
      <div className="examples">{examples.map(([w, p]) => <button key={w + p} type="button" disabled={busy} onClick={() => go(w, p)}>{w}, {p}</button>)}</div>

      {!result && !live && (
        <ol className="fd-empty" aria-label={lang === "zh" ? "查询结果包括" : "What you get"}>
          {([[B("Every license, city to federal", "每一项执照，从市级到联邦"), B("In the order the agencies need them, for that business at that address.", "按机构要求的顺序，针对该业务和地址。")],
            [B("The fee and the usual wait", "费用与通常的等待时间"), B("Taken from each agency's own published fees and processing times.", "取自各机构公布的费用与办理时间。")],
            [B("Where to file it", "在哪里提交"), B("A link to the agency's own page, and Odelia can add any of them to your applications.", "附机构官网链接，Odelia 可将任意一项加入您的申请。")]] as [Bi, Bi][]).map(([h, p], i) => (
            <li key={i}><span>{i + 1}</span><b>{b(h)}</b><small>{b(p)}</small></li>
          ))}
        </ol>
      )}

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
