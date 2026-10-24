import { B, type Bi } from "./bi.ts";
import type { Store, Workspace } from "./model.ts";
import { buildReport, type ReportRow } from "./report.ts";
import { standingOf, type AgencyRecord } from "./trust.ts";

/* Checks: every store's compliance as pass or fail tests, failing first, each with why and the fix.

   Copied from Vanta's controls dashboard: "Real-time monitoring of controls via automated tests to quickly see which
   controls are passing or failing", and "Remediation detail includes the when, where, why, and how to fix"
   (vanta.com/features). Drata says the same: "continuous monitoring and guided remediation" (drata.com).

   Their weakness, filled. Delve's reports were alleged to be "populated before clients submitted their evidence"
   (DeepDelver, March 2026, as summarized by Captain Compliance), and Vanta users get "a lot of notifications about
   failing automated tests" (GetApp review, 2022-10-07). Here a check passes only on a record: an approval the agency
   made, an expiry date on file, a document in Documents, the agency's own record when Placetta reads it. Nothing
   passes by default, a check with no record says "not on file", and each failing check carries one action, the one
   Odelia takes when asked. A store's "% ready" stays readiness() in src/stores.ts; this is the list behind it. */

export type CheckState = "pass" | "warn" | "fail";
export type CheckArea = "license" | "renewal" | "proof" | "source" | "staff" | "logs" | "mock";
export type Check = {
  id: string;
  store: string;
  area: CheckArea;
  state: CheckState;
  title: Bi;
  /** why it passes or fails, from the record */
  why: Bi;
  /** what Odelia does about it when asked (failing and warning checks only) */
  fix?: Bi;
  app?: string;
};

export const AREA_WORDS: Record<CheckArea, Bi> = {
  license: B("Issued", "签发"), renewal: B("Current", "有效期"), proof: B("Copy on file", "存档副本"), source: B("Requirement confirmed", "要求核实"),
  staff: B("Staff certificates", "员工证书"), logs: B("Daily logs", "每日记录"), mock: B("Mock inspection", "模拟检查"),
};

const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

function licenseChecks(s: Store, r: ReportRow, today: string, rec?: AgencyRecord[string]): Check[] {
  const out: Check[] = [];
  const n = r.name, base = `${s.id}:${r.id}`;
  const issued = r.status === "approved" || r.status === "held";
  out.push(issued
    ? { id: `${base}:license`, store: s.id, area: "license", state: "pass", app: r.status === "held" ? undefined : r.id, title: n,
        why: r.approved?.on ? B(`Approved by ${r.agency.en} on ${r.approved.on}`, `${r.agency.zh}已于 ${r.approved.on} 批准`) : r.status === "held" ? B("On file for this store", "该门店已持有") : B(`Approved by ${r.agency.en}`, `${r.agency.zh}已批准`) }
    : { id: `${base}:license`, store: s.id, area: "license", state: s.stage === "opening" ? "fail" : "warn", app: r.id, title: n,
        why: r.status === "review" || r.status === "filing" ? B(`With ${r.agency.en}, not issued yet`, `${r.agency.zh}审核中，尚未签发`)
          : r.missing.length ? B(`Not filed: ${r.missing.length} item${r.missing.length === 1 ? "" : "s"} still needed`, `尚未申报：还缺 ${r.missing.length} 项`) : B("Not filed yet", "尚未申报"),
        fix: r.status === "review" || r.status === "filing" ? B(`Check where the ${n.en} stands with ${r.agency.en} and tell me what's next.`, `查一下${n.zh}在${r.agency.zh}的进度，并告诉我下一步。`)
          : B(`Get the ${n.en} ready to file: fill it from my workspace and tell me what's still missing.`, `把${n.zh}准备好申报：用工作区资料填写，并告诉我还缺什么。`) });
  if (issued) {
    const exp = r.expires ?? r.nextRenewal;
    const st = standingOf({ id: r.id, name: n, status: r.status, expires: exp }, today, true, rec);
    if (st === "attention") out.push({ id: `${base}:renewal`, store: s.id, area: "renewal", state: "fail", app: r.id, title: n,
      why: B(`The agency's own record no longer shows it active (${rec?.norm})`, `机构官方记录显示已不在有效状态（${rec?.norm}）`),
      fix: B(`The agency's record shows the ${n.en} as ${rec?.norm}. Find out why and what it takes to fix it, and draft what I need to send.`, `机构记录显示${n.zh}为${rec?.norm}。查明原因和处理方法，并起草需要我发出的材料。`) });
    else if (!exp) out.push({ id: `${base}:renewal`, store: s.id, area: "renewal", state: "warn", app: r.status === "held" ? undefined : r.id, title: n,
      why: r.renews ? B(`Renews ${r.renews.en.toLowerCase()}, but no expiry date is on file`, `续期周期：${r.renews.zh}，但没有存档到期日`) : B("No expiry date on file", "没有存档到期日"),
      fix: B(`Find the expiry date of the ${n.en} and add its renewal to Deadlines.`, `查到${n.zh}的到期日，并把续期加入截止日期。`) });
    else out.push({ id: `${base}:renewal`, store: s.id, area: "renewal", state: st === "expired" ? "fail" : st === "renewing" ? "warn" : "pass", app: r.status === "held" ? undefined : r.id, title: n,
      why: st === "expired" ? B(`Expired ${exp}`, `已于 ${exp} 过期`) : st === "renewing" ? B(`Expires ${exp}, within 30 days`, `${exp} 到期，30 天内`) : B(`Current until ${exp}`, `有效期至 ${exp}`),
      fix: st === "good" ? undefined : B(`Start the renewal of the ${n.en} now and put it up for my approval.`, `现在开始续期${n.zh}，并提交给我批准。`) });
    if (r.status === "approved") out.push(r.approved?.doc
      ? { id: `${base}:proof`, store: s.id, area: "proof", state: "pass", app: r.id, title: n, why: B(`On file: ${r.approved.doc}`, `已存档：${r.approved.doc}`) }
      : { id: `${base}:proof`, store: s.id, area: "proof", state: "warn", app: r.id, title: n, why: B("No copy of the approved license in Documents", "文件中没有已批准执照的副本"),
          fix: B(`Find the approval or the license for the ${n.en} and save it to Documents.`, `找到${n.zh}的批准文件或执照，保存到文件中。`) });
  }
  if (r.status !== "held") out.push(r.proof === "quoted"
    ? { id: `${base}:source`, store: s.id, area: "source", state: "pass", app: r.id, title: n, why: B(`Quoted from ${r.source?.label ?? "the agency's page"}${r.source?.checked ? `, read ${r.source.checked}` : ""}`, `引自${r.source?.label ?? "机构页面"}${r.source?.checked ? `，核对于 ${r.source.checked}` : ""}`) }
    : { id: `${base}:source`, store: s.id, area: "source", state: "warn", app: r.id, title: n,
        why: r.proof === "linked" ? B("Linked to the agency's page, not quoted", "有机构页面链接，但无原文") : B("Not confirmed on an official page", "尚未在官方页面核实"),
        fix: B(`Confirm on ${r.agency.en}'s own site that this store needs the ${n.en}, and quote the line.`, `在${r.agency.zh}官网核实该门店是否需要${n.zh}，并引用原文。`) });
  return out;
}

