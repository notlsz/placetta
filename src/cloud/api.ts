import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { Audit, Bi, Workspace } from "../model";

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

let sb: SupabaseClient | null = null;
export const supabase = () => (sb ??= createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } }));

export type ApiError = { code: string; message: string };
const err = (code: string, message: string): ApiError => ({ code, message });
const fromPg = (e: { message?: string; code?: string } | null): ApiError => err(e?.code ?? "db_error", (e?.message ?? "Something went wrong.").replace(/^.*?:\s/, ""));

export type FilingStatus = "requested" | "in_progress" | "needs_info" | "submitted" | "accepted" | "rejected" | "canceled";
export type Filing = {
  id: string; workspace_id: string; app_id: string; title: Bi; agency: Bi | null; portal_url: string | null; fee_estimate: number;
  payload: FilingPayload; status: FilingStatus; approved_at: string; requirements_checked: boolean; confirmation_number: string | null;
  fee_paid: number | null; receipt_path: string | null; note: string | null; payment_url: string | null; customer_paid_at: string | null;
  submitted_at: string | null; decided_at: string | null; updated_at: string;
};
export type FilingPayload = {
  form?: Bi; fields: { label: Bi; value: string; from?: Bi }[]; checklist: { label: Bi; state: string; doc?: string }[];
  attachments: { name: string; path: string }[]; does: Bi[]; source?: { label: string; url: string };
};
export type QueueRow = Filing & { business: string; approver_email: string | null; assignee_email: string | null; assigned_to: string | null };
export type Billing = {
  workspace_id: string; entry_markets: number; entry_paid_at: string | null; subscription_status: string | null;
  subscription_plan: string | null; current_period_end: string | null; comped: boolean; stripe_customer_id: string | null;
};
export type Plan = "none" | "entry" | "monthly";
export const planOf = (b: Billing | null): Plan =>
  !b ? "none" : b.comped || b.subscription_status === "active" || b.subscription_status === "trialing" ? "monthly" : b.entry_markets > 0 ? "entry" : "none";
export type DocRow = { id: string; workspace_id: string; app_id: string | null; filing_id: string | null; name: string; path: string; size: number; mime: string | null; source: string; created_at: string };
export type Integration = { id: string; kind: IntegrationKind; account: string | null; status: "connected" | "error"; error: string | null; meta: Record<string, unknown>; connected_at: string; last_used_at: string | null };
export type IntegrationKind = "gmail" | "gcal" | "gdrive" | "outlook_mail" | "outlook_cal" | "dropbox" | "quickbooks" | "slack";
export type AgencyLogin = { id: string; agency: string; url: string | null; username: string; note: string | null; created_at: string; last_opened_at: string | null };
export type WorkspaceRow = { id: string; name: string; state: Partial<Workspace>; authorized_at: string | null; created_at: string };
type AuditRow = { id: number; client_id: string | null; actor: Audit["actor"] | "team"; action: Bi; object: Bi; detail: Bi | null; created_at: string };

/* ------------------------------ session ------------------------------ */

export const getSession = async () => (await supabase().auth.getSession()).data.session;
export const onAuth = (fn: (s: Session | null) => void) => supabase().auth.onAuthStateChange((_e, s) => fn(s)).data.subscription;
export async function sendSignIn(email: string) {
  const { error } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
  if (error) throw err(error.status === 429 ? "rate_limited" : "auth", error.message);
}
export async function verifyCode(email: string, token: string) {
  const { error } = await supabase().auth.verifyOtp({ email, token, type: "email" });
  if (error) throw err("auth", error.message);
}
export const signOut = () => supabase().auth.signOut();
export async function whoami(): Promise<{ id: string; email: string; staff: boolean }> {
  const { data, error } = await supabase().rpc("whoami");
  if (error) throw fromPg(error);
  return data as { id: string; email: string; staff: boolean };
}

/* ------------------------------ workspaces ------------------------------ */

export async function myWorkspaces(): Promise<WorkspaceRow[]> {
  const { data, error } = await supabase().from("workspaces").select("id, name, state, authorized_at, created_at").order("created_at");
  if (error) throw fromPg(error);
  return (data ?? []) as WorkspaceRow[];
}
export async function createWorkspace(name: string, state: Workspace): Promise<string> {
  const { data, error } = await supabase().rpc("create_workspace", { p_name: name, p_state: strip(state), p_authorized: true });
  if (error) throw fromPg(error);
  return data as string;
}
/** What's saved: the workspace minus the audit trail (kept server side) and anything derived from filings. */
export function strip(w: Workspace): Partial<Workspace> {
  const { audit: _a, ...rest } = w;
  void _a;
  return { ...rest, approvals: w.approvals.filter(a => a.kind !== "pay") };
}
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

const FILING_COLS = "id, workspace_id, app_id, title, agency, portal_url, fee_estimate, payload, status, approved_at, requirements_checked, confirmation_number, fee_paid, receipt_path, note, payment_url, customer_paid_at, submitted_at, decided_at, updated_at";
export async function listFilings(ws: string): Promise<Filing[]> {
  const { data, error } = await supabase().from("filings").select(FILING_COLS).eq("workspace_id", ws).order("approved_at", { ascending: false });
  if (error) throw fromPg(error);
  return (data ?? []) as Filing[];
}
export async function requestFiling(ws: string, f: { app_id: string; title: Bi; agency?: Bi; portal_url?: string; fee_estimate: number; payload: FilingPayload }) {
  const { data, error } = await supabase().from("filings").insert({ workspace_id: ws, ...f }).select(FILING_COLS).single();
  if (error) throw error.code === "42501" ? err("plan_required", "Filing by the Placetta team is part of the monthly plan.") : fromPg(error);
  return data as Filing;
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

/* ------------------------------ billing ------------------------------ */

export async function getBilling(ws: string): Promise<Billing | null> {
  const { data, error } = await supabase().from("billing").select("workspace_id, entry_markets, entry_paid_at, subscription_status, subscription_plan, current_period_end, comped, stripe_customer_id").eq("workspace_id", ws).maybeSingle();
  if (error) throw fromPg(error);
  return data as Billing | null;
}

/* ------------------------------ edge functions ------------------------------ */

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
export const checkout = (ws: string, plan: "entry" | "starter" | "growth", o: { markets?: number; extra_locations?: number } = {}) =>
  fn<{ url: string }>("billing", { action: "checkout", workspace_id: ws, plan, ...o, return_url: location.origin + location.pathname });
export const billingPortal = (ws: string) => fn<{ url: string }>("billing", { action: "portal", workspace_id: ws, return_url: location.origin + location.pathname });

/** The agent's model call through the server (company key, research tools, plan and usage checks). */
export const agentCall = (ws: string, request: Record<string, unknown>, o: { deep?: boolean; research?: boolean; location?: { city: string; region?: string } } = {}) =>
  fn<{ content: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; citations?: { url?: string; title?: string }[] }[]; stop_reason: string }>("agent", { workspace_id: ws, request, ...o });

export async function ttsAudio(ws: string, text: string, lang: string): Promise<ArrayBuffer | null> {
  const s = await getSession(); if (!s) return null;
  const res = await fetch(`${URL_}/functions/v1/tts`, { method: "POST", headers: { "content-type": "application/json", apikey: KEY, Authorization: `Bearer ${s.access_token}` }, body: JSON.stringify({ workspace_id: ws, text, lang: lang.startsWith("zh") ? "zh" : "en" }) });
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
  const { data, error } = await supabase().rpc("filing_queue_v2");
  if (error) throw fromPg(error);
  return (data ?? []) as QueueRow[];
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
