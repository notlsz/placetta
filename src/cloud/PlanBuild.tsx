import { useEffect, useMemo, useState } from "react";
import { AgentBot } from "../Bot";
import type { Lang } from "../i18n";
import type { Workspace } from "../model";
import { daysFromNow, money } from "../time";
import { formById, formsEntity } from "../forms/registry";
import { canFileLine, firstRunFacts, needLine, restLine, whoFiles, type Who } from "../firstRun";
import { FirstStats } from "../FirstRun";
import "../firstrun.css";

/* Right after what and where: Odelia builds the plan in front of the owner (Devin's first session: give it the task,
   watch it plan step by step). The plan is the real one, from Placetta's registry, built the moment they pressed
   Start (src/plan/start.ts firstWorkspace, no model call); the rows only appear one after another, a short reveal of
   what's already found (about 100 ms each, never more than 1.6 seconds in all, none with reduced motion). Then the
   outcome, every figure from that plan (src/firstRun.ts), and one button: three answers and the first application is
   filled, ready to approve. Skipping goes straight to the plan. */

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
  // the same route the approval card states (src/approvalRoute.ts)
  const WHO: Record<Who, string> = { odelia: zh ? "Odelia 提交" : "Odelia files", online: zh ? "在线提交开通后由 Odelia 提交" : "Odelia, once online filing is on", prepares: zh ? "Odelia 准备，您寄出" : "Odelia prepares, you send",
    you: zh ? "您本人办理" : "Yours to do", confirm: zh ? "先向机构确认" : "Confirming first" };
  const fee = (a: Workspace["apps"][number]) => {
    if (a.abstain) return "";
    const tbd = a.fees.some(x => x.tbd), sum = a.fees.reduce((t, x) => t + x.amount, 0);
    return tbd ? (zh ? "机构定价" : "Set by agency") : sum === 0 ? (zh ? "免费" : "Free") : money(sum, a.currency);
  };
  const can = canFileLine(f), rest = restLine(f);
  // the steps that form the company: they leave the plan once a legal name says it's formed (src/plan/preview.ts)
  const forming = apps.filter(a => { const o = a.official ? formById(a.official) : undefined; return !!o && formsEntity(o); }).length;
  return (
    <div className="gate-card wide pb" data-plan-build={done ? "done" : "building"}>
      <div className="pb-top">
        <div className="pb-bot" aria-hidden="true"><AgentBot size={52} busy={!done} interactive={false} /></div>
        <p aria-live="polite">
          <b>{done ? (zh ? `${place}的开业计划已梳理好` : `Your plan for ${place}`) : (zh ? "Odelia 正在梳理您的计划…" : "Odelia is building your plan…")}</b>
          {done ? (zh ? `按机构要求的顺序，共 ${apps.length} 项，来自快哉的官方表格库。` : `${apps.length} in the order the agencies want them, from Placetta's library of official forms.`)
            : (zh ? `已找到 ${shown} 项` : `Found ${shown} so far`)}
        </p>
      </div>
      <ol className="pb-list" aria-label={zh ? "开业所需的执照和许可" : "Licenses and permits to open"}>
        {apps.slice(0, shown).map((a, i) => {
          const who = whoFiles(a), fe = fee(a);
          return (
            <li key={a.id}>
              <span className="pb-n">{i + 1}</span>
              <span className="pb-name">{b(a.name)}<small>{b(a.agency)}</small></span>
              <span className="pb-fee">{fe}<small className={"pb-who pb-" + who}>{WHO[who]}</small></span>
            </li>
          );
        })}
      </ol>
      {done && (
        <>
          <div className="pb-sum">
            <h1>{b(needLine(f))}{can && <> <em>{b(can)}</em></>}</h1>
            {rest && <p className="fr-rest">{b(rest)}</p>}
            <FirstStats f={{ ...f, ready: null }} lang={lang} />
          </div>
          <div className="onb-act">
            <button type="button" className="sbtn quiet" disabled={busy} onClick={onBack}>{zh ? "返回" : "Back"}</button>
            <button type="button" className="sbtn line" disabled={busy} onClick={onSkip} data-plan-skip="">{zh ? "先看计划" : "Go to my plan"}</button>
            <button type="button" className="sbtn ink big" disabled={busy} onClick={onNext} data-plan-next="" autoFocus>{busy ? "…" : zh ? "填写第一份申请" : "Fill my first application"}</button>
          </div>
          <p className="pb-hint">{zh ? "回答 3 个问题，Odelia 就能填好第一份申请，等您批准。" : "3 answers and Odelia fills your first application, ready for you to approve."}
            {forming > 0 && (zh ? `公司已经注册？告诉她法定名称，注册公司的 ${forming} 项就会从计划中去掉。` : ` Company already formed? Give its legal name and the ${forming} formation step${forming === 1 ? "" : "s"} drop${forming === 1 ? "s" : ""} off.`)}</p>
        </>
      )}
      {err && <p className="gate-err" role="alert">{err}</p>}
    </div>
  );
}
