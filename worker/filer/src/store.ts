// Everything the worker reads or writes, behind one interface: Supabase in production, memory in tests.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loginMatches } from "../../../supabase/functions/file/destinations.ts";
import type { Filing, LogEntry, Login, Skill } from "./types.ts";

export interface Store {
  claim(): Promise<Filing | null>;
  reload(id: string): Promise<Filing>;
  /** Append to the log, patch agent columns, write the audit row (actor agent). */
  step(f: Filing, entry: LogEntry | null, patch?: Record<string, unknown>): Promise<Filing>;
  /** The saved login for this portal host (and, on a host many agencies share, this agency's path); the opening is
   *  audited before the password is read. */
  login(f: Filing, host: string, tenant?: string): Promise<Login | null>;
  skill(key: string): Promise<Skill | null>;
  saveSkill(s: Skill): Promise<void>;
  skillFailed(key: string): Promise<{ disabled: boolean }>;
  selfFiled(official: string): Promise<number>;
  download(path: string): Promise<Uint8Array>;
  saveDoc(f: Filing, name: string, bytes: Uint8Array, mime: string): Promise<string | null>;
  /** A screenshot of a page Placetta filled, for the customer's live view and replay: stored with the workspace's files,
   *  readable by its members, not listed in Documents. */
  saveProof(f: Filing, name: string, bytes: Uint8Array, mime: string): Promise<string | null>;
  teamTask(f: Filing | null, kind: string, title: string, detail?: unknown): Promise<void>;
  notify(f: Filing, title: { en: string; zh: string }, body: { en: string; zh: string }): Promise<void>;
}

/** The worker's database access, through the functions in 20261022120000_filer_least_privilege.sql only: no table is
 *  read or written directly, so the same code runs on the filer's own role key (FILER_DB_KEY, which has no table grants
 *  and bypasses no row-level security) or, until that key is made, the service role. Files go through Storage, which
 *  checks the role's storage policies. */
export class SupabaseStore implements Store {
  private db: SupabaseClient;
  constructor(url: string, key: string, client?: SupabaseClient) {
    this.db = client ?? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  private async call<T>(fn: string, args: Record<string, unknown>, what: string): Promise<T> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw new Error(`${what} failed: ${error.message}`);
    return data as T;
  }
  async claim() {
    const data = await this.call<Filing[] | null>("claim_agent_filing", {}, "claim");
    return (data ?? [])[0] ?? null;
  }
  async takeHeld(id: string) {
    return (await this.call<boolean>("take_held_filing", { p_id: id }, "take")) === true;
  }
  async reload(id: string) {
    const rows = await this.call<Filing[] | null>("filer_filing", { p_id: id }, "reload");
    const f = (rows ?? [])[0];
    if (!f) throw new Error("reload failed: not a filing the agent was given");
    return f;
  }
  async step(f: Filing, entry: LogEntry | null, patch: Record<string, unknown> = {}) {
    return await this.call<Filing>("filing_agent_step", { p_id: f.id, p_entry: entry, p_patch: patch, p_audit: true }, "step");
  }
  async login(f: Filing, host: string, tenant?: string) {
    const rows = await this.call<{ id: string; agency: string; url: string | null; username: string }[] | null>("filer_logins", { p_filing: f.id }, "logins lookup");
    // The same host and, on a host many agencies share (Accela, BTExpress), the same agency: Dallas's login never opens Fort Worth.
    const row = (rows ?? []).find((r) => loginMatches(r.url as string, { portal: host, tenant }));
    if (!row) return null;
    // One call, one transaction: the audit entry is written first, then the opening time, then the password is read.
    // If the audit entry can't be written, the call fails and no password comes back.
    const { data, error } = await this.db.rpc("filer_open_login", { p_filing: f.id, p_login: row.id });
    const got = (data as { username: string; password: string }[] | null)?.[0];
    if (error || !got || typeof got.password !== "string") throw new Error("saved login unreadable");
    return { username: String(got.username), password: got.password, host };
  }
  async skill(key: string) {
    const rows = await this.call<Skill[] | null>("filer_skill", { p_key: key }, "skill lookup");
    return (rows ?? [])[0] ?? null;
  }
  async saveSkill(s: Skill) {
    await this.call("filer_save_skill", { p_key: s.key, p_name: s.name, p_body: s.body, p_uses: s.uses,
      p_last_seconds: s.last_seconds, p_best_seconds: s.best_seconds }, "skill save");
  }
  async skillFailed(key: string) {
    return { disabled: (await this.call<boolean>("filer_skill_failed", { p_key: key }, "skill update")) === true };
  }
  async selfFiled(official: string) {
    return (await this.call<number | null>("filer_self_filed", { p_official: official }, "count")) ?? 0;
  }
  async download(path: string) {
    const { data, error } = await this.db.storage.from("documents").download(path);
    if (error || !data) throw new Error("download failed");
    return new Uint8Array(await data.arrayBuffer());
  }
  async saveDoc(f: Filing, name: string, bytes: Uint8Array, mime: string) {
    const path = `${f.workspace_id}/receipts/${f.id}-${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}`;
    const up = await this.db.storage.from("documents").upload(path, bytes, { contentType: mime, upsert: false });
    if (up.error) return null;
    const { error } = await this.db.rpc("filer_save_doc", { p_filing: f.id, p_name: name, p_path: path, p_size: bytes.length, p_mime: mime });
    if (error) { await this.db.storage.from("documents").remove([path]); return null; }
    return path;
  }
  async saveProof(f: Filing, name: string, bytes: Uint8Array, mime: string) {
    const path = `${f.workspace_id}/proof/${f.id}/${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}`;
    const up = await this.db.storage.from("documents").upload(path, bytes, { contentType: mime, upsert: false });
    return up.error ? null : path;
  }
  async teamTask(f: Filing | null, kind: string, title: string, detail?: unknown) {
    await this.db.rpc("filer_team_task", { p_filing: f?.id ?? null, p_kind: kind, p_title: title, p_detail: detail ?? null,
      p_dedupe: `${kind}:${f?.id ?? title}:${f?.attempts ?? 0}` });
  }
  async notify(f: Filing, title: { en: string; zh: string }, body: { en: string; zh: string }) {
    await this.db.rpc("filer_notify", { p_filing: f.id, p_title: title, p_body: body, p_dedupe: `agent:${f.id}:${f.agent_state}:${f.attempts}` });
  }
}

/** The key the worker signs in with: the filer's own role key when it's set, otherwise the service role key, with a
 *  warning, so a deploy before the key exists keeps working (docs/soc2/runbooks/filer-least-privilege.md). */
export function dbKey(env: Record<string, string | undefined>, warn: (m: string) => void = console.warn): string {
  if (env.FILER_DB_KEY) return env.FILER_DB_KEY;
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    warn("FILER_DB_KEY is not set: using the service role key, which bypasses row-level security. Make the filer's own key (docs/soc2/runbooks/filer-least-privilege.md).");
    return env.SUPABASE_SERVICE_ROLE_KEY;
  }
  throw new Error("set FILER_DB_KEY (or SUPABASE_SERVICE_ROLE_KEY until it exists)");
}
