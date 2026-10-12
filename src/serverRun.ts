import { same, type Bi } from "./bi";
import type { Reply, Step } from "./core";
import type { Lang } from "./i18n";
import type { Workspace } from "./model";
import { clean, makeTools, messagesModel, official, outOfSteps, rules, runTool, type Block, type Made, type Services, type Source, type Turn } from "./live";

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
  rounds: number;
  text: string;
  lastToolAt: number;
  sources: Source[];
  made: { apps: string[]; approvals: string[]; memory: Bi[]; skills?: Bi[]; files: string[]; matches?: Reply["matches"]; table?: Reply["table"] };
};

const MAX_ROUNDS = 16;

/** A fresh run: the recent conversation (folded so roles alternate) and the new request. */
export function startState(history: Turn[], prompt: string): RunState {
  const messages = [...history.slice(-12), { role: "user" as const, content: prompt }].reduce<{ role: string; content: unknown }[]>((acc, t) => {
    const last = acc[acc.length - 1];
    if (last && last.role === t.role && typeof last.content === "string") last.content += "\n\n" + t.content; else acc.push({ role: t.role, content: t.content });
    return acc;
  }, []);
  if (messages[0]?.role === "assistant") messages.shift();
  return { messages, rounds: 0, text: "", lastToolAt: 0, sources: [], made: { apps: [], approvals: [], memory: [], skills: [], files: [] } };
}

/** Run rounds until the reply is ready, or until `until` (a timestamp) is near: then return the state to save and resume. */
export async function runRounds(o: {
  state: RunState; ws: () => Workspace; apply: (p: (w: Workspace) => Workspace) => void; step: (s: Step) => void; draft?: (text: string) => void;
  send: Send; lang: Lang; deep: boolean; account: boolean; svc?: Services; files?: Map<string, File>; signal: AbortSignal; until: number;
  /** After each round's tools have run: the moment to save. */
  round?: (state: RunState) => Promise<void>;
  /** The model can search and read official sites (web_search, web_fetch). On unless the caller turns it off. */
  research?: boolean;
  /** Most model calls in one run (default 16). */
  maxRounds?: number;
}): Promise<{ reply: Reply } | { paused: RunState }> {
  const st = o.state;
  const made: Made = { apps: new Set(st.made.apps), approvals: [...st.made.approvals], memory: [...st.made.memory], skills: [...(st.made.skills ?? [])], files: [...st.made.files], matches: st.made.matches, table: st.made.table, lastToolAt: st.lastToolAt };
  const save = (): RunState => ({ ...st, lastToolAt: made.lastToolAt, made: { apps: [...made.apps], approvals: made.approvals, memory: made.memory, skills: made.skills, files: made.files, matches: made.matches, table: made.table } });
  const model = messagesModel("server", (body, _signal, deep) => o.send(body, deep));
  const tools = makeTools(o.ws, o.apply, o.step, made, o.lang, () => st.text.length, o.account, { model, files: o.files ?? new Map(), svc: o.svc, signal: o.signal });
  const system = rules(o.ws(), o.lang, o.account, o.research !== false, o.svc?.connected() ?? [], true, { me: o.svc?.me, names: tools.map(t => t.name) });
  const defs = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  const sources = new Map(st.sources.map(s => [s.url, s]));
  const max = o.maxRounds ?? MAX_ROUNDS;
  let finished = false;

  while (st.rounds < max) {
    // leave room for one more model call and the save
    if (Date.now() > o.until) return { paused: save() };
    if (st.rounds === 0) o.step({ state: "searching", label: { en: "Reading your workspace", zh: "读取您的工作区" } });
    st.rounds++;
    const data = await o.send({ messages: st.messages, max_tokens: 3500, system, tools: defs }, o.deep);
    for (const c of data.content) for (const ci of c.citations ?? []) if (ci.url && !sources.has(ci.url)) sources.set(ci.url, { url: ci.url, title: ci.title || ci.url });
    st.sources = [...sources.values()];
    const text = data.content.filter(c => c.type === "text").map(c => c.text).join("");
    if (text) { st.text += (st.text ? "\n\n" : "") + text; o.draft?.(clean(st.text.slice(made.lastToolAt))); }
    if (data.stop_reason === "pause_turn") { st.messages.push({ role: "assistant", content: data.content }); continue; }
    const uses = data.content.filter(c => c.type === "tool_use");
    if (!uses.length || data.stop_reason !== "tool_use") { finished = true; break; }
    st.messages.push({ role: "assistant", content: data.content });
    const results = [];
    for (const u of uses) results.push(await runTool(tools, u));
    st.messages.push({ role: "user", content: results });
    await o.round?.(save());
  }
  // out of rounds with tool results the model never saw: say the work isn't finished, never "Done."
  if (!finished) { const more = outOfSteps(o.lang); st.text += (st.text ? "\n\n" : "") + more; made.lastToolAt = Math.min(made.lastToolAt, st.text.length - more.length); }

  const final = clean(st.text.slice(made.lastToolAt).trim() || st.text.trim()) || (o.lang === "zh" ? "完成了。" : "Done.");
  const cited = [...st.sources.filter(x => official(x.url)), ...st.sources.filter(x => !official(x.url))].slice(0, 4);
  return { reply: { text: [same(final)], apps: [...made.apps].slice(0, 3), approvals: made.approvals, memory: made.memory, skills: made.skills.length ? made.skills : undefined, matches: made.matches,
    files: made.files.length ? made.files.slice(0, 6) : undefined, table: made.table, sources: cited.length ? cited : undefined } };
}
