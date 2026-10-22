/* The online grader: a share of finished runs (GUARDRAIL.graderSampleRate, src/economics.ts) is graded after the fact
   with plain checks, no model, so it costs nothing. Copied from Braintrust's online scoring (rules sample a share of
   production traces and score them in the background, adding no latency: braintrust.dev/docs/evaluate/score-online)
   and LangSmith's automation rules (a filter, a sampling rate, then an action such as adding the run to an annotation
   queue: docs.langchain.com/langsmith/rules); the queue here is the staff triage (qa_findings). What it checks is what
   Harvey asks of a legal answer (a substantive claim needs a source linked to it: harvey.ai/blog/biglaw-bench-sources)
   and Placetta's own policy:
     policy       the reply says Odelia filed, paid or sent something herself (src/guard.ts claimsAction)
     secret       an SSN, ITIN or card number in the reply
     uncited      the reply states a fee, a processing time or a form number, and nothing in the run looked it up
     unchecked    an application the run touched is ready to file but fails the check before approval (src/smart.ts)
     tool_errors  more than 30% of the run's tool calls failed
   Each finding carries the run's id as its repro. Pure: agent-run calls it and writes what it returns. */
import type { Approval, Workspace } from "../model";
import { claimsAction, redact } from "../guard";
import { preflight } from "../smart";
import type { Finding } from "./sweep";

export type GradedCall = { name: string; ok: boolean };
/** Whether this run is in the sample: a stable hash of its id, so a retry of the same run decides the same way. */
export function sampled(runId: string, rate: number): boolean {
  let h = 2166136261;
  for (let i = 0; i < runId.length; i++) { h ^= runId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000 < rate;
}

const LOOKUPS = new Set(["find_official_forms", "plan_markets", "follow_playbook", "prepare_application", "show_licenses", "check_progress", "address_rules", "inspection_guide", "web_search", "web_fetch"]);
const CLAIMS = /\$\s?\d[\d,]*(\.\d{2})?\b(?!\s*(a|per) (store|month|year))|\b\d+\s*(to|-)\s*\d+\s*(business |working )?(days|weeks)\b|\bform\s+[A-Z]{0,4}-?\d{2,}/i;

export function gradeRun(o: { runId: string; reply: string; calls: GradedCall[]; ws: Workspace; apps: string[]; today: string }): Finding[] {
  const out: Finding[] = [];
  const repro = `Run ${o.runId} (Agent health, Replay).`;
  if (claimsAction(o.reply)) out.push({ kind: "grader", severity: "high", source: "policy", subject: o.runId, repro, fix: "The reply claims Odelia filed, paid or sent something. Check the honesty footer was added; add the phrasing to src/guard.ts CLAIM patterns if it slipped through." });
  if (redact(o.reply) !== o.reply) out.push({ kind: "grader", severity: "high", source: "secret", subject: o.runId, repro, fix: "A secret number reached a reply. Find which tool output carried it and mask it there (src/guard.ts redact)." });
  // Placetta's own prices (src/pricing.ts) are Odelia's to quote; agency facts are not
  const said = o.reply.replace(/\$\s?(149|299|999|99|49|1,788)\b/g, "");
  if (CLAIMS.test(said) && !o.calls.some(c => c.ok && LOOKUPS.has(c.name)))
    out.push({ kind: "grader", severity: "medium", source: "uncited", subject: o.runId, repro: `${repro} The reply states "${(CLAIMS.exec(said)?.[0] ?? "").slice(0, 60)}" with no lookup in the run.`,
      fix: "Every fee, time and form number comes from find_official_forms, a playbook or an official page in the same run. Add the case to the eval set and tighten the instruction." });
  for (const id of o.apps) {
    const a = o.ws.apps.find(x => x.id === id);
    if (!a || a.status !== "ready") continue;
    const pf = preflight(o.ws, { id: "grade", kind: "file", app: id, title: a.name, data: [], created: o.today } as unknown as Approval, o.today);
    if (pf.errors.length) out.push({ kind: "grader", severity: "high", source: "unchecked", subject: `${o.runId}:${id}`, repro: `${repro} ${a.name.en}: ${pf.errors.map(e => `${e.label.en}: ${e.note.en}`).join("; ").slice(0, 400)}`,
      fix: "An application marked ready fails the check before approval: find how it got to ready without request_filing_approval's checks." });
  }
  const failed = o.calls.filter(c => !c.ok).length;
  if (o.calls.length >= 4 && failed / o.calls.length > 0.3) out.push({ kind: "grader", severity: "low", source: "tool_errors", subject: o.runId, repro: `${repro} ${failed} of ${o.calls.length} tool calls failed.`,
    fix: "Read the failed calls' errors in the replay; a tool whose arguments the model keeps getting wrong needs a clearer description or schema." });
  return out;
}
