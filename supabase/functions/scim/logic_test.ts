// deno test -A supabase/functions/scim/logic_test.ts
// SCIM 2.0 against the examples in RFC 7644 (protocol) and RFC 7643 (schemas), and what Okta and Microsoft Entra ID
// actually send: bearer tokens checked by SHA-256, filters, paging, create, replace, PATCH (with and without a path,
// "False" as a string), deprovisioning, groups and their members, and the error format. The database's own rules
// (roles, deprovisioning, the audit trail) are tested in supabase/tests/enterprise.sql and end to end in scripts/e2e.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import {
  emailOf, type Filter, groupPatchFromOps, type GroupPatch, type GroupRow, handle, parseFilter, route, SCHEMA, sha256Hex, type Store,
  type UserPatch, type UserRow,
} from "./logic.ts";

const TOKEN = "scim_0a1b2c3d_" + "f".repeat(64), OTHER = "scim_99999999_" + "e".repeat(64);
const WS = "11111111-1111-4111-8111-111111111111";
const BASE = "https://example.supabase.co/functions/v1/scim/v2";
// RFC 7644's own example ids
const BJENSEN = "2819c223-7f76-453a-919d-413861904646", JSMITH = "902c246b-6245-4190-8e05-00816be7344a";
const GROUP = "e9e30dba-f08f-4109-8486-d5c6a331660a";

