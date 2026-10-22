import { same, type Bi } from "./bi";
import type { FilledNote, Reply, Step } from "./core";
import { loaderWith } from "./forms/fill";
import { answersHash, refreshForms, type FilledCopy } from "./forms/versions";
import type { Lang } from "./i18n";
import type { Workspace } from "./model";
import { clean, honest, makeTools, messagesModel, official, outOfSteps, rules, runAll, runTool, type Block, type Made, type Role, type Services, type Source, type Tool, type Turn } from "./live";
import { groupOf, groupsFor, toolLoader } from "./toolIntent";
import { addSpan, modelSpan, type Span } from "./trace";
import { B } from "./bi";
import { MAIN_BOT, proven, reconcile, settleJobs, STOPPED_HERE, type Job } from "./jobs";
import { finishWork, reportLines, stampFilings } from "./finish";
import { addUsed, citedPages, sourceLinks, sourcesLine, type Used, usedBy, usedInBlocks } from "./sources";
import { MCP_PREFIX } from "./mcp";
import { applyVerdict, CHECKER_SYSTEM, checkerPrompt, CONTEXT_CHARS, evidence, formFailures, harnessBrief, MAX_CHECKS, MAX_SEATS, openLine, parseVerdict, proofLine, saysDone, storeName, storeRules } from "./harness";
import { approvalMoments, checkMoment, linkRun, MAX_MOMENTS, replyMoment, scrubStep, toolMoment } from "./replay";
import { controlsBrief, jobsDone, runMode, withControls, type ControlCtx, type RunMode } from "./autonomy";
import { applyHeld, goPlan, ownerCommand } from "./held";
import { addUndo, recorder, undoTitle, type UndoRec } from "./rewind";
import type { Notice } from "./businessRules";
import { emailsIn } from "./guard";
import { mcpReads } from "./mcp";
import { secureTools, Shield, type ToolLog } from "./security/secure";
import { newRunPolicy, type Actor } from "./security/policy";
import { neutralize } from "./security/untrusted";
import { sanitizeOutput } from "./security/output";
import { scrubCredentials } from "./security/secrets";
import { keepOwnerControls } from "./security/controls";
import { scanServerResults } from "./security/web";
// Agent memory (src/odeliaMemory/): the cache-ordered prompt, the memory tools, and the processors every call goes through
import { commandNote, emptyOut, memoryTools, scopeNames, systemFor, using, type RunMemory, type RunMemoryOut } from "./odeliaMemory/context";
import { usedFor } from "./odeliaMemory/retrieve";
import { addCall, cacheUse, emptyStats, type CacheStats } from "./odeliaMemory/cache";
import { shape } from "./odeliaMemory/processors";

/* ------------------------------------------------------------------ *
 * The agent's tool loop as the server runs it: the same tools and
 * instructions as in the browser, but resumable. After every round the
 * conversation and what the agent made so far are plain data, so a run
 * that reaches the server's time limit is saved and picked up again by a
 * fresh instance. The person can close the app; the work carries on.
 *
 * Store bots under a chief of staff: a run in the app can split a request
 * across stores (split_job). Each store's part runs here too, as its own
 * run (child), from that store's facts and applications; the run that
 * split them waits, then wakes with their results to write one summary.
 * And every run keeps its moments for the replay (src/replay.ts): each
 * step, each tool call with what it changed, each approval, verdict and
 * new shift, with when and which bot, scrubbed of anything secret.
 * ------------------------------------------------------------------ */

/** One model call. role says what the call is for (src/live.ts Role), so the server can pick the cheapest model that
 *  does that job well: the main loop's role (plan, short or watch), review for the checker, extract for reading files. */
export type Send = (body: Record<string, unknown>, deep: boolean, role?: Role, onText?: (text: string) => void) => Promise<{ content: Block[]; stop_reason: string }>;
/** Everything needed to pick a run up again. */
export type RunState = {
  messages: { role: string; content: unknown }[];
  /** When the run began, so its jobs are settled at the end even across invocations. */
  started?: string;
  rounds: number;
  text: string;
  lastToolAt: number;
  sources: Source[];
  made: { apps: string[]; approvals: string[]; memory: Bi[]; skills?: Bi[]; files: string[]; matches?: Reply["matches"]; table?: Reply["table"]; job?: string; split?: string[] };
  /** Store bots: this run split work across stores and is waiting for them (waiting), or has been woken with their
   *  results to write the summary (woke). */
  waiting?: boolean; woke?: boolean;
  /** Tool moments recorded for the replay so far (capped at MAX_MOMENTS). */
  moments?: number;
  /** The harness (src/harness.ts): what was asked, rounds in this seat, whether this seat is handing off, and how many
   *  times the checker has sent the work back. */
  request?: string; seatRounds?: number; handing?: boolean; checks?: number;
  /** The network (src/learning.ts): the lessons this run started from (fixed for the whole run, so a resumed chunk
   *  reads the same), and each job's first independent check, which is the number the network moves. */
  lessons?: string[]; network?: string; firstChecks?: { job: string; passed: number; of: number }[];
  /** The request came by plain SMS (Telnyx, or a Linq line falling back to SMS), whose sender is easy to forge: the run
   *  may only read and draft. Set by the server when the run starts; nothing the model says changes it. */
  plainSms?: boolean;
  /** What the whole task has cost so far in US dollars, across every chunk a fresh instance picked up. */
  spent?: number;
  /** The allowance events of its model calls (ai_events ids), so a run that fails on Placetta's or the vendor's side
   *  gives them back (ai_refund_events): a failed run isn't charged. */
  events?: number[];
  /** What this run's tools actually read (registry forms, agency pages, documents), for the reply's Sources line. */
  used?: Used[];
  /** The person's words were read for details to remember (src/recall.ts), so a resumed chunk doesn't read them again. */
  recalled?: boolean;
  /** Tools called so far and how many returned an error, for the team's Agent health page. */
  toolCalls?: number; toolErrors?: number;
  /** Undo (src/rewind.ts): what this run changed so far, and what left Placetta during it, carried across chunks. */
  undo?: UndoRec[]; outside?: Bi[];
  /** The agencies' forms (src/forms/versions.ts): each application's answers when the run began (their fingerprints),
   *  and the filled copies this run kept, which go back with the reply. */
  forms?: Record<string, string>; filled?: FilledNote[];
  /** The shield's state across chunks (src/security): what the run has done by kind, spent, which addresses came from
   *  outside and where, and whether it read something poisoned. A resumed chunk picks it up, so a limit or a taint
   *  isn't reset by a hand-over. */
  security?: { used: Record<string, number>; spent: number; untrusted: [string, { label: string; bad: boolean }][]; taint: "none" | "flagged" | "quarantined" };
  /** Agent memory (src/odeliaMemory/context.ts): what this run learned, for agent-run to save when it ends. */
  mem?: RunMemoryOut;
  /** The prompt cache: tokens each provider served from its cache, and the stable prefix's fingerprint. */
  cache?: CacheStats;
  /** The tool groups offered so far (src/toolIntent.ts), so a resumed chunk offers the same tools. */
  toolGroups?: string[];
  /** The trace (src/trace.ts): each model call and tool call, when, how long, tokens, cache and price. */
  trace?: Span[];
};

