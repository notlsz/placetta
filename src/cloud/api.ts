import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { Audit, Bi, Workspace } from "../model";
import type { Reply, Step } from "../core";
import type { HqLink, HqRow } from "../hq";

/* ------------------------------------------------------------------ *
 * Placetta's backend (Supabase): accounts, saved workspaces, private
 * documents, the filing queue the team works from, the append-only
 * audit log, billing, integrations and the agency-login vault.
 * Configured at build time with VITE_SUPABASE_URL and VITE_SUPABASE_KEY
 * (the publishable key, safe in the browser). Without them the app runs
 * the sample workspace as a demo.
 * ------------------------------------------------------------------ */

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const KEY = (import.meta.env.VITE_SUPABASE_KEY as string | undefined) ?? "";
export const cloudConfigured = !!(URL_ && KEY);
export const LEGAL_BASE = (import.meta.env.VITE_LEGAL_BASE as string | undefined) ?? "https://placetta.com";

/** The artifact preview runs the real app against a stand-in backend in the browser (src/cloud/preview.ts). */
export const PREVIEW = !!import.meta.env.VITE_PREVIEW;
let previewFetch: typeof fetch | null = null;
export async function preparePreview() { if (PREVIEW && !previewFetch) previewFetch = (await import("./preview")).previewFetch as typeof fetch; }
/** fetch, or the preview backend. */
const net: typeof fetch = (input, init) => (previewFetch ? previewFetch(input, init) : fetch(input, init));
/* Session storage that survives a browser with storage turned off (the preview frame). */
const mem = new Map<string, string>();
const store = {
  getItem: (k: string) => { try { return localStorage.getItem(k); } catch { return mem.get(k) ?? null; } },
  setItem: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { mem.set(k, v); } },
  removeItem: (k: string) => { try { localStorage.removeItem(k); } catch { mem.delete(k); } },
};

let sb: SupabaseClient | null = null;
export const supabase = () => (sb ??= createClient(URL_, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !PREVIEW, flowType: "pkce", storage: store },
  global: { fetch: net },
}));

export type ApiError = { code: string; message: string };
const err = (code: string, message: string): ApiError => ({ code, message });
const fromPg = (e: { message?: string; code?: string } | null): ApiError => err(e?.code ?? "db_error", (e?.message ?? "Something went wrong.").replace(/^.*?:\s/, ""));

export type FilingStatus = "requested" | "in_progress" | "needs_info" | "submitted" | "accepted" | "rejected" | "canceled";
export type Filing = {
  id: string; workspace_id: string; app_id: string; title: Bi; agency: Bi | null; portal_url: string | null; fee_estimate: number;
  payload: FilingPayload; status: FilingStatus; approved_at: string; requirements_checked: boolean; confirmation_number: string | null;
  fee_paid: number | null; receipt_path: string | null; note: string | null; payment_url: string | null; customer_paid_at: string | null;
  submitted_at: string | null; decided_at: string | null; updated_at: string;
  channel?: FilingChannel | null; agent_state?: AgentState | null; agent_log?: AgentLogEntry[]; handoff_url?: string | null;
  submit_clicked_at?: string | null; attempts?: number;
};
export type FilingChannel = "email" | "fax" | "mail" | "portal" | "team";
export type AgentState = "queued" | "running" | "needs_you" | "done" | "failed" | "handoff";
export type AgentLogEntry = { at?: string; en: string; zh: string; kind: string; ref?: string };
export type FilingPayload = {
  form?: Bi; fields: { label: Bi; value: string; from?: Bi }[]; checklist: { label: Bi; state: string; doc?: string }[];
  attachments: { name: string; path: string }[]; does: Bi[]; source?: { label: string; url: string };
  official?: string; pdf_path?: string;                          // the official form id and the filled (signed) PDF
  signature?: { name: string; title?: string; signed_at: string; kind: "typed" | "drawn" };
};
export type QueueRow = Filing & { business: string; approver_email: string | null; assignee_email: string | null; assigned_to: string | null };
export type Billing = {
  workspace_id: string; entry_markets: number; entry_paid_at: string | null; subscription_status: string | null;
  subscription_plan: string | null; current_period_end: string | null; comped: boolean; stripe_customer_id: string | null;
  /** Payments aren't switched on yet (no Stripe): everything is open, as the database's plan_of() says. */
  free?: boolean;
};
export type Plan = "none" | "entry" | "monthly";
export const planOf = (b: Billing | null): Plan =>
  !b ? "none" : b.free || b.comped || b.subscription_status === "active" || b.subscription_status === "trialing" ? "monthly" : b.entry_markets > 0 ? "entry" : "none";
