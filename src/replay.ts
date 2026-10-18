import type { OrbState } from "thinking-orbs";
import { B, same, type Bi } from "./bi";
import type { Diff, Step } from "./core";
import type { Workspace } from "./model";
import { MAIN_BOT, type Job } from "./jobs";
import { redact, redactValue } from "./guard";
import type { Tool } from "./live";

/* ------------------------------------------------------------------ *
 * The replay: every job keeps a timeline of how it was done, the way a
 * screen recording of an engineer's session would show it. Each moment
 * says when, which bot, and what happened: a step, a tool she used (what
 * she gave it and what came back, and whether it worked), an approval
 * she put up, the reviewer's verdict, a fresh shift, a job split across
 * stores, the answer. Where a moment changed the workspace, it carries
 * the change: lines filled, documents added, approvals put up.
 *
 * A moment is a Step with a kind (src/core.ts). The server keeps a run's
 * moments on agent_runs.steps; a run in the browser keeps them in the
 * workspace's runLog. A job links the runs that worked it (job.runs).
 *
 * What a moment never holds: the request's own words or Odelia's
 * instructions, a message or document body, or a secret. Inputs are
 * summarized from names and ids only, and every value goes through the
 * guard (src/guard.ts redact and redactValue).
 * ------------------------------------------------------------------ */

/** Whether a moment also shows in the chat's step list: plain steps, a fresh shift and a split do; the tool calls,
 *  approvals, verdicts and the answer are the replay's own detail. */
export const inChat = (s: Step) => !s.kind || s.kind === "shift" || s.kind === "split";
/** A run's moments, as the workspace keeps them for runs that happened in the browser. */
export type RunLog = { id: string; at: string; bot?: string; job?: string; steps: Step[] };
/** Tool moments one run keeps; a longer run keeps its steps, approvals and verdicts but stops adding tool moments. */
export const MAX_MOMENTS = 300;
/** Runs the workspace keeps in its own log, newest last. */
export const MAX_LOGS = 12;

const clip = (s: string, n: number) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
const safe = (s: unknown, n = 80) => clip(redact(String(s ?? "")), n);

