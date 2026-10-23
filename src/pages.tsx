import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { useApp, type PermitsTab, type View } from "./ctx";
import type { Approval, Application, Fact, FactGroup, Level, LicenseHit, Status } from "./model";
import { daysFromNow, daysUntil, fmtAgo, fmtDay, fmtIn, fmtMonth, fmtStamp, money } from "./time";
import { FileCard, Footer, I, Modal, Pill, StatusChip, feeText, feeTotal } from "./ui";
import { openingPath } from "./smart";
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
/* Team review: the review table, comments on documents, and the Mine filter (src/ReviewTable.tsx, src/Comments.tsx) */
import { hasReview, PermitsReview } from "./ReviewTable";
import { CommentsButton, MineToggle, useTeam, type Collab } from "./Comments";
import { SignButton } from "./SignDoc";
import { shortName } from "./collab";
import { AlsoNeed } from "./AlsoNeed";
import { findItAsk } from "./StillNeeded";
import { headline, nextRenewal, todos, type Todo } from "./doNext";
import { readPasted, type Read } from "./intakeParse";

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
      ) : hold ? <LocalHold hold={hold} compact /> : <Pill onClick={() => openApproval(a.id)} disabled={busy} sm={compact}>{t("approve")}</Pill>}
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
   "Get started" checklist). The order of what to do is src/doNext.ts. */

type HomeTab = "plan" | "dates" | "updates" | "month" | "stores" | "also";
const HOME_TAB = "placetta-home-tab";
const readTab = (): HomeTab => { try { const v = localStorage.getItem(HOME_TAB); if (v && ["plan", "dates", "updates", "month", "stores", "also"].includes(v)) return v as HomeTab; } catch { /* storage blocked */ } return "plan"; };

/** The one primary button a to-do needs: Approve opens the approval (you confirm there), Upload opens the file picker on
 *  the document it's for, Pay opens the agency's page. big: the "Do this next" card's. */
function TodoButton({ x, big }: { x: Todo; big?: boolean }) {
  const { b, t, busy, openApproval, openApp, approve, upload, go } = useApp();
  const pick = useRef<HTMLInputElement>(null);
  const hold = useApprovalHold(x.kind === "approval" ? x.a.id : "");
  const cls = "pill " + (big ? "ink dtn-go" : "primary sm");
  const btn = (label: string, on: () => void) => <button type="button" className={cls} disabled={busy} onClick={on}><span>{label}</span><i aria-hidden="true"><I.arrow /></i></button>;
  const picker = (app: string, item: string) => <input ref={pick} type="file" hidden multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) upload(app, item, f); }} />;
  if (x.kind === "doc") return <>{btn(b(B("Photo or file", "拍照或上传")), () => pick.current?.click())}{picker(x.app.id, x.item)}</>;
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

/** Why it's first, in one line: its date, that the opening waits on it, or what happens once you act. */
function whyLine(x: Todo, lang: "en" | "zh", t: (k: Key) => string): string {
  const zh = lang === "zh";
  const parts: string[] = [];
  if (x.due && x.days != null) parts.push(x.days < 0 ? (zh ? `已过期 ${-x.days} 天。` : `${-x.days} day${x.days === -1 ? "" : "s"} late.`) : zh ? `${fmtDay(x.due.date, lang)}到期，${fmtIn(x.days, lang)}。` : `Due ${fmtDay(x.due.date, lang)}, ${fmtIn(x.days, lang).toLowerCase()}.`);
  if (x.blocks) parts.push(zh ? "开业日期取决于这一项。" : "Your opening date waits on this.");
  if (x.kind === "approval") {
    const a = x.a, fee = a.kind === "pay" ? a.fee ?? 0 : x.app && a.kind === "file" ? feeTotal(x.app) : 0;
    const say = {
      file: zh ? "Odelia 已填好，您批准后她就提交。" : "Odelia filled it in. She files it once you approve.",
      send: zh ? "Odelia 已写好，您批准后才会发出。" : "Odelia wrote it. Nothing goes out until you approve.",
      upload: zh ? "缺少这些文件，申请就交不了。" : "The application can't go in without it.",
      pay: zh ? "机构收到付款后才会继续办理。" : "The agency moves on once it's paid.",
      change: zh ? "您确认之前，Odelia 不会做任何更改。" : "Odelia changes nothing until you confirm.",
    }[a.kind];
    if (!x.blocks || a.kind !== "upload") parts.push(say);
    if (fee && x.app) parts.push(zh ? `费用 ${feeText(x.app, t)}，直接付给机构。` : `Fee ${feeText(x.app, t)}, paid to the agency.`);
    else if (fee) parts.push(zh ? `费用 ${money(fee)}。` : `Fee ${money(fee)}.`);
  } else if (x.kind === "doc") {
    if (!x.blocks) parts.push(zh ? `${x.app.name.zh}需要它才能提交。` : `The ${x.app.name.en.charAt(0).toLowerCase() + x.app.name.en.slice(1)} needs it to go in.`);
  } else if (x.job.waiting) parts.push(zh ? x.job.waiting.zh : x.job.waiting.en);
  return parts.join(" ");
}