export type DocRow = { id: string; workspace_id: string; app_id: string | null; filing_id: string | null; name: string; path: string; size: number; mime: string | null; source: string; created_at: string };
export type Integration = { id: string; kind: IntegrationKind; account: string | null; status: "connected" | "error"; error: string | null; meta: Record<string, unknown>; connected_at: string; last_used_at: string | null };
export type IntegrationKind = "gmail" | "gcal" | "gdrive" | "outlook_mail" | "outlook_cal" | "dropbox" | "quickbooks" | "slack";
export type AgencyLogin = { id: string; agency: string; url: string | null; username: string; note: string | null; created_at: string; last_opened_at: string | null };
export type Role = "owner" | "member";
export type WorkspaceRow = { id: string; name: string; state: Partial<Workspace>; authorized_at: string | null; created_at: string; role: Role };
type AuditRow = { id: number; client_id: string | null; actor: Audit["actor"] | "team"; action: Bi; object: Bi; detail: Bi | null; created_at: string };

/* ------------------------------ session ------------------------------ */

export const getSession = async () => (await supabase().auth.getSession()).data.session;
export const onAuth = (fn: (s: Session | null, event: string) => void) => supabase().auth.onAuthStateChange((e, s) => fn(s, e)).data.subscription;
export async function sendSignIn(email: string) {
  const { error } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
  if (error) throw err(error.status === 429 ? "rate_limited" : "auth", error.message);
}
/** Email and password: works without any email being sent once "Confirm email" is off in Supabase. */
export async function signInPassword(email: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw err(error.code === "invalid_credentials" ? "bad_login" : error.status === 429 ? "rate_limited" : "auth", error.message);
}
/** Creates the account. `confirm` is true when Supabase still wants the email confirmed before the first sign-in. */
/* ------------------------------ settings PIN ------------------------------ */
/** A 6-digit PIN that locks sensitive settings. Kept hashed on the server; 5 wrong tries lock it for 15 minutes. */
export type PinStatus = { on: boolean; unlocked_until: string | null; locked_until: string | null };
async function pinRpc(fn: string, args: Record<string, unknown> = {}): Promise<PinStatus> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) {
    const m = error.message ?? "", h = (error as { hint?: string }).hint ?? "";
    if (/pin_wrong/.test(m)) throw err("pin_wrong", h);
    if (/pin_locked/.test(m)) throw err("pin_locked", h);
    if (/pin_format/.test(m)) throw err("pin_format", m);
    throw fromPg(error);
  }
  // a wrong PIN comes back as data, not an error, so the server keeps its count of tries
  const d = data as PinStatus & { error?: string; hint?: string };
  if (d?.error === "pin_wrong" || d?.error === "pin_locked") throw err(d.error, d.hint ?? "");
  return d;
}
export const pinStatus = () => pinRpc("pin_status");
export const pinSet = (pin: string, current?: string) => pinRpc("pin_set", { p_pin: pin, p_current: current ?? null });
export const pinUnlock = (pin: string) => pinRpc("pin_unlock", { p_pin: pin });
export const pinClear = (pin: string) => pinRpc("pin_clear", { p_pin: pin });
export const pinLock = () => pinRpc("pin_lock");