/** What each tool does, in the words a person would use. */
const WORDS: Record<string, Bi> = {
  find_official_forms: B("Looked up the official forms", "查找官方表格"),
  prepare_application: B("Prepared an application", "准备申请"),
  fill_fields: B("Filled form lines", "填写表格"),
  update_application: B("Updated an application", "更新申请"),
  request_filing_approval: B("Put a filing up for approval", "提交申报待您批准"),
  draft_message: B("Drafted a message for approval", "起草待批准的消息"),
  add_deadline: B("Added a deadline", "添加截止日期"),
  edit_deadline: B("Changed a deadline", "修改截止日期"),
  remember: B("Saved a business fact", "保存企业资料"),
  network_lessons: B("Read what other businesses learned", "参考其他商家的经验"),
  skill_read: B("Opened a playbook", "打开手册"),
  skill_save: B("Saved a playbook", "保存手册"),
  set_plan: B("Updated the plan", "更新计划"),
  hand_off: B("Wrote notes for the next shift", "为下一班写备注"),
  schedule_routine: B("Set up a routine", "设置例行任务"),
  cancel_routine: B("Changed a routine", "修改例行任务"),
  add_store: B("Added a store", "添加门店"),
  update_store: B("Asked to change a store", "请求修改门店"),
  remove_store: B("Asked to remove a store", "请求移除门店"),
  remove_application: B("Asked to remove an application", "请求移除申请"),
  edit_workspace: B("Changed the business's name or goal", "修改企业名称或目标"),
  change_setting: B("Changed a setting", "修改设置"),
  memory_save: B("Saved to memory", "存入记忆"),
  memory_search: B("Searched memory", "搜索记忆"),
  search_past_chats: B("Searched past chats", "搜索过往对话"),
  show_licenses: B("Listed licenses", "列出许可"),
  city_records: B("Read the city's records", "查阅城市记录"),
  check_progress: B("Checked progress", "查看进度"),
  draft_document: B("Drafted a document", "起草文件"),
  review_documents: B("Read documents", "审阅文件"),
  address_rules: B("Read the agency's address rules", "查阅机构的地址规则"),
  inspection_guide: B("Read the inspection checklist", "查阅检查清单"),
  request_purchase: B("Asked to buy something", "申请购买"),
  set_budgets: B("Proposed budgets", "提议预算"),
  search_email: B("Searched email", "搜索邮件"),
  read_email: B("Read an email", "阅读邮件"),
  send_email: B("Drafted an email for approval", "起草待批准的邮件"),
  add_calendar_event: B("Added a calendar event", "添加日历事件"),
  find_files: B("Searched the drive", "搜索云盘"),
  import_file: B("Imported a file", "导入文件"),
  get_income: B("Read the books", "查阅账目"),
  get_sales: B("Read the sales", "查阅销售"),
  get_staff: B("Read the staff schedule", "查阅员工排班"),
  split_job: B("Split the job across stores", "把工作分给各门店"),
  web_search: B("Searched official sites", "搜索官方网站"),
  web_fetch: B("Read an official page", "阅读官方网页"),
};
export function toolWords(name: string): Bi {
  if (WORDS[name]) return WORDS[name];
  const h = clip(name.replace(/[_-]+/g, " "), 40);
  return B(h.charAt(0).toUpperCase() + h.slice(1), `使用工具：${h}`);
}
const STATE: Record<string, OrbState> = {
  find_official_forms: "searching", network_lessons: "searching", memory_search: "searching", search_past_chats: "searching", city_records: "searching",
  check_progress: "searching", search_email: "searching", read_email: "searching", find_files: "searching", address_rules: "searching", inspection_guide: "searching",
  draft_message: "composing", draft_document: "composing", send_email: "composing", request_filing_approval: "composing",
  set_plan: "weaving", split_job: "weaving", hand_off: "shaping", skill_save: "weaving", skill_read: "weaving",
  review_documents: "shaping", fill_fields: "shaping", prepare_application: "shaping",
};

/** What she gave a tool, in a line: the names and ids it was about, never a body, a note, a prompt or a value. */
export function inputLine(name: string, input: Record<string, unknown>, w: Workspace): Bi | undefined {
  const en: string[] = [], zh: string[] = [];
  const add = (b: Bi) => { if (b.en) en.push(b.en); if (b.zh) zh.push(b.zh); };
  const str = (k: string) => (typeof input[k] === "string" && (input[k] as string).trim() ? (input[k] as string) : "");
  const app = str("application_id") ? w.apps.find(a => a.id === str("application_id")) : undefined;
  if (app) add(app.name); else if (str("application_id")) add(same(safe(str("application_id"), 40)));
  const store = str("store_id") ? (w.stores ?? []).find(s => s.id === str("store_id")) : undefined;
  if (store) add(store.name); else if (str("store_id")) add(same(safe(str("store_id"), 40)));
  const job = str("job_id") ? (w.jobs ?? []).find(j => j.id === str("job_id")) : undefined;
  if (job) add(job.title);
  if (str("official_form_id")) add(B(`form ${safe(str("official_form_id"), 30)}`, `表格 ${safe(str("official_form_id"), 30)}`));
  for (const k of ["title", "name", "business", "place", "location", "city", "payee", "setting", "every"]) if (str(k)) add(same(safe(str(k), 60)));
  if (str("to")) add(B(`to ${safe(str("to"), 50)}`, `发给 ${safe(str("to"), 50)}`));
  if (str("date")) add(same(safe(str("date"), 20)));
  if (str("query") || str("search")) add(B(`"${safe(str("query") || str("search"), 50)}"`, `“${safe(str("query") || str("search"), 50)}”`));
  if (name === "remember" && str("label")) add(B(`${safe(str("label"), 40)}: ${clip(redactValue(str("label"), str("value")), 40)}`, `${safe(str("label"), 40)}：${clip(redactValue(str("label"), str("value")), 40)}`));
  const n = (k: string) => (Array.isArray(input[k]) ? (input[k] as unknown[]).length : 0);
  if (n("fields")) add(B(`${n("fields")} line${n("fields") === 1 ? "" : "s"}`, `${n("fields")} 行`));
  if (n("documents")) add(B(`${n("documents")} document${n("documents") === 1 ? "" : "s"}`, `${n("documents")} 份文件`));
  if (name === "set_plan" && n("steps")) add(B(`${n("steps")} steps`, `${n("steps")} 步`));
  if (n("store_ids")) add(B(`${n("store_ids")} stores`, `${n("store_ids")} 家门店`));
  if (str("status")) add(same(safe(str("status"), 20)));
  if (!en.length) return undefined;
  return B(clip(en.join(", "), 140), clip(zh.join("，"), 140));
}

