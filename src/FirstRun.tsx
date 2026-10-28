import { useEffect, useMemo, useState } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./bi";
import { daysFromNow, daysUntil, fmtDay, money } from "./time";
import { I } from "./ui";
import { useEvidence } from "./evidence";
import { taskVerb } from "./tasks";
import { canFileLine, firstRunFacts, needLine, nowLine, restLine, whoFiles, type FirstRun } from "./firstRun";
import { CheckList, ChecksSheet } from "./Checks";
import { TrustShare } from "./TrustShare";
import { openSettings } from "./Settings";
import { useTeam } from "./Comments";
import "./firstrun.css";

/* Home in the first run (src/firstRun.ts): the outcome first, then the one thing to do, then what stands between the
   store and opening, then a short setup list that never blocks anything. Every figure is computed from the plan. */

export function useFirstRun(): FirstRun {
  const { ws } = useApp();
  const ev = useEvidence();
  return useMemo(() => firstRunFacts(ws, daysFromNow(0), ev), [ws, ev]);
}

/** "about 11 weeks", or days when it's close. */
export function untilSay(iso: string): Bi {
  const d = Math.max(0, daysUntil(iso));
  if (d < 21) return B(`in about ${d} day${d === 1 ? "" : "s"}`, `约 ${d} 天后`);
  const w = Math.round(d / 7);
  return B(`in about ${w} weeks`, `约 ${w} 周后`);
}

/** The three numbers an owner asks first: what the agencies charge, when it opens, how ready it is. Each from the plan;
 *  a number that isn't known isn't shown. */
export function FirstStats({ f, lang }: { f: FirstRun; lang: "en" | "zh" }) {
  const zh = lang === "zh";
  const b = (x: Bi) => x[lang];
  return (
    <dl className="fr-stats">
      {f.published > 0 && (
        <div className="fr-stat">
          <dt>{zh ? "机构费用" : "Agency fees"}</dt>
          <dd><b>{money(f.agencyUSD)}</b><small>{f.unpublished ? (zh ? `另有 ${f.unpublished} 项由机构定价` : `plus ${f.unpublished} set by the agency`) : (zh ? "全部已公布" : "all published")}</small></dd>
        </div>
      )}
      {f.opening && (
        <div className="fr-stat">
          <dt>{zh ? "预计开业" : "Expected opening"}</dt>
          <dd><b>{fmtDay(f.opening, lang, true)}</b><small>{b(untilSay(f.opening))}</small></dd>
        </div>
      )}
      {f.ready && (
        <div className="fr-stat">
          <dt>{zh ? "开业就绪" : "Ready to open"}</dt>
          <dd><b>{f.ready.score}%</b><small>{zh ? `已签发 ${f.ready.issued}/${f.ready.total}` : `${f.ready.issued} of ${f.ready.total} issued`}</small></dd>
        </div>
      )}
    </dl>
  );
}

/** The top of Home in the first run: the problem in one sentence, how much of it Odelia takes, the numbers, and what
 *  she is doing right now. */
export function FirstRunHead() {
  const { b, lang, busy, live, ws } = useApp();
  const f = useFirstRun();
  const zh = lang === "zh";
  const open = (ws.stores ?? []).length > 0 && (ws.stores ?? []).every(s => s.stage === "open");
  const can = canFileLine(f), rest = restLine(f);
  const running = busy && live ? B(`${taskVerb(live.state).en}: ${live.label.en}`, `${taskVerb(live.state).zh}：${live.label.zh}`) : null;
  return (
    <section className="fr-head" aria-labelledby="fr-h" data-first-run="">
      <p className="fr-k">{zh ? "您的开业计划" : "Your opening plan"}{f.ms != null && <span>{zh ? `Odelia 用时 ${(Math.max(1, Math.round(f.ms / 100)) / 10).toString()} 秒梳理` : `Mapped by Odelia in ${(Math.max(1, Math.round(f.ms / 100)) / 10).toString()} seconds`}</span>}</p>
      <h2 id="fr-h">{b(needLine(f, open))}{can && <> <em>{b(can)}</em></>}</h2>
      {rest && <p className="fr-rest">{b(rest)}</p>}
      <FirstStats f={f} lang={lang} />
      <p className="fr-now" aria-live="polite"><span className={"fr-pulse" + (running ? " on" : "")} aria-hidden="true" /><b>{zh ? "Odelia 现在" : "Odelia right now"}</b><span>{b(nowLine(ws, f, running))}</span></p>
      {f.filled > 0 && <p className="fr-done"><I.check />{zh ? `已根据您的注册信息填好 ${f.filled} 栏表格` : `${f.filled} form line${f.filled === 1 ? "" : "s"} already filled from your signup`}</p>}
    </section>
  );
}

/** With nothing waiting on the owner yet (they skipped the three answers), the first action is still one button: have
 *  Odelia fill the first application she can file herself. Never "You're all set" on a plan with nothing filed. */
