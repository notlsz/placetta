import { same, type Bi } from "./bi";
import type { Reply, Step } from "./core";
import type { Lang } from "./i18n";
import type { Workspace } from "./model";
import { clean, makeTools, messagesModel, official, outOfSteps, rules, runTool, type Block, type Made, type Services, type Source, type Turn } from "./live";
import { settleJobs, type Job } from "./jobs";
import { applyVerdict, CHECKER_SYSTEM, checkerPrompt, CONTEXT_CHARS, evidence, harnessBrief, MAX_CHECKS, MAX_SEATS, parseVerdict, proofLine } from "./harness";

/* ------------------------------------------------------------------ *
 * The agent's tool loop as the server runs it: the same tools and
 * instructions as in the browser, but resumable. After every round the
 * conversation and what the agent made so far are plain data, so a run
 * that reaches the server's time limit is saved and picked up again by a
 * fresh instance. The person can close the app; the work carries on.
 * ------------------------------------------------------------------ */

export type Send = (body: Record<string, unknown>, deep: boolean) => Promise<{ content: Block[]; stop_reason: string }>;
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
};

const MAX_ROUNDS = 16;

/** Where the person asked: the app, a text message, or a phone call (answered by text when it's done). */
export type Channel = "app" | "sms" | "voice";
/** From a text or a call nothing is deleted outright (removing a store or an application already waits for a confirmation in the app). */
export function phoneRefuses(channel: Channel | undefined, tool: string, input: Record<string, unknown>): boolean {
  return (channel === "sms" || channel === "voice") && tool === "edit_deadline" && !!input.remove;
}
/** How to write for a phone: short plain texts, one question at a time, and nothing that needs the app done by text. */
export function channelHint(channel: Channel | undefined): string {
  if (channel !== "sms" && channel !== "voice") return "";
  return `

This conversation is by phone, not in the app: ${channel === "sms" ? "they texted you" : "they asked on a call with you"}, and your reply goes to them as a text message.
- Write one to three short plain sentences, 300 characters at most. Lead with the answer. No markdown, no lists, no headings, no links (Placetta adds the links). Ask at most one question, at the end.
- Never file, pay, send an email or delete anything from a text, and never ask them to approve by replying. Prepare everything as usual and put it up for approval with your tools: Placetta texts them a link to that exact approval in the app. Say so in one short sentence.
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
  /** After each round's tools have run: the moment to save. */
  round?: (state: RunState) => Promise<void>;
  /** The model can search and read official sites (web_search, web_fetch). On unless the caller turns it off. */
  research?: boolean;
  /** Most model calls in one run (default 16). */
  maxRounds?: number;
}): Promise<{ reply: Reply } | { paused: RunState }> {
  const st = o.state;
  st.started ??= new Date().toISOString();
  const made: Made = { apps: new Set(st.made.apps), approvals: [...st.made.approvals], memory: [...st.made.memory], skills: [...(st.made.skills ?? [])], files: [...st.made.files], matches: st.made.matches, table: st.made.table, lastToolAt: st.lastToolAt };
  const save = (): RunState => ({ ...st, lastToolAt: made.lastToolAt, made: { apps: [...made.apps], approvals: made.approvals, memory: made.memory, skills: made.skills, files: made.files, matches: made.matches, table: made.table } });
  const model = messagesModel("server", (body, _signal, deep) => o.send(body, deep));
  const tools = makeTools(o.ws, o.apply, o.step, made, o.lang, () => st.text.length, o.account, { model, files: o.files ?? new Map(), svc: o.svc, signal: o.signal });
  const system = rules(o.ws(), o.lang, o.account, o.research !== false, o.svc?.connected() ?? [], true, { me: o.svc?.me, names: tools.map(t => t.name) }) + (st.network ?? "") + channelHint(o.channel);
  const defs = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  const sources = new Map(st.sources.map(s => [s.url, s]));
  const max = o.maxRounds ?? MAX_ROUNDS;
  let finished = false;
  // The job this run is working: the newest one it touched that's still open.
  const activeJob = (): Job | undefined => (o.ws().jobs ?? []).filter(j => j.updated >= st.started! && j.status === "running").sort((a, b) => b.updated.localeCompare(a.updated))[0];
  const checkedNow: string[] = [];
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
      const data = await o.send({ messages: st.messages, max_tokens: 3500, system, tools: defs }, o.deep);
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
        if (phoneRefuses(o.channel, String(u.name ?? ""), (u.input ?? {}) as Record<string, unknown>)) {
          results.push({ type: "tool_result", tool_use_id: String(u.id ?? ""), content: "Error: Nothing is deleted from a text or a call. Tell them to remove it in the app.", is_error: true });
          continue;
        }
        results.push(await runTool(tools, u) as unknown as Record<string, unknown>);
      }
      // The harness: a seat that has handed off gives the job to a fresh agent with a clean context (no compaction);
      // one that's nearly out of room is told to write its handoff first.
      const job = activeJob();
      if (job && st.handing) {
        const seat = (job.seat ?? 1) + 1;
        o.apply(w => ({ ...w, jobs: (w.jobs ?? []).map(j => (j.id === job.id ? { ...j, seat } : j)) }));
        st.messages = [{ role: "user", content: harnessBrief(o.ws(), { ...job, seat }, st.request ?? "", o.lang) }];
        st.seatRounds = 0; st.handing = false;
        o.step({ state: "shaping", label: { en: `A fresh agent picked up the job (seat ${seat})`, zh: `新的代理接手了这项工作（第 ${seat} 棒）` } });
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
    o.step({ state: "weaving", label: { en: "A separate checker is reviewing the work", zh: "独立检查正在核对工作" } });
    const final = (st.checks ?? 0) >= MAX_CHECKS || st.rounds >= max * MAX_SEATS - 1;
    const sendBack: string[] = [];
    for (const j of due) {
      let verdict: { ok: boolean; why: string }[];
      try {
        const data = await o.send({ system: CHECKER_SYSTEM, messages: [{ role: "user", content: [{ type: "text", text: checkerPrompt(j, evidence(o.ws(), j, reply)) }] }], max_tokens: 1500 }, false);
        verdict = parseVerdict(data.content.filter(c => c.type === "text").map(c => c.text).join(""), j.done!.length);
      } catch { continue; }   // the checker couldn't run: the job keeps the agent's word, and no proof line claims a check
      o.apply(applyVerdict(j.id, verdict, { final, lang: o.lang }));
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
    o.step({ state: "shaping", label: { en: "The checker sent work back; finishing it", zh: "检查发现未完成项，继续完成" } });
    continue work;
  }

  o.apply(settleJobs(st.started));
  const proof = checkedNow.map(id => (o.ws().jobs ?? []).find(j => j.id === id)).filter((j): j is Job => !!j).map(j => proofLine(j, o.lang)).filter(Boolean).join(" ");
  const final = [clean(st.text.slice(made.lastToolAt).trim() || st.text.trim()) || (o.lang === "zh" ? "完成了。" : "Done."), proof].filter(Boolean).join("\n\n");
  const cited = [...st.sources.filter(x => official(x.url)), ...st.sources.filter(x => !official(x.url))].slice(0, 4);
  return { reply: { text: [same(final)], apps: [...made.apps].slice(0, 3), approvals: made.approvals, memory: made.memory, skills: made.skills.length ? made.skills : undefined, matches: made.matches,
    files: made.files.length ? made.files.slice(0, 6) : undefined, table: made.table, sources: cited.length ? cited : undefined } };
}
