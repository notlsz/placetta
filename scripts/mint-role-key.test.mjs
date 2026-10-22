// Tests for scripts/mint-role-key.mjs. Run: node --test scripts/mint-role-key.test.mjs
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { mint } from "./mint-role-key.mjs";

const secret = "a-test-secret-that-is-long-enough-1234567890";

test("a key for the filer's role, signed HS256 with the project secret, expiring when asked", () => {
  const k = mint({ secret, ref: "esquxzcfsylffuijvzec", days: 30, now: 1_800_000_000 });
  const [h, b, s] = k.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "HS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(b, "base64url").toString()),
    { iss: "supabase", ref: "esquxzcfsylffuijvzec", role: "placetta_filer", iat: 1_800_000_000, exp: 1_800_000_000 + 30 * 86400 });
  assert.equal(s, createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url"));
});

test("refuses powerful roles, bad refs, odd role names, long lives and short secrets", () => {
  for (const role of ["service_role", "postgres", "supabase_admin", "authenticator"]) assert.throws(() => mint({ secret, ref: "esquxzcfsylffuijvzec", role }), /refusing/);
  assert.throws(() => mint({ secret, ref: "esquxzcfsylffuijvzec", role: "x; drop" }), /plain role/);
  assert.throws(() => mint({ secret, ref: "nope" }), /ref/);
  assert.throws(() => mint({ secret, ref: "esquxzcfsylffuijvzec", days: 5000 }), /days/);
  assert.throws(() => mint({ secret: "short", ref: "esquxzcfsylffuijvzec" }), /SUPABASE_JWT_SECRET/);
});
