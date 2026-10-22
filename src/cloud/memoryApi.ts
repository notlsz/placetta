import { supabase, type ApiError } from "./api";
import { MEMORY_COLS, memoryOf, type BriefRow, type ConflictRow, type MemoryRow, type ProposalRow, type SettingsRow } from "../odeliaMemory/rows";
import type { AgentMemory, Scope } from "../odeliaMemory/types";

/* Agent memory in an account (migration 20261022171905_agent_memory). Anyone on the workspace reads it; the database's
   own functions decide who may change what (members edit, delete and pin; owners and admins approve, turn memory on and
   forget all; viewers read). These only ask. Before the migration is applied the reads come back empty and memory shows
   as off. */

const gone = (e: { code?: string } | null) => !!e && ["PGRST202", "PGRST205", "42883", "42P01", "42703", "404"].includes(String(e.code));
const fail = (e: { message?: string; code?: string } | null): ApiError => ({ code: e?.code ?? "db_error", message: (e?.message ?? "Something went wrong.").replace(/^.*?:\s/, "") });
async function rows<T>(q: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) { if (gone(error)) return []; throw fail(error); }
  return (data ?? []) as T[];
}
async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw fail(error);
  return data;
}

/** The workspace's memory: settings, every memory (the history too), briefs, proposals and open conflicts. */
export async function loadAgentMemory(ws: string): Promise<AgentMemory> {
  const db = supabase();
  const [settings, items, briefs, proposals, conflicts] = await Promise.all([
    rows<SettingsRow>(db.from("agent_memory_settings").select("enabled, suggest, allow_last4, cap").eq("workspace_id", ws)),
    rows<MemoryRow>(db.from("agent_memories").select(MEMORY_COLS).eq("workspace_id", ws).neq("status", "rejected").order("updated_at", { ascending: false }).limit(2000)),
    rows<BriefRow>(db.from("agent_memory_briefs").select("scope_kind, scope_id, body, updated_at, updated_by").eq("workspace_id", ws)),
    rows<ProposalRow>(db.from("agent_memory_proposals").select("id, scope_kind, scope_id, line, why, source_kind, source_ref, created_at").eq("workspace_id", ws).order("created_at")),
    rows<ConflictRow>(db.from("agent_memory_conflicts").select("id, memory_id, record, memory_value, record_value, found_at, resolved_at").eq("workspace_id", ws).is("resolved_at", null)),
  ]);
  return memoryOf({ settings: settings[0] ?? null, items, briefs, proposals, conflicts });
}

export const memorySettings = (ws: string, o: { enabled?: boolean; suggest?: boolean; allowLast4?: boolean }) =>
  call("agent_memory_settings_set", { ws, p_enabled: o.enabled ?? null, p_suggest: o.suggest ?? null, p_allow_last4: o.allowLast4 ?? null });
export const memoryReview = (id: string, approve: boolean) => call("agent_memory_review", { p_id: id, p_approve: approve });
export const memoryEdit = (id: string, en: string, zh: string) => call("agent_memory_edit", { p_id: id, p_en: en, p_zh: zh });
export const memoryDelete = (id: string) => call("agent_memory_delete", { p_id: id });
export const memoryPin = (id: string, on: boolean) => call("agent_memory_pin", { p_id: id, p_on: on });
export const memoryForgetAll = (ws: string, briefs = false) => call("agent_memory_forget_all", { ws, p_briefs: briefs });
export const briefSet = (ws: string, scope: Scope, body: string) => call("agent_memory_brief_set", { ws, p_kind: scope.kind, p_scope: scope.id ?? "", p_body: body });
export const proposalReview = (id: string, approve: boolean) => call("agent_memory_proposal_review", { p_id: id, p_approve: approve });
export const conflictSettle = (id: string, how: "record" | "delete" | "dismiss") => call("agent_memory_conflict_settle", { p_id: id, p_how: how });