/** The single most important thing, with one big button and a why line. Not now moves it to the end for this visit. */
function DoNextCard({ x, n, onLater, docs }: { x: Todo; n: number; onLater?: () => void; docs?: { i: number; of: number } }) {
  const { b, t, lang, busy, ask } = useApp();
  const zh = lang === "zh";
  return (
    <section className="dtn" data-do-next={x.key} aria-labelledby="dtn-h">
      <p className="dtn-k">{zh ? "下一步" : "Do this next"}{docs && docs.of > 1 ? <span>{zh ? `还需要的文件，第 ${docs.i} 项，共 ${docs.of} 项` : `Document ${docs.i} of ${docs.of}`}</span> : null}</p>
      <h2 id="dtn-h">{b(headline(x))}</h2>
      <p className="dtn-why">{whyLine(x, lang, t)}</p>
      <div className="dtn-act">
        <TodoButton x={x} big />
        {x.kind === "doc" && <button type="button" className="lnk" disabled={busy} onClick={() => ask(b(findItAsk(x.label, x.app.name)))}>{zh ? "帮我找" : "Find it for me"}</button>}
        {onLater && n > 1 && <button type="button" className="lnk quiet" onClick={onLater}>{x.kind === "doc" ? (zh ? "跳过" : "Skip") : (zh ? "稍后再说" : "Not now")}</button>}
      </div>
    </section>
  );
}

