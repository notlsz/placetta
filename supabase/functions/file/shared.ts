// Shared helpers for the Placetta edge functions.
// The MCP deploy only uploads files inside a function's own folder, so this file is copied into
// integrations/, oauth-callback/, logins/, team/ and file/. Keep the copies identical.
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

export const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Service role client. Bypasses RLS: every caller must check membership or staff first. */
export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: NO_SESSION });

/** A client that acts as the signed-in user, for RPCs that check auth.uid(). */
export function userClient(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: NO_SESSION, global: { headers: { Authorization: `Bearer ${jwt}` } } });
}

// ------------------------------------------------------------------ responses

export type Code = "unauthorized" | "mfa_required" | "forbidden" | "bad_request" | "not_found" | "not_connected" | "not_configured" | "upstream_error" | "too_late";

const STATUS: Record<Code, number> = {
  unauthorized: 401,
  mfa_required: 401,
  forbidden: 403,
  bad_request: 400,
  not_found: 404,
  not_connected: 409,
  not_configured: 503,
  upstream_error: 502,
  too_late: 409,
};

export class HttpError extends Error {
  constructor(readonly code: Code, message: string) {
    super(message);
  }
}

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

export const ok = (data: Record<string, unknown> = {}): Response => json({ ok: true, ...data });

export const errorResponse = (code: Code, message: string): Response => json({ error: { code, message } }, STATUS[code]);

/** Deno.serve with CORS preflight and the error envelope. */
export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return errorResponse(e.code, e.message);
      console.error("unhandled:", describe(e));
      return json({ error: { code: "internal", message: "Something went wrong. Try again." } }, 500);
    }
  });
}

/** A short, secret-free description of an error for logs. */
export function describe(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 300);
  return "unknown error";
}

// ------------------------------------------------------------------ input

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method !== "POST") throw new HttpError("bad_request", "Use POST.");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError("bad_request", "Send a JSON body.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("bad_request", "Send a JSON object.");
  return body as Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function uuidParam(v: unknown, label: string): string {
  if (!isUuid(v)) throw new HttpError("bad_request", `${label} must be a valid id.`);
  return v.toLowerCase();
}

/** A required string, trimmed, with length limits. */
export function text(v: unknown, label: string, min: number, max: number): string {
  if (typeof v !== "string") throw new HttpError("bad_request", `${label} is required.`);
  const s = v.trim();
  if (s.length < min) throw new HttpError("bad_request", `${label} is required.`);
  if (s.length > max) throw new HttpError("bad_request", `${label} is too long (at most ${max} characters).`);
  return s;
}

/** An optional string: null when missing or blank. */
export function optText(v: unknown, label: string, max: number): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new HttpError("bad_request", `${label} must be text.`);
  const s = v.trim();
  if (!s) return null;
  if (s.length > max) throw new HttpError("bad_request", `${label} is too long (at most ${max} characters).`);
  return s;
}

// ------------------------------------------------------------------ who is calling

export async function requireUser(req: Request): Promise<{ user: User; jwt: string }> {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) throw new HttpError("unauthorized", "Sign in to continue.");
  const { data, error } = await admin.auth.getUser(m[1]);
  if (error || !data?.user) throw new HttpError("unauthorized", "Your session has expired. Sign in again.");
  return { user: data.user, jwt: m[1] };
}

/** The session's assurance level, from its JWT (already verified by getUser): "aal2" after two-step sign-in. */
export function aalOf(jwt: string): string {
  try {
    const part = jwt.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const claims = JSON.parse(atob(b64));
    return typeof claims.aal === "string" ? claims.aal : "aal1";
  } catch {
    return "aal1";
  }
}

export type Access = "owner" | "member" | "staff" | "mfa_required" | "staff_mfa_required" | "none";

/** What this user may do in this workspace: owner, member, staff (with two-step), or why not. Same rules as the database. */
export async function accessFor(ws: string, user: User, jwt: string): Promise<Access> {
  const { data, error } = await admin.rpc("access_for", { ws, uid: user.id, p_aal: aalOf(jwt) });
  if (!error) return String(data) as Access;
  if (error.code !== "PGRST202") throw new Error(`access lookup failed: ${error.code ?? ""}`);
  // Before the teams migration: members are owners, staff need only their email.
  const { data: m } = await admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
  if (m) return (m.role === "owner" ? "owner" : "member");
  return (await isStaff(user)) ? "staff" : "none";
}

export async function isMember(ws: string, uid: string): Promise<boolean> {
  const { data, error } = await admin.from("workspace_members").select("user_id").eq("workspace_id", ws).eq("user_id", uid).maybeSingle();
  if (error) throw new Error(`membership lookup failed: ${error.code ?? ""}`);
  return !!data;
}

/** Owners and members (need "member"), or owners only (need "owner"). Two-step is enforced for anyone who turned it on. */
export async function requireAccess(ws: string, user: User, jwt: string, need: "member" | "owner"): Promise<Access> {
  const a = await accessFor(ws, user, jwt);
  if (a === "mfa_required") throw new HttpError("mfa_required", "Finish two-step sign-in to continue.");
  if (a === "owner" || (need === "member" && a === "member")) return a;
  if (a === "member") throw new HttpError("forbidden", "Only an owner of this workspace can do that.");
  throw new HttpError("forbidden", "You are not a member of this workspace.");
}