/** What came back from a tool, in a line: the error in its own words, or the few facts that matter. */
export function resultLine(content: string, error: boolean): Bi {
  if (error) { const m = safe(content.replace(/^Error:\s*/, ""), 160); return B(m, `未成功：${m}`); }
  let o: Record<string, unknown> | null = null;
  try { const p = JSON.parse(content); o = p && typeof p === "object" && !Array.isArray(p) ? p as Record<string, unknown> : null; } catch { /* plain text */ }
  if (!o) return content.trim() && content.trim() !== "ok" && content.trim() !== '"ok"' ? same(safe(content, 120)) : B("Done", "完成");
  const en: string[] = [], zh: string[] = [];
  const add = (e: string, z: string) => { en.push(e); zh.push(z); };
  if (o.approval_requested === true) add("Waiting for your approval", "等待您批准");
  if (o.approval_requested === false) add(`Not ready yet${typeof o.why === "string" ? ": " + safe(o.why, 90) : ""}`, `还不能提交${typeof o.why === "string" ? "：" + safe(o.why, 90) : ""}`);
  if (typeof o.filled === "number") add(`${o.filled} line${o.filled === 1 ? "" : "s"} filled`, `已填写 ${o.filled} 行`);
  if (typeof o.done === "number" && typeof o.of === "number") add(`${o.done} of ${o.of} steps done`, `已完成 ${o.done}/${o.of} 步`);
  if (Array.isArray(o.forms)) add(`${o.forms.length} form${o.forms.length === 1 ? "" : "s"} found`, `找到 ${o.forms.length} 份表格`);
  if (Array.isArray(o.applications)) add(`${o.applications.length} application${o.applications.length === 1 ? "" : "s"}`, `${o.applications.length} 项申请`);
  if (typeof o.started === "number" && typeof o.queued === "number") add(`${o.started} started, ${o.queued} waiting their turn`, `${o.started} 个已开始，${o.queued} 个排队`);
  if (Array.isArray(o.not_proven) && o.not_proven.length) add(`${o.not_proven.length} step${o.not_proven.length === 1 ? "" : "s"} still need their proof`, `${o.not_proven.length} 步尚待证明`);
  if (o.saved === false || o.covered === false) add(`Not saved${typeof o.why === "string" ? ": " + safe(o.why, 90) : ""}`, `未保存${typeof o.why === "string" ? "：" + safe(o.why, 90) : ""}`);
  if (o.waiting_for_owner_approval === true) add("Waiting for an owner to confirm", "等待所有者确认");
  if (o.refined_preview === true) add("Refined the row from the plan", "完善了计划中的这一项");
  if (!en.length) add("Done", "完成");
  return B(clip(en.join(", "), 160), clip(zh.join("，"), 160));
}

const LIST = 6;
/** What changed in the workspace between two moments: lines filled, documents and approvals added, deadlines,
 *  checklist items done, stores, business facts and jobs. undefined when nothing a person would see changed. */
