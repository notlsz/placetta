// deno test -A supabase/functions/_shared/access_test.ts
// The functions that keep their own accessFor send the database how the session signed in (amr), so the SSO rule
// applies to them too; on a database without the enterprise access migration they fall back to the old call.
import { deepStrictEqual as assertEquals } from "node:assert";
import { accessRpc, aalOf, claimsOf, WORKS } from "./access.ts";

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (claims: unknown) => `${b64({ alg: "HS256" })}.${b64(claims)}.sig`;
const SAML = jwt({ sub: "u", aal: "aal2", amr: [{ method: "sso/saml", timestamp: 1, provider: "p-1" }], session_id: "s" });

Deno.test("claims: aal and amr from the token; garbage is empty", () => {
  assertEquals(aalOf(SAML), "aal2");
  assertEquals(claimsOf(SAML).amr, [{ method: "sso/saml", timestamp: 1, provider: "p-1" }]);
  assertEquals(claimsOf("not.a.jwt"), {});
  assertEquals(aalOf("x"), "aal1");
});

Deno.test("access_for gets the amr claim, and only that", async () => {
  const calls: Record<string, unknown>[] = [];
  const db = { rpc: (_fn: string, args: Record<string, unknown>) => { calls.push(args); return Promise.resolve({ data: "member", error: null }); } };
  assertEquals((await accessRpc(db, "w", "u", SAML)).data, "member");
  assertEquals(calls, [{ ws: "w", uid: "u", p_aal: "aal2", p_claims: { amr: [{ method: "sso/saml", timestamp: 1, provider: "p-1" }] } }]);
});

Deno.test("before the migration (no four-argument access_for): the old call", async () => {
  const calls: Record<string, unknown>[] = [];
  const db = {
    rpc: (_fn: string, args: Record<string, unknown>) => {
      calls.push(args);
      return Promise.resolve("p_claims" in args ? { data: null, error: { code: "PGRST202" } } : { data: "owner", error: null });
    },
  };
  assertEquals((await accessRpc(db, "w", "u", SAML)).data, "owner");
  assertEquals(calls.length, 2);
  // any other error is returned as is, never retried without the SSO rule
  const failing = { rpc: () => Promise.resolve({ data: null, error: { code: "42501" } }) };
  assertEquals((await accessRpc(failing, "w", "u", SAML)).error, { code: "42501" });
});

Deno.test("who may make Odelia work: owners, admins, members; not viewers", () => {
  assertEquals(["owner", "admin", "member", "viewer", "staff", "none"].map((r) => WORKS.has(r)), [true, true, true, false, false, false]);
});
