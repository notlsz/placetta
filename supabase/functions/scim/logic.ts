// SCIM 2.0 (RFC 7643 schemas, RFC 7644 protocol) for one workspace per bearer token. What it serves:
//   GET    /ServiceProviderConfig, /ResourceTypes, /Schemas
//   GET    /Users?filter=userName eq "x"&startIndex=1&count=100     also externalId eq, emails.value eq, emails eq
//   GET    /Users/{id}
//   POST   /Users                       201, or 409 uniqueness when the userName exists (case-insensitive)
//   PUT    /Users/{id}                  replaces the user
//   PATCH  /Users/{id}                  PatchOp: add, replace, remove on active, userName, externalId, displayName,
//                                       name.givenName, name.familyName, emails; with or without a path. active false
//                                       deprovisions (the database takes them off the workspace and ends their sessions)
//   DELETE /Users/{id}                  204; deprovisions and deletes
//   GET    /Groups?filter=displayName eq "x"   also externalId eq; excludedAttributes=members
//   GET, POST, PUT, PATCH, DELETE /Groups[/{id}]   PATCH adds and removes members (members[value eq "id"] paths too)
// The rules (who gets which role, deprovisioning, the audit trail) are in the database: scim_user_put, scim_user_delete,
// scim_group_put, scim_group_delete (20261022000000_enterprise_access.sql). Tokens are checked by their SHA-256.
// Not supported, and said so in ServiceProviderConfig: bulk, sort, changing passwords, ETags.

export const SCHEMA = {
  user: "urn:ietf:params:scim:schemas:core:2.0:User",
  group: "urn:ietf:params:scim:schemas:core:2.0:Group",
  list: "urn:ietf:params:scim:api:messages:2.0:ListResponse",
  patch: "urn:ietf:params:scim:api:messages:2.0:PatchOp",
  error: "urn:ietf:params:scim:api:messages:2.0:Error",
  spc: "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
  rt: "urn:ietf:params:scim:schemas:core:2.0:ResourceType",
  schema: "urn:ietf:params:scim:schemas:core:2.0:Schema",
} as const;

/** A provisioned person as the database keeps them (scim_users). */
export type UserRow = {
  id: string; user_name: string; email: string | null; external_id: string | null; given_name: string | null; family_name: string | null;
  display_name: string | null; active: boolean; created_at: string; updated_at: string;
};
export type GroupRow = { id: string; display_name: string; external_id: string | null; created_at: string; updated_at: string; members: { id: string; user_name: string }[] };
/** What a write sends the database: a key left out keeps its value. */
export type UserPatch = Partial<{ user_name: string; email: string | null; external_id: string | null; given_name: string | null; family_name: string | null; display_name: string | null; active: boolean }>;
export type GroupPatch = Partial<{ display_name: string; external_id: string | null; members: string[]; add: string[]; remove: string[] }>;
export type Filter = { attr: "userName" | "externalId" | "email" | "displayName"; value: string };

/** The database behind it. Write errors come back as Error messages: scim_conflict, scim_not_found, scim_invalid: ..., scim_owner. */
export type Store = {
  auth(hash: string): Promise<string | null>;
  limit(key: string, max: number, windowSeconds: number): Promise<boolean>;
  listUsers(ws: string, f: Filter | null, start: number, count: number): Promise<{ total: number; rows: UserRow[] }>;
  getUser(ws: string, id: string): Promise<UserRow | null>;
  putUser(ws: string, id: string | null, p: UserPatch): Promise<UserRow>;
  deleteUser(ws: string, id: string): Promise<void>;
  listGroups(ws: string, f: Filter | null, start: number, count: number): Promise<{ total: number; rows: GroupRow[] }>;
  getGroup(ws: string, id: string): Promise<GroupRow | null>;
  putGroup(ws: string, id: string | null, p: GroupPatch): Promise<GroupRow>;
  deleteGroup(ws: string, id: string): Promise<void>;
  /** A line in the audit trail for something refused (a refused write's own lines roll back with it). */
  note(ws: string, en: string, zh: string, who: string): Promise<void>;
};

/** Requests per minute per token. Okta and Entra stay far below this; a runaway loop doesn't. */
export const PER_MINUTE = 600;
export const MAX_COUNT = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export class ScimError extends Error {
  constructor(readonly status: number, readonly detail: string, readonly scimType?: string) { super(detail); }
}

