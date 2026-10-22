import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { Audit, Bi, Workspace } from "../model";
import type { Reply, Step } from "../core";
import type { HqLink, HqRow } from "../hq";
import type { Quote } from "../overage.ts";
import type { ModuleQuote } from "../modules.ts";
import { readSSE } from "../../supabase/functions/_shared/stream.ts";
import { tempChat } from "../odeliaMemory/tempChat";
import type { Pushed } from "./runFeed";

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

/** message is English; message_zh, when the server sent one, is the same in Chinese. */
export type ApiError = { code: string; message: string; message_zh?: string };
const err = (code: string, message: string, message_zh?: string): ApiError => ({ code, message, ...(message_zh ? { message_zh } : {}) });
const fromPg = (e: { message?: string; code?: string } | null): ApiError => err(e?.code ?? "db_error", (e?.message ?? "Something went wrong.").replace(/^.*?:\s/, ""));

export type FilingStatus = "requested" | "in_progress" | "needs_info" | "submitted" | "accepted" | "rejected" | "canceled";
export type Filing = {
  id: string; workspace_id: string; app_id: string; title: Bi; agency: Bi | null; portal_url: string | null; fee_estimate: number;
  payload: FilingPayload; status: FilingStatus; approved_at: string; requirements_checked: boolean; confirmation_number: string | null;
  fee_paid: number | null; receipt_path: string | null; note: string | null; payment_url: string | null; customer_paid_at: string | null;
  submitted_at: string | null; decided_at: string | null; updated_at: string;
  channel?: FilingChannel | null; agent_state?: AgentState | null; agent_log?: AgentLogEntry[]; handoff_url?: string | null;
  submit_clicked_at?: string | null; attempts?: number;
  /** While agent_state is "held" (the undo window): when it goes, unless an owner undoes it. */
  send_after?: string | null;
};
export type FilingChannel = "email" | "fax" | "mail" | "portal" | "team";
export type AgentState = "queued" | "running" | "needs_you" | "done" | "failed" | "handoff" | "held";
export type AgentLogEntry = { at?: string; en: string; zh: string; kind: string; ref?: string; value?: string };   // value: what was entered (sensitive numbers masked)
export type FilingPayload = {
  form?: Bi; fields: { label: Bi; value: string; from?: Bi }[]; checklist: { label: Bi; state: string; doc?: string }[];
  attachments: { name: string; path: string }[]; does: Bi[]; source?: { label: string; url: string };
  official?: string; pdf_path?: string;                          // the official form id and the filled (signed) PDF
  signature?: { name: string; title?: string; signed_at: string; kind: "typed" | "drawn" };
  version?: number; answers_hash?: string;                       // the filled form's version it files, and its answers' fingerprint
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
export type IntegrationKind = "gmail" | "gcal" | "gdrive" | "outlook_mail" | "outlook_cal" | "dropbox" | "quickbooks" | "slack" | "lark" | "wecom" | "dingtalk" | "teams" | "slack_bot" | "lark_bot" | "wechat_bot" | "square" | "toast";
/** Team chats linked by pasting a group's incoming-webhook link. */
export type HookKind = "slack" | "lark" | "wecom" | "dingtalk" | "teams";
/** The business's own Slack or Lark bot, or its own WeChat Official Account: talk to Odelia there. */
export type BotKind = "slack_bot" | "lark_bot" | "wechat_bot";
/** What to set up before connecting a bot: its event address, Slack's manifest, and for WeChat a Token and
 *  EncodingAESKey to use and any server addresses to whitelist. */
export type BotSetup = { events_url: string; manifest?: string; token?: string; aes_key?: string; ips?: string[] };
/** Which sign-in connections the server can offer now. */
export type Availability = { google: boolean; microsoft: boolean; dropbox: boolean; quickbooks: boolean; slack: boolean; square: boolean; toast: boolean };
/** A member's own WeChat link to the workspace's WeChat Official Account. */
export type WechatLink = { connected: boolean; linked: boolean; linked_at: string | null; waiting: boolean };
export type AgencyLogin = { id: string; agency: string; url: string | null; username: string; note: string | null; created_at: string; last_opened_at: string | null };
/** Workspace roles. Owners approve filings, payments and messages; admins manage people, sign-in and SCIM; members work
 *  in the workspace; viewers read it. The database enforces each (supabase/migrations/20261022000000_enterprise_access.sql). */
export type Role = "owner" | "admin" | "member" | "viewer";
export const ROLES: Role[] = ["owner", "admin", "member", "viewer"];
export type WorkspaceRow = { id: string; name: string; state: Partial<Workspace>; authorized_at: string | null; created_at: string; role: Role };
type AuditRow = { id: number; client_id: string | null; actor: Audit["actor"] | "team"; action: Bi; object: Bi; detail: Bi | null; created_at: string };

/* ------------------------------ session ------------------------------ */

export const getSession = async () => (await supabase().auth.getSession()).data.session;
export const onAuth = (fn: (s: Session | null, event: string) => void) => supabase().auth.onAuthStateChange((e, s) => fn(s, e)).data.subscription;
export async function sendSignIn(email: string) {
  const { error } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: appHome() } });
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
  const { data, error } = await supabase().auth.signUp({ email, password, options: { emailRedirectTo: appHome() } });
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
  const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: appHome() });
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

/* ------------------------------ single sign-on ------------------------------ */

/** Whether this email's company requires single sign-on, and how (saml, google, azure or custom:<id>). */
export async function ssoForEmail(email: string): Promise<{ required: boolean; method?: string; domain?: string }> {
  const { data, error } = await supabase().rpc("sso_for_email", { p_email: email });
  if (error) return { required: false };
  return data as { required: boolean; method?: string; domain?: string };
}
/** SAML single sign-on by the email's domain: Supabase Auth sends the browser to the company's identity provider
    (registered by Placetta with `supabase sso add`). */
