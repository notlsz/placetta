// Everything the worker reads or writes, behind one interface: Supabase in production, memory in tests.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loginMatches } from "../../../supabase/functions/file/destinations.ts";
import type { CardDetails, CardOutcome, FeeDecision } from "./card.ts";
import { type InboxMail, type MailWait, pickVerification, type Verification } from "../../../supabase/functions/_shared/agent_inbox.ts";
import type { Draft } from "./teach.ts";
import type { StatusJob, StatusResult, StatusStore } from "./status.ts";
import type { Filing, LogEntry, Login, Skill } from "./types.ts";
import { policyOf, STRICT, type RecordingPolicy } from "./privacy.ts";

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
  /** What this run may record of a person, and whether the workspace is synthetic (privacy.ts,
   *  20261105090600_privacy_recording_age.sql). Without it, or when it fails, the run takes the strict side. */
  recordingPolicy?(f: Filing): Promise<RecordingPolicy>;
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
  /** The agency's fee (card.ts; the spend function's filer actions, with this run's token): may Odelia pay it, and up to
   *  how much (no card is made); the single-use card itself, made now, in memory only; and how it ended (used: frozen
   *  and the receipt attached; unused: canceled and refunded; unsure: frozen, and the team checks with the agency). */
  feeAuthority?(f: Filing, pageCents: number | null): Promise<FeeDecision>;
  card?(f: Filing, pageCents: number | null): Promise<CardDetails | null>;
  cardDone?(f: Filing, outcome: CardOutcome, o?: { receipt?: string | null; cents?: number | null; confirmation?: string | null }): Promise<void>;
  /** "Odelia gets the login" (20261105090000_agent_accounts.sql, account.ts): start making the business's account on a
   *  site (refused with "account_authority" unless the business's agent authority covers it), save its login in the
   *  vault (pending until verified), accept a terms page (refused with "terms_not_covered"), say where it stands, and
   *  mark the login saved once the agency verified it. The password goes in once, to saveLogin, and nowhere else. */
  accountBegin?(f: Filing, host: string, tenant: string | undefined, agency: string): Promise<AccountSetup>;
  saveLogin?(f: Filing, setup: string, url: string, username: string, password: string): Promise<string>;
  acceptTerms?(f: Filing, setup: string, url: string, heading: string, label: string): Promise<void>;
  accountState?(f: Filing, setup: string, state: "creating" | "awaiting_email" | "awaiting_code" | "handed_back" | "failed", note?: string): Promise<void>;
  accountSaved?(f: Filing, setup: string): Promise<void>;
  /** The business's inbox at Placetta: wait (up to timeoutMs) for the agency's message, by its sender or a link to its
   *  site, after w.since; the verification it gives (a link on the portal's hosts, or a code) is marked used. */
  waitForMail?(f: Filing, w: MailWait, o: { timeoutMs: number; pollMs: number; stop?: () => boolean }): Promise<Verification | null>;
}
export type HumanCheck = { id: string; escalate_at: string };
export type AccountSetup = { id: string; email: string; login: string | null; state: string };

/** Polls an inbox reader until a message answers the wait (pickVerification), the time is up, or stop() says so. */
export async function waitForMail(read: (since: string) => Promise<InboxMail[]>, used: (id: InboxMail["id"]) => Promise<void>, w: MailWait,
  o: { timeoutMs: number; pollMs: number; stop?: () => boolean }): Promise<Verification | null> {
  const end = Date.now() + o.timeoutMs;
  for (;;) {
    const hit = pickVerification(await read(w.since).catch(() => []), w);
    if (hit) { await used(hit.mail.id).catch(() => undefined); return hit; }
    if (Date.now() >= end || o.stop?.()) return null;
    await new Promise((r) => setTimeout(r, Math.max(10, Math.min(o.pollMs, end - Date.now()))));
  }
}

/** The worker's database access, through the functions in 20261022120000_filer_least_privilege.sql only: no table is
 *  read or written directly, so the same code runs on the filer's own role key (FILER_DB_KEY, which has no table grants
 *  and bypasses no row-level security) or, until that key is made, the service role. Files go through Storage, which
 *  checks the role's storage policies. */
