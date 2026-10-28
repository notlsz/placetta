/* The owner's pick between the agency's standard time and its expedite, on one application. Pure: the approval card,
   the application's drawer and the tests call it.

   What a pick does, and only that:
     the application remembers it (Application.expedite), so the opening estimate (src/smart.ts) uses the expedite's
     published time at once;
     the agency's own expedite fee goes on the application's fee list, marked as the expedite, at the agency's amount
     (never marked up; set by the agency when it publishes no flat amount), so the card's total and Cost to open show it
     and it's paid to the agency the way every agency fee is;
     where the agency's form or portal has a line for it, Odelia's fill carries it (the size tier's expedited fee line on
     Los Angeles County's plan review form, the review type in Dallas's portal); otherwise the team asks for it;
     a filing card still waiting for approval is brought in line with the new answers, since the owner made the change
     on it, and nothing is filed or paid until they approve. */
import { B, type Bi } from "./bi";
import type { Application, Fee, Workspace } from "./model";
import { audit } from "./core";
import { answersHash } from "./forms/versions";
import { expediteOptions, extraFee, spanSay, timingOf, type Expedite, type Option } from "./forms/expedite";
import { money } from "./time";


/** The fee line for a chosen expedite: the agency's extra fee, or "set by the agency" when it has no flat amount. */
function feeLine(x: Option, fields: Application["fields"]): Fee {
  const fee = extraFee(x, fields);
  return { label: B(`${x.label.en} (agency fee)`, `${x.label.zh}（机构费用）`), amount: fee ?? 0, ...(fee == null ? { tbd: true } : {}), expedite: true };
}

/** The value the option writes on its line for these answers, or the standard one back. */
function lineValue(fill: NonNullable<Expedite["fill"]>, current: string, on: boolean): string | null {
  if (typeof fill.value === "string") return on ? fill.value : fill.standard ?? null;
  if (on) return fill.value[current.trim()] ?? null;
  const back = Object.entries(fill.value).find(([, v]) => v === current.trim());
  return back ? back[0] : null;
}

/** The application with the owner's pick: an option id, or null for the agency's standard time. */
export function withExpedite(a: Application, id: string | null): Application {
  const opts = expediteOptions(a.official);
  const was = a.expedite ? opts.find(o => o.id === a.expedite) : undefined;
  const x = id ? opts.find(o => o.id === id) : undefined;
  if (id && !x) return a;
  let fields = a.fields;
  // the agency's extra fee is read from the standard answers (the size tier), before the pick rewrites them
  // the line the previous pick wrote goes back to its standard answer, then the new pick writes its own
  if (was?.fill && was.id !== x?.id) {
    const f = fields.find(y => y.id === was.fill!.line);
    const v = f ? lineValue(was.fill, f.value, false) : null;
    if (f && v != null) fields = fields.map(y => (y.id === f.id ? { ...y, value: v, from: B("Standard review, as you chose", "按您的选择：标准审查") } : y));
  }
  const base = fields;
  if (x?.fill) {
    const f = fields.find(y => y.id === x.fill!.line);
    const v = lineValue(x.fill, f?.value ?? "", true);
    if (v != null) fields = f ? fields.map(y => (y.id === f.id ? { ...y, value: v, from: B("Expedited, as you chose", "按您的选择：加急") } : y))
      : [...fields, { id: x.fill.line, label: B("Review type", "审查类型"), value: v, from: B("Expedited, as you chose", "按您的选择：加急") }];
  }
  const fees = [...a.fees.filter(f => !f.expedite), ...(x ? [feeLine(x, base)] : [])];
  const { expedite: _drop, ...rest } = a;
  void _drop;
  return { ...rest, fields, fees, ...(x ? { expedite: x.id } : {}) };
}

/** The workspace with the owner's pick on one application, its waiting filing card brought in line, and the pick on the
 *  activity log. */