export async function signInWithSso(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  if (!domain) throw err("auth", "Enter your work email.");
  const { data, error } = await supabase().auth.signInWithSSO({ domain, options: { redirectTo: appHome() } });
  if (error) throw err(/not found|no sso provider/i.test(error.message) ? "sso_none" : "auth", error.message);
  if (data?.url) location.assign(data.url);
}

/* Sign in with Google, Microsoft or a phone number. Each shows only when it's turned on in Supabase (Authentication, Providers);
   phone also needs an SMS provider there. Anything the settings don't confirm stays hidden. */
export type Provider = "google" | "azure" | `custom:${string}`;
export type SignInOptions = Record<"google" | "azure" | "phone" | "saml", boolean>;
export async function authProviders(): Promise<SignInOptions> {
  try {
    const res = await net(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY } });
    const j = await res.json() as { external?: Record<string, boolean>; saml_enabled?: boolean };
    return { google: !!j.external?.google, azure: !!j.external?.azure, phone: j.external?.phone === true, saml: j.saml_enabled === true };
  } catch { return { google: false, azure: false, phone: false, saml: false }; }
}
/** How this session signed in (the access token's amr claim): "password", "otp", "oauth", "sso/saml", "totp"... */
export async function sessionMethods(): Promise<string[]> {
  const t = (await getSession())?.access_token ?? "";
  try {
    const part = t.split(".")[1] ?? "";
    const c = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="))) as { amr?: unknown };
    return Array.isArray(c.amr) ? c.amr.map(x => (x && typeof x === "object" ? String((x as { method?: unknown }).method ?? "") : String(x))) : [];
  } catch { return []; }
}
/** Whether this session meets the sign-in rule its email's domain sets (the database checks it on every request too). */
export const meetsSso = (rule: { required: boolean; method?: string }, methods: string[]) =>
  !rule.required || (rule.method === "saml" ? methods.includes("sso/saml") : methods.includes("oauth"));
/** Where accounts and data live (the Supabase project's region). */
export const REGION = { id: "us", label: { en: "United States", zh: "美国" } } as const;
export async function signInWith(provider: Provider) {
  const { error } = await supabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: appHome(), ...(provider === "azure" ? { scopes: "email openid profile" } : {}) },
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
/** Join every workspace this email was invited to, or that its company's identity provider provisioned (SCIM).
    Returns how many. */
export async function acceptInvites(): Promise<number> {
  const { data, error } = await supabase().rpc("accept_invites");
  if (error) { if (error.code === "PGRST202") return 0; throw fromPg(error); }
  const scim = await supabase().rpc("scim_claim");
  return ((data as number) ?? 0) + (scim.error ? 0 : ((scim.data as number) ?? 0));
}
/** A "Signed in" line in each of this person's workspaces' audit trails, once per session (how, from the session). */
export async function recordSignIn(): Promise<void> {
  await supabase().rpc("audit_sign_in").then(() => undefined, () => undefined);
}
export async function createWorkspace(name: string, state: Workspace): Promise<string> {
  const { data, error } = await supabase().rpc("create_workspace", { p_name: name, p_state: strip(state), p_authorized: true });
  if (error) throw fromPg(error);
  return data as string;
}

/* ------------------------------ terms acceptance (clickwrap) ------------------------------ */

/** Which version of the Terms of Service and Privacy Policy this person last accepted, and the current one. */
export type TermsStatus = { accepted: boolean; version: string | null; current: string };
/** null before the terms migration is applied (nothing to ask yet). */
export async function termsStatus(): Promise<TermsStatus | null> {
  const { data, error } = await supabase().rpc("terms_status");
  if (error) { if (error.code === "PGRST202") return null; throw fromPg(error); }
  return data as TermsStatus;
}
/** Records that this person accepted `version` (the one they were shown) of the Terms and Privacy Policy. The server
 *  refuses any version but the current one: "terms_version", with the current version as the message. */
export async function acceptTerms(version: string, ws?: string): Promise<TermsStatus | null> {
  const { data, error } = await supabase().rpc("accept_terms", { p_version: version, p_workspace: ws ?? null });
  if (error) {
    if (error.code === "PGRST202") return null;
    if (/terms_version/.test(error.message ?? "")) throw err("terms_version", (error as { hint?: string }).hint ?? "");
    throw fromPg(error);
  }
  return data as TermsStatus;
}
/** Sign-up asks for agreement before there's a session to record it with: kept here until the first sign-in. */
const TERMS_AGREED = "placetta-terms-agreed";
export const termsAgreed = {
  set: (version: string) => { try { localStorage.setItem(TERMS_AGREED, version); } catch { /* storage blocked */ } },
  take: () => { try { const v = localStorage.getItem(TERMS_AGREED); localStorage.removeItem(TERMS_AGREED); return v; } catch { return null; } },
};

/** What's saved: the workspace minus the audit trail (kept server side) and anything derived from filings. */
import { stripState as strip } from "../core";

/** Where sign-in links, invites and checkout come back to: the app's home address, whatever page it was opened from
    (deep addresses like /app/settings/billing aren't on the sign-in redirect allow list). */
const appHome = () => location.origin + (import.meta.env.BASE_URL.startsWith("/") ? import.meta.env.BASE_URL : location.pathname);
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
/* The database accepts only the member's own actions from the app (actor "you"); the agent's entries are written by
   the server. Sending an "agent" row would fail the whole batch. */
