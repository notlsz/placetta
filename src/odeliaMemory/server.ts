import type { Workspace } from "../model";
import { flushProposals, type RunMemoryOut } from "./context";
import { observePrompt, parseObservations, worthObserving, type Material } from "./observe";
import { consistency, pinnedFacts } from "./pinned";
import { UNTRUSTED_TOOLS } from "./processors";
import { memoryOf, toRow, type BriefRow, type ConflictRow, type MemoryRow, type PersonRow, type ProposalRow, type SettingsRow } from "./rows";
import { forgetMatching, update } from "./update";
import { isLive, type AgentMemory, type Observation } from "./types";

/* Agent memory on the server: what agent-run reads before a run and saves after it. The database calls are passed in
   (agent-run's MemoryDb uses the service role, always filtered to the run's workspace), so the same code runs in the
   tests with a stand-in. Nothing is saved for a "don't remember this chat" run, or while memory is off. */

export type MemoryDb = {
  settings(): Promise<SettingsRow | null>;
  /** The asker's own switches (Reference saved memories, Reference chat history); null when they never changed them. */
  person?(userId: string): Promise<PersonRow | null>;
  /** The workspace's memories that are suggested or approved (the history isn't needed to run). */
  items(): Promise<MemoryRow[]>;
  briefs(): Promise<BriefRow[]>;
  proposals(): Promise<ProposalRow[]>;
  conflicts(): Promise<ConflictRow[]>;
  insert(rows: MemoryRow[]): Promise<void>;
  /** A memory seen again (merged): its count and when. */
  touch(id: string, seen: number, lastSeen: string): Promise<void>;
  remove(ids: string[]): Promise<void>;
  /** A fact replaced by a newer one: it stays in the history, valid until validTo. */
  close(id: string, validTo: string, supersededBy: string): Promise<void>;
  propose(rows: Omit<ProposalRow, "created_at">[]): Promise<void>;
  conflict(rows: Omit<ConflictRow, "resolved_at">[]): Promise<void>;
};

/** Who a run's answer reaches, for what memory it may read: the asker's role, and whether the answer goes to a thread
 *  other people read (a Slack or Teams channel, a Lark or Telegram group). */
export type Audience = { role?: string; shared?: boolean };

/** Whether a memory may be read in a run for this person and audience. A person's own memory only in their own runs and
 *  never into a shared thread; an admins-only memory only for an owner or admin, and never into a shared thread (the
 *  thread's other readers may be members or guests of the chat). */
export function readable(o: Observation, me: string | undefined, a: Audience = {}): boolean {
  if (o.scope.kind === "person" && (o.scope.id !== me || a.shared)) return false;
  if (o.visibility === "admins" && (a.shared || !(a.role === "owner" || a.role === "admin" || a.role === undefined))) return false;
  return true;
}

/** The workspace's memory for a run, cut to what this person and audience may read. Without an audience (tests, the
 *  app) the asker is treated as the run's owner in a private chat. */
export async function loadMemory(db: MemoryDb, me?: string, a: Audience = {}): Promise<AgentMemory> {
  const settings = await db.settings();
  const [items, briefs, proposals, conflicts, person] = await Promise.all([db.items(), db.briefs(), db.proposals(), db.conflicts(), me && db.person ? db.person(me).catch(() => null) : Promise.resolve(null)]);
  const m = memoryOf({ settings, person, items, briefs, proposals, conflicts });
  const kept = m.items.filter(o => readable(o, me, a));
  const ids = new Set(kept.map(o => o.id));
  return { ...m, items: kept, conflicts: m.conflicts.filter(c => ids.has(c.memory)) };
}

type Msg = { role: string; content: unknown };
/** What the observation step reads: the request (an owner's words in the app; data from anywhere else), Odelia's answer,
 *  and what her tools read from outside (emails, files, web pages, connected apps), which is data. */
export function materialsOf(o: { runId: string; prompt: string; reply: string; remote: boolean; messages: Msg[] }): Material[] {
  const out: Material[] = [{ kind: o.remote ? "remote" : "chat", ref: o.runId, text: o.prompt.slice(0, 4000), trust: o.remote ? "untrusted" : "owner" }];
  if (o.reply.trim()) out.push({ kind: "chat", ref: o.runId, title: "Odelia's answer", text: o.reply.slice(0, 3000), trust: "agent" });
  const names = new Map<string, string>();
  for (const m of o.messages) if (Array.isArray(m.content)) for (const b of m.content as Record<string, unknown>[]) if (b.type === "tool_use") names.set(String(b.id), String(b.name));
  for (const m of o.messages) if (m.role === "user" && Array.isArray(m.content)) for (const b of m.content as Record<string, unknown>[]) {
    if (b.type !== "tool_result" || b.is_error) continue;
    const tool = names.get(String(b.tool_use_id)) ?? "";
    if (!UNTRUSTED_TOOLS.test(tool)) continue;
    const text = typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "");
    out.push({ kind: /email/.test(tool) ? "email" : /web/.test(tool) ? "portal" : /file|document/.test(tool) ? "upload" : "document", ref: `${o.runId}:${String(b.tool_use_id)}`, title: tool, text: text.slice(0, 3000), trust: "untrusted" });
    if (out.length >= 8) break;
  }
  return out;
}