/** Set a new password for the signed-in person. Works for accounts made with a code too (it adds a password). */
export async function changePassword(password: string) {
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw err(error.code === "weak_password" ? "weak" : error.code === "same_password" ? "same" : error.code === "reauthentication_needed" ? "reauth" : error.status === 429 ? "rate_limited" : "auth", error.message);
}
export async function signUpPassword(email: string, password: string): Promise<{ confirm: boolean }> {
  const { data, error } = await supabase().auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw err(error.code === "user_already_exists" ? "exists" : error.code === "weak_password" ? "weak" : error.status === 429 ? "rate_limited" : "auth", error.message);
  // an existing email comes back with no identities and no session (Supabase hides that the account exists)
  if (!data.session && data.user && (data.user.identities ?? []).length === 0) throw err("exists", "An account with this email already exists.");
  return { confirm: !data.session };
}
export async function verifyCode(email: string, token: string) {
  const { error } = await supabase().auth.verifyOtp({ email, token, type: "email" });
  if (error) throw err("auth", error.message);
}
/** Phone: a one-time code by text message. Needs an SMS provider (e.g. Twilio) set in Supabase, Authentication, Phone. */
export async function sendPhoneCode(phone: string) {
  const { error } = await supabase().auth.signInWithOtp({ phone, options: { shouldCreateUser: true, channel: "sms" } });
  if (error) {
    const m = error.message ?? "";
    throw err(error.status === 429 ? "rate_limited" : /provider|disabled|not enabled|unsupported/i.test(m) ? "phone_off" : /invalid|phone/i.test(m) ? "bad_phone" : "auth", m);
  }
}
export async function verifyPhoneCode(phone: string, token: string) {
  const { error } = await supabase().auth.verifyOtp({ phone, token, type: "sms" });
  if (error) throw err("auth", error.message);
}
/** Emails a link to set a new password. The link opens the app with a recovery session (the PASSWORD_RECOVERY event). */
export async function sendPasswordReset(email: string) {
  const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) throw err(error.status === 429 ? "rate_limited" : "auth", error.message);
}
/** Sign out here, or on every device (revokes every session's refresh token). */
export const signOut = (everywhere = false) => supabase().auth.signOut({ scope: everywhere ? "global" : "local" });

export type Me = { id: string; email: string; staff: boolean; staff_email: boolean; two_step: boolean; aal: string };
export async function whoami(): Promise<Me> {
  const { data, error } = await supabase().rpc("whoami");
  if (error) throw fromPg(error);
  const d = data as Partial<Me> & { id: string; email: string | null; staff: boolean };
  // people who signed in by text message have a phone and no email
  let email = d.email ?? "";
  if (!email) { const ph = (await getSession())?.user.phone; if (ph) email = "+" + ph.replace(/^\+/, ""); }
  return { staff_email: d.staff, two_step: false, aal: "aal1", ...d, email };
}

/* Sign in with Google, Microsoft or a phone number. Each shows only when it's turned on in Supabase (Authentication, Providers);
   phone also needs an SMS provider there. Anything the settings don't confirm stays hidden. */
export type Provider = "google" | "azure";
export type SignInOptions = Record<Provider | "phone", boolean>;
export async function authProviders(): Promise<SignInOptions> {
  try {
    const res = await net(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY } });
    const j = await res.json() as { external?: Record<string, boolean> };
    return { google: !!j.external?.google, azure: !!j.external?.azure, phone: j.external?.phone === true };
  } catch { return { google: false, azure: false, phone: false }; }
}
/** Where accounts and data live (the Supabase project's region). */
export const REGION = { id: "us", label: { en: "United States", zh: "美国" } } as const;
export async function signInWith(provider: Provider) {
  const { error } = await supabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: location.origin + location.pathname, ...(provider === "azure" ? { scopes: "email openid profile" } : {}) },
  });
  if (error) throw err("auth", error.message);
}

/* Two-step sign-in with an authenticator app (TOTP). Once it's on, the account reaches nothing until the code is entered. */
export type TwoStep = { current: string; next: string; factorId: string | null };
export async function twoStepStatus(): Promise<TwoStep> {
  const a = supabase().auth.mfa;
  const [{ data: lvl }, { data: f }] = await Promise.all([a.getAuthenticatorAssuranceLevel(), a.listFactors()]);
  const verified = (f?.totp ?? []).find(x => x.status === "verified");
  return { current: lvl?.currentLevel ?? "aal1", next: lvl?.nextLevel ?? "aal1", factorId: verified?.id ?? null };
}
export async function twoStepEnroll(): Promise<{ id: string; qr: string; secret: string }> {
  const a = supabase().auth.mfa;
  // A setup that was started and never finished blocks a new one: clear it first.
  const { data: f } = await a.listFactors();
  for (const x of (f?.all ?? []).filter(x => x.status !== "verified")) await a.unenroll({ factorId: x.id });
  const { data, error } = await a.enroll({ factorType: "totp", friendlyName: "Authenticator " + new Date().toISOString().slice(0, 10) });
  if (error || !data) throw err("auth", error?.message ?? "Couldn't start two-step sign-in.");
  // The QR code arrives as an SVG data URI that may not be URL-encoded; encode it so every browser draws it.
  const raw = data.totp.qr_code, i = raw.indexOf(",");
  const svg = i > 0 && raw.slice(i + 1).trimStart().startsWith("<") ? raw.slice(i + 1) : null;
  const qr = svg ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) : raw;
  return { id: data.id, qr, secret: data.totp.secret };
}
export async function twoStepVerify(factorId: string, code: string) {
  const { error } = await supabase().auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw err("auth", /invalid|expired/i.test(error.message) ? "That code didn't work. Use the newest code from the app." : error.message);
}
export async function twoStepOff(factorId: string) {
  const { error } = await supabase().auth.mfa.unenroll({ factorId });
  if (error) throw err("auth", error.message);
  await supabase().auth.refreshSession();
}

