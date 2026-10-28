// Everything the worker reads or writes, behind one interface: Supabase in production, memory in tests.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loginMatches } from "../../../supabase/functions/file/destinations.ts";
import type { Draft } from "./teach.ts";
import type { StatusJob, StatusResult, StatusStore } from "./status.ts";
import type { Filing, LogEntry, Login, Skill } from "./types.ts";

/** A portal's taught playbook (teach.ts), shared by every workspace: structure only. "draft" runs only in assist mode
 *  (Odelia fills, a person presses submit); "approved" runs like any playbook. */
export type Taught = { id: string; status: "draft" | "approved"; body: Draft; runs: number; successes: number };

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
  /** A run starts on this filing: the database gives it a token for this filing alone, for at most an hour, which every
   *  call of the run then carries (20261022190000_agent_security.sql). */
  begin?(f: Filing): Promise<void>;
  /** The run is over: its token stops working. */
  end?(): Promise<void>;
  /** Teach mode (20261030174100_teach_mode.sql): the portal's taught playbook, a new draft from a recorded run (the
   *  database refuses one carrying the teaching customer's values), and each run's result (three failures in a row,
   *  or a success rate under 60% after five runs, sends an approved one back to review; drift goes to the Quality tab). */
  taught?(host: string, official: string): Promise<Taught | null>;
  saveTaught?(f: Filing, d: Draft): Promise<{ id: string; status: string } | null>;
  taughtResult?(id: string, f: Filing, ok: boolean, drift?: string[]): Promise<string | null>;
  /** The worker is alive (20261102090000_filer_heartbeat.sql): the app shows online filing as live while this is fresh,
   *  and the file function queues portal filings only then. info carries counts and versions, never a filing. */
  heartbeat?(info: Record<string, unknown>): Promise<void>;
  /** The nightly re-check's drift, for the Quality tab (qa_report through filer_probe_report). */
  probeReport?(findings: unknown[]): Promise<number>;
  /** A visible CAPTCHA goes to the Placetta team first (20261102090200_human_checks.sql): a check with its team task and
   *  the time it goes to the owner if nobody opens it (now, outside the team's hours); where it stands; and its end
   *  (solved writes "Solved a human check for you" in the owner's audit trail when someone on the team opened it). */
  humanCheckOpen?(f: Filing, liveUrl: string, holdUntil: string): Promise<HumanCheck | null>;
  humanCheck?(id: string): Promise<{ state: string; opened_at: string | null } | null>;
  humanCheckClose?(id: string, state: "solved" | "to_owner" | "ended"): Promise<boolean>;
}
export type HumanCheck = { id: string; escalate_at: string };

/** The worker's database access, through the functions in 20261022120000_filer_least_privilege.sql only: no table is
 *  read or written directly, so the same code runs on the filer's own role key (FILER_DB_KEY, which has no table grants
 *  and bypasses no row-level security) or, until that key is made, the service role. Files go through Storage, which
 *  checks the role's storage policies. */
