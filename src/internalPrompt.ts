/* The requests Placetta writes for Odelia itself (src/autonomy.ts workPrompt, src/jobs.ts continuePrompt): they start
   or carry on a job and carry its internal id, which is what lets the run pick the job up. They're sent as the
   person's turn, so without this they showed in the chat as a message the person never typed, with "job-plan-…" in
   it. What the chat shows for a turn instead: a quiet line for an approved plan starting (null text: no bubble), a
   short "Carry on" for a job the person told her to continue, and any other message as it was typed, with an internal
   job reference taken out. */

const APPROVED_EN = /^Carry on with the job: (.+?) \(job [\w-]+\)\. The owner approved its plan; work it step by step\.?$/s;
const APPROVED_ZH = /^继续这项工作：(.+?) \(job [\w-]+\)。所有者已批准计划，请按步骤完成。?$/s;
const CONTINUE_EN = /^Carry on with the job "(.+?)" \(job [\w-]+\) until it's done\..*$/s;
const CONTINUE_ZH = /^继续这项工作，直到完成：“(.+?)”（job [\w-]+）。.*$/s;
const JOB_REF = /\s*[(（]job [\w-]+[)）]/g;

export type Shown = { kind: "bubble"; text: string } | { kind: "line"; text: string };

/** What the chat shows for a turn the app sent as the person's. */
export function shownPrompt(text: string): Shown {
  const t = text.trim();
  let m = APPROVED_EN.exec(t);
  if (m) return { kind: "line", text: `You approved the plan: ${m[1]}` };
  m = APPROVED_ZH.exec(t);
  if (m) return { kind: "line", text: `您已批准计划：${m[1]}` };
  m = CONTINUE_EN.exec(t);
  if (m) return { kind: "bubble", text: `Carry on with “${m[1]}”` };
  m = CONTINUE_ZH.exec(t);
  if (m) return { kind: "bubble", text: `继续“${m[1]}”` };
  return { kind: "bubble", text: t.replace(JOB_REF, "") };
}
