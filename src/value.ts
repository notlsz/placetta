/* The value report: what Placetta actually delivered, per store and for the whole brand, from records only.

   Every number comes from something on file:
     days to approval   a filing's own submitted and decided dates, against the agency median for that form from
                        network data, and only where 3 or more businesses filed it (network_view); otherwise it says so
     filings made       filings that reached the agency (a submitted date on the filing)
     renewals caught    a renewal on the calendar whose filing went to the agency on or before the date it was due
     fines avoided      only an agency notice on file (its document attached) that named a fine and was resolved by its
                        cure date; with no notice, nothing is claimed
     hours saved        an estimate, labelled as one, with its formula shown (the hours are in src/pricing.ts)
   Nothing is made up: a number with no record behind it is left out and the line says why.

   No imports but the price list: the monitor (Deno) builds the renewal notice from the same code. */
import { PROPOSED } from "./pricing.ts";

type Bi = { en: string; zh: string };
const B = (en: string, zh: string): Bi => ({ en, zh });

/** A filing as the report reads it: from the filings table (the account) or an application's own record. */
export type ValueFiling = { app: string; status: string; submitted?: string | null; decided?: string | null; official?: string | null; title?: Bi };
/** A notice an agency sent (a warning, a notice of violation, a late notice), kept with its document. */
export type AgencyNotice = { id: string; date: string; agency: Bi; what: Bi; fine?: number; cureBy?: string; doc?: string; resolved?: string; app?: string };
export type ValueStore = { id: string; name: Bi; stage: string; apps?: string[]; notices?: AgencyNotice[] };
export type ValueInput = {
  business: Bi;
  apps: { id: string; name: Bi; official?: string; agency?: Bi }[];
  stores: ValueStore[];
  deadlines: { id: string; date: string; kind: string; app?: string }[];
  docs: { id: string }[];
  filings: ValueFiling[];
  /** Agency medians from network data (network_view forms): only forms with 3 or more businesses ever arrive here. */
  medians: { form: string; businesses: number; median_days: number | null }[];
  /** Entity reports filed (the entity module), counted toward the brand only. */
  entityReports?: number;
};

export type Approval = { app: string; name: Bi; days: number; median: number | null; businesses: number | null; official: string | null };
export type ValueLine = { approvals: Approval[]; filings: number; renewals: number; renewalsDue: number; notices: { notice: AgencyNotice; avoided: number | null; why: Bi }[]; fines: number; hours: { total: number; formula: Bi } };
export type StoreValue = ValueLine & { id: string; name: Bi; stage: string };
export type ValueReport = { business: Bi; asOf: string; stores: StoreValue[]; brand: ValueLine & { entityReports: number }; empty: boolean };

const DONE = new Set(["submitted", "accepted", "rejected", "approved", "in_review"]);
const day = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const between = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** The applications that belong to a store: the ones it lists, or every one when it's the only store. */
export function appsOf(s: ValueStore, all: ValueInput["stores"], apps: ValueInput["apps"]): string[] {
  if (all.length === 1) return apps.map(a => a.id);
  return (s.apps ?? []).filter(id => apps.some(a => a.id === id));
}

/** A filing that reached the agency, by application: its latest one with a submitted date. */
function sent(filings: ValueFiling[]): Map<string, ValueFiling[]> {
  const m = new Map<string, ValueFiling[]>();
  for (const f of filings) if (day(f.submitted) && DONE.has(f.status)) m.set(f.app, [...(m.get(f.app) ?? []), f]);
  return m;
}

/** How many hours, and the formula, said as an estimate. */
export function hoursEstimate(filings: number, renewals: number, entity = 0): { total: number; formula: Bi } {
  const h = PROPOSED;
  const total = filings * h.hoursPerFiling + renewals * h.hoursPerRenewal + entity * h.hoursPerEntityReport;
  const en = [`${filings} filing${filings === 1 ? "" : "s"} × ${h.hoursPerFiling} h`, `${renewals} renewal${renewals === 1 ? "" : "s"} × ${h.hoursPerRenewal} h`, ...(entity ? [`${entity} entity report${entity === 1 ? "" : "s"} × ${h.hoursPerEntityReport} h`] : [])].join(" + ");
  const zh = [`${filings} 次申报 × ${h.hoursPerFiling} 小时`, `${renewals} 次续期 × ${h.hoursPerRenewal} 小时`, ...(entity ? [`${entity} 份实体年报 × ${h.hoursPerEntityReport} 小时`] : [])].join(" + ");
  return { total, formula: B(`Estimate: ${en} = ${total} h. The hours per task are Placetta's assumption, not a measurement.`, `估算：${zh} = ${total} 小时。每项任务的小时数是快哉的假设，并非实测。`) };
}

