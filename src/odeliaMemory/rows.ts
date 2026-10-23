import { DEFAULT_MEM_SETTINGS, recordOf, type AgentMemory, type Brief, type BriefProposal, type Conflict, type MemSettings, type Observation, type RecordKind, type ScopeKind, type SourceKind } from "./types";

/* Agent memory as the database keeps it (migration 20261022211905_agent_memory): one row per memory, brief, proposal and
   conflict. The same mapping for the app (src/cloud/memoryApi.ts) and agent-run. */

export type MemoryRow = {
  id: string; workspace_id: string; scope_kind: ScopeKind; scope_id: string; topic: string; entity: string; attr: string; value: string;
  text_en: string; text_zh: string; source_kind: SourceKind; source_ref: string; source_title: string | null; source_url: string | null; source_quote: string | null;
  observed_at: string; valid_from: string; valid_to: string | null; status: Observation["status"]; trust: Observation["trust"]; pinned: boolean; critical: string | null;
  supersedes: string | null; superseded_by: string | null; seen: number; last_seen: string | null; ttl_days: number | null; created_by?: string | null; updated_by?: string | null; updated_at?: string;
  /** From migration 20261031151700_memory_records_roles: read, never written by toRow (a trigger links the record). */
  record_kind?: string | null; record_id?: string | null; verify?: string | null; verify_reason?: { en?: string; zh?: string } | null; verify_at?: string | null; visibility?: string | null;
};
/** This person's own switches (agent_memory_person). */
export type PersonRow = { reference_memories: boolean; reference_chats: boolean };
export type SettingsRow = { enabled: boolean; suggest: boolean; allow_last4: boolean; cap: number };
export type BriefRow = { scope_kind: ScopeKind; scope_id: string; body: string; updated_at: string; updated_by?: string | null };
export type ProposalRow = { id: string; scope_kind: ScopeKind; scope_id: string; line: string; why: string; source_kind: SourceKind; source_ref: string; created_at: string };
export type ConflictRow = { id: string; memory_id: string; record: string; memory_value: string; record_value: string; found_at: string; resolved_at: string | null };

export const MEMORY_COLS = "id, workspace_id, scope_kind, scope_id, topic, entity, attr, value, text_en, text_zh, source_kind, source_ref, source_title, source_url, source_quote, observed_at, valid_from, valid_to, status, trust, pinned, critical, supersedes, superseded_by, seen, last_seen, ttl_days, updated_by, updated_at";
/** With the record link, the re-check and who reads it (20261031151700). Readers try these first and fall back to
 *  MEMORY_COLS on a database without the migration. */