export async function logAudit(ws: string, uid: string, entries: Audit[]) {
  const rows = entries.filter(a => a.actor === "you").map(a => ({
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
let agentCols = true, holdCols = true;
const missingCol = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204";
export async function listFilings(ws: string): Promise<Filing[]> {
  const q = (cols: string) => supabase().from("filings").select(cols).eq("workspace_id", ws).order("approved_at", { ascending: false });
  let { data, error } = await q(agentCols ? (holdCols ? AGENT_COLS + ", send_after" : AGENT_COLS) : BASE_COLS);
  // before the undo window's migration there's no send_after: keep the agent columns without it
  if (agentCols && holdCols && missingCol(error)) { holdCols = false; ({ data, error } = await q(AGENT_COLS)); }
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
/** Owners: delete a document, the stored file (through the Storage API, so the object itself goes) and then its row.
    The database refuses both while an open filing still uses the file. */
export async function deleteDoc(doc: Pick<DocRow, "id" | "path">) {
  const rm = await supabase().storage.from("documents").remove([doc.path]);
  if (rm.error) throw err("delete", rm.error.message);
  if (!rm.data?.length) throw err("forbidden", "Only an owner can delete this file, and not while a filing uses it.");
  const { error } = await supabase().from("documents").delete().eq("id", doc.id);
  if (error) throw fromPg(error);
}
export async function listDocs(ws: string): Promise<DocRow[]> {
  const { data, error } = await supabase().from("documents").select("*").eq("workspace_id", ws).order("created_at", { ascending: false });
  if (error) throw fromPg(error);
  return (data ?? []) as DocRow[];
}
/** The agency's own PDF of an official form (only .gov hosts), passed through Placetta's server. */
export async function officialForm(url: string): Promise<Blob> {
  const { data, error } = await supabase().functions.invoke("forms", { body: { url } });
  if (error || !data) {
    let message = "Couldn't get the official form. Open it from the agency's page.", zh = "无法获取官方表格。请从机构页面打开。";
    try {
      const j = await (error as { context?: Response })?.context?.json();
      if (j?.error?.message) { message = j.error.message; zh = typeof j.error.message_zh === "string" ? j.error.message_zh : zh; }
    } catch { /* not JSON */ }
    throw err("download", message, zh);
  }
  return data instanceof Blob ? data : new Blob([data as BlobPart], { type: "application/pdf" });
}

export async function downloadDoc(path: string): Promise<Blob> {
  const { data, error } = await supabase().storage.from("documents").download(path);
  if (error || !data) throw err("download", error?.message ?? "Couldn't download the file.");
  return data;
}
/** A filled form's short link from a text or chat (supabase/migrations/20261018090000_form_links.sql): for a member of
 *  its workspace, which application and version it shows; expired once its week is up. */
export async function openFormLink(token: string): Promise<{ app_id: string; version: number; path: string | null; name: string; expired: boolean }> {
  const { data, error } = await supabase().rpc("open_form_link", { p_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) throw err("not_found", "That link is gone, or it isn't for this workspace.", "这个链接已失效，或不属于这个工作区。");
  return row as { app_id: string; version: number; path: string | null; name: string; expired: boolean };
}

/* ------------------------------ agent runs ------------------------------ */

/** The agent working on the server: it carries on if the app is closed. */
/** queued: a store's run waiting its turn; waiting: a run that split work across stores, waiting for their runs
 *  (children) before it writes one summary. */
export type RunRow = { id: string; kind: "task" | "watch"; prompt: string; status: "running" | "queued" | "waiting" | "done" | "failed" | "stopped"; steps: Step[]; draft: string | null; reply: Reply | null; error: string | null; created_at: string; updated_at: string; seen_at?: string | null;
  parent_run?: string | null; job_id?: string | null; store_id?: string | null; children?: { id: string; status: RunRow["status"]; job_id: string | null; store_id: string | null; updated_at: string }[] };
/** Start a task on the server. null when this server doesn't run the agent itself (an older deploy): the app runs it in the browser. */
export async function startRun(ws: string, o: { prompt: string; history: { role: string; content: string }[]; lang: string; deep: boolean }): Promise<string | null> {
  // "don't remember this chat" (src/odeliaMemory/tempChat.ts): the run reads and saves no memory
  const { data, error } = await supabase().functions.invoke("agent-run", { body: { action: "start", workspace_id: ws, ...o, ...(tempChat() ? { no_memory: true } : {}) } });
  if (!error) return (data as { id: string }).id;
  const ctx = (error as { context?: Response }).context;
  if (ctx?.status === 404) return null;
  let e: ApiError = err("upstream_error", "Couldn't reach Placetta. Try again.");
  try { const j = await ctx?.json(); if (j?.error?.code) e = err(j.error.code, j.error.message); } catch { /* not JSON */ }
  if (ctx?.status === 402 && !LIMITS.includes(e.code)) e = err("payment_required", e.message);
  throw e;
}
/** Odelia's allowance and rate limits: the server's own words go to the person, with the way to keep going. */
export const LIMITS = ["over_budget", "plan_required", "entry_ended", "rate_limited", "paused", "task_limit"];
export async function pollRun(id: string): Promise<RunRow> {
  const { data, error } = await supabase().rpc("poll_agent_run", { p_id: id });
  if (error) throw fromPg(error);
  return data as RunRow;
}
/** Live updates for a run on the server, on its private Realtime channel (supabase/functions/agent-run/push.ts; only
 *  the workspace's members may listen). live() is whether the channel is connected; the caller keeps polling either
 *  way, more slowly while it is. Off in the preview. */
export type RunWatch = { live(): boolean; close(): void };
export function watchRun(id: string, on: { progress(u: Pushed): void; end(): void }): RunWatch {
  if (PREVIEW || !cloudConfigured) return { live: () => false, close() {} };
  let ok = false;
  try {
    const sb = supabase();
    const ch = sb.channel(`run:${id}`, { config: { private: true } })
      .on("broadcast", { event: "progress" }, m => {
        const p = (m.payload ?? {}) as Record<string, unknown>;
        on.progress({ from: Number(p.from) || 0, steps: Array.isArray(p.steps) ? p.steps as Step[] : [], draft: typeof p.draft === "string" ? p.draft : null, at: String(p.at ?? "") });
      })
      .on("broadcast", { event: "end" }, () => on.end())
      .subscribe(st => { ok = st === "SUBSCRIBED"; });
    return { live: () => ok, close() { ok = false; void sb.removeChannel(ch).catch(() => undefined); } };
  } catch { return { live: () => false, close() {} }; }
}
export async function stopRun(id: string) {
  const { error } = await supabase().rpc("stop_agent_run", { p_id: id });
  if (error) throw fromPg(error);
}
/** The last day's tasks: one still running to follow again, or one that finished while the app was closed. */
export async function recentRuns(ws: string): Promise<RunRow[]> {
  // the person's own tasks: a store's run belongs to the run that split the work, which the app follows instead
  const { data, error } = await supabase().from("agent_runs").select("id, kind, prompt, status, steps, draft, reply, error, created_at, updated_at, seen_at")
    .eq("workspace_id", ws).eq("kind", "task").is("parent_run", null).gt("created_at", new Date(Date.now() - 864e5).toISOString()).order("created_at", { ascending: false }).limit(3);
  if (error) throw fromPg(error);
  return (data ?? []) as RunRow[];
}
/** One past conversation, opened from a link Odelia gave when she searched past chats (/app/?run=<id>,
 *  src/odeliaMemory/retrieve.ts). Row-level security keeps it to the person's own workspaces. */
export async function pastRun(ws: string, id: string): Promise<RunRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase().from("agent_runs").select("id, kind, prompt, status, steps, draft, reply, error, created_at, updated_at, seen_at")
    .eq("workspace_id", ws).eq("id", id).eq("status", "done").maybeSingle();
  if (error) throw fromPg(error);
  return (data ?? null) as RunRow | null;
}
/** The moments of these runs, for a job's replay (src/replay.ts): each run's steps, its store when it was a store's bot,
 *  and its job. */
export async function runMoments(ids: string[]): Promise<{ id: string; at: string; bot?: string; job?: string; steps: Step[] }[]> {
  const uuids = ids.filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 40);
  if (!uuids.length) return [];
  const { data, error } = await supabase().from("agent_runs").select("id, created_at, steps, store_id, job_id").in("id", uuids);
  if (error) throw fromPg(error);
  return ((data ?? []) as { id: string; created_at: string; steps: Step[] | null; store_id: string | null; job_id: string | null }[])
    .map(r => ({ id: r.id, at: r.created_at, ...(r.store_id ? { bot: r.store_id } : {}), ...(r.job_id ? { job: r.job_id } : {}), steps: Array.isArray(r.steps) ? r.steps : [] }));
}
export async function loadWorkspace(ws: string): Promise<{ name: string; state: Partial<Workspace> }> {
  const { data, error } = await supabase().from("workspaces").select("name, state").eq("id", ws).single();
  if (error) throw fromPg(error);
  return data as { name: string; state: Partial<Workspace> };
}

/* ------------------------------ updates ------------------------------ */

export type UpdateRow = { id: string; kind: "deadline" | "renewal" | "filing" | "payment" | "team" | "mail"; title: Bi; body: Bi | null; app_id: string | null; created_at: string; read_at: string | null };
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
/** Carry on after a hand-back. resubmit: the person confirmed sending again a filing the same as one they already sent. */
export const resumeFiling = (ws: string, filingId: string, resubmit = false) =>
  fn<FileView>("file", { workspace_id: ws, filing_id: filingId, action: "resume", ...(resubmit ? { resubmit: true } : {}) });
/** The hand-signed copy of a wet-signature form, already in Documents: Placetta faxes it. */
export const signedCopy = (ws: string, filingId: string, path: string) => fn<FileView>("file", { workspace_id: ws, filing_id: filingId, action: "signed", path });
/** Stop a filing before anything has left for the agency. Refused once Placetta has pressed submit or sent it. */
export const stopFiling = (ws: string, filingId: string) => fn<FileView>("file", { workspace_id: ws, filing_id: filingId, action: "stop" });
export const filingStatus = (ws: string, filingId: string) => fn<FileView>("file", { workspace_id: ws, filing_id: filingId, action: "status" });
/** The undo window: take a held filing back (nothing has left), or end the wait and send it now. */
export const undoFiling = (ws: string, filingId: string) => fn<FileView>("file", { workspace_id: ws, filing_id: filingId, action: "undo" });
export const sendFilingNow = (ws: string, filingId: string) => fn<FileView>("file", { workspace_id: ws, filing_id: filingId, action: "send_now" });
/** Ask a person on the Placetta team; their reply comes to Updates. Three a day per workspace. */
export const askPerson = (ws: string, question: string, context: Record<string, unknown>, lang: string) => fn<{ id: string }>("team", { action: "ask", workspace_id: ws, question, context, lang });
/** The team's reply to a customer's question (staff with two-step). */
export async function answerPerson(id: string, reply: string) {
  const { error } = await supabase().rpc("answer_person", { p_id: id, p_reply: reply });
  if (error) throw fromPg(error);
}
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
    let e: ApiError = err("upstream_error", "Couldn't reach Placetta. Try again.", "无法连接快哉，请重试。");
    try { const j = await ctx?.json(); if (j?.error?.code) e = err(j.error.code, j.error.message, typeof j.error.message_zh === "string" ? j.error.message_zh : undefined); } catch { /* not JSON */ }
    if (ctx?.status === 402 && !LIMITS.includes(e.code)) e = err("payment_required", e.message, e.message_zh);
    throw e;
  }
  return data as T;
}
/* ------------------------------ security: SSO, SCIM, the audit export ------------------------------ */

export type ScimGroup = { id: string; name: string; role: Exclude<Role, "owner"> | null; members: number };
export type Security = {
  domain: string | null; txt_name: string | null; txt_value: string | null; verified_at: string | null;
  method: string; enforced: boolean; my_domain: string; session_ok: boolean | null;
  scim: { prefix: string; created_at: string; last_used_at: string | null } | null; scim_users: number; groups: ScimGroup[];
};
/** What Supabase Auth has on: null where Placetta couldn't check. */
export type AuthStatus = { saml_enabled: boolean | null; providers: Record<string, boolean> | null; saml_registered: boolean | null };
async function rpcData<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(name, args);
  if (error) throw fromPg(error);
  return data as T;
}
export const securitySettings = (ws: string) => rpcData<Security>("security_settings", { ws });
export const ssoStatus = (ws: string) => fn<{ settings: Security; auth: AuthStatus }>("sso", { action: "status", workspace_id: ws });
export const ssoVerify = (ws: string) =>
  fn<{ verified: boolean; reason?: "not_found" | "dns_unavailable"; found?: string[]; settings: Security }>("sso", { action: "verify", workspace_id: ws });
export const ssoSetDomain = (ws: string, domain: string) => rpcData<Security>("sso_set_domain", { ws, p_domain: domain });
export const ssoSetEnforced = (ws: string, on: boolean, method: string) => rpcData<Security>("sso_set_enforced", { ws, p_on: on, p_method: method });
/** A new SCIM token (the old one stops working). The token is in the answer once and never again. */
export const scimTokenCreate = (ws: string) => rpcData<{ prefix: string; token: string }>("scim_token_create", { ws });
export const scimTokenRevoke = (ws: string) => rpcVoid("scim_token_revoke", { ws });
export const scimGroupRole = (ws: string, group: string, role: ScimGroup["role"]) => rpcVoid("scim_group_role", { ws, p_group: group, p_role: role });
/** Placetta's own MCP server (supabase/functions/mcp): workspace tokens for Claude, ChatGPT and other assistants. Owners
 *  and admins make, list and revoke them; a new token is in the answer once and never again. */
export type McpScope = "status" | "deadlines" | "readiness" | "plan" | "filings";
export type McpToken = { id: string; label: string; prefix: string; scopes: McpScope[]; created_at: string; last_used_at: string | null; revoked_at: string | null };
export const mcpTokenCreate = (ws: string, label: string, scopes: McpScope[]) => rpcData<{ id: string; prefix: string; token: string }>("mcp_token_create", { ws, p_label: label, p_scopes: scopes });
export const mcpTokenList = (ws: string) => rpcData<McpToken[]>("mcp_token_list", { ws });
export const mcpTokenRevoke = (id: string) => rpcVoid("mcp_token_revoke", { p_id: id });
/** The MCP server's address. */
export const mcpUrl = () => `${URL_.replace(/\/+$/, "")}/functions/v1/mcp`;
/** SCIM's base URL for the identity provider. */
export const scimUrl = () => `${URL_.replace(/\/+$/, "")}/functions/v1/scim/v2`;

export type AuditExportRow = {
  id: number; created_at: string; actor: string; actor_email: string | null; action_en: string; action_zh: string | null;
  object_en: string | null; object_zh: string | null; detail_en: string | null; detail_zh: string | null;
};
/** The whole audit trail, for owners and admins; the server records the export first. */
export const auditExport = (ws: string, from?: string, to?: string) => rpcData<AuditExportRow[]>("audit_export", { ws, p_from: from ?? null, p_to: to ?? null });
/** Records a data download in the audit trail before the app saves it. */
export const recordExport = (ws: string, kind: "workspace_data" | "documents" | "filings") => rpcVoid("audit_record_export", { ws, p_kind: kind });

/* ------------------------------ team ------------------------------ */

export type Member = { user_id: string; email: string; role: Role; joined_at: string; you: boolean; two_step: boolean; scim?: boolean };
export type Invite = { id: string; email: string; role: Role; created_at: string; expires_at: string };
export type Team = { me: Role | null; members: Member[]; invites: Invite[] };
export async function teamList(ws: string): Promise<Team> {
  const { data, error } = await supabase().rpc("team_list", { ws });
  if (error) throw fromPg(error);
  return data as Team;
}
/** Records the invite and emails it. sent: "invite" (new person), "sign_in_link" (has an account) or "not_sent". */
export const invite = (ws: string, email: string, role: Role) =>
  fn<{ id: string; sent: "invite" | "sign_in_link" | "not_sent" }>("team", { action: "invite", workspace_id: ws, email, role, return_url: appHome() });
export const resendInvite = (ws: string, id: string) =>
  fn<{ id: string; sent: "invite" | "sign_in_link" | "not_sent" }>("team", { action: "resend", workspace_id: ws, id, return_url: appHome() });
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
export type PlanPrices = { location: LocationPrice | null; pro?: LocationPrice | null; opening: LocationPrice | null; opening_food?: LocationPrice | null; guarantee?: LocationPrice | null; pack?: LocationPrice | null;
  /** which two and three year terms can be bought online (their approved Stripe price is set); else the team quotes */
  terms?: Record<"essentials" | "pro", Record<string, boolean>> };
export const locationPrices = (ws: string) => fn<PlanPrices>("billing", { action: "prices", workspace_id: ws, return_url: appHome() });
export const syncLocations = (ws: string) => fn<{ synced: boolean }>("billing", { action: "sync_locations", workspace_id: ws, return_url: appHome() });
export const checkout = (ws: string, plan: "entry" | "starter" | "growth" | "locations", o: { markets?: number; extra_locations?: number; tier?: "essentials" | "pro"; guarantee?: boolean; term_years?: number; renewal_consent?: boolean } = {}) =>
  fn<{ url: string }>("billing", { action: "checkout", workspace_id: ws, plan, ...o, return_url: appHome() });
export const billingPortal = (ws: string) => fn<{ url: string }>("billing", { action: "portal", workspace_id: ws, return_url: appHome() });

/* ------------------------------ growth: the cap, modules, the term, the brand plan ------------------------------ */

/** The growth columns of billing (migration 20261022140000_growth_mechanics). Null before it's applied. */
export type Growth = { modules: string[]; modules_requested: string[]; module_qty?: Record<string, number>; abroad_countries?: string[]; filing_cap_cents: number; term_years: number; term_started: string | null; auto_renew: boolean; renewal_notice_for: string | null; hq_paid_by: string | null; current_period_end: string | null; paid_locations: number };
export async function growth(ws: string): Promise<Growth | null> {
  if (PREVIEW) return null;
  const { data, error } = await supabase().from("billing").select("modules, modules_requested, module_qty, abroad_countries, filing_cap_cents, term_years, term_started, auto_renew, renewal_notice_for, hq_paid_by, current_period_end, paid_locations").eq("workspace_id", ws).maybeSingle();
  if (error) return null;
  return (data as Growth | null) ?? null;
}
/** This month's filings past the plan: how many, what was charged, the cap. */
export type FilingMonth = { month: string; locations: number; used: number; assisted?: number; charged_cents: number; cap_cents: number; paid: boolean };
export async function filingMonth(ws: string): Promise<FilingMonth | null> {
  if (PREVIEW) return null;
  const { data, error } = await supabase().rpc("filing_month", { ws });
  return error ? null : (data as FilingMonth);
}
export const setFilingCap = (ws: string, usd: number) => rpcData<number>("filing_cap_set", { ws, p_cents: Math.round(usd) * 100 });
/** What a filing past the plan costs, from the server (owners only): automated or assisted, and the price. */
export const filingQuote = (ws: string, ref: string) => fn<{ ok: true; quote: Quote }>("billing", { action: "filing_quote", workspace_id: ws, ref, return_url: appHome() });
/** A filing past the plan, approved at the price and kind of work shown (0 within the allowance). */
export const filingCharge = (ws: string, o: { ref: string; mode: string; shown_cents: number }) =>
  fn<{ ok: true; kind: "plan" | "allowance" | "charge"; cents: number; again?: boolean }>("billing", { action: "filing_charge", workspace_id: ws, ...o, return_url: appHome() });
/** A module's units from the workspace's facts and what adding it charges now (owners only). */
export const moduleQuote = (ws: string, module: string) => fn<{ ok: true; quote: ModuleQuote; quote_at: number }>("billing", { action: "module_quote", workspace_id: ws, module, return_url: appHome() });
/** Add a module (or change its units) at the quote shown: the same units and cents, or the server refuses. */
export const addModule = (ws: string, module: string, shown: { qty: number; cents: number; at: number }) =>
  fn<{ ok: true; module: string; state: "on" | "requested" }>("billing", { action: "add_module", workspace_id: ws, module, shown_qty: shown.qty, shown_cents: shown.cents, quote_at: shown.at, return_url: appHome() });
/** Off is the online cancel of auto-renew; on turns it back on. */
export const setAutoRenew = (ws: string, on: boolean) => fn<{ ok: true; auto_renew: boolean }>("billing", { action: "auto_renew", workspace_id: ws, on, return_url: appHome() });

export type HqPlanView = {
  plan: { brand: string | null; bill_to: "hq" | "franchisee"; tier: "essentials" | "pro"; status: string | null; period_end: string | null } | null;
  counts: { workspaces: number; locations: number; people: number };
  invites: { id: string; label: string | null; created_at: string; expires_at: string; used_at: string | null; workspace: string | null; revoked: boolean }[];
};
export async function hqPlanView(): Promise<HqPlanView | null> {
  if (PREVIEW) return null;
  const { data, error } = await supabase().rpc("hq_plan_view");
  if (error) { if (error.code === "PGRST202" || error.code === "42883") return null; throw fromPg(error); }
  return data as HqPlanView | null;
}
export const hqPlanSet = (brand: string, billTo: "hq" | "franchisee", tier: "essentials" | "pro") => rpcData<HqPlanView>("hq_plan_set", { p_brand: brand, p_bill_to: billTo, p_tier: tier });
export const hqInviteCreate = (label: string) => rpcData<string>("hq_invite_create", { p_label: label });
export const hqInviteRevoke = (id: string) => rpcVoid("hq_invite_revoke", { p_id: id });
export const hqInviteRedeem = (ws: string, code: string) => rpcData<{ hq_email: string; brand: string | null; bill_to: "hq" | "franchisee" }>("hq_invite_redeem", { ws, p_code: code });
export const hqCheckout = () => fn<{ url: string }>("billing", { action: "hq_checkout", renewal_consent: true, return_url: appHome() });
export const hqSync = () => fn<{ covered: number }>("billing", { action: "hq_sync", return_url: appHome() });
/** An Odelia pack: more AI allowance, carried over until it's used. */
export const buyPack = (ws: string, packs = 1) => fn<{ url: string }>("billing", { action: "pack", workspace_id: ws, packs, return_url: appHome() });
/** How much of this period's Odelia allowance is used. */
export type AiStatus = { plan: "none" | "entry" | "entry_ended" | "monthly" | "comped"; used_pct: number; resets_at: string | null; has_credit: boolean; /** saver mode is on (past 60% of the allowance, or throttled for the day) */ saver?: boolean; saver_at_pct?: number };
export async function aiStatus(ws: string): Promise<AiStatus | null> {
  if (PREVIEW) return null;
  const { data, error } = await supabase().rpc("ai_status", { ws });
  if (error) return null;   // an older database without budgets: nothing to show
  return data as AiStatus;
}

/** The agent's model call through the server (company keys, the role's route, research tools, plan and usage checks).
 *  saver and renews_at come back when the workspace is in saver mode (past 60% of its allowance). With onText the
 *  answer streams: onText gets the whole text so far as the model writes it, and the same complete answer comes back. */
type AgentAnswer = { content: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; citations?: { url?: string; title?: string }[] }[]; stop_reason: string; saver?: boolean; renews_at?: string | null };
export const agentCall = (ws: string, request: Record<string, unknown>, o: { deep?: boolean; research?: boolean; role?: string; location?: { city: string; region?: string }; onText?: (text: string) => void } = {}) => {
  const { onText, ...rest } = o;
  return onText ? agentStream({ workspace_id: ws, request, ...rest, stream: true }, onText) : fn<AgentAnswer>("agent", { workspace_id: ws, request, ...rest });
};
/** The streamed call: server-sent events from the agent function ("text" pieces, then "message" or "error"). An older
 *  server that answers in one piece is read the same way as fn would. */
