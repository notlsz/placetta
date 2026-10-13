var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// dep:npm:@supabase/supabase-js@2
var require_supabase_js_2 = __commonJS({
  "dep:npm:@supabase/supabase-js@2"(exports, module) {
    module.exports = globalThis.__placettaDeps["npm:@supabase/supabase-js@2"];
  }
});

// ../../../../../../home/claude/placetta-agent/supabase/functions/integrations/shared.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);
var SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
var SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
var ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
var NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
var admin = (0, import_supabase_js_2.createClient)(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: NO_SESSION });
function userClient(jwt) {
  return (0, import_supabase_js_2.createClient)(SUPABASE_URL, ANON_KEY, { auth: NO_SESSION, global: { headers: { Authorization: `Bearer ${jwt}` } } });
}
var STATUS = {
  unauthorized: 401,
  mfa_required: 401,
  forbidden: 403,
  bad_request: 400,
  not_found: 404,
  not_connected: 409,
  not_configured: 503,
  upstream_error: 502
};
var HttpError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
  code;
};
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra }
  });
}
var ok = (data = {}) => json({ ok: true, ...data });
var errorResponse = (code, message) => json({ error: { code, message } }, STATUS[code]);
function serve(handler) {
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
function describe(e) {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 300);
  return "unknown error";
}
async function readBody(req) {
  if (req.method !== "POST") throw new HttpError("bad_request", "Use POST.");
  let body;
  try {
    body = await req.json();
  } catch {
    throw new HttpError("bad_request", "Send a JSON body.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("bad_request", "Send a JSON object.");
  return body;
}
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v) {
  return typeof v === "string" && UUID.test(v);
}
function uuidParam(v, label) {
  if (!isUuid(v)) throw new HttpError("bad_request", `${label} must be a valid id.`);
  return v.toLowerCase();
}
function text(v, label, min, max) {
  if (typeof v !== "string") throw new HttpError("bad_request", `${label} is required.`);
  const s = v.trim();
  if (s.length < min) throw new HttpError("bad_request", `${label} is required.`);
  if (s.length > max) throw new HttpError("bad_request", `${label} is too long (at most ${max} characters).`);
  return s;
}
function optText(v, label, max) {
  if (v === void 0 || v === null) return null;
  if (typeof v !== "string") throw new HttpError("bad_request", `${label} must be text.`);
  const s = v.trim();
  if (!s) return null;
  if (s.length > max) throw new HttpError("bad_request", `${label} is too long (at most ${max} characters).`);
  return s;
}
async function requireUser(req) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) throw new HttpError("unauthorized", "Sign in to continue.");
  const { data, error } = await admin.auth.getUser(m[1]);
  if (error || !data?.user) throw new HttpError("unauthorized", "Your session has expired. Sign in again.");
  return { user: data.user, jwt: m[1] };
}
function aalOf(jwt) {
  try {
    const part = jwt.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const claims = JSON.parse(atob(b64));
    return typeof claims.aal === "string" ? claims.aal : "aal1";
  } catch {
    return "aal1";
  }
}
async function accessFor(ws, user, jwt) {
  const { data, error } = await admin.rpc("access_for", { ws, uid: user.id, p_aal: aalOf(jwt) });
  if (!error) return String(data);
  if (error.code !== "PGRST202") throw new Error(`access lookup failed: ${error.code ?? ""}`);
  const { data: m } = await admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
  if (m) return m.role === "owner" ? "owner" : "member";
  return await isStaff(user) ? "staff" : "none";
}
async function requireAccess(ws, user, jwt, need) {
  const a = await accessFor(ws, user, jwt);
  if (a === "mfa_required") throw new HttpError("mfa_required", "Finish two-step sign-in to continue.");
  if (a === "owner" || need === "member" && a === "member") return a;
  if (a === "member") throw new HttpError("forbidden", "Only an owner of this workspace can do that.");
  throw new HttpError("forbidden", "You are not a member of this workspace.");
}
async function isStaff(user) {
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email || !user.email_confirmed_at) return false;
  const { data, error } = await admin.from("staff_emails").select("email").eq("email", email).maybeSingle();
  if (error) throw new Error(`staff lookup failed: ${error.code ?? ""}`);
  return !!data;
}
var same = (s) => ({ en: s, zh: s });
async function audit(entry, strict = false) {
  const { error } = await admin.from("audit_log").insert({ ...entry, detail: entry.detail ?? null });
  if (error) {
    console.error("audit insert failed:", error.code ?? "", error.message?.slice(0, 200) ?? "");
    if (strict) throw new Error("audit insert failed");
  }
}
function b64urlEncode(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
var utf8 = (s) => new TextEncoder().encode(s);
async function hmacSha256(secret, data) {
  const key = await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(data)));
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
var STATE_TTL_MS = 10 * 60 * 1e3;
function stateSecret() {
  const s = Deno.env.get("OAUTH_STATE_SECRET") ?? "";
  if (s.length < 16) throw new HttpError("not_configured", "OAuth is not configured. Set OAUTH_STATE_SECRET (at least 16 characters).");
  return s;
}
async function signState(st) {
  const payload = JSON.stringify({ ...st, exp: Date.now() + STATE_TTL_MS, n: b64urlEncode(crypto.getRandomValues(new Uint8Array(16))) });
  return `${b64urlEncode(utf8(payload))}.${b64urlEncode(await hmacSha256(stateSecret(), payload))}`;
}
function appOrigins() {
  return (Deno.env.get("APP_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean).flatMap((s) => {
    try {
      const u = new URL(s);
      return u.protocol === "https:" || u.protocol === "http:" ? [u.origin] : [];
    } catch {
      return [];
    }
  });
}
function allowedReturn(ret, origins) {
  if (typeof ret !== "string" || !ret || ret.length > 2e3) return null;
  try {
    const u = new URL(ret);
    return origins.includes(u.origin) ? u.toString() : null;
  } catch {
    return null;
  }
}