export class SupabaseStore implements Store, StatusStore {
  private base: SupabaseClient;
  /** The client for the run in progress: the same key, plus the run's token header for its one filing. */
  private runDb: SupabaseClient | null = null;
  private make: (headers: Record<string, string>) => SupabaseClient;
  constructor(url: string, key: string, client?: SupabaseClient, make?: (headers: Record<string, string>) => SupabaseClient) {
    this.make = make ?? ((headers) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers } }));
    this.base = client ?? this.make({});
  }
  private get db(): SupabaseClient { return this.runDb ?? this.base; }
  async begin(f: Filing) {
    this.runDb = null;
    // an hour, the most the database gives: a run may wait on the team for a human check, then on the owner
    const { data, error } = await this.base.rpc("filer_begin_run", { p_filing: f.id, p_minutes: 60 });
    if (error) {
      // a database without the run tokens yet keeps working on the filer's role alone, and says so
      if (error.code === "PGRST202") { console.warn("filer_begin_run is missing: apply 20261022190000_agent_security.sql so each run gets its own token"); return; }
      throw new Error(`run token failed: ${error.message}`);
    }
    if (typeof data !== "string" || data.length < 32) throw new Error("run token failed: no token");
    this.runDb = this.make({ "x-filer-run": data });
  }
  async end() {
    const run = this.runDb;
    this.runDb = null;
    if (run) await run.rpc("filer_end_run", {});
  }
  private async call<T>(fn: string, args: Record<string, unknown>, what: string): Promise<T> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw new Error(`${what} failed: ${error.message}`);
    return data as T;
  }
  async claim() {
    const { data: rows, error } = await this.base.rpc("claim_agent_filing", {});
    if (error) throw new Error(`claim failed: ${error.message}`);
    const data = rows as Filing[] | null;
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
  async taught(host: string, official: string) {
    const rows = await this.call<Taught[] | null>("filer_taught_playbook", { p_host: host, p_official: official }, "taught lookup");
    return (rows ?? [])[0] ?? null;
  }
  async saveTaught(f: Filing, d: Draft) {
    const rows = await this.call<{ id: string; status: string }[] | null>("filer_save_taught", { p_filing: f.id, p_host: d.host, p_official: d.official,
      p_name: d.name, p_body: d, p_flags: d.flags }, "taught save");
    return (rows ?? [])[0] ?? null;
  }
  async taughtResult(id: string, f: Filing, ok: boolean, drift?: string[]) {
    return await this.call<string | null>("filer_taught_result", { p_playbook: id, p_filing: f.id, p_ok: ok, p_drift: drift?.length ? drift.slice(0, 20) : null }, "taught result");
  }
  async heartbeat(info: Record<string, unknown>) {
    await this.call("filer_heartbeat", { p_info: info }, "heartbeat");
  }
  async probeReport(findings: unknown[]) {
    return (await this.call<number | null>("filer_probe_report", { p_findings: findings }, "probe report")) ?? 0;
  }
  async humanCheckOpen(f: Filing, liveUrl: string, holdUntil: string) {
    const rows = await this.call<{ check_id: string; escalates_at: string }[] | null>("filer_human_check_open", { p_filing: f.id, p_live_url: liveUrl, p_hold_until: holdUntil }, "human check");
    const r = (rows ?? [])[0];
    return r ? { id: r.check_id, escalate_at: r.escalates_at } : null;
  }
  async humanCheck(id: string) {
    const rows = await this.call<{ check_state: string; opened: string | null }[] | null>("filer_human_check", { p_check: id }, "human check lookup");
    const r = (rows ?? [])[0];
    return r ? { state: r.check_state, opened_at: r.opened } : null;
  }
  async humanCheckClose(id: string, state: "solved" | "to_owner" | "ended") {
    return (await this.call<boolean>("filer_human_check_close", { p_check: id, p_state: state }, "human check close")) === true;
  }
  // ---------------------------------------------------------------- portal status checks (status.ts)
  async claimStatus() {
    const { data, error } = await this.base.rpc("filer_claim_status_job", {});
    if (error) { if (error.code === "PGRST202") return null; throw new Error(`status claim failed: ${error.message}`); }   // before the migration: none
    return ((data as StatusJob[] | null) ?? [])[0] ?? null;
  }
  async beginStatus(j: StatusJob) {
    this.runDb = null;
    const { data, error } = await this.base.rpc("filer_status_begin", { p_job: j.job_id });
    if (error || typeof data !== "string" || data.length < 32) throw new Error(`status run token failed: ${error?.message ?? "no token"}`);
    this.runDb = this.make({ "x-filer-run": data });
  }
  async statusLogin(j: StatusJob, host: string, tenant?: string) {
    const rows = await this.call<{ id: string; url: string | null }[] | null>("filer_status_logins", { p_job: j.job_id }, "status logins lookup");
    const row = (rows ?? []).find((r) => loginMatches(r.url as string, { portal: host, tenant }));
    if (!row) return null;
    // the audit entry first, in the same call that reads the password
    const { data, error } = await this.db.rpc("filer_status_open_login", { p_job: j.job_id, p_login: row.id });
    const got = (data as { username: string; password: string }[] | null)?.[0];
    if (error || !got || typeof got.password !== "string") throw new Error("saved login unreadable");
    return { username: String(got.username), password: got.password, host };
  }
  async saveLicense(j: StatusJob, name: string, bytes: Uint8Array) {
    return await this.saveDoc({ id: j.filing_id, workspace_id: j.workspace_id } as Filing, name, bytes, "application/pdf");
  }
  async reportStatus(j: StatusJob, r: StatusResult | null, error: string | null) {
    await this.call("filer_status_report", { p_job: j.job_id, p_result: r, p_error: error }, "status report");
  }
  async endStatus(j: StatusJob) {
    const run = this.runDb;
    this.runDb = null;
    if (run) await run.rpc("filer_status_end", { p_job: j.job_id });
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
