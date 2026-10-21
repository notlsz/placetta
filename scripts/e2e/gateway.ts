// A stand-in for the Supabase gateway at http://127.0.0.1:54321 and the edge runtime behind it:
//   /rest/v1/*         PostgREST (the JWT decides the role, as on Supabase)
//   /auth/v1/*         the few GoTrue endpoints the functions use: the user from a JWT, admin get/delete user,
//                      MFA factors, invite and OTP (no-ops that record what would have been emailed)
//   /storage/v1/*      an in-memory documents bucket (upload, download, list, remove, signed URLs)
//   /functions/v1/<n>  the edge functions, imported into this process. A function that calls Deno.serve at the top
//                      level has its handler captured; one that exports handle(req) is served by that. verify_jwt is
//                      enforced from supabase/config.toml, as the real gateway does.
// EdgeRuntime.waitUntil is provided and tracked, so a test can wait for background work to settle.
import type postgres from "npm:postgres@3.4.5";
import { ROOT, verifyJwt } from "./infra.ts";

export const GATEWAY = "http://127.0.0.1:54321";
type Handler = (req: Request) => Response | Promise<Response>;
export const handlers = new Map<string, Handler>();
export const fnErrors: string[] = [];
export const authMail: { kind: "invite" | "otp"; email: string; redirectTo?: string }[] = [];
export const fnCalls: { name: string; status: number; ms: number }[] = [];

/* ------------------------------ background work ------------------------------ */

const pending = new Set<Promise<unknown>>();
(globalThis as Record<string, unknown>).EdgeRuntime = {
  waitUntil(p: Promise<unknown>) {
    const t = Promise.resolve(p).catch((e) => { fnErrors.push(`background: ${String(e?.stack ?? e).slice(0, 400)}`); });
    pending.add(t);
    t.finally(() => pending.delete(t));
  },
};
let inflight = 0;
/** Wait until no request is being handled and no background work is left (new work started meanwhile counts too). */
export async function settle(maxMs = 120_000) {
  const until = Date.now() + maxMs;
  while (pending.size || inflight) {
    if (Date.now() > until) throw new Error(`background work didn't settle (${pending.size} pending, ${inflight} in flight)`);
    await Promise.race([Promise.allSettled([...pending]), new Promise((r) => setTimeout(r, 50))]);
  }
  await new Promise((r) => setTimeout(r, 30));
  if (pending.size || inflight) return settle(until - Date.now());
}

/* ------------------------------ loading the functions ------------------------------ */