const HEADERS = { "Content-Type": "application/scim+json; charset=utf-8", "Cache-Control": "no-store" };
export const scimJson = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
export const scimError = (status: number, detail: string, scimType?: string) =>
  scimJson({ schemas: [SCHEMA.error], status: String(status), ...(scimType ? { scimType } : {}), detail }, status);

/** SHA-256 of the token, as lowercase hex: what the database stores (encode(digest(token, 'sha256'), 'hex')). */
export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------ resources ------------------------------ */

export function userResource(u: UserRow, base: string) {
  const name: Record<string, string> = {};
  if (u.given_name) name.givenName = u.given_name;
  if (u.family_name) name.familyName = u.family_name;
  const formatted = [u.given_name, u.family_name].filter(Boolean).join(" ");
  if (formatted) name.formatted = formatted;
  return {
    schemas: [SCHEMA.user], id: u.id, ...(u.external_id ? { externalId: u.external_id } : {}), userName: u.user_name,
    ...(Object.keys(name).length ? { name } : {}), ...(u.display_name ? { displayName: u.display_name } : {}),
    ...(u.email ? { emails: [{ value: u.email, type: "work", primary: true }] } : {}),
    active: u.active,
    meta: { resourceType: "User", created: u.created_at, lastModified: u.updated_at, location: `${base}/Users/${u.id}` },
  };
}

export function groupResource(g: GroupRow, base: string, withMembers = true) {
  return {
    schemas: [SCHEMA.group], id: g.id, ...(g.external_id ? { externalId: g.external_id } : {}), displayName: g.display_name,
    ...(withMembers ? { members: g.members.map((m) => ({ value: m.id, display: m.user_name, $ref: `${base}/Users/${m.id}`, type: "User" })) } : {}),
    meta: { resourceType: "Group", created: g.created_at, lastModified: g.updated_at, location: `${base}/Groups/${g.id}` },
  };
}

export function serviceProviderConfig(docs: string) {
  return {
    schemas: [SCHEMA.spc], documentationUri: docs,
    patch: { supported: true }, bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: MAX_COUNT }, changePassword: { supported: false }, sort: { supported: false }, etag: { supported: false },
    authenticationSchemes: [{ type: "oauthbearertoken", name: "Bearer token", description: "The workspace's SCIM token from Placetta Settings, Security", primary: true }],
    meta: { resourceType: "ServiceProviderConfig", location: "/ServiceProviderConfig" },
  };
}

const attr = (name: string, type: string, extra: Record<string, unknown> = {}) =>
  ({ name, type, multiValued: false, required: false, caseExact: false, mutability: "readWrite", returned: "default", uniqueness: "none", ...extra });

export function schemas() {
  return [
    { schemas: [SCHEMA.schema], id: SCHEMA.user, name: "User", description: "A person who may get access to the workspace", attributes: [
      attr("userName", "string", { required: true, uniqueness: "server" }),
      attr("name", "complex", { subAttributes: [attr("givenName", "string"), attr("familyName", "string"), attr("formatted", "string", { mutability: "readOnly" })] }),
      attr("displayName", "string"), attr("active", "boolean"),
      attr("emails", "complex", { multiValued: true, subAttributes: [attr("value", "string"), attr("type", "string"), attr("primary", "boolean")] }),
      attr("externalId", "string", { caseExact: true }),
    ], meta: { resourceType: "Schema", location: `/Schemas/${SCHEMA.user}` } },
    { schemas: [SCHEMA.schema], id: SCHEMA.group, name: "Group", description: "A group whose members get the role an admin maps to it in Placetta", attributes: [
      attr("displayName", "string", { required: true }),
      attr("members", "complex", { multiValued: true, subAttributes: [attr("value", "string", { mutability: "immutable" }), attr("display", "string", { mutability: "readOnly" })] }),
      attr("externalId", "string", { caseExact: true }),
    ], meta: { resourceType: "Schema", location: `/Schemas/${SCHEMA.group}` } },
  ];
}

export function resourceTypes() {
  return [
    { schemas: [SCHEMA.rt], id: "User", name: "User", endpoint: "/Users", schema: SCHEMA.user, meta: { resourceType: "ResourceType", location: "/ResourceTypes/User" } },
    { schemas: [SCHEMA.rt], id: "Group", name: "Group", endpoint: "/Groups", schema: SCHEMA.group, meta: { resourceType: "ResourceType", location: "/ResourceTypes/Group" } },
  ];
}

