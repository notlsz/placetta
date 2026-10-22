import { blocked } from "./privacy";
import { isLive, memId, norm, scopeKey, type AgentMemory, type Observation } from "./types";

/* Extract, then update (the Mem0 and Zep way): each new observation is compared with what memory holds and becomes one
   operation, instead of a line appended to a pile:
     add        nothing like it yet
     merge      the same fact again: seen once more, newest source kept
     supersede  a new value for the same entity and attribute: the old one gets its valid-to date and stays in the
                history, the new one is current. A suggestion never replaces an approved fact by itself: it waits, marked
                as the replacement, and replaces it when someone approves it.
     delete     "forget this"
     noop       a repeat, or older than what memory holds
   Every function returns a new memory and never changes the one passed in. */

export type Op =
  | { op: "add"; item: Observation }
  | { op: "merge"; id: string; item: Observation }
  | { op: "supersede"; old: string; item: Observation }
  | { op: "delete"; id: string }
  | { op: "noop"; why: string; item?: Observation };

const DAY = 86_400_000;
/** Same scope, entity and attribute: the one slot in the graph a fact fills. */
export const slotOf = (o: Pick<Observation, "scope" | "entity" | "attr">) => `${scopeKey(o.scope)}|${norm(o.entity)}|${norm(o.attr)}`;
const words = (s: string) => new Set(norm(s).split(" ").filter(w => w.length > 2));
/** Near-duplicate wording (Jaccard of words): "Owner prefers WeChat" and "The owner prefers WeChat". */
export function similar(a: string, b: string): number {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let n = 0; for (const w of x) if (y.has(w)) n++;
  return n / (x.size + y.size - n);
}

/** Approved memories that count toward the cap (record-derived pins aren't stored here, so they never count). */
export const used = (m: AgentMemory) => m.items.filter(isLive).length;
export type Capacity = { used: number; cap: number; pct: number; warn: boolean; full: boolean };
/** How full memory is. warn at 90%, before anything could be refused; full at the cap. Nothing is ever dropped to make room. */
export function capacity(m: AgentMemory): Capacity {
  const u = used(m), cap = Math.max(1, m.settings.cap);
  return { used: u, cap, pct: Math.min(100, Math.round((u / cap) * 100)), warn: u >= Math.ceil(cap * 0.9), full: u >= cap };
}

/** The operation for each candidate, in order (a later candidate sees what an earlier one did). */
export function plan(m: AgentMemory, candidates: Observation[]): Op[] {
  const ops: Op[] = [];
  let cur = m;
  for (const c of candidates) {
    const op = planOne(cur, c);
    ops.push(op);
    cur = apply(cur, [op]);
  }
  return ops;
}

function planOne(m: AgentMemory, c: Observation): Op {
  if (blocked(`${c.text.en} ${c.text.zh} ${c.value}`, { allowLast4: m.settings.allowLast4, untrusted: c.trust === "untrusted" })) return { op: "noop", why: "blocked", item: c };
  const slot = slotOf(c);
  const open = m.items.filter(o => !o.validTo && (o.status === "approved" || o.status === "suggested"));
  const same = open.filter(o => slotOf(o) === slot);
  const live = same.find(o => o.status === "approved");
  const pending = same.find(o => o.status === "suggested");
  if (live && norm(live.value) === norm(c.value)) return { op: "merge", id: live.id, item: c };
  if (pending && norm(pending.value) === norm(c.value)) return { op: "merge", id: pending.id, item: c };
  if (live) {
    if (c.validFrom < live.validFrom) return { op: "noop", why: "older", item: c };
    // a changed fact: an owner's word or a record replaces it now; anything else waits for approval as its replacement
    if (c.status === "approved") return { op: "supersede", old: live.id, item: c };
    return { op: "add", item: { ...c, status: "suggested", supersedes: live.id } };
  }
  // the same thing in other words, anywhere in this scope
  const twin = open.find(o => scopeKey(o.scope) === scopeKey(c.scope) && similar(o.text.en, c.text.en) >= 0.75);
  if (twin) return { op: "merge", id: twin.id, item: c };
  return { op: "add", item: c };
}

/** Carry out the operations. */
export function apply(m: AgentMemory, ops: Op[]): AgentMemory {
  let items = [...m.items];
  for (const op of ops) {
    if (op.op === "add") {
      if (op.item.status === "approved" && capacity({ ...m, items }).full) { items.push({ ...op.item, status: "suggested" }); continue; }
      items.push(op.item);
    } else if (op.op === "merge") {
      items = items.map(o => (o.id === op.id ? { ...o, seen: (o.seen ?? 1) + 1, lastSeen: op.item.at > (o.lastSeen ?? o.at) ? op.item.at : (o.lastSeen ?? o.at), ...(op.item.critical && !o.critical ? { critical: op.item.critical } : {}) } : o));
    } else if (op.op === "supersede") {
      items = items.map(o => (o.id === op.old ? { ...o, validTo: op.item.validFrom, status: "superseded" as const, supersededBy: op.item.id } : o));
      items.push({ ...op.item, supersedes: undefined });
    } else if (op.op === "delete") {
      items = items.filter(o => o.id !== op.id);
    }
  }
  return { ...m, items };
}