const MAX_ROUNDS = 16;
/** A run's token ceiling: about five times the longest run on the eval fixtures (scripts/eval/speed.ts measures them). */
export const TOKEN_CAP = 500_000;
/** Tokens a run has used so far (prompt, cache reads and writes, output), from its own counts. */
export const tokensUsed = (c: { input: number; read: number; write: number; output: number } | undefined) => (c ? c.input + c.read + c.write + c.output : 0);
export const overTokens = (lang?: string) => (lang === "zh" ? "这项任务已用到单次运行的上限，我先停在这里，已完成的部分都已保存。说“继续”，我会接着做下一部分。" : "This task reached its limit for one run, so I stopped here. What's done is saved. Say \"continue\" and I'll do the next part.");

/** Where the person asked: the app, a text message, a phone call, an email, or the business's Slack, Lark or WeChat
 *  Official Account. */
export type Channel = "app" | "sms" | "voice" | "email" | "slack" | "lark" | "wechat";
/** Anything but the app. Its words may not be the person's own (a forwarded letter, a chat message, a forged text), and
 *  nobody is there to see what the agent does, so it can read, research, draft and put things up for approval, and
 *  nothing it does is final until someone approves it in the app. */
export const isRemote = (channel: Channel | undefined) => !!channel && channel !== "app";

/** Never from a remote channel: removing deadlines, setting up or stopping routines, saving memory or skills
 *  (playbooks), and changing or removing stores. */
const REMOTE_NEVER: Record<string, string> = {
  schedule_routine: "Routines can't be set up",
  cancel_routine: "Routines can't be stopped or paused",
  memory_save: "Nothing is saved to memory",
  skill_save: "Skills and playbooks can't be saved",
  update_store: "Stores can't be changed",
  remove_store: "Stores can't be removed",
  split_job: "Work can't be split across the stores' bots",
};
/** Why a store's bot can't use a tool, or null when it can. It works its own store's part and never splits again. */
export function childRefuses(child: { job: string; store: string } | undefined, tool: string): string | null {
  if (!child || tool !== "split_job") return null;
  return `Error: You're the bot for one store (${child.store}). Only the main Odelia splits work across stores; do this store's part, job ${child.job}, yourself.`;
}
/** How a store's bot works under the owner's controls (src/autonomy.ts). Work is only split by a run that may change
 *  things (Plan first refuses split_job), so under Plan first a store's part was already approved with the job that
 *  split it: its bot works the usual way rather than asking for a second approval of each store's plan. Ask me first
 *  and every rule hold for it as for any run. */
export function childMode(m: RunMode, child: { job: string } | undefined): RunMode {
  return child && m.mode === "plan" ? { mode: "usual", why: "workspace" } : m;
}
/** What a store's bot came back with, as the main run reads it when it wakes. */
export type ChildResult = { job: string; store: string; status: string; reply: string };
/** The message that wakes the main run once every store's bot has finished: each store's part, and what to write. */
export function familyReport(w: Workspace, parents: string[], res: ChildResult[]): string {
  const lines = parents.flatMap(pid => {
    const p = (w.jobs ?? []).find(j => j.id === pid);
    return (p?.children ?? []).map(id => {
      const k = (w.jobs ?? []).find(j => j.id === id), r = res.find(x => x.job === id);
      const where = storeName(w, k?.store)?.en ?? k?.store ?? "a store";
      const state = !k ? "its job is gone" : proven(k) ? `done and checked by the reviewer (${k.checked ? `${k.checked.passed} of ${k.checked.of}` : "nothing to check"})`
        : k.status === "waiting" ? `waiting on the person: ${k.waiting?.en ?? "see its card"}` : k.status === "stopped" ? "stopped" : r?.status === "failed" ? "its bot hit a problem and stopped" : `${k.status}, ${k.steps.filter(s => s.done).length} of ${k.steps.length} steps`;
      return `- ${where} (job ${id}): ${state}.${r?.reply ? `\n  Its answer: ${r.reply.replace(/\s+/g, " ").slice(0, 700)}` : ""}`;
    });
  });
  return `Every store's bot has finished. Where each store's part stands, as the workspace shows it:\n${lines.join("\n")}\n\nNow write one combined summary for the person: lead with what's done across the stores, then each store that still needs something and exactly what, by name. Don't redo the stores' work. The split job ticks itself as each store is checked, and a separate reviewer checks it after your summary.`;
}
/** Plain SMS only reads and drafts: these tools, and no other. */
const PLAIN_SMS_MAY = new Set([
  "find_official_forms", "plan_markets", "network_lessons", "skill_read", "memory_search", "search_past_chats", "show_licenses", "city_records", "check_progress",
  "address_rules", "inspection_guide", "search_email", "read_email", "find_files", "get_income", "review_documents",
  "draft_message", "send_email", "draft_document",
]);
/** Tools plain SMS may use whose side effects don't stick there (guardPatch drops them): what the model must know so
 *  it doesn't say otherwise. */
const PLAIN_SMS_PARTIAL: Record<string, string> = {
  review_documents: "From a plain text message the renewal reminders above weren't saved, so don't say you added any; they can add them in the Placetta app.",
  draft_document: "From a plain text message the document is saved in Documents but not attached to an application or a job.",
};
/** The note a tool's result gets for this channel, if any. */
export function channelNote(o: { channel?: Channel; plainSms?: boolean }, tool: string): string | null {
  return isRemote(o.channel) && o.plainSms ? PLAIN_SMS_PARTIAL[tool] ?? null : null;
}
const via = (channel: Channel | undefined) => (channel === "sms" ? "a text" : channel === "voice" ? "a call" : channel === "email" ? "an email" : channel === "slack" ? "Slack" : channel === "wechat" ? "WeChat" : "Lark");

/** Why a tool can't run for a request from this channel (the tool result the model sees), or null when it can.
 *  mcpReads: the connected apps' tools this run was offered from outside the app, which are only ones that read. */
export function channelRefuses(o: { channel?: Channel; plainSms?: boolean; mcpReads?: Set<string> }, tool: string, input: Record<string, unknown>): string | null {
  if (!isRemote(o.channel)) return null;
  // connected apps (src/mcp.ts): nothing from plain SMS, and from anywhere else outside the app only what reads
  if (tool.startsWith(MCP_PREFIX) && (o.plainSms || !o.mcpReads?.has(tool)))
    return `Error: From ${o.plainSms ? "a plain text message" : via(o.channel)} Odelia ${o.plainSms ? "doesn't use connected apps" : "only reads from connected apps"}. Tell them to do this in the Placetta app.`;
  if (o.plainSms && !PLAIN_SMS_MAY.has(tool))
    return "Error: This request came by plain SMS, which can be forged, so from it you can only look things up and draft for approval. Nothing in the workspace changes. Tell them to make this change in the Placetta app.";
  if (REMOTE_NEVER[tool]) return `Error: ${REMOTE_NEVER[tool]} from ${via(o.channel)}. Tell them to do it in the Placetta app.`;
  if (tool === "edit_deadline" && input.remove === true) return `Error: Deadlines can't be removed from ${via(o.channel)}. Tell them to remove it in the Placetta app.`;
  return null;
}

