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

// ../../../../../../home/claude/placetta-agent/supabase/functions/logins/shared.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);
var SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
var SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
var ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
var NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
var admin = (0, import_supabase_js_2.createClient)(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: NO_SESSION });
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
async function requireStaffTwoStep(user, jwt) {
  if (!await isStaff(user)) throw new HttpError("forbidden", "Only the Placetta team can do that.");
  if (aalOf(jwt) !== "aal2") throw new HttpError("mfa_required", "Turn on two-step sign-in and use it to open saved logins.");
}
var same = (s) => ({ en: s, zh: s });
async function audit(entry, strict = false) {
  const { error } = await admin.from("audit_log").insert({ ...entry, detail: entry.detail ?? null });
  if (error) {
    console.error("audit insert failed:", error.code ?? "", error.message?.slice(0, 200) ?? "");
    if (strict) throw new Error("audit insert failed");
  }
}
var STATE_TTL_MS = 10 * 60 * 1e3;

// ../../../../../../home/claude/placetta-agent/supabase/functions/logins/index.ts
var LOGIN_COLUMNS = "id, workspace_id, agency, url, username, note, created_by, created_at, updated_at, last_opened_at, last_opened_by";
async function findLogin(ws, id) {
  const { data, error } = await admin.from("agency_logins").select("id, workspace_id, agency, url, username, note, secret_id").eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (error) throw new Error(`login lookup failed: ${error.code ?? ""}`);
  if (!data) throw new HttpError("not_found", "That saved login was not found.");
  return data;
}
function httpsUrl(v) {
  const s = optText(v, "url", 2e3);
  if (!s) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new HttpError("bad_request", "url must be a full https:// link.");
  }
  if (u.protocol !== "https:" || u.username || u.password) throw new HttpError("bad_request", "url must be a full https:// link.");
  return u.toString();
}
function password(v, required) {
  if (v === void 0 || v === null) {
    if (required) throw new HttpError("bad_request", "password is required.");
    return void 0;
  }
  if (typeof v !== "string" || v.length < 1) throw new HttpError("bad_request", "password is required.");
  if (v.length > 500) throw new HttpError("bad_request", "password is too long (at most 500 characters).");
  return v;
}
async function vaultPut(secret, ws, id) {
  const args = { p_secret: secret, p_name: `agency_login:${ws}` };
  if (id) args.p_id = id;
  const { data, error } = await admin.rpc("vault_put", args);
  if (error || typeof data !== "string") throw new Error(`vault write failed: ${error?.code ?? ""}`);
  return data;
}
async function vaultDrop(id) {
  const { error } = await admin.rpc("vault_drop", { p_id: id });
  if (error) console.error("vault drop failed:", error.code ?? "");
}
serve(async (req) => {
  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const action = body.action;
  if (action === "save") {
    await requireAccess(ws, user, jwt, "owner");
    const agency = text(body.agency, "agency", 1, 160);
    const username = text(body.username, "username", 1, 200);
    const url = httpsUrl(body.url);
    const note = optText(body.note, "note", 1e3);
    const id = body.id === void 0 || body.id === null || body.id === "" ? null : uuidParam(body.id, "id");
    const pw = password(body.password, !id);
    let login;
    if (id) {
      const row = await findLogin(ws, id);
      if (pw !== void 0) await vaultPut(pw, ws, row.secret_id);
      const { data, error } = await admin.from("agency_logins").update({ agency, url, username, note, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("workspace_id", ws).select(LOGIN_COLUMNS).single();
      if (error || !data) throw new Error(`login update failed: ${error?.code ?? ""}`);
      login = data;
    } else {
      const secretId = await vaultPut(pw, ws);
      const { data, error } = await admin.from("agency_logins").insert({ workspace_id: ws, agency, url, username, note, secret_id: secretId, created_by: user.id }).select(LOGIN_COLUMNS).single();
      if (error || !data) {
        await vaultDrop(secretId);
        throw new Error(`login insert failed: ${error?.code ?? ""}`);
      }
      login = data;
    }
    await audit({
      workspace_id: ws,
      actor: "you",
      actor_id: user.id,
      action: { en: "Saved a login", zh: "\u4FDD\u5B58\u767B\u5F55\u4FE1\u606F" },
      object: same(agency)
    });
    return ok({ login });
  }
  if (action === "reveal") {
    await requireStaffTwoStep(user, jwt);
    const id = uuidParam(body.id, "id");
    const row = await findLogin(ws, id);
    const { data: secret, error } = await admin.rpc("vault_get", { p_id: row.secret_id });
    if (error) throw new Error(`vault read failed: ${error.code ?? ""}`);
    if (typeof secret !== "string" || !secret) throw new HttpError("not_found", "The saved password is missing. Ask the customer to save it again.");
    await audit(
      {
        workspace_id: ws,
        actor: "team",
        actor_id: user.id,
        action: { en: "Opened your login to file", zh: "\u4E3A\u63D0\u4EA4\u7533\u8BF7\u6253\u5F00\u4E86\u60A8\u7684\u767B\u5F55\u4FE1\u606F" },
        object: same(row.agency),
        detail: same(user.email ?? "")
      },
      true
    );
    const { error: touchError } = await admin.from("agency_logins").update({ last_opened_at: (/* @__PURE__ */ new Date()).toISOString(), last_opened_by: user.id }).eq("id", row.id);
    if (touchError) console.error("last_opened update failed:", touchError.code ?? "");
    return ok({ agency: row.agency, url: row.url, username: row.username, password: secret });
  }
  if (action === "delete") {
    await requireAccess(ws, user, jwt, "owner");
    const id = uuidParam(body.id, "id");
    const row = await findLogin(ws, id);
    const { error } = await admin.from("agency_logins").delete().eq("id", row.id).eq("workspace_id", ws);
    if (error) throw new Error(`login delete failed: ${error.code ?? ""}`);
    await vaultDrop(row.secret_id);
    await audit({
      workspace_id: ws,
      actor: "you",
      actor_id: user.id,
      action: { en: "Removed a saved login", zh: "\u5220\u9664\u4E86\u5DF2\u4FDD\u5B58\u7684\u767B\u5F55\u4FE1\u606F" },
      object: same(row.agency)
    });
    return ok();
  }
  throw new HttpError("bad_request", "Unknown action. Use save, reveal or delete.");
});