export const listResponse = (total: number, start: number, resources: unknown[]) =>
  ({ schemas: [SCHEMA.list], totalResults: total, startIndex: start, itemsPerPage: resources.length, Resources: resources });

/* ------------------------------ input ------------------------------ */

/** `userName eq "bjensen"` and the like: one attribute, eq, a quoted value. Anything else is invalidFilter. */
export function parseFilter(raw: string | null, kind: "Users" | "Groups"): Filter | null {
  if (raw === null || raw.trim() === "") return null;
  const m = /^\s*([A-Za-z.]+)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i.exec(raw);
  if (!m) throw new ScimError(400, "Only filters of the form attribute eq \"value\" are supported.", "invalidFilter");
  const a = m[1].toLowerCase(), value = m[2].replace(/\\(.)/g, "$1");
  const map: Record<string, Filter["attr"]> = kind === "Users"
    ? { username: "userName", externalid: "externalId", "emails.value": "email", emails: "email" }
    : { displayname: "displayName", externalid: "externalId" };
  const at = map[a];
  if (!at) throw new ScimError(400, `Filtering ${kind} by ${m[1]} isn't supported.`, "invalidFilter");
  return { attr: at, value };
}

export function paging(url: URL): { start: number; count: number } {
  const s = Number(url.searchParams.get("startIndex") ?? "1"), c = Number(url.searchParams.get("count") ?? "100");
  return { start: Number.isFinite(s) && s >= 1 ? Math.floor(s) : 1, count: Number.isFinite(c) ? Math.max(0, Math.min(MAX_COUNT, Math.floor(c))) : 100 };
}

/** SCIM booleans, and the strings some IdPs send for them (Entra ID sends "False"). */
export function bool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string" && /^(true|false)$/i.test(v.trim())) return v.trim().toLowerCase() === "true";
  throw new ScimError(400, "active must be true or false.", "invalidValue");
}

const str = (v: unknown, label: string, max: number): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new ScimError(400, `${label} must be a string.`, "invalidValue");
  const s = v.trim();
  if (s.length > max) throw new ScimError(400, `${label} is too long (at most ${max} characters).`, "invalidValue");
  return s || null;
};

/** The email Placetta knows the person by: the userName when it's an email, else the primary (or first) email. */
export function emailOf(userName: string | null | undefined, emails: unknown): string | null {
  if (userName && EMAIL.test(userName.trim())) return userName.trim().toLowerCase();
  if (!Array.isArray(emails)) return null;
  const list = emails.filter((e) => e && typeof e === "object" && typeof (e as { value?: unknown }).value === "string") as { value: string; primary?: unknown }[];
  const pick = list.find((e) => e.primary === true || e.primary === "true") ?? list[0];
  return pick && EMAIL.test(pick.value.trim()) ? pick.value.trim().toLowerCase() : null;
}

/** A full User (POST, PUT): every attribute, so a PUT clears what it leaves out. */
export function userFromBody(b: Record<string, unknown>): UserPatch {
  const userName = str(b.userName, "userName", 256);
  if (!userName) throw new ScimError(400, "userName is required.", "invalidValue");
  const name = (b.name && typeof b.name === "object" ? b.name : {}) as Record<string, unknown>;
  return {
    user_name: userName, email: emailOf(userName, b.emails), external_id: str(b.externalId, "externalId", 256),
    given_name: str(name.givenName, "name.givenName", 200), family_name: str(name.familyName, "name.familyName", 200),
    display_name: str(b.displayName, "displayName", 200), active: b.active === undefined ? true : bool(b.active),
  };
}

/** RFC 7643 User attributes Placetta accepts and doesn't keep (it needs only who the person is and whether they're active). */
const IGNORED = new Set(["nickname", "profileurl", "title", "usertype", "preferredlanguage", "locale", "timezone", "phonenumbers", "ims",
  "photos", "addresses", "groups", "entitlements", "roles", "x509certificates", "password"]);