export function diffOf(a: Workspace, b: Workspace): Diff | undefined {
  if (a === b) return undefined;
  const d: Diff = {};
  let more = 0;
  const push = <T,>(k: keyof Diff, v: T) => { const arr = ((d as Record<string, unknown>)[k] ??= []) as T[]; if (arr.length < LIST) arr.push(v); else more++; };
  if (a.apps !== b.apps) for (const app of b.apps) {
    const old = a.apps.find(x => x.id === app.id);
    if (old === app) continue;
    for (const f of app.fields) {
      const was = old?.fields.find(x => x.id === f.id)?.value ?? "";
      if (f.value !== was && String(f.value ?? "").trim()) push("fields", { app: app.name, label: f.label, value: clip(redactValue(f.label.en, String(f.value)), 60) });
    }
    for (const c of app.checklist) {
      const was = old?.checklist.find(x => x.id === c.id)?.state;
      if (c.state !== "missing" && was !== c.state && (was === "missing" || !old)) push("items", { app: app.name, item: c.label });
    }
  }
  if (a.docs !== b.docs) for (const doc of b.docs) if (!a.docs.some(x => x.id === doc.id)) push("docs", clip(doc.name, 60));
  if (a.approvals !== b.approvals) for (const ap of b.approvals) if (!a.approvals.some(x => x.id === ap.id)) push("approvals", ap.title);
  if (a.deadlines !== b.deadlines) for (const dl of b.deadlines) {
    const was = a.deadlines.find(x => x.id === dl.id);
    if (!was || was.date !== dl.date) push("deadlines", { date: dl.date, title: dl.title });
  }
  if (a.stores !== b.stores) for (const s of b.stores ?? []) if (!(a.stores ?? []).some(x => x.id === s.id)) push("stores", s.name);
  if (a.facts !== b.facts) for (const f of b.facts) {
    const was = a.facts.find(x => x.id === f.id);
    if (!was || was.value.en !== f.value.en) push("facts", { label: f.label, value: clip(redactValue(f.label.en, f.value.en), 60) });
  }
  if (a.jobs !== b.jobs) for (const j of b.jobs ?? []) if (!(a.jobs ?? []).some(x => x.id === j.id)) push("jobs", j.title);
  if (more) d.more = more;
  return Object.keys(d).length ? d : undefined;
}

/** A step as it's kept: its words go through the guard too (a step's label can quote what a tool was given, like a
 *  search). */
export const scrubStep = (s: Step): Step => ({ ...s, label: { en: redact(s.label.en), zh: redact(s.label.zh) } });

/** One tool call as a moment, with what it changed. */
export function toolMoment(o: { name: string; input: Record<string, unknown>; content: string; error: boolean; before: Workspace; after: Workspace }): Step {
  const diff = o.error ? undefined : diffOf(o.before, o.after);
  const input = inputLine(o.name, o.input, o.before);
  return { state: STATE[o.name] ?? "working", label: toolWords(o.name), kind: "tool", fn: o.name, ...(input ? { in: input } : {}), out: resultLine(o.content, o.error), ok: !o.error, ...(diff ? { diff } : {}) };
}
/** An approval a tool put up, as its own moment. */
export const approvalMoments = (diff: Diff | undefined): Step[] => (diff?.approvals ?? []).map(t => ({ state: "composing" as const, kind: "approval" as const, label: B(`Put up for your approval: ${t.en}`, `提交给您批准：${t.zh}`) }));
/** The reviewer's verdict on a job, as a moment. */
export function checkMoment(job: Job, verdict: { ok: boolean; why: string }[]): Step {
  const passed = verdict.filter(v => v.ok).length, of = verdict.length;
  return {
    state: "weaving", kind: "check", job: job.id, ok: passed === of,
    label: passed === of ? B(`A separate reviewer checked it: all ${of} done`, `独立检查：${of} 项全部完成`) : B(`A separate reviewer checked it: ${passed} of ${of} done`, `独立检查：${of} 项中完成 ${passed} 项`),
    items: (job.done ?? []).map((d, i) => ({ ok: verdict[i]?.ok === true, text: d.text, ...(verdict[i]?.why ? { why: same(safe(verdict[i].why, 160)) } : {}) })),
  };
}
/** The answer's moment: what it's called on the replay. */
export const REPLY_LABEL: Bi = B("The answer that went to you", "发给您的回复");
/** The answer, as the last moment: its first sentence or so. */
export function replyMoment(text: string): Step {
  const first = safe(text.split(/(?<=[.!?。！？])\s*/)[0] ?? text, 160);
  return { state: "composing", kind: "reply", label: REPLY_LABEL, out: same(first) };
}

