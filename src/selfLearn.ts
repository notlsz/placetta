import { B, type Bi } from "./bi";
import { formById } from "./forms/registry";
import type { Workspace } from "./model";
import type { NewLesson } from "./learning";

/* ------------------------------------------------------------------ *
 * Odelia learns from her own slips.
 *
 * The network (src/learning.ts) learns what agencies require from finished
 * jobs. This learns how to get the work through: when a tool refuses what
 * she gave it (a line that isn't one of the form's choices, a format the
 * check before approval rejects, a call that errors) and a later try in
 * the same run is accepted, the pair becomes a fix lesson for that form,
 * or for that tool when no form is involved. Every run after that, for
 * every business, starts from the fixes for its forms and tools, so the
 * same slip isn't made twice.
 *
 * A fix lesson is written from Placetta's own words only: the form's
 * title, the line's printed label, the form's own choices, the checker's
 * note. What she typed is kept as its shape ("99 / 99 / 99", "Xxx Xxxx,
 * xxxxx"), never the business's value. So a fix carries no one's data,
 * and it is live at once: it comes from Placetta's own checks, not from a
 * business's opinion. Probe runs teach too.
 * ------------------------------------------------------------------ */

export type Slip = { tool: string; app?: string; form?: string; line?: string; label?: string; reason: string; bad?: string; keys?: string[] };
export type Fix = Slip & { good?: string; changed?: string[] };
export type SelfState = { slips: Slip[]; fixes: Fix[]; seen?: Slip[]; forms?: string[]; tools?: string[] };

/** A value's shape: digits as 9, letters as x or X, the rest kept, lines joined by " / ". */
export const shape = (v: string) => String(v ?? "").replace(/\d/g, "9").replace(/[A-Z]/g, "X").replace(/[a-z]/g, "x").replace(/[^\x20-\x7E\n]/g, "x").replace(/\s*\n\s*/g, " / ").replace(/\s+/g, " ").trim().slice(0, 60);
const norm = (s: string) => String(s ?? "").toLowerCase().replace(/^(line|section|page|part)\s+[\w.-]+\s*[:.-]?\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();
const firstSentence = (s: string) => String(s ?? "").replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0].slice(0, 180);
const parse = (c: unknown): Record<string, unknown> | null => { if (c && typeof c === "object") return c as Record<string, unknown>; try { const v = JSON.parse(String(c ?? "")); return v && typeof v === "object" ? v : null; } catch { return null; } };
const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];

/** The line of the form a label names, by id, printed label or the start of it. */
function lineOf(formId: string | undefined, label: string): { id: string; label: string; options?: string[] } | undefined {
  const off = formId ? formById(formId) : undefined;
  if (!off) return undefined;
  const k = norm(label);
  const f = off.fields.find(x => x.id === label || norm(x.label.en) === k || norm(`${x.line} ${x.label.en}`) === k)
    ?? (k.length >= 12 ? off.fields.find(x => norm(x.label.en).startsWith(k)) : undefined);
  return f ? { id: f.id, label: f.label.en, options: f.options } : undefined;
}

