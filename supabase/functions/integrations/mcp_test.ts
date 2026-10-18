// deno test supabase/functions/integrations/mcp_test.ts
// The rules for a business's own MCP servers (mcp_rules.ts): who changes them, who uses them, what runs right away,
// what waits for an owner, what a request from outside the app may use, and that an approved call runs once.
import { deepStrictEqual as eq, ok as assert, rejects } from "node:assert";
import { approveOnce, argsOf, type Claimed, isRefusal, keepDisabled, MCP_MEMBER_ACTIONS, MCP_OWNER_ACTIONS, mayUse, remoteAllows, runsDirectly, sameCall, type StoredTool, toolOf } from "./mcp_rules.ts";

const OWNER = "11111111-1111-1111-1111-111111111111", MEMBER = "22222222-2222-2222-2222-222222222222", OTHER = "33333333-3333-3333-3333-333333333333";
const search: StoredTool = { name: "notion-search", description: "Search", read_only: true, input_schema: { type: "object" } };
const create: StoredTool = { name: "notion-create-pages", description: "Create", read_only: false, input_schema: { type: "object" } };
const server = (over: Partial<{ status: string; connected_by: string | null; disabled: string[] }> = {}) => ({ status: "connected", connected_by: OWNER, tools: [search, create], disabled: [], ...over });

Deno.test("owners alone connect, refresh, switch tools, disconnect, approve and decline", () => {
  eq([...MCP_OWNER_ACTIONS].sort(), ["mcp_approve", "mcp_connect", "mcp_decline", "mcp_disconnect", "mcp_refresh", "mcp_tool"]);
  // what members may ask for: the list, the tools Odelia offers them, reads and proposals (which never run by themselves)
  eq([...MCP_MEMBER_ACTIONS].sort(), ["mcp_available", "mcp_call", "mcp_list", "mcp_propose", "mcp_tools"]);
  assert(!MCP_OWNER_ACTIONS.some((a) => (MCP_MEMBER_ACTIONS as readonly string[]).includes(a)));
});

Deno.test("every MCP action the function answers is listed as an owner's or a member's", async () => {
  // mcp.ts opens a database client when it loads: give it an address first (nothing is called)
  if (!Deno.env.get("SUPABASE_URL")) Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test");
  const { MCP_ACTIONS } = await import("./mcp.ts");
  eq(Object.keys(MCP_ACTIONS).sort(), [...MCP_OWNER_ACTIONS, ...MCP_MEMBER_ACTIONS].sort());
});

Deno.test("using a server through Odelia: an owner, or the member who connected it", () => {
  assert(mayUse("owner", server(), OWNER) && mayUse("owner", server({ connected_by: MEMBER }), OTHER));
  assert(mayUse("member", server({ connected_by: MEMBER }), MEMBER));
  assert(!mayUse("member", server(), MEMBER) && !mayUse("member", server({ connected_by: null }), MEMBER));
  assert(!mayUse("staff", server(), OWNER) && !mayUse("", server(), OWNER));
});

Deno.test("a tool must exist, be on, and its server connected", () => {
  eq(toolOf(server(), "notion-search", "Notion"), search);
  const off = toolOf(server({ disabled: ["notion-search"] }), "notion-search", "Notion");
  assert(isRefusal(off) && off.code === "forbidden" && /switched off/.test(off.en) && /关闭/.test(off.zh));
  const missing = toolOf(server(), "nope", "Notion");
  assert(isRefusal(missing) && missing.code === "not_found");
  const broken = toolOf(server({ status: "error" }), "notion-search", "Notion");
  assert(isRefusal(broken) && broken.code === "not_connected");
  assert(!isRefusal(search));
});

Deno.test("what runs right away: only a tool that reads; anything else waits for an owner", () => {
  assert(runsDirectly(search));
  assert(!runsDirectly(create));
  assert(!runsDirectly({ ...search, read_only: undefined as unknown as boolean }));
});

Deno.test("outside the app: only tools that read, and none from plain SMS", () => {
  for (const ch of ["email", "sms", "voice", "slack", "lark", "wechat"]) {
    eq(remoteAllows(ch, false, search), null, `${ch} reads`);
    const r = remoteAllows(ch, false, create);
    assert(r && r.code === "forbidden" && /Placetta app/.test(r.en), `${ch} doesn't change things`);
  }
  const plain = remoteAllows("sms", true, search);
  assert(plain && /plain text message/.test(plain.en) && plain.zh.length > 0);
  eq(remoteAllows("app", false, create), null);
  eq(remoteAllows("", false, create), null);
});

Deno.test("arguments: a plain object, at most 20 KB", () => {
  eq(argsOf(undefined), {});
  eq(argsOf({ query: "permit" }), { query: "permit" });
  assert(isRefusal(argsOf("query=permit")) && isRefusal(argsOf([1, 2])) && isRefusal(argsOf({ big: "x".repeat(21_000) })));
});

Deno.test("an approval runs only the call the owner saw: the same tool and inputs, whatever the key order", () => {
  const stored = { tool: "notion-create-pages", arguments: { title: "Opening", parent: { id: "p1", type: "page" } } };
  assert(sameCall({ tool: "notion-create-pages", arguments: { parent: { type: "page", id: "p1" }, title: "Opening" } }, stored));
  assert(!sameCall({ tool: "notion-create-pages", arguments: { title: "Closing", parent: { id: "p1", type: "page" } } }, stored));
  assert(!sameCall({ tool: "notion-delete-page", arguments: stored.arguments }, stored));
  assert(!sameCall(undefined, stored) && !sameCall({}, stored));
});

Deno.test("switches survive a new tool list for the tools that are still there", () => {
  eq(keepDisabled(["notion-search", "gone"], [search, create]), ["notion-search"]);
});

Deno.test("an approved call runs once: a second approval finds nothing to run", async () => {
  // the database's claim (mcp_claim_call) moves a waiting call to running; here, the same in memory
  const calls = new Map<string, { status: string; c: Claimed }>([["c1", { status: "waiting", c: { id: "c1", server_id: "s1", tool: "notion-create-pages", arguments: { title: "Opening" } } }]]);
  const claim = (id: string) => async () => { const x = calls.get(id); if (!x || x.status !== "waiting") return null; x.status = "running"; return x.c; };
  const ran: string[] = [], settled: [string, boolean][] = [];
  const steps = (id: string) => ({
    claim: claim(id),
    run: async (c: Claimed) => { ran.push(c.tool); return { text: "created", is_error: false }; },
    settle: async (c: Claimed, ok: boolean) => { settled.push([c.id, ok]); calls.get(c.id)!.status = ok ? "done" : "failed"; },
  });
  const first = await approveOnce(steps("c1"));
  assert(first.ran && first.out.text === "created");
  const again = await approveOnce(steps("c1"));
  eq(again, { ran: false });
  eq(ran, ["notion-create-pages"]);
  eq(settled, [["c1", true]]);
  eq(calls.get("c1")!.status, "done");
  // a run that fails is settled as failed, never left running, and never retried by a second approval
  calls.set("c2", { status: "waiting", c: { id: "c2", server_id: "s1", tool: "notion-create-pages", arguments: {} } });
  await rejects(() => approveOnce({ ...steps("c2"), run: async () => { throw new Error("upstream down"); } }), /upstream down/);
  eq(calls.get("c2")!.status, "failed");
  eq(await approveOnce(steps("c2")), { ran: false });
  // nothing to claim (declined, expired, or not an owner): nothing runs
  eq(await approveOnce({ ...steps("zz"), run: async () => { throw new Error("must not run"); } }), { ran: false });
});