/* ------------------------------ workspaces ------------------------------ */

export async function myWorkspaces(): Promise<WorkspaceRow[]> {
  const { data, error } = await supabase().rpc("my_workspaces");
  if (!error) return (data ?? []) as WorkspaceRow[];
  if (error.code !== "PGRST202") throw fromPg(error);
  // Before the teams migration: every member is an owner.
  const old = await supabase().from("workspaces").select("id, name, state, authorized_at, created_at").order("created_at");
  if (old.error) throw fromPg(old.error);
  return ((old.data ?? []) as WorkspaceRow[]).map(r => ({ ...r, role: "owner" as const }));
}
/** Join every workspace this email was invited to. Returns how many. */
export async function acceptInvites(): Promise<number> {
  const { data, error } = await supabase().rpc("accept_invites");
  if (error) { if (error.code === "PGRST202") return 0; throw fromPg(error); }
  return (data as number) ?? 0;
}
export async function createWorkspace(name: string, state: Workspace): Promise<string> {
  const { data, error } = await supabase().rpc("create_workspace", { p_name: name, p_state: strip(state), p_authorized: true });
  if (error) throw fromPg(error);
  return data as string;
}
/** What's saved: the workspace minus the audit trail (kept server side) and anything derived from filings. */
import { stripState as strip } from "../core";
export { strip };
export async function saveState(id: string, w: Workspace) {
  const { error } = await supabase().from("workspaces").update({ state: strip(w), name: w.business.en.slice(0, 120) || "Workspace" }).eq("id", id);
  if (error) throw fromPg(error);
}

/* ------------------------------ audit ------------------------------ */