function lineFor(appIds: string[], notices: AgencyNotice[], x: ValueInput, asOf: string, entity = 0): ValueLine {
  const by = sent(x.filings);
  const medians = new Map(x.medians.filter(m => m.businesses >= 3 && m.median_days != null).map(m => [m.form, m]));
  const approvals: Approval[] = [];
  let filings = 0;
  for (const id of appIds) {
    const list = by.get(id) ?? [];
    filings += list.length;
    const app = x.apps.find(a => a.id === id);
    // the first approval on record for this application: its own dates, nothing else
    const ok = list.filter(f => (f.status === "accepted" || f.status === "approved") && day(f.decided)).sort((a, b) => day(a.submitted)!.localeCompare(day(b.submitted)!))[0];
    if (!ok || !app) continue;
    const days = between(day(ok.submitted)!, day(ok.decided)!);
    if (days < 0) continue;
    const official = ok.official ?? app.official ?? null;
    const m = official ? medians.get(official) : undefined;
    approvals.push({ app: id, name: app.name, days, median: m ? Number(m.median_days) : null, businesses: m ? m.businesses : null, official });
  }
  // a renewal caught: the date on the calendar, and a filing for it that reached the agency in the 180 days before it
  const due = x.deadlines.filter(d => d.kind === "renewal" && d.app && appIds.includes(d.app) && day(d.date) && d.date <= addDays(asOf, 60));
  let renewals = 0;
  for (const d of due) if ((by.get(d.app!) ?? []).some(f => { const s = day(f.submitted)!; return s <= d.date && s >= addDays(d.date, -180) && f.status !== "rejected"; })) renewals++;
  const docIds = new Set(x.docs.map(d => d.id));
  const ns = notices.map(n => {
    if (!n.doc || !docIds.has(n.doc)) return { notice: n, avoided: null, why: B("Not counted: the notice itself isn't on file.", "未计入：通知原件不在档案中。") };
    if (!n.fine || n.fine <= 0) return { notice: n, avoided: null, why: B("Not counted: the notice names no fine.", "未计入：通知未列明罚款金额。") };
    if (!n.resolved || !n.cureBy) return { notice: n, avoided: null, why: B("Not counted yet: not resolved.", "暂未计入：尚未解决。") };
    if (n.resolved > n.cureBy) return { notice: n, avoided: null, why: B("Not counted: resolved after the date on the notice.", "未计入：解决日期晚于通知所列期限。") };
    return { notice: n, avoided: n.fine, why: B(`Resolved ${n.resolved}, before ${n.cureBy}, the date on the notice.`, `已于 ${n.resolved} 解决，早于通知所列期限 ${n.cureBy}。`) };
  });
  return { approvals, filings, renewals, renewalsDue: due.length, notices: ns, fines: ns.reduce((s, n) => s + (n.avoided ?? 0), 0), hours: hoursEstimate(filings, renewals, entity) };
}

/** The report for every store and the brand, as of a day. */
export function valueReport(x: ValueInput, asOf: string): ValueReport {
  const stores = x.stores.map(s => ({ id: s.id, name: s.name, stage: s.stage, ...lineFor(appsOf(s, x.stores, x.apps), s.notices ?? [], x, asOf) }));
  const all = x.apps.map(a => a.id);
  const entity = Math.max(0, x.entityReports ?? 0);
  const brand = { ...lineFor(all, x.stores.flatMap(s => s.notices ?? []), x, asOf, entity), entityReports: entity };
  return { business: x.business, asOf, stores, brand, empty: brand.filings === 0 && brand.renewals === 0 && brand.fines === 0 && entity === 0 };
}

/** One approval said plainly: against the network median, or why there's no comparison. */
export function approvalLine(a: Approval): Bi {
  const d = (n: number, zh = false) => zh ? `${n} 天` : `${n} day${n === 1 ? "" : "s"}`;
  if (a.median == null) return B(`${a.name.en}: approved in ${d(a.days)}. No comparison: fewer than 3 businesses on Placetta have filed this form.`, `${a.name.zh}：${d(a.days, true)}获批。暂无对比：在快哉提交过此表格的企业不足 3 家。`);
  const diff = a.median - a.days;
  const vs = diff > 0 ? B(`${d(diff)} faster than`, `比中位数快 ${d(diff, true)}`) : diff < 0 ? B(`${d(-diff)} slower than`, `比中位数慢 ${d(-diff, true)}`) : B("the same as", "与中位数相同");
  return B(`${a.name.en}: approved in ${d(a.days)}, ${vs.en} the agency median of ${d(a.median)} across ${a.businesses} businesses.`,
    `${a.name.zh}：${d(a.days, true)}获批，${vs.zh}（${a.businesses} 家企业的机构中位数为 ${d(a.median, true)}）。`);
}

