import { useEffect, useMemo, useState } from "react";
import { AgentBot } from "../Bot";
import type { Lang } from "../i18n";
import type { Workspace } from "../model";
import { daysFromNow, fmtDay, money } from "../time";
import { formById, formsEntity } from "../forms/registry";
import { canFileLine, firstRunFacts, restLine, whoFiles, type Who } from "../firstRun";
import { untilSay } from "../FirstRun";
import { estimateSay } from "../smart";
import { HingeLine } from "../OpeningEstimate";
import { ZH_CITIES } from "../plan/line";
import "../firstrun.css";

/* Right after what and where: Odelia builds the plan in front of the owner (Devin's first session: give it the task,
   watch it plan step by step). The plan is the real one, from Placetta's registry, built the moment they pressed
   Start (src/plan/start.ts firstWorkspace, no model call); the rows only appear one after another, a short reveal of
   what's already found (about 100 ms each, never more than 1.6 seconds in all, none with reduced motion).

   Read top to bottom, the way an owner reads it: the answer first (how many licenses, to open where), the two facts
   that follow from it on one line (when it can open, what the agencies charge), then the list, calm: each row its
   number, the license, the agency under it, and on the right who does it and the fee, each in its own column. One
   quiet line for who files what and one for what the date hinges on, then one button. No boxes per row, no stat
   cards: every figure is from the plan (src/firstRun.ts), and the list carries only one number per row. */

const STEP_MS = 100, MAX_MS = 1600;

