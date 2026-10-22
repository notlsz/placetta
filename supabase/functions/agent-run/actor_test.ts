import { deepStrictEqual as assertEquals } from "node:assert";
import { actorOf } from "./actor.ts";
import { secretValues, withoutEnv } from "../_shared/secrets.ts";

type Rows = Record<string, string>;
const db = (roles: Rows, o: { missing?: boolean; down?: boolean } = {}) => ({
  calls: [] as string[],
  rpc(fn: string, args: Record<string, unknown>) {
    this.calls.push(fn);
    if (o.down) return Promise.resolve({ data: null, error: { code: "08006" } });
    if (o.missing) return Promise.resolve({ data: null, error: { code: "PGRST202" } });
    return Promise.resolve({ data: roles[`${args.p_ws}/${args.p_uid}`] ?? "none", error: null });
  },
  from(_t: string) {
    let ws = "", uid = "";
    const q = { eq(k: string, v: unknown) { if (k === "workspace_id") ws = String(v); else uid = String(v); return q; }, maybeSingle: () => Promise.resolve({ data: roles[`${ws}/${uid}`] ? { role: roles[`${ws}/${uid}`] } : null, error: null }) };
    return { select: (_c: string) => q } as never;
  },
});

Deno.test("a run acts with the role the person has in that workspace now", async () => {
  const d = db({ "w1/owner": "owner", "w1/mem": "member", "w1/adm": "admin", "w1/view": "viewer", "w2/mem": "owner" });
  assertEquals(await actorOf(d, { workspace_id: "w1", created_by: "owner", kind: "task" }), { actor: { id: "owner", role: "owner" } });
  assertEquals(await actorOf(d, { workspace_id: "w1", created_by: "mem", kind: "task" }), { actor: { id: "mem", role: "member" } });
  assertEquals(await actorOf(d, { workspace_id: "w1", created_by: "adm", kind: "task" }), { actor: { id: "adm", role: "admin" } });
});

Deno.test("a member's run is a member's even where they own another workspace: no escalation across tenants", async () => {
  const d = db({ "w1/mem": "member", "w2/mem": "owner" });
  assertEquals(await actorOf(d, { workspace_id: "w1", created_by: "mem", kind: "task" }), { actor: { id: "mem", role: "member" } });
});

Deno.test("someone who left, or only views, stops the run", async () => {
  const d = db({ "w1/view": "viewer" });
  const gone = await actorOf(d, { workspace_id: "w1", created_by: "gone", kind: "task" });
  assertEquals("refused" in gone && /isn't on this workspace/.test(gone.refused), true);
  const view = await actorOf(d, { workspace_id: "w1", created_by: "view", kind: "task" });
  assertEquals("refused" in view && /only view/.test(view.refused), true);
  const other = await actorOf(d, { workspace_id: "w9", created_by: "mem", kind: "task" });
  assertEquals("refused" in other, true);
});

Deno.test("a background check nobody started is the system; a task with no person doesn't run", async () => {
  assertEquals(await actorOf(db({}), { workspace_id: "w1", created_by: null, kind: "watch" }), { actor: { id: null, role: "system" } });
  assertEquals("refused" in await actorOf(db({}), { workspace_id: "w1", created_by: null, kind: "task" }), true);
});

Deno.test("without the migration it falls back to the membership row; a database error refuses", async () => {
  assertEquals(await actorOf(db({ "w1/mem": "member" }, { missing: true }), { workspace_id: "w1", created_by: "mem", kind: "task" }), { actor: { id: "mem", role: "member" } });
  assertEquals("refused" in await actorOf(db({ "w1/mem": "member" }, { down: true }), { workspace_id: "w1", created_by: "mem", kind: "task" }), true);
});

Deno.test("the server's own secrets are cut from a model request, whatever put them there", () => {
  const env = { ANTHROPIC_API_KEY: "sk-ant-api03-secretsecret", SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiJ9.service.role", AGENT_MODEL: "claude-sonnet-5-5", GEMINI_PAID: "1", FILER_SECRET: "short" };
  const secrets = secretValues(env);
  assertEquals(secrets.includes("claude-sonnet-5-5"), false);
  assertEquals(secrets.includes("short"), false);
  const { body, cut } = withoutEnv({ messages: [{ role: "user", content: "the key is sk-ant-api03-secretsecret and eyJhbGciOiJIUzI1NiJ9.service.role" }], model: "claude-sonnet-5-5" }, secrets);
  assertEquals(cut, 2);
  assertEquals(JSON.stringify(body).includes("secretsecret"), false);
  assertEquals(body.model, "claude-sonnet-5-5");
});
