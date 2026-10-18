import { same, type Bi } from "./bi";
import type { Reply, Step } from "./core";
import type { Lang } from "./i18n";
import type { Workspace } from "./model";
import { clean, honest, makeTools, messagesModel, official, outOfSteps, rules, runTool, type Block, type Made, type Role, type Services, type Source, type Turn } from "./live";
import { B } from "./bi";
import { settleJobs, type Job } from "./jobs";
import { applyVerdict, CHECKER_SYSTEM, checkerPrompt, CONTEXT_CHARS, evidence, harnessBrief, MAX_CHECKS, MAX_SEATS, openLine, parseVerdict, proofLine, saysDone } from "./harness";
import { controlsBrief, jobsDone, runMode, withControls, type ControlCtx } from "./autonomy";
import { applyHeld, goPlan, ownerCommand } from "./held";
import { addUndo, recorder, undoTitle, type UndoRec } from "./rewind";
import type { Notice } from "./businessRules";

/* ------------------------------------------------------------------ *
 * The agent's tool loop as the server runs it: the same tools and
 * instructions as in the browser, but resumable. After every round the
 * conversation and what the agent made so far are plain data, so a run
 * that reaches the server's time limit is saved and picked up again by a
 * fresh instance. The person can close the app; the work carries on.
 * ------------------------------------------------------------------ */

/** One model call. role says what the call is for (src/live.ts Role), so the server can pick the cheapest model that
 *  does that job well: the main loop's role (plan, short or watch), review for the checker, extract for reading files. */
export type Send = (body: Record<string, unknown>, deep: boolean, role?: Role) => Promise<{ content: Block[]; stop_reason: string }>;
/** Everything needed to pick a run up again. */
export type RunState = {
  messages: { role: string; content: unknown }[];
  /** When the run began, so its jobs are settled at the end even across invocations. */
  started?: string;
  rounds: number;
  text: string;
  lastToolAt: number;
  sources: Source[];
  made: { apps: string[]; approvals: string[]; memory: Bi[]; skills?: Bi[]; files: string[]; matches?: Reply["matches"]; table?: Reply["table"] };
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
  /** Undo (src/rewind.ts): what this run changed so far, and what left Placetta during it, carried across chunks. */
  undo?: UndoRec[]; outside?: Bi[];
};