function verifyJwtSetting(): Map<string, boolean> {
  const out = new Map<string, boolean>();
  let fn: string | null = null;
  for (const line of Deno.readTextFileSync(`${ROOT}/supabase/config.toml`).split("\n")) {
    const h = /^\[functions\.([\w-]+)\]/.exec(line.trim());
    if (h) { fn = h[1]; continue; }
    if (/^\[/.test(line.trim())) { fn = null; continue; }
    const v = /^verify_jwt\s*=\s*(true|false)/.exec(line.trim());
    if (fn && v) out.set(fn, v[1] === "true");
  }
  return out;
}
const verifyJwtFor = verifyJwtSetting();

const realServe = Deno.serve.bind(Deno);
let registering: string | null = null;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (...args: any[]) => {
  if (!registering) return (realServe as (...a: unknown[]) => unknown)(...args);
  const h = typeof args[0] === "function" ? args[0] : typeof args[1] === "function" ? args[1] : args[0]?.handler;
  handlers.set(registering, h);
  return { finished: Promise.resolve(), shutdown: async () => {}, ref() {}, unref() {}, addr: { transport: "tcp", hostname: "127.0.0.1", port: 0 } };
};

export async function loadFunctions(names: string[]) {
  for (const name of names) {
    registering = name;
    try {
      const mod = await import(`${ROOT}/supabase/functions/${name}/index.ts`);
      if (!handlers.has(name) && typeof mod.handle === "function") handlers.set(name, mod.handle);
      if (!handlers.has(name)) throw new Error(`${name} neither serves nor exports handle()`);
    } finally { registering = null; }
  }
}

/* ------------------------------ auth ------------------------------ */

type Sql = ReturnType<typeof postgres>;
async function userJson(sql: Sql, id: string) {
  const [u] = await sql`select id, aud, role, email, phone, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
                         from auth.users where id = ${id} and deleted_at is null`;
  if (!u) return null;
  const ids = await sql`select id, user_id, provider from auth.identities where user_id = ${id}`;
  const factors = await sql`select id, friendly_name, factor_type, status, created_at, updated_at from auth.mfa_factors where user_id = ${id}`;
  return {
    id: u.id, aud: u.aud ?? "authenticated", role: u.role ?? "authenticated", email: u.email, phone: u.phone ?? "", email_confirmed_at: u.email_confirmed_at, confirmed_at: u.email_confirmed_at,
    last_sign_in_at: u.last_sign_in_at, app_metadata: u.raw_app_meta_data ?? { provider: "email", providers: ["email"] }, user_metadata: u.raw_user_meta_data ?? {},
    identities: ids.map((i) => ({ id: i.id, identity_id: i.id, user_id: i.user_id, provider: i.provider, identity_data: { email: u.email, sub: u.id } })),
    factors: factors.map((f) => ({ ...f })), created_at: u.created_at, updated_at: u.updated_at, is_anonymous: u.is_anonymous,
  };
}
const authErr = (status: number, code: string, msg: string) => Response.json({ code: status, error_code: code, msg }, { status });

async function auth(sql: Sql, req: Request, path: string): Promise<Response> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const claims = await verifyJwt(token);
  if (path === "/user" && req.method === "GET") {
    if (!claims?.sub) return authErr(403, "bad_jwt", "invalid JWT: unable to parse or verify signature");
    const u = await userJson(sql, String(claims.sub));
    return u ? Response.json(u) : authErr(403, "user_not_found", "User from sub claim in JWT does not exist");
  }
  if (path === "/otp" && req.method === "POST") {
    const b = await req.json();
    const [u] = await sql`select id from auth.users where lower(email) = lower(${b.email ?? ""}) and deleted_at is null`;
    if (!u && b.create_user === false) return authErr(422, "otp_disabled", "Signups not allowed for otp");
    authMail.push({ kind: "otp", email: b.email, redirectTo: new URL(req.url).searchParams.get("redirect_to") ?? undefined });
    return Response.json({});
  }
  // public settings: SAML on, no OAuth providers (the sso function reads this)
  if (path === "/settings" && req.method === "GET") return Response.json({ external: { email: true, phone: false, google: false, azure: false }, saml_enabled: true, disable_signup: false });
  // admin: the service role only
  if (claims?.role !== "service_role") return authErr(401, "no_authorization", "This endpoint requires a valid service role key");
  // the SAML identity providers registered with `supabase sso add`, from auth.sso_providers and auth.sso_domains
  if (path === "/admin/sso/providers" && req.method === "GET") {
    const rows = await sql`select p.id, coalesce(json_agg(json_build_object('domain', d.domain)) filter (where d.id is not null), '[]') domains
                             from auth.sso_providers p left join auth.sso_domains d on d.sso_provider_id = p.id group by p.id`;
    return Response.json({ items: rows.map((r) => ({ id: r.id, domains: r.domains })) });
  }
  if (path === "/invite" && req.method === "POST") {
    const b = await req.json();
    const [u] = await sql`select id from auth.users where lower(email) = lower(${b.email ?? ""}) and deleted_at is null`;
    if (u) return authErr(422, "email_exists", "A user with this email address has already been registered");
    const id = crypto.randomUUID();
    await sql`insert into auth.users (id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values (${id}, 'authenticated', 'authenticated', ${b.email}, now(), now(), ${sql.json({ provider: "email" })}, ${sql.json(b.data ?? {})})`;
    authMail.push({ kind: "invite", email: b.email, redirectTo: new URL(req.url).searchParams.get("redirect_to") ?? undefined });
    return Response.json(await userJson(sql, id));
  }
  const m = /^\/admin\/users\/([0-9a-f-]{36})(\/factors)?$/.exec(path);
  if (m && req.method === "GET") {
    if (m[2]) return Response.json((await userJson(sql, m[1]))?.factors ?? []);
    const u = await userJson(sql, m[1]);
    return u ? Response.json(u) : authErr(404, "user_not_found", "User not found");
  }
  if (m && !m[2] && req.method === "DELETE") {
    const b = await req.json().catch(() => ({}));
    const u = await userJson(sql, m[1]);
    if (!u) return authErr(404, "user_not_found", "User not found");
    try {
      if (b.should_soft_delete) await sql`update auth.users set deleted_at = now(), email = null, phone = null, raw_user_meta_data = '{}' where id = ${m[1]}`;
      else await sql`delete from auth.users where id = ${m[1]}`;
    } catch (e) {
      // GoTrue answers a foreign key that blocks the delete with a 500
      return authErr(500, "unexpected_failure", `Database error deleting user: ${String((e as Error).message).slice(0, 160)}`);
    }
    return Response.json(u);
  }
  return authErr(404, "not_found", `e2e gateway: ${req.method} /auth/v1${path} isn't stubbed`);
}

/* ------------------------------ storage ------------------------------ */