export async function listAudit(ws: string): Promise<Audit[]> {
  const { data, error } = await supabase().from("audit_log").select("id, client_id, actor, action, object, detail, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(500);
  if (error) throw fromPg(error);
  return ((data ?? []) as AuditRow[]).map(r => ({
    id: r.client_id ?? "s" + r.id, at: r.created_at, actor: r.actor === "team" ? "team" : r.actor,
    action: r.action, object: r.object, detail: r.detail ?? undefined,
  })) as Audit[];
}
export async function logAudit(ws: string, uid: string, entries: Audit[]) {
  const rows = entries.filter(a => a.actor === "you" || a.actor === "agent").map(a => ({
    workspace_id: ws, client_id: a.id, actor: a.actor, actor_id: uid, action: a.action, object: a.object, detail: a.detail ?? null,
  }));
  if (!rows.length) return;
  const { error } = await supabase().from("audit_log").upsert(rows, { onConflict: "workspace_id,client_id", ignoreDuplicates: true });
  if (error) throw fromPg(error);
}

/* ------------------------------ filings ------------------------------ */

const BASE_COLS = "id, workspace_id, app_id, title, agency, portal_url, fee_estimate, payload, status, approved_at, requirements_checked, confirmation_number, fee_paid, receipt_path, note, payment_url, customer_paid_at, submitted_at, decided_at, updated_at";
const AGENT_COLS = BASE_COLS + ", channel, agent_state, agent_log, handoff_url, submit_clicked_at, attempts";
/* Until the self-filing migration is applied the agent columns don't exist (42703): fall back to the base columns. */
let agentCols = true;
const missingCol = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204";
export async function listFilings(ws: string): Promise<Filing[]> {
  const q = (cols: string) => supabase().from("filings").select(cols).eq("workspace_id", ws).order("approved_at", { ascending: false });
  let { data, error } = await q(agentCols ? AGENT_COLS : BASE_COLS);
  if (agentCols && missingCol(error)) { agentCols = false; ({ data, error } = await q(BASE_COLS)); }
  if (error) throw fromPg(error);
  return (data ?? []) as unknown as Filing[];
}
export async function requestFiling(ws: string, f: { app_id: string; title: Bi; agency?: Bi; portal_url?: string; fee_estimate: number; payload: FilingPayload }) {
  let { data, error } = await supabase().from("filings").insert({ workspace_id: ws, ...f }).select(agentCols ? AGENT_COLS : BASE_COLS).single();
  if (agentCols && missingCol(error)) {
    // the insert itself may have happened; read it back rather than inserting twice
    agentCols = false;
    ({ data, error } = await supabase().from("filings").select(BASE_COLS).eq("workspace_id", ws).eq("app_id", f.app_id).order("approved_at", { ascending: false }).limit(1).single());
  }
  if (error) throw error.code === "42501" ? err("plan_required", "Filing by the Placetta team is part of the monthly plan.") : fromPg(error);
  return data as unknown as Filing;
}
export async function cancelFiling(id: string) {
  const { error } = await supabase().from("filings").update({ status: "canceled" }).eq("id", id);
  if (error) throw fromPg(error);
}
export async function markPaid(id: string) {
  const { error } = await supabase().from("filings").update({ status: "in_progress" }).eq("id", id);
  if (error) throw fromPg(error);
}

/* ------------------------------ documents ------------------------------ */

const safeName = (n: string) => n.replace(/[^\w.\- ()一-鿿]+/g, "_").slice(-120) || "file";
export async function uploadDoc(ws: string, file: File, appId?: string): Promise<DocRow> {
  const path = `${ws}/${crypto.randomUUID()}/${safeName(file.name)}`;
  const up = await supabase().storage.from("documents").upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) throw err("upload", up.error.message);
  const { data, error } = await supabase().from("documents").insert({ workspace_id: ws, app_id: appId ?? null, name: file.name.slice(0, 200), path, size: file.size, mime: file.type || null, source: "customer" }).select("*").single();
  if (error) throw fromPg(error);
  return data as DocRow;
}
export async function listDocs(ws: string): Promise<DocRow[]> {
  const { data, error } = await supabase().from("documents").select("*").eq("workspace_id", ws).order("created_at", { ascending: false });
  if (error) throw fromPg(error);
  return (data ?? []) as DocRow[];
}
export async function downloadDoc(path: string): Promise<Blob> {
  const { data, error } = await supabase().storage.from("documents").download(path);
  if (error || !data) throw err("download", error?.message ?? "Couldn't download the file.");
  return data;
}

/* ------------------------------ agent runs ------------------------------ */

/** The agent working on the server: it carries on if the app is closed. */
export type RunRow = { id: string; kind: "task" | "watch"; prompt: string; status: "running" | "done" | "failed" | "stopped"; steps: Step[]; draft: string | null; reply: Reply | null; error: string | null; created_at: string; updated_at: string; seen_at?: string | null };
/** Start a task on the server. null when this server doesn't run the agent itself (an older deploy): the app runs it in the browser. */
export async function startRun(ws: string, o: { prompt: string; history: { role: string; content: string }[]; lang: string; deep: boolean }): Promise<string | null> {
  const { data, error } = await supabase().functions.invoke("agent-run", { body: { action: "start", workspace_id: ws, ...o } });
  if (!error) return (data as { id: string }).id;
  const ctx = (error as { context?: Response }).context;
  if (ctx?.status === 404) return null;
  let e: ApiError = err("upstream_error", "Couldn't reach Placetta. Try again.");
  try { const j = await ctx?.json(); if (j?.error?.code) e = err(j.error.code, j.error.message); } catch { /* not JSON */ }
  if (ctx?.status === 402) e = err("payment_required", e.message);
  throw e;
}
export async function pollRun(id: string): Promise<RunRow> {
  const { data, error } = await supabase().rpc("poll_agent_run", { p_id: id });
  if (error) throw fromPg(error);
  return data as RunRow;
}
export async function stopRun(id: string) {
  const { error } = await supabase().rpc("stop_agent_run", { p_id: id });
  if (error) throw fromPg(error);
}
/** The last day's tasks: one still running to follow again, or one that finished while the app was closed. */
export async function recentRuns(ws: string): Promise<RunRow[]> {
  const { data, error } = await supabase().from("agent_runs").select("id, kind, prompt, status, steps, draft, reply, error, created_at, updated_at, seen_at")
    .eq("workspace_id", ws).eq("kind", "task").gt("created_at", new Date(Date.now() - 864e5).toISOString()).order("created_at", { ascending: false }).limit(3);
  if (error) throw fromPg(error);
  return (data ?? []) as RunRow[];
}
export async function loadWorkspace(ws: string): Promise<{ name: string; state: Partial<Workspace> }> {
  const { data, error } = await supabase().from("workspaces").select("name, state").eq("id", ws).single();
  if (error) throw fromPg(error);
  return data as { name: string; state: Partial<Workspace> };
}