async function agentStream(body: Record<string, unknown>, onText: (text: string) => void): Promise<AgentAnswer> {
  const s = await getSession();
  if (!s) throw err("unauthorized", "Sign in again.", "请重新登录。");
  let res: Response;
  try {
    res = await net(`${URL_}/functions/v1/agent`, { method: "POST", headers: { "content-type": "application/json", apikey: KEY, Authorization: `Bearer ${s.access_token}` }, body: JSON.stringify(body) });
  } catch { throw err("upstream_error", "Couldn't reach Placetta. Try again.", "无法连接快哉，请重试。"); }
  if (!res.ok) {
    let e: ApiError = err("upstream_error", "Couldn't reach Placetta. Try again.", "无法连接快哉，请重试。");
    try { const j = await res.json(); if (j?.error?.code) e = err(j.error.code, j.error.message, typeof j.error.message_zh === "string" ? j.error.message_zh : undefined); } catch { /* not JSON */ }
    if (res.status === 402 && !LIMITS.includes(e.code)) e = err("payment_required", e.message, e.message_zh);
    throw e;
  }
  if (!/text\/event-stream/i.test(res.headers.get("content-type") ?? "") || !res.body) return res.json() as Promise<AgentAnswer>;
  let text = "", done: AgentAnswer | null = null, failed: ApiError | null = null;
  await readSSE(res.body, (event, data) => {
    let d: Record<string, unknown>;
    try { d = JSON.parse(data); } catch { return; }
    if (event === "text") { text = d.reset ? String(d.d ?? "") : text + String(d.d ?? ""); onText(text); }
    else if (event === "message") done = d as unknown as AgentAnswer;
    else if (event === "error") { const x = (d.error ?? {}) as { code?: string; message?: string }; failed = err(x.code ?? "upstream_error", x.message ?? "Couldn't reach the agent's model. Try again."); }
  });
  if (failed) throw failed;
  if (!done) throw err("upstream_error", "The answer stopped partway. Try again.", "回答中途中断，请重试。");
  return done;
}

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
/** The server address WeChat's Message push points at for this workspace (chat-events checks every request). */
export const wechatServerUrl = (ws: string) => `${URL_.replace(/\/+$/, "")}/functions/v1/chat-events/wechat/${ws}`;
/** Link my WeChat: whether I'm linked, a code to send the workspace's WeChat account, or unlink. */
export const wechatLinkStatus = (ws: string) => integration<WechatLink>(ws, "wechat_link_status");
export const wechatLinkCode = (ws: string) => integration<{ code: string; expires_at: string; account: string | null }>(ws, "wechat_link");
export const wechatUnlink = (ws: string) => integration<{ linked: false }>(ws, "wechat_unlink");
/** The code an owner types into Toast so Placetta finds their locations. */
export const toastCode = (ws: string) => integration<{ code: string }>(ws, "toast_setup");