export function PlanBuild({ lang, ws, place, instant, busy, err, onBack, onNext, onSkip }: {
  lang: Lang; ws: Workspace; place: string; instant?: boolean; busy: boolean; err: string; onBack: () => void; onNext: () => void; onSkip: () => void;
}) {
  const zh = lang === "zh";
  const b = (x: { en: string; zh: string }) => x[lang];
  // the local day, as Home counts it (a UTC day showed a different opening date than Home in the evening)
  const today = daysFromNow(0);
  const f = useMemo(() => firstRunFacts(ws, today), [ws, today]);
  const apps = ws.apps;
  const reduce = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(() => (instant || reduce ? apps.length : 0));
  useEffect(() => {
    if (shown >= apps.length) return;
    const step = Math.min(STEP_MS, Math.floor(MAX_MS / Math.max(1, apps.length)));
    const t = window.setTimeout(() => setShown(n => n + 1), step);
    return () => window.clearTimeout(t);
  }, [shown, apps.length]);
  const done = shown >= apps.length;
  // who does it, in a word or two (the full route is the row's title, as the approval card states it: src/approvalRoute.ts)
  const WHO: Record<Who, [string, string]> = {
    odelia: zh ? ["Odelia 提交", "Odelia 直接提交"] : ["Odelia files", "Odelia files it herself"],
    online: zh ? ["Odelia 稍后提交", "在线提交开通后由 Odelia 提交"] : ["Odelia, later", "Odelia files it once online filing is on"],
    prepares: zh ? ["您来寄出", "Odelia 准备好，您来寄出或提交"] : ["You send", "Odelia prepares it, you send it"],
    you: zh ? ["您本人办", "需要您本人办理"] : ["Yours", "Yours to do, like a staff certificate or a visit in person"],
    confirm: zh ? ["确认中", "Odelia 先向机构确认"] : ["Confirming", "Odelia confirms it with the agency first"],
  };
  const fee = (a: Workspace["apps"][number]) => {
    if (a.abstain) return "";
    const tbd = a.fees.some(x => x.tbd), sum = a.fees.reduce((t, x) => t + x.amount, 0);
    return tbd ? (zh ? "机构定价" : "Set by agency") : sum === 0 ? (zh ? "免费" : "Free") : money(sum, a.currency);
  };
  const can = canFileLine(f), rest = restLine(f);
  const n = apps.length;
  // the steps that form the company: they leave the plan once a legal name says it's formed (src/plan/preview.ts)
  const forming = apps.filter(a => { const o = a.official ? formById(a.official) : undefined; return !!o && formsEntity(o); }).length;
  const range = f.opening && f.range && (f.range.fast !== f.opening || f.range.slow !== f.opening)
    ? b(estimateSay(f.opening, f.range)).slice(fmtDay(f.opening, lang, true).length).replace(/^[,，]\s*/, "") : "";
  // when, said once: "Opening Feb 13, 2027" up top, how far off and its likely range in the quiet line under the list
  const when = f.opening ? (zh ? `${fmtDay(f.opening, lang, true)}开业，${b(untilSay(f.opening))}${range ? `，${range}` : ""}。` : `${b(untilSay(f.opening)).replace(/^./, c => c.toUpperCase())}${range ? `, ${range}` : ""}. `) : "";
  // the city as the owner reads it: 洛杉矶, not Los Angeles, CA
  const at = zh ? ZH_CITIES.find(([, en]) => en === place)?.[2] ?? place : place;
  return (
    <div className="gate-card wide pv" data-plan-build={done ? "done" : "building"}>
      {done ? (
        <header className="pv-head">
          <h1 aria-live="polite">{zh ? `在${/^[A-Za-z0-9]/.test(at) ? " " + at + " " : at}开业需要 ${n} 项执照和许可` : `${n} license${n === 1 ? "" : "s"} to open in ${at}`}</h1>
          <p className="pv-facts">
            {f.opening && <span>{zh ? "预计开业" : "Opening"} <b>{fmtDay(f.opening, lang, true)}</b></span>}
            {f.published > 0 && <span>{zh ? "机构费用" : "Agency fees"} <b>{money(f.agencyUSD)}</b> <small>{f.unpublished ? (zh ? `另有 ${f.unpublished} 项由机构定价` : `plus ${f.unpublished} set by the agency`) : (zh ? "全部已公布" : "all published")}</small></span>}
          </p>
        </header>
      ) : (
        <header className="pv-building">
          <span className="pv-bot" aria-hidden="true"><AgentBot size={40} busy interactive={false} /></span>
          <p aria-live="polite"><b>{zh ? "Odelia 正在梳理您的计划…" : "Odelia is building your plan…"}</b> {zh ? `已找到 ${shown} 项` : `Found ${shown} so far`}</p>
        </header>
      )}
      <ul className="pv-list" aria-label={zh ? "开业所需的执照和许可，按机构要求的顺序" : "Licenses and permits to open, in the order the agencies want them"}>
        {apps.slice(0, shown).map((a, i) => {
          const who = whoFiles(a), fe = fee(a), [word, full] = WHO[who];
          return (
            <li key={a.id}>
              <span className="pv-n">{i + 1}</span>
              <span className="pv-name"><b>{b(a.name)}</b><small>{b(a.agency)}</small></span>
              <span className={"pv-who pv-" + who} title={full}>{word}</span>
              <span className="pv-fee">{fe}</span>
            </li>
          );
        })}
      </ul>
      {done && (
        <>
          {(can || rest) && <p className="pv-note">{can ? b(can) : ""}{can && rest && !zh ? " " : ""}{rest ? b(rest) : ""}</p>}
          {f.opening && (f.hinge.length ? <HingeLine hinge={f.hinge} lang={lang} className="pv-note" lead={when} />
            : <p className="pv-note">{when}</p>)}
          <div className="pv-act">
            <button type="button" className="pv-link" disabled={busy} onClick={onBack}>{zh ? "返回" : "Back"}</button>
            <span className="pv-go">
              <button type="button" className="pv-link" disabled={busy} onClick={onSkip} data-plan-skip="">{zh ? "先看计划" : "Go to my plan"}</button>
              <button type="button" className="sbtn ink big" disabled={busy} onClick={onNext} data-plan-next="" autoFocus>{busy ? "…" : zh ? "填写第一份申请" : "Fill my first application"}</button>
            </span>
          </div>
          <p className="pv-hint">{zh ? "回答 3 个问题，Odelia 就能填好第一份申请，等您批准。" : "3 answers and Odelia fills your first application, ready for you to approve."}
            {forming > 0 && (zh ? `公司已经注册？告诉她法定名称，注册公司的 ${forming} 项就会从计划中去掉。` : ` Company already formed? Give its legal name and the ${forming} formation step${forming === 1 ? "" : "s"} drop${forming === 1 ? "s" : ""} off.`)}</p>
        </>
      )}
      {err && <p className="gate-err" role="alert">{err}</p>}
    </div>
  );
}