export type SaveReport = { remembered: number; suggested: number; merged: number; forgot: number; proposed: number; conflicts: number; observed: number };

/** After a run: carry out "forget", keep "remember this", save Odelia's suggestions and the observations from the run,
 *  propose the lines flushed from a long conversation for the brief, and raise any conflict with the records. */
export async function saveRun(db: MemoryDb, o: {
  ws: string; memory: AgentMemory; out: RunMemoryOut; w: Workspace; now: string;
  run: { id: string; prompt: string; channel?: string | null; created_by?: string | null; no_memory?: boolean; store?: string | null };
  reply: string; messages: Msg[];
  /** The asker's role now (src/security/policy.ts): a viewer saves nothing; "remember this" is kept at once only for an
   *  owner or admin, and from anyone else waits as a suggestion like Odelia's own. Without it (tests) an owner's. */
  role?: string;
  /** The extract role's model, for the observation step; without it only what the run itself left is saved. */
  ask?: (prompt: string) => Promise<string>;
}): Promise<SaveReport> {
  const rep: SaveReport = { remembered: 0, suggested: 0, merged: 0, forgot: 0, proposed: 0, conflicts: 0, observed: 0 };
  if (o.run.no_memory || !o.memory.settings.enabled || o.memory.settings.referenceMemories === false || o.role === "viewer" || o.role === "system") return rep;
  const approves = !o.role || o.role === "owner" || o.role === "admin";
  const remote = !!o.run.channel && o.run.channel !== "app";
  const by = o.run.created_by ?? undefined;
  let mem = o.memory;

  // "forget that": every current memory that matches, removed (only from the app)
  if (!remote) for (const f of o.out.forget) {
    const r = forgetMatching(mem, f);
    const gone = mem.items.filter(x => !r.memory.items.includes(x)).map(x => x.id);
    if (gone.length) { await db.remove(gone); rep.forgot += gone.length; }
    mem = r.memory;
  }

  // what the run left, then what the observation step finds: each through extract-then-update
  let candidates: Observation[] = [...o.out.remembered.map(x => approves ? x : { ...x, status: "suggested" as const }), ...o.out.suggested];
  if (o.memory.settings.suggest && o.ask) {
    const mats = materialsOf({ runId: o.run.id, prompt: o.run.prompt, reply: o.reply, remote, messages: o.messages });
    if (worthObserving(mats)) {
      const ctx = { today: o.now.slice(0, 10), now: o.now, me: by, allowLast4: mem.settings.allowLast4,
        stores: (o.w.stores ?? []).map(s => ({ id: s.id, name: s.name.en })),
        records: [...o.w.apps.map(a => ({ key: `app:${a.id}`, label: `${a.name.en}, ${a.agency.en}` })), ...o.w.deadlines.map(d => ({ key: `deadline:${d.id}`, label: `${d.title.en} ${d.date}` })), ...(o.w.entities ?? []).map(e => ({ key: `entity:${e.id}`, label: e.name }))],
        known: mem.items.filter(isLive).slice(0, 40).map(x => x.text.en) };
      try {
        const found = parseObservations(await o.ask(observePrompt(mats, ctx)), mats, ctx);
        rep.observed = found.length;
        candidates = [...candidates, ...found];
      } catch { /* the step is best effort: the run's answer is already out */ }
    }
  }
  const { memory: next, ops } = update(mem, candidates);
  const rows: MemoryRow[] = [];
  for (const op of ops) {
    if (op.op === "add") { rows.push(toRow(o.ws, op.item, by)); if (op.item.status === "approved") rep.remembered++; else rep.suggested++; }
    else if (op.op === "supersede") { rows.push(toRow(o.ws, op.item, by)); rep.remembered++; }
    else if (op.op === "merge") { const it = next.items.find(x => x.id === op.id); if (it) { await db.touch(it.id, it.seen ?? 2, it.lastSeen ?? o.now); rep.merged++; } }
  }
  if (rows.length) await db.insert(rows);
  // an owner's "remember this" that replaces a fact closes the old one
  for (const op of ops) if (op.op === "supersede") await db.close(op.old, op.item.validFrom.slice(0, 10), op.item.id);
  mem = next;

  // the brief: proposals from the flushed lines and from Odelia
  const before = new Set(mem.briefs.flatMap(b => b.proposals.map(p => p.id)));
  const scope = o.run.store ? { kind: "store" as const, id: o.run.store } : { kind: "workspace" as const };
  const withProps = flushProposals(mem, o.out, o.now, { scope, ref: o.run.id, remote });
  const fresh = withProps.briefs.flatMap(b => b.proposals.filter(p => !before.has(p.id)).map(p => ({ id: p.id, scope_kind: b.scope.kind, scope_id: b.scope.id ?? "", line: p.line, why: p.why, source_kind: p.source.kind, source_ref: p.source.ref })));
  if (fresh.length) { await db.propose(fresh); rep.proposed = fresh.length; }

  // memory against the records, now (and every night in the database)
  const cs = consistency(withProps, pinnedFacts(o.w, { allowLast4: mem.settings.allowLast4 }), o.now);
  if (cs.length) { await db.conflict(cs.map(c => ({ id: c.id, memory_id: c.memory, record: c.record, memory_value: c.memoryValue, record_value: c.recordValue, found_at: c.found }))); rep.conflicts = cs.length; }
  return rep;
}