/* ------------------------------ spending: what Odelia may buy, and every purchase ------------------------------ */
export type SpendState = { policy: import("../spend.ts").SpendPolicy; purchases: import("../spend.ts").Purchase[] };
export const spend = <T>(ws: string, action: string, body: Record<string, unknown> = {}) => fn<T>("spend", { workspace_id: ws, action, ...body });
export const spendGet = (ws: string) => (PREVIEW ? Promise.resolve(null) : spend<SpendState>(ws, "get").catch(() => null));
export const connectUrl = (ws: string, kind: IntegrationKind) => integration<{ url: string }>(ws, "connect", { kind, return_to: appHome() });

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
/* What Odelia did this month, measured (src/monthly.ts; odelia_month_* in the 20261017200000_odelia_metrics migration).
   null when the server is older than these numbers, or in the preview: the card then uses the workspace here. */
export async function odeliaMonth(ws: string, month?: string): Promise<import("../monthly").MonthMetrics | null> {
  if (PREVIEW) return null;
  const { data, error } = await supabase().rpc("odelia_month_detail", { ws, ...(month ? { p_month: month } : {}) });
  return error || !data ? null : data as import("../monthly").MonthMetrics;
}
/** Headquarters: every franchisee that shared with this email. */
export async function odeliaMonthHq(month?: string): Promise<import("../monthly").MonthAcross | null> {
  if (PREVIEW) return null;
  const { data, error } = await supabase().rpc("odelia_month_hq", month ? { p_month: month } : {});
  return error || !data ? null : data as import("../monthly").MonthAcross;
}
/** The Placetta team: every workspace. Staff only. */
export async function odeliaMonthCompany(month?: string): Promise<import("../monthly").MonthAcross | null> {
  if (PREVIEW) return null;
  const { data, error } = await supabase().rpc("odelia_month_company", month ? { p_month: month } : {});
  return error || !data ? null : data as import("../monthly").MonthAcross;
}