export function FirstAction({ title }: { title: string }) {
  const { b, lang, busy, ask, ws } = useApp();
  const zh = lang === "zh";
  const app = ws.apps.find(a => a.status !== "approved" && whoFiles(a) === "odelia") ?? ws.apps.find(a => a.status !== "approved");
  if (!app) return null;
  const go = () => ask(b(B(`Fill the ${app.name.en} from my business facts, put it up for my approval, and tell me what you still need from me.`, `用我的资料填写${app.name.zh}，提交给我批准，并告诉我还需要我提供什么。`)));
  return (
    <section className="dtn" data-do-next="first" aria-labelledby="dtn-h">
      <h1 className="vh">{title}</h1>
      <p className="dtn-k">{zh ? "下一步" : "Do this next"}</p>
      <h2 id="dtn-h">{zh ? `填写您的第一份申请：${app.name.zh}` : `Fill your first application: ${app.name.en}`}</h2>
      <p className="dtn-why">{zh ? "Odelia 用您的资料填写，缺什么会一次问清。填好后由您批准才会提交。" : "Odelia fills it from what you've told her and asks once for anything missing. Nothing is filed until you approve."}</p>
      <div className="dtn-act">
        <button type="button" className="pill ink dtn-go" disabled={busy} onClick={go}><span>{zh ? "让 Odelia 填写" : "Have Odelia fill it"}</span><i aria-hidden="true"><I.arrow /></i></button>
      </div>
    </section>
  );
}

const SKIP = "placetta-setup-skip-";
const SHARED = "placetta-setup-shared-";
const read = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const keep = (k: string) => { try { localStorage.setItem(k, "1"); } catch { /* storage blocked */ } };

/** Under the first action: what stands between the store and opening (Vanta's failing tests, each with its fix), then
 *  three optional setup steps (Drata's Quick Start, never a wall: skip it and it's gone). */
export function FirstRunMore() {
  const { lang, go, cloud, ws } = useApp();
  const team = useTeam();
  const f = useFirstRun();
  const zh = lang === "zh";
  const id = cloud?.wsId ?? "sample";
  const [all, setAll] = useState(false);
  const [trust, setTrust] = useState(false);
  const [skipped, setSkipped] = useState(() => read(SKIP + id));
  const [shared, setShared] = useState(() => read(SHARED + id));
  useEffect(() => { const on = () => { keep(SHARED + id); setShared(true); }; window.addEventListener("placetta:trust", on); return () => window.removeEventListener("placetta:trust", on); }, [id]);
  const steps = [
    { k: "email", show: true, done: !!cloud?.integrations.some(i => ["gmail", "outlook_mail", "mailbox"].includes(i.kind) && i.status === "connected"),
      t: zh ? "连接邮箱" : "Connect your email", s: zh ? "机构回信当天就能看到并处理。" : "Agency replies get read and handled the day they arrive.", on: () => openSettings(go, "integrations") },
    { k: "team", show: !!cloud, done: team.people.length > 1,
      t: zh ? "添加同事" : "Add a teammate", s: zh ? "店长或合伙人一起看进度、批准申请。" : "A manager or partner sees progress and can approve.", on: () => openSettings(go, "team") },
    { k: "share", show: (ws.stores ?? []).length > 0, done: shared,
      t: zh ? "共享状态页" : "Share your status page", s: zh ? "给房东或合作方一个链接，随时查看执照进度。" : "One link for a landlord or partner to see where your licenses stand.", on: () => setTrust(true) },
  ].filter(x => x.show);
  const doneN = steps.filter(x => x.done).length;
  return (
    <>
      {f.ready && f.ready.failing.length > 0 && (
        <section className="sec fr-ready" aria-labelledby="fr-ready-h">
          <div className="sec-h">
            <h2 id="fr-ready-h">{zh ? `开业就绪 ${f.ready.score}%` : `${f.ready.score}% ready to open`}</h2>
            <button type="button" className="lnk" onClick={() => setAll(true)}>{zh ? "全部检查" : "All checks"}<I.chevR /></button>
          </div>
          <div className="fr-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={f.ready.score} aria-label={zh ? "开业就绪" : "Ready to open"}><i style={{ width: `${f.ready.score}%` }} /></div>
          <p className="fr-sub">{zh ? `${f.ready.total} 项中有 ${f.ready.total - f.ready.issued} 项尚未签发。只有机构批准的记录才算通过。` : `${f.ready.total - f.ready.issued} of ${f.ready.total} not issued yet. A check passes only on the agency's approval, never before.`}</p>
          <CheckList checks={f.ready.failing.slice(0, 3)} compact />
        </section>
      )}
      {steps.length > 0 && !skipped && doneN < steps.length && (
        <section className="sec fr-setup" aria-labelledby="fr-setup-h">
          <div className="sec-h">
            <h2 id="fr-setup-h">{zh ? "可选设置" : "Optional setup"}<em>{zh ? `${doneN}/${steps.length}` : `${doneN} of ${steps.length}`}</em></h2>
            <button type="button" className="lnk quiet" onClick={() => { keep(SKIP + id); setSkipped(true); }}>{zh ? "跳过" : "Skip"}</button>
          </div>
          <ol className="fr-steps">
            {steps.map((x, i) => (
              <li key={x.k} className={x.done ? "done" : ""}>
                <span className="fr-n" aria-hidden="true">{x.done ? <I.check /> : i + 1}</span>
                <span className="fr-tx"><b>{x.t}</b><small>{x.s}</small></span>
                {!x.done && <button type="button" className="pill quiet sm" onClick={x.on}>{zh ? "去设置" : "Set up"}</button>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {all && <ChecksSheet onClose={() => setAll(false)} />}
      {trust && <TrustShare onClose={() => setTrust(false)} />}
    </>
  );
}
