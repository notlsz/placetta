import { blocked } from "./privacy";
import { memId, norm, scopeKey, type AgentMemory, type Brief, type BriefProposal, type Scope, type Source } from "./types";

/* The workspace brief, the way CLAUDE.md works for Claude Code: a short, plain, human-readable note per brand and per
   store that is loaded first into every run, inside the cached prefix. An owner, admin or member edits it in Settings.
   Odelia never edits it herself: she proposes a line and a person approves it. Before old turns of a long conversation
   are folded into a summary, the important facts in them are flushed into proposals here, so nothing decided in a long
   conversation is lost when its turns are. */

export const BRIEF_MAX = 4000;
const SCOPE_ORDER: Record<Scope["kind"], number> = { workspace: 0, brand: 1, market: 2, store: 3, person: 4 };
export const briefOf = (m: AgentMemory, s: Scope) => m.briefs.find(b => scopeKey(b.scope) === scopeKey(s));

/** Replace a brief's text (a person's edit). Lines holding something memory never keeps are left out, and said. */
export function setBrief(m: AgentMemory, scope: Scope, body: string, now: string, by?: string): { memory: AgentMemory; dropped: number } {
  let dropped = 0;
  const lines = String(body ?? "").replace(/\r/g, "").split("\n").filter(l => { if (!l.trim()) return true; if (blocked(l, { allowLast4: m.settings.allowLast4 })) { dropped++; return false; } return true; });
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, BRIEF_MAX);
  const old = briefOf(m, scope);
  const b: Brief = { scope, body: text, updated: now, ...(by ? { by } : {}), proposals: old?.proposals ?? [] };
  return { memory: { ...m, briefs: [...m.briefs.filter(x => x !== old), b] }, dropped };
}

/** Odelia proposes a line for a brief. Repeats of a line already there or already proposed are skipped. */
export function propose(m: AgentMemory, scope: Scope, line: string, why: string, source: Source, now: string): AgentMemory {
  const l = line.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!l || blocked(l, { allowLast4: m.settings.allowLast4, untrusted: source.kind === "email" || source.kind === "upload" || source.kind === "portal" || source.kind === "remote" })) return m;
  const old = briefOf(m, scope);
  const have = [...(old?.body.split("\n") ?? []), ...(old?.proposals.map(p => p.line) ?? [])].map(norm);
  if (have.includes(norm(l))) return m;
  const p: BriefProposal = { id: memId("bp"), line: l, why: why.slice(0, 200), source, at: now };
  const b: Brief = old ? { ...old, proposals: [...old.proposals, p].slice(-30) } : { scope, body: "", updated: now, proposals: [p] };
  return { ...m, briefs: [...m.briefs.filter(x => x !== old), b] };
}
/** Approve a proposal: its line is added to the end of the brief. */
export function approveProposal(m: AgentMemory, scope: Scope, id: string, now: string, by?: string): AgentMemory {
  const b = briefOf(m, scope), p = b?.proposals.find(x => x.id === id);
  if (!b || !p) return m;
  const body = (b.body ? b.body + "\n" : "") + "- " + p.line;
  return { ...m, briefs: m.briefs.map(x => (x === b ? { ...x, body: body.slice(0, BRIEF_MAX), updated: now, ...(by ? { by } : {}), proposals: x.proposals.filter(y => y.id !== id) } : x)) };
}
export function rejectProposal(m: AgentMemory, scope: Scope, id: string): AgentMemory {
  return { ...m, briefs: m.briefs.map(x => (scopeKey(x.scope) === scopeKey(scope) ? { ...x, proposals: x.proposals.filter(y => y.id !== id) } : x)) };
}

/** Every brief that applies to a run, workspace first, then the brand, the market and the store, as the prompt carries
 *  them. Sorted, so the same briefs always give the same bytes. A store's bot reads only its own store's brief. */
export function briefsBlock(m: AgentMemory, names: Record<string, string> = {}, only?: { store?: string }): string {
  const bs = m.briefs.filter(b => b.body.trim() && b.scope.kind !== "person" && (!only?.store || b.scope.kind !== "store" || b.scope.id === only.store))
    .sort((a, b) => SCOPE_ORDER[a.scope.kind] - SCOPE_ORDER[b.scope.kind] || (a.scope.id ?? "").localeCompare(b.scope.id ?? ""));
  if (!bs.length) return "";
  return bs.map(b => `Brief: ${b.scope.kind === "workspace" ? "the business" : `${b.scope.kind} ${names[scopeKey(b.scope)] ?? b.scope.id ?? ""}`.trim()}\n${b.body.trim()}`).join("\n\n");
}

/* --------------------------- flush before folding --------------------------- */

/** Sentences that carry something a long conversation must not lose: dates, amounts, case and confirmation numbers,
 *  decisions and requirements. */
// Only strong signals: a date, an amount, a case or confirmation number, a decision or a requirement. Words that are
// merely on topic (permit, lease, landlord) would flood the list and push the decisions out.
const IMPORTANT = /\b(\d{4}-\d{2}-\d{2}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(st|nd|rd|th)?\b|\$\s?\d[\d,]*|(case|confirmation)( number| no\.?| #)?:? ?[A-Z0-9-]*\d|decid\w*|agreed|we('ll| will) (sign|file|open|renew|pay|use|close)|must|requires?)\b|\d{4}年|\d{1,2}月\d{1,2}日|决定|同意|必须|要求|截止|到期|续期|案件号|确认号/i;
type Msg = { role: string; content: unknown };
/** A turn's own words: not the processors' provenance notes, the harness's notes or a summary already folded. */
const NOT_SAID = /^(Where these results came from:|You're out of room|Summary of the earlier conversation)/;
const textOf = (c: unknown): string => typeof c === "string" ? (NOT_SAID.test(c) ? "" : c) : Array.isArray(c) ? (c as { type?: string; text?: string }[]).filter(b => b?.type === "text" && !NOT_SAID.test(b.text ?? "")).map(b => b.text ?? "").join("\n") : "";

/** The important lines in turns about to be folded: what the person said, and what Odelia told them (never tool output,
 *  which is data from outside). Each is kept verbatim in the running summary and proposed for the brief. */
export function flushLines(turns: Msg[], max = 24): { line: string; role: "user" | "assistant" }[] {
  const out: { line: string; role: "user" | "assistant" }[] = [];
  const seen = new Set<string>();
  for (const t of turns) {
    if (t.role !== "user" && t.role !== "assistant") continue;
    for (const s of textOf(t.content).split(/(?<=[.!?。！？])\s+|\n+/)) {
      const line = s.replace(/\s+/g, " ").trim();
      if (line.length < 12 || line.length > 300 || !IMPORTANT.test(line) || blocked(line)) continue;
      const k = norm(line);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ line, role: t.role as "user" | "assistant" });
    }
  }
  return out.slice(-max);
}