const MAX_ROUNDS = 16;

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
};
/** Plain SMS only reads and drafts: these tools, and no other. */
const PLAIN_SMS_MAY = new Set([
  "find_official_forms", "network_lessons", "skill_read", "memory_search", "search_past_chats", "show_licenses", "city_records", "check_progress",
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

/** Why a tool can't run for a request from this channel (the tool result the model sees), or null when it can. */
export function channelRefuses(o: { channel?: Channel; plainSms?: boolean }, tool: string, input: Record<string, unknown>): string | null {
  if (!isRemote(o.channel)) return null;
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
  /** The main loop's role: plan (default), short for a text, call or chat bot, watch for the monitor's background checks. */
  role?: Role;
  /** Business rules (src/businessRules.ts): a message a rule asks to deliver, through the business's own channels. */
  notify?: (n: Notice) => void;
}): Promise<{ reply: Reply } | { paused: RunState }> {
  const st = o.state;
  st.started ??= new Date().toISOString();
  const made: Made = { apps: new Set(st.made.apps), approvals: [...st.made.approvals], memory: [...st.made.memory], skills: [...(st.made.skills ?? [])], files: [...st.made.files], matches: st.made.matches, table: st.made.table, lastToolAt: st.lastToolAt };
  /* Owner controls (src/autonomy.ts): this run's mode (Ask me first, Usual, Plan first) and Undo's record of what it
     changes (src/rewind.ts), both carried across chunks like the rest of the run. */
  const rec = recorder(st.undo ?? []);
  const outside: Bi[] = [...(st.outside ?? [])];
  const save = (): RunState => ({ ...st, lastToolAt: made.lastToolAt, made: { apps: [...made.apps], approvals: made.approvals, memory: made.memory, skills: made.skills, files: made.files, matches: made.matches, table: made.table }, undo: rec.recs(), outside });
  const mainRole: Role = o.role ?? "plan";
  const model = messagesModel("server", (body, _signal, deep, role) => o.send(body, deep, role ?? mainRole));
  // A remote request (or plain SMS) can't make changes it's not allowed to, whichever tool would make them.
  const from = { channel: o.channel, plainSms: st.plainSms === true };
  const apply = (p: Patch) => o.apply(rec.wrap(guardPatch(from, p)));
  const runKey = "r" + Date.parse(st.started).toString(36);
  const ctl: ControlCtx = { get: o.ws, apply, mode: runMode(o.ws(), st.request ?? ""), remote: isRemote(o.channel), run: runKey, made, mark: () => { made.lastToolAt = st.text.length; }, notify: o.notify, outside: x => outside.push(x) };
  const tools = withControls(makeTools(o.ws, apply, o.step, made, o.lang, () => st.text.length, o.account, { model, files: o.files ?? new Map(), svc: o.svc, signal: o.signal,
    ...(isRemote(o.channel) ? { asked: { via: o.channel!, ...(o.sender ? { sender: o.sender.slice(0, 120) } : {}) } } : {}) }), ctl);
  /** The run's undo point, once its work is done (src/rewind.ts). */
  const keepUndo = () => { if (!rec.size()) return undefined; const id = "undo-" + runKey; o.apply(addUndo({ id, at: st.started!, title: undoTitle(st.request ?? ""), recs: rec.recs(), ...(outside.length ? { outside } : {}) })); return id; };
  /* An owner's approval, carried out here (src/held.ts): agent-run lets only an owner start these, and only from the app. */
  const cmd = isRemote(o.channel) ? null : ownerCommand(st.request ?? "");
  if (cmd && "apply" in cmd) {
    o.step({ state: "working", label: { en: "Making the changes you approved", zh: "正在完成您批准的更改" } });
    ctl.mode = { mode: "usual", why: "approved" };   // an owner approved exactly these; Never rules still hold
    const r = await applyHeld(o.ws, apply, tools, cmd.apply, o.lang);
    jobsDone({ get: o.ws, apply, notify: o.notify }, st.started);
    const undo = keepUndo();
    return { reply: { text: [r ? r.text : { en: "Those changes were already made, or the card is gone.", zh: "这些更改已经完成，或卡片已不存在。" }], approvals: [], ...(undo ? { undo } : {}) } };
  }
  if (cmd && "go" in cmd && st.rounds === 0) {
    const work = goPlan(o.ws, apply, cmd.go, o.lang, o.svc?.me);
    // the model reads the job's own request, not the command; the run works it the usual way from here
    if (work) { const lastUser = [...st.messages].reverse().find(m => m.role === "user"); if (lastUser) lastUser.content = work; }
    ctl.mode = runMode(o.ws(), st.request ?? "");
  }
  const mode = ctl.mode;
  const system = rules(o.ws(), o.lang, o.account, o.research !== false, o.svc?.connected() ?? [], true, { me: o.svc?.me, names: tools.map(t => t.name) }) + (st.network ?? "") + channelHint(o.channel, from.plainSms) + controlsBrief(o.ws(), mode);
  const defs = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  const sources = new Map(st.sources.map(s => [s.url, s]));
  const max = o.maxRounds ?? MAX_ROUNDS;
  let finished = false;
  // The job this run is working: the newest one it touched that's still open.
  const activeJob = (): Job | undefined => (o.ws().jobs ?? []).filter(j => j.updated >= st.started! && j.status === "running").sort((a, b) => b.updated.localeCompare(a.updated))[0];
  const checkedNow: string[] = [];
  const unchecked: string[] = [];      // jobs the checker couldn't look at: they stay open, never done on the agent's word
  const recheck = new Set<string>();   // sent back by the checker: checked again after the fixes
  let last: Block[] = [];

  work: for (;;) {
    // A run working a job may hand it through fresh seats; any other run has one seat's rounds.
    const onJob = () => (o.ws().jobs ?? []).some(j => j.updated >= st.started!);
    while (st.rounds < (onJob() ? max * MAX_SEATS : max)) {
      // leave room for one more model call and the save
      if (Date.now() > o.until) return { paused: save() };
      if (st.rounds === 0) o.step({ state: "searching", label: { en: "Reading your workspace", zh: "读取您的工作区" } });
      st.rounds++; st.seatRounds = (st.seatRounds ?? 0) + 1;
      const data = await o.send({ messages: st.messages, max_tokens: 3500, system, tools: defs }, o.deep, mainRole);
      last = data.content;
      for (const c of data.content) for (const ci of c.citations ?? []) if (ci.url && !sources.has(ci.url)) sources.set(ci.url, { url: ci.url, title: ci.title || ci.url });
      st.sources = [...sources.values()];
      const text = data.content.filter(c => c.type === "text").map(c => c.text).join("");
      if (text) { st.text += (st.text ? "\n\n" : "") + text; o.draft?.(clean(st.text.slice(made.lastToolAt))); }
      if (data.stop_reason === "pause_turn") { st.messages.push({ role: "assistant", content: data.content }); continue; }
      const uses = data.content.filter(c => c.type === "tool_use");
      if (!uses.length || data.stop_reason !== "tool_use") { finished = true; break; }
      st.messages.push({ role: "assistant", content: data.content });
      const results: Record<string, unknown>[] = [];
      for (const u of uses) {
        const refused = channelRefuses(from, String(u.name ?? ""), (u.input ?? {}) as Record<string, unknown>);
        if (refused) {
          results.push({ type: "tool_result", tool_use_id: String(u.id ?? ""), content: refused, is_error: true });
          continue;
        }
        const r = await runTool(tools, u);
        const note = r.is_error ? null : channelNote(from, String(u.name ?? ""));
        results.push((note ? { ...r, content: `${r.content}\n\nNote: ${note}` } : r) as unknown as Record<string, unknown>);
      }
      // The harness: a seat that has handed off gives the job to a fresh agent with a clean context (no compaction);
      // one that's nearly out of room is told to write its handoff first.
      const job = activeJob();
      if (job && st.handing) {
        const seat = (job.seat ?? 1) + 1;
        apply(w => ({ ...w, jobs: (w.jobs ?? []).map(j => (j.id === job.id ? { ...j, seat } : j)) }));
        st.messages = [{ role: "user", content: harnessBrief(o.ws(), { ...job, seat }, st.request ?? "", o.lang) }];
        st.seatRounds = 0; st.handing = false;
        o.step({ state: "shaping", label: { en: `A fresh shift picked up the job (shift ${seat})`, zh: `新一班接手了这项工作（第 ${seat} 班）` } });
        await o.round?.(save());
        continue;
      }
      const full = (st.seatRounds ?? 0) >= max - 1 || JSON.stringify(st.messages).length + JSON.stringify(results).length > CONTEXT_CHARS;
      if (job && full && (job.seat ?? 1) < MAX_SEATS && st.rounds < max * MAX_SEATS - 1) {
        results.push({ type: "text", text: `You're out of room in this conversation. Call hand_off now for job ${job.id}: what's done, what's next and how, open questions, files to reuse. A fresh agent takes the job over from its harness and your note; do nothing else this turn.` });
        st.handing = true;
      }
      st.messages.push({ role: "user", content: results });
      await o.round?.(save());
    }
    // out of rounds with tool results the model never saw: say the work isn't finished, never "Done."
    if (!finished) { const more = outOfSteps(o.lang); st.text += (st.text ? "\n\n" : "") + more; made.lastToolAt = Math.min(made.lastToolAt, st.text.length - more.length); break; }

    // The proof: before a job counts as done, a separate checker, which never saw the work, verifies its done list
    // against the workspace and the reply. What fails goes back to the agent (up to MAX_CHECKS times); after that the
    // job waits, saying plainly what isn't done.
    const reply = clean(st.text.slice(made.lastToolAt).trim() || st.text.trim());
    const due = (o.ws().jobs ?? []).filter(j => j.updated >= st.started! && j.done?.length && (j.status === "done" || (j.status === "running" && j.steps.every(x => x.done))) && (!j.checked || j.checked.at < j.updated || recheck.has(j.id)));
    if (!due.length) break;
    o.step({ state: "weaving", label: { en: "A separate reviewer is checking the work", zh: "独立检查正在核对工作" } });
    const final = (st.checks ?? 0) >= MAX_CHECKS || st.rounds >= max * MAX_SEATS - 1;
    const sendBack: string[] = [];
    for (const j of due) {
      let verdict: { ok: boolean; why: string }[];
      try {
        // the review role: by default a different vendor from the one that did the work, so no model grades itself
        const data = await o.send({ system: CHECKER_SYSTEM, messages: [{ role: "user", content: [{ type: "text", text: checkerPrompt(j, evidence(o.ws(), j, reply)) }] }], max_tokens: 1500 }, false, "review");
        verdict = parseVerdict(data.content.filter(c => c.type === "text").map(c => c.text).join(""), j.done!.length);
      } catch {
        // The checker couldn't run (its model was down). The job used to keep the agent's word and count as done with
        // nothing checked; now it waits, saying so, until a check can run.
        apply(w => ({ ...w, jobs: (w.jobs ?? []).map(x => (x.id === j.id && (x.status === "done" || x.status === "running") ? { ...x, status: "waiting" as const, waiting: B("A separate reviewer couldn't check this yet. Ask Odelia to check it again.", "独立检查暂时无法核对这项工作。请让 Odelia 再检查一次。"), updated: new Date().toISOString() } : x)) }));
        if (!unchecked.includes(j.id)) unchecked.push(j.id);
        continue;
      }
      apply(applyVerdict(j.id, verdict, { final, lang: o.lang }));
      if (!(st.firstChecks ??= []).some(c => c.job === j.id)) st.firstChecks.push({ job: j.id, passed: verdict.filter(v => v.ok).length, of: verdict.length });
      if (!checkedNow.includes(j.id)) checkedNow.push(j.id);
      recheck.delete(j.id);
      const missing = j.done!.filter((_, k) => !verdict[k].ok).map((d, k) => `- ${d.text.en}: ${verdict.filter(v => !v.ok)[k]?.why ?? ""}`);
      if (missing.length && !final) recheck.add(j.id);
      if (missing.length && !final) sendBack.push(`Job ${j.id} (${j.title.en}) isn't done yet. The checker found:\n${missing.join("\n")}`);
    }
    if (!sendBack.length) break;
    st.checks = (st.checks ?? 0) + 1;
    st.messages.push({ role: "assistant", content: last });
    st.messages.push({ role: "user", content: `${sendBack.join("\n\n")}\n\nFix what you can now with your tools, update the plan (set_plan), and say plainly what still needs the person. Your earlier answer won't be sent; write the answer again.` });
    made.lastToolAt = st.text.length;   // the answer they get is the one after the fixes
    finished = false;
    o.step({ state: "shaping", label: { en: "The reviewer sent work back; finishing it", zh: "检查发现未完成项，继续完成" } });
    continue work;
  }

  apply(settleJobs(st.started));
  /* Business rules: each job this run finished fires "a job is done" once. Then the run's undo point, so the person
     can put back what it changed (src/rewind.ts). */
  jobsDone({ get: o.ws, apply, notify: o.notify }, st.started);
  const undoId = keepUndo();
  // a reply that says "done" while a job it worked is still open gets that job's open steps, so it can't claim more
  const said = clean(st.text.slice(made.lastToolAt).trim() || st.text.trim());
  const open = saysDone(said) || !said ?(o.ws().jobs ?? []).filter(j => j.updated >= st.started! && j.status !== "done" && j.status !== "stopped" && j.steps.some(s => !s.done) && !checkedNow.includes(j.id)).slice(0, 2) : [];
  const proof = [...open.map(j => openLine(j, o.lang)),...checkedNow.map(id => (o.ws().jobs ?? []).find(j => j.id === id)).filter((j): j is Job => !!j).map(j => proofLine(j, o.lang)),
    ...unchecked.filter(id => !checkedNow.includes(id)).slice(0, 1).map(() => (o.lang === "zh" ? "独立检查暂时无法核对，所以这项工作仍未完成。" : "A separate reviewer couldn't check the work yet, so the job stays open."))].filter(Boolean).join(" ");
  // a business fact put up for an owner's approval: the reply says it's waiting, even when the model didn't
  const waits = factCards(o.ws(), made.approvals).length > 0 && !/approv|confirm|批准|确认/i.test(said) ? waitingLine(o.lang) : "";
  const final = [honest(said, o.lang) || (o.lang === "zh" ? "完成了。" : "Done."), waits, proof].filter(Boolean).join("\n\n");
  const cited = [...st.sources.filter(x => official(x.url)), ...st.sources.filter(x => !official(x.url))].slice(0, 4);
  return { reply: { text: [same(final)], apps: [...made.apps].slice(0, 3), approvals: made.approvals, memory: made.memory, skills: made.skills.length ? made.skills : undefined, matches: made.matches,
    files: made.files.length ? made.files.slice(0, 6) : undefined, table: made.table, sources: cited.length ? cited : undefined, ...(undoId ? { undo: undoId } : {}) } };
}
