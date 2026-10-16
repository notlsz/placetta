import { B, same, type Bi } from "./bi";
import type { DoneItem, Job } from "./jobs";
import type { Workspace } from "./model";

/* ------------------------------------------------------------------ *
 * The harness: one structure per job that any agent can put on, work in,
 * take off and hand to the next. Everything a job needs lives on the job
 * itself, as plain data, so no agent has to remember it:
 *   playbook   the skill it follows: the steps, worked out once (often by
 *              interviewing the owner), reused every time after
 *   toolbox    every file made for it, linked so nobody builds it twice
 *   done       what finished looks like, checked by a separate checker that
 *              never saw the work, before the job is called done
 *   handoffs   what each seat did and what's next, written when an agent
 *              runs out of room, so the next one starts clean (no
 *              compaction) and any model can take the seat
 * ------------------------------------------------------------------ */

export const MAX_SEATS = 4;            // fresh agents one run may hand a job through
export const CONTEXT_CHARS = 160_000;   // a seat hands off before its conversation grows past this
export const MAX_CHECKS = 2;            // times the checker sends work back before it goes to the person as not done

const lineOf = (s: string) => s.replace(/\s+/g, " ").trim();

/** Everything a fresh seat needs to pick a job up, and nothing else. */
export function harnessBrief(w: Workspace, job: Job, request: string, lang: "en" | "zh"): string {
  const pb = job.playbook ? (w.skills ?? []).find(s => s.id === job.playbook) : undefined;
  const files = toolbox(w, job);
  const last = (job.handoffs ?? []).slice(-3);
  const t = (b: Bi) => b[lang] || b.en;
  return [
    `You are taking over a job from the agent before you, who ran out of room. You have no memory of their conversation; this is the job's whole harness. Pick up exactly where they stopped, keep the same plan (set_plan with job_id ${job.id}), and don't redo finished steps.`,
    `What the person asked: ${lineOf(request).slice(0, 1500)}`,
    `Job ${job.id}: ${t(job.title)} (${job.status})`,
    `Plan:\n${job.steps.map((s, i) => `${i + 1}. [${s.done ? "x" : " "}] ${t(s.title)}`).join("\n")}`,
    job.done?.length ? `Done means (a separate checker verifies each before the job counts as done):\n${job.done.map(d => `- ${t(d.text)}${d.ok === false && d.why ? ` (last check: not yet, ${t(d.why)})` : ""}`).join("\n")}` : "",
    pb ? `Playbook "${t(pb.name)}" (skill ${pb.id}):\n${pb.body.slice(0, 3000)}` : "",
    files.length ? `Toolbox (reuse these, don't rebuild them):\n${files.map(f => `- ${f.name} (${f.id})`).join("\n")}` : "",
    job.apps?.length ? `Applications: ${job.apps.join(", ")}` : "",
    last.length ? `Handoff notes, newest last:\n${last.map(h => `Seat ${h.seat}: ${h.note}`).join("\n\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

/** The files a job made or uses: its own, and its playbook's. */
export function toolbox(w: Workspace, job: Job): { id: string; name: string }[] {
  const pb = job.playbook ? (w.skills ?? []).find(s => s.id === job.playbook) : undefined;
  const ids = [...new Set([...(job.files ?? []), ...(pb?.files ?? [])])];
  return ids.map(id => w.docs.find(d => d.id === id || d.name === id)).filter((d): d is NonNullable<typeof d> => !!d).map(d => ({ id: d.id, name: d.name }));
}

/** What the checker sees: the job, the parts of the workspace it touches, and the answer about to go back. Facts, not
 *  the agent's conversation, so the check can't be talked into a pass. */
export function evidence(w: Workspace, job: Job, reply: string) {
  const apps = (job.apps?.length ? w.apps.filter(a => job.apps!.includes(a.id)) : w.apps).slice(0, 8);
  return {
    job: { title: job.title.en, status: job.status, steps: job.steps.map(s => ({ step: s.title.en, done: s.done })), waiting_on: job.waiting?.en },
    applications: apps.map(a => ({
      id: a.id, name: a.name.en, status: a.status,
      fields_filled: a.fields.filter(f => String(f.value ?? "").trim()).length, fields_empty: a.fields.filter(f => !String(f.value ?? "").trim()).map(f => f.label.en).slice(0, 12),
      checklist: (a.checklist ?? []).map(c => ({ item: c.label.en, state: c.state, doc: c.doc ? (w.docs.find(d => d.id === c.doc)?.name ?? c.doc) : undefined })),
    })),
    approvals_waiting: w.approvals.map(a => ({ title: a.title.en, kind: a.kind })).slice(0, 10),
    deadlines: w.deadlines.slice(0, 15).map(d => ({ date: d.date, title: d.title.en })),
    toolbox: toolbox(w, job).map(f => f.name),
    recent_documents: w.docs.slice(0, 12).map(d => ({ name: d.name, by: d.by, at: d.at })),
    reply_to_person: reply.slice(0, 4000),
  };
}

export const CHECKER_SYSTEM = `You are the checker. Another agent did a job; you did not see its work and you are not on its side. Grade the job against its definition of done, one item at a time, using only the evidence given: the workspace as it is now and the reply about to go to the person. An item passes only when the evidence shows it; a claim in the reply that the workspace doesn't back up doesn't count, and neither does "will do" or "should". Be strict and short.
Answer with JSON only: {"items": [{"ok": true|false, "why": "one short sentence pointing at the evidence"}], one entry per item, in order}`;

export function checkerPrompt(job: Job, ev: unknown): string {
  return `You are checking this job.\n\nDefinition of done:\n${(job.done ?? []).map((d, i) => `${i + 1}. ${d.text.en}`).join("\n")}\n\nEvidence:\n${JSON.stringify(ev)}`;
}

/** The checker's answer, one verdict per done item. Unreadable or missing verdicts count as not passed. */
export function parseVerdict(text: string, n: number): { ok: boolean; why: string }[] {
  let items: { ok?: unknown; why?: unknown }[] = [];
  try {
    const m = /\{[\s\S]*\}/.exec(text);
    const j = JSON.parse(m ? m[0] : text) as { items?: unknown };
    if (Array.isArray(j.items)) items = j.items as typeof items;
  } catch { /* unreadable: everything stays unchecked */ }
  return Array.from({ length: n }, (_, i) => ({ ok: items[i]?.ok === true, why: String(items[i]?.why ?? "The checker couldn't confirm this.").slice(0, 300) }));
}

/** The verdict written onto the job. Passed: done, and checked. Not: back to running (or waiting for the person). */
export function applyVerdict(jobId: string, verdict: { ok: boolean; why: string }[], o: { final: boolean; lang: "en" | "zh" }) {
  return (w: Workspace): Workspace => ({
    ...w,
    jobs: (w.jobs ?? []).map(j => {
      if (j.id !== jobId || !j.done?.length) return j;
      const done: DoneItem[] = j.done.map((d, i) => ({ text: d.text, ok: verdict[i]?.ok === true, why: same(verdict[i]?.why ?? "") }));
      const passed = done.filter(d => d.ok).length, now = new Date().toISOString();
      const all = passed === done.length;
      const missing = done.filter(d => !d.ok).map(d => d.text.en);
      return {
        ...j, done, checked: { at: now, passed, of: done.length },
        status: all ? "done" as const : o.final ? "waiting" as const : "running" as const,
        ...(all ? { waiting: undefined } : o.final ? { waiting: B(`Not done yet: ${missing.join("; ")}`.slice(0, 240), `尚未完成：${missing.join("；")}`.slice(0, 240)) } : {}),
        updated: now,
      };
    }),
  });
}

/** One line for the reply, so the person sees the proof, not just a claim. */
export function proofLine(job: Job, lang: "en" | "zh"): string {
  const c = job.checked;
  if (!c) return "";
  const missing = (job.done ?? []).filter(d => !d.ok).map(d => d.text[lang] || d.text.en);
  if (lang === "zh") return c.passed === c.of ? `已由独立检查确认：${c.of} 项全部完成。` : `独立检查：${c.of} 项中完成 ${c.passed} 项。尚未完成：${missing.join("；")}。`;
  return c.passed === c.of ? `Checked by a separate reviewer: all ${c.of} done.` : `Checked by a separate reviewer: ${c.passed} of ${c.of} done. Not yet: ${missing.join("; ")}.`;
}