/** After each tool call: note what was refused, and what a later call got accepted. */
export function noteCall(s: SelfState, call: { name: string; input: Record<string, unknown>; content: unknown; error: boolean }, w: Workspace) {
  const { name, input, content, error } = call;
  const appId = String(input.application_id ?? "");
  const app = appId ? w.apps.find(a => a.id === appId) : undefined;
  const form = app?.official;
  const out = error ? null : parse(content);
  const refusedNow = new Set<string>();
  const slip = (x: Slip) => {
    // every slip, fixed or not, is kept for the reinforcement at the end (lessonVerdicts)
    if ((s.seen ??= []).length < 120) s.seen.push(x);
    if (s.slips.length < 60 && !s.slips.some(y => y.tool === x.tool && y.app === x.app && y.line === x.line && y.label === x.label && y.reason === x.reason)) s.slips.push(x);
  };
  if (form && !(s.forms ??= []).includes(form)) s.forms.push(form);
  if (!(s.tools ??= []).includes(name)) s.tools.push(name);

  if (error) {
    // the error's own words with anything quoted taken out: a quoted id or value can carry a business's name
    slip({ tool: name, app: appId || undefined, form, reason: firstSentence(String(content)).replace(/"[^"]*"|“[^”]*”|'[^']*'/g, "…"), keys: Object.keys(input).sort() });
    return;
  }
  // per line: a value that isn't one of the line's choices, an address the agency doesn't take, an SSN kept off
  if (name === "fill_fields" && out) {
    const given = arr(input.fields);
    for (const x of arr(out.not_a_choice)) {
      const l = lineOf(form, String(x.label ?? x.line ?? ""));
      const label = l?.label ?? String(x.label ?? "");
      refusedNow.add(norm(label));
      slip({ tool: name, app: appId, form, line: l?.id, label, reason: "not one of the line's printed choices", bad: String(x.value ?? "") });
    }
    for (const x of arr(out.address_not_filled)) {
      const l = form ? formById(form)?.fields.find(f => f.id === String(x.field ?? "")) : undefined;
      if (!l) continue;
      refusedNow.add(norm(l.label.en));
      slip({ tool: name, app: appId, form, line: l.id, label: l.label.en, reason: firstSentence(String(x.problem ?? "the agency doesn't take that address there")), bad: String(x.value ?? "") });
    }
    // what this call got onto a line that an earlier call couldn't
    for (const g of given) {
      const label = String(g.label ?? ""), v = String(g.value ?? "");
      if (!v.trim() || refusedNow.has(norm(label))) continue;
      const l = lineOf(form, label);
      const open = s.slips.findIndex(x => x.tool !== "error" && x.app === appId && x.label && (x.line && l ? x.line === l.id : norm(x.label) === norm(label)));
      if (open < 0) continue;
      const was = s.slips.splice(open, 1)[0];
      const good = l?.options?.find(o => o.toLowerCase() === v.trim().toLowerCase()) ?? shape(v);
      if (was.bad === undefined || shape(was.bad) !== shape(v) || l?.options?.length) s.fixes.push({ ...was, good });
    }
  }
  // the check before approval: "Label: what's wrong" for each line it stopped on
  if (name === "request_filing_approval" && out && out.approval_requested === false) {
    for (const line of (Array.isArray(out.lines) ? out.lines : []) as string[]) {
      const m = /^(.{3,160}?):\s+(.+)$/.exec(String(line));
      if (!m) continue;
      const l = lineOf(form, m[1]);
      const field = app?.fields.find(f => (l && f.id === l.id) || norm(f.label.en) === norm(m[1]));
      slip({ tool: "fill_fields", app: appId, form, line: l?.id ?? field?.id, label: l?.label ?? m[1], reason: firstSentence(m[2]), bad: field?.value });
    }
  }
  // a tool that errored before and works now: what the call changed
  const before = s.slips.findIndex(x => x.tool === name && !x.label);
  if (before >= 0) {
    const was = s.slips.splice(before, 1)[0];
    const keys = Object.keys(input).sort();
    const changed = [...new Set([...keys.filter(k => !(was.keys ?? []).includes(k)), ...(was.keys ?? []).filter(k => !keys.includes(k))])];
    s.fixes.push({ ...was, changed });
  }
}

/** The fixes as lessons, keyed by the form (or the tool), in Placetta's own words. At most 6 a run. */
export function fixLessons(fixes: Fix[]): NewLesson[] {
  const out: NewLesson[] = [];
  for (const f of fixes) {
    const off = f.form ? formById(f.form) : undefined;
    let text: Bi | null = null;
    if (f.label && off) {
      const good = f.good ? (off.fields.find(x => x.id === f.line)?.options?.includes(f.good) ? `the choice "${f.good}"` : `the shape "${f.good}"`) : "";
      const bad = f.bad !== undefined && f.bad !== "" ? ` "${shape(f.bad)}"` : " the first answer";
      text = B(`${off.title.en}, line "${f.label}": it refused${bad} (${f.reason.replace(/\.$/, "")}). What it took: ${good || "a corrected answer"}.`,
        `${off.title.zh}，“${f.label}”一栏：拒收了${f.bad ? `“${shape(f.bad)}”` : "第一次的填写"}（${f.reason.replace(/\.$/, "")}）。接受的是：${f.good ? `“${f.good}”` : "更正后的答案"}。`);
    } else if (!f.label && f.tool) {
      text = B(`${f.tool}: it failed with "${f.reason.replace(/"/g, "'")}"${f.changed?.length ? ` and worked once the call changed ${f.changed.join(", ")}` : " and worked on the next try"}.`,
        `${f.tool}：报错“${f.reason.replace(/"/g, "'")}”${f.changed?.length ? `，改动 ${f.changed.join("、")} 后成功` : "，再次调用后成功"}。`);
    }
    if (!text || text.en.length < 20) continue;
    const key = f.label && off ? `form:${off.id}` : `tool:${f.tool}`;
    const push = (k: string, t: Bi) => { if (!out.some(x => x.key === k && x.text.en === t.en)) out.push({ kind: "fix" as NewLesson["kind"], key: k, text: { en: t.en.slice(0, 410), zh: t.zh.slice(0, 410) }, official: true }); };
    push(key, text);
    // the same fix as a pattern for every form (the "different scenarios"): the reason and what kind of answer it took,
    // without the form; the same pattern seen on more forms adds confirmations to one lesson instead of new ones
    if (f.label && off && f.reason) {
      const choice = !!off.fields.find(x => x.id === f.line)?.options?.includes(f.good ?? "");
      push("tool:fill_fields", B(`Any form: a line refused as "${f.reason.replace(/\.$/, "")}" was accepted ${choice ? "as one of its own printed choices, word for word (Not applicable when none fits)" : f.good ? `in the shape "${f.good}"` : "once corrected the same turn"}.`,
        `任何表格：因“${f.reason.replace(/\.$/, "")}”被拒的栏目，${choice ? "改为该栏印刷选项之一（逐字；都不适用则填 Not applicable）" : f.good ? `改为“${f.good}”的格式` : "在同一轮更正"}后被接受。`));
    }
    if (out.length >= 8) break;
  }
  return out;
}

/** The tools whose fixes every run starts from (a form's own fixes come with its key). */
export const TOOL_KEYS = ["tool:fill_fields", "tool:prepare_application", "tool:request_filing_approval", "tool:update_application", "tool:find_official_forms"];

/** The fix lessons a run started from, judged by what the run did (reinforcement): a lesson whose slip happened again
 *  in this run loses; one whose form or tool the run used without that slip wins; one the run never touched is left
 *  alone. Lessons that keep losing retire (the database's rule), and the ones that keep winning rank first. */
export function lessonVerdicts(s: SelfState | undefined, inPlay: { id: string; key: string; text: string }[]): { wins: string[]; losses: string[] } {
  const wins: string[] = [], losses: string[] = [];
  if (!s) return { wins, losses };
  const seen = s.seen ?? [];
  for (const l of inPlay) {
    const label = /line "([^"]+)"/.exec(l.text)?.[1];
    const reason = /refused as "([^"]+)"|refused [^(]*\(([^)]+)\)/.exec(l.text);
    const why = (reason?.[1] ?? reason?.[2] ?? "").toLowerCase();
    if (l.key.startsWith("form:")) {
      const form = l.key.slice(5);
      if (!(s.forms ?? []).includes(form)) continue;
      const again = seen.some(x => x.form === form && (!label || (x.label ?? "").toLowerCase() === label.toLowerCase()) && (!why || x.reason.toLowerCase().includes(why.slice(0, 24))));
      (again ? losses : wins).push(l.id);
    } else if (l.key.startsWith("tool:")) {
      const tool = l.key.slice(5);
      if (!(s.tools ?? []).includes(tool) || !why) continue;   // a rule with no refusal to watch for is neither won nor lost
      const again = !!why && seen.some(x => (x.tool === tool || tool === "fill_fields") && x.reason.toLowerCase().includes(why.slice(0, 24)));
      (again ? losses : wins).push(l.id);
    }
  }
  return { wins, losses };
}