/** One row of "Waiting on you": what it is, and its one button. */
function TodoRow({ x }: { x: Todo }) {
  const { b, lang, busy, ask } = useApp();
  if (x.kind === "approval") return <NeedRow a={x.a} compact />;
  if (x.kind === "job") return <PlanCard job={x.job} compact actions />;
  const zh = lang === "zh";
  return (
    <div className="appr compact k-doc">
      <span className="appr-ico k-upload"><I.clip /></span>
      <span className="appr-tx"><b>{b(headline(x))}</b><span>{b(x.app.name)}</span></span>
      <span className="appr-btns">
        <button type="button" className="lnk" disabled={busy} onClick={() => ask(b(findItAsk(x.label, x.app.name)))}>{zh ? "帮我找" : "Find it for me"}</button>
        <TodoButton x={x} />
      </span>
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
  if (!n) return <Welcome />;
  const zh = lang === "zh";
  const today = daysFromNow(0);
  const c = (s: Status[]) => ws.apps.filter(a => s.includes(a.status)).length;
  /* Team review: Mine keeps what's assigned to this person (and the jobs about it) in each section below */
  const mine = team.mine && teamOf(team);
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
  const working = chiefs.length + running.length + ws.running.length + withAgency.length > 0 || queued.length > 0 || routines.length > 0 || (busy && !!live);
  const steps = (j: { steps: { done: boolean }[] }) => zh ? `${j.steps.filter(s => s.done).length}/${j.steps.length} 步` : `${j.steps.filter(s => s.done).length} of ${j.steps.length} steps`;

  /* 3. All set: what's issued */
  const done = ws.apps.filter(a => a.status === "approved" && (!mine || mineApp(team, a.id)));

  /* the opening date, only where the plan or a store's path gives one */
  const fp = ws.firstPlan;
  const previews = ws.apps.filter(isPreview).length;
  const landing = fp?.projectedOpen
    ?? (ws.stores ?? []).filter(s => s.stage === "opening").map(s => openingPath(s, ws, today).landing).filter((d): d is string => !!d).sort().at(-1) ?? null;
  const renewal = nextRenewal(ws, today);

  /* behind the tabs: the plan, the dates, the updates, this month, the stores, and what else a business may need */
  const nextUp = [...ws.apps].filter(a => a.status !== "approved" && (!mine || mineApp(team, a.id))).sort(byPriority).slice(0, 3);
  const biz = b(ws.business), place = ws.locations[0] ? b(ws.locations[0].name) : "", goal = b(ws.goal);
  const at = (ws.stores ?? []).length === 1 && /^\d/.test(ws.stores![0].address ?? "") ? ws.stores![0].address! : "";
  const base = place ? biz.replace(` in ${place}`, "").replace(place, "").trim() : biz;
  const ctxParts = [at ? (!base ? at : zh ? `${base}，${at}` : `${base} at ${at}`) : place && !biz.includes(place) ? t("ov_in", { biz, place }) : biz, goal].filter(Boolean);
  const ctxLine = ctxParts.length ? ctxParts.join(zh ? "。" : ". ") + (zh ? "。" : ".") : "";
  const soon = [...ws.deadlines].filter(d => daysUntil(d.date) >= 0).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 5);
  const latest = updates.slice(0, 3);
  const tabs: { id: HomeTab; label: string; on: boolean }[] = ([
    { id: "plan", label: zh ? "开店计划" : "Your plan", on: true },
    { id: "dates", label: zh ? "日期" : "Dates", on: soon.length > 0 },
    { id: "updates", label: zh ? "动态" : "Updates", on: latest.length > 0 || ws.nudges.length > 0 },
    { id: "month", label: zh ? "本月" : "This month", on: true },
    { id: "stores", label: t("nav_stores"), on: (ws.stores ?? []).length > 0 },
    { id: "also", label: zh ? "其他事项" : "Also check", on: !!fp?.also?.length },
  ] as { id: HomeTab; label: string; on: boolean }[]).filter(x => x.on);
  const cur = tabs.some(x => x.id === tab) ? tab : "plan";

  return (
    <div className="page home">
      <header className="hm-top">
        <div className="hm-bot"><AgentBot size={64} busy={busy} task={busy ? live?.state : undefined} gaze={[0, 2.4]} /></div>
        <div className="hm-tx">
          <h1>{biz}</h1>
          <div className="progress" aria-label={zh ? `${n} 项许可已办好 ${approved} 项` : `${approved} of ${n} permits done`}>
            <span className="bar"><i style={{ width: `${(approved / n) * 100}%` }} /><i className="b2" style={{ width: `${(agency / n) * 100}%` }} /></span>
            <span className="pl">{zh ? `已办好 ${approved}/${n} 项许可` : `${approved} of ${n} permits done`}{agency > 0 && <small>{zh ? `，${agency} 项在机构审核` : `, ${agency} with the agency`}</small>}</span>
          </div>
          {landing && <p className="hm-open"><I.deadlines />{zh ? `预计 ${fmtDay(landing, lang, true)} 前后开业` : `Likely opening ${fmtDay(landing, lang, true)}`}</p>}
        </div>
      </header>

      {teamOf(team) && (
        <div className="mine-row">
          <MineToggle count={mineN} />
          {mine && <p className="mine-note">{zh ? "只显示分配给您的申请和工作。" : "Showing only the applications and jobs assigned to you."}</p>}
        </div>
      )}

      {top ? <DoNextCard x={top} n={ordered.length} docs={docAt} onLater={() => setLater(l => [...l.filter(k => k !== top.key), top.key])} /> : (
        <section className="hm-calm" aria-live="polite">
          <span className="hm-calm-i" aria-hidden="true"><I.check /></span>
          <h2>{mine ? (zh ? "没有分配给您、需要处理的事项。" : "Nothing assigned to you needs you.") : zh ? "都办好了。" : "You're all set."}</h2>
          <p>{zh ? "有需要您处理的事，Odelia 会告诉您。" : "Odelia will tell you when something needs you."}</p>
          {renewal && <p className="hm-calm-r">{zh ? `下次续期：${b(renewal.title)}，${fmtDay(renewal.date, lang, true)}` : `Next renewal: ${b(renewal.title)}, ${fmtDay(renewal.date, lang, true)}`}</p>}
        </section>
      )}

      {rest.length > 0 && (
        <section className="sec hm-needs">
          <SecHead title={zh ? "等您处理" : "Waiting on you"} count={rest.length} />
          {all && !mine && <BatchApprove />}
          <div className="stack">{shown.map(x => <TodoRow key={x.key} x={x} />)}</div>
          {all && docsAll.length > 1 && <button type="button" className="lnk more" disabled={busy} onClick={() => ask(b(findItAsk(B(docsAll.slice(0, 8).map(x => x.kind === "doc" ? `${x.label.en} (${x.app.name.en})` : "").join("; "), docsAll.slice(0, 8).map(x => x.kind === "doc" ? `${x.label.zh}（${x.app.name.zh}）` : "").join("；")), B("open applications", "进行中的申请"), true)))}><I.spark />{zh ? `把 ${docsAll.length} 份文件都交给 Odelia 找` : `Have Odelia find all ${docsAll.length} documents`}</button>}
          {rest.length > 3 && <button type="button" className="lnk more" onClick={() => setAll(!all)}>{all ? (zh ? "收起" : "Show fewer") : (zh ? `查看全部 ${rest.length} 项` : `See all ${rest.length}`)}</button>}
        </section>
      )}

      {working && (
        <section className="sec hm-work">
          <SecHead title={t("hm_working")} more={unread ? (zh ? `动态 ${unread}` : `Updates ${unread}`) : zh ? "动态" : "Updates"} onMore={() => go("odelia", "updates")} />
          <LiveLine />
          <ul className="wls">
            {chiefs.map(j => <WorkLine key={j.id} title={b(j.title)} status={zh ? "多家门店同时进行" : "Across your stores"}><ChiefRow job={j} compact /></WorkLine>)}
            {running.map(j => <WorkLine key={j.id} title={b(j.title)} status={steps(j)}><PlanCard job={j} compact /></WorkLine>)}
            {withAgency.map(a => { const d = decision(a.id); return <WorkLine key={a.id} title={b(a.name)} status={d ? (zh ? `机构审核中，预计 ${fmtDay(d.date, lang)} 出结果` : `With the agency, decision ${fmtDay(d.date, lang)}`) : zh ? "机构审核中" : "With the agency"} onOpen={() => openApp(a.id, "progress")} />; })}
            {ws.running.map(r => <li key={r.id}><div className="wl"><TaskBot id={r.id} label={b(r.label)} /><b>{b(r.label)}</b>{r.detail && <span>{b(r.detail)}</span>}</div></li>)}
            {queued.length > 0 && <li><div className="wl"><b>{zh ? `${queued.length} 项排队中` : `${queued.length} waiting in line`}</b><span>{zh ? "当前任务完成后开始" : "Next when she finishes"}</span></div></li>}
            {routineLine && <WorkLine title={routineLine} status={zh ? "例行任务" : "Routines"} onOpen={() => go("odelia", "work")} />}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <details className="sec hm-done">
          <summary><span>{zh ? "已办好" : "All set"}</span><em>{done.length}</em><I.chevR /></summary>
          <div className="tray">{done.map(a => <AppRow key={a.id} a={a} />)}</div>
        </details>
      )}

      <section className="sec hm-more" aria-label={zh ? "更多" : "More"}>
        <nav className="ptabs hm-tabs" role="tablist">
          {tabs.map(x => <button key={x.id} type="button" role="tab" aria-selected={x.id === cur} onClick={() => setTab(x.id)}>{x.label}</button>)}
        </nav>
        <div role="tabpanel" className="hm-panel">
          {cur === "plan" && (
            <div className="hm-plan">
              <div className="plan-card">
                {ctxLine && <p className="ctx">{ctxLine}</p>}
                <p className="plan-sum">{t(n === 1 ? "hm_plan1" : "hm_planN", { n, a: approved, r: agency, t: n - approved - agency })}</p>
                {landing && <p className="plan-open"><I.deadlines />{t("hm_open", { d: fmtDay(landing, lang, true) })}</p>}
                <CostLine />
                {nextUp.length > 0 && (
                  <>
                    <p className="plan-h">{t("hm_next")}</p>
                    <ol className="plan-next">
                      {nextUp.map((a, i) => <li key={a.id}><span className="plan-n">{i + 1}</span><AppRow a={a} /></li>)}
                    </ol>
                  </>
                )}
                {previews > 0 && <p className="plan-note"><I.spark />{t("hm_preview")}</p>}
                <div className="plan-act">
                  <button type="button" className="pill quiet sm" onClick={() => go("permits")}>{zh ? "全部许可" : "All permits"}<I.chevR /></button>
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
      </section>
      <Footer />
    </div>
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
  const sub = tab === "documents" ? t("docs_sub") : tab === "deadlines" ? t("dl_sub") : tab === "review"
    ? (lang === "zh" ? "每家门店的每项许可一目了然：状态、下一个日期，点开即可处理。可以多选后一起交给 Odelia、分配或设置提醒。" : "Every permit at every store in one table: its state and next date, one click from the application. Pick several to hand to Odelia, assign or remind.")
    : t("apps_sub");
  return (
    <div className="page permits">
      <PageHead title={t("nav_apps")} sub={sub}>
        <button type="button" className="pill quiet" onClick={() => go("find")}><I.find />{t("nav_find")}</button>
      </PageHead>
      <Tabs view="permits" tabs={tabs} current={tab} />
      {(tab === "todo" || tab === "filed") && <CostLine page />}
      {(tab === "todo" || tab === "filed") && teamOf(team) && (
        <div className="mine-row">
          <MineToggle count={ws.apps.filter(a => mineApp(team, a.id) && (tab === "todo" ? !FILED.includes(a.status) : FILED.includes(a.status))).length} />
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
                    {/* a row, not a button, so the agency's own page can be a link inside it (Harvey and Legora link every
                        cited row to its source): the row opens the application, the link opens the page it rests on */}
                    <div className={"tr row" + (a.critical ? " crit" : "")} role="row" tabIndex={0} aria-label={b(a.name)} onClick={() => openApp(a.id)}
                      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openApp(a.id); } }}>
                      <span className="c-name"><b>{b(a.name)}</b><small>{b(a.agency)}</small><small className="c-est2">{b(a.est)}</small>{isPreview(a) && <small className="c-prev">{t("prevTag")}</small>}
                        {a.source.url && <a className="c-src" href={a.source.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          title={a.source.quote ? `“${a.source.quote}”${a.source.checked ? ` (${t("src_checked")} ${a.source.checked})` : ""}` : t("source")}>{a.source.label}<I.ext /></a>}
                        <TeamLine id={a.id} /></span>
                      <span className="c-st"><StatusChip s={a.status} /></span>
                      <span className="c-fee">{feeText(a, t)}</span>
                      <span className="c-est">{b(a.est)}</span>
                      <span className="c-next">{a.critical && <em>{t("critical")}</em>}{a.next ? b(a.next) : ""}</span>
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
  mention: { label: B("Comment", "评论"), Icon: I.message },
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
              {app && <button type="button" className="sbtn quiet" onClick={() => openApp(app.id, u.kind === "mention" ? "comments" : undefined)}>{b(B("Open", "打开"))}</button>}
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