export const files = new Map<string, { bytes: Uint8Array; type: string; at: string }>();
async function storage(req: Request, path: string): Promise<Response> {
  const claims = await verifyJwt((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (claims?.role !== "service_role") return Response.json({ statusCode: "403", error: "Unauthorized", message: "e2e storage serves the service role only" }, { status: 403 });
  let m: RegExpExecArray | null;
  if ((m = /^\/object\/list\/([^/]+)$/.exec(path)) && req.method === "POST") {
    const b = await req.json();
    const prefix = String(b.prefix ?? "").replace(/\/+$/, "");
    const seen = new Map<string, { name: string; id: string | null }>();
    for (const [k, f] of files) {
      const [bucket, ...rest] = k.split("/");
      const p = rest.join("/");
      if (bucket !== m[1] || !p.startsWith(prefix ? prefix + "/" : "")) continue;
      const tail = p.slice(prefix ? prefix.length + 1 : 0), first = tail.split("/")[0];
      seen.set(first, tail.includes("/") ? { name: first, id: null } : { name: first, id: crypto.randomUUID(), ...{ metadata: { size: f.bytes.length, mimetype: f.type } } });
    }
    return Response.json([...seen.values()].slice(0, Number(b.limit ?? 100)));
  }
  if ((m = /^\/object\/([^/]+)$/.exec(path)) && req.method === "DELETE") {
    const b = await req.json();
    const out = [];
    for (const p of b.prefixes ?? []) if (files.delete(`${m[1]}/${p}`)) out.push({ name: p, bucket_id: m[1] });
    return Response.json(out);
  }
  if ((m = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(path)) && req.method === "POST") {
    if (!files.has(`${m[1]}/${decodeURIComponent(m[2])}`)) return Response.json({ statusCode: "404", error: "not_found", message: "Object not found" }, { status: 400 });
    return Response.json({ signedURL: `/object/sign/${m[1]}/${m[2]}?token=e2e` });
  }
  if ((m = /^\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/.exec(path))) {
    const key = `${m[1]}/${decodeURIComponent(m[2])}`;
    if (req.method === "POST" || req.method === "PUT") {
      if (files.has(key) && req.headers.get("x-upsert") !== "true") return Response.json({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }, { status: 400 });
      let bytes = new Uint8Array(await req.arrayBuffer()), type = req.headers.get("content-type") ?? "application/octet-stream";
      if (type.startsWith("multipart/form-data")) {
        const fd = await new Response(bytes, { headers: { "content-type": type } }).formData();
        const f = [...fd.values()].find((v) => v instanceof File) as File | undefined;
        if (f) { bytes = new Uint8Array(await f.arrayBuffer()); type = f.type || "application/octet-stream"; }
      }
      files.set(key, { bytes, type, at: new Date().toISOString() });
      return Response.json({ Key: key, Id: crypto.randomUUID() });
    }
    if (req.method === "GET") {
      const f = files.get(key);
      return f ? new Response(f.bytes as BodyInit, { headers: { "content-type": f.type } }) : Response.json({ statusCode: "404", error: "not_found", message: "Object not found" }, { status: 400 });
    }
  }
  return Response.json({ statusCode: "404", error: "not_found", message: `e2e storage: ${req.method} ${path} isn't stubbed` }, { status: 404 });
}

/* ------------------------------ the gateway ------------------------------ */

export function startGateway(sql: Sql, restPort: number) {
  const handler = async (req: Request): Promise<Response> => {
    const u = new URL(req.url);
    inflight++;
    try {
      if (u.pathname.startsWith("/rest/v1/")) {
        const headers = new Headers(req.headers);
        if (!headers.get("authorization") && headers.get("apikey")) headers.set("authorization", `Bearer ${headers.get("apikey")}`);
        headers.delete("host");
        const res = await fetch(`http://127.0.0.1:${restPort}${u.pathname.slice("/rest/v1".length)}${u.search}`, { method: req.method, headers, body: req.body, redirect: "manual" });
        return new Response(res.body, { status: res.status, headers: res.headers });
      }
      if (u.pathname.startsWith("/auth/v1/")) return await auth(sql, req, u.pathname.slice("/auth/v1".length));
      if (u.pathname.startsWith("/storage/v1/")) return await storage(req, u.pathname.slice("/storage/v1".length));
      const fm = /^\/functions\/v1\/([\w-]+)/.exec(u.pathname);
      if (fm) {
        const name = fm[1], h = handlers.get(name);
        if (!h) return Response.json({ code: "NOT_FOUND", message: "Requested function was not found" }, { status: 404 });
        // the gateway checks the JWT unless the function turned it off
        if (req.method !== "OPTIONS" && verifyJwtFor.get(name) !== false) {
          const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
          if (!token) return Response.json({ code: 401, message: "Missing authorization header" }, { status: 401 });
          if (!(await verifyJwt(token))) return Response.json({ code: 401, message: "Invalid JWT" }, { status: 401 });
        }
        const t0 = Date.now();
        try {
          const res = await h(req);
          fnCalls.push({ name, status: res.status, ms: Date.now() - t0 });
          return res;
        } catch (e) {
          fnErrors.push(`${name} threw: ${String((e as Error)?.stack ?? e).slice(0, 600)}`);
          fnCalls.push({ name, status: 500, ms: Date.now() - t0 });
          return Response.json({ code: "WORKER_ERROR", message: "Function exited due to an error" }, { status: 500 });
        }
      }
      return new Response("not found", { status: 404 });
    } finally { inflight--; }
  };
  const server = realServe({ hostname: "127.0.0.1", port: 54321, onListen: () => {} }, handler);
  return { stop: () => server.shutdown() };
}