type Op = { op: string; path?: string; value?: unknown };
function opsOf(b: Record<string, unknown>): Op[] {
  if (!Array.isArray(b.schemas) || !b.schemas.includes(SCHEMA.patch)) throw new ScimError(400, `A PATCH body names the schema ${SCHEMA.patch}.`, "invalidSyntax");
  const ops = b.Operations;
  if (!Array.isArray(ops) || !ops.length) throw new ScimError(400, "Operations is required.", "invalidSyntax");
  return ops.map((o) => {
    if (!o || typeof o !== "object") throw new ScimError(400, "Each operation is an object.", "invalidSyntax");
    const op = String((o as Op).op ?? "").toLowerCase();
    if (!["add", "replace", "remove"].includes(op)) throw new ScimError(400, `Unknown op ${(o as Op).op}.`, "invalidSyntax");
    const path = (o as Op).path;
    return { op, path: typeof path === "string" && path.trim() ? path.trim() : undefined, value: (o as Op).value };
  });
}

/** A User PatchOp as the changes the database applies. The current row is needed to work out the email. */
export function userPatchFromOps(b: Record<string, unknown>, cur: UserRow): UserPatch {
  const out: UserPatch = {};
  let userName: string | undefined, emails: unknown;
  const set = (path: string, value: unknown, remove: boolean) => {
    const p = path.toLowerCase();
    if (p === "active") { if (remove) throw new ScimError(400, "active can't be removed.", "mutability"); out.active = bool(value); }
    else if (p === "username") { const v = str(value, "userName", 256); if (!v || remove) throw new ScimError(400, "userName is required.", "mutability"); userName = v; out.user_name = v; }
    else if (p === "externalid") out.external_id = remove ? null : str(value, "externalId", 256);
    else if (p === "displayname") out.display_name = remove ? null : str(value, "displayName", 200);
    else if (p === "name.givenname") out.given_name = remove ? null : str(value, "name.givenName", 200);
    else if (p === "name.familyname") out.family_name = remove ? null : str(value, "name.familyName", 200);
    else if (p === "name.formatted") { /* derived from the parts */ }
    else if (p === "name") {
      if (remove) { out.given_name = null; out.family_name = null; return; }
      const n = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
      if ("givenName" in n) out.given_name = str(n.givenName, "name.givenName", 200);
      if ("familyName" in n) out.family_name = str(n.familyName, "name.familyName", 200);
    } else if (p === "emails") emails = remove ? [] : value;
    else if (/^emails\[.*\]\.value$/.test(p)) emails = remove ? [] : [{ value, primary: true }];
    else if (p.startsWith("urn:ietf:params:scim:schemas:extension:") || IGNORED.has(p.split(/[.[]/)[0])) { /* User attributes Placetta doesn't keep */ }
    else throw new ScimError(400, `Changing ${path} isn't supported.`, "noTarget");
  };
  for (const o of opsOf(b)) {
    if (o.path) { set(o.path, o.value, o.op === "remove"); continue; }
    if (o.op === "remove") throw new ScimError(400, "A remove operation needs a path.", "noTarget");
    if (!o.value || typeof o.value !== "object" || Array.isArray(o.value)) throw new ScimError(400, "Without a path, value is an object of attributes.", "invalidValue");
    for (const [k, v] of Object.entries(o.value as Record<string, unknown>)) if (k !== "schemas" && k !== "id" && k !== "meta") set(k, v, false);
  }
  if (userName !== undefined || emails !== undefined) {
    const email = emailOf(userName ?? cur.user_name, emails !== undefined ? emails : cur.email ? [{ value: cur.email, primary: true }] : []);
    if (email !== cur.email) out.email = email;
  }
  return out;
}

const memberIds = (v: unknown): string[] => {
  const list = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  return list.map((m) => {
    const id = m && typeof m === "object" ? (m as { value?: unknown }).value : m;
    if (typeof id !== "string" || !UUID.test(id)) throw new ScimError(400, "Each member is {\"value\": \"<user id>\"}.", "invalidValue");
    return id.toLowerCase();
  });
};

export function groupFromBody(b: Record<string, unknown>): GroupPatch {
  const display = str(b.displayName, "displayName", 200);
  if (!display) throw new ScimError(400, "displayName is required.", "invalidValue");
  return { display_name: display, external_id: str(b.externalId, "externalId", 256), members: memberIds(b.members) };
}

/** A Group PatchOp: add and remove members (by list, or members[value eq "id"]), replace members or displayName. */
export function groupPatchFromOps(b: Record<string, unknown>): GroupPatch {
  const out: GroupPatch = {};
  const add = new Set<string>(), remove = new Set<string>();
  for (const o of opsOf(b)) {
    const path = o.path?.toLowerCase();
    const one = o.path ? /^members\[\s*value\s+eq\s+"([^"]+)"\s*\]$/i.exec(o.path) : null;
    if (one && o.op === "remove") { remove.add(memberIds([one[1]])[0]); continue; }
    if (path === "members") {
      if (o.op === "add") memberIds(o.value).forEach((id) => { add.add(id); remove.delete(id); });
      else if (o.op === "remove") { if (o.value === undefined) out.members = []; else memberIds(o.value).forEach((id) => { remove.add(id); add.delete(id); }); }
      else { out.members = memberIds(o.value); add.clear(); remove.clear(); }
      continue;
    }
    if (path === "displayname") { const v = str(o.value, "displayName", 200); if (!v || o.op === "remove") throw new ScimError(400, "displayName is required.", "mutability"); out.display_name = v; continue; }
    if (path === "externalid") { out.external_id = o.op === "remove" ? null : str(o.value, "externalId", 256); continue; }
    if (!o.path && o.op !== "remove" && o.value && typeof o.value === "object" && !Array.isArray(o.value)) {
      const v = o.value as Record<string, unknown>;
      if ("displayName" in v) { const d = str(v.displayName, "displayName", 200); if (!d) throw new ScimError(400, "displayName is required.", "invalidValue"); out.display_name = d; }
      if ("externalId" in v) out.external_id = str(v.externalId, "externalId", 256);
      if ("members" in v) {
        if (o.op === "add") memberIds(v.members).forEach((id) => add.add(id));
        else { out.members = memberIds(v.members); add.clear(); remove.clear(); }
      }
      continue;
    }
    throw new ScimError(400, `Changing ${o.path ?? "that"} isn't supported.`, "noTarget");
  }
  if (add.size) out.add = [...add];
  if (remove.size) out.remove = [...remove];
  return out;
}