// ../../../../../../home/claude/placetta-agent/supabase/functions/integrations/providers.ts
var KINDS = ["gmail", "gcal", "gdrive", "outlook_mail", "outlook_cal", "dropbox", "quickbooks", "slack"];
var isKind = (v) => typeof v === "string" && KINDS.includes(v);
var PROVIDER = {
  gmail: "google",
  gcal: "google",
  gdrive: "google",
  outlook_mail: "microsoft",
  outlook_cal: "microsoft",
  dropbox: "dropbox",
  quickbooks: "quickbooks",
  slack: "slack"
};
var NAMES = {
  gmail: { en: "Gmail", zh: "Gmail" },
  gcal: { en: "Google Calendar", zh: "Google \u65E5\u5386" },
  gdrive: { en: "Google Drive", zh: "Google \u4E91\u7AEF\u786C\u76D8" },
  outlook_mail: { en: "Outlook Mail", zh: "Outlook \u90AE\u7BB1" },
  outlook_cal: { en: "Outlook Calendar", zh: "Outlook \u65E5\u5386" },
  dropbox: { en: "Dropbox", zh: "Dropbox" },
  quickbooks: { en: "QuickBooks", zh: "QuickBooks" },
  slack: { en: "Slack", zh: "Slack" }
};
var SCOPES = {
  gmail: "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
  gcal: "openid email https://www.googleapis.com/auth/calendar.events",
  gdrive: "openid email https://www.googleapis.com/auth/drive.readonly",
  outlook_mail: "offline_access User.Read Mail.Read Mail.Send",
  outlook_cal: "offline_access User.Read Calendars.ReadWrite",
  dropbox: "",
  quickbooks: "com.intuit.quickbooks.accounting",
  slack: "incoming-webhook"
};
var REDIRECT_URI = `${SUPABASE_URL}/functions/v1/oauth-callback`;
var ENV = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  microsoft: ["MS_CLIENT_ID", "MS_CLIENT_SECRET"],
  dropbox: ["DROPBOX_APP_KEY", "DROPBOX_APP_SECRET"],
  quickbooks: ["QB_CLIENT_ID", "QB_CLIENT_SECRET"],
  slack: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"]
};
var PROVIDER_NAME = {
  google: "Google",
  microsoft: "Microsoft",
  dropbox: "Dropbox",
  quickbooks: "QuickBooks",
  slack: "Slack"
};
function creds(p) {
  const [idVar, secretVar] = ENV[p];
  const id = Deno.env.get(idVar) ?? "";
  const secret = Deno.env.get(secretVar) ?? "";
  if (!id || !secret) throw new HttpError("not_configured", `${PROVIDER_NAME[p]} is not set up yet. Set ${idVar} and ${secretVar}.`);
  return { id, secret };
}
var msTenant = () => Deno.env.get("MS_TENANT") || "common";
var qbEnv = () => Deno.env.get("QB_ENV") === "production" ? "production" : "sandbox";
var qbApiBase = () => qbEnv() === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
var TOKEN_URL = {
  google: () => "https://oauth2.googleapis.com/token",
  microsoft: () => `https://login.microsoftonline.com/${encodeURIComponent(msTenant())}/oauth2/v2.0/token`,
  dropbox: () => "https://api.dropboxapi.com/oauth2/token",
  quickbooks: () => "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  slack: () => "https://slack.com/api/oauth.v2.access"
};
function authorizeUrl(kind, state) {
  const p = PROVIDER[kind];
  const { id } = creds(p);
  const q = new URLSearchParams({ client_id: id, redirect_uri: REDIRECT_URI, state });
  switch (p) {
    case "google":
      q.set("response_type", "code");
      q.set("scope", SCOPES[kind]);
      q.set("access_type", "offline");
      q.set("prompt", "consent");
      q.set("include_granted_scopes", "true");
      return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    case "microsoft":
      q.set("response_type", "code");
      q.set("response_mode", "query");
      q.set("scope", SCOPES[kind]);
      return `https://login.microsoftonline.com/${encodeURIComponent(msTenant())}/oauth2/v2.0/authorize?${q}`;
    case "dropbox":
      q.set("response_type", "code");
      q.set("token_access_type", "offline");
      return `https://www.dropbox.com/oauth2/authorize?${q}`;
    case "quickbooks":
      q.set("response_type", "code");
      q.set("scope", SCOPES[kind]);
      return `https://appcenter.intuit.com/connect/oauth2?${q}`;
    case "slack":
      q.set("scope", SCOPES[kind]);
      return `https://slack.com/oauth/v2/authorize?${q}`;
  }
}
var str = (v) => typeof v === "string" && v ? v : null;
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v && Number.isFinite(Number(v)) ? Number(v) : null;
async function tokenRequest(p, params) {
  const { id, secret } = creds(p);
  const headers = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  const form = new URLSearchParams(params);
  if (p === "quickbooks") headers.Authorization = `Basic ${btoa(`${id}:${secret}`)}`;
  else {
    form.set("client_id", id);
    form.set("client_secret", secret);
  }
  let res;
  try {
    res = await fetch(TOKEN_URL[p](), { method: "POST", headers, body: form, signal: AbortSignal.timeout(15e3) });
  } catch (e) {
    console.error(`${p} token endpoint unreachable:`, describe(e));
    throw new HttpError("upstream_error", `${PROVIDER_NAME[p]} did not respond. Try again.`);
  }
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  const status = p === "slack" && body.ok === false ? 400 : res.status;
  if (status >= 400) console.error(`${p} token endpoint ${status}:`, String(body.error ?? "").slice(0, 80));
  return { status, body };
}
function expiresAt(body) {
  const s = num(body.expires_in);
  return s ? Date.now() + s * 1e3 : null;
}
var RefreshRejected = class extends Error {
};
async function refreshBundle(kind, b) {
  const p = PROVIDER[kind];
  if (!b.refresh_token) throw new RefreshRejected("no refresh token");
  const params = { grant_type: "refresh_token", refresh_token: b.refresh_token };
  if (p === "microsoft") params.scope = SCOPES[kind];
  const t = await tokenRequest(p, params);
  const access = str(t.body.access_token);
  if (t.status === 400 || t.status === 401) throw new RefreshRejected(`refresh rejected ${t.status}`);
  if (t.status >= 400 || !access) throw new HttpError("upstream_error", `${NAMES[kind].en} did not refresh the sign-in. Try again.`);
  return {
    ...b,
    access_token: access,
    refresh_token: str(t.body.refresh_token) ?? b.refresh_token,
    expires_at: expiresAt(t.body) ?? Date.now() + 3600 * 1e3,
    token_type: str(t.body.token_type) ?? b.token_type
  };
}
var ROW_COLUMNS = "id, workspace_id, kind, account, scopes, status, error, secret_id, meta";
async function findIntegration(ws, kind) {
  const { data, error } = await admin.from("integrations").select(ROW_COLUMNS).eq("workspace_id", ws).eq("kind", kind).maybeSingle();
  if (error) throw new Error(`integration lookup failed: ${error.code ?? ""}`);
  return data ?? null;
}
async function listIntegrations(ws, kinds) {
  const { data, error } = await admin.from("integrations").select(ROW_COLUMNS).eq("workspace_id", ws).in("kind", kinds);
  if (error) throw new Error(`integration lookup failed: ${error.code ?? ""}`);
  return data ?? [];
}
async function readBundle(secretId) {
  if (!secretId) return null;
  const { data, error } = await admin.rpc("vault_get", { p_id: secretId });
  if (error) throw new Error(`vault read failed: ${error.code ?? ""}`);
  if (typeof data !== "string" || !data) return null;
  try {
    const b = JSON.parse(data);
    return typeof b.access_token === "string" ? b : null;
  } catch {
    return null;
  }
}
async function writeBundle(b, name, secretId) {
  const args = { p_secret: JSON.stringify(b), p_name: name };
  if (secretId) args.p_id = secretId;
  const { data, error } = await admin.rpc("vault_put", args);
  if (error || typeof data !== "string") throw new Error(`vault write failed: ${error?.code ?? ""}`);
  return data;
}
async function dropSecret(secretId) {
  if (!secretId) return;
  const { error } = await admin.rpc("vault_drop", { p_id: secretId });
  if (error) console.error("vault drop failed:", error.code ?? "");
}
var reconnect = (kind) => new HttpError("not_connected", `Reconnect ${NAMES[kind].en} in Settings.`);
var Conn = class _Conn {
  constructor(row, b) {
    this.row = row;
    this.b = b;
  }
  row;
  b;
  get kind() {
    return this.row.kind;
  }
  get name() {
    return NAMES[this.row.kind].en;
  }
  get bundle() {
    return this.b;
  }
  static async open(ws, kind) {
    const row = await findIntegration(ws, kind);
    if (!row) throw new HttpError("not_connected", `Connect ${NAMES[kind].en} in Settings.`);
    return _Conn.fromRow(row);
  }
  static async fromRow(row) {
    const b = await readBundle(row.secret_id);
    const c = new _Conn(row, b ?? { access_token: "", refresh_token: null, expires_at: null, token_type: null });
    if (!b) {
      await c.markError("The saved sign-in is missing. Reconnect in Settings.");
      throw reconnect(row.kind);
    }
    const { error } = await admin.from("integrations").update({ last_used_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", row.id);
    if (error) console.error("last_used_at update failed:", error.code ?? "");
    return c;
  }
  async markError(message) {
    const { error } = await admin.from("integrations").update({ status: "error", error: message }).eq("id", this.row.id);
    if (error) console.error("integration status update failed:", error.code ?? "");
    this.row.status = "error";
  }
  refreshing = null;
  /** A usable access token, refreshed when it expires within 60 seconds (or when forced). */
  async token(force = false) {
    const exp = this.b.expires_at;
    if (!force && (!exp || exp - Date.now() > 6e4)) return this.b.access_token;
    if (!this.b.refresh_token) {
      if (!force && exp && exp > Date.now()) return this.b.access_token;
      await this.markError("The sign-in expired. Reconnect in Settings.");
      throw reconnect(this.kind);
    }
    if (!this.refreshing) this.refreshing = this.refresh().finally(() => this.refreshing = null);
    return await this.refreshing;
  }
  async refresh() {
    try {
      this.b = await refreshBundle(this.kind, this.b);
    } catch (e) {
      if (e instanceof RefreshRejected) {
        await this.markError("The sign-in expired or access was removed. Reconnect in Settings.");
        throw reconnect(this.kind);
      }
      throw e;
    }
    await writeBundle(this.b, `integration:${this.kind}`, this.row.secret_id);
    if (this.row.status === "error") {
      await admin.from("integrations").update({ status: "connected", error: null }).eq("id", this.row.id);
      this.row.status = "connected";
    }
    return this.b.access_token;
  }
  /** fetch with the bearer token. Retries once after a forced refresh on 401. */
  async call(url, init = {}, timeoutMs = 2e4) {
    const go = async (tok) => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${tok}`);
      try {
        return await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
      } catch (e) {
        console.error(`${this.kind} request failed:`, describe(e));
        throw new HttpError("upstream_error", `${this.name} did not respond. Try again.`);
      }
    };
    let res = await go(await this.token());
    if (res.status === 401 && this.b.refresh_token) {
      await res.body?.cancel();
      res = await go(await this.token(true));
    }
    if (res.status === 401) {
      await res.body?.cancel();
      await this.markError("The sign-in was rejected. Reconnect in Settings.");
      throw reconnect(this.kind);
    }
    return res;
  }
  /** call, then parse JSON; any non-2xx becomes upstream_error. */
  async callJson(url, init = {}) {
    const res = await this.call(url, init);
    if (!res.ok) throw await this.upstream(res);
    if (res.status === 202 || res.status === 204) return {};
    return await res.json();
  }
  /** Log a provider error (status and error code only) and build the response error. */
  async upstream(res) {
    let code = "";
    try {
      const body = await res.json();
      const err = body.error;
      code = typeof err === "string" ? err : String(body.error_summary ?? err?.status ?? err?.code ?? "");
    } catch {
    }
    console.error(`${this.kind} upstream ${res.status}:`, code.slice(0, 80));
    if (res.status === 404 || res.status === 409 && /not_found/i.test(code)) {
      return new HttpError("not_found", `${this.name} could not find that item.`);
    }
    if (res.status === 403) return new HttpError("upstream_error", `${this.name} refused the request. Check the connection's permissions.`);
    return new HttpError("upstream_error", `${this.name} returned an error (${res.status}). Try again.`);
  }
};
async function grantShared(row) {
  const p = PROVIDER[row.kind];
  const kinds = KINDS.filter((k) => PROVIDER[k] === p);
  let q = admin.from("integrations").select("id").in("kind", kinds).neq("id", row.id).limit(1);
  if (p === "quickbooks") {
    const realm = typeof row.meta?.realm_id === "string" ? row.meta.realm_id : null;
    if (!realm) return true;
    q = q.eq("meta->>realm_id", realm);
  } else if (p === "slack") {
    const team = typeof row.meta?.team_id === "string" ? row.meta.team_id : null;
    if (!team) return true;
    q = q.eq("meta->>team_id", team);
  } else {
    if (!row.account) return true;
    q = q.eq("account", row.account);
  }
  const { data, error } = await q;
  if (error) return true;
  return (data?.length ?? 0) > 0;
}
async function revoke(row) {
  try {
    const p = PROVIDER[row.kind];
    if (p === "microsoft") return;
    const b = await readBundle(row.secret_id);
    if (!b) return;
    if (await grantShared(row)) return;
    const signal = AbortSignal.timeout(8e3);
    let res = null;
    switch (p) {
      case "google":
        res = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: b.refresh_token ?? b.access_token }),
          signal
        });
        break;
      case "dropbox": {
        let tok = b.access_token;
        if (b.expires_at && b.expires_at - Date.now() < 6e4 && b.refresh_token) tok = (await refreshBundle(row.kind, b)).access_token;
        res = await fetch("https://api.dropboxapi.com/2/auth/token/revoke", { method: "POST", headers: { Authorization: `Bearer ${tok}` }, signal });
        break;
      }
      case "quickbooks": {
        const { id, secret } = creds("quickbooks");
        res = await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", {
          method: "POST",
          headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ token: b.refresh_token ?? b.access_token }),
          signal
        });
        break;
      }
      case "slack":
        res = await fetch("https://slack.com/api/auth.revoke", { method: "POST", headers: { Authorization: `Bearer ${b.access_token}` }, signal });
        break;
    }
    if (res && !res.ok) console.error(`${row.kind} revoke ${res.status}`);
    await res?.body?.cancel();
  } catch (e) {
    console.error(`${row.kind} revoke skipped:`, describe(e));
  }
}

