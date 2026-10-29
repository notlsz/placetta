import { B, type Bi } from "./bi.ts";
import type { Application, Approval, Field, Workspace } from "./model.ts";
import { legalName, nameKey, preflight, stepTiming, storeOfApp, type Check, type Evidence } from "./smart.ts";

/* Rejection risk, before anything is filed. Copied, in substance, from drug discovery's habit of predicting a
   molecule's outcome before the lab (Chai Discovery): Odelia predicts whether the agency will send an application back
   before it goes, and fixes what she can first.

   Where each part comes from, so nothing is a guess:
   - every line's check: the second look (src/smart.ts preflight): a definite mistake is High and can't be sent, a
     warning is Medium;
   - what Placetta learned: each issue the check found on earlier filings of the same form, against what the agency then
     did (filing_risk_flags and risk_issue_stats, 20261106090000_filing_risk.sql). An issue the agency sent back at least
     half the time, over 3 or more filings, is High;
   - how often the agency sent this form back on Placetta's filings (filing_stats, 5 or more decided), said as a real
     count, never a made-up percentage;
   - whether the agency's usual time lands after the store's planned opening (stepTiming, the same as the opening date).
   No model is called: everything here is a rule over the workspace and Placetta's own records. */

export type RiskLevel = "low" | "medium" | "high";
export type RiskSource = "check" | "learned" | "rate" | "timing";
export type RiskFix = { field: string; value: string; label: Bi };
export type RiskIssue = {
  id: string;                 // stable: the check's kind, and the line it's on ("name:l1")
  kind: string;               // what the outcomes are learned against
  severity: RiskLevel;
  label: Bi; note: Bi;
  field?: string;
  source: RiskSource;
  /** a definite mistake (an SSN, a wrong agency, an expired date) can't be sent anyway; the rest can, once the owner says so */
  hard: boolean;
  fix?: RiskFix;
};
export type Risk = { level: RiskLevel; issues: RiskIssue[]; checked: number };
/** What an issue led to on earlier filings of the same form, across Placetta (aggregates only). */
export type IssueStat = { issue: string; n: number; sent_back: number };
export type RiskEvidence = Evidence & { issues?: IssueStat[] };

/** An issue is learned once this many decided filings had it */
export const LEARN_MIN_N = 3;
/** and the agency sent back at least this share of them */
export const LEARN_RATE = 0.5;
/** A form's own return rate is said once this many of its filings were decided */
export const RATE_MIN_N = 5;
/** and only when at least this share came back */
export const RATE_WORTH = 25;

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
const max = (a: RiskLevel, b: RiskLevel): RiskLevel => (RANK[a] >= RANK[b] ? a : b);

export const RISK_WORDS: Record<RiskLevel, Bi> = {
  low: B("Low risk of being sent back", "被退回的风险低"),
  medium: B("Some risk of being sent back", "有一定被退回的风险"),
  high: B("High risk of being sent back", "被退回的风险高"),
};
export const RISK_SHORT: Record<RiskLevel, Bi> = { low: B("Low", "低"), medium: B("Medium", "中"), high: B("High", "高") };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

/** The one-tap fix for an issue, when the workspace holds the right answer: the legal name on file, the store's own
 *  address, or today for a start date that has passed. Null when only the owner knows. */
function fixFor(w: Workspace, app: Application | undefined, c: Check, today: string): RiskFix | undefined {
  if (!c.field || !app) return undefined;
  const line = app.fields.find(f => f.id === c.field);
  if (!line) return undefined;
  if (c.kind === "name") {
    const known = legalName(w);
    return known && known !== line.value ? { field: c.field, value: known, label: B(`Use "${known}"`, `改为“${known}”`) } : undefined;
  }
  if (c.kind === "address") {
    const s = storeOfApp(w, app.id);
    return s?.address && s.address !== line.value ? { field: c.field, value: s.address, label: B("Use the store's address", "改用门店地址") } : undefined;
  }
  if (c.kind === "date" && /opening|start|effective|begin/i.test(line.label.en)) return { field: c.field, value: today, label: B(`Use today, ${today}`, `改为今天 ${today}`) };
  return undefined;
}

/** The rejection risk of what an approval would file: Low, Medium or High, with each issue, where it came from, and the
 *  fix Odelia can make with one tap. */
