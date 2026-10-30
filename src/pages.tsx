import { ApprovedMoment } from "./Approved";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { useApp, type PermitsTab, type View } from "./ctx";
import type { Approval, Application, Deadline, Fact, FactGroup, Level, LicenseHit, Status } from "./model";
import { daysFromNow, daysUntil, fmtAgo, fmtDay, fmtIn, fmtMonth, fmtStamp, money, nowIso } from "./time";
import { ideas as ideasOf } from "./ideas";
import { IdeasList } from "./Ideas";
import { FileCard, Footer, I, Modal, Pill, StatusChip, feeText, feeTotal } from "./ui";
import { isOpeningMilestone, withOpenings, workspaceEstimate, type Evidence } from "./smart";
import { EstimateDate, HingeLine } from "./OpeningEstimate";
import { choices } from "./expedite";
import { scheduleAppeals } from "./finish";
import type { Workspace } from "./model";
import { useEvidence } from "./evidence";
import { approvalRoute, planSplit, planSplitLine } from "./approvalRoute";
import { oneTap } from "./today";
import { audit } from "./core";
import { firstPlanClock, secondsSay } from "./plan/prefill";
import type { Key } from "./i18n";
import { AgentBot, TaskBot, Working } from "./Bot";
import { taskVerb } from "./tasks";
import { StoresStrip } from "./Stores";
import { B, type Bi } from "./model";
import { takeAutostart } from "./cloud/handoff";
import { awayWait, nextRun } from "./jobs";
import { ChiefRow, PlanCard } from "./Work";
import { hrefOf, plainClick } from "./route";
import { HomeMetrics } from "./Metrics";
import { HeldSends, LocalHold, useApprovalHold } from "./SendHold";
import { CostLine } from "./CostToOpen";
import { FirstAction, FirstRunHead, FirstRunMore, untilSay, useFirstRun } from "./FirstRun";
import { headLine, isFirstRun, splitLine } from "./firstRun";
import { firstSentence } from "./phrase";
/* Team review: the review table, comments on documents, and the Mine filter (src/ReviewTable.tsx, src/Comments.tsx) */
import { hasReview, PermitsReview } from "./ReviewTable";
import { CommentsButton, MineToggle, useTeam, type Collab } from "./Comments";
import { SignButton } from "./SignDoc";
import { shortName } from "./collab";
import { AlsoNeed } from "./AlsoNeed";
import { findItAsk } from "./StillNeeded";
import { headline, nextRenewal, todos, type Todo } from "./doNext";
import { readPasted, type Read } from "./intakeParse";
import { SuggestInput } from "./Suggest";
import { factSource, kindSource, placeSource, remember } from "./suggestions";
/* The incumbents' deliverables, filled (docs/COMPETITIVE.md, "The incumbents"): the license report and the renewal runway */
import { ReportButton } from "./LicenseReport";
import { RenewalRunway } from "./RenewalRunway";
import { DoneScreen } from "./DoneScreen";

/** What the Mine filter keeps: an application or job assigned to this person, or a job about one that is. */
const mineApp = (team: Collab, id?: string) => !!id && team.isMine({ kind: "app", id });
const mineJob = (team: Collab, j: { id: string; apps?: string[] }) => team.isMine({ kind: "job", id: j.id }) || (j.apps ?? []).some(a => mineApp(team, a));
/** The Mine filter shows where there's a team to share the work with. */
const teamOf = (team: Collab) => team.people.filter(p => p.role !== "hq").length > 1 || team.assignments.length > 0;
/** Who a permit is assigned to and its open comments, under its name in a list. */
function TeamLine({ id }: { id: string }) {
  const team = useTeam();
  const who = team.assigneeOf({ kind: "app", id }), n = team.openCount({ kind: "app", id });
  if (!who && !n) return null;
  return <small className="c-team">{who && <span><I.user />{shortName(who)}</span>}{n > 0 && <span><I.message />{n}</span>}</small>;
}

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

/** A page's title and what it's for. short: the same in one short sentence for a phone, where the long one would push
 *  the work below the first screen (never a long sentence cut off with "…"). */