type Fake = Store & { users: Map<string, UserRow>; groups: Map<string, GroupRow & { ids: string[] }>; puts: UserPatch[]; gputs: GroupPatch[]; notes: string[]; hits: number; owners: Set<string> };
async function fake(): Promise<Fake> {
  const hash = await sha256Hex(TOKEN);
  const now = () => new Date("2026-10-22T00:00:00Z").toISOString();
  const users = new Map<string, UserRow>(), groups = new Map<string, GroupRow & { ids: string[] }>();
  let seq = 0;
  // the first user gets RFC 7644's bjensen id, the rest made-up ones
  const nextUserId = () => (seq++ === 0 ? BJENSEN : `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`);
  const match = (f: Filter | null, u: UserRow) => !f || (f.attr === "userName" ? u.user_name.toLowerCase() === f.value.toLowerCase()
    : f.attr === "externalId" ? u.external_id === f.value : f.attr === "email" ? u.email === f.value.toLowerCase() : true);
  const view = (g: GroupRow & { ids: string[] }): GroupRow => ({ ...g, members: g.ids.map((id) => ({ id, user_name: users.get(id)!.user_name })) });
  const s: Fake = {
    users, groups, puts: [], gputs: [], notes: [], hits: 0, owners: new Set(),
    async auth(h) { return h === hash ? WS : null; },
    async limit() { s.hits++; return s.hits <= 1000; },
    async listUsers(_ws, f, start, count) {
      const all = [...users.values()].filter((u) => match(f, u));
      return { total: all.length, rows: all.slice(start - 1, start - 1 + count) };
    },
    async getUser(_ws, id) { return users.get(id) ?? null; },
    async putUser(_ws, id, p) {
      s.puts.push(p);
      if (p.user_name && [...users.values()].some((u) => u.id !== id && u.user_name.toLowerCase() === p.user_name!.toLowerCase())) throw new Error("scim_conflict");
      if (id && !users.has(id)) throw new Error("scim_not_found");
      if (id && p.active === false && s.owners.has(id)) throw new Error("scim_owner");
      const cur = id ? users.get(id)! : { id: nextUserId(), user_name: "", email: null, external_id: null, given_name: null, family_name: null, display_name: null, active: true, created_at: now(), updated_at: now() };
      const next = { ...cur, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as UserRow;
      users.set(next.id, next);
      return next;
    },
    async deleteUser(_ws, id) { if (!users.delete(id)) throw new Error("scim_not_found"); },
    async listGroups(_ws, f, start, count) {
      const all = [...groups.values()].filter((g) => !f || (f.attr === "displayName" ? g.display_name.toLowerCase() === f.value.toLowerCase() : g.external_id === f.value));
      return { total: all.length, rows: all.slice(start - 1, start - 1 + count).map(view) };
    },
    async getGroup(_ws, id) { const g = groups.get(id); return g ? view(g) : null; },
    async putGroup(_ws, id, p) {
      s.gputs.push(p);
      const ids = [...(p.members ?? []), ...(p.add ?? []), ...(p.remove ?? [])];
      if (ids.some((x) => !users.has(x))) throw new Error("scim_invalid: a member is not a user provisioned here");
      if (id && !groups.has(id)) throw new Error("scim_not_found");
      const cur = id ? groups.get(id)! : { id: GROUP, display_name: "", external_id: null, created_at: now(), updated_at: now(), members: [], ids: [] as string[] };
      let list = p.members ?? cur.ids;
      list = [...new Set([...list, ...(p.add ?? [])])].filter((x) => !(p.remove ?? []).includes(x));
      const next = { ...cur, display_name: p.display_name ?? cur.display_name, external_id: p.external_id !== undefined ? p.external_id : cur.external_id, ids: list };
      groups.set(next.id, next);
      return view(next);
    },
    async deleteGroup(_ws, id) { if (!groups.delete(id)) throw new Error("scim_not_found"); },
    async note(_ws, en) { s.notes.push(en); },
  };
  return s;
}

const req = (method: string, path: string, body?: unknown, token = TOKEN) =>
  new Request(`https://example.supabase.co/functions/v1/scim/v2${path}`, {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/scim+json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
const call = async (s: Store, method: string, path: string, body?: unknown, token?: string) => {
  const r = await handle(req(method, path, body, token), s, BASE, "https://placetta.com/trust.html");
  return { status: r.status, headers: r.headers, body: r.status === 204 ? null : await r.json() };
};
// RFC 7644 section 3.3: "Creating Resources", the request
const RFC_CREATE = { schemas: [SCHEMA.user], userName: "bjensen", externalId: "bjensen", name: { formatted: "Ms. Barbara J Jensen III", familyName: "Jensen", givenName: "Barbara" } };
const patch = (...Operations: unknown[]) => ({ schemas: [SCHEMA.patch], Operations });

Deno.test("tokens: SHA-256 as lowercase hex, the way the database stores it; a missing or wrong token is 401 in SCIM's error format", async () => {
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const s = await fake();
  const none = await handle(new Request(`${BASE}/Users`), s, BASE, "");
  assertEquals(none.status, 401);
  assertEquals((await none.json()).schemas, [SCHEMA.error]);
  const wrong = await call(s, "GET", "/Users", undefined, OTHER);
  assertEquals(wrong.status, 401);
  assertEquals(wrong.body.status, "401");
  assertEquals(wrong.headers.get("content-type"), "application/scim+json; charset=utf-8");
});

Deno.test("RFC 7644 3.3: POST /Users creates bjensen: 201, Location, id and meta; a second POST is 409 uniqueness", async () => {
  const s = await fake();
  const r = await call(s, "POST", "/Users", RFC_CREATE);
  assertEquals(r.status, 201);
  assertEquals(r.body.id, BJENSEN);
  assertEquals(r.headers.get("location"), `${BASE}/Users/${BJENSEN}`);
  assertEquals(r.body.meta.resourceType, "User");
  assertEquals(r.body.meta.location, `${BASE}/Users/${BJENSEN}`);
  assertEquals(r.body.userName, "bjensen");
  assertEquals(r.body.externalId, "bjensen");
  assertEquals(r.body.name.givenName, "Barbara");
  assertEquals(r.body.active, true);
  // RFC 7644's bjensen has no email: kept, with no email to link an account by
  assertEquals(s.puts[0].email, null);
  const again = await call(s, "POST", "/Users", { ...RFC_CREATE, userName: "BJensen" });
  assertEquals(again.status, 409);
  assertEquals(again.body.scimType, "uniqueness");
});

Deno.test("the email Placetta knows a person by: the userName when it's one, else the primary email", () => {
  assertEquals(emailOf("Bjensen@Example.com", []), "bjensen@example.com");
  assertEquals(emailOf("bjensen", [{ value: "bj@example.com", type: "home" }, { value: "Babs@Example.com", type: "work", primary: true }]), "babs@example.com");
  assertEquals(emailOf("bjensen", [{ value: "bj@example.com" }]), "bj@example.com");
  assertEquals(emailOf("bjensen", undefined), null);
  assertEquals(emailOf("bjensen", [{ value: "not an email" }]), null);
});

Deno.test("RFC 7644 3.4.2.2 filter userName eq, case-insensitive, and 3.4.2.4 paging; unsupported filters are invalidFilter", async () => {
  const s = await fake();
  await call(s, "POST", "/Users", RFC_CREATE);
  await call(s, "POST", "/Users", { schemas: [SCHEMA.user], userName: "jsmith@example.com" });
  const f = await call(s, "GET", `/Users?filter=${encodeURIComponent('userName eq "BJENSEN"')}`);
  assertEquals(f.status, 200);
  assertEquals(f.body.schemas, [SCHEMA.list]);
  assertEquals(f.body.totalResults, 1);
  assertEquals(f.body.Resources[0].userName, "bjensen");
  const none = await call(s, "GET", `/Users?filter=${encodeURIComponent('userName eq "nobody"')}`);
  assertEquals([none.body.totalResults, none.body.Resources], [0, []]);
  const page = await call(s, "GET", "/Users?startIndex=2&count=1");
  assertEquals([page.body.totalResults, page.body.startIndex, page.body.itemsPerPage, page.body.Resources[0].userName], [2, 2, 1, "jsmith@example.com"]);
  const bad = await call(s, "GET", `/Users?filter=${encodeURIComponent('title pr')}`);
  assertEquals([bad.status, bad.body.scimType], [400, "invalidFilter"]);
  assertEquals(parseFilter('emails.value eq "a@b.co"', "Users"), { attr: "email", value: "a@b.co" });
  assertEquals(parseFilter('displayName eq "Admins \\"East\\""', "Groups"), { attr: "displayName", value: 'Admins "East"' });
});

Deno.test("GET /Users/{id}: the user, or 404 in SCIM's error format (RFC 7644 3.12)", async () => {
  const s = await fake();
  await call(s, "POST", "/Users", RFC_CREATE);
  assertEquals((await call(s, "GET", `/Users/${BJENSEN}`)).body.userName, "bjensen");
  const missing = await call(s, "GET", `/Users/${JSMITH}`);
  assertEquals([missing.status, missing.body.status, missing.body.schemas], [404, "404", [SCHEMA.error]]);
  assertEquals((await call(s, "GET", "/Users/not-a-uuid")).status, 404);
});

Deno.test("RFC 7644 3.5.1 PUT replaces: what it leaves out is cleared", async () => {
  const s = await fake();
  await call(s, "POST", "/Users", RFC_CREATE);
  const r = await call(s, "PUT", `/Users/${BJENSEN}`, { schemas: [SCHEMA.user], id: BJENSEN, userName: "bjensen", emails: [{ value: "bjensen@example.com", type: "work", primary: true }] });
  assertEquals(r.status, 200);
  assertEquals(s.puts.at(-1), { user_name: "bjensen", email: "bjensen@example.com", external_id: null, given_name: null, family_name: null, display_name: null, active: true });
});

Deno.test("deprovisioning: Okta's replace {active: false} and Entra ID's Replace active \"False\" both send active false", async () => {
  const s = await fake();
  await call(s, "POST", "/Users", { schemas: [SCHEMA.user], userName: "jsmith@example.com" });
  const id = [...s.users.keys()][0];
  const okta = await call(s, "PATCH", `/Users/${id}`, patch({ op: "replace", value: { active: false } }));
  assertEquals([okta.status, okta.body.active], [200, false]);
  assertEquals(s.puts.at(-1), { active: false });
  await call(s, "PATCH", `/Users/${id}`, patch({ op: "replace", path: "active", value: true }));
  const entra = await call(s, "PATCH", `/Users/${id}`, patch({ op: "Replace", path: "active", value: "False" }));
  assertEquals([entra.status, entra.body.active], [200, false]);
  assertEquals(s.puts.at(-1), { active: false });
  const bad = await call(s, "PATCH", `/Users/${id}`, patch({ op: "replace", path: "active", value: "maybe" }));
  assertEquals([bad.status, bad.body.scimType], [400, "invalidValue"]);
});

Deno.test("RFC 7644 3.5.2.3 replace without a path: emails and nickName (not kept, accepted); name parts and externalId by path", async () => {
  const s = await fake();
  await call(s, "POST", "/Users", RFC_CREATE);
  const r = await call(s, "PATCH", `/Users/${BJENSEN}`, patch({ op: "replace", value: { emails: [{ value: "bjensen@example.com", type: "work" }], nickName: "Babs" } }));
  assertEquals(r.status, 200);
  assertEquals(s.puts.at(-1), { email: "bjensen@example.com" });
  assertEquals(r.body.emails, [{ value: "bjensen@example.com", type: "work", primary: true }]);
  await call(s, "PATCH", `/Users/${BJENSEN}`, patch({ op: "replace", path: "name.familyName", value: "Jensen-Smith" }, { op: "remove", path: "externalId" }));
  assertEquals(s.puts.at(-1), { family_name: "Jensen-Smith", external_id: null });
  // Entra's userName change by path moves the email with it
  await call(s, "PATCH", `/Users/${BJENSEN}`, patch({ op: "replace", path: "userName", value: "babs@example.com" }));
  assertEquals(s.puts.at(-1), { user_name: "babs@example.com", email: "babs@example.com" });
  const unknown = await call(s, "PATCH", `/Users/${BJENSEN}`, patch({ op: "replace", path: "shoeSize", value: 9 }));
  assertEquals([unknown.status, unknown.body.scimType], [400, "noTarget"]);
  const noSchema = await call(s, "PATCH", `/Users/${BJENSEN}`, { Operations: [{ op: "replace", path: "active", value: false }] });
  assertEquals([noSchema.status, noSchema.body.scimType], [400, "invalidSyntax"]);
});

Deno.test("an owner can't be deprovisioned by SCIM: 400 mutability, and the refusal goes in the audit trail", async () => {
  const s = await fake();
  await call(s, "POST", "/Users", { schemas: [SCHEMA.user], userName: "owner@example.com" });
  const id = [...s.users.keys()][0];
  s.owners.add(id);
  const r = await call(s, "PATCH", `/Users/${id}`, patch({ op: "replace", path: "active", value: false }));
  assertEquals([r.status, r.body.scimType], [400, "mutability"]);
  assertEquals(s.notes, ["Deactivation refused: this person is an owner"]);
});

Deno.test("RFC 7644 3.6 DELETE /Users/{id}: 204 with no body, then 404", async () => {
  const s = await fake();
  await call(s, "POST", "/Users", RFC_CREATE);
  const r = await call(s, "DELETE", `/Users/${BJENSEN}`);
  assertEquals([r.status, r.body], [204, null]);
  assertEquals((await call(s, "DELETE", `/Users/${BJENSEN}`)).status, 404);
});

Deno.test("groups: RFC 7644 3.5.2.1 add a member, 3.5.2.2 remove by members[value eq], replace, remove all; members must be provisioned", async () => {
  const s = await fake();
  await call(s, "POST", "/Users", RFC_CREATE);
  await call(s, "POST", "/Users", { schemas: [SCHEMA.user], userName: "jsmith@example.com" });
  const second = [...s.users.keys()][1];
  const g = await call(s, "POST", "/Groups", { schemas: [SCHEMA.group], displayName: "Tour Guides", members: [] });
  assertEquals([g.status, g.body.id, g.body.displayName, g.body.members], [201, GROUP, "Tour Guides", []]);
  assertEquals(g.headers.get("location"), `${BASE}/Groups/${GROUP}`);
  // 3.5.2.1, verbatim
  const add = await call(s, "PATCH", `/Groups/${GROUP}`, patch({ op: "add", path: "members", value: [{ display: "Babs Jensen", $ref: `https://example.com/v2/Users/${BJENSEN}`, value: BJENSEN }] }));
  assertEquals(add.body.members.map((m: { value: string }) => m.value), [BJENSEN]);
  await call(s, "PATCH", `/Groups/${GROUP}`, patch({ op: "add", path: "members", value: [{ value: second }] }));
  // 3.5.2.2, verbatim
  const rm = await call(s, "PATCH", `/Groups/${GROUP}`, patch({ op: "remove", path: `members[value eq "${BJENSEN}"]` }));
  assertEquals(rm.body.members.map((m: { value: string }) => m.value), [second]);
  // 3.5.2.3 replace the list
  const rep = await call(s, "PATCH", `/Groups/${GROUP}`, patch({ op: "replace", path: "members", value: [{ value: BJENSEN }] }));
  assertEquals(rep.body.members.map((m: { value: string }) => m.value), [BJENSEN]);
  // Entra ID removes with a value list
  assertEquals(groupPatchFromOps(patch({ op: "Remove", path: "members", value: [{ value: BJENSEN }] })), { remove: [BJENSEN] });
  // remove every member
  const all = await call(s, "PATCH", `/Groups/${GROUP}`, patch({ op: "remove", path: "members" }));
  assertEquals(all.body.members, []);
  const bad = await call(s, "PATCH", `/Groups/${GROUP}`, patch({ op: "add", path: "members", value: [{ value: JSMITH }] }));
  assertEquals([bad.status, bad.body.scimType], [400, "invalidValue"]);
  const name = await call(s, "PATCH", `/Groups/${GROUP}`, patch({ op: "replace", value: { displayName: "Compliance Admins" } }));
  assertEquals(name.body.displayName, "Compliance Admins");
  const f = await call(s, "GET", `/Groups?filter=${encodeURIComponent('displayName eq "compliance admins"')}&excludedAttributes=members`);
  assertEquals([f.body.totalResults, "members" in f.body.Resources[0]], [1, false]);
  assertEquals((await call(s, "DELETE", `/Groups/${GROUP}`)).status, 204);
  assertEquals((await call(s, "GET", `/Groups/${GROUP}`)).status, 404);
});

Deno.test("discovery: ServiceProviderConfig says what's supported; ResourceTypes and Schemas list User and Group", async () => {
  const s = await fake();
  const spc = await call(s, "GET", "/ServiceProviderConfig");
  assertEquals(spc.body.schemas, [SCHEMA.spc]);
  assertEquals([spc.body.patch.supported, spc.body.bulk.supported, spc.body.filter.supported, spc.body.sort.supported, spc.body.etag.supported, spc.body.changePassword.supported], [true, false, true, false, false, false]);
  assertEquals(spc.body.authenticationSchemes[0].type, "oauthbearertoken");
  assertEquals((await call(s, "GET", "/ResourceTypes")).body.Resources.map((r: { id: string }) => r.id), ["User", "Group"]);
  assertEquals((await call(s, "GET", `/Schemas/${SCHEMA.user}`)).body.name, "User");
  assertEquals((await call(s, "GET", "/Nope")).status, 404);
  assertEquals((await call(s, "POST", "/ServiceProviderConfig", {})).status, 405);
});

Deno.test("paths: with or without /v2, under the function's own path", () => {
  assertEquals(route("/functions/v1/scim/v2/Users/abc"), ["Users", "abc"]);
  assertEquals(route("/scim/Users"), ["Users"]);
  assertEquals(route("/functions/v1/scim/v2"), []);
});

Deno.test("rate limit: every request counts against the token's workspace; over it is 429", async () => {
  const s = await fake();
  s.limit = async () => false;
  const r = await call(s, "GET", "/Users");
  assertEquals(r.status, 429);
  assert(r.body.detail.includes("Too many"));
});
