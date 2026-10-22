// Tests for scripts/access-review.mjs. Run: node --test scripts/access-review.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONSOLES, collaboratorFlags, staffFlags, worksheet } from "./access-review.mjs";

const now = Date.parse("2027-01-08T12:00:00Z");
const ev = {
  generated_at: "2027-01-08T11:00:00Z",
  sources: {
    "supabase.staff": { status: "ok", data: {
      staff: [
        { email: "jimmy@placetta.com", name: "Jimmy", mfa: true, signed_up: true, last_sign_in_at: "2027-01-07T10:00:00Z" },
        { email: "old@placetta.com", name: "Old", mfa: true, signed_up: true, last_sign_in_at: "2026-08-01T10:00:00Z" },
        { email: "nomfa@placetta.com", name: null, mfa: false, signed_up: true, last_sign_in_at: "2027-01-01T10:00:00Z" },
        { email: "future@placetta.com", name: null, mfa: false, signed_up: false, last_sign_in_at: null },
      ],
      all_users: { total: 42, with_mfa: 9 } } },
    "github.collaborators": { status: "ok", data: [
      { login: "notlsz", role: "admin", admin: true },
      { login: "placetta-bot", role: "write", admin: false },
      { login: "contractor|x", role: "admin", admin: true },
    ] },
    "github.branch_protection": { status: "ok", data: { protected: false, reason: "Upgrade to GitHub Pro" } },
    "supabase.secrets": { status: "skipped", reason: "SUPABASE_ACCESS_TOKEN not set" },
  },
};

test("flags staff without two-step, without a recent sign-in, or never signed up", () => {
  const [ok, old, nomfa, future] = ev.sources["supabase.staff"].data.staff;
  assert.deepEqual(staffFlags(ok, now), []);
  assert.match(staffFlags(old, now).join(), /90 days/);
  assert.match(staffFlags(nomfa, now).join(), /no two-step/);
  assert.match(staffFlags(future, now).join(), /never signed up/);
});

test("flags admins other than the owner, and bots above write", () => {
  assert.deepEqual(collaboratorFlags({ login: "notlsz", role: "admin", admin: true }), []);
  assert.deepEqual(collaboratorFlags({ login: "placetta-bot", role: "write" }), []);
  assert.match(collaboratorFlags({ login: "someone", role: "admin", admin: true }).join(), /admin who isn't the owner/);
  assert.match(collaboratorFlags({ login: "placetta-bot", role: "maintain" }).join(), /bot with more than write/);
});

test("the worksheet lists every account, every console, what's missing, and a summary of flags", () => {
  const md = worksheet(ev, { quarter: "2027-Q1", now });
  assert.match(md, /^# Access review, 2027-Q1/);
  for (const e of ["jimmy@placetta.com", "old@placetta.com", "nomfa@placetta.com", "future@placetta.com"]) assert.ok(md.includes(e), e);
  for (const [name] of CONSOLES) assert.ok(md.includes(name), name);
  assert.match(md, /contractor\\\|x/, "a pipe in a value can't break the table");
  assert.match(md, /Branch protection on main: off \(Upgrade to GitHub Pro\)/);
  assert.match(md, /Not in the bundle \(SUPABASE_ACCESS_TOKEN not set\)/);
  assert.match(md, /Flagged for a decision: staff old@placetta.com, staff nomfa@placetta.com, staff future@placetta.com, GitHub contractor\|x\./);
  assert.match(md, /Customer accounts, for context only: 42 in all, 9 with two-step on/);
  assert.ok(!/·|•/.test(md));
});

test("the blank template still has every section", () => {
  const md = worksheet({ sources: {} }, { now });
  for (const h of ["## Placetta staff", "## GitHub", "## Server function secrets", "## Consoles checked by hand", "## Summary"]) assert.ok(md.includes(h), h);
  assert.match(md, /Flagged for a decision: nothing/);
});