/* ------------------------------ updates ------------------------------ */

export type UpdateRow = { id: string; kind: "deadline" | "renewal" | "filing" | "payment" | "team"; title: Bi; body: Bi | null; app_id: string | null; created_at: string; read_at: string | null };
export async function listUpdates(ws: string): Promise<UpdateRow[]> {
  const { data, error } = await supabase().from("updates").select("id, kind, title, body, app_id, created_at, read_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(60);
  if (error) throw fromPg(error);
  return (data ?? []) as UpdateRow[];
}
export const readUpdates = (ws: string) => supabase().rpc("read_updates", { ws }).then(({ error }) => { if (error) throw fromPg(error); });

/* ------------------------------ billing ------------------------------ */

export async function getBilling(ws: string): Promise<Billing | null> {
  const [{ data, error }, settings] = await Promise.all([
    supabase().from("billing").select("workspace_id, entry_markets, entry_paid_at, subscription_status, subscription_plan, current_period_end, comped, stripe_customer_id").eq("workspace_id", ws).maybeSingle(),
    // No settings row (an older database, or the preview) means plans apply as before.
    supabase().from("app_settings").select("payments_on").maybeSingle().then(r => r, () => ({ data: null })),
  ]);
  if (error) throw fromPg(error);
  return data ? { ...(data as Billing), free: (settings.data as { payments_on?: boolean } | null)?.payments_on === false } : null;
}

/* ------------------------------ edge functions ------------------------------ */

/* Self-filing: the file function checks an approved filing and submits it by email, fax, mail or the agency's site. */
type FileView = { filing: Pick<Filing, "id" | "status" | "channel" | "agent_state" | "agent_log" | "handoff_url" | "confirmation_number" | "submit_clicked_at"> };
export const fileNow = (ws: string, filingId: string) => fn<FileView>("file", { workspace_id: ws, filing_id: filingId, action: "start" });
export const resumeFiling = (ws: string, filingId: string) => fn<FileView>("file", { workspace_id: ws, filing_id: filingId, action: "resume" });
/** The hand-signed copy of a wet-signature form, already in Documents: Placetta faxes it. */
export const signedCopy = (ws: string, filingId: string, path: string) => fn<FileView>("file", { workspace_id: ws, filing_id: filingId, action: "signed", path });
export const filingStatus = (ws: string, filingId: string) => fn<FileView>("file", { workspace_id: ws, filing_id: filingId, action: "status" });
export const teamFiling = (ws: string, filingId: string, action: "team_approve" | "take_over") => fn<FileView>("file", { workspace_id: ws, filing_id: filingId, action });
/** Upload the filled official form for a filing before it's approved, so its path can go in the frozen payload. */
export async function uploadForm(ws: string, appId: string, name: string, bytes: Blob): Promise<string> {
  const path = `${ws}/filings/${appId}-${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}`;
  const up = await supabase().storage.from("documents").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) throw err("upload_failed", "Couldn't save the filled form. Try again.");
  const { error } = await supabase().from("documents").insert({ workspace_id: ws, app_id: appId, name, path, size: bytes.size, mime: "application/pdf", source: "agent" });
  if (error) throw fromPg(error);
  return path;
}

async function fn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke(name, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let e: ApiError = err("upstream_error", "Couldn't reach Placetta. Try again.");
    try { const j = await ctx?.json(); if (j?.error?.code) e = err(j.error.code, j.error.message); } catch { /* not JSON */ }
    if (ctx?.status === 402) e = err("payment_required", e.message);
    throw e;
  }
  return data as T;
}
/* ------------------------------ team ------------------------------ */