// ../../../../../../home/claude/placetta-agent/supabase/functions/integrations/index.ts
var GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
var GRAPH = "https://graph.microsoft.com/v1.0";
var DRIVE = "https://www.googleapis.com/drive/v3";
var MAX_IMPORT = 25 * 1024 * 1024;
var enc = encodeURIComponent;
var you = (c) => ({ workspace_id: c.ws, actor: "you", actor_id: c.user.id });
function kindParam(v, allowed) {
  if (!isKind(v) || !allowed.includes(v)) throw new HttpError("bad_request", `kind must be one of: ${allowed.join(", ")}.`);
  return v;
}
async function pickKind(ws, given, allowed, none) {
  if (given !== void 0 && given !== null && given !== "") return kindParam(given, allowed);
  const rows = await listIntegrations(ws, allowed);
  const k = allowed.find((a) => rows.some((r) => r.kind === a));
  if (!k) throw new HttpError("not_connected", none);
  return k;
}
function dateParam(v, label = "date") {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError("bad_request", `${label} must be YYYY-MM-DD.`);
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) throw new HttpError("bad_request", `${label} is not a real date.`);
  return v;
}
function nextDay(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
function intParam(v, label, min, max, dflt) {
  if ((v === void 0 || v === null || v === "") && dflt !== void 0) return dflt;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError("bad_request", `${label} must be a whole number from ${min} to ${max}.`);
  return n;
}
function idParam(v, label, max = 512) {
  if (typeof v !== "string" || !v || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) throw new HttpError("bad_request", `${label} is required.`);
  return v;
}
var isoDate = (v) => {
  const t = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
};
var ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  copy: "\xA9",
  reg: "\xAE",
  middot: "\xB7",
  bull: "\u2022"
};
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 1114112 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
function htmlToText(html) {
  return tidy(
    decodeEntities(
      html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<li\b[^>]*>/gi, "\n- ").replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote|section|article|ul|ol)\s*>/gi, "\n").replace(/<\/t[dh]\s*>/gi, "	").replace(/<[^>]+>/g, "")
    )
  );
}
function tidy(s) {
  return s.replace(/\r\n?/g, "\n").replace(/[ \t\u00a0]+/g, " ").split("\n").map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
function decodeBytes(bytes, charset) {
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
var header = (hs, name) => hs?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
var GMAIL_DEFAULT = "from:.gov OR permit OR license OR licence OR inspection OR application OR renewal OR \u8BB8\u53EF";
var GRAPH_DEFAULT = "from:gov OR permit OR license OR licence OR inspection OR application OR renewal OR \u8BB8\u53EF";
async function gmailSearch(c, days, query) {
  const q = query ? `${query} newer_than:${days}d` : `newer_than:${days}d (${GMAIL_DEFAULT})`;
  const list = await c.callJson(`${GMAIL}/messages?${new URLSearchParams({ q, maxResults: "25" })}`);
  const got = await Promise.allSettled(
    (list.messages ?? []).slice(0, 25).map(
      (m) => c.callJson(`${GMAIL}/messages/${enc(m.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)
    )
  );
  return got.flatMap((r) => {
    if (r.status !== "fulfilled") return [];
    const m = r.value;
    const h = m.payload?.headers;
    return [{
      kind: "gmail",
      id: m.id,
      from: header(h, "From"),
      subject: header(h, "Subject"),
      date: isoDate(m.internalDate) || isoDate(header(h, "Date")),
      snippet: decodeEntities(m.snippet ?? "")
    }];
  });
}
var graphAddr = (a) => {
  const name = a?.emailAddress?.name ?? "";
  const addr = a?.emailAddress?.address ?? "";
  return name && addr && name !== addr ? `${name} <${addr}>` : addr || name;
};
async function graphSearch(c, days, query) {
  const term = (query ?? GRAPH_DEFAULT).replace(/["\\]/g, " ").trim();
  const url = `${GRAPH}/me/messages?$search=${enc(`"${term}"`)}&$top=25&$select=id,from,subject,receivedDateTime,bodyPreview`;
  const res = await c.callJson(url);
  const since = Date.now() - days * 864e5;
  return (res.value ?? []).filter((m) => !m.receivedDateTime || Date.parse(m.receivedDateTime) >= since).map((m) => ({
    kind: "outlook_mail",
    id: m.id,
    from: graphAddr(m.from),
    subject: m.subject ?? "",
    date: isoDate(m.receivedDateTime),
    snippet: (m.bodyPreview ?? "").slice(0, 300)
  }));
}
var mailSearch = async (c) => {
  const days = intParam(c.body.days, "days", 1, 365, 60);
  const query = optText(c.body.query, "query", 200);
  const rows = await listIntegrations(c.ws, ["gmail", "outlook_mail"]);
  if (!rows.length) throw new HttpError("not_connected", "Connect Gmail or Outlook in Settings.");
  const results = await Promise.allSettled(
    rows.map(async (row) => {
      const conn = await Conn.fromRow(row);
      return row.kind === "gmail" ? gmailSearch(conn, days, query) : graphSearch(conn, days, query);
    })
  );
  const messages = results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
  const failed = results.flatMap((r, i) => r.status === "rejected" ? [{ kind: rows[i].kind, error: r.reason }] : []);
  if (failed.length === rows.length) throw failed[0].error;
  messages.sort((a, b) => b.date.localeCompare(a.date));
  const errors = failed.map((f) => ({
    kind: f.kind,
    message: f.error instanceof HttpError ? f.error.message : `${NAMES[f.kind].en} could not be searched.`
  }));
  return ok({ messages: messages.slice(0, 25), ...errors.length ? { errors } : {} });
};
var TEXT_LIMIT = 2e4;
var mailRead = async (c) => {
  const kind = kindParam(c.body.kind, ["gmail", "outlook_mail"]);
  const id = idParam(c.body.id, "id");
  const conn = await Conn.open(c.ws, kind);
  if (kind === "gmail") {
    const m2 = await conn.callJson(`${GMAIL}/messages/${enc(id)}?format=full`);
    let plain = null;
    let html = null;
    const attachments2 = [];
    const walk = (p, depth = 0) => {
      if (!p || depth > 20) return;
      const mime = (p.mimeType ?? "").toLowerCase();
      if (p.filename && p.body?.attachmentId) {
        attachments2.push({ id: p.body.attachmentId, name: p.filename, size: p.body.size ?? 0, mime: p.mimeType ?? "application/octet-stream" });
      } else if (p.body?.data && (mime === "text/plain" || mime === "text/html")) {
        const charset = /charset="?([^";\s]+)"?/i.exec(header(p.headers, "Content-Type"))?.[1] ?? null;
        const s = decodeBytes(b64urlDecode(p.body.data), charset);
        if (mime === "text/plain" && plain === null) plain = s;
        if (mime === "text/html" && html === null) html = s;
      }
      p.parts?.forEach((x) => walk(x, depth + 1));
    };
    walk(m2.payload);
    const h = m2.payload?.headers;
    const body2 = plain !== null ? tidy(plain) : html !== null ? htmlToText(html) : decodeEntities(m2.snippet ?? "");
    return ok({
      from: header(h, "From"),
      to: header(h, "To"),
      subject: header(h, "Subject"),
      date: isoDate(m2.internalDate) || isoDate(header(h, "Date")),
      text: body2.slice(0, TEXT_LIMIT),
      attachments: attachments2
    });
  }
  const m = await conn.callJson(`${GRAPH}/me/messages/${enc(id)}?$select=from,toRecipients,subject,receivedDateTime,body,hasAttachments`, {
    headers: { Prefer: 'outlook.body-content-type="text"' }
  });
  const content = m.body?.content ?? "";
  const body = (m.body?.contentType ?? "").toLowerCase() === "html" ? htmlToText(content) : tidy(content);
  let attachments = [];
  if (m.hasAttachments) {
    const a = await conn.callJson(
      `${GRAPH}/me/messages/${enc(id)}/attachments?$select=id,name,size,contentType,isInline`
    );
    attachments = (a.value ?? []).filter((x) => !x.isInline).map((x) => ({ id: x.id, name: x.name ?? "attachment", size: x.size ?? 0, mime: x.contentType ?? "application/octet-stream" }));
  }
  return ok({
    from: graphAddr(m.from),
    to: (m.toRecipients ?? []).map(graphAddr).filter(Boolean).join(", "),
    subject: m.subject ?? "",
    date: isoDate(m.receivedDateTime),
    text: body.slice(0, TEXT_LIMIT),
    attachments
  });
};
var EMAIL = /^[^\s@<>(),;:"[\]\\]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
function recipients(v) {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;]/) : [];
  const list = raw.map((x) => typeof x === "string" ? x.trim() : "").filter(Boolean);
  if (!list.length) throw new HttpError("bad_request", "to is required.");
  if (list.length > 20) throw new HttpError("bad_request", "Send to at most 20 recipients.");
  for (const a of list) if (a.length > 254 || !EMAIL.test(a)) throw new HttpError("bad_request", `${a.slice(0, 80)} is not a valid email address.`);
  return list;
}
function encodeHeader(s) {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const words = [];
  let chunk = "";
  for (const ch of s) {
    if (utf8(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${btoa(String.fromCharCode(...utf8(w)))}?=`).join("\r\n ");
}
function base64Lines(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return (btoa(bin).match(/.{1,76}/g) ?? []).join("\r\n");
}
var MAX_ATTACHMENTS = 5;
var MAX_ATTACH_BYTES = 15 * 1024 * 1024;
var GRAPH_INLINE_BYTES = 3 * 1024 * 1024;
async function loadAttachments(ws, v, allowed) {
  if (v === void 0 || v === null) return [];
  if (!Array.isArray(v)) throw new HttpError("bad_request", "attachments must be a list of { path }.");
  if (v.length > MAX_ATTACHMENTS) throw new HttpError("bad_request", `Attach at most ${MAX_ATTACHMENTS} files.`);
  const out = [];
  let total = 0;
  for (const a of v) {
    const path = typeof a?.path === "string" ? a.path : "";
    if (!path.startsWith(`${ws}/`) || path.includes("..") || path.length > 500) throw new HttpError("bad_request", "That file isn't in this workspace.");
    if (allowed && !allowed.has(path)) throw new HttpError("forbidden", "Only the files the customer approved can be attached.");
    const { data: doc, error } = await admin.from("documents").select("name, mime").eq("workspace_id", ws).eq("path", path).maybeSingle();
    if (error) throw new Error(`document lookup failed: ${error.code ?? ""}`);
    if (!doc) throw new HttpError("not_found", "That file isn't in Documents.");
    const dl = await admin.storage.from("documents").download(path);
    if (dl.error || !dl.data) throw new HttpError("not_found", `Couldn't open ${doc.name}.`);
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    total += bytes.length;
    if (total > MAX_ATTACH_BYTES) throw new HttpError("bad_request", "Attachments can be at most 15 MB in total.");
    out.push({ name: String(doc.name).replace(/[\r\n"]/g, " ").slice(0, 200), mime: doc.mime || "application/octet-stream", bytes });
  }
  return out;
}
var plainB64 = (bytes) => base64Lines(bytes).replace(/\r\n/g, "");
function gmailMime(to, subject, content, files) {
  const textPart = ['Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", base64Lines(utf8(content.replace(/\n/g, "\r\n")))];
  const head = [`To: ${to.join(", ")}`, `Subject: ${encodeHeader(subject)}`, "MIME-Version: 1.0"];
  if (!files.length) return [...head, ...textPart].join("\r\n");
  const boundary = `placetta_${b64urlEncode(crypto.getRandomValues(new Uint8Array(18)))}`;
  const parts = [`--${boundary}`, ...textPart];
  for (const f of files) {
    const name = encodeHeader(f.name);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${f.mime.replace(/[\r\n;"]/g, "")}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(f.bytes)
    );
  }
  parts.push(`--${boundary}--`, "");
  return [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n");
}
async function sendFrom(ws, kindParamValue, to, subject, content, files) {
  const kind = await pickKind(ws, kindParamValue, ["gmail", "outlook_mail"], "Connect Gmail or Outlook in Settings.");
  const conn = await Conn.open(ws, kind);
  let id = "";
  if (kind === "gmail") {
    const r = await conn.callJson(`${GMAIL}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: b64urlEncode(utf8(gmailMime(to, subject, content, files))) })
    });
    id = r.id ?? "";
  } else {
    const size = files.reduce((n, f) => n + f.bytes.length, 0);
    if (size > GRAPH_INLINE_BYTES) throw new HttpError("bad_request", "Outlook takes at most about 3 MB of attachments in one message. Send it by fax or mail instead.");
    const message = {
      subject,
      body: { contentType: "Text", content },
      toRecipients: to.map((address) => ({ emailAddress: { address } })),
      attachments: files.map((f) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: f.name, contentType: f.mime, contentBytes: plainB64(f.bytes) }))
    };
    const draft = await conn.callJson(`${GRAPH}/me/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    if (!draft.id) throw new HttpError("upstream_error", "Outlook didn't create the message. Try again.");
    await conn.callJson(`${GRAPH}/me/messages/${enc(draft.id)}/send`, { method: "POST" });
    id = draft.id;
  }
  return { kind, id, account: conn.row.account ?? "" };
}
function mailInput(body) {
  const to = recipients(body.to);
  const subject = text(body.subject, "subject", 1, 300).replace(/[\r\n]+/g, " ");
  if (typeof body.body !== "string" || !body.body.trim()) throw new HttpError("bad_request", "body is required.");
  if (body.body.length > 5e4) throw new HttpError("bad_request", "body is too long (at most 50000 characters).");
  return { to, subject, content: body.body.replace(/\r\n?/g, "\n") };
}
var mailSend = async (c) => {
  if (c.body.approved !== true) throw new HttpError("bad_request", "The customer must approve this message before it is sent.");
  const { to, subject, content } = mailInput(c.body);
  const files = await loadAttachments(c.ws, c.body.attachments);
  const { kind, account } = await sendFrom(c.ws, c.body.kind, to, subject, content, files);
  const list = to.join(", ");
  const via = account ? ` (${account})` : "";
  await audit({
    ...you(c),
    action: { en: `Sent email to ${list}`, zh: `\u5DF2\u53D1\u9001\u90AE\u4EF6\u81F3 ${list}` },
    object: same(subject),
    detail: { en: `Via ${NAMES[kind].en}${via}${files.length ? `, ${files.length} attached` : ""}`, zh: `\u901A\u8FC7 ${NAMES[kind].zh}${via}${files.length ? `\uFF0C\u9644\u4EF6 ${files.length} \u4E2A` : ""}` }
  });
  return ok({ kind });
};
async function filerMailSend(body) {
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const filingId = uuidParam(body.filing_id, "filing_id");
  const { data: f, error } = await admin.from("filings").select("id, workspace_id, payload, agent_state, channel, submit_clicked_at").eq("id", filingId).eq("workspace_id", ws).maybeSingle();
  if (error) throw new Error(`filing lookup failed: ${error.code ?? ""}`);
  if (!f) throw new HttpError("not_found", "No such filing.");
  if (f.agent_state !== "running" || f.channel !== "email") throw new HttpError("forbidden", "This filing isn't being sent by email right now.");
  if (!f.submit_clicked_at) throw new HttpError("forbidden", "Record the send before sending.");
  const p = f.payload ?? {};
  const approved = new Set([p.pdf_path, ...Array.isArray(p.attachments) ? p.attachments.map((a) => a?.path) : []].filter((x) => typeof x === "string"));
  const { to, subject, content } = mailInput(body);
  const files = await loadAttachments(ws, body.attachments, approved);
  return ok(await sendFrom(ws, body.kind, to, subject, content, files));
}
async function fromFiler(req) {
  const got = req.headers.get("x-filer-secret");
  if (!got) return false;
  const want = Deno.env.get("FILER_SECRET") ?? "";
  if (want.length < 32) throw new HttpError("not_configured", "FILER_SECRET is not set.");
  const k = "placetta-filer";
  if (!timingSafeEqual(await hmacSha256(k + want, got), await hmacSha256(k + want, want))) throw new HttpError("unauthorized", "Wrong filer key.");
  return true;
}
var calendarAdd = async (c) => {
  const title = text(c.body.title, "title", 1, 300);
  const date = dateParam(c.body.date);
  const notes = optText(c.body.notes, "notes", 5e3);
  const tz = optText(c.body.time_zone, "time_zone", 64) ?? "UTC";
  if (!/^[A-Za-z0-9_+\-/ .()]+$/.test(tz)) throw new HttpError("bad_request", "time_zone is not valid.");
  const kind = await pickKind(c.ws, c.body.kind, ["gcal", "outlook_cal"], "Connect Google Calendar or Outlook Calendar in Settings.");
  const conn = await Conn.open(c.ws, kind);
  const end = nextDay(date);
  let link;
  if (kind === "gcal") {
    const ev = await conn.callJson("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: title, description: notes ?? void 0, start: { date }, end: { date: end }, transparency: "transparent" })
    });
    link = ev.htmlLink;
  } else {
    const ev = await conn.callJson(`${GRAPH}/me/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: title,
        body: { contentType: "text", content: notes ?? "" },
        start: { dateTime: `${date}T00:00:00`, timeZone: tz },
        end: { dateTime: `${end}T00:00:00`, timeZone: tz },
        isAllDay: true,
        showAs: "free"
      })
    });
    link = ev.webLink;
  }
  await audit({
    ...you(c),
    action: { en: "Added to your calendar", zh: "\u5DF2\u6DFB\u52A0\u5230\u60A8\u7684\u65E5\u5386" },
    object: same(title),
    detail: { en: `${date}, ${NAMES[kind].en}`, zh: `${date}\uFF0C${NAMES[kind].zh}` }
  });
  return ok(link ? { link } : {});
};
var MIME_BY_EXT = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  tif: "image/tiff",
  tiff: "image/tiff",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};
var mimeOf = (name) => MIME_BY_EXT[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
var filesSearch = async (c) => {
  const kind = kindParam(c.body.kind, ["gdrive", "dropbox"]);
  const query = text(c.body.query, "query", 1, 200);
  const conn = await Conn.open(c.ws, kind);
  let files;
  if (kind === "gdrive") {
    const esc = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const q = `name contains '${esc}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
    const params = new URLSearchParams({
      q,
      pageSize: "25",
      orderBy: "modifiedTime desc",
      fields: "files(id,name,size,modifiedTime,mimeType)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true"
    });
    const res = await conn.callJson(`${DRIVE}/files?${params}`);
    files = (res.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size ? Number(f.size) : null,
      modified: f.modifiedTime ?? null,
      mime: f.mimeType ?? "application/octet-stream"
    }));
  } else {
    const res = await conn.callJson("https://api.dropboxapi.com/2/files/search_v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, options: { max_results: 25, file_status: "active" } })
    });
    files = (res.matches ?? []).map((m) => m.metadata?.metadata).filter((m) => !!m && m[".tag"] === "file" && !!m.id && !!m.name).map((m) => ({ id: m.id, name: m.name, size: m.size ?? null, modified: m.server_modified ?? null, mime: mimeOf(m.name) }));
  }
  return ok({ files: files.slice(0, 25) });
};
var TOO_BIG = () => new HttpError("bad_request", "Files over 25 MB can't be imported.");
async function readCapped(res) {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_IMPORT) {
    await res.body?.cancel();
    throw TOO_BIG();
  }
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_IMPORT) {
      await reader.cancel();
      throw TOO_BIG();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const ch of chunks) {
    out.set(ch, at);
    at += ch.length;
  }
  return out;
}
function safeFileName(name) {
  const dot = name.lastIndexOf(".");
  const rawBase = dot > 0 ? name.slice(0, dot) : name;
  const rawExt = dot > 0 ? name.slice(dot + 1) : "";
  const base = rawBase.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^[._-]+|[._-]+$/g, "").slice(0, 100) || "file";
  const ext = rawExt.replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toLowerCase();
  return ext ? `${base}.${ext}` : base;
}
var asciiJson = (v) => JSON.stringify(v).replace(/[\u007f-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
var GOOGLE_EXPORTABLE = /* @__PURE__ */ new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.drawing"
]);
async function findApp(ws, appId) {
  if (!appId) return null;
  const { data, error } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
  if (error) throw new Error(`workspace lookup failed: ${error.code ?? ""}`);
  const apps = data?.state?.apps;
  const app = Array.isArray(apps) ? apps.find((a) => a && String(a.id) === appId) : void 0;
  if (!app) throw new HttpError("bad_request", "That application is not in this workspace.");
  return app;
}
var filesImport = async (c) => {
  const kind = kindParam(c.body.kind, ["gdrive", "dropbox"]);
  const fileId = idParam(c.body.file_id, "file_id", 300);
  const app = await findApp(c.ws, optText(c.body.app_id, "app_id", 100));
  const conn = await Conn.open(c.ws, kind);
  let name;
  let mime;
  let bytes;
  if (kind === "gdrive") {
    const meta = await conn.callJson(
      `${DRIVE}/files/${enc(fileId)}?fields=id,name,mimeType,size&supportsAllDrives=true`
    );
    let url;
    if (meta.mimeType.startsWith("application/vnd.google-apps.")) {
      if (!GOOGLE_EXPORTABLE.has(meta.mimeType)) throw new HttpError("bad_request", "This file type can't be imported.");
      url = `${DRIVE}/files/${enc(fileId)}/export?mimeType=application%2Fpdf`;
      name = /\.pdf$/i.test(meta.name) ? meta.name : `${meta.name}.pdf`;
      mime = "application/pdf";
    } else {
      if (Number(meta.size ?? "0") > MAX_IMPORT) throw TOO_BIG();
      url = `${DRIVE}/files/${enc(fileId)}?alt=media&supportsAllDrives=true`;
      name = meta.name;
      mime = meta.mimeType || mimeOf(meta.name);
    }
    const res = await conn.call(url, {}, 6e4);
    if (!res.ok) throw await conn.upstream(res);
    bytes = await readCapped(res);
  } else {
    const meta = await conn.callJson("https://api.dropboxapi.com/2/files/get_metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: fileId })
    });
    if (meta[".tag"] !== "file" || !meta.name) throw new HttpError("bad_request", "Pick a file, not a folder.");
    if ((meta.size ?? 0) > MAX_IMPORT) throw TOO_BIG();
    const res = await conn.call("https://content.dropboxapi.com/2/files/download", { method: "POST", headers: { "Dropbox-API-Arg": asciiJson({ path: fileId }) } }, 6e4);
    if (!res.ok) throw await conn.upstream(res);
    bytes = await readCapped(res);
    name = meta.name;
    mime = mimeOf(meta.name);
  }
  const display = name.trim().slice(0, 200) || "file";
  const path = `${c.ws}/${crypto.randomUUID()}/${safeFileName(display)}`;
  const up = await admin.storage.from("documents").upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) {
    console.error("storage upload failed:", up.error.message?.slice(0, 120) ?? "");
    throw new Error("storage upload failed");
  }
  const { data: doc, error } = await admin.from("documents").insert({ workspace_id: c.ws, app_id: app ? String(app.id) : null, name: display, path, size: bytes.length, mime, source: "customer", uploaded_by: c.user.id }).select("id, name, path, size, mime").single();
  if (error || !doc) {
    await admin.storage.from("documents").remove([path]);
    console.error("documents insert failed:", error?.code ?? "");
    throw new Error("documents insert failed");
  }
  await audit({
    ...you(c),
    action: { en: `Imported from ${NAMES[kind].en}`, zh: `\u4ECE ${NAMES[kind].zh} \u5BFC\u5165` },
    object: same(display),
    detail: app?.name ? { en: `For ${app.name.en ?? app.name.zh}`, zh: `\u7528\u4E8E ${app.name.zh ?? app.name.en}` } : null
  });
  return ok({ document: doc });
};
function totalIncome(rows, depth = 0) {
  if (!rows || depth > 10) return null;
  for (const r of rows) {
    const label = r.Summary?.ColData?.[0]?.value ?? "";
    if (r.group === "Income" || /^total income$/i.test(label)) {
      const v = Number(r.Summary?.ColData?.[1]?.value ?? "");
      if (Number.isFinite(v)) return v;
    }
  }
  for (const r of rows) {
    const v = totalIncome(r.Rows?.Row, depth + 1);
    if (v !== null) return v;
  }
  return null;
}
var booksIncome = async (c) => {
  const year = intParam(c.body.year, "year", 2e3, (/* @__PURE__ */ new Date()).getUTCFullYear() + 1);
  const conn = await Conn.open(c.ws, "quickbooks");
  const realm = typeof conn.row.meta?.realm_id === "string" ? conn.row.meta.realm_id : "";
  if (!/^\d+$/.test(realm)) throw new HttpError("not_connected", "Reconnect QuickBooks in Settings.");
  const base = conn.row.meta?.env === "production" ? "https://quickbooks.api.intuit.com" : conn.row.meta?.env === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : qbApiBase();
  const report = await conn.callJson(
    `${base}/v3/company/${realm}/reports/ProfitAndLoss?start_date=${year}-01-01&end_date=${year}-12-31`,
    { headers: { Accept: "application/json" } }
  );
  return ok({ year, total_income: totalIncome(report.Rows?.Row) ?? 0, currency: report.Header?.Currency ?? null, company: conn.row.account });
};
var slackPost = async (c) => {
  const msg = text(c.body.text, "text", 1, 4e3);
  const conn = await Conn.open(c.ws, "slack");
  const hook = conn.bundle.webhook_url;
  if (!hook || !hook.startsWith("https://hooks.slack.com/")) {
    await conn.markError("The Slack channel link is missing. Reconnect in Settings.");
    throw new HttpError("not_connected", "Reconnect Slack in Settings.");
  }
  let res;
  try {
    res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }),
      signal: AbortSignal.timeout(15e3)
    });
  } catch {
    throw new HttpError("upstream_error", "Slack did not respond. Try again.");
  }
  const reply = (await res.text()).slice(0, 80);
  if (res.ok) return ok();
  console.error(`slack webhook ${res.status}:`, reply);
  if ([403, 404, 410].includes(res.status)) {
    await conn.markError("The Slack channel is no longer available. Reconnect in Settings.");
    throw new HttpError("not_connected", "Reconnect Slack in Settings.");
  }
  throw new HttpError("upstream_error", `Slack returned an error (${res.status}). Try again.`);
};
var connect = async (c) => {
  const kind = kindParam(c.body.kind, ["gmail", "gcal", "gdrive", "outlook_mail", "outlook_cal", "dropbox", "quickbooks", "slack"]);
  creds(PROVIDER[kind]);
  const origins = appOrigins();
  if (!origins.length) throw new HttpError("not_configured", "OAuth is not configured. Set APP_ORIGINS.");
  const ret = allowedReturn(c.body.return_to, origins) ?? `${origins[0]}/`;
  const state = await signState({ ws: c.ws, uid: c.user.id, kind, ret });
  return ok({ url: authorizeUrl(kind, state) });
};
var PENDING_ID = /^[0-9a-f]{64}$/;
async function sweepPending() {
  const { data, error } = await admin.from("oauth_pending").delete().lt("expires_at", (/* @__PURE__ */ new Date()).toISOString()).select("secret_id");
  if (error) {
    console.error("pending sweep failed:", error.code ?? "");
    return;
  }
  for (const r of data ?? []) await dropSecret(r.secret_id);
}
var finish = async (c) => {
  const id = typeof c.body.id === "string" ? c.body.id : "";
  if (!PENDING_ID.test(id)) throw new HttpError("bad_request", "id is not valid.");
  await sweepPending();
  const { data, error } = await admin.from("oauth_pending").delete().eq("id", id).select("workspace_id, user_id, kind, secret_id, account, scopes, meta, expires_at");
  if (error) throw new Error(`pending claim failed: ${error.code ?? ""}`);
  const p = data?.[0];
  const gone = () => new HttpError("not_found", "This sign-in expired or was already used. Connect again.");
  if (!p) throw gone();
  if (Date.parse(p.expires_at) <= Date.now()) {
    await dropSecret(p.secret_id);
    throw gone();
  }
  let member = false;
  try {
    member = await accessFor(c.ws, c.user, c.jwt) === "owner";
  } catch (e) {
    await dropSecret(p.secret_id);
    throw e;
  }
  if (p.user_id !== c.user.id || p.workspace_id !== c.ws || !member || !isKind(p.kind)) {
    await dropSecret(p.secret_id);
    throw new HttpError("forbidden", "This connection was started by someone else. Connect again from Settings.");
  }
  const kind = p.kind;
  const existing = await findIntegration(c.ws, kind);
  const { error: upsertError } = await admin.from("integrations").upsert(
    {
      workspace_id: c.ws,
      kind,
      account: p.account,
      scopes: p.scopes,
      status: "connected",
      error: null,
      secret_id: p.secret_id,
      meta: p.meta ?? {},
      connected_by: c.user.id,
      connected_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    { onConflict: "workspace_id,kind" }
  );
  if (upsertError) {
    await dropSecret(p.secret_id);
    throw new Error(`integration upsert failed: ${upsertError.code ?? ""}`);
  }
  if (existing?.secret_id && existing.secret_id !== p.secret_id) await dropSecret(existing.secret_id);
  await audit({
    ...you(c),
    action: { en: `Connected ${NAMES[kind].en}`, zh: `\u5DF2\u8FDE\u63A5 ${NAMES[kind].zh}` },
    object: NAMES[kind],
    detail: p.account ? same(p.account) : null
  });
  return ok({ kind, account: p.account });
};
var disconnect = async (c) => {
  const kind = kindParam(c.body.kind, ["gmail", "gcal", "gdrive", "outlook_mail", "outlook_cal", "dropbox", "quickbooks", "slack"]);
  const row = await findIntegration(c.ws, kind);
  if (!row) throw new HttpError("not_found", `${NAMES[kind].en} is not connected.`);
  await revoke(row);
  const { error } = await admin.from("integrations").delete().eq("id", row.id);
  if (error) throw new Error(`integration delete failed: ${error.code ?? ""}`);
  await dropSecret(row.secret_id);
  await audit({
    ...you(c),
    action: { en: `Disconnected ${NAMES[kind].en}`, zh: `\u5DF2\u65AD\u5F00 ${NAMES[kind].zh}` },
    object: NAMES[kind],
    detail: row.account ? same(row.account) : null
  });
  return ok();
};
var feedUrl = async (c) => {
  const rotate = c.body.rotate === true;
  const { data, error } = await userClient(c.jwt).rpc("calendar_token", { ws: c.ws, p_rotate: rotate });
  if (error || typeof data !== "string") {
    console.error("calendar_token failed:", error?.code ?? "");
    if (/not your workspace/i.test(error?.message ?? "")) throw new HttpError("forbidden", "You are not a member of this workspace.");
    if (/only an owner/i.test(error?.message ?? "")) throw new HttpError("forbidden", "Only an owner can reset the calendar link.");
    throw new Error("calendar_token failed");
  }
  if (rotate) {
    await audit({
      ...you(c),
      action: { en: "Reset the calendar feed link", zh: "\u91CD\u7F6E\u4E86\u65E5\u5386\u8BA2\u9605\u94FE\u63A5" },
      object: { en: "Calendar feed", zh: "\u65E5\u5386\u8BA2\u9605" }
    });
  }
  return ok({ url: `${SUPABASE_URL}/functions/v1/calendar-feed?t=${enc(data)}` });
};
var ACTIONS = {
  connect,
  finish,
  disconnect,
  calendar_add: calendarAdd,
  mail_search: mailSearch,
  mail_read: mailRead,
  mail_send: mailSend,
  files_search: filesSearch,
  files_import: filesImport,
  books_income: booksIncome,
  slack_post: slackPost,
  feed_url: feedUrl
};
var OWNER_ONLY = /* @__PURE__ */ new Set([connect, disconnect, mailSend, slackPost]);
serve(async (req) => {
  if (await fromFiler(req)) {
    const body2 = await readBody(req);
    if (body2.action !== "mail_send") throw new HttpError("bad_request", "The filer may only send mail.");
    return await filerMailSend(body2);
  }
  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const action = typeof body.action === "string" && Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
  if (!action) throw new HttpError("bad_request", `Unknown action. Use one of: ${Object.keys(ACTIONS).join(", ")}.`);
  if (action !== finish) await requireAccess(ws, user, jwt, OWNER_ONLY.has(action) ? "owner" : "member");
  return await action({ user, jwt, ws, body });
});
export {
  gmailMime
};