/** A database error message as the SCIM error it means. */
export function fromDb(e: unknown): ScimError {
  const m = e instanceof Error ? e.message : String(e);
  if (/scim_conflict/.test(m)) return new ScimError(409, "A resource with that name already exists.", "uniqueness");
  if (/scim_not_found/.test(m)) return new ScimError(404, "Resource not found.");
  if (/scim_owner/.test(m)) return new ScimError(400, "This person is an owner of the workspace. An owner removes or changes owners in Placetta, then the identity provider can deactivate them.", "mutability");
  const inv = /scim_invalid:\s*(.*)$/.exec(m);
  if (inv) return new ScimError(400, inv[1], "invalidValue");
  return new ScimError(500, "Something went wrong. Try again.");
}

/* ------------------------------ the handler ------------------------------ */

async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 1_000_000) throw new ScimError(413, "The request is too large.");
  try {
    const b = JSON.parse(text);
    if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch { /* below */ }
  throw new ScimError(400, "Send a JSON object.", "invalidSyntax");
}

/** The SCIM path after .../scim (and an optional /v2): ["Users", "<id>"]. */
export function route(pathname: string): string[] {
  const i = pathname.indexOf("/scim");
  const rest = (i >= 0 ? pathname.slice(i + 5) : pathname).replace(/^\/v2(?=\/|$)/i, "");
  return rest.split("/").filter(Boolean).map(decodeURIComponent);
}