/** What Odelia's models cost the company this month against plan revenue (public.ai_margin_company). Staff only. */
export type AiMarginRow = { workspace_id: string; name: string | null; ai_cost_usd: number; revenue_usd: number; allowance_usd: number; cost_pct: number | null; calls: number; top_roles: { role: string; cost_usd: number; calls: number }[] };
export type AiMargin = { month: string; ai_cost_usd: number; mrr_usd: number; cost_pct: number | null; gross_margin_pct: number | null; workspaces_using_ai: number; calls: number; top: AiMarginRow[]; by_role: { role: string; cost_usd: number; calls: number }[]; by_vendor: { provider: string; cost_usd: number; calls: number }[] };
export async function aiMarginCompany(month?: string): Promise<AiMargin | null> {
  const { data, error } = await supabase().rpc("ai_margin_company", month ? { p_month: month } : {});
  if (error) return null;   // before the migration, or not staff
  return data as AiMargin;
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

/* ------------------------------ text and call Odelia ------------------------------ */
/** The phone this person linked to text and call Odelia, and what they want to hear about and when. */
export type PhoneLink = {
  number: string; verified: boolean; verified_at: string | null; texts_on: boolean; calls_on: boolean; quiet_start: string; quiet_end: string;
  tz: string; lang: "en" | "zh"; opted_out: boolean; last_error: string | null; code_pending: boolean;
  /** A code is waiting to be texted to Odelia from this number (linking by texting her first). */
  text_in_pending?: boolean;
  /** The iMessage line this person texts Odelia on (each person keeps one, so it stays one conversation). */
  line?: string | null;
};
export type PhoneLogRow = { id: number; direction: "in" | "out"; channel: "sms" | "voice" | "email"; kind: string; body: string; service?: "iMessage" | "RCS" | "SMS" | null; created_at: string };
export type PhoneStatus = { link: PhoneLink | null; log: PhoneLogRow[]; error?: string; text_code?: string; text_code_expires_at?: string };
/** Whether texting and calls are set up on the server, and Odelia's number. With iMessage (Linq) the number is an
 *  iMessage line that falls back to SMS for Android; calls may go to a different number (call_number). */
export type OdeliaLine = { configured: boolean; imessage?: boolean; sms?: boolean; voice: boolean; number: string | null; display: string | null; call_number?: string | null; call_display?: string | null;
  /** Odelia's WhatsApp number, when WhatsApp is set up. */
  whatsapp?: string | null;
  /** Odelia's email address, when email is set up: write or forward to it from the address you sign in with. */
  email?: string | null };
const PHONE_CODES = ["pin_required", "phone_format", "phone_country", "phone_taken", "phone_rate_limited", "phone_busy", "phone_none", "mfa_required", "time_format"];
async function phoneRpc(name: string, args: Record<string, unknown> = {}): Promise<PhoneStatus> {
  const { data, error } = await supabase().rpc(name, args);
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") throw err("not_configured", "Texting Odelia isn't set up yet.");
    const code = PHONE_CODES.find(c => (error.message ?? "").includes(c));
    throw code ? err(code, error.message) : fromPg(error);
  }
  const d = data as PhoneStatus;
  return { link: d?.link ?? null, log: Array.isArray(d?.log) ? d.log : [], error: d?.error, text_code: d?.text_code, text_code_expires_at: d?.text_code_expires_at };
}
export const phoneStatus = () => phoneRpc("phone_status");
/** Texts a 6-digit code to the number (the settings PIN must be unlocked when it's on). */
export const phoneStart = (number: string, tz: string, lang: "en" | "zh") => phoneRpc("phone_link_start", { p_number: number, p_tz: tz, p_lang: lang });
/** Link by texting Odelia: returns a 6-digit code for the person to text to her from that number (iMessage lines
 *  answer people who wrote first). The code is only in this answer. */