export function chooseExpedite(w: Workspace, appId: string, id: string | null): Workspace {
  const a = w.apps.find(x => x.id === appId);
  if (!a || (a.expedite ?? null) === id) return w;
  const next = withExpedite(a, id);
  if (next === a) return w;
  const hash = answersHash(next);
  const x = id ? expediteOptions(a.official).find(o => o.id === id) : undefined;
  const n: Workspace = {
    ...w,
    apps: w.apps.map(y => (y.id === appId ? next : y)),
    approvals: w.approvals.map(c => (c.app === appId && c.kind === "file" && c.hash && !c.withdrawn ? { ...c, hash } : c)),
  };
  return audit("you", x ? B("Chose expedited review", "选择了加急审查") : B("Chose standard review", "选择了标准审查"), a.name, x ? B(`${x.label.en}: ${x.turnaround.en}`, `${x.label.zh}：${x.turnaround.zh}`) : undefined)(n);
}

/** One side of the choice, said for the card: "Standard: 10 to 20 working days, $445" / "Expedited plan review: within 10
 *  working days after payment, +$765 agency fee". */
export type ChoiceLine = { id: string | null; label: Bi; time: Bi; fee: Bi; source?: string; only?: Bi; how?: "form" | "team"; changes: boolean };

export function choices(a: Application): ChoiceLine[] {
  const opts = expediteOptions(a.official);
  if (!opts.length) return [];
  const t = timingOf(a);
  const std = a.fees.filter(f => !f.expedite);
  const stdFee = std.some(f => f.tbd) ? B("fee set by the agency", "费用由机构核定") : B(money(std.reduce((s, f) => s + f.amount, 0)), money(std.reduce((s, f) => s + f.amount, 0)));
  const out: ChoiceLine[] = [{ id: null, label: B("Standard", "标准"), time: t.say, fee: stdFee, source: t.source, changes: true }];
  const line = a.fees.find(f => f.expedite);
  for (const x of opts) {
    const fee = x.id === a.expedite && line ? (line.tbd ? null : line.amount) : extraFee(x, a.fields);
    out.push({
      id: x.id, label: x.label, time: x.span ? B(`${x.turnaround.en}`, `${x.turnaround.zh}`) : B(`${x.turnaround.en}; the estimate keeps the standard time`, `${x.turnaround.zh}；预计日期仍按标准时间计算`),
      fee: fee == null ? (x.feeNote ?? B("extra fee set by the agency", "加急费由机构核定")) : fee === 0 ? B("no agency fee", "机构不收费") : B(`+${money(fee)} agency fee`, `机构另收 ${money(fee)}`),
      source: x.source.url, only: x.only, how: x.how, changes: !!x.span,
    });
  }
  return out;
}

/** What the filing card adds to its steps when an expedite is chosen: who asks for it and how. */
export function expediteStep(a: Application): Bi | null {
  const x = a.expedite ? expediteOptions(a.official).find(o => o.id === a.expedite) : undefined;
  if (!x) return null;
  const line = a.fees.find(f => f.expedite);
  const fee = line ? (line.tbd ? null : line.amount) : extraFee(x, a.fields);
  const pay = fee == null ? B("the agency sets its fee, and you pay it to the agency", "费用由机构核定，由您直接付给机构") : fee === 0 ? B("the agency charges nothing for it", "机构不收费") : B(`its ${money(fee)} fee is paid to the agency, not to Placetta`, `${money(fee)} 费用付给机构，而非快哉`);
  return x.how === "form"
    ? B(`Ask for ${lc(x.label.en)} on the agency's own form (${spanText(x)}); ${pay.en}.`, `在机构表格上申请${x.label.zh}（${spanTextZh(x)}）；${pay.zh}。`)
    : B(`Placetta's team asks the agency for ${lc(x.label.en)} when it files (${spanText(x)}); ${pay.en}.`, `快哉团队提交时向机构申请${x.label.zh}（${spanTextZh(x)}）；${pay.zh}。`);
}
/** A label mid-sentence: lower case, unless it starts with an acronym (STAR, Q-Team). */
export const lc = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const spanText = (x: Option) => (x.span ? spanSay(x.span).en : x.turnaround.en);
const spanTextZh = (x: Option) => (x.span ? spanSay(x.span).zh : x.turnaround.zh);