export async function handle(req: Request, store: Store, base: string, docs: string): Promise<Response> {
  try {
    const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
    if (!m) throw new ScimError(401, "Send the workspace's SCIM token as a Bearer token.");
    const ws = await store.auth(await sha256Hex(m[1]));
    if (!ws) throw new ScimError(401, "That SCIM token isn't valid. Make a new one in Placetta, Settings, Security.");
    if (!(await store.limit(`scim:${ws}`, PER_MINUTE, 60))) throw new ScimError(429, "Too many requests. Slow down and try again in a minute.");

    const url = new URL(req.url);
    const [kind, id, extra] = route(url.pathname);
    const method = req.method.toUpperCase();
    if (extra !== undefined) throw new ScimError(404, "Resource not found.");
    if (kind === "ServiceProviderConfig" && method === "GET") return scimJson(serviceProviderConfig(docs));
    if (kind === "ResourceTypes" && method === "GET") return scimJson(id ? resourceTypes().find((r) => r.id === id) ?? (() => { throw new ScimError(404, "Resource not found."); })() : listResponse(2, 1, resourceTypes()));
    if (kind === "Schemas" && method === "GET") return scimJson(id ? schemas().find((s) => s.id === id) ?? (() => { throw new ScimError(404, "Resource not found."); })() : listResponse(2, 1, schemas()));

    if (kind === "Users") {
      if (id !== undefined && !UUID.test(id)) throw new ScimError(404, "Resource not found.");
      if (!id && method === "GET") {
        const f = parseFilter(url.searchParams.get("filter"), "Users"), { start, count } = paging(url);
        const { total, rows } = await store.listUsers(ws, f, start, count);
        return scimJson(listResponse(total, start, rows.map((u) => userResource(u, base))));
      }
      if (!id && method === "POST") {
        const u = await store.putUser(ws, null, userFromBody(await bodyOf(req))).catch((e) => { throw fromDb(e); });
        const r = userResource(u, base);
        return scimJson(r, 201, { Location: r.meta.location });
      }
      if (id && method === "GET") {
        const u = await store.getUser(ws, id);
        if (!u) throw new ScimError(404, "Resource not found.");
        return scimJson(userResource(u, base));
      }
      if (id && method === "PUT") {
        const u = await store.putUser(ws, id, userFromBody(await bodyOf(req))).catch((e) => { throw fromDb(e); });
        return scimJson(userResource(u, base));
      }
      if (id && method === "PATCH") {
        const cur = await store.getUser(ws, id);
        if (!cur) throw new ScimError(404, "Resource not found.");
        const patch = userPatchFromOps(await bodyOf(req), cur);
        const u = await store.putUser(ws, id, patch).catch(async (e) => {
          const err = fromDb(e);
          if (err.scimType === "mutability") await store.note(ws, "Deactivation refused: this person is an owner", "停用被拒绝：此人是所有者", cur.email ?? cur.user_name).catch(() => undefined);
          throw err;
        });
        return scimJson(userResource(u, base));
      }
      if (id && method === "DELETE") {
        const cur = await store.getUser(ws, id);
        await store.deleteUser(ws, id).catch(async (e) => {
          const err = fromDb(e);
          if (err.scimType === "mutability" && cur) await store.note(ws, "Deletion refused: this person is an owner", "删除被拒绝：此人是所有者", cur.email ?? cur.user_name).catch(() => undefined);
          throw err;
        });
        return scimJson(null, 204);
      }
    }

    if (kind === "Groups") {
      if (id !== undefined && !UUID.test(id)) throw new ScimError(404, "Resource not found.");
      const withMembers = !/(^|,)\s*members\s*(,|$)/i.test(url.searchParams.get("excludedAttributes") ?? "");
      if (!id && method === "GET") {
        const f = parseFilter(url.searchParams.get("filter"), "Groups"), { start, count } = paging(url);
        const { total, rows } = await store.listGroups(ws, f, start, count);
        return scimJson(listResponse(total, start, rows.map((g) => groupResource(g, base, withMembers))));
      }
      if (!id && method === "POST") {
        const g = await store.putGroup(ws, null, groupFromBody(await bodyOf(req))).catch((e) => { throw fromDb(e); });
        const r = groupResource(g, base);
        return scimJson(r, 201, { Location: r.meta.location });
      }
      if (id && method === "GET") {
        const g = await store.getGroup(ws, id);
        if (!g) throw new ScimError(404, "Resource not found.");
        return scimJson(groupResource(g, base, withMembers));
      }
      if (id && method === "PUT") {
        const g = await store.putGroup(ws, id, groupFromBody(await bodyOf(req))).catch((e) => { throw fromDb(e); });
        return scimJson(groupResource(g, base));
      }
      if (id && method === "PATCH") {
        const g = await store.putGroup(ws, id, groupPatchFromOps(await bodyOf(req))).catch((e) => { throw fromDb(e); });
        return scimJson(groupResource(g, base));
      }
      if (id && method === "DELETE") {
        await store.deleteGroup(ws, id).catch((e) => { throw fromDb(e); });
        return scimJson(null, 204);
      }
    }
    if (["ServiceProviderConfig", "ResourceTypes", "Schemas", "Users", "Groups"].includes(kind ?? "")) throw new ScimError(405, `${method} isn't supported here.`);
    throw new ScimError(404, "Resource not found.");
  } catch (e) {
    if (e instanceof ScimError) return scimError(e.status, e.detail, e.scimType);
    console.error("scim:", e instanceof Error ? e.message.slice(0, 200) : "unknown");
    return scimError(500, "Something went wrong. Try again.");
  }
}