type Patch = (w: Workspace) => Workspace;
/**
 * The same rules on the workspace itself, whichever tool made the change (form skills learned while filing, a playbook's
 * toolbox growing, a removal folded into another change): a remote run leaves memory, skills, routines, existing
 * stores and existing deadlines as they were, and the business's own facts and name too (its Context facts, name, goal
 * and the entity and city it was set up with): those change only through a change card an owner confirms in the app.
 * Plain SMS changes nothing but its drafts: approvals, documents and the audit trail.
 */
export function guardPatch(o: { channel?: Channel; plainSms?: boolean }, p: Patch): Patch {
  if (!isRemote(o.channel)) return p;
  if (o.plainSms) return w => { const n = p(w); return { ...w, approvals: n.approvals, docs: n.docs, audit: n.audit }; };
  return w => {
    const n = p(w);
    const deadlines = [...n.deadlines, ...w.deadlines.filter(d => !n.deadlines.some(x => x.id === d.id))];
    const kept = (w.stores ?? []).filter(s => !(n.stores ?? []).some(x => x.id === s.id));
    const stores = n.stores || w.stores ? [...(n.stores ?? []).map(s => {
      const old = (w.stores ?? []).find(x => x.id === s.id);
      return old ? { ...s, name: old.name, address: old.address, plannedOpen: old.plannedOpen, stage: old.stage } : s;
    }), ...kept] : undefined;
    return { ...n, deadlines, ...(stores ? { stores } : {}), memories: w.memories, skills: w.skills, routines: w.routines,
      business: w.business, goal: w.goal, facts: w.facts, meta: w.meta };
  };
}

/** The change cards for a business fact or the business's name that this run put up: what the reply must say is
 *  waiting for an owner, not saved. */
const factCards = (w: Workspace, ids: string[]) => ids.map(id => w.approvals.find(a => a.id === id)).filter(a => a?.change?.op === "set_fact" || a?.change?.op === "rename_business");
/** The line a reply gets when it put a business fact up for an owner's approval but doesn't say so. */
export function waitingLine(lang: Lang): string {
  return lang === "zh" ? "企业资料的更改正在等待所有者在快哉应用中确认，确认前不会保存。" : "The change to the business facts is waiting for an owner to confirm it in the Placetta app. Nothing is saved until then.";
}

/** How to write for where they asked, and what can't be done from there. */
export function channelHint(channel: Channel | undefined, plainSms = false): string {
  if (!isRemote(channel)) return "";
  const limits = plainSms
    ? `\n- This came by plain SMS, which can be forged. From it you can only look things up, answer, and draft (draft_message, send_email, draft_document) for approval in the app. Nothing else in the workspace changes; for anything more, tell them to use the Placetta app.`
    : `\n- From ${via(channel)} you can read, research, prepare applications, draft, and put things up for approval. You can't remove deadlines, set up or stop routines, save memory or skills, or change or remove stores: tell them to do those in the Placetta app.
- A business fact (remember) or the business's name (edit_workspace) doesn't change from here: the tool puts the change up for an owner to confirm in the app. Say plainly that it's waiting for their approval; never say it's saved.`;
  if (channel !== "sms" && channel !== "voice") return `

This request came by ${via(channel)}, not in the app, and your answer goes back there.${limits}
- Never file, pay or send anything yourself, and never ask them to approve by replying. Put it up for approval with your tools: Placetta links them to that approval in the app. Say so in one short sentence.${channel === "wechat" ? `
- WeChat shows plain text only, on a phone: no markdown, short paragraphs, the answer first. Placetta adds the link.` : ""}`;
  return `

This conversation is by phone, not in the app: ${channel === "sms" ? "they texted you" : "they asked on a call with you"}, and your reply goes to them as a text message.
- Write one to three short plain sentences, 300 characters at most. Lead with the answer. No markdown, no lists, no headings, no links (Placetta adds the links). Ask at most one question, at the end.
- Never file, pay, send an email or delete anything from a text, and never ask them to approve by replying. Prepare everything as usual and put it up for approval with your tools: Placetta texts them a link to that exact approval in the app. Say so in one short sentence.${limits}
- Speed matters on a phone. When the workspace summary above already answers the question (what's due, what's next, how a store or application stands), answer straight from it without calling tools. Use tools only to change something or to look up what the summary doesn't have.
- Never ask for Social Security, ITIN, bank or card numbers by text.`;
}

/** A fresh run: the recent conversation (folded so roles alternate) and the new request. */
export function startState(history: Turn[], prompt: string): RunState {
  const messages = [...history.slice(-12).filter(t => typeof t.content !== "string" || t.content.trim()), { role: "user" as const, content: prompt }].reduce<{ role: string; content: unknown }[]>((acc, t) => {
    const last = acc[acc.length - 1];
    if (last && last.role === t.role && typeof last.content === "string") last.content += "\n\n" + t.content; else acc.push({ role: t.role, content: t.content });
    return acc;
  }, []);
  if (messages[0]?.role === "assistant") messages.shift();
  return { messages, request: prompt, rounds: 0, text: "", lastToolAt: 0, sources: [], made: { apps: [], approvals: [], memory: [], skills: [], files: [] } };
}