/** The headline lines, for a card, the renewal notice and the email: only what has a record. */
export function headline(v: ValueLine): Bi[] {
  const out: Bi[] = [];
  out.push(B(`${v.filings} filing${v.filings === 1 ? "" : "s"} made with agencies`, `向机构提交 ${v.filings} 份申报`));
  if (v.renewalsDue) out.push(B(`${v.renewals} of ${v.renewalsDue} renewal${v.renewalsDue === 1 ? "" : "s"} filed before the due date`, `${v.renewalsDue} 项续期中 ${v.renewals} 项在到期前提交`));
  const faster = v.approvals.filter(a => a.median != null);
  if (faster.length) {
    const saved = faster.reduce((s, a) => s + (a.median! - a.days), 0);
    out.push(saved >= 0 ? B(`${saved} days faster than the agency medians, over ${faster.length} approval${faster.length === 1 ? "" : "s"} with network data`, `${faster.length} 项有网络数据的审批，合计比机构中位数快 ${saved} 天`)
      : B(`${-saved} days slower than the agency medians, over ${faster.length} approval${faster.length === 1 ? "" : "s"} with network data`, `${faster.length} 项有网络数据的审批，合计比机构中位数慢 ${-saved} 天`));
  }
  out.push(v.fines > 0 ? B(`$${v.fines.toLocaleString("en-US")} in fines avoided, from agency notices on file`, `根据存档的机构通知，避免罚款 $${v.fines.toLocaleString("en-US")}`) : B("No fines avoided claimed: no agency notice on file names one that was avoided", "未声称避免罚款：存档的机构通知中没有可计入的罚款"));
  out.push(B(`About ${v.hours.total} hours saved (estimate)`, `约节省 ${v.hours.total} 小时（估算）`));
  return out;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The report as one page that stands on its own: for the owner's boss, opened in any browser or printed to PDF. */
export function valueReportHtml(r: ValueReport, lang: "en" | "zh"): string {
  const t = (x: Bi) => esc(x[lang] || x.en);
  const zh = lang === "zh";
  const section = (title: string, v: ValueLine) => `<section><h2>${esc(title)}</h2><ul>${headline(v).map(l => `<li>${t(l)}</li>`).join("")}</ul>
${v.approvals.length ? `<h3>${zh ? "审批用时" : "Days to approval"}</h3><ul>${v.approvals.map(a => `<li>${t(approvalLine(a))}</li>`).join("")}</ul>` : ""}
${v.notices.length ? `<h3>${zh ? "机构通知" : "Agency notices"}</h3><ul>${v.notices.map(n => `<li>${t(n.notice.what)} (${t(n.notice.agency)}, ${esc(n.notice.date)}): ${t(n.why)}</li>`).join("")}</ul>` : ""}
<p class="f">${t(v.hours.formula)}</p></section>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc((zh ? "快哉价值报告：" : "Placetta value report: ") + (r.business[lang] || r.business.en))}</title>
<style>body{font:15px/1.55 -apple-system,"Segoe UI",Helvetica,Arial,"PingFang SC",sans-serif;color:#1d1d1f;background:#fff;max-width:760px;margin:32px auto;padding:0 16px}h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px;border-top:1px solid #ddd;padding-top:16px}h3{font-size:14px;margin:14px 0 6px;color:#555}ul{padding-left:20px;margin:0}li{margin:4px 0}.f,.m{color:#666;font-size:13px}@media print{body{margin:0}}</style></head><body>
<h1>${esc(r.business[lang] || r.business.en)}</h1><p class="m">${zh ? `快哉交付记录，截至 ${esc(r.asOf)}。每个数字都来自存档记录；节省的小时数为估算，公式见下。` : `What Placetta delivered, as of ${esc(r.asOf)}. Every number comes from records on file; hours saved is an estimate with its formula shown.`}</p>
${section(zh ? "品牌合计" : "Whole brand", r.brand)}
${r.stores.map(s => section(s.name[lang] || s.name.en, s)).join("\n")}
</body></html>`;
}