export function rejectionRisk(w: Workspace, a: Approval, today: string, ev: RiskEvidence = {}): Risk {
  const app = a.app ? w.apps.find(x => x.id === a.app) : undefined;
  const pf = preflight(w, a, today);
  const learned = new Map((ev.issues ?? []).filter(s => s.n >= LEARN_MIN_N).map(s => [s.issue, s]));
  const issues: RiskIssue[] = [];
  for (const c of [...pf.errors, ...pf.warnings]) {
    const kind = c.kind ?? "check", hard = c.level === "error";
    let severity: RiskLevel = hard ? "high" : "medium", note = c.note, source: RiskSource = "check";
    const st = learned.get(kind);
    if (!hard && st && st.sent_back / st.n >= LEARN_RATE) {
      severity = "high"; source = "learned";
      note = B(`${c.note.en} The agency sent back ${st.sent_back} of ${st.n} of Placetta's filings of this form that had this.`, `${c.note.zh}快哉提交的这份表格中，有此问题的 ${st.n} 份里机构退回了 ${st.sent_back} 份。`);
    }
    const fix = fixFor(w, app, c, today);
    issues.push({ id: `${kind}:${c.field ?? ""}`, kind, severity, label: c.label, note, ...(c.field ? { field: c.field } : {}), source, hard, ...(fix ? { fix } : {}) });
  }
  if (app && a.kind === "file") {
    // how often the agency sent this form back on Placetta's filings: a real count, said only once there's enough
    const st = app.official ? ev.stats?.find(s => s.form === app.official) : undefined;
    if (st && st.n >= RATE_MIN_N && st.rejected_pct >= RATE_WORTH) {
      const back = Math.round((st.rejected_pct / 100) * st.n);
      issues.push({ id: "agency_rate:", kind: "agency_rate", severity: "medium", source: "rate", hard: false, label: B("This form", "这份表格"),
        note: B(`The agency sent back ${back} of the ${st.n} Placetta filed. Odelia checked every line above for the usual reasons.`, `快哉提交的 ${st.n} 份中机构退回了 ${back} 份。Odelia 已按常见原因逐行核对上方内容。`) });
    }
    // the agency's usual time against the store's planned opening
    const s = storeOfApp(w, app.id);
    if (s?.plannedOpen && s.stage !== "open" && s.plannedOpen >= today) {
      const left = daysBetween(today, s.plannedOpen), usual = stepTiming(app, ev).days.typical;
      if (usual > left) issues.push({ id: "timing:", kind: "timing", severity: "medium", source: "timing", hard: false, label: B("Timing", "时间"),
        note: B(`The agency usually takes about ${usual} days and ${s.name.en} plans to open in ${left}. File it today, and ask about an expedite if the agency offers one.`, `机构通常需要约 ${usual} 天，${s.name.zh}计划 ${left} 天后开业。请今天提交；如机构提供加急，可考虑申请。`) });
    }
  }
  const level = issues.reduce<RiskLevel>((l, x) => max(l, x.severity), "low");
  return { level, issues, checked: pf.checked };
}

/** A High risk the owner may still send: every High issue is one they can judge (none is a definite mistake). */
export const overridable = (r: Risk): boolean => r.level === "high" && !r.issues.some(x => x.hard);
/** Blocks approval: any definite mistake, or a High the owner hasn't said to send anyway. */
export const riskBlocks = (r: Risk, overridden: boolean): boolean => r.issues.some(x => x.hard) || (r.level === "high" && !overridden);

/** What's kept with the filing, for learning: each issue's kind and how serious it was. Never a value. */
export type RiskFlags = { level: RiskLevel; flags: { issue: string; severity: RiskLevel }[]; override?: { at: string } };
export function riskFlags(r: Risk, override?: { at: string }): RiskFlags {
  const seen = new Map<string, RiskLevel>();
  for (const x of r.issues) seen.set(x.kind, max(seen.get(x.kind) ?? "low", x.severity));
  return { level: r.level, flags: [...seen].map(([issue, severity]) => ({ issue, severity })), ...(override ? { override } : {}) };
}

/* ------------------------------ fixes Odelia makes herself ------------------------------ */

const STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
};

export type AutoFix = { field: string; from: string; to: string; why: Bi };
const stripLine = (l: string) => l.replace(/^(line\s+)?[^:]{1,16}:\s+(?=\S)/i, "");

/** Fixes that need no one's judgement, from the workspace's own records: an EIN written without its dash, a state
 *  spelled out where the line takes its code, stray spaces, and the legal name in the exact spelling it's registered
 *  under when only its case or spacing differs. Anything that changes what an answer means is left for the owner. */
export function autoFixes(w: Workspace, app: Pick<Application, "fields">): AutoFix[] {
  const out: AutoFix[] = [];
  const known = legalName(w);
  for (const f of app.fields as Field[]) {
    const v = f.value ?? "", label = stripLine(f.label.en);
    if (!v || v.includes("•")) continue;
    let to = v.replace(/\s{2,}/g, " ").trim(), why = B("Removed stray spaces", "去掉了多余的空格");
    if (/\b(ein|fein)\b|employer identification|federal (tax|employer) id/i.test(label) && !/\b(ssn|social security|itin)\b/i.test(label) && /^\d{9}$/.test(to)) {
      to = `${to.slice(0, 2)}-${to.slice(2)}`; why = B("Wrote the EIN the way the IRS does, NN-NNNNNNN", "按国税局格式填写 EIN：NN-NNNNNNN");
    } else if (/^state$|^state of (formation|incorporation|organization)$/i.test(label.trim()) && STATE_CODES[to.toLowerCase()]) {
      to = STATE_CODES[to.toLowerCase()]; why = B("Used the state's two-letter code", "改用州的两字母代码");
    } else if (/^state$/i.test(label.trim()) && /^[a-z]{2}$/.test(to)) {
      to = to.toUpperCase(); why = B("Used the state's two-letter code", "改用州的两字母代码");
    } else if (known && /legal (business |entity )?name|business name|entity name|name of (the )?(business|entity|company|applicant)/i.test(label) && !/dba|trade|doing business|fictitious|assumed/i.test(label)
      && to !== known && to.toLowerCase().replace(/\s+/g, " ") === known.toLowerCase().replace(/\s+/g, " ") && nameKey(to) === nameKey(known)) {
      to = known; why = B("Used the legal name exactly as it's registered", "按注册登记的写法填写法定名称");
    }
    if (to !== v) out.push({ field: f.id, from: v, to, why });
  }
  return out;
}

/** Lays the fixes on an application's lines, each marked with why. */
export function withFixes(app: Application, fixes: AutoFix[]): Application {
  if (!fixes.length) return app;
  const by = new Map(fixes.map(x => [x.field, x]));
  return { ...app, fields: app.fields.map(f => { const x = by.get(f.id); return x ? { ...f, value: x.to, from: B(`Odelia fixed it: ${x.why.en}`, `Odelia 修正：${x.why.zh}`) } : f; }) };
}
