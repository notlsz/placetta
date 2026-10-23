// Agent memory for agent-run (src/odeliaMemory/server.ts): the database side. Every read and write is filtered to the
// run's own workspace; the service role writes only suggestions (status suggested), what the person asked to remember
// in the app (approved, with them as its author), merges and the history of a superseded fact. Approving a suggestion,
// editing, deleting and turning memory on happen only in the app, through the database's own functions, which check the
// person's role. Before migration 20261022211905_agent_memory is applied every read comes back empty and memory is off.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
// @ts-types="./agent.d.ts"
import { MEMORY_COLS, MEMORY_COLS_V2, type MemoryDb, type PastRun } from "./agent.js";

const gone = (e: { code?: string } | null) => !!e && ["PGRST202", "PGRST205", "42883", "42P01", "42703"].includes(String(e.code));
const rows = async <T>(q: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>, what: string): Promise<T[]> => {
  const { data, error } = await q;
  if (error) { if (!gone(error)) console.error("memory", what, error.code ?? "", (error.message ?? "").slice(0, 120)); return []; }
  return (data ?? []) as T[];
};
const check = (what: string) => ({ error }: { error: { code?: string; message?: string } | null }) => { if (error && !gone(error)) console.error("memory", what, error.code ?? "", (error.message ?? "").slice(0, 120)); };

export function memoryDb(admin: SupabaseClient, ws: string): MemoryDb {
  return {
    async settings() {
      const { data, error } = await admin.from("agent_memory_settings").select("enabled, suggest, allow_last4, cap").eq("workspace_id", ws).maybeSingle();
      if (error) { check("settings")({ error }); return null; }
      return data as { enabled: boolean; suggest: boolean; allow_last4: boolean; cap: number } | null;
    },
    // with the record link, the re-check and who reads it (20261031151700); without that migration, the columns before it
    async items() {
      const q = (cols: string) => admin.from("agent_memories").select(cols).eq("workspace_id", ws).in("status", ["suggested", "approved"]).order("updated_at", { ascending: false }).limit(1000);
      const { data, error } = await q(MEMORY_COLS_V2);
      if (!error) return (data ?? []) as never[];
      if (String(error.code) !== "42703") { check("items")({ error }); return []; }
      return rows(q(MEMORY_COLS), "items");
    },
    async person(userId) {
      const { data, error } = await admin.from("agent_memory_person").select("reference_memories, reference_chats").eq("workspace_id", ws).eq("user_id", userId).maybeSingle();
      if (error) { check("person")({ error }); return null; }
      return data as { reference_memories: boolean; reference_chats: boolean } | null;
    },
    briefs: () => rows(admin.from("agent_memory_briefs").select("scope_kind, scope_id, body, updated_at, updated_by").eq("workspace_id", ws), "briefs"),
    proposals: () => rows(admin.from("agent_memory_proposals").select("id, scope_kind, scope_id, line, why, source_kind, source_ref, created_at").eq("workspace_id", ws).order("created_at").limit(200), "proposals"),
    conflicts: () => rows(admin.from("agent_memory_conflicts").select("id, memory_id, record, memory_value, record_value, found_at, resolved_at").eq("workspace_id", ws).is("resolved_at", null), "conflicts"),
    async insert(list) { if (list.length) await admin.from("agent_memories").insert(list.map((r) => ({ ...r, workspace_id: ws }))).then(check("insert")); },
    async touch(id, seen, lastSeen) { await admin.from("agent_memories").update({ seen: Math.max(1, seen), last_seen: lastSeen, updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", id).then(check("touch")); },
    async remove(ids) { if (ids.length) await admin.from("agent_memories").delete().eq("workspace_id", ws).in("id", ids).then(check("remove")); },
    async close(id, validTo, by) { await admin.from("agent_memories").update({ status: "superseded", valid_to: validTo, superseded_by: by, updated_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", id).then(check("close")); },
    async propose(list) { if (list.length) await admin.from("agent_memory_proposals").insert(list.map((r) => ({ ...r, workspace_id: ws }))).then(check("propose")); },
    async conflict(list) { if (list.length) await admin.from("agent_memory_conflicts").upsert(list.map((r) => ({ ...r, workspace_id: ws })), { onConflict: "memory_id,record_value", ignoreDuplicates: true }).then(check("conflict")); },
  };
}

/** The asker's own past conversations in this workspace, newest first, for memory_recall (src/odeliaMemory/retrieve.ts
 *  searches them). Claude's conversation search covers your own chats: a teammate's chat is theirs, so a run never
 *  searches anyone else's, and without an asker (a scheduled watch) it searches none. */
export async function pastRuns(admin: SupabaseClient, ws: string, exclude?: string, me?: string | null): Promise<PastRun[]> {
  if (!me) return [];
  const list = await rows<{ id: string; prompt: string; reply: { text?: { en?: string }[] } | null; created_at: string }>(
    admin.from("agent_runs").select("id, prompt, reply, created_at").eq("workspace_id", ws).eq("created_by", me).eq("kind", "task").eq("status", "done").eq("no_memory", false).order("created_at", { ascending: false }).limit(300), "past");
  return list.filter((r) => r.id !== exclude).map((r) => ({ id: r.id, prompt: r.prompt, reply: (r.reply?.text ?? []).map((t) => t?.en ?? "").join(" ").slice(0, 2000), at: r.created_at }));
}