export type Member = { user_id: string; email: string; role: Role; joined_at: string; you: boolean; two_step: boolean };
export type Invite = { id: string; email: string; role: Role; created_at: string; expires_at: string };
export type Team = { me: Role | null; members: Member[]; invites: Invite[] };
export async function teamList(ws: string): Promise<Team> {
  const { data, error } = await supabase().rpc("team_list", { ws });
  if (error) throw fromPg(error);
  return data as Team;
}
/** Records the invite and emails it. sent: "invite" (new person), "sign_in_link" (has an account) or "not_sent". */
export const invite = (ws: string, email: string, role: Role) =>
  fn<{ id: string; sent: "invite" | "sign_in_link" | "not_sent" }>("team", { action: "invite", workspace_id: ws, email, role, return_url: location.origin + location.pathname });
export const resendInvite = (ws: string, id: string) =>
  fn<{ id: string; sent: "invite" | "sign_in_link" | "not_sent" }>("team", { action: "resend", workspace_id: ws, id, return_url: location.origin + location.pathname });
async function rpcVoid(name: string, args: Record<string, unknown>) {
  const { error } = await supabase().rpc(name, args);
  if (error) throw fromPg(error);
}
export const revokeInvite = (id: string) => rpcVoid("revoke_invite", { p_id: id });
export const setRole = (ws: string, user: string, role: Role) => rpcVoid("set_member_role", { ws, p_user: user, p_role: role });
export const removeMember = (ws: string, user: string) => fn<{ removed: string }>("team", { action: "remove", workspace_id: ws, user_id: user });
/** Deletes the signed-in account: workspaces it owns alone go with it, other memberships end. Refused while one of those
   workspaces has a paid plan running (code subscription_active), and needs two-step first when it's on (mfa_required). */
export const deleteAccount = () => fn<{ deleted: true; workspaces: number }>("team", { action: "delete_account", confirm: "DELETE" });

/* ------------------------------ headquarters ------------------------------ */

/** Every franchisee that shared its stores with this account's (proven) email. [] before the migration is applied. */
export async function hqStores(): Promise<HqRow[]> {
  const { data, error } = await supabase().rpc("hq_stores");
  if (error) { if (error.code === "PGRST202" || error.code === "42883") return []; throw fromPg(error); }
  return ((data ?? []) as HqRow[]).map(r => ({ ...r, stores: Array.isArray(r.stores) ? r.stores : [] }));
}
/** The headquarters emails this workspace shares with. */
export async function hqLinks(ws: string): Promise<HqLink[]> {
  const { data, error } = await supabase().rpc("hq_links_for", { ws });
  if (error) { if (error.code === "PGRST202" || error.code === "42883") return []; throw fromPg(error); }
  return (data ?? []) as HqLink[];
}
export async function hqShare(ws: string, email: string, brand?: string): Promise<string> {
  const { data, error } = await supabase().rpc("hq_share", { ws, p_email: email, p_brand: brand?.trim() || null });
  if (error) throw fromPg(error);
  return data as string;
}
export const hqUnshare = (id: string) => rpcVoid("hq_unshare", { p_id: id });

export type LocationPrice ={ amount: number; currency: string; interval: string | null; interval_count: number | null };
export const locationPrices = (ws: string) => fn<{ location: LocationPrice | null; opening: LocationPrice | null }>("billing", { action: "prices", workspace_id: ws, return_url: location.origin + location.pathname });
export const syncLocations = (ws: string) => fn<{ synced: boolean }>("billing", { action: "sync_locations", workspace_id: ws, return_url: location.origin + location.pathname });
export const checkout = (ws: string, plan: "entry" | "starter" | "growth" | "locations", o: { markets?: number; extra_locations?: number } = {}) =>
  fn<{ url: string }>("billing", { action: "checkout", workspace_id: ws, plan, ...o, return_url: location.origin + location.pathname });
export const billingPortal = (ws: string) => fn<{ url: string }>("billing", { action: "portal", workspace_id: ws, return_url: location.origin + location.pathname });

/** The agent's model call through the server (company key, research tools, plan and usage checks). */
export const agentCall = (ws: string, request: Record<string, unknown>, o: { deep?: boolean; research?: boolean; location?: { city: string; region?: string } } = {}) =>
  fn<{ content: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; citations?: { url?: string; title?: string }[] }[]; stop_reason: string }>("agent", { workspace_id: ws, request, ...o });