function storeChecks(s: Store, today: string): Check[] {
  const out: Check[] = [];
  for (const c of s.certs) {
    const late = c.expires < today, soon = !late && c.expires <= addDays(today, 30);
    out.push({ id: `${s.id}:cert:${c.id}`, store: s.id, area: "staff", state: late ? "fail" : soon ? "warn" : "pass", title: B(`${c.kind.en}, ${c.person}`, `${c.kind.zh}，${c.person}`),
      why: late ? B(`Expired ${c.expires}`, `已于 ${c.expires} 过期`) : soon ? B(`Expires ${c.expires}`, `${c.expires} 到期`) : B(`Valid until ${c.expires}`, `有效期至 ${c.expires}`),
      fix: late || soon ? B(`Remind ${c.person} to renew their ${c.kind.en} before ${c.expires}, in their language.`, `用${c.person}的语言提醒其在 ${c.expires} 前续期${c.kind.zh}。`) : undefined });
  }
  if (s.stage === "open") {
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const done = s.logs.filter(l => week.includes(l.date) && l.done).length, want = 21;
    out.push({ id: `${s.id}:logs`, store: s.id, area: "logs", state: done >= want ? "pass" : done >= 14 ? "warn" : "fail", title: B("Food safety logs, last 7 days", "近 7 天食品安全记录"),
      why: B(`${done} of ${want} logged`, `已记录 ${done}/${want}`), fix: done >= want ? undefined : B(`Text the ${s.name.en} manager today's log checklist and remind them each morning.`, `把今天的记录清单发给${s.name.zh}店长，并每天早上提醒。`) });
    if (s.mock) {
      const okN = s.mock.checks.filter(c => c.ok).length, n = s.mock.checks.length;
      out.push({ id: `${s.id}:mock`, store: s.id, area: "mock", state: okN === n ? "pass" : okN / n >= 0.8 ? "warn" : "fail", title: B("Mock inspection", "模拟检查"),
        why: B(`${okN} of ${n} passed on ${s.mock.date}`, `${s.mock.date} 通过 ${okN}/${n}`), fix: okN === n ? undefined : B(`List what failed in the last mock inspection at ${s.name.en} and how to fix each before the inspector comes.`, `列出${s.name.zh}上次模拟检查未通过的项目，以及在检查员来之前如何逐项整改。`) });
    }
  }
  return out;
}

/** Every check for one store, or every store, failing first. */
export function checksFor(ws: Workspace, today: string, o: { store?: string; records?: AgencyRecord } = {}): Check[] {
  const stores = (ws.stores ?? []).filter(s => !o.store || s.id === o.store);
  const personal = new Set(ws.apps.filter(a => a.yours === "certificate").map(a => a.id));
  const out: Check[] = [];
  for (const s of stores) {
    const rows = buildReport(ws, today, { store: s.id }).rows.filter(r => !personal.has(r.id));
    for (const r of rows) out.push(...licenseChecks(s, r, today, o.records?.[r.id]));
    out.push(...storeChecks(s, today));
  }
  const rank: Record<CheckState, number> = { fail: 0, warn: 1, pass: 2 };
  return out.sort((a, b) => rank[a.state] - rank[b.state]);
}

/** "12 of 18 checks passing", and how many fail outright. */
export function tally(cs: Check[]): { pass: number; warn: number; fail: number; total: number } {
  return { pass: cs.filter(c => c.state === "pass").length, warn: cs.filter(c => c.state === "warn").length, fail: cs.filter(c => c.state === "fail").length, total: cs.length };
}