export function PageHead({ title, sub, short, children }: { title: string; sub?: string; short?: string; children?: ReactNode }) {
  return (
    <header className="ph">
      <div className="ph-tx"><h1>{title}</h1>{sub && <p className={short ? "ph-long" : undefined}>{sub}</p>}{sub && short && <p className="ph-short">{short}</p>}</div>
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
 * Approval fatigue is how a rubber stamp starts. Today's approvals that passed every check (src/today.ts: filings
 * complete with no line flagged and no signature to draw, and messages with nothing flagged and no fee) can be approved
 * together, from one list that still names each one, its agency or recipient, and its fee. Anything with a flag, a
 * signature, a payment, a change to the business or a second owner stays one at a time.
 */
function BatchApprove() {
  const { b, lang, ws, busy, approve, cloud } = useApp();
  const [open, setOpen] = useState(false);
  const [going, setGoing] = useState(false);
  const zh = lang === "zh";
  const today = new Date().toISOString().slice(0, 10);
  const clean = oneTap(ws, today, { account: !!cloud, filings: !cloud || cloud.plan === "monthly" }).ids.map(id => ws.approvals.find(a => a.id === id)!).filter(Boolean);
  if (clean.length < 2) return null;
  const files = clean.filter(a => a.kind === "file").length, msgs = clean.length - files;
  const what = (en: boolean) => en
    ? [files && `${files} filing${files === 1 ? "" : "s"}`, msgs && `${msgs} message${msgs === 1 ? "" : "s"}`].filter(Boolean).join(" and ")
    : [files && `${files} 份申请`, msgs && `${msgs} 条消息`].filter(Boolean).join("和");
  const go = async () => { setGoing(true); try { for (const a of clean) await approve(a.id); } finally { setGoing(false); setOpen(false); } };
  return (
    <>
      <div className="batch-row">
        <span>{zh ? `${what(false)}已通过全部核对，没有需要留意的地方。` : `${what(true).replace(/^./, c => c.toUpperCase())} passed every check with nothing flagged.`}</span>
        <Pill disabled={busy} sm onClick={() => setOpen(true)}>{zh ? `一起批准 ${clean.length} 项` : `Approve ${clean.length} together`}</Pill>
      </div>
      {open && (
        <Modal label={zh ? "一起批准" : "Approve together"} onClose={() => setOpen(false)}>
          <header className="m-h"><h2>{zh ? `批准 ${clean.length} 项` : `Approve ${clean.length} together`}</h2><p>{zh ? "每项都已逐项核对。批准后，申请交由快哉提交，消息在撤销时限过后发出；机构费用由您直接支付。" : "Each was checked line by line. Once approved, Placetta files the filings and the messages go out after the undo window; agency fees are paid by you directly."}</p></header>
          <div className="m-body">
            <ol className="batch-list">{clean.map(a => {
              if (a.kind === "send") { const to = a.data?.find(f => f.id === "to")?.value; return <li key={a.id}><b>{b(a.title)}</b>{to ? `, ${zh ? "发给" : "to"} ${to}` : ""}. {zh ? "无费用" : "No fee"}</li>; }
              const app = ws.apps.find(x => x.id === a.app)!;
              return <li key={a.id}><b>{b(a.title)}</b>{a.agency ? `, ${b(a.agency)}` : ""}. {feeTotal(app) ? money(feeTotal(app), app.currency) : zh ? "无费用" : "No fee"}</li>;
            })}</ol>
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

/** Who files it and how long the agency takes (src/approvalRoute.ts): a line on every approval card. The time shows only
 *  when the registry or the application states one. */
/** noFaster: the card shows the expedite choice itself (src/ExpeditePick.tsx), so its tiers aren't said twice. */
export function RouteLine({ a, app, noFaster }: { a: Approval; app?: Application; noFaster?: boolean }) {
  const { b } = useApp();
  const r = approvalRoute(a, app);
  if (!r) return null;
  return <span className="appr-route"><em>{b(r.who)}</em>{r.steps?.map((s, i) => <span key={i} className="appr-time">{b(s)}</span>)}{r.time && <span className="appr-time"><I.clock />{b(r.time)}</span>}{r.faster && !noFaster && <span className="appr-time">{b(r.faster)}</span>}</span>;
}

/** One thing only you can do, with its one tap: Approve opens the approval (you confirm there), Upload opens the file
 *  picker on the first missing document, Pay opens the agency's page. */
export function NeedRow({ a, compact }: { a: Approval; compact?: boolean }) {
  const { b, t, lang, ws, busy, openApproval, openApp, approve, upload, cloud } = useApp();
  const pick = useRef<HTMLInputElement>(null);
  const hold = useApprovalHold(a.id);   // the undo window (src/SendHold.tsx): approved, not sent yet
  const app = a.app ? ws.apps.find(x => x.id === a.app) : undefined;
  const fee = a.kind === "pay" ? a.fee ?? 0 : app && a.kind === "file" ? feeTotal(app) : 0;
  const Icon = KIND_ICON[a.kind];
  const sub = [a.agency && b(a.agency), (a.kind === "file" || a.kind === "pay") && (a.kind === "file" && app ? feeText(app, t) : fee ? money(fee) : t("free"))].filter(Boolean).join(lang === "zh" ? "，" : ", ");
  // the document this upload is for: the first one still missing on the permit (the checklist in the drawer otherwise)
  const missing = app?.checklist.find(c => c.state === "missing" && !c.dep);
  if (a.kind === "pay") return (
    <div className={"appr k-pay" + (compact ? " compact" : "")}>
      <span className={"appr-ico k-" + a.kind}><Icon /></span>
      <span className="appr-tx"><b>{b(a.title)}</b>{sub && <span>{sub}</span>}<RouteLine a={a} app={app} /></span>
      <span className="appr-btns">
        <button type="button" className="pill quiet sm" disabled={busy} onClick={() => a.filing && void cloud?.markPaid(a.filing)}>{b(B("I've paid", "我已付款"))}</button>
        <Pill onClick={() => approve(a.id)} sm={compact}>{b(B("Pay the agency", "去付款"))}</Pill>
      </span>
    </div>
  );
  return (
    <div className={"appr" + (compact ? " compact" : "")}>
      <span className={"appr-ico k-" + a.kind}><Icon /></span>
      <span className="appr-tx"><b>{b(a.title)}</b>{sub && <span>{sub}</span>}<RouteLine a={a} app={app} /></span>
      {a.kind === "upload" ? (
        <>
          <input ref={pick} type="file" hidden multiple onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (app && missing && f.length) upload(app.id, missing.id, f); }} />
          <Pill onClick={() => (app && missing ? pick.current?.click() : app && openApp(app.id, "check"))} disabled={busy} sm={compact}>{t("upload")}</Pill>
        </>
      ) : hold ? <LocalHold hold={hold} compact /> : <Pill onClick={() => openApproval(a.id)} disabled={busy} sm={compact}>{t("approve")}</Pill>}
    </div>
  );
}

function AppRow({ a }: { a: Application }) {
  const { b, lang, openApp } = useApp();
  return (
    <Working on={a.status === "draft"} size="line">
      <button type="button" className={"row arow" + (a.critical ? " crit" : "")} onClick={() => openApp(a.id)}>
        <span className="arow-n"><b>{b(a.name)}</b><small>{a.next ? b(a.next) : b(a.agency)}</small>{(() => { const c = choices(a); if (!c.length) return null; const on = c.find(x => x.id === (a.expedite ?? null)) ?? c[0]; const alt = c.find(x => x.id !== on.id)!; return <small className="arow-x" data-expedite={a.expedite ?? "standard"}>{lang === "zh" ? `${b(on.label)}：${b(on.time)}。可选 ${b(alt.label)}：${b(alt.time)}，${b(alt.fee)}` : `${b(on.label)}: ${b(on.time)}. ${a.expedite ? "Or" : "Or pay for"} ${b(alt.label)}: ${b(alt.time)}, ${b(alt.fee)}`}</small>; })()}</span>
        <StatusChip s={a.status} />
      </button>
    </Working>
  );
}

/** What the agent is doing right now, or the last thing it did. */
function LiveLine() {
  const { b, lang, ws, busy, live } = useApp();
  const last = ws.audit.find(a => a.actor === "agent");
  // the step shows on Odelia right above this line (her outfit), so the line carries only the words
  if (busy && live) return <Working on size="line"><p className="liveline on" aria-live="polite"><b className="ll-verb">{b(taskVerb(live.state))}…</b><span>{b(live.label)}</span>{live.tool && <em className="site">{live.tool}</em>}</p></Working>;
  if (!last) return null;
  return <p className="liveline"><span className="ll-dot" aria-hidden="true" /><span>{b(last.action)}: {b(last.object)}</span><em>{fmtAgo(last.at, lang)}</em></p>;
}

/* -------------------------------- overview -------------------------------- */

function Welcome() {
  const { t, b, ws, ask, busy, live, cloud, mode, go } = useApp();
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
        <div className="hero-bot"><AgentBot size={96} busy={busy} task={busy ? live?.state : undefined} gaze={[0, 2.4]} /></div>
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

/** The line under the plan: "Mapped 10 permits and filled 1 application in 2 seconds", or the lines filled when no
 *  application was ready to put up at sign-up. */
function firstLine(n: number, ms: number, won: boolean, lines: number): Bi {
  const s = secondsSay(ms), p = `${n} permit${n === 1 ? "" : "s"}`, took = `用时${/^\d/.test(s.zh) ? " " : ""}${s.zh}`;
  if (won) return B(`Mapped ${p} and filled 1 application in ${s.en}`, `${took}：梳理了 ${n} 项许可，填好 1 份申请`);
  if (lines) return B(`Mapped ${p} and filled ${lines} form line${lines === 1 ? "" : "s"} in ${s.en}`, `${took}：梳理了 ${n} 项许可，填好 ${lines} 栏表格`);
  return B(`Mapped ${p} in ${s.en}`, `${took}：梳理了 ${n} 项许可`);
}

/* Home answers one question first: what do I do next? (Duolingo's one big next action.) Then, in order: what else is
   waiting on me (Linear's Inbox and Ramp's "Things to do", at most three, each with one button), what Odelia is doing
   (one line each, the timeline a tap away), and what's done (folded). Everything else (the plan, dates, updates, this
   month's numbers, stores, what else a business may need) sits behind tabs below. Nothing needed: a calm "You're all
   set" with the next renewal (Superhuman's inbox zero). Progress is one line and a bar until it's done (Stripe's
   "Get started" checklist). The order of what to do is src/doNext.ts.
   Calm: the first screen holds at most three things, the card, Waiting on you and one status line ("Odelia is working on
   5 things. 2 of 10 permits done", the bar only once something is filed). Odelia's work, the plan, dates, updates,
   numbers, stores and what's done sit behind More. On a phone the card fills the first screen with its button at the
   bottom, and Waiting on you swipes sideways in its own row. */

type HomeTab = "work" | "plan" | "dates" | "updates" | "month" | "stores" | "also" | "done";
const HOME_TAB = "placetta-home-tab", HOME_MORE = "placetta-home-more";
const readTab = (): HomeTab => { try { const v = localStorage.getItem(HOME_TAB); if (v && ["work", "plan", "dates", "updates", "month", "stores", "also", "done"].includes(v)) return v as HomeTab; } catch { /* storage blocked */ } return "work"; };
const readMore = (): boolean => { try { return localStorage.getItem(HOME_MORE) === "1"; } catch { return false; } };

/** The one primary button a to-do needs: Approve opens the approval (you confirm there), Upload opens the file picker on
 *  the document it's for, Pay opens the agency's page. big: the "Do this next" card's. */
function TodoButton({ x, big }: { x: Todo; big?: boolean }) {
  const { b, t, busy, openApproval, openApp, approve, upload, go } = useApp();
  const pick = useRef<HTMLInputElement>(null);
  const hold = useApprovalHold(x.kind === "approval" ? x.a.id : "");
  const cls = "pill " + (big ? "ink dtn-go" : "primary sm");
  const btn = (label: string, on: () => void) => <button type="button" className={cls} disabled={busy} onClick={on}><span>{label}</span><i aria-hidden="true"><I.arrow /></i></button>;
  const picker = (app: string, item: string) => <input ref={pick} type="file" hidden multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) upload(app, item, f); }} />;
  if (x.kind === "doc") return <>{btn(big ? b(B("Photo or file", "拍照或上传")) : t("upload"), () => pick.current?.click())}{picker(x.app.id, x.item)}</>;
  if (x.kind === "job") {
    const app = x.app;
    return btn(b(B("Open", "打开")), () => (app ? openApp(app.id, "check") : go("odelia", "work")));
  }
  const a = x.a;
  if (hold) return <LocalHold hold={hold} compact={!big} />;
  if (a.kind === "pay") return btn(b(B("Pay the agency", "去付款")), () => approve(a.id));
  if (a.kind === "upload") {
    const missing = x.app?.checklist.find(c => c.state === "missing" && !c.dep);
    return <>{btn(t("upload"), () => (x.app && missing ? pick.current?.click() : x.app && openApp(x.app.id, "check")))}{x.app && missing && picker(x.app.id, missing.id)}</>;
  }
  return btn(big ? b(B("Review and approve", "查看并批准")) : t("approve"), () => openApproval(a.id));
}

/** Why it's first, in one short line: its date, that the opening waits on it, or what happens once you act. Nothing
 *  that repeats the button. */
function whyLine(x: Todo, lang: "en" | "zh", t: (k: Key) => string): string {
  const zh = lang === "zh";
  const parts: string[] = [];
  if (x.due && x.days != null) parts.push(x.days < 0 ? (zh ? `已过期 ${-x.days} 天。` : `${-x.days} day${x.days === -1 ? "" : "s"} late.`) : zh ? `${fmtIn(x.days, lang)}到期。` : `Due ${fmtIn(x.days, lang).toLowerCase()}.`);
  if (x.blocks) parts.push(zh ? "开业日期取决于它。" : "Your opening waits on this.");
  if (x.kind === "approval") {
    const a = x.a, fee = a.kind === "pay" ? a.fee ?? 0 : x.app && a.kind === "file" ? feeTotal(x.app) : 0;
    const say = {
      file: zh ? "已填好，批准后提交。" : "Filled in. Filed once you approve.",
      send: zh ? "批准后才会发出。" : "Sent once you approve.",
      upload: zh ? "缺少它就交不了申请。" : "The application needs it.",
      pay: zh ? "付款后机构才会继续。" : "The agency waits on payment.",
      change: zh ? "您确认前不会更改。" : "Nothing changes until you confirm.",
    }[a.kind];
    if (!x.blocks || a.kind !== "upload") parts.push(say);
    if (fee && x.app) parts.push(zh ? `费用 ${feeText(x.app, t)}，直接付给机构。` : `Fee ${feeText(x.app, t)}, paid to the agency.`);
    else if (fee) parts.push(zh ? `费用 ${money(fee)}。` : `Fee ${money(fee)}.`);
  } else if (x.kind === "doc") {
    if (!x.blocks) parts.push(zh ? `用于${x.app.name.zh}。` : `For the ${x.app.name.en.charAt(0).toLowerCase() + x.app.name.en.slice(1)}.`);
  } else if (x.job.waiting) parts.push(zh ? x.job.waiting.zh : x.job.waiting.en);
  return parts.join(zh ? "" : " ");
}

/** A phone (the bottom tab bar's width): the "Do this next" card fills the first screen there. Safe without a window. */
function usePhone(q = "(max-width: 859px)") {
  const has = () => typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [n, setN] = useState(() => has() && window.matchMedia(q).matches);
  useEffect(() => { if (!has()) return; const mq = window.matchMedia(q); const on = () => setN(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  return n;
}

/** The single most important thing, with one big button and a why line. Not now moves it to the end for this visit. */
function DoNextCard({ x, n, onLater, docs, title }: { x: Todo; n: number; onLater?: () => void; docs?: { i: number; of: number }; title: string }) {
  const { b, t, lang, busy, live, ask } = useApp();
  const zh = lang === "zh";
  const phone = usePhone();
  // two columns (1200 and up): the card stands beside the opening card at its height, and Odelia fills the top of it
  const wide = usePhone("(min-width: 1200px)");
  return (
    <section className="dtn" data-do-next={x.key} aria-labelledby="dtn-h">
      <h1 className="vh">{title}</h1>
      {(phone || wide) && <div className="dtn-bot" aria-hidden="true"><AgentBot size={64} busy={busy} task={busy ? live?.state : undefined} gaze={[0, 2.4]} interactive={false} /></div>}
      <p className="dtn-k">{zh ? "下一步" : "Do this next"}{docs && docs.of > 1 ? <span>{zh ? `文件 ${docs.i}/${docs.of}` : `${docs.i} of ${docs.of}`}</span> : n > 1 ? <span>{zh ? `第 1 项，共 ${n} 项` : `1 of ${n}`}</span> : null}</p>
      <h2 id="dtn-h">{b(headline(x))}</h2>
      <p className="dtn-why">{whyLine(x, lang, t)}</p>
      <div className="dtn-act">
        <TodoButton x={x} big />
        {x.kind === "doc" && <button type="button" className="lnk" disabled={busy} onClick={() => ask(b(findItAsk(x.label, x.app.name)))}>{zh ? "帮我找" : "Find it for me"}</button>}
        {onLater && n > 1 && <button type="button" className="lnk quiet" onClick={onLater}>{x.kind === "doc" ? (zh ? "跳过" : "Skip") : (zh ? "稍后" : "Later")}</button>}
      </div>
    </section>
  );
}

/** One row of "Waiting on you": what it is, and its one quiet button. A missing document is named by itself (the
 *  button already says Upload); Find it for me waits on the "Do this next" card. */
function TodoRow({ x }: { x: Todo }) {
  const { b, lang } = useApp();
  if (x.kind === "approval") return <NeedRow a={x.a} compact />;
  if (x.kind === "job") return <PlanCard job={x.job} compact actions />;
  // every row starts with what to do (Ive): "Add construction drawings", like the approval rows beside it
  const raw = b(x.label), verb = /^(add|upload|send|sign|get|approve|file|renew|confirm|上传|添加|提交|签)/i.test(raw);
  const label = verb ? raw : lang === "zh" ? `上传${raw}` : `Add ${/^[A-Z]{2,}/.test(raw) ? raw : raw.charAt(0).toLowerCase() + raw.slice(1)}`;
  return (
    <div className="appr compact k-doc">
      <span className="appr-ico k-upload"><I.clip /></span>
      <span className="appr-tx"><b>{label.charAt(0).toUpperCase() + label.slice(1)}</b><span>{b(x.app.name)}</span></span>
      <span className="appr-btns"><TodoButton x={x} /></span>
    </div>
  );
}

/** "Odelia is working on": one line each; a tap opens the timeline. */
function WorkLine({ title, status, children, onOpen }: { title: string; status: string; children?: ReactNode; onOpen?: () => void }) {
  const line = <><b>{title}</b><span>{status}</span></>;
  if (onOpen) return <li><button type="button" className="wl" onClick={onOpen}>{line}<I.chevR /></button></li>;
  if (!children) return <li><div className="wl">{line}</div></li>;
  return <li><details className="wl-d"><summary className="wl">{line}<I.chevR /></summary><div className="wl-body">{children}</div></details></li>;
}

/** Home's two looks: the simple one (a greeting that says what needs you, the one next step, the short list, what
 *  Odelia is doing, ideas to ask) and the classic one (the opening card, the brief, More, the wide columns). */
const CLASSIC_HOME = false as boolean;

export function Overview() {
  const { t, b, ws, lang, go, ask, busy, live, updates, queued, editWs, openApp } = useApp();
  const n = ws.apps.length;
  /* Time to plan: from the signup press (src/cloud/Root.tsx) to this plan on screen, recorded once in the workspace,
     with one line in the audit trail, and the first win's approval request logged the way Odelia's is. */
  useEffect(() => {
    if (!ws.firstPlan || ws.firstPlan.ms != null) return;
    const frame = requestAnimationFrame(() => {
      const ms = firstPlanClock.take();
      if (ms == null) return;
      editWs(w => {
        const fp = w.firstPlan;
        if (!fp || fp.ms != null) return w;
        const s = secondsSay(ms), win = fp.win ? w.apps.find(a => a.id === fp.win && w.approvals.some(x => x.app === a.id)) : undefined;
        const planned = audit("agent", B("Mapped the opening plan", "梳理开店计划"), w.business,
          B(`${fp.apps} permits from Placetta's registry and ${fp.filled ?? 0} form lines from your signup, in ${s.en}`, `用时${/^\d/.test(s.zh) ? " " : ""}${s.zh}：从快哉许可库梳理 ${fp.apps} 项许可，根据注册信息填写 ${fp.filled ?? 0} 栏`))({ ...w, firstPlan: { ...fp, ms } });
        return win ? audit("agent", B("Asked for approval", "请求批准"), win.name, B("Filled from your signup. No fee", "根据注册信息填写，无需费用"))(planned) : planned;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);   // once, when Home first shows the plan // eslint-disable-line react-hooks/exhaustive-deps
  const team = useTeam();
  const [later, setLater] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const [tab, setTabState] = useState<HomeTab>(readTab);
  const setTab = (v: HomeTab) => { setTabState(v); try { localStorage.setItem(HOME_TAB, v); } catch { /* storage blocked */ } };
  const [more, setMoreState] = useState(readMore);
  const setMore = (v: boolean) => { setMoreState(v); try { localStorage.setItem(HOME_MORE, v ? "1" : "0"); } catch { /* storage blocked */ } };
  const ev = useEvidence();
  if (!n) return <Welcome />;
  const zh = lang === "zh";
  /* the first run (src/firstRun.ts): a plan written at sign-up with nothing filed yet leads with the outcome */
  const firstRun = isFirstRun(ws);
  const today = daysFromNow(0);
  const c = (s: Status[]) => ws.apps.filter(a => s.includes(a.status)).length;
  /* Team review: Mine keeps what's assigned to this person (and the jobs about it) in each section below */
  const mine = team.mine && teamOf(team) && CLASSIC_HOME;   // the simple Home shows everything; Mine lives on Permits
  const mineN = ws.apps.filter(a => mineApp(team, a.id)).length + (ws.jobs ?? []).filter(j => j.status !== "done" && j.status !== "stopped" && team.isMine({ kind: "job", id: j.id })).length;
  const approved = c(["approved"]), agency = c(["review", "filing"]);

  /* 1. What needs you, most urgent first; Not now sends one to the end for this visit */
  const list = todos(ws, today, mine ? { app: id => mineApp(team, id), job: j => mineJob(team, j) } : {});
  const ordered = [...list.filter(x => !later.includes(x.key)), ...later.map(k => list.find(x => x.key === k)).filter((x): x is Todo => !!x)];
  const top = ordered[0], rest = ordered.slice(1);
  const docsAll = ordered.filter(x => x.kind === "doc");
  const docAt = top?.kind === "doc" ? { i: list.filter(x => x.kind === "doc").findIndex(x => x.key === top.key) + 1, of: docsAll.length } : undefined;
  const shown = all ? rest : rest.slice(0, 3);

  /* 2. Odelia is working on */
  const jobs = ws.jobs ?? [];
  const chiefs = jobs.filter(j => j.children?.length && j.status !== "done" && j.status !== "stopped" && (!mine || mineJob(team, j)));
  const running = jobs.filter(j => (j.status === "running" || awayWait(j)) && !j.parent && !j.children?.length && (!mine || mineJob(team, j)));
  const routines = ws.routines ?? [], active = routines.filter(r => !r.paused);
  const nextRoutine = active.map(r => nextRun(r, today)).filter((d): d is string => !!d).sort()[0];
  const routineLine = !routines.length ? "" : !active.length ? t("hm_routinesPaused", { n: routines.length })
    : t(routines.length === 1 ? "hm_routines1" : "hm_routinesN", { n: routines.length, d: nextRoutine ? fmtDay(nextRoutine, lang) : "" });
  const withAgency = ws.apps.filter(a => FILED.includes(a.status) && a.status !== "approved" && (!mine || mineApp(team, a.id)));
  const decision = (id: string) => ws.deadlines.filter(d => d.app === id && d.kind === "estimate" && d.date >= today).sort((x, y) => x.date.localeCompare(y.date))[0];
  const unread = updates.filter(u => !u.read).length;
  /* the morning brief: renewals coming due, what agencies sent back, what's with them now */
  const renewalsSoon = ws.deadlines.filter(d => d.kind === "renewal" && daysUntil(d.date) >= 0 && daysUntil(d.date) <= 30).length;
  const replies = updates.filter(u => !u.read && (u.kind === "filing" || u.kind === "mail")).length;
  const working =chiefs.length + running.length + ws.running.length + withAgency.length > 0 || queued.length > 0 || routines.length > 0 || (busy && !!live);
  const steps = (j: { steps: { done: boolean }[] }) => zh ? `${j.steps.filter(s => s.done).length}/${j.steps.length} 步` : `${j.steps.filter(s => s.done).length} of ${j.steps.length} steps`;

  /* 3. All set: what's issued */
  const done = ws.apps.filter(a => a.status === "approved" && (!mine || mineApp(team, a.id)));

  /* the opening date, only where the plan or a store's path gives one */
  const fp = ws.firstPlan;
  const previews = ws.apps.filter(isPreview).length;
  const est = workspaceEstimate(ws, today, ev);
  const landing = est?.date ?? null;
  const renewal = nextRenewal(ws, today);

  /* behind the tabs: the plan, the dates, the updates, this month, the stores, and what else a business may need */
  const nextAll = [...ws.apps].filter(a => a.status !== "approved" && (!mine || mineApp(team, a.id))).sort(byPriority);
  const nextUp = nextAll.slice(0, 3);
  /* who acts on what's left (src/approvalRoute.ts planSplit): from the same route data as every approval card */
  const split = planSplitLine(planSplit(nextAll));
  const biz = b(ws.business), place = ws.locations[0] ? b(ws.locations[0].name) : "", goal = b(ws.goal);
  const at = (ws.stores ?? []).length === 1 && /^\d/.test(ws.stores![0].address ?? "") ? ws.stores![0].address! : "";
  const base = place ? biz.replace(` in ${place}`, "").replace(place, "").trim() : biz;
  const ctxParts = [at ? (!base ? at : zh ? `${base}，${at}` : `${base} at ${at}`) : place && !biz.includes(place) ? t("ov_in", { biz, place }) : biz, goal].filter(Boolean);
  const ctxLine = ctxParts.length ? ctxParts.join(zh ? "。" : ". ") + (zh ? "。" : ".") : "";
  const soon = [...calendar(ws, today, ev)].filter(d => daysUntil(d.date) >= 0).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 5);
  const latest = updates.slice(0, 3);
  const tabs: { id: HomeTab; label: string; on: boolean }[] = ([
    { id: "work", label: "Odelia", on: working },
    { id: "plan", label: zh ? "计划" : "Plan", on: true },
    { id: "dates", label: zh ? "日期" : "Dates", on: soon.length > 0 },
    { id: "updates", label: zh ? "动态" : "Updates", on: latest.length > 0 || ws.nudges.length > 0 },
    { id: "month", label: zh ? "数字" : "Numbers", on: true },
    { id: "stores", label: t("nav_stores"), on: (ws.stores ?? []).length > 0 },
    { id: "also", label: zh ? "其他" : "Also check", on: !!fp?.also?.length },
    { id: "done", label: zh ? "已办好" : "Done", on: done.length > 0 },
  ] as { id: HomeTab; label: string; on: boolean }[]).filter(x => x.on);
  const cur = tabs.some(x => x.id === tab) ? tab : tabs[0].id;
  const openMore = (v?: HomeTab) => { if (v) setTab(v); setMore(true); setTimeout(() => document.getElementById("hm-more")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); };

  /* the one quiet status line: what Odelia is doing, and progress once anything is filed (Linear's restraint) */
  const workN = chiefs.length + running.length + ws.running.length + withAgency.length + queued.length;
  const filed = approved + agency;
  const say: string[] = [];
  if (workN > 0) say.push(zh ? `Odelia 正在处理 ${workN} 件事` : `Odelia is working on ${workN} thing${workN === 1 ? "" : "s"}`);
  else if (busy && live) say.push(`${b(taskVerb(live.state))}…`);
  if (filed > 0) say.push(zh ? `已办好 ${approved}/${n} 项执照` : `${approved} of ${n} licenses done`);
  if (!say.length) say.push(zh ? `计划中有 ${n} 项执照` : `${n} license${n === 1 ? "" : "s"} in your plan`);
  if (landing && !filed && !firstRun) say.push(zh ? `预计 ${fmtDay(landing, lang, true)} 前后开业` : `Opening around ${fmtDay(landing, lang, true)}`);
  const status = say.join(zh ? "，" : ". ");
  const mineCtl = teamOf(team) && CLASSIC_HOME ? <MineToggle count={mineN} /> : null;

  return (
    <div className={"page home" + (CLASSIC_HOME ? "" : " simple-home")}>
      {CLASSIC_HOME ? firstRun && <FirstRunHead /> : <HomeHello need={ordered.length} firstRun={firstRun} landing={landing} n={n} approved={approved} agency={agency} />}
      <DoneScreen />
      {!CLASSIC_HOME && <ApprovedMoment />}
      {top ? <DoNextCard x={top} n={ordered.length} docs={docAt} title={biz} onLater={() => setLater(l => [...l.filter(k => k !== top.key), top.key])} /> : firstRun && !mine ? <FirstAction title={biz} /> : (
        <section className="hm-calm" aria-live="polite">
          <h1 className="vh">{biz}</h1>
          <span className="hm-calm-i" aria-hidden="true"><I.check /></span>
          <h2>{mine ? (zh ? "没有分配给您、需要处理的事项。" : "Nothing assigned to you needs you.") : zh ? "都办好了。" : "You're all set."}</h2>
          <p>{zh ? "有需要您处理的事，Odelia 会告诉您。" : "Odelia will tell you when something needs you."}</p>
          {renewal && <p className="hm-calm-r">{zh ? `下次续期：${b(renewal.title)}，${fmtDay(renewal.date, lang, true)}` : `Next renewal: ${b(renewal.title)}, ${fmtDay(renewal.date, lang, true)}`}</p>}
          {mineCtl && !rest.length && <div className="hm-calm-mine">{mineCtl}</div>}
        </section>
      )}

      {/* the opening date, second only to the one thing to do; the wide screen's right column carries it instead */}
      {CLASSIC_HOME && !firstRun && (landing || n > 0) && <OpeningCard inline landing={landing} est={est} n={n} approved={approved} agency={agency} />}
      {CLASSIC_HOME && !firstRun && <Brief renewals={renewalsSoon} replies={replies} withAgency={withAgency.length} />}

      {rest.length > 0 && (
        <section className="sec hm-needs">
          <div className="sec-h">
            <h2>{CLASSIC_HOME ? <>{zh ? "等您处理" : "Waiting on you"}<em>{ordered.length}</em></> : zh ? "接下来" : "After that"}</h2>
            {mineCtl}
          </div>
          {all && !mine && <BatchApprove />}
          <div className="stack" data-indent>{shown.map(x => <TodoRow key={x.key} x={x} />)}</div>
          <div className="hm-needs-more">
          {all && docsAll.length > 1 && <button type="button" className="lnk more" disabled={busy} onClick={() => ask(b(findItAsk(B(docsAll.slice(0, 8).map(x => x.kind === "doc" ? `${x.label.en} (${x.app.name.en})` : "").join("; "), docsAll.slice(0, 8).map(x => x.kind === "doc" ? `${x.label.zh}（${x.app.name.zh}）` : "").join("；")), B("open applications", "进行中的申请"), true)))}><I.spark />{zh ? `让 Odelia 找齐 ${docsAll.length} 份文件` : `Have Odelia find all ${docsAll.length}`}</button>}
          {rest.length > 3 && <button type="button" className="lnk more" onClick={() => setAll(!all)}>{all ? (zh ? "收起" : "Show fewer") : (zh ? `查看全部 ${rest.length} 项` : `See all ${rest.length}`)}</button>}
          </div>
        </section>
      )}

      {CLASSIC_HOME && firstRun && <FirstRunMore />}

      {!CLASSIC_HOME && (
        <>
          <button type="button" className="hm-odelia" onClick={() => go("odelia", working ? "work" : undefined)}>
            <span className="hm-odelia-bot" aria-hidden="true"><AgentBot size={32} busy={busy} task={busy ? live?.state : undefined} gaze={[0, 2.4]} interactive={false} /></span>
            <span className="hm-odelia-tx">{workN > 0 ? (zh ? `Odelia 正在处理 ${workN} 件事` : `Odelia is working on ${workN} thing${workN === 1 ? "" : "s"}`) : busy && live ? `${b(taskVerb(live.state))}…` : zh ? "Odelia 随时待命" : "Odelia is ready when you are"}</span>
            <I.chevR />
          </button>
          <HomeIdeas />
        </>
      )}
      {CLASSIC_HOME && <>
      <div className={"hm-status" + (more ? " open" : "")}>
        <button type="button" className="hm-status-b" onClick={() => openMore(working ? "work" : "plan")} aria-controls="hm-more">
          <span className="hm-status-bot" aria-hidden="true"><AgentBot size={40} busy={busy} task={busy ? live?.state : undefined} gaze={[0, 2.4]} interactive={false} /></span>
          <span className="hm-status-tx">{status}</span>
          {filed > 0 && <span className="bar" aria-hidden="true"><i style={{ width: `${(approved / n) * 100}%` }} /><i className="b2" style={{ width: `${(agency / n) * 100}%` }} /></span>}
        </button>
        <button type="button" className="hm-more-b" aria-expanded={more} aria-controls="hm-more" onClick={() => (more ? setMore(false) : openMore())}>{zh ? "更多" : "More"}<I.chevR /></button>
      </div>

      {more && (
      <section className="sec hm-more" id="hm-more" aria-label={zh ? "更多" : "More"}>
        <>
        <nav className="ptabs hm-tabs" role="tablist">
          {tabs.map(x => <button key={x.id} type="button" role="tab" aria-selected={x.id === cur} onClick={() => setTab(x.id)}>{x.label}</button>)}
        </nav>
        <div role="tabpanel" className="hm-panel">
          {cur === "work" && (
            <div className="hm-work">
              <LiveLine />
              <ul className="wls">
                {chiefs.map(j => <WorkLine key={j.id} title={b(j.title)} status={zh ? "多家门店同时进行" : "Across your stores"}><ChiefRow job={j} compact /></WorkLine>)}
                {running.map(j => <WorkLine key={j.id} title={b(j.title)} status={steps(j)}><PlanCard job={j} compact /></WorkLine>)}
                {withAgency.map(a => { const d = decision(a.id); return <WorkLine key={a.id} title={b(a.name)} status={d ? (zh ? `机构审核中，预计 ${fmtDay(d.date, lang)} 出结果` : `With the agency, decision ${fmtDay(d.date, lang)}`) : zh ? "机构审核中" : "With the agency"} onOpen={() => openApp(a.id, "progress")} />; })}
                {ws.running.map(r => <li key={r.id}><div className="wl"><TaskBot id={r.id} label={b(r.label)} /><b>{b(r.label)}</b>{r.detail && <span>{b(r.detail)}</span>}</div></li>)}
                {queued.length > 0 && <li><div className="wl"><b>{zh ? `${queued.length} 项排队中` : `${queued.length} waiting in line`}</b><span>{zh ? "当前任务完成后开始" : "Next when she finishes"}</span></div></li>}
                {routineLine && <WorkLine title={routineLine} status={zh ? "例行任务" : "Routines"} onOpen={() => go("odelia", "work")} />}
              </ul>
              <button type="button" className="lnk more" onClick={() => go("odelia", "updates")}>{unread ? (zh ? `动态 ${unread}` : `Updates ${unread}`) : zh ? "全部动态" : "All updates"}<I.chevR /></button>
            </div>
          )}
          {cur === "done" && <div className="tray">{done.map(a => <AppRow key={a.id} a={a} />)}</div>}
          {cur === "plan" && (
            <div className="hm-plan">
              <div className="plan-card">
                {ctxLine && <p className="ctx">{ctxLine}</p>}
                <p className="plan-sum">{t(n === 1 ? "hm_plan1" : "hm_planN", { n, a: approved, r: agency, t: n - approved - agency })}</p>
                {landing && <div className="plan-open oe"><I.deadlines /><span><span className="oe-k">{zh ? "预计开业" : "Opening"}</span> <EstimateDate date={landing} range={est?.path?.range} lang={lang} /><HingeLine hinge={est?.path?.hinge ?? []} lang={lang} onOpen={id => openApp(id, "progress")} /></span></div>}
                <CostLine />
                {nextUp.length > 0 && (
                  <>
                    <p className="plan-h">{t("hm_next")}</p>
                    <ol className="plan-next">
                      {nextUp.map((a, i) => <li key={a.id}><span className="plan-n">{i + 1}</span><AppRow a={a} /></li>)}
                    </ol>
                  </>
                )}
                {split && <p className="plan-note" data-plan-split><I.check />{b(split)}</p>}
                {previews > 0 && <p className="plan-note"><I.spark />{t("hm_preview")}</p>}
                <div className="plan-act">
                  <button type="button" className="pill quiet sm" onClick={() => go("permits")}>{zh ? "全部执照" : "All licenses"}<I.chevR /></button>
                  <button type="button" className="pill quiet sm" onClick={() => go("find")}><I.find />{t("nav_find")}</button>
                </div>
              </div>
              {fp?.ms != null && previews > 0 && <p className="plan-time" data-indent><I.check />{b(firstLine(fp.apps, fp.ms, !!fp.win && ws.apps.some(a => a.id === fp.win), fp.filled ?? 0))}</p>}
            </div>
          )}
          {cur === "dates" && (
            <>
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
              <button type="button" className="lnk more" onClick={() => go("permits", "deadlines")}>{zh ? "全部日期" : "All dates"}<I.chevR /></button>
            </>
          )}
          {cur === "updates" && (
            <>
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
              <button type="button" className="lnk more" onClick={() => go("odelia", "updates")}>{zh ? "全部动态" : "All updates"}<I.chevR /></button>
            </>
          )}
          {cur === "month" && <HomeMetrics />}
          {cur === "stores" && <StoresStrip onOpen={() => go("stores")} />}
          {cur === "also" && fp?.also?.length ? <AlsoNeed fp={fp} zh={zh} /> : null}
        </div>
        </>
      </section>
      )}
      <HomeNext next={nextAll.slice(0, 6)} />
      <HomeSide soon={soon} />
      </>}
      <Footer />
    </div>
  );
}

/** The top of the simple Home, said the way Muse and Instinct talk: a greeting, how many things need you (or, in the
 *  first run, how many licenses there are and who does them), and the goal with its progress in one quiet line. */
function HomeHello({ need, firstRun, landing, n, approved, agency }: { need: number; firstRun: boolean; landing: string | null; n: number; approved: number; agency: number }) {
  const { b, lang, ws } = useApp();
  const f = useFirstRun();
  const zh = lang === "zh";
  const hr = new Date().getHours();
  // the greeting names the business (Chesky): "Good morning, Moonleaf Tea."
  const biz = b(ws.business);
  const hi = zh ? `${hr < 12 ? "早上好" : hr < 18 ? "下午好" : "晚上好"}${biz ? `，${biz}` : ""}。` : `${hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening"}${biz ? `, ${biz}` : ""}.`;
  const head = firstRun ? b(headLine(f)) : need ? (zh ? `有 ${need} 件事需要您。` : `${need} thing${need === 1 ? " needs" : "s need"} you.`) : zh ? "今天没有需要您处理的事。" : "Nothing needs you today.";
  const split = firstRun ? splitLine(f) : null;
  const sub = [landing ? (zh ? `预计 ${fmtDay(landing, lang, true)} 前后开业` : `Opening around ${fmtDay(landing, lang, true)}`) : "",
    (zh ? `${n} 项执照已办好 ${approved} 项` : `${approved} of ${n} license${n === 1 ? "" : "s"} done`) + (agency ? (zh ? `，${agency} 项在机构审批中` : `, ${agency} with the agency`) : "")].filter(Boolean).join(zh ? "，" : ". ") + (zh ? "。" : ".");
  return (
    <header className="hm-hello">
      <p className="hm-hi"><span className="hm-hi-bot" aria-hidden="true"><AgentBot size={28} gaze={[0, 2.4]} interactive={false} /></span>{hi}</p>
      <h1>{head}{split && <em>{b(split)}</em>}</h1>
      <p className="hm-goal">{sub}</p>
      {/* one mark per license (Paul Smith): approved ones in seal blue, the ones with the agency breathing, the rest
          waiting; "2 of 11" becomes something you can see. Many licenses fall back to the single bar */}
      {n > 0 && n <= 24 ? (
        <span className="hm-segs" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} className={i < approved ? "done" : i < approved + agency ? "agency" : ""} />)}</span>
      ) : <span className="hm-goal-bar" aria-hidden="true"><i style={{ width: `${n ? (approved / n) * 100 : 0}%` }} /><i className="b2" style={{ width: `${n ? (agency / n) * 100 : 0}%` }} /></span>}
    </header>
  );
}

/** Ideas to ask Odelia, the way Muse's Ideas and Instinct's example tasks show what an agent can do: one tap asks. */
function HomeIdeas() {
  const { b, lang, ask, busy, ws } = useApp();
  // what she can take on, from the records (src/ideas.ts); the plain questions only when there's nothing to offer
  const offers = useMemo(() => ideasOf(ws, nowIso().slice(0, 10)), [ws]);
  if (offers.length) return (
    <section className="sec hm-offers" aria-label={lang === "zh" ? "Odelia 可以接手" : "Odelia can take on"}>
      <div className="sec-h"><h2>{lang === "zh" ? "Odelia 还可以接手" : "Odelia can also take on"}</h2></div>
      <IdeasList max={3} />
    </section>
  );
  const ideas = [
    B("What's blocking my opening?", "什么在拖慢我的开业？"),
    B("File everything that's ready", "把准备好的都提交"),
    B("What renews next?", "下一个要续期的是什么？"),
  ];
  return (
    <nav className="hm-ideas" aria-label={lang === "zh" ? "问 Odelia" : "Ask Odelia"}>
      {ideas.map(x => <button key={x.en} type="button" disabled={busy} onClick={() => ask(b(x))}>{b(x)}</button>)}
    </nav>
  );
}

/** Home's list on a wide screen, under the one thing to do: the next permits with their status, fee and next step. */
function HomeNext({ next }: { next: Application[] }) {
  const { b, lang, go, openApp, t } = useApp();
  const zh = lang === "zh";
  if (!next.length) return null;
  return (
    <section className="hm-nextwide hs-card" aria-label={zh ? "接下来" : "Next up"}>
      <div className="hs-h"><h2>{zh ? "接下来" : "Next up"}</h2><button type="button" className="lnk" onClick={() => go("permits")}>{zh ? "全部执照" : "All licenses"}<I.chevR /></button></div>
      <ul className="hs-list hn-list">
        {next.map(a => (
          <li key={a.id}>
            <button type="button" onClick={() => openApp(a.id)}>
              <span className="hs-n"><b>{b(a.name)}</b><small>{b(a.agency)}</small></span>
              <span className="hn-next" title={a.next ? b(a.next) : undefined}>{a.next ? firstSentence(b(a.next)) : ""}</span>
              <span className="hn-fee">{feeText(a, t)}</span>
              <StatusChip s={a.status} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The morning brief, one calm line: renewals due within 30 days, unread replies from agencies, filings with agencies
 *  now. Each part opens where it's kept. Counted from the workspace; a zero is said plainly, never hidden. */
function Brief({ renewals, replies, withAgency }: { renewals: number; replies: number; withAgency: number }) {
  const { lang, go } = useApp();
  const zh = lang === "zh";
  const s = (n: number, one: string, many: string) => (n === 1 ? one : many).replace("{n}", String(n));
  return (
    <nav className="hm-brief" aria-label={zh ? "今日简报" : "Today's brief"}>
      <button type="button" className={renewals ? "on" : ""} title={zh ? "30 天内到期的续期" : "Renewals due within 30 days"} onClick={() => go("permits", "deadlines")}>
        <I.deadlines /><span>{zh ? (renewals ? `30 天内 ${renewals} 项续期` : "30 天内无续期") : renewals ? s(renewals, "1 renewal due soon", "{n} renewals due soon") : "No renewals due soon"}</span>
      </button>
      <button type="button" className={replies ? "on" : ""} onClick={() => go("odelia", "updates")}>
        <I.message /><span>{zh ? (replies ? `${replies} 条机构回复未读` : "没有未读的机构回复") : replies ? s(replies, "1 new agency reply", "{n} new agency replies") : "No new agency replies"}</span>
      </button>
      <button type="button" onClick={() => go("permits", "filed")}>
        <I.clock /><span>{zh ? (withAgency ? `${withAgency} 项在机构审核中` : "目前没有在机构审核的申请") : withAgency ? s(withAgency, "1 with an agency", "{n} with agencies") : "Nothing with an agency"}</span>
      </button>
    </nav>
  );
}

/** The projected opening, Home's second anchor after the one thing to do: the date large, how far off it is, the range,
 *  what it hinges on, the permits behind it and the cost to open. One card, two places: the right column on a wide
 *  screen, under "Do this next" on anything narrower (the column isn't shown there). All from workspaceEstimate. */
function OpeningCard({ landing, est, n, approved, agency, inline }: { landing: string | null; est: ReturnType<typeof workspaceEstimate>; n: number; approved: number; agency: number; inline?: boolean }) {
  const { b, lang, openApp } = useApp();
  const zh = lang === "zh";
  const left = n - approved - agency;
  return (
    <section className={"hs-card hs-open" + (inline ? " hm-open-inline" : "")} aria-labelledby={inline ? "hs-open-h2" : "hs-open-h"}>
      <p className="hs-k"><span id={inline ? "hs-open-h2" : "hs-open-h"}>{zh ? "预计开业" : "Projected opening"}</span>{landing && daysUntil(landing) >= 0 && <span className="hs-when">{b(untilSay(landing))}</span>}</p>
      <p className="hs-date">{landing ? <EstimateDate date={landing} range={est?.path?.range} lang={lang} /> : zh ? "待定" : "Not set yet"}</p>
      {est?.path && <HingeLine hinge={est.path.hinge} lang={lang} onOpen={id => openApp(id, "progress")} className="hs-sub" />}
      <div className="hs-prog">
        <span className="hs-bar" aria-hidden="true"><i style={{ width: `${n ? (approved / n) * 100 : 0}%` }} /><i className="b2" style={{ width: `${n ? (agency / n) * 100 : 0}%` }} /></span>
        <p className="hs-sub">{zh ? `${n} 项许可：已办好 ${approved}，机构审核中 ${agency}，待办 ${left}` : `${n} permits: ${approved} done, ${agency} with the agency, ${left} to do`}</p>
      </div>
      <CostLine noDate />
    </section>
  );
}

/** Home's right column on a wide screen (1200px and up), under the opening card (OpeningCard sits beside "Do this
 *  next" at its height): what Odelia did lately and the next dates,
 *  all from the workspace, so a laptop's width carries the plan beside the one thing to do (Linear's and Stripe's
 *  dashboards). Narrower screens keep the single column; the same lists are under More. */
function HomeSide({ soon }: { soon: Deadline[] }) {
  const { b, lang, go, ws } = useApp();
  const zh = lang === "zh";
  const recent = ws.audit.slice(0, 4);
  // in the first run the head of Home already carries the opening and the money (src/FirstRun.tsx): one of each, not two
  const first = isFirstRun(ws);
  if (first) soon = soon.filter(d => !isOpeningMilestone(d) && !d.id.startsWith("open-"));
  return (
    <aside className="hm-side" aria-label={zh ? "计划概览" : "Plan at a glance"}>
      {recent.length > 0 && (
        <section className="hs-card">
          <div className="hs-h"><h2>{zh ? "最近" : "Recent"}</h2><button type="button" className="lnk" onClick={() => go("settings", "activity")}>{zh ? "全部记录" : "Activity"}<I.chevR /></button></div>
          <ul className="hs-list hs-recent">
            {recent.map(e => <li key={e.id}><span className="hs-t"><b>{b(e.action)}</b>{" "}{b(e.object)}</span><small>{fmtAgo(e.at, lang)}</small></li>)}
          </ul>
        </section>
      )}
      {soon.length > 0 && (
        <section className="hs-card">
          <div className="hs-h"><h2>{zh ? "近期日期" : "Coming up"}</h2><button type="button" className="lnk" onClick={() => go("permits", "deadlines")}>{zh ? "全部日期" : "All dates"}<I.chevR /></button></div>
          <ul className="hs-list hs-dates">
            {soon.map(d => { const k = daysUntil(d.date); return (
              <li key={d.id}><span className="hs-d"><b>{fmtDay(d.date, lang)}</b><small>{fmtIn(k, lang)}</small></span><span className="hs-t">{b(d.title)}</span></li>
            ); })}
          </ul>
        </section>
      )}
    </aside>
  );
}

/* --------------------------------- permits --------------------------------- */

/** Permits: one page for everything you file. To do (yours and Odelia's to finish), Filed (with an agency, the team or
 *  issued), the documents behind them and the dates they set. Find licenses is a button here, not a place of its own. */
export function Permits({ tab: asked }: { tab: PermitsTab }) {
  const { t, ws, go, lang } = useApp();
  const team = useTeam();
  /* Team review: a workspace with two or more stores gets the review table, stores against permits */
  const review = hasReview(ws.stores);
  const tab: PermitsTab = asked === "review" && !review ? "todo" : asked;
  const mine = team.mine && teamOf(team);
  const keep = (a: Application) => !mine || mineApp(team, a.id);
  const todo = ws.apps.filter(a => !FILED.includes(a.status) && keep(a)), filed = ws.apps.filter(a => FILED.includes(a.status) && keep(a));
  const soon = ws.deadlines.filter(d => { const k = daysUntil(d.date); return k >= 0 && k <= 30; }).length;
  const tabs = [
    { id: "todo", label: t("nav_todo"), count: todo.length }, { id: "filed", label: t("nav_filed"), count: filed.length },
    ...(review ? [{ id: "review", label: lang === "zh" ? "按门店" : "By store" }] : []),
    { id: "documents", label: t("nav_docs"), count: ws.docs.length }, { id: "deadlines", label: t("nav_deadlines"), count: soon },
  ];
  const zh = lang === "zh";
  const short = tab === "documents" ? (zh ? "您上传的、快哉准备的、机构发回的文件。" : "What you uploaded, what Placetta prepared, what agencies sent.")
    : tab === "deadlines" ? (zh ? "每个重要日期，按先后排列。" : "Every date that matters, in order.")
    : tab === "review" ? (zh ? "每家门店的每项许可。" : "Every permit at every store.")
    : t("apps_sub_s");
  return (
    <div className="page permits">
      <PageHead title={t("nav_apps")} sub={short} short={short}>
        {ws.apps.length > 0 && <ReportButton />}
        <button type="button" className="pill quiet" onClick={() => go("find")}><I.find />{t("nav_find")}</button>
      </PageHead>
      {/* the tabs and the Everything/Mine filter on one row (Jobs): one fewer row of controls before the first license */}
      <div className="pm-tabrow">
        <Tabs view="permits" tabs={tabs} current={tab} />
        {(tab === "todo" || tab === "filed") && teamOf(team) && (
          <div className="mine-row">
            <MineToggle count={ws.apps.filter(a => mineApp(team, a.id) && (tab === "todo" ? !FILED.includes(a.status) : FILED.includes(a.status))).length} />
          </div>
        )}
      </div>
      {(tab === "todo" || tab === "filed") && (
        <div className="pm-bar">
          <CostLine page />
        </div>
      )}
      {tab === "todo" && <PermitTable rows={todo} empty={mine ? (lang === "zh" ? "没有分配给您的待办许可。" : "Nothing to do is assigned to you.") : t("allClear")} />}
      {tab === "filed" && <PermitTable rows={filed} empty={t("empty")} />}
      {tab === "review" && <PermitsReview />}
      {tab === "documents" && <Documents />}
      {tab === "deadlines" && <Deadlines />}
    </div>
  );
}

function PermitTable({ rows: list, empty }: { rows: Application[]; empty: string }) {
  const { t, b, lang, openApp } = useApp();
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
                    <Working key={a.id} on={false} size="line">{/* the "Preparing" chip already says she is on it; a beam on a borderless row read as a stray line (panels 3, 4) */}
                    {/* a row, not a button, so the agency's own page can be a link inside it (Harvey and Legora link every
                        cited row to its source): the row opens the application, the link opens the page it rests on */}
                    <div className={"tr row" + (a.critical ? " crit" : "")} role="row" tabIndex={0} aria-label={b(a.name)} onClick={() => openApp(a.id)}
                      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openApp(a.id); } }}>
                      <span className="c-name"><b>{b(a.name)}{a.critical && <span className="c-crit-t">{lang === "zh" ? "决定开业日" : "Sets opening date"}</span>}</b><small>{b(a.agency)}</small><small className="c-est2">{b(a.est)}</small>{isPreview(a) && <small className="c-prev">{t("prevTag")}</small>}
                        {a.source.url && <a className="c-src" href={a.source.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          title={a.source.quote ? `“${a.source.quote}”${a.source.checked ? ` (${t("src_checked")} ${a.source.checked})` : ""}` : t("source")}>{a.source.label}<I.ext /></a>}
                        <TeamLine id={a.id} /></span>
                      <span className="c-st"><StatusChip s={a.status} /></span>
                      <span className={"c-fee" + (!feeTotal(a) ? " tbd" : "")}>{!feeTotal(a) && a.fees.some(x => x.tbd) ? (lang === "zh" ? "机构核定" : "Agency sets") : feeText(a, t)}</span>
                      {/* one line a cell: the first sentence, a whole phrase ("Fax: about 4 business days"); all of it on hover and in the sheet */}
                      <span className="c-est" title={b(a.est)}>{firstSentence(b(a.est))}</span>
                      <span className="c-next" title={a.next ? b(a.next) : undefined}>{a.next ? firstSentence(b(a.next)) : ""}</span>
                      {/* a phone reads the fee and the next step as one sentence */}
                      <span className="c-mob">{[feeText(a, t), a.next ? firstSentence(b(a.next)) : ""].filter(Boolean).map(x => x.replace(/[.。]\s*$/, "")).join(lang === "zh" ? "。" : ". ") + (lang === "zh" ? "。" : ".")}</span>
                    </div>
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
      {docs.length ? <div className="files grid">{docs.map(d => <FileCard key={d.id} d={d} extra={<><CommentsButton item={{ kind: "doc", id: d.id }} title={{ en: d.name, zh: d.name }} /><SignButton d={d} /></>} />)}</div> : <p className="quiet tab-empty">{t("empty")}</p>}
    </div>
  );
}

/* -------------------------------- deadlines -------------------------------- */

/** The calendar as Deadlines and Home's Dates show it: the stored deadlines, the last day to appeal each denial (counted
 *  by its rule, src/finish.ts scheduleAppeals) and each opening store's opening where its permits put it (src/smart.ts). */
export const calendar = (ws: Workspace, today: string, ev: Evidence) => withOpenings(scheduleAppeals(ws, today), today, ev);

/** The Deadlines tab of Permits. */
export function Deadlines() {
  const { t, b, ws, lang, ask, openApp, busy } = useApp();
  // the opening is the one the store card shows, worked out from the permits (src/smart.ts withOpenings)
  const ev = useEvidence();
  const list = calendar(ws, daysFromNow(0), ev).sort((x, y) => x.date.localeCompare(y.date));
  const months = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const d of list) { const k = d.date.slice(0, 7); m.set(k, [...(m.get(k) ?? []), d]); }
    return [...m.entries()];
  }, [list]);
  if (!months.length) return <div className="tabbed"><RenewalRunway /><p className="quiet tab-empty">{t("empty")}</p></div>;
  return (
    <div className="tabbed">
      <RenewalRunway />
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
  mention: { label: B("Comment", "评论"), Icon: I.message },
};

/** Updates as rows: each one opens the permit or hands it to Odelia. Home shows the latest few; the Updates tab, all. */
function UpdateList({ items }: { items: import("./model").UpdateItem[] }) {
  const { b, lang, openApp, ask, ws, cloud } = useApp();
  const canUndo = !!cloud && (cloud.owner || cloud.admin);
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
              {app && <button type="button" className="sbtn quiet" onClick={() => openApp(app.id, u.kind === "mention" ? "comments" : undefined)}>{b(B("Open", "打开"))}</button>}
              {u.prompt && <button type="button" className="sbtn ink" onClick={() => ask(b(u.prompt!))}>{b(B("Handle it", "去处理"))}</button>}
              {u.undo && canUndo && <button type="button" className="sbtn warm" onClick={() => void cloud!.undoAsk(u.undo!)}>{b(B("Undo", "撤销"))}</button>}
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
      <HeldSends />
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
  const { b, t, editFact, ws, lang } = useApp();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState("");
  // one-tap fills from the stores' addresses and the same line on the workspace's applications
  const fills = useMemo(() => factSource(ws, f.label.en, lang), [ws, f.label.en, lang]);
  const save = () => { const x = v.trim(); if (x && x !== b(f.value)) editFact(f.id, x); setEdit(false); };
  return (
    <div className="row fact">
      <dt>{b(f.label)}</dt>
      <dd>
        {edit ? (
          <form className="fact-edit" onSubmit={e => { e.preventDefault(); save(); }}>
            <SuggestInput lang={lang} autoFocus value={v} onValue={setV} source={fills} aria-label={b(f.label)} onKeyDown={e => { if (e.key === "Escape") setEdit(false); }} />
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

/** Update the facts by pasting instead of typing (Stripe Atlas and Mercury prefill): an email signature, the website or
 *  an EIN letter's text, read here (src/intakeParse.ts); each value found is a chip to tap, with the words it came from.
 *  A document goes to Documents instead, where Odelia reads it with its quotes. */
function FactImport() {
  const { b, lang, ws, editFact } = useApp();
  const zh = lang === "zh";
  const [text, setText] = useState("");
  const [got, setGot] = useState<Read | null>(null);
  const MAP: [keyof Read, RegExp][] = [["legal", /^legal name$/i], ["owner", /^owner$/i], ["address", /^(storefront|address|store address)$/i], ["ein", /^ein$/i], ["website", /^website$/i], ["phone", /^phone$/i]];
  const offers = got ? MAP.map(([k, re]) => ({ k, f: ws.facts.find(x => re.test(x.label.en) && !x.locked), v: got[k] })).filter(o => o.f && o.v && b(o.f.value) !== o.v.value) : [];
  return (
    <div className="fact-imp">
      <textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder={zh ? "粘贴邮件签名、网站或 EIN 函内容来更新资料" : "Paste an email signature, website or EIN letter to update these"} aria-label={zh ? "粘贴资料" : "Paste anything"} />
      <div className="fact-imp-act">
        <button type="button" className="pill quiet sm" disabled={!text.trim()} onClick={() => setGot(readPasted(text))}>{zh ? "读取" : "Read it"}</button>
        {got && !offers.length && <small>{zh ? "没有可更新的内容。" : "Nothing new to update."}</small>}
        {offers.map(o => <button key={o.k} type="button" className="chip" title={o.v!.quote} onClick={() => { editFact(o.f!.id, o.v!.value); setGot(g => (g ? { ...g, [o.k]: undefined } : g)); }}><I.plus />{b(o.f!.label)}{zh ? "：" : ": "}{o.v!.value}</button>)}
      </div>
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
      <FactImport />
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
  // what kind of business, by its words and NAICS code; where, from the places the registry maps
  const whatSrc = useMemo(() => kindSource(lang), [lang]);
  const whereSrc = useMemo(() => placeSource(lang), [lang]);
  const go = (w = what, p = where) => { const W = w.trim() || b({ en: "Milk tea shop", zh: "奶茶店" }), P = p.trim() || b({ en: "San Jose, CA", zh: "加州圣何塞" }); setWhat(W); setWhere(P); remember("find-what", W); remember("find-where", P); run({ match: { what: W, where: P } }, lang === "zh" ? `查找许可：${W}，${P}` : `Find licenses: ${W} in ${P}`); };
  const examples: [string, string][] = lang === "zh" ? [["奶茶店", "加州圣何塞"], ["奶茶店", "加州弗里蒙特"], ["美发店", "加州奥克兰"]] : [["Milk tea shop", "San Jose, CA"], ["Milk tea shop", "Fremont, CA"], ["Hair salon", "Oakland, CA"]];
  const isFremont = !!result && /fremont|弗里蒙特/i.test(result.where);
  return (
    <div className="page">
      <a className="back" href={hrefOf("permits")} onClick={e => { if (!plainClick(e)) return; e.preventDefault(); nav("permits"); }}><I.chevR />{t("nav_apps")}</a>
      <PageHead title={t("nav_find")} sub={t("fd_sub")} />
      <form className="matcher" onSubmit={e => { e.preventDefault(); go(); }}>
        <label><span>{t("fd_what")}</span><SuggestInput lang={lang} value={what} onValue={setWhat} source={whatSrc} recent="find-what" placeholder={t("fd_whatPh")} /></label>
        <i aria-hidden="true" />
        <label><span>{t("fd_where")}</span><SuggestInput lang={lang} value={where} onValue={setWhere} source={whereSrc} recent="find-where" placeholder={t("fd_wherePh")} /></label>
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
                      <span className="hit-s">{h.source.url ? <a href={h.source.url} target="_blank" rel="noopener noreferrer" title={h.source.quote ? `“${h.source.quote}”${h.source.checked ? ` (${t("src_checked")} ${h.source.checked})` : ""}` : undefined}>{h.source.label}<I.ext /></a> : <em>{t("fd_check")}</em>}</span>
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