export async function ttsAudio(ws: string, text: string, lang: string): Promise<ArrayBuffer | null> {
  const s = await getSession(); if (!s) return null;
  const res = await net(`${URL_}/functions/v1/tts`, { method: "POST", headers: { "content-type": "application/json", apikey: KEY, Authorization: `Bearer ${s.access_token}` }, body: JSON.stringify({ workspace_id: ws, text, lang: lang.startsWith("zh") ? "zh" : lang.startsWith("en") ? "en" : lang }) });
  if (!res.ok) return null;
  return res.arrayBuffer();
}

/* ------------------------------ integrations ------------------------------ */

export async function listIntegrations(ws: string): Promise<Integration[]> {
  const { data, error } = await supabase().from("integrations").select("id, kind, account, status, error, meta, connected_at, last_used_at").eq("workspace_id", ws);
  if (error) throw fromPg(error);
  return (data ?? []) as Integration[];
}
export const integration = <T>(ws: string, action: string, body: Record<string, unknown> = {}) => fn<T>("integrations", { workspace_id: ws, action, ...body });
export const connectUrl = (ws: string, kind: IntegrationKind) => integration<{ url: string }>(ws, "connect", { kind, return_to: location.origin + location.pathname });

/* ------------------------------ agency logins ------------------------------ */

export async function listLogins(ws: string): Promise<AgencyLogin[]> {
  const { data, error } = await supabase().from("agency_logins").select("id, agency, url, username, note, created_at, last_opened_at").eq("workspace_id", ws).order("created_at");
  if (error) throw fromPg(error);
  return (data ?? []) as AgencyLogin[];
}
export const saveLogin = (ws: string, l: { id?: string; agency: string; url?: string; username: string; password?: string; note?: string }) => fn<{ login: AgencyLogin }>("logins", { workspace_id: ws, action: "save", ...l });
export const removeLogin = (ws: string, id: string) => fn<{ ok: true }>("logins", { workspace_id: ws, action: "delete", id });
export const revealLogin = (ws: string, id: string) => fn<{ agency: string; url: string | null; username: string; password: string }>("logins", { workspace_id: ws, action: "reveal", id });

/* ------------------------------ team ------------------------------ */

export async function queue(): Promise<QueueRow[]> {
  const v3 = await supabase().rpc("filing_queue_v3");
  if (!v3.error) return (v3.data ?? []) as QueueRow[];
  const { data, error } = await supabase().rpc("filing_queue_v2");
  if (error) throw fromPg(error);
  return (data ?? []) as QueueRow[];
}
export type TeamTask = { id: string; kind: string; filing_id: string | null; workspace_id: string | null; business: string | null; title: string; detail: unknown; created_at: string };
export async function teamTasks(): Promise<TeamTask[]> {
  const { data, error } = await supabase().rpc("team_tasks_open");
  if (error) return [];   // before the migration, or not staff: show nothing rather than fail the queue
  return (data ?? []) as TeamTask[];
}
export async function finishTeamTask(id: string) {
  const { error } = await supabase().rpc("finish_team_task", { p_id: id });
  if (error) throw fromPg(error);
}
export async function updateFiling(id: string, patch: Partial<Pick<Filing, "status" | "requirements_checked" | "confirmation_number" | "fee_paid" | "receipt_path" | "note" | "payment_url">> & { assigned_to?: string | null }) {
  const { error } = await supabase().from("filings").update(patch).eq("id", id);
  if (error) throw fromPg(error);
}
export async function uploadReceipt(f: QueueRow, file: File): Promise<string> {
  const path = `${f.workspace_id}/receipts/${f.id}/${safeName(file.name)}`;
  const up = await supabase().storage.from("documents").upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (up.error) throw err("upload", up.error.message);
  const { error } = await supabase().from("documents").insert({ workspace_id: f.workspace_id, app_id: f.app_id, filing_id: f.id, name: file.name.slice(0, 200), path, size: file.size, mime: file.type || null, source: "agency" });
  if (error && !/duplicate/i.test(error.message)) throw fromPg(error);
  await updateFiling(f.id, { receipt_path: path });
  return path;
}

/* What Placetta has learned from real filings: per official form, how long the agency took and how often it bounced
   one back. The server returns a form only once 3 or more filings of it were decided. */
export async function filingStats(): Promise<import("../plan").FormStat[]> {
  const { data, error } = await supabase().rpc("filing_stats");
  if (error) return [];
  return (data ?? []) as import("../plan").FormStat[];
}