export class SupabaseStore implements Store, StatusStore {
  private base: SupabaseClient;
  /** The client for the run in progress: the same key, plus the run's token header for its one filing. */
  private runDb: SupabaseClient | null = null;
  private make: (headers: Record<string, string>) => SupabaseClient;
  private url: string; private key: string;
  /** The run's own token, for the spend function's filer actions (the card for this one filing). Memory only. */
  private token: string | null = null;
  /** The spend function's address and fetch (tests swap in a fake). */
  fetcher: typeof fetch = (...a) => fetch(...a);
  constructor(url: string, key: string, client?: SupabaseClient, make?: (headers: Record<string, string>) => SupabaseClient) {
    this.url = url.replace(/\/+$/, ""); this.key = key;
    this.make = make ?? ((headers) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers } }));
    this.base = client ?? this.make({});
  }
  private get db(): SupabaseClient { return this.runDb ?? this.base; }
  async begin(f: Filing) {
    this.runDb = null; this.token = null;
    // an hour, the most the database gives: a run may wait on the team for a human check, then on the owner
    const { data, error } = await this.base.rpc("filer_begin_run", { p_filing: f.id, p_minutes: 60 });
    if (error) {
      // a database without the run tokens yet keeps working on the filer's role alone, and says so
      if (error.code === "PGRST202") { console.warn("filer_begin_run is missing: apply 20261022190000_agent_security.sql so each run gets its own token"); return; }
      throw new Error(`run token failed: ${error.message}`);
    }
    if (typeof data !== "string" || data.length < 32) throw new Error("run token failed: no token");
    this.runDb = this.make({ "x-filer-run": data });
    this.token = data;
  }
  async end() {
    const run = this.runDb;
    this.runDb = null; this.token = null;
    if (run) await run.rpc("filer_end_run", {});
  }
  /** The spend function, as this run: its token names the one filing it may pay for. Errors say only the status. */
  private async spend(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.token) throw new Error("no run token");
    const res = await this.fetcher(`${this.url}/functions/v1/spend`, {
      method: "POST", signal: AbortSignal.timeout(30_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key}`, apikey: this.key, "x-filer-run": this.token },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) throw new Error(`spend ${res?.status ?? "unreachable"}`);
    return await res.json() as Record<string, unknown>;
  }
  async feeAuthority(f: Filing, pageCents: number | null): Promise<FeeDecision> {
    const r = await this.spend({ action: "filer_fee", filing_id: f.id, page_cents: pageCents });
    return r.authorized === true && Number(r.limit_cents) > 0 ? { ok: true, limitCents: Number(r.limit_cents) } : { ok: false, why: String(r.why ?? "not authorized").slice(0, 200) };
  }
  async card(f: Filing, pageCents: number | null): Promise<CardDetails | null> {
    const r = await this.spend({ action: "filer_card", filing_id: f.id, page_cents: pageCents });
    return r.authorized === true && r.card && typeof r.card === "object" ? r.card as CardDetails : null;
  }
  async cardDone(f: Filing, outcome: CardOutcome, o: { receipt?: string | null; cents?: number | null; confirmation?: string | null } = {}) {
    await this.spend({ action: "filer_card_done", filing_id: f.id, outcome, receipt_path: o.receipt ?? null, receipt_cents: o.cents ?? null, confirmation: o.confirmation ?? null });
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
  async recordingPolicy(f: Filing) {
    const { data, error } = await this.db.rpc("filer_recording_policy", { p_filing: f.id });
    if (error) {
      console.warn(`filer: recording policy unavailable (${error.code ?? "error"}): nothing that records a person runs this time`);
      return { ...STRICT };
    }
    return policyOf(data);
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
  async accountBegin(f: Filing, host: string, tenant: string | undefined, agency: string) {
    const rows = await this.call<{ setup_id: string; email: string; login_id: string | null; state: string }[] | null>("filer_account_begin",
      { p_filing: f.id, p_host: host, p_tenant: tenant ?? null, p_agency: agency }, "account begin");
    const r = (rows ?? [])[0];
    if (!r) throw new Error("account begin failed: no row");
    return { id: r.setup_id, email: r.email, login: r.login_id, state: r.state };
  }
  async saveLogin(f: Filing, setup: string, url: string, username: string, password: string) {
    // never through call(): its error text would carry the database's message, and nothing here may echo the arguments
    const { data, error } = await this.db.rpc("filer_save_login", { p_filing: f.id, p_setup: setup, p_url: url, p_username: username, p_password: password });
    if (error || typeof data !== "string") throw new Error(`login save failed${error?.code ? ` (${error.code})` : ""}`);
    return data;
  }
  async acceptTerms(f: Filing, setup: string, url: string, heading: string, label: string) {
    await this.call("filer_account_terms", { p_filing: f.id, p_setup: setup, p_url: url, p_heading: heading.slice(0, 200), p_label: label.slice(0, 300) }, "terms");
  }
  async accountState(f: Filing, setup: string, state: string, note?: string) {
    await this.call("filer_account_state", { p_filing: f.id, p_setup: setup, p_state: state, p_note: note?.slice(0, 500) ?? null }, "account state");
  }
  async accountSaved(f: Filing, setup: string) {
    await this.call("filer_account_saved", { p_filing: f.id, p_setup: setup }, "account saved");
  }
  async waitForMail(f: Filing, w: MailWait, o: { timeoutMs: number; pollMs: number; stop?: () => boolean }) {
    const read = async (since: string) => (await this.call<InboxMail[] | null>("filer_inbox_mail", { p_filing: f.id, p_since: since }, "inbox")) ?? [];
    return await waitForMail(read, async (id) => { await this.call("filer_inbox_used", { p_filing: f.id, p_id: id }, "inbox used"); }, w, o);
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