/** Every tool, recording a moment each time it runs (for a run in the browser; the server records them itself). */
export function traced(tools: Tool[], get: () => Workspace, emit: (s: Step) => void): Tool[] {
  let n = 0;
  return tools.map(t => ({
    ...t,
    async execute(input: Record<string, unknown>) {
      const before = get();
      const note = (content: string, error: boolean) => {
        if (n++ >= MAX_MOMENTS) return;
        const m = toolMoment({ name: t.name, input, content, error, before, after: get() });
        emit(m);
        for (const a of approvalMoments(m.diff)) emit(a);
      };
      try {
        const out = await t.execute(input);
        let content = "ok"; try { content = typeof out === "string" ? out : JSON.stringify(out ?? "ok"); } catch { /* not serializable */ }
        note(content, false);
        return out;
      } catch (e) {
        note(e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e), true);
        throw e;
      }
    },
  }));
}

/** A run's moments kept in the workspace (runs in the browser), and linked from every job it worked. */
export function keepRun(log: RunLog, since: string) {
  return <W extends { runLog?: RunLog[]; jobs?: Job[] }>(w: W): W => {
    const steps = log.steps.slice(-400);
    if (!steps.some(s => s.kind)) return w;
    const touched = (w.jobs ?? []).filter(j => j.updated >= since || steps.some(s => s.job === j.id));
    if (!touched.length) return w;
    return { ...w, runLog: [...(w.runLog ?? []).filter(r => r.id !== log.id), { ...log, steps }].slice(-MAX_LOGS),
      jobs: (w.jobs ?? []).map(j => (touched.includes(j) && !j.runs?.includes(log.id) ? { ...j, runs: [...(j.runs ?? []), log.id].slice(-6) } : j)) };
  };
}
/** Links a run to the jobs it touched (on the server, after every round). The same workspace when nothing changes. */
export function linkRun<W extends { jobs?: Job[] }>(w: W, runId: string, since: string, child?: string): W {
  // a store's bot links only its store's job; any other run, the jobs it touched but not the stores' parts
  const want = (j: Job) => (child ? j.id === child : j.updated >= since && !j.parent) && !j.runs?.includes(runId);
  if (!(w.jobs ?? []).some(want)) return w;
  return { ...w, jobs: (w.jobs ?? []).map(j => (want(j) ? { ...j, runs: [...(j.runs ?? []), runId].slice(-6) } : j)) };
}

/** The runs whose moments make up a job's replay: its own, and for a job split across stores, each store's too. */
export function runsOf(w: { jobs?: Job[] }, job: Job): string[] {
  const kids = (job.children ?? []).map(id => (w.jobs ?? []).find(j => j.id === id)).filter((j): j is Job => !!j);
  return [...new Set([...(job.runs ?? []), ...kids.flatMap(k => k.runs ?? [])])];
}
/** A job's moments, in time order, from the runs that worked it. A moment for another job of the same run is left out. */
export function momentsFor(w: { jobs?: Job[] }, job: Job, logs: RunLog[]): Step[] {
  const ids = new Set(runsOf(w, job)), mine = new Set([job.id, ...(job.children ?? [])]);
  const out: (Step & { n: number })[] = [];
  let n = 0;
  for (const r of logs) {
    if (!ids.has(r.id)) continue;
    for (const s of r.steps) {
      const own = r.job && mine.has(r.job);
      if (own || !s.job || mine.has(s.job)) out.push({ ...s, at: s.at ?? r.at, bot: s.bot ?? r.bot ?? MAIN_BOT, n: n++ });
    }
  }
  return out.sort((x, y) => (x.at ?? "").localeCompare(y.at ?? "") || x.n - y.n).map(({ n: _n, ...s }) => { void _n; return s; });
}
/** Whether a job has anything to replay. */
export const hasReplay = (w: { jobs?: Job[] }, job: Job) => runsOf(w, job).length > 0;