/** Extract-then-update in one step. Returns the new memory and what happened, for the run's log. */
export function update(m: AgentMemory, candidates: Observation[]): { memory: AgentMemory; ops: Op[] } {
  const ops = plan(m, candidates);
  return { memory: apply(m, ops), ops };
}

/** Approve a suggestion: it becomes current, and replaces the fact it was marked to replace. Refused when memory is full
 *  (the person is told and can remove something first). */
export function approve(m: AgentMemory, id: string, by: string, now: string): { memory: AgentMemory; ok: boolean; full?: boolean } {
  const s = m.items.find(o => o.id === id && o.status === "suggested");
  if (!s) return { memory: m, ok: false };
  if (capacity(m).full) return { memory: m, ok: false, full: true };
  let items = m.items.map(o => (o.id === id ? { ...o, status: "approved" as const, by, edited: now, supersedes: undefined } : o));
  // what it replaces closes now; and if something else now fills the same slot, that closes too
  const old = s.supersedes ? items.find(o => o.id === s.supersedes) : items.find(o => o.id !== id && isLive(o) && slotOf(o) === slotOf(s));
  if (old && isLive(old)) items = items.map(o => (o.id === old.id ? { ...o, status: "superseded" as const, validTo: now, supersededBy: id } : o));
  return { memory: { ...m, items }, ok: true };
}
export function reject(m: AgentMemory, id: string, by: string, now: string): AgentMemory {
  return { ...m, items: m.items.map(o => (o.id === id && o.status === "suggested" ? { ...o, status: "rejected" as const, by, edited: now } : o)) };
}
/** Edit a memory's words (the person's correction wins; the source stays, marked edited). Refused when the new words
 *  hold something memory never keeps. */
export function edit(m: AgentMemory, id: string, text: { en: string; zh: string }, by: string, now: string): { memory: AgentMemory; ok: boolean; why?: string } {
  const en = text.en.trim().slice(0, 300), zh = (text.zh.trim() || en).slice(0, 300);
  const why = blocked(`${en} ${zh}`, { allowLast4: m.settings.allowLast4 });
  if (why) return { memory: m, ok: false, why };
  return { memory: { ...m, items: m.items.map(o => (o.id === id ? { ...o, text: { en, zh }, by, edited: now } : o)) }, ok: true };
}
export const remove = (m: AgentMemory, id: string): AgentMemory => ({ ...m, items: m.items.filter(o => o.id !== id), conflicts: m.conflicts.filter(c => c.memory !== id) });
export const pin = (m: AgentMemory, id: string, on: boolean): AgentMemory => ({ ...m, items: m.items.map(o => (o.id === id ? { ...o, pinned: on } : o)) });
/** Forget everything: every memory, suggestion and brief proposal. The briefs' own text is the owners' and stays unless
 *  they clear it too. */
export const forgetAll = (m: AgentMemory, briefs = false): AgentMemory => ({ ...m, items: [], conflicts: [], briefs: briefs ? [] : m.briefs.map(b => ({ ...b, proposals: [] })) });

/** "Forget X": every current memory whose words match, removed. Returns how many. */
export function forgetMatching(m: AgentMemory, what: string): { memory: AgentMemory; n: number } {
  const q = norm(what);
  if (q.length < 3) return { memory: m, n: 0 };
  const hit = m.items.filter(o => !o.validTo && (norm(o.text.en).includes(q) || norm(o.text.zh).includes(q) || norm(o.entity) === q || similar(o.text.en, what) >= 0.6));
  return { memory: { ...m, items: m.items.filter(o => !hit.includes(o)) }, n: hit.length };
}

/** Age out: an approved memory with a time to live that wasn't seen again in that time expires; a suggestion nobody
 *  answered in 30 days expires. Expired ones stay listed (and can be restored by approving again) but aren't used.
 *  Pinned and critical memories never age out. */
export function ageOut(m: AgentMemory, now: string): { memory: AgentMemory; expired: string[] } {
  const t = Date.parse(now), out: string[] = [];
  const items = m.items.map(o => {
    if (o.pinned || o.critical) return o;
    const last = Date.parse(o.lastSeen ?? o.at);
    const stale = (o.status === "approved" && !o.validTo && o.ttlDays && t - last > o.ttlDays * DAY) || (o.status === "suggested" && t - Date.parse(o.at) > 30 * DAY);
    if (!stale) return o;
    out.push(o.id);
    return { ...o, status: "expired" as const };
  });
  return { memory: out.length ? { ...m, items } : m, expired: out };
}

/** A new observation with defaults filled in. */
export function observation(o: Partial<Observation> & Pick<Observation, "entity" | "attr" | "value" | "text" | "source" | "trust">, now: string): Observation {
  return { id: memId(), scope: { kind: "workspace" }, topic: "company", at: now, validFrom: now.slice(0, 10), status: o.trust === "owner" || o.trust === "record" ? "approved" : "suggested", ...o } as Observation;
}
