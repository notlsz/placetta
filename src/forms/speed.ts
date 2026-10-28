// How fast an agency handles a filing, and what it charges to go faster: the readers of OfficialForm.processing and
// OfficialForm.expedite (types in src/forms/registry.ts). The plan, the price and the approval card call these, never
// the raw fields, so a tier whose sentence wasn't seen on its page within MAX_PROOF_AGE days (src/plan/ask.ts) is never
// offered: fail closed, as every claim in the library.
import { B, type Bi } from "../bi";
import { proofCurrent } from "../plan/ask";
import type { Expedite, FactSource, OfficialForm, Processing } from "./registry";

const asProof = (s: FactSource) => ({ read: s.url, quote: s.quote });
/** A fact's source is current: its sentence was found on its page by the last re-read, within MAX_PROOF_AGE days. */
export const sourceCurrent = (s: FactSource | undefined, today: string): boolean => !!s && !!proofCurrent(asProof(s), today);

/** The standard processing time a plan may state today, or null. */
export function processingOf(f: OfficialForm | undefined, today: string): Processing | null {
  return f?.processing && sourceCurrent(f.processing.source, today) ? f.processing : null;
}

/** The expedite tiers a plan may offer today, fastest first. */
export function expediteOf(f: OfficialForm | undefined, today: string): Expedite[] {
  return (f?.expedite ?? []).filter(x => sourceCurrent(x.source, today))
    .sort((a, b) => (a.hours ?? 1e6) - (b.hours ?? 1e6) || (a.feeUsd ?? 0) - (b.feeUsd ?? 0));
}

/** The cheapest current tier at or under `hours` of turnaround (e.g. 24 for "by tomorrow"), or null. */
export function expediteWithin(f: OfficialForm | undefined, hours: number, today: string): Expedite | null {
  return expediteOf(f, today).filter(x => x.hours != null && x.hours <= hours).sort((a, b) => (a.feeUsd ?? 1e9) - (b.feeUsd ?? 1e9))[0] ?? null;
}

/** The days a file-by date counts back for this form: the agency's standard processing time when current, else null. */
export const processingDays = (f: OfficialForm | undefined, today: string): number | null => processingOf(f, today)?.days ?? null;

/** One line for a tier, as the approval card and the plan row show it: "24-hour: $50, within 24 hours". */
export function expediteLine(x: Expedite): Bi {
  const fee = x.feeUsd == null ? null : `$${x.feeUsd.toLocaleString("en-US")}`;
  return B(`${x.label.en}: ${fee ? fee + " extra" : "fee set by the agency"}, ${x.turnaround.en}`, `${x.label.zh}：${fee ? `另付 ${x.feeUsd} 美元` : "费用由机构确定"}，${x.turnaround.zh}`);
}

/** The approval card's speed block for a filing: the standard time and each current expedite tier, each with its source. */
export function speedCard(f: OfficialForm | undefined, today: string): { standard: Bi | null; standardSource: string | null; tiers: { line: Bi; feeUsd: number | null; hours: number | null; source: string }[] } {
  const p = processingOf(f, today);
  return {
    standard: p?.standard ?? null, standardSource: p?.source.url ?? null,
    tiers: expediteOf(f, today).map(x => ({ line: expediteLine(x), feeUsd: x.feeUsd, hours: x.hours, source: x.source.url })),
  };
}

/** Every fact source on the library's forms, for the proof re-read (scripts/eval/proof-dump.ts). */
export function speedSources(forms: OfficialForm[]): { id: string; read: string; quote: string }[] {
  const out: { id: string; read: string; quote: string }[] = [];
  for (const f of forms) {
    if (f.processing) out.push({ id: `${f.id}:processing`, read: f.processing.source.url, quote: f.processing.source.quote });
    (f.expedite ?? []).forEach((x, k) => out.push({ id: `${f.id}:expedite:${k}`, read: x.source.url, quote: x.source.quote }));
    if (f.entity?.agent?.source) out.push({ id: `${f.id}:agent`, read: f.entity.agent.source.url, quote: f.entity.agent.source.quote });
    if (f.entity?.report?.source) out.push({ id: `${f.id}:report`, read: f.entity.report.source.url, quote: f.entity.report.source.quote });
  }
  return out;
}