export const phoneTextIn = (number: string, tz: string, lang: "en" | "zh") => phoneRpc("phone_link_text_in", { p_number: number, p_tz: tz, p_lang: lang });
/** A wrong code comes back as { error: "code_wrong" | "code_locked" | "code_expired" }, not a thrown error. */
export const phoneConfirm = (code: string) => phoneRpc("phone_link_confirm", { p_code: code });
export const phoneRemove = () => phoneRpc("phone_link_remove");
export const phonePrefs = (p: { texts?: boolean; calls?: boolean; quietStart?: string; quietEnd?: string; tz?: string; lang?: "en" | "zh" }) =>
  phoneRpc("phone_prefs", { p_texts: p.texts ?? null, p_calls: p.calls ?? null, p_quiet_start: p.quietStart ?? null, p_quiet_end: p.quietEnd ?? null, p_tz: p.tz ?? null, p_lang: p.lang ?? null });
export const odeliaLine = (): Promise<OdeliaLine> =>
  fn<OdeliaLine>("odelia-sms", { action: "line" }).catch(() => ({ configured: false, voice: false, number: null, display: null }));

/** The network for this workspace: live lessons for its places, agencies and forms, the network's size, the weekly
 *  first-try pass rate and agency timings (src/learning.ts). */
export async function networkView(ws: string, keys: string[]): Promise<import("../learning").NetworkView> {
  const { data, error } = await supabase().rpc("network_view", { p_ws: ws, p_keys: keys });
  if (error) throw fromPg(error);
  const d = (data ?? {}) as Partial<import("../learning").NetworkView>;
  return { lessons: d.lessons ?? [], curve: d.curve ?? [], businesses: d.businesses ?? 0, live: d.live ?? 0, forms: d.forms ?? [] };
}
