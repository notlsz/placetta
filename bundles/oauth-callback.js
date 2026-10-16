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

// supabase/functions/oauth-callback/shared.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);
var SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
var SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
var ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
var NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
var admin = (0, import_supabase_js_2.createClient)(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: NO_SESSION });
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
function describe(e) {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 300);
  return "unknown error";
}
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v) {
  return typeof v === "string" && UUID.test(v);
}
async function isMember(ws, uid) {
  const { data, error } = await admin.from("workspace_members").select("user_id").eq("workspace_id", ws).eq("user_id", uid).maybeSingle();
  if (error) throw new Error(`membership lookup failed: ${error.code ?? ""}`);
  return !!data;
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
async function verifyState(raw) {
  if (!raw || raw.length > 4096) return "invalid_state";
  const dot = raw.indexOf(".");
  if (dot < 1) return "invalid_state";
  let secret;
  try {
    secret = stateSecret();
  } catch {
    return "not_configured";
  }
  try {
    const payload = new TextDecoder().decode(b64urlDecode(raw.slice(0, dot)));
    const sig = b64urlDecode(raw.slice(dot + 1));
    if (!timingSafeEqual(sig, await hmacSha256(secret, payload))) return "invalid_state";
    const st = JSON.parse(payload);
    if (!isUuid(st.ws) || !isUuid(st.uid) || typeof st.kind !== "string" || typeof st.ret !== "string" || typeof st.exp !== "number") {
      return "invalid_state";
    }
    if (st.exp < Date.now()) return "expired";
    return st;
  } catch {
    return "invalid_state";
  }
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
function withParam(url, key, value) {
  const u = new URL(url);
  u.searchParams.delete("connected");
  u.searchParams.delete("connect_error");
  u.searchParams.set(key, value);
  return u.toString();
}

// supabase/functions/oauth-callback/providers.ts
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
function jwtEmail(idToken) {
  if (typeof idToken !== "string") return null;
  try {
    const part = idToken.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4);
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    return str(claims.email);
  } catch {
    return null;
  }
}
async function getJson(url, init) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15e3) });
    if (!res.ok) {
      console.error(`account lookup ${res.status} at ${new URL(url).host}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error("account lookup failed:", describe(e));
    return null;
  }
}
async function exchangeCode(kind, code, realmId) {
  const p = PROVIDER[kind];
  const params = { grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI };
  if (p === "microsoft") params.scope = SCOPES[kind];
  if (p === "quickbooks" && !(realmId && /^\d{1,32}$/.test(realmId))) throw new HttpError("bad_request", "missing_realm");
  const t = await tokenRequest(p, params);
  const access = str(t.body.access_token);
  if (t.status >= 400 || !access) throw new HttpError("upstream_error", "token_exchange");
  const bundle = {
    access_token: access,
    refresh_token: str(t.body.refresh_token),
    expires_at: expiresAt(t.body),
    token_type: str(t.body.token_type)
  };
  const auth = { Authorization: `Bearer ${access}`, Accept: "application/json" };
  let account = null;
  let scopes = str(t.body.scope) ?? SCOPES[kind];
  const meta = {};
  switch (p) {
    case "google": {
      account = jwtEmail(t.body.id_token);
      if (!account) account = str((await getJson("https://openidconnect.googleapis.com/v1/userinfo", { headers: auth }))?.email);
      break;
    }
    case "microsoft": {
      const me = await getJson("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: auth });
      account = str(me?.mail) ?? str(me?.userPrincipalName);
      break;
    }
    case "dropbox": {
      const me = await getJson("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: "null"
      });
      account = str(me?.email);
      if (str(t.body.account_id)) meta.account_id = t.body.account_id;
      break;
    }
    case "quickbooks": {
      const realm = realmId;
      meta.realm_id = realm;
      meta.env = qbEnv();
      const info = await getJson(`${qbApiBase()}/v3/company/${realm}/companyinfo/${realm}`, { headers: auth });
      account = str(info?.CompanyInfo?.CompanyName);
      break;
    }
    case "slack": {
      const hook = t.body.incoming_webhook ?? {};
      const team = t.body.team ?? {};
      const url = str(hook.url);
      if (!url || !url.startsWith("https://hooks.slack.com/")) throw new HttpError("upstream_error", "no_webhook");
      bundle.webhook_url = url;
      account = str(team.name);
      meta.channel = str(hook.channel);
      meta.channel_id = str(hook.channel_id);
      meta.team_id = str(team.id);
      scopes = str(t.body.scope) ?? SCOPES.slack;
      break;
    }
  }
  return { bundle, account, scopes, meta };
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

// supabase/functions/oauth-callback/index.ts
var RESULT_PARAMS = ["connected", "connect_error", "connect_finish", "kind"];
function redirect(to) {
  return new Response(null, {
    status: 302,
    headers: { ...CORS_HEADERS, Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }
  });
}
function withParams(url, params) {
  const u = new URL(url);
  for (const k of RESULT_PARAMS) u.searchParams.delete(k);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}
var hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  const origins = appOrigins();
  const fallback = origins.length ? `${origins[0]}/` : null;
  const refuse = (code2) => fallback ? redirect(withParam(fallback, "connect_error", code2)) : json({ error: { code: "bad_request", message: "This sign-in link is not valid." } }, 400);
  if (req.method !== "GET") return refuse("bad_request");
  const q = new URL(req.url).searchParams;
  const st = await verifyState(q.get("state"));
  if (typeof st === "string") return refuse(st);
  if (!isKind(st.kind)) return refuse("invalid_state");
  const kind = st.kind;
  const ret = allowedReturn(st.ret, origins) ?? fallback;
  if (!ret) return refuse("invalid_state");
  const fail = (code2) => redirect(withParams(ret, { connect_error: code2 }));
  const denied = q.get("error");
  if (denied) return fail(denied === "access_denied" ? "denied" : "provider_error");
  const code = q.get("code");
  if (!code || code.length > 4096) return fail("missing_code");
  try {
    if (!await isMember(st.ws, st.uid)) return fail("forbidden");
  } catch (e) {
    console.error("membership check failed:", describe(e));
    return fail("server_error");
  }
  let ex;
  try {
    ex = await exchangeCode(kind, code, q.get("realmId"));
  } catch (e) {
    if (e instanceof HttpError) {
      const short = e.code === "not_configured" ? "not_configured" : e.message === "missing_realm" ? "missing_realm" : e.message === "no_webhook" ? "no_webhook" : "token_exchange";
      console.error(`${kind} code exchange failed:`, short);
      return fail(short);
    }
    console.error(`${kind} code exchange failed:`, describe(e));
    return fail("token_exchange");
  }
  let secretId = null;
  try {
    secretId = await writeBundle(ex.bundle, `integration:${kind}:${st.ws}`, null);
    const id = hex(crypto.getRandomValues(new Uint8Array(32)));
    const { error } = await admin.from("oauth_pending").insert({
      id,
      workspace_id: st.ws,
      user_id: st.uid,
      kind,
      secret_id: secretId,
      account: ex.account,
      scopes: ex.scopes,
      meta: ex.meta
    });
    if (error) throw new Error(`pending insert failed: ${error.code ?? ""}`);
    return redirect(withParams(ret, { connect_finish: id, kind }));
  } catch (e) {
    console.error(`${kind} save failed:`, describe(e));
    await dropSecret(secretId);
    return fail("save_failed");
  }
});