export const MEMORY_COLS_V2 = `${MEMORY_COLS}, record_kind, record_id, verify, verify_reason, verify_at, visibility`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function toRow(ws: string, o: Observation, by?: string): MemoryRow {
  return {
    id: o.id, workspace_id: ws, scope_kind: o.scope.kind, scope_id: o.scope.id ?? "", topic: o.topic, entity: o.entity.slice(0, 120), attr: o.attr.slice(0, 60), value: o.value.slice(0, 300),
    text_en: o.text.en.slice(0, 300), text_zh: (o.text.zh || o.text.en).slice(0, 300), source_kind: o.source.kind, source_ref: o.source.ref.slice(0, 200), source_title: o.source.title?.slice(0, 200) ?? null,
    source_url: o.source.url?.slice(0, 500) ?? null, source_quote: o.source.quote?.slice(0, 600) ?? null, observed_at: o.at, valid_from: o.validFrom.slice(0, 10), valid_to: o.validTo?.slice(0, 10) ?? null,
    status: o.status, trust: o.trust, pinned: !!o.pinned, critical: o.critical ?? null, supersedes: o.supersedes ?? null, superseded_by: o.supersededBy ?? null, seen: o.seen ?? 1,
    last_seen: o.lastSeen ?? null, ttl_days: o.ttlDays ?? null, ...(by && UUID.test(by) ? { created_by: by, ...(o.status === "approved" ? { updated_by: by } : {}) } : {}),
  };
}
export function fromRow(r: MemoryRow): Observation {
  return {
    id: r.id, scope: { kind: r.scope_kind, ...(r.scope_id ? { id: r.scope_id } : {}) }, topic: r.topic as Observation["topic"], entity: r.entity, attr: r.attr, value: r.value,
    text: { en: r.text_en, zh: r.text_zh }, source: { kind: r.source_kind, ref: r.source_ref, ...(r.source_title ? { title: r.source_title } : {}), ...(r.source_url ? { url: r.source_url } : {}), ...(r.source_quote ? { quote: r.source_quote } : {}) },
    at: r.observed_at, validFrom: r.valid_from, ...(r.valid_to ? { validTo: r.valid_to } : {}), status: r.status, trust: r.trust, ...(r.pinned ? { pinned: true } : {}),
    ...(r.critical ? { critical: r.critical as Observation["critical"] } : {}), ...(r.supersedes ? { supersedes: r.supersedes } : {}), ...(r.superseded_by ? { supersededBy: r.superseded_by } : {}),
    seen: r.seen, ...(r.last_seen ? { lastSeen: r.last_seen } : {}), ...(r.ttl_days ? { ttlDays: r.ttl_days } : {}), ...(r.updated_by ? { by: r.updated_by } : {}), ...(r.updated_at ? { edited: r.updated_at } : {}),
    ...linkOf(r),
    ...(r.verify === "recheck" || r.verify === "confirmed" ? { verify: r.verify as "recheck" | "confirmed" } : {}),
    ...(r.verify_reason?.en ? { verifyReason: { en: r.verify_reason.en, zh: r.verify_reason.zh || r.verify_reason.en } } : {}),
    ...(r.verify_at ? { verifyAt: r.verify_at } : {}),
    ...(r.visibility === "admins" ? { visibility: "admins" as const } : {}),
  };
}
const KINDS = ["filing", "application", "deadline", "entity", "store", "form"];
/** The record a row is tied to: the database's link, or before the migration, the same reading of its entity key. */
function linkOf(r: MemoryRow): Pick<Observation, "record"> {
  if (r.record_kind && r.record_id && KINDS.includes(r.record_kind)) return { record: { kind: r.record_kind as RecordKind, id: r.record_id } };
  const rec = recordOf(r.entity);
  return rec ? { record: rec } : {};
}
export const settingsOf = (r: SettingsRow | null | undefined): MemSettings => (r ? { enabled: !!r.enabled, suggest: r.suggest !== false, allowLast4: !!r.allow_last4, cap: Number(r.cap) || DEFAULT_MEM_SETTINGS.cap } : { ...DEFAULT_MEM_SETTINGS });

/** The whole memory from its rows. */
export function memoryOf(o: { settings?: SettingsRow | null; person?: PersonRow | null; items: MemoryRow[]; briefs: BriefRow[]; proposals: ProposalRow[]; conflicts: ConflictRow[] }): AgentMemory {
  const briefs: Brief[] = o.briefs.map(b => ({ scope: { kind: b.scope_kind, ...(b.scope_id ? { id: b.scope_id } : {}) }, body: b.body, updated: b.updated_at, ...(b.updated_by ? { by: b.updated_by } : {}), proposals: [] }));
  for (const p of o.proposals) {
    const prop: BriefProposal = { id: p.id, line: p.line, why: p.why, source: { kind: p.source_kind, ref: p.source_ref }, at: p.created_at };
    const b = briefs.find(x => x.scope.kind === p.scope_kind && (x.scope.id ?? "") === p.scope_id);
    if (b) b.proposals.push(prop); else briefs.push({ scope: { kind: p.scope_kind, ...(p.scope_id ? { id: p.scope_id } : {}) }, body: "", updated: p.created_at, proposals: [prop] });
  }
  const conflicts: Conflict[] = o.conflicts.map(c => ({ id: c.id, memory: c.memory_id, record: c.record, memoryValue: c.memory_value, recordValue: c.record_value, found: c.found_at, ...(c.resolved_at ? { resolved: c.resolved_at } : {}) }));
  const settings = { ...settingsOf(o.settings), referenceMemories: o.person?.reference_memories !== false, referenceChats: o.person?.reference_chats !== false };
  return { settings, items: o.items.map(fromRow), briefs, conflicts };
}
