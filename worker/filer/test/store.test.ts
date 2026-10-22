// node --experimental-strip-types --test test/store.test.ts (no database needed)
// The worker reaches the database only through the filer functions (20261022120000_filer_least_privilege.sql), never a
// table, so it runs on its own role key; and a saved password is asked for in the same call that writes its audit
// entry first. supabase/tests/filer_role.sql checks the database side of both.
import { test } from "node:test";
import assert from "node:assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbKey, SupabaseStore } from "../src/store.ts";
import type { Filing } from "../src/types.ts";

const b = (s: string) => ({ en: s, zh: s });
const filing: Filing = { id: "f1", workspace_id: "w1", app_id: "seller", title: b("Seller permit"), status: "in_progress", channel: "portal",
  agent_state: "running", agent_log: [], handoff_url: null, submit_clicked_at: null, attempts: 1, confirmation_number: null,
  payload: { official: "cdtfa-400", fields: [] } };

type Answer = { data?: unknown; error?: { message: string } | null };
function fake(answers: Record<string, Answer>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const storage: string[] = [];
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); const a = answers[fn] ?? { data: null }; return { data: a.data ?? null, error: a.error ?? null }; },
    from: (t: string) => { throw new Error(`table access: ${t}`); },
    storage: { from: (bucket: string) => ({
      upload: async (path: string) => { storage.push(`upload ${bucket}/${path}`); return { error: null }; },
      remove: async (paths: string[]) => { storage.push(`remove ${bucket}/${paths.join(",")}`); return { error: null }; },
      download: async (path: string) => { storage.push(`download ${bucket}/${path}`); return { data: new Blob([new Uint8Array([1, 2])]), error: null }; },
    }) },
  };
  return { client: client as unknown as SupabaseClient, calls, storage };
}

test("a saved login is opened by the one call that audits first, never by reading the vault or a table", async () => {
  const f = fake({
    filer_logins: { data: [{ id: "l-other", agency: "IRS", url: "https://sa.www4.irs.gov/", username: "x" },
                           { id: "l1", agency: "CDTFA", url: "https://onlineservices.cdtfa.ca.gov/", username: "filer1" }] },
    filer_open_login: { data: [{ username: "filer1", password: "pw-one" }] },
  });
  const s = new SupabaseStore("https://x.supabase.co", "k", f.client);
  const login = await s.login(filing, "onlineservices.cdtfa.ca.gov");
  assert.deepStrictEqual(login, { username: "filer1", password: "pw-one", host: "onlineservices.cdtfa.ca.gov" });
  assert.deepStrictEqual(f.calls.map((c) => c.fn), ["filer_logins", "filer_open_login"]);
  assert.deepStrictEqual(f.calls[1].args, { p_filing: "f1", p_login: "l1" });
  assert.ok(!f.calls.some((c) => c.fn === "vault_get"));
});

test("when the audit entry can't be written, no password comes back", async () => {
  const f = fake({
    filer_logins: { data: [{ id: "l1", agency: "CDTFA", url: "https://onlineservices.cdtfa.ca.gov/", username: "filer1" }] },
    filer_open_login: { error: { message: "audit_down" } },
  });
  const s = new SupabaseStore("https://x.supabase.co", "k", f.client);
  await assert.rejects(s.login(filing, "onlineservices.cdtfa.ca.gov"), /saved login unreadable/);
});

test("no matching login means no opening at all", async () => {
  const f = fake({ filer_logins: { data: [{ id: "l1", agency: "IRS", url: "https://sa.www4.irs.gov/", username: "x" }] } });
  const s = new SupabaseStore("https://x.supabase.co", "k", f.client);
  assert.strictEqual(await s.login(filing, "onlineservices.cdtfa.ca.gov"), null);
  assert.deepStrictEqual(f.calls.map((c) => c.fn), ["filer_logins"]);
});

test("every store operation goes through a filer function or Storage, never a table", async () => {
  const f = fake({
    claim_agent_filing: { data: [filing] }, filer_filing: { data: [filing] }, filing_agent_step: { data: filing },
    filer_skill: { data: [] }, filer_skill_failed: { data: true }, filer_self_filed: { data: 2 },
  });
  const s = new SupabaseStore("https://x.supabase.co", "k", f.client);
  assert.strictEqual((await s.claim())?.id, "f1");
  assert.strictEqual((await s.reload("f1")).id, "f1");
  await s.step(filing, null, { agent_state: "running" });
  assert.strictEqual(await s.skill("portal:x"), null);
  await s.saveSkill({ key: "portal:x", name: "X", enabled: true, uses: 1, fails_in_a_row: 0, last_seconds: 3, best_seconds: 3, body: { version: 1, steps: [] } });
  assert.deepStrictEqual(await s.skillFailed("portal:x"), { disabled: true });
  assert.strictEqual(await s.selfFiled("cdtfa-400"), 2);
  assert.deepStrictEqual([...await s.download("w1/uploads/a.pdf")], [1, 2]);
  const path = await s.saveDoc(filing, "confirmation.png", new Uint8Array([1]), "image/png");
  assert.match(path ?? "", /^w1\/receipts\/f1-\d+-confirmation\.png$/);
  assert.match(await s.saveProof(filing, "p.png", new Uint8Array([1]), "image/png") ?? "", /^w1\/proof\/f1\//);
  await s.teamTask(filing, "review", "Review it");
  await s.notify(filing, b("Submitted"), b("Confirmation 1"));
  assert.deepStrictEqual(f.calls.map((c) => c.fn), ["claim_agent_filing", "filer_filing", "filing_agent_step", "filer_skill", "filer_save_skill",
    "filer_skill_failed", "filer_self_filed", "filer_save_doc", "filer_team_task", "filer_notify"]);
  assert.ok(f.calls.every((c) => c.fn.startsWith("filer_") || ["claim_agent_filing", "filing_agent_step", "take_held_filing"].includes(c.fn)));
});

test("a document the database refuses to list is removed from storage again", async () => {
  const f = fake({ filer_save_doc: { error: { message: "path_outside_filing" } } });
  const s = new SupabaseStore("https://x.supabase.co", "k", f.client);
  assert.strictEqual(await s.saveDoc(filing, "x.png", new Uint8Array([1]), "image/png"), null);
  assert.match(f.storage.at(-1) ?? "", /^remove documents\/w1\/receipts\//);
});

test("the worker prefers its own role key, and warns while it falls back to the service role", () => {
  const warned: string[] = [];
  assert.strictEqual(dbKey({ FILER_DB_KEY: "role", SUPABASE_SERVICE_ROLE_KEY: "svc" }, (m) => warned.push(m)), "role");
  assert.strictEqual(warned.length, 0);
  assert.strictEqual(dbKey({ SUPABASE_SERVICE_ROLE_KEY: "svc" }, (m) => warned.push(m)), "svc");
  assert.match(warned[0], /FILER_DB_KEY is not set/);
  assert.throws(() => dbKey({}, () => {}), /FILER_DB_KEY/);
});
