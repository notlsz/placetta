import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import { useEvidence } from "./evidence";
import type { Approval } from "./model";
import { RISK_SHORT, RISK_WORDS, overridable, rejectionRisk, type IssueStat, type Risk, type RiskIssue } from "./risk";
import { riskIssueStats } from "./cloud/proofApi";
import { daysFromNow } from "./time";
import { I } from "./ui";

/* The rejection risk on an approval card (src/risk.ts): one level, every issue with where it came from, a one-tap fix
   where the workspace holds the right answer, and, on a High the owner can judge, "Send it anyway". A definite mistake
   can't be sent anyway. */

/** What Placetta learned about this form's issues (risk_issue_stats), read once per card in an account. */
export function useRisk(a: Approval | undefined): Risk | null {
  const { ws, cloud } = useApp();
  const ev = useEvidence();
  const app = a?.app ? ws.apps.find(x => x.id === a.app) : undefined;
  const [issues, setIssues] = useState<IssueStat[]>([]);
  useEffect(() => {
    if (!cloud || !app?.official) return;
    let live = true;
    void riskIssueStats(app.official).then(x => { if (live) setIssues(x); });
    return () => { live = false; };
  }, [cloud?.wsId, app?.official]);
  if (!a || a.kind !== "file") return null;
  return rejectionRisk(ws, a, daysFromNow(0), { ...ev, issues });
}

const FROM: Record<RiskIssue["source"], { en: string; zh: string }> = {
  check: { en: "Line check", zh: "逐行核对" },
  learned: { en: "Placetta's past filings", zh: "快哉以往申报" },
  rate: { en: "Placetta's past filings", zh: "快哉以往申报" },
  timing: { en: "The agency's usual time", zh: "机构通常用时" },
};

export function RiskCard({ a, risk, override, setOverride }: { a: Approval; risk: Risk; override: boolean; setOverride: (v: boolean) => void }) {
  const { b, lang, busy, editFields } = useApp();
  const zh = lang === "zh";
  if (!risk.checked && !risk.issues.length) return null;
  const hard = risk.issues.some(x => x.hard);
  const canOverride = overridable(risk);
  const order = { high: 0, medium: 1, low: 2 } as const;
  const issues = [...risk.issues].sort((x, y) => order[x.severity] - order[y.severity]);
  return (
    <section className={`ap-risk ${risk.level}`} aria-live="polite" data-risk={risk.level}>
      <div className="rk-head">
        <h3>{zh ? "被退回的风险" : "Risk of being sent back"}</h3>
        <span className={`rk-chip ${risk.level}`}>{b(RISK_SHORT[risk.level])}</span>
      </div>
      <p className="rk-sum">{risk.issues.length
        ? b(RISK_WORDS[risk.level]) + (zh ? `。已核对 ${risk.checked} 项。` : `. Odelia checked ${risk.checked} lines.`)
        : zh ? `已核对 ${risk.checked} 项：格式、日期、地址、机构和费用均无问题，提交前也对照了快哉以往的申报。` : `Odelia checked ${risk.checked} lines: formats, dates, address, agency and fee all check out, and found nothing Placetta's past filings of this form were sent back for.`}</p>
      {issues.length > 0 && (
        <ul className="rk-list">
          {issues.map(x => (
            <li key={x.id} className={`rk-row ${x.severity}`}>
              <span className={`rk-sev ${x.severity}`}>{b(RISK_SHORT[x.severity])}</span>
              <div className="rk-text">
                <p><b>{b(x.label)}</b> {b(x.note)}</p>
                <small>{zh ? FROM[x.source].zh : FROM[x.source].en}</small>
              </div>
              {x.fix && a.app && (
                <button type="button" className="pill sm rk-fix" disabled={busy} onClick={() => editFields(a.app!, { [x.fix!.field]: x.fix!.value })}>
                  <I.check />{b(x.fix.label)}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {hard && <p className="rk-foot" role="alert">{zh ? "以上标为高风险的项目必须先更正，才能提交。" : "Fix the lines marked high before it can be filed."}</p>}
      {canOverride && (
        <label className="rk-over">
          <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />
          <span>{zh ? "我已看过以上内容，仍然提交。这一选择会随申报记录在案。" : "I've read these. Send it anyway. This choice is kept with the filing."}</span>
        </label>
      )}
    </section>
  );
}
