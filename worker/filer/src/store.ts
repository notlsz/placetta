// Everything the worker reads or writes, behind one interface: Supabase in production, memory in tests.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Filing, LogEntry, Login, Skill } from "./types.ts";

export interface Store {
  claim(): Promise<Filing | null>;
  reload(id: string): Promise<Filing>;
  /** Append to the log, patch agent columns, write the audit row (actor agent). */
  step(f: Filing, entry: LogEntry | null, patch?: Record<string, unknown>): Promise<Filing>;
  /** The saved login for this portal host; the opening is audited. */
  login(f: Filing, host: string): Promise<Login | null>;
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

const COLS = "id, workspace_id, app_id, title, status, payload, channel, agent_state, agent_log, handoff_url, submit_clicked_at, attempts, confirmation_number";
const hostOf = (u: string | null) => { try { return u ? new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.toLowerCase() : ""; } catch { return ""; } };

export class SupabaseStore implements Store {
  private db: SupabaseClient;
  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  async claim() {
    const { data, error } = await this.db.rpc("claim_agent_filing");
    if (error) throw new Error(`claim failed: ${error.message}`);
    return ((data ?? []) as Filing[])[0] ?? null;
  }
  async takeHeld(id: string) {
    const { data, error } = await this.db.rpc("take_held_filing", { p_id: id });
    if (error) throw new Error(`take failed: ${error.message}`);
    return data === true;
  }
  async reload(id: string) {
    const { data, error } = await this.db.from("filings").select(COLS).eq("id", id).single();
    if (error) throw new Error(`reload failed: ${error.message}`);
    return data as unknown as Filing;
  }
  async step(f: Filing, entry: LogEntry | null, patch: Record<string, unknown> = {}) {
    const { data, error } = await this.db.rpc("filing_agent_step", { p_id: f.id, p_entry: entry, p_patch: patch, p_audit: true });
    if (error) throw new Error(`step failed: ${error.message}`);
    return data as unknown as Filing;
  }
  async login(f: Filing, host: string) {
    const { data, error } = await this.db.from("agency_logins").select("id, agency, url, username, secret_id").eq("workspace_id", f.workspace_id);
    if (error) throw new Error(`logins lookup failed: ${error.message}`);
    const row = (data ?? []).find((r) => hostOf(r.url as string) === host);
    if (!row) return null;
    const { data: pw, error: e2 } = await this.db.rpc("vault_get", { p_id: row.secret_id });
    if (e2 || typeof pw !== "string") throw new Error("saved login unreadable");
    await this.db.from("agency_logins").update({ last_opened_at: new Date().toISOString(), last_opened_by: null }).eq("id", row.id);
    await this.db.from("audit_log").insert({ workspace_id: f.workspace_id, actor: "agent", actor_id: null,
      action: { en: `Placetta opened the saved login for ${row.agency}`, zh: `快哉打开了 ${row.agency} 的已保存登录` }, object: f.title });
    return { username: String(row.username), password: pw, host };
  }
  async skill(key: string) {
    const { data } = await this.db.from("agent_skills").select("*").is("workspace_id", null).eq("key", key).maybeSingle();
    return (data as Skill | null) ?? null;
  }
  async saveSkill(s: Skill) {
    const row = { workspace_id: null, key: s.key, kind: "portal", name: s.name, description: `Recorded from a submitted filing`, body: s.body, source: "agent",
      enabled: true, uses: s.uses, fails_in_a_row: 0, last_seconds: s.last_seconds, best_seconds: s.best_seconds, updated_at: new Date().toISOString() };
    const old = await this.skill(s.key);
    const { error } = old ? await this.db.from("agent_skills").update(row).eq("id", old.id!) : await this.db.from("agent_skills").insert(row);
    if (error) throw new Error(`skill save failed: ${error.message}`);
  }
  async skillFailed(key: string) {
    const s = await this.skill(key);
    if (!s) return { disabled: false };
    const n = s.fails_in_a_row + 1, disabled = n >= 3;
    await this.db.from("agent_skills").update({ fails_in_a_row: n, enabled: !disabled }).eq("id", s.id!);
    return { disabled };
  }
  async selfFiled(official: string) {
    const { count } = await this.db.from("filings").select("id", { count: "exact", head: true })
      .eq("payload->>official", official).in("channel", ["email", "fax", "mail", "portal"]).in("status", ["submitted", "accepted"]);
    return count ?? 0;
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
    const { error } = await this.db.from("documents").insert({ workspace_id: f.workspace_id, app_id: f.app_id, filing_id: f.id, name, path, size: bytes.length, mime, source: "agent", uploaded_by: null });
    if (error) { await this.db.storage.from("documents").remove([path]); return null; }
    return path;
  }
  async saveProof(f: Filing, name: string, bytes: Uint8Array, mime: string) {
    const path = `${f.workspace_id}/proof/${f.id}/${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}`;
    const up = await this.db.storage.from("documents").upload(path, bytes, { contentType: mime, upsert: false });
    return up.error ? null : path;
  }
  async teamTask(f: Filing | null, kind: string, title: string, detail?: unknown) {
    await this.db.from("team_tasks").upsert({ kind, filing_id: f?.id ?? null, workspace_id: f?.workspace_id ?? null, title, detail: detail ?? null,
      dedupe: `${kind}:${f?.id ?? title}:${f?.attempts ?? 0}` }, { onConflict: "dedupe", ignoreDuplicates: true });
  }
  async notify(f: Filing, title: { en: string; zh: string }, body: { en: string; zh: string }) {
    await this.db.from("updates").upsert({ workspace_id: f.workspace_id, kind: "filing", app_id: f.app_id, title, body, dedupe: `agent:${f.id}:${f.agent_state}:${f.attempts}` },
      { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
  }
}
