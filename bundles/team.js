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

// ../../../../../../home/claude/placetta-agent/supabase/functions/team/index.ts
var import_supabase_js_22 = __toESM(require_supabase_js_2(), 1);

// ../../../../../../home/claude/placetta-agent/supabase/functions/team/shared.ts
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
var STATE_TTL_MS = 10 * 60 * 1e3;
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

// ../../../../../../home/claude/placetta-agent/supabase/functions/team/index.ts
var ANON_KEY2 = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
async function sendInvite(email, redirectTo) {
  const { error } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : void 0);
  if (!error) return "invite";
  if (!/already|registered|exists/i.test(error.message ?? "")) {
    console.error("invite email failed:", error.status ?? "", (error.message ?? "").slice(0, 160));
    return "not_sent";
  }
  const anon = (0, import_supabase_js_22.createClient)(SUPABASE_URL, ANON_KEY2, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: linkError } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, ...redirectTo ? { emailRedirectTo: redirectTo } : {} } });
  if (linkError) {
    console.error("sign-in link failed:", linkError.status ?? "", (linkError.message ?? "").slice(0, 160));
    return "not_sent";
  }
  return "sign_in_link";
}
var PAID = ["active", "trialing", "past_due"];
async function storedFiles(prefix, depth = 0, out = []) {
  if (depth > 4 || out.length > 5e3) return out;
  const { data, error } = await admin.storage.from("documents").list(prefix, { limit: 1e3 });
  if (error) {
    console.error("storage list failed:", (error.message ?? "").slice(0, 160));
    return out;
  }
  for (const o of data ?? []) {
    const path = `${prefix}/${o.name}`;
    if (o.id === null) await storedFiles(path, depth + 1, out);
    else out.push(path);
  }
  return out;
}
async function deleteAccount(user, jwt, body) {
  if (body.confirm !== "DELETE") throw new HttpError("bad_request", "Type DELETE to confirm.");
  const { data: mfa, error: mfaError } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  const factors = mfaError ? user.factors ?? [] : mfa?.factors ?? [];
  if (factors.some((f) => f.status === "verified") && aalOf(jwt) !== "aal2") {
    throw new HttpError("mfa_required", "Finish two-step sign-in to delete your account.");
  }
  const { data: mine, error } = await admin.from("workspace_members").select("workspace_id, role").eq("user_id", user.id);
  if (error) throw new Error(`membership lookup failed: ${error.code ?? ""}`);
  const owned = (mine ?? []).filter((m) => m.role === "owner").map((m) => m.workspace_id);
  const others = (mine ?? []).filter((m) => m.role !== "owner").map((m) => m.workspace_id);
  const alone = [];
  if (owned.length) {
    const { data: owners, error: ownersError } = await admin.from("workspace_members").select("workspace_id, user_id").in("workspace_id", owned).eq("role", "owner");
    if (ownersError) throw new Error(`owner lookup failed: ${ownersError.code ?? ""}`);
    for (const ws of owned) {
      if ((owners ?? []).some((o) => o.workspace_id === ws && o.user_id !== user.id)) others.push(ws);
      else alone.push(ws);
    }
  }
  if (alone.length) {
    const { data: paid, error: billingError } = await admin.from("billing").select("workspace_id").in("workspace_id", alone).in("subscription_status", PAID);
    if (billingError) throw new Error(`billing lookup failed: ${billingError.code ?? ""}`);
    if (paid?.length) {
      const { data: names } = await admin.from("workspaces").select("name").in("id", paid.map((p) => p.workspace_id));
      const list = (names ?? []).map((n) => n.name).join(", ");
      return json({ error: { code: "subscription_active", message: `Cancel the paid plan for ${list || "your workspace"} in Manage billing first, then delete your account.` } }, 409);
    }
  }
  if (others.length) {
    const { error: leaveError } = await admin.from("workspace_members").delete().eq("user_id", user.id).in("workspace_id", others);
    if (leaveError) throw new Error(`leaving workspaces failed: ${leaveError.code ?? ""}`);
    for (const ws of others) {
      await audit({ workspace_id: ws, actor: "you", actor_id: null, action: { en: "Deleted their account and left the workspace", zh: "\u5220\u9664\u4E86\u8D26\u6237\u5E76\u79BB\u5F00\u4E86\u5DE5\u4F5C\u533A" }, object: same(user.email ?? user.phone ?? "") });
    }
  }
  if (alone.length) {
    const files = (await Promise.all(alone.map((ws) => storedFiles(ws)))).flat();
    const { error: wsError } = await admin.from("workspaces").delete().in("id", alone);
    if (wsError) throw new Error(`workspace deletion failed: ${wsError.code ?? ""}`);
    for (let i = 0; i < files.length; i += 100) {
      const { error: rmError } = await admin.storage.from("documents").remove(files.slice(i, i + 100));
      if (rmError) console.error("storage remove failed:", (rmError.message ?? "").slice(0, 160));
    }
  }
  const { error: pinError } = await admin.from("account_pins").delete().eq("user_id", user.id);
  if (pinError) console.error("pin removal failed:", pinError.code ?? "");
  const { error: delError } = await admin.auth.admin.deleteUser(user.id);
  if (delError) {
    console.error("hard delete failed, soft deleting:", (delError.message ?? "").slice(0, 160));
    const { error: softError } = await admin.auth.admin.deleteUser(user.id, true);
    if (softError) throw new Error(`account deletion failed: ${(softError.message ?? "").slice(0, 120)}`);
  }
  return ok({ deleted: true, workspaces: alone.length });
}
serve(async (req) => {
  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  if (body.action === "delete_account") return await deleteAccount(user, jwt, body);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  if (body.action === "remove") {
    const target = uuidParam(body.user_id, "user_id");
    const { data: role, error } = await userClient(jwt).rpc("check_remove_member", { ws, p_user: target });
    if (error) throw new HttpError("bad_request", (error.message ?? "Couldn't remove them.").replace(/^.*?:\s/, ""));
    const { error: delError } = await admin.from("workspace_members").delete().eq("workspace_id", ws).eq("user_id", target);
    if (delError) throw new Error(`member removal failed: ${delError.code ?? ""}`);
    const { count } = await admin.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws).eq("role", "owner");
    if (!count) {
      await admin.from("workspace_members").insert({ workspace_id: ws, user_id: target, role: role ?? "owner" });
      throw new HttpError("bad_request", "Add another owner first. A workspace needs one.");
    }
    return ok({ removed: target });
  }
  await requireAccess(ws, user, jwt, "owner");
  const redirectTo = allowedReturn(body.return_url, appOrigins()) ?? void 0;
  if (body.action === "invite") {
    const email = text(body.email, "email", 3, 254).toLowerCase();
    const role = body.role === "owner" ? "owner" : "member";
    const { data: id, error } = await userClient(jwt).rpc("invite_member", { ws, p_email: email, p_role: role });
    if (error) throw new HttpError("bad_request", (error.message ?? "Couldn't invite them.").replace(/^.*?:\s/, ""));
    const sent = await sendInvite(email, redirectTo);
    return ok({ id, sent });
  }
  if (body.action === "resend") {
    const id = uuidParam(body.id, "id");
    const { data: inv, error } = await admin.from("workspace_invites").select("email, created_at").eq("id", id).eq("workspace_id", ws).is("accepted_at", null).is("revoked_at", null).gt("expires_at", (/* @__PURE__ */ new Date()).toISOString()).maybeSingle();
    if (error) throw new Error(`invite lookup failed: ${error.code ?? ""}`);
    if (!inv) throw new HttpError("not_found", "That invite is gone. Invite them again.");
    if (Date.now() - Date.parse(inv.created_at) < 10 * 6e4) throw new HttpError("bad_request", "It was sent a few minutes ago. Try again in 10 minutes.");
    const { error: touchError } = await admin.from("workspace_invites").update({ created_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id);
    if (touchError) throw new Error(`invite update failed: ${touchError.code ?? ""}`);
    return ok({ id, sent: await sendInvite(inv.email, redirectTo) });
  }
  throw new HttpError("bad_request", "Unknown action. Use invite, resend or remove.");
});