/** Kept for callers that only need membership. */
export async function requireMember(ws: string, uid: string): Promise<void> {
  if (!(await isMember(ws, uid))) throw new HttpError("forbidden", "You are not a member of this workspace.");
}

/** Placetta staff: a confirmed auth email listed in staff_emails. */
export async function isStaff(user: User): Promise<boolean> {
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email || !user.email_confirmed_at) return false;
  const { data, error } = await admin.from("staff_emails").select("email").eq("email", email).maybeSingle();
  if (error) throw new Error(`staff lookup failed: ${error.code ?? ""}`);
  return !!data;
}

/** Placetta staff signed in with two-step: needed to open a customer's saved login. */
export async function requireStaffTwoStep(user: User, jwt: string): Promise<void> {
  if (!(await isStaff(user))) throw new HttpError("forbidden", "Only the Placetta team can do that.");
  if (aalOf(jwt) !== "aal2") throw new HttpError("mfa_required", "Turn on two-step sign-in and use it to open saved logins.");
}

// ------------------------------------------------------------------ audit log

export type L10n = { en: string; zh: string };
export const same = (s: string): L10n => ({ en: s, zh: s });

export type AuditEntry = {
  workspace_id: string;
  actor: "you" | "agent" | "team" | "agency";
  actor_id: string | null;
  action: L10n;
  object: L10n;
  detail?: L10n | null;
};

/**
 * Append an audit row. Best effort by default (the action already happened, so a failed log line
 * must not make the client retry it). With strict, a failure throws, so callers can refuse to act.
 */
export async function audit(entry: AuditEntry, strict = false): Promise<void> {
  const { error } = await admin.from("audit_log").insert({ ...entry, detail: entry.detail ?? null });
  if (error) {
    console.error("audit insert failed:", error.code ?? "", error.message?.slice(0, 200) ?? "");
    if (strict) throw new Error("audit insert failed");
  }
}

// ------------------------------------------------------------------ encoding and signing

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Return type left to inference so it stays a BufferSource under both older and newer TypeScript typings.
export const utf8 = (s: string) => new TextEncoder().encode(s);

export async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(data)));
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ------------------------------------------------------------------ OAuth state and return URLs

export type OAuthState = { ws: string; uid: string; kind: string; ret: string; exp: number; n: string };

export const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret(): string {
  const s = Deno.env.get("OAUTH_STATE_SECRET") ?? "";
  if (s.length < 16) throw new HttpError("not_configured", "OAuth is not configured. Set OAUTH_STATE_SECRET (at least 16 characters).");
  return s;
}

export async function signState(st: Omit<OAuthState, "exp" | "n">): Promise<string> {
  const payload = JSON.stringify({ ...st, exp: Date.now() + STATE_TTL_MS, n: b64urlEncode(crypto.getRandomValues(new Uint8Array(16))) });
  return `${b64urlEncode(utf8(payload))}.${b64urlEncode(await hmacSha256(stateSecret(), payload))}`;
}

/** The decoded state, or a short reason it was refused. */
export async function verifyState(raw: string | null): Promise<OAuthState | "invalid_state" | "expired" | "not_configured"> {
  if (!raw || raw.length > 4096) return "invalid_state";
  const dot = raw.indexOf(".");
  if (dot < 1) return "invalid_state";
  let secret: string;
  try {
    secret = stateSecret();
  } catch {
    return "not_configured";
  }
  try {
    const payload = new TextDecoder().decode(b64urlDecode(raw.slice(0, dot)));
    const sig = b64urlDecode(raw.slice(dot + 1));
    if (!timingSafeEqual(sig, await hmacSha256(secret, payload))) return "invalid_state";
    const st = JSON.parse(payload) as OAuthState;
    if (!isUuid(st.ws) || !isUuid(st.uid) || typeof st.kind !== "string" || typeof st.ret !== "string" || typeof st.exp !== "number") {
      return "invalid_state";
    }
    if (st.exp < Date.now()) return "expired";
    return st;
  } catch {
    return "invalid_state";
  }
}

/** Origins from APP_ORIGINS (comma separated), normalized. */
export function appOrigins(): string[] {
  return (Deno.env.get("APP_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => {
      try {
        const u = new URL(s);
        return u.protocol === "https:" || u.protocol === "http:" ? [u.origin] : [];
      } catch {
        return [];
      }
    });
}

/** ret when it belongs to an allowed origin (compared as parsed origins, not string prefixes), else null. */
export function allowedReturn(ret: unknown, origins: string[]): string | null {
  if (typeof ret !== "string" || !ret || ret.length > 2000) return null;
  try {
    const u = new URL(ret);
    return origins.includes(u.origin) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function withParam(url: string, key: string, value: string): string {
  const u = new URL(url);
  u.searchParams.delete("connected");
  u.searchParams.delete("connect_error");
  u.searchParams.set(key, value);
  return u.toString();
}