/** Run rounds until the reply is ready, or until `until` (a timestamp) is near: then return the state to save and resume. */
export async function runRounds(o: {
  state: RunState; ws: () => Workspace; apply: (p: (w: Workspace) => Workspace) => void; step: (s: Step) => void; draft?: (text: string) => void;
  send: Send; lang: Lang; deep: boolean; account: boolean; svc?: Services; files?: Map<string, File>; signal: AbortSignal; until: number;
  /** Where the person asked (a text or a call changes how Odelia writes). */
  channel?: Channel;
  /** Who asked from outside the app: the number or address they wrote from (or, from Slack or Lark, the member's
   *  sign-in email). Shown on a change card so the owner sees where a change came from. */
  sender?: string;
  /** After each round's tools have run: the moment to save. */
  round?: (state: RunState) => Promise<void>;
  /** The model can search and read official sites (web_search, web_fetch). On unless the caller turns it off. */
  research?: boolean;
  /** Most model calls in one run (default 16). */
  maxRounds?: number;
  /** Most tokens one run may send and receive across all its chunks (default TOKEN_CAP): a runaway run stops cleanly,
   *  saying what's done, instead of burning credit (agent-run also caps dollars per task: limits.ts). */
  maxTokens?: number;
  /** The main loop's role: plan (default), short for a text, call or chat bot, watch for the monitor's background checks. */
  role?: Role;
  /** Whose memory the run reads: the person who asked (agent-run passes the run's created_by). Their saved details
   *  (src/recall.ts) go in the instructions, and their people are reached by name. */
  me?: string;
  /** Business rules (src/businessRules.ts): a message a rule asks to deliver, through the business's own channels. */
  notify?: (n: Notice) => void;
  /** The run's id: every job it works links to it, so the job's replay can show its moments (src/replay.ts). */
  runId?: string;
  /** A store's bot: this run works one store's part (its job and store) of a job split across stores. */
  child?: { job: string; store: string };
  /** The stores' bots this run started (split_job): how many are still working or waiting their turn, and what each
   *  came back with. With it, a run that split work waits for them and then writes one summary. */
  family?: { pending(): Promise<number>; results(): Promise<ChildResult[]> };
  /** Who the run acts for (src/security/policy.ts): the requesting person and their role in this workspace, looked up
   *  by agent-run on every chunk, or the system for background checks. Every tool call is checked against it; the
   *  service role the server saves with never stands in for them. Without one (tests, the sample) the run is an
   *  owner's, as before. */
  actor?: Actor;
  /** The workspace's id: a tool call naming another workspace or another workspace's file is refused. */
  workspaceId?: string;
  /** Each tool call, logged: actor, role, a hash of its input and the decision (agent-run writes them to
   *  agent_tool_calls). */
  log?: (e: ToolLog) => void;
  /** The optional model check for untrusted text the heuristics score in the grey zone (src/security/detect.ts). */
  classify?: (text: string) => Promise<boolean>;
  /** Agent memory: the workspace's memory and briefs, who asked, a "don't remember this chat" run, past conversations to
   *  search, and the processors' settings (src/odeliaMemory/). Without it the run still gets the pinned facts from the
   *  records, the cache-ordered prompt and the processors. */
  memory?: RunMemory;
  /** Tools by intent (src/toolIntent.ts): the core plus the groups the request is about. On unless set to false. */
  toolLoading?: boolean;
  /** Every tool the run may use, as definitions (the live evaluation checks calls against these). */
  onTools?: (defs: { name: string; description: string; input_schema: unknown }[]) => void;
}): Promise<{ reply: Reply } | { paused: RunState } | { waiting: RunState; reply?: Reply }> {
  const st = o.state;
  st.started ??= new Date().toISOString();
  // the trace: every model call this run makes (the main loop's, the checker's, document reads) as a span
  const since = () => Date.now() - Date.parse(st.started!);
  const send0 = o.send;
  o = { ...o, send: async (body, deep, role, onText) => {
    const t0 = Date.now(), at = since();
    try {
      const data = await send0(body, deep, role, onText);
      addSpan(st.trace ??= [], { ...modelSpan(role ?? "plan", at, Date.now() - t0, data as { usage?: unknown; model?: unknown; usd?: unknown }), r: st.rounds });
      return data;
    } catch (e) { addSpan(st.trace ??= [], { ...modelSpan(role ?? "plan", at, Date.now() - t0, {}, false), r: st.rounds }); throw e; }
  } };
  // each application's answers as the run found them: the ones it changes get their form filled again at the end
  st.forms ??= Object.fromEntries(o.ws().apps.map(a => [a.id, answersHash(a)]));
  if (st.rounds === 0) {
    // The filings' own record onto each application (confirmation numbers, receipts, the agencies' decisions), so the
    // proof loop reads what really happened, not what anyone said. A record, like the run's link: Undo doesn't take it back.
    // (when the filings can't be read, the record stays as it was: nothing is proven that wasn't)
    let rows: ReturnType<Services["filings"]> = [];
    try { rows = o.svc?.filings() ?? []; } catch { rows = []; }
    if (rows.length) o.apply(w => stampFilings(w, rows));
    // A job she stopped partway and is now asked to carry on is hers again: working, not waiting.
    const ref = /\(job ([^)\s]+)\)/.exec(st.request ?? "")?.[1];
    if (ref) o.apply(w => ({ ...w, jobs: (w.jobs ?? []).map(j => (j.id === ref && j.status === "waiting" && (j.on === "odelia" || (!j.on && j.waiting?.en === STOPPED_HERE.en))
      ? { ...j, status: "running" as const, on: undefined, waiting: undefined, updated: new Date().toISOString() } : j)) }));
  }
  const made: Made = { apps: new Set(st.made.apps), approvals: [...st.made.approvals], memory: [...st.made.memory], skills: [...(st.made.skills ?? [])], files: [...st.made.files], matches: st.made.matches, table: st.made.table, lastToolAt: st.lastToolAt,
    job: st.made.job ?? o.child?.job, split: st.made.split };
  /* Owner controls (src/autonomy.ts): this run's mode (Ask me first, Usual, Plan first) and Undo's record of what it
     changes (src/rewind.ts), both carried across chunks like the rest of the run. */
  const rec = recorder(st.undo ?? []);
  const outside: Bi[] = [...(st.outside ?? [])];
  /* The shield (src/security): who's asking, the policy on every tool call, and what came in from outside. Carried across
     chunks in the run's state. */
  const actor: Actor = o.actor ?? { id: o.me ?? o.svc?.me ?? null, role: "owner" };
  const shield = new Shield(newRunPolicy(actor, { ws: o.workspaceId }), { log: o.log, check: o.classify, runId: o.runId });
  if (st.security) {
    Object.assign(shield.policy.used, st.security.used); shield.policy.spent = st.security.spent; shield.policy.taint = st.security.taint;
    for (const [e, v] of st.security.untrusted) { shield.policy.untrusted.add(e); shield.seen.set(e, v); }
  }
  // the person's own words (the request and their earlier turns) are where trusted addresses come from; hidden characters
  // in them (zero-width, direction marks, tag characters) are taken out before any model reads them
  for (const m of st.messages) if (m.role === "user" && typeof m.content === "string") { const n = neutralize(m.content, { html: false }); if (n.changed) m.content = n.text; shield.trust(emailsIn(n.text)); }
  if (st.request) { const n = neutralize(st.request, { html: false }); st.request = n.text; }
  const save = (): RunState => ({ ...st, lastToolAt: made.lastToolAt, made: { apps: [...made.apps], approvals: made.approvals, memory: made.memory, skills: made.skills, files: made.files, matches: made.matches, table: made.table,
    ...(made.job ? { job: made.job } : {}), ...(made.split?.length ? { split: made.split } : {}) }, undo: rec.recs(), outside,
    security: { used: { ...shield.policy.used } as Record<string, number>, spent: shield.policy.spent, untrusted: [...shield.seen.entries()].filter(([e]) => shield.policy.untrusted.has(e)), taint: shield.policy.taint } });
  const mainRole: Role = o.role ?? "plan";
  const model = messagesModel("server", (body, _signal, deep, role) => o.send(body, deep, role ?? mainRole));
  // A remote request (or plain SMS) can't make changes it's not allowed to, whichever tool would make them.
  const from: { channel?: Channel; plainSms: boolean; mcpReads?: Set<string> } = { channel: o.channel, plainSms: st.plainSms === true };
  // and nothing a run does changes the owner's controls, unless an owner started it to carry out their own approval
  let ownerRun = false;
  const apply = (p: Patch) => o.apply(rec.wrap(guardPatch(from, w => keepOwnerControls(w, p(w), { owner: ownerRun }))));
  shield.apply = apply;
  // Every moment carries when, which bot and which job, for the job's replay.
  const bot = o.child?.store ?? MAIN_BOT;
  const step = (s: Step) => o.step(scrubStep({ at: new Date().toISOString(), bot, ...(made.job ? { job: made.job } : {}), ...s }));
  /** Links this run to the jobs it worked (only when one isn't linked yet, so a round with nothing new saves nothing).
   *  A record of what happened, like the audit trail: not part of her work, so Undo never takes it back. */
  const link = () => { if (!o.runId) return; const w = o.ws(); if (linkRun(w, o.runId, st.started!, o.child?.job) !== w) o.apply(x => linkRun(x, o.runId!, st.started!, o.child?.job)); };

  // A store's bot starts by taking its store's part: off the queue and onto its own run. A part that's gone or was
  // stopped meanwhile isn't worked.
  const mine = o.child ? (o.ws().jobs ?? []).find(j => j.id === o.child!.job) : undefined;
  if (o.child && (!mine || mine.status === "stopped" || mine.status === "done")) {
    return { reply: { text: [B(mine?.status === "done" ? "This store's part is already done." : "This store's part was stopped before its bot started, so nothing was done.", mine?.status === "done" ? "这家门店的部分已经完成。" : "这家门店的部分在助手开始前已被停止，没有做任何事。")] } };
  }
  if (o.child && st.rounds === 0) apply(w => ({ ...w, jobs: (w.jobs ?? []).map(j => (j.id === o.child!.job ? { ...j, status: "running" as const, waiting: undefined, updated: new Date().toISOString() } : j)) }));

  // Woken with every store's bot finished: their results go to the model, and it writes the one summary. Still some
  // working (a wake-up too early): keep waiting, without a model call.
  if (st.waiting && o.family) {
    if ((await o.family.pending()) > 0) return { waiting: save() };
    const res = await o.family.results();
    st.waiting = false; st.woke = true;
    apply(w => reconcile(w));
    st.messages.push({ role: "user", content: familyReport(o.ws(), made.split ?? [], res) });
    made.lastToolAt = st.text.length;
    step({ state: "connecting", label: B("Every store's bot is back. Writing one summary", "各门店的助手都已完成，正在汇总") });
  }

  const me = o.me ?? o.svc?.me;
  // Connected apps' tools (src/mcp.ts): none from plain SMS; from anywhere else outside the app, only the ones that read.
  const mcp = from.plainSms ? [] : ((await o.svc?.mcpTools?.().catch(() => [])) ?? []).filter(t => !isRemote(o.channel) || t.read_only);
  // a store's bot has its own key (several start in the same moment), so its held changes and its undo are its own
  const runKey = "r" + Date.parse(st.started).toString(36) + (o.child ? "-" + o.child.job : "");
  const ctl: ControlCtx = { get: o.ws, apply, mode: childMode(runMode(o.ws(), st.request ?? ""), o.child), remote: isRemote(o.channel), run: runKey, made, mark: () => { made.lastToolAt = st.text.length; }, notify: o.notify, outside: x => outside.push(x) };
  // The agencies' own forms (src/forms/versions.ts): the PDFs come through the server's own way (the site's /app/forms/)
  // and the copies filled to check a form before approval are kept, so the run doesn't fill the same answers twice.
  const forms = { load: loaderWith(o.svc?.formPdf), cache: new Map<string, FilledCopy>() };
  const memOut: RunMemoryOut = st.mem ??= emptyOut();
  // the memory tools (when memory is on and this chat is remembered) go through the same policy gate as every other tool
  const tools = secureTools([...withControls(makeTools(o.ws, apply, step, made, o.lang, () => st.text.length, o.account, { model, files: o.files ?? new Map(), svc: o.svc, signal: o.signal, me, mcp, request: st.request, forms, shield,
    ...(isRemote(o.channel) ? { asked: { via: o.channel!, ...(o.sender ? { sender: o.sender.slice(0, 120) } : {}) } } : {}), ...(o.child ? { child: o.child } : {}) }), ctl),
    ...(o.memory ? memoryTools(o.memory, memOut, { w: o.ws, runId: o.runId, now: () => new Date().toISOString(), store: o.child?.store, remote: isRemote(o.channel) }) : [])], shield, { get: o.ws, apply, appReadOnly: mcpReads });
  if (isRemote(o.channel)) from.mcpReads = new Set(tools.map(t => t.name).filter(n => n.startsWith(MCP_PREFIX)));
  /* Tools by intent (src/toolIntent.ts): the core, plus the groups this request is about (its words and the last few
     things the person said, files sent with it, a store's bot, connected apps it names). load_tools goes through the
     policy gate like every other call. A call to a tool that wasn't offered still runs, through the gate, and its group
     is offered from then on. */
  const groupsAll = [...new Set(tools.map(t => groupOf(t.name)).filter((g): g is string => !!g))];
  if (o.toolLoading === false) st.toolGroups = groupsAll;
  st.toolGroups ??= groupsFor([st.request ?? "", ...st.messages.filter(m => m.role === "user" && typeof m.content === "string").slice(-3).map(m => String(m.content))].join("\n"),
    { files: o.files?.size ?? 0, child: !!o.child, apps: groupsAll.filter(g => g.startsWith("app:")).map(g => ({ id: g.slice(4), text: tools.filter(t => groupOf(t.name) === g).map(t => `${t.name} ${t.description}`).join(" ") })) });
  const loader = toolLoader(tools, st.toolGroups, t => secureTools([t], shield, { get: o.ws, apply })[0]);
  const defsOf = (list: Tool[]) => list.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  o.onTools?.(defsOf(loader.all));
  /* The agency's forms, once the work is done: every application whose answers this run changed (by any tool) is filled
     again, one new version each, kept in Documents and handed back with the reply; a card for answers that changed is
     taken back and a fresh one put up. Plain SMS changes nothing, so it fills nothing. */
  const fillForms = async () => {
    if (from.plainSms) return;
    const ids = o.ws().apps.filter(a => answersHash(a) !== st.forms?.[a.id] || made.apps.has(a.id)).map(a => a.id);
    if (!ids.length) return;
    const r = await refreshForms({ get: o.ws, apply, load: forms.load, cache: forms.cache, ids, keep: o.svc ? (file, a) => o.svc!.saveFile(file, a.id) : undefined });
    if (!r.notes.length) return;
    st.filled = [...(st.filled ?? []).filter(x => !r.notes.some(y => y.app === x.app)), ...r.notes];
    // a card this run put up and then took back isn't shown; the fresh one is
    made.approvals = [...made.approvals.filter(id => !r.withdrawn.includes(id)), ...r.cards.filter(id => !made.approvals.includes(id))];
    step({ state: "shaping", label: B(`Filled the agency's form: ${r.notes.map(n => `${n.form}, version ${n.version}`).join("; ")}`, `已填写机构表格：${r.notes.map(n => `${n.form}，第 ${n.version} 版`).join("；")}`) });
  };
  /** The run's undo point, once its work is done (src/rewind.ts). */
  const keepUndo = () => { if (!rec.size()) return undefined; const id = "undo-" + runKey; o.apply(addUndo({ id, at: st.started!, title: undoTitle(st.request ?? ""), recs: rec.recs(), ...(outside.length ? { outside } : {}) })); return id; };
  /* An owner's approval, carried out here (src/held.ts): agent-run lets only an owner start these, and only from the app.
     A store's bot never: its words are Odelia's instructions for one store. */
  // only an owner's run carries out an approval: a member can't escalate by typing "/apply" (agent-run checks too)
  const cmd = isRemote(o.channel) || o.child || actor.role !== "owner" ? null : ownerCommand(st.request ?? "");
  if (cmd) ownerRun = true;
  if (cmd && "apply" in cmd) {
    step({ state: "working", label: { en: "Making the changes you approved", zh: "正在完成您批准的更改" } });
    ctl.mode = { mode: "usual", why: "approved" };   // an owner approved exactly these; Never rules still hold
    const r = await applyHeld(o.ws, apply, tools, cmd.apply, o.lang);
    jobsDone({ get: o.ws, apply, notify: o.notify }, st.started);
    const undo = keepUndo();
    link();
    return { reply: { text: [r ? r.text : { en: "Those changes were already made, or the card is gone.", zh: "这些更改已经完成，或卡片已不存在。" }], approvals: [], ...(undo ? { undo } : {}) } };
  }
  if (cmd && "go" in cmd && st.rounds === 0) {
    const work = goPlan(o.ws, apply, cmd.go, o.lang, me);
    // the model reads the job's own request, not the command; the run works it the usual way from here
    if (work) { const lastUser = [...st.messages].reverse().find(m => m.role === "user"); if (lastUser) lastUser.content = work; }
    ctl.mode = runMode(o.ws(), st.request ?? "");
  }
  const mode = ctl.mode;
  const childJob = o.child ? (o.ws().jobs ?? []).find(j => j.id === o.child!.job) : undefined;
  /* The system prompt in cache order (src/odeliaMemory/cache.ts): the rules, then the workspace profile (briefs, the
     pinned facts from the records, approved memories), then what changes every run. "Remember this" and "forget that"
     are told to the model here and carried out by agent-run when the run ends. */
  const memNote = memOut.note ??= o.child ? "" : commandNote(o.memory, st.request ?? "", memOut, { runId: o.runId, remote: isRemote(o.channel), now: new Date().toISOString() });
  // no credential ever goes into a prompt, whatever the workspace or its memory holds (src/security/secrets.ts): every
  // segment is scrubbed before it's laid out, so the cache breakpoints still fall where they should
  const shaped = systemFor(o.ws(), rules(o.ws(), o.lang, o.account, o.research !== false, o.svc?.connected() ?? [], true, { me, names: tools.map(t => t.name) }), o.memory,
    [st.network ?? "", channelHint(o.channel, from.plainSms), controlsBrief(o.ws(), mode), childJob ? storeRules(o.ws(), childJob, o.lang) : "", memNote], { store: o.child?.store, request: st.request, now: new Date().toISOString(), clean: scrubCredentials });
  const system = shaped.system;
  /** The conversation as each call sends it: through the processors (src/odeliaMemory/processors.ts). The run keeps the
   *  whole conversation; the important lines of turns folded away are kept for the brief's proposals. */
  const context = () => {
    if (o.memory?.processors === false) return st.messages;
    const s = shape(st.messages, o.memory?.processors || {});
    for (const f of s.flushed) if (!memOut.flushed.includes(f.line)) memOut.flushed = [...memOut.flushed, f.line].slice(-40);
    return s.messages;
  };
  const counted = (data: { usage?: unknown; model?: unknown }) => { st.cache = addCall(st.cache ?? emptyStats(), cacheUse(data.usage as Record<string, unknown> | undefined), shaped.prefix); };
  const sources = new Map(st.sources.map(s => [s.url, s]));
  const max = o.maxRounds ?? MAX_ROUNDS;
  let finished = false, capped = false;
  // The jobs that are this run's own: a store's bot has its store's part; any other run, every job but the stores'
  // parts (their own bots work, check and hand those off, side by side with this one).
  const own = (j: Job) => (o.child ? j.id === o.child.job : !j.parent);
  // The job this run is working: the newest one it touched that's still open.
  const activeJob = (): Job | undefined => (o.ws().jobs ?? []).filter(j => own(j) && j.updated >= st.started! && j.status === "running" && !j.children?.length).sort((a, b) => b.updated.localeCompare(a.updated))[0];
  const checkedNow: string[] = [];
  const unchecked: string[] = [];      // jobs the checker couldn't look at: they stay open, never done on the agent's word
  const recheck = new Set<string>();   // sent back by the checker: checked again after the fixes
  let last: Block[] = [];

  work: for (;;) {
    // A run working a job may hand it through fresh seats; any other run has one seat's rounds.
    const onJob = () => (o.ws().jobs ?? []).some(j => own(j) && j.updated >= st.started!);
    while (st.rounds < (onJob() ? max * MAX_SEATS : max)) {
      // leave room for one more model call and the save
      if (Date.now() > o.until) { link(); return { paused: save() }; }
      // the token cap: stop before the next model call, cleanly, never mid-tool
      if (tokensUsed(st.cache) >= (o.maxTokens ?? TOKEN_CAP)) { capped = true; break; }
      if (st.rounds === 0) step({ state: "searching", label: { en: "Reading your workspace", zh: "读取您的工作区" } });
      st.rounds++; st.seatRounds = (st.seatRounds ?? 0) + 1;
      // streamed into the draft: the app shows the words as the model writes them, not when the round ends
      const before = st.text;
      const data = await o.send({ messages: context(), max_tokens: 3500, system, tools: defsOf(loader.offered()), cache_breaks: shaped.breaks, cache_key: shaped.prefix }, o.deep, mainRole,
        o.draft ? t => { if (t) o.draft!(clean((before ? before + "\n\n" + t : t).slice(made.lastToolAt))); } : undefined);
      counted(data as { usage?: unknown });
      last = data.content;
      // pages the model fetched or searched on the vendor's side: scored like anything else from outside, so a poisoned
      // page taints the run (and is in the audit trail) even though it reached the model directly
      scanServerResults(data.content, shield);
      for (const c of data.content) for (const ci of c.citations ?? []) if (ci.url && !sources.has(ci.url)) sources.set(ci.url, { url: ci.url, title: ci.title || ci.url });
      st.sources = [...sources.values()];
      addUsed(st.used ??= [], usedInBlocks(data.content));
      const text = data.content.filter(c => c.type === "text").map(c => c.text).join("");
      if (text) { st.text += (st.text ? "\n\n" : "") + text; o.draft?.(sanitizeOutput(clean(st.text.slice(made.lastToolAt))).text); }
      if (data.stop_reason === "pause_turn") { st.messages.push({ role: "assistant", content: data.content }); continue; }
      const uses = data.content.filter(c => c.type === "tool_use");
      if (!uses.length || data.stop_reason !== "tool_use") { finished = true; break; }
      st.messages.push({ role: "assistant", content: data.content });
      // in the order the model asked; several lookups in a row run side by side (READ_ONLY in src/live.ts)
      const results: Record<string, unknown>[] = await runAll(uses, async u => {
        const name = String(u.name ?? ""), input = (u.input ?? {}) as Record<string, unknown>;
        const before = o.ws();
        const refused = channelRefuses(from, name, input) ?? childRefuses(o.child, name);
        st.toolCalls = (st.toolCalls ?? 0) + 1;   // for the team's Agent health page
        let out: Record<string, unknown>, content: string, error: boolean;
        const t0 = Date.now(), at = since();
        if (refused) {
          out = { type: "tool_result", tool_use_id: String(u.id ?? ""), content: refused, is_error: true };
          content = refused; error = true;
        } else {
          const r = await runTool(loader.all, u);
          loader.used(name); st.toolGroups = loader.loaded();
          if (!r.is_error) addUsed(st.used ??= [], usedBy(name, input, r.content, o.ws()));
          const note = r.is_error ? null : channelNote(from, name);
          out = (note ? { ...r, content: `${r.content}\n\nNote: ${note}` } : r) as unknown as Record<string, unknown>;
          content = r.content; error = !!r.is_error;
        }
        if (error) st.toolErrors = (st.toolErrors ?? 0) + 1;
        addSpan(st.trace ??= [], { k: "tool", n: name.slice(0, 80), at, ms: Date.now() - t0, ...(error ? { ok: false } : {}), r: st.rounds });
        // the replay: what she used, what she gave it, what came back and what it changed, and any approval it put up
        if ((st.moments ?? 0) < MAX_MOMENTS) {
          st.moments = (st.moments ?? 0) + 1;
          const m = toolMoment({ name, input, content, error, before, after: o.ws() });
          step(m);
          for (const a of approvalMoments(m.diff)) step(a);
        }
        return out;
      });
      // The harness: a seat that has handed off gives the job to a fresh agent with a clean context (no compaction);
      // one that's nearly out of room is told to write its handoff first.
      const job = activeJob();
      if (job && st.handing) {
        const seat = (job.seat ?? 1) + 1;
        apply(w => ({ ...w, jobs: (w.jobs ?? []).map(j => (j.id === job.id ? { ...j, seat } : j)) }));
        st.messages = [{ role: "user", content: harnessBrief(o.ws(), { ...job, seat }, st.request ?? "", o.lang) }];
        st.seatRounds = 0; st.handing = false;
        step({ state: "shaping", kind: "shift", job: job.id, label: { en: `A fresh shift picked up the job (shift ${seat})`, zh: `新一班接手了这项工作（第 ${seat} 班）` } });
        link();
        await o.round?.(save());
        continue;
      }
      const full = (st.seatRounds ?? 0) >= max - 1 || JSON.stringify(st.messages).length + JSON.stringify(results).length > CONTEXT_CHARS;
      if (job && full && (job.seat ?? 1) < MAX_SEATS && st.rounds < max * MAX_SEATS - 1) {
        results.push({ type: "text", text: `You're out of room in this conversation. Call hand_off now for job ${job.id}: what's done, what's next and how, open questions, files to reuse. A fresh agent takes the job over from its harness and your note; do nothing else this turn.` });
        st.handing = true;
      }
      st.messages.push({ role: "user", content: results });
      link();
      await o.round?.(save());
    }
    // out of rounds with tool results the model never saw: say the work isn't finished, never "Done."
    if (!finished) { const more = capped ? overTokens(o.lang) : outOfSteps(o.lang); st.text += (st.text ? "\n\n" : "") + more; made.lastToolAt = Math.min(made.lastToolAt, st.text.length - more.length); break; }

    // Split across stores and the stores' bots are still at it: this run waits for them. Its answer so far (who's on
    // what) goes to the person now; when the last store's bot finishes, the run wakes with their results and writes
    // the one summary (above). The split job isn't checked before then.
    if (o.family && made.split?.length && !st.woke) {
      const pending = await o.family.pending();
      if (pending > 0) {
        const said = sanitizeOutput(clean(st.text.slice(made.lastToolAt).trim() || st.text.trim())).text;
        st.waiting = true;
        st.messages.push({ role: "assistant", content: last });
        made.lastToolAt = st.text.length;
        step({ state: "breathing", label: B(`Waiting for ${pending} store bot${pending === 1 ? "" : "s"} to finish`, `等待 ${pending} 家门店的助手完成`) });
        link();
        const interim = honest(said, o.lang) || (o.lang === "zh" ? "每家门店的助手都在处理各自的部分，完成后我会汇总。" : "Each store's bot is on its part. I'll write one summary when they finish.");
        return { waiting: save(), reply: { text: [same(interim)], ...(made.approvals.length ? { approvals: made.approvals } : {}) } };
      }
      // the stores' bots were quicker: their results now, and the summary in this same run
      const res = await o.family.results();
      st.woke = true;
      st.messages.push({ role: "assistant", content: last });
      apply(w => reconcile(w));
      st.messages.push({ role: "user", content: familyReport(o.ws(), made.split, res) });
      made.lastToolAt = st.text.length;
      finished = false;
      step({ state: "connecting", label: B("Every store's bot is back. Writing one summary", "各门店的助手都已完成，正在汇总") });
      continue work;
    }

    // The proof: before a job counts as done, a separate checker, which never saw the work, verifies its done list
    // against the workspace and the reply. What fails goes back to the agent (up to MAX_CHECKS times); after that the
    // job waits, saying plainly what isn't done. The forms are filled first, so the reviewer sees each one's read-back.
    await fillForms();
    const reply = clean(st.text.slice(made.lastToolAt).trim() || st.text.trim());
    // (a split job whose stores are all proven waits on its summary: it's due once this run has it in hand)
    const due = (o.ws().jobs ?? []).filter(j => own(j) && j.updated >= st.started! && j.done?.length && (j.status === "done" || ((j.status === "running" || (j.status === "waiting" && !!j.children?.length)) && j.steps.every(x => x.done))) && (!j.checked || j.checked.at < j.updated || recheck.has(j.id) || (!!j.children?.length && !(j.done ?? []).every(d => d.ok === true))));
    if (!due.length) break;
    step({ state: "weaving", label: { en: "A separate reviewer is checking the work", zh: "独立检查正在核对工作" } });
    const final = (st.checks ?? 0) >= MAX_CHECKS || st.rounds >= max * MAX_SEATS - 1;
    const sendBack: string[] = [];
    for (const j of due) {
      let verdict: { ok: boolean; why: string }[];
      try {
        // the review role: by default a different vendor from the one that did the work, so no model grades itself
        const data = await o.send({ system: CHECKER_SYSTEM, messages: [{ role: "user", content: [{ type: "text", text: checkerPrompt(j, evidence(o.ws(), j, reply)) }] }], max_tokens: 1500 }, false, "review");
        verdict = parseVerdict(data.content.filter(c => c.type === "text").map(c => c.text).join(""), j.done!.length);
        // a job whose filled form doesn't match its answers isn't done, whatever the reviewer read into the evidence
        const bad = formFailures(o.ws(), j, [...made.apps]);
        if (bad.length) verdict = verdict.map(v => (v.ok ? { ok: false, why: `The filled ${bad[0]}` } : v));
      } catch {
        // The checker couldn't run (its model was down). The job used to keep the agent's word and count as done with
        // nothing checked; now it waits, saying so, until a check can run.
        apply(w => ({ ...w, jobs: (w.jobs ?? []).map(x => (x.id === j.id && (x.status === "done" || x.status === "running") ? { ...x, status: "waiting" as const, waiting: B("A separate reviewer couldn't check this yet. Ask Odelia to check it again.", "独立检查暂时无法核对这项工作。请让 Odelia 再检查一次。"), updated: new Date().toISOString() } : x)) }));
        if (!unchecked.includes(j.id)) unchecked.push(j.id);
        step({ state: "weaving", kind: "check", job: j.id, ok: false, label: B("A separate reviewer couldn't check it yet, so it stays open", "独立检查暂时无法核对，工作仍未完成") });
        continue;
      }
      apply(applyVerdict(j.id, verdict, { final, lang: o.lang }));
      step(checkMoment(j, verdict));
      if (!(st.firstChecks ??= []).some(c => c.job === j.id)) st.firstChecks.push({ job: j.id, passed: verdict.filter(v => v.ok).length, of: verdict.length });
      if (!checkedNow.includes(j.id)) checkedNow.push(j.id);
      recheck.delete(j.id);
      // A filing's proof line waits on the agency (or the person's approval), not on more work: it isn't sent back, and
      // the job waits on whoever has the filing (src/jobs.ts reconcile)
      const missing = j.done!.map((d, k) => ({ d, v: verdict[k] })).filter(x => !x.d.check?.proof && !x.v.ok).map(x => `- ${x.d.text.en}: ${x.v.why}`);
      if (missing.length && !final) recheck.add(j.id);
      if (missing.length && !final) sendBack.push(`Job ${j.id} (${j.title.en}) isn't done yet. The checker found:\n${missing.join("\n")}`);
    }
    if (!sendBack.length) break;
    st.checks = (st.checks ?? 0) + 1;
    st.messages.push({ role: "assistant", content: last });
    st.messages.push({ role: "user", content: `${sendBack.join("\n\n")}\n\nFix what you can now with your tools, update the plan (set_plan), and say plainly what still needs the person. Your earlier answer won't be sent; write the answer again.` });
    made.lastToolAt = st.text.length;   // the answer they get is the one after the fixes
    finished = false;
    step({ state: "shaping", label: { en: "The reviewer sent work back; finishing it", zh: "检查发现未完成项，继续完成" } });
    continue work;
  }

  await fillForms();   // a run that ran out of steps still hands back the forms it changed
  apply(settleJobs(st.started, { child: o.child?.job }));
  // every job against its proof (a filing waits on the agency, not on the person; a split job ticks from its stores as
  // they're checked), the renewals of what the agencies approved, and the report on each job that just finished
  apply(w => finishWork(w));
  link();
  /* Business rules: each job this run finished fires "a job is done" once. Then the run's undo point, so the person
     can put back what it changed (src/rewind.ts). */
  jobsDone({ get: o.ws, apply, notify: o.notify }, st.started);
  const undoId = keepUndo();
  // a reply that says "done" while a job it worked is still open gets that job's open steps, so it can't claim more
  // no image, link or address in the reply that could carry data out (src/security/output.ts)
  const said = sanitizeOutput(clean(st.text.slice(made.lastToolAt).trim() || st.text.trim())).text;
  const open = saysDone(said) || !said ?(o.ws().jobs ?? []).filter(j => own(j) && j.updated >= st.started! && j.status !== "done" && j.status !== "stopped" && j.steps.some(s => !s.done) && !checkedNow.includes(j.id)).slice(0, 2) : [];
  const proof = [...open.map(j => openLine(j, o.lang)),...checkedNow.map(id => (o.ws().jobs ?? []).find(j => j.id === id)).filter((j): j is Job => !!j).map(j => proofLine(j, o.lang)),
    ...unchecked.filter(id => !checkedNow.includes(id)).slice(0, 1).map(() => (o.lang === "zh" ? "独立检查暂时无法核对，所以这项工作仍未完成。" : "A separate reviewer couldn't check the work yet, so the job stays open."))].filter(Boolean).join(" ");
  // a business fact put up for an owner's approval: the reply says it's waiting, even when the model didn't
  const waits = factCards(o.ws(), made.approvals).length > 0 && !/approv|confirm|批准|确认/i.test(said) ? waitingLine(o.lang) : "";
  // a form that didn't come out right is said in the reply, whatever the model wrote: it isn't ready to file
  const formLine = (st.filled ?? []).filter(n => !n.ok && n.problem).map(n => (o.lang === "zh" ? `${n.form}还不能提交。${n.problem!.zh}` : `The ${n.form} isn't ready to file. ${n.problem!.en}`)).join(" ");
  // a job that finished in this run says what was filed, the proof and the next renewal, from the record (src/finish.ts)
  const reported = (o.ws().jobs ?? []).filter(j => own(j) && j.status === "done" && !!j.report && j.report.at >= st.started!)
    .flatMap(j => reportLines(o.ws(), j, o.lang, new Date().toISOString().slice(0, 10))).slice(0, 4).join(" ");
  const final = [honest(said, o.lang) || (o.lang === "zh" ? "完成了。" : "Done."), waits, formLine, proof, reported].filter(Boolean).join("\n\n");
  const cited = [...st.sources.filter(x => official(x.url)), ...st.sources.filter(x => !official(x.url))].slice(0, 4);

  /* ---- Sources: from what this run's tools read, never from the model's words (src/sources.ts) ---- */
  const used = addUsed([...(st.used ?? [])], citedPages(st.sources));
  const line = sourcesLine(said, used, o.lang, o.channel === "sms" || o.channel === "voice");
  const links = line ? sourceLinks(said, used) : [];
  /* ---- end Sources ---- */

  step(replyMoment(line ? `${final}\n\n${line}` : final));
  // the agent memories that fit this request, each with why, shown under the answer (ChatGPT's memory Sources); none for
  // a store's bot, a temporary chat or with memory off
  const recalled = !o.child && o.memory && using(o.memory) && st.request
    ? usedFor(o.memory.memory, st.request, { me: o.memory.me, now: new Date().toISOString(), names: { ...scopeNames(o.ws()), ...(o.memory.names ?? {}) } }) : [];
  return { reply: { text: [same(line ? `${final}\n\n${line}` : final)], apps: [...made.apps].slice(0, 3), approvals: made.approvals, memory: made.memory, skills: made.skills.length ? made.skills : undefined, matches: made.matches,
    ...(recalled.length ? { recalled } : {}),
    files: made.files.length ? made.files.slice(0, 6) : undefined, table: made.table, sources: line ? (links.length ? links : undefined) : cited.length ? cited : undefined, ...(undoId ? { undo: undoId } : {}),
    // the filled forms go back with the answer: a card in the app, an attachment by email, a short link by text or chat
    ...(st.filled?.length ? { forms: st.filled } : {}) } };
}
