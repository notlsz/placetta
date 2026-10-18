import { B, type Bi } from "./bi";
import { audit, dropApproval } from "./core";
import { makeTools, runTool, type Made, type Model, type Services, type Tool } from "./live";
import { APPLY_CMD, GO_CMD, approvePlan, planApprovalId, withControls, workPrompt } from "./autonomy";
import { addUndo, recorder } from "./rewind";
import type { Workspace } from "./model";
import type { Lang } from "./i18n";

/* What an owner approved, carried out: the changes Odelia held under Ask me first, and the plan she wrote under Plan
   first. In an account the server does it (src/serverRun.ts, as a run the app starts with "/apply <card>" or
   "/go <job>", and agent-run lets only an owner start those); in the sample and with an API key the app does it here. */

/** Which owner's approval a request carries out, if any. */
export const ownerCommand = (prompt: string): { apply: string } | { go: string } | null => {
  const a = APPLY_CMD.exec(prompt)?.[1], g = GO_CMD.exec(prompt)?.[1];
  return a ? { apply: a } : g ? { go: g } : null;
};

/** Make the held changes on one card, in order, through the same guarded tools (a Never rule added since still stops
 *  one). The card closes first, so a second tap can't make them twice. */
export async function applyHeld(get: () => Workspace, apply: (p: (w: Workspace) => Workspace) => void, tools: Tool[], id: string, lang: Lang): Promise<{ done: Bi[]; failed: Bi[]; text: Bi } | null> {
  const card = get().approvals.find(a => a.id === id);
  if (!card || card.change?.op !== "held") return null;
  const calls = card.change.calls;
  apply(dropApproval(id));
  const done: Bi[] = [], failed: Bi[] = [];
  for (const [k, call] of calls.entries()) {
    const r = await runTool(tools, { type: "tool_use", id: `held-${k}`, name: call.tool, input: call.input });
    (r.is_error ? failed : done).push(call.say);
  }
  apply(audit("you", B("Approved Odelia's changes", "批准了 Odelia 的更改"), card.title, B(`${done.length} made${failed.length ? `, ${failed.length} couldn't be made` : ""}`, `完成 ${done.length} 项${failed.length ? `，${failed.length} 项未能完成` : ""}`)));
  void lang;
  const text = !failed.length
    ? B(`Done: I made the ${done.length === 1 ? "change" : `${done.length} changes`} you approved.`, `已完成您批准的 ${done.length} 项更改。`)
    : B(`I made ${done.length} of the ${calls.length} changes you approved. These couldn't be made: ${failed.map(f => f.en).join("; ")}.`, `您批准的 ${calls.length} 项更改中完成了 ${done.length} 项。未能完成：${failed.map(f => f.zh).join("；")}。`);
  return { done, failed, text };
}

/** A model for held changes that never needed one; reading a document does, and says plainly it can't here. */
const NO_MODEL: Model = {
  kind: "api", tools: false, images: false, pdfs: false, system: true,
  async chat() { throw { code: "unsupported", message: "Reading needs Odelia running here" }; },
  async json() { throw { code: "unsupported", message: "Reading needs Odelia running here" }; },
};

/** Held changes approved outside an account (the sample, or an API key): made here, in this browser, with an undo point
 *  of their own. apply takes the app's setter; changes go to a mirror first so each call sees the one before. */
export async function applyHeldHere(id: string, d: { get: () => Workspace; apply: (p: (w: Workspace) => Workspace) => void; lang: Lang; model?: Model | null; svc?: Services; files: Map<string, File>; account: boolean }): Promise<{ text: Bi; undo: string } | null> {
  const rec = recorder();
  let cur = d.get();
  const get = () => cur;
  const apply = (p: (w: Workspace) => Workspace) => { cur = p(cur); d.apply(rec.wrap(p)); };
  const made: Made = { apps: new Set(), approvals: [], memory: [], skills: [], files: [], lastToolAt: 0 };
  const tools = withControls(makeTools(get, apply, () => undefined, made, d.lang, () => 0, d.account, { model: d.model ?? NO_MODEL, files: d.files, svc: d.svc, signal: new AbortController().signal }),
    { get, apply, mode: { mode: "usual", why: "workspace" }, remote: false, run: "held", made });
  const title = get().approvals.find(a => a.id === id)?.title;
  const r = await applyHeld(get, apply, tools, id, d.lang);
  if (!r) return null;
  const undo = "undo-h" + Date.now().toString(36);
  d.apply(w => addUndo({ id: undo, at: new Date().toISOString(), title: title ? B(`Approved: ${title.en}`, `已批准：${title.zh}`) : undefined, recs: rec.recs() })(w));
  return { text: r.text, undo };
}

/** Start an approved plan: mark it approved (once), and the request the work runs from. null when there's no plan
 *  waiting for that job. */
export function goPlan(get: () => Workspace, apply: (p: (w: Workspace) => Workspace) => void, job: string, lang: Lang, by?: string): string | null {
  const w = get(), j = (w.jobs ?? []).find(x => x.id === job);
  if (!j) return null;
  const waiting = w.approvals.some(a => a.id === planApprovalId(job));
  const approved = (w.controls?.plans ?? []).some(p => p.job === job && p.state === "approved");
  if (!waiting && !approved) return null;
  if (waiting) apply(approvePlan(job, by));
  return workPrompt(j, lang);
}
