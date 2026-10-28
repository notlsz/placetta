// Run: deno test -A supabase/functions/mcp/logic_test.ts
// Placetta's MCP server against Placetta's own MCP client (supabase/functions/_shared/mcp.ts) and raw JSON-RPC: both
// protocol revisions, the token, scopes, rate limits, the audit of every call, and one workspace's token never reading
// another's.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { type Audit, type Deps, handle, PER_TOKEN, sha256, STATELESS, type Token } from "./logic.ts";
// @ts-types="./tools.d.ts"
import { checkArgs, getPrompt, listResources, page, PROMPTS, readResource, RESOURCE_TEMPLATES, resourceScope, runMcpTool, ToolError, TOOLS, type FilingRow } from "./tools.js";
import { McpClient, type Net } from "../_shared/mcp.ts";

const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
const KEY_A = "plc_mcp_aaaaaaaa_" + "a".repeat(48), KEY_B = "plc_mcp_bbbbbbbb_" + "b".repeat(48), KEY_PLAN = "plc_mcp_cccccccc_" + "c".repeat(48), KEY_GONE = "plc_mcp_dddddddd_" + "d".repeat(48);
const B2 = (en: string) => ({ en, zh: en });
const stateA = {
  business: B2("Lucky Leaf Tea LLC"),
  stores: [{ id: "flushing", name: B2("Flushing, Main St"), address: "136-20 Roosevelt Ave, Flushing, NY", stage: "opening", apps: ["fse", "sign"], rules: [], logs: [], certs: [] }],
  apps: [
    { id: "fse", name: B2("Food Service Establishment Permit"), agency: B2("NYC DOHMH"), level: "city", status: "review", fees: [], est: B2("4 weeks") },
    { id: "sign", name: B2("Sign permit"), agency: B2("NYC DOB"), level: "city", status: "needs", next: B2("Upload the landlord's consent"), fees: [], est: B2("2 weeks") },
    { id: "ein", name: B2("EIN"), agency: B2("IRS"), level: "federal", status: "approved", fees: [], est: B2("1 day") },
  ],
  deadlines: [
    { id: "d1", date: "2026-11-15", kind: "due", title: B2("File the sign permit"), app: "sign" },
    { id: "d2", date: "2027-06-01", kind: "renewal", title: B2("Renew the FSE permit"), app: "fse" },
    { id: "d0", date: "2026-10-01", kind: "due", title: B2("Already passed") },
  ],
};
const stateB = { business: B2("Quiet Noodle"), stores: [{ id: "oakland", name: B2("Oakland secret store"), address: "1 Secret St, Oakland, CA", stage: "open", apps: ["b1"], rules: [], logs: [], certs: [] }],
  apps: [{ id: "b1", name: B2("Health permit B"), agency: B2("Alameda County"), level: "county", status: "approved", fees: [], est: B2("") }], deadlines: [{ id: "x", date: "2026-11-01", kind: "due", title: B2("B's secret deadline") }] };
const filingsOf: Record<string, FilingRow[]> = {
  [A]: [{ app_id: "fse", title: B2("Food Service Establishment Permit"), agency: B2("NYC DOHMH"), status: "submitted", confirmation_number: "FSE-123", submitted_at: "2026-10-10", decided_at: null, updated_at: "2026-10-10" }],
  [B]: [{ app_id: "b1", title: B2("Health permit B"), agency: null, status: "submitted", confirmation_number: "B-SECRET", submitted_at: "2026-10-01", decided_at: null, updated_at: "2026-10-01" }],
};

function server(o: { limited?: boolean } = {}) {
  const tokens = new Map<string, Token>();
  const audits: Audit[] = [], reads: string[] = [];
  const ready = (async () => {
    tokens.set(await sha256(KEY_A), { token_id: "t-a", prefix: "aaaaaaaa", workspace_id: A, scopes: ["status", "deadlines", "readiness", "plan", "filings"], actor_id: "u-a", role: "owner" });
    tokens.set(await sha256(KEY_B), { token_id: "t-b", prefix: "bbbbbbbb", workspace_id: B, scopes: ["status", "deadlines", "readiness", "plan", "filings"], actor_id: "u-b", role: "admin" });
    tokens.set(await sha256(KEY_PLAN), { token_id: "t-p", prefix: "cccccccc", workspace_id: A, scopes: ["plan"], actor_id: "u-a", role: "owner" });
    // KEY_GONE is revoked (or its maker left): mcp_token_auth returns nothing for it
  })();
  const deps: Deps = {
    auth: async (h) => { await ready; return tokens.get(h) ?? null; },
    limit: () => Promise.resolve(!o.limited),
    workspace: (id) => { reads.push(`ws:${id}`); return Promise.resolve(id === A ? { name: "Lucky Leaf", state: stateA } : id === B ? { name: "Quiet Noodle", state: stateB } : null); },
    filings: (id) => { reads.push(`filings:${id}`); return Promise.resolve(filingsOf[id] ?? []); },
    audit: (a) => { audits.push(a); return Promise.resolve(); },
    tools: TOOLS, run: runMcpTool, isToolError: (e) => e instanceof ToolError, check: checkArgs,
    today: () => "2026-10-22", origins: ["https://claude.ai"],
    x: { page, RESOURCE_TEMPLATES, listResources, resourceScope, readResource, PROMPTS, getPrompt },
  };
  const URL_ = "https://ref.fake.test/functions/v1/mcp";
  const net: Net = { resolve: () => Promise.resolve(["93.184.216.34"]), fetch: (input, init) => handle(new Request(String(input), init), deps) };
  const post = (body: unknown, headers: Record<string, string> = {}, url = URL_) =>
    handle(new Request(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }), deps);
  return { deps, audits, reads, URL_, net, post };
}
const auth = (k: string) => ({ Authorization: `Bearer ${k}` });
const call = (name: string, args: Record<string, unknown>, id = 1) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const json = async (r: Response) => await r.json() as { result?: Record<string, unknown>; error?: { code: number; message: string; data?: unknown } };
const structured = async (r: Response) => (await json(r)).result as { structuredContent: Record<string, unknown>; isError: boolean; content: { text: string }[] };

Deno.test("Placetta's own MCP client connects (initialize, 2025-11-25), lists the eight read-only tools and reads its workspace", async () => {
  const s = server();
  const c = new McpClient({ url: s.URL_, net: s.net, token: () => Promise.resolve(KEY_A) });
  await c.connect();
  assertEquals([c.protocol, c.session, c.stateless, (c.serverInfo as { name: string }).name], ["2025-11-25", null, false, "placetta"]);
  const tools = await c.listTools();
  assertEquals(tools.map((t) => t.name), ["appeals", "compliance_status", "filing_status", "inspections", "plan_preview", "status_timeline", "store_readiness", "upcoming_deadlines"]);
  assert(tools.every((t) => t.read_only), "every tool is annotated read only");
  const r = await c.callTool("compliance_status", {});
  assert(!r.is_error && /Flushing, Main St/.test(r.text) && /Upload the landlord's consent/.test(r.text) && !/Oakland/.test(r.text), r.text);
  const deadlines = JSON.parse((await c.callTool("upcoming_deadlines", { days: 60 })).text);
  assertEquals(deadlines.deadlines.map((d: { title: string; days_left: number; store_id: string }) => [d.title, d.days_left, d.store_id]), [["File the sign permit", 24, "flushing"]]);
  const filings = JSON.parse((await c.callTool("filing_status", {})).text);
  assertEquals(filings.filings.map((f: { confirmation_number: string }) => f.confirmation_number), ["FSE-123"]);
  const ready = JSON.parse((await c.callTool("store_readiness", { store_id: "flushing" })).text);
  assert(ready.stores[0].score === 0 && ready.stores[0].parts[0].got === 0 && ready.stores[0].measures === "Ready to open", JSON.stringify(ready));
  const plan = JSON.parse((await c.callTool("plan_preview", { business: "bubble tea shop", place: "Flushing, NY" })).text);
  assert(plan.permits.length > 3 && plan.permits.every((p: { source: { url: string } }) => /^https:\/\//.test(p.source.url)), "the plan preview lists permits, each with its official source");
});

Deno.test("the stateless revision (2026-07-28): server/discover, _meta, resultType, cache hints, header checks", async () => {
  const s = server();
  const meta = { "io.modelcontextprotocol/protocolVersion": STATELESS, "io.modelcontextprotocol/clientCapabilities": {} };
  const d = await json(await s.post({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: meta } }, { ...auth(KEY_A), "MCP-Protocol-Version": STATELESS, "Mcp-Method": "server/discover" }));
  assert((d.result!.supportedVersions as string[]).includes(STATELESS) && d.result!.resultType === "complete", JSON.stringify(d));
  const l = await json(await s.post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: meta } }, { ...auth(KEY_A), "MCP-Protocol-Version": STATELESS, "Mcp-Method": "tools/list" }));
  assert(l.result!.resultType === "complete" && l.result!.ttlMs === 300000 && l.result!.cacheScope === "private" && (l.result!._meta as Record<string, { name: string }>)["io.modelcontextprotocol/serverInfo"].name === "placetta", JSON.stringify(l.result).slice(0, 300));
  const mismatch = await s.post({ ...call("compliance_status", {}), params: { name: "compliance_status", arguments: {}, _meta: meta } }, { ...auth(KEY_A), "Mcp-Method": "tools/call", "Mcp-Name": "filing_status" });
  assertEquals([mismatch.status, (await json(mismatch)).error!.code], [400, -32020]);
  const old = await s.post({ jsonrpc: "2.0", id: 3, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "1999-01-01" } } }, auth(KEY_A));
  const oe = await json(old);
  assertEquals([old.status, oe.error!.code], [400, -32022]);
  assert((oe.error!.data as { supported: string[] }).supported.includes("2025-11-25"));
});

Deno.test("the token: missing, malformed, revoked or its maker gone is 401; in the path works for URL-only setups", async () => {
  const s = server();
  for (const h of [{}, auth("nope"), auth(KEY_GONE)]) {
    const r = await s.post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, h);
    assert(r.status === 401 && /invalid_token/.test(r.headers.get("www-authenticate") ?? ""), String(r.status));
  }
  const viaPath = await s.post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {}, `${s.URL_}/${KEY_A}`);
  assertEquals(viaPath.status, 200);
  assertEquals(s.audits.length, 1, "nothing is logged for a call without a valid token (there's no workspace to log it to); the path call is");
});

Deno.test("cross-tenant: workspace A's token never reads workspace B, whatever the arguments say", async () => {
  const s = server();
  const byB = await structured(await s.post(call("compliance_status", { store_id: "oakland" }), auth(KEY_A)));
  assert(byB.isError && /No store with id "oakland" in this workspace/.test(byB.content[0].text), byB.content[0].text);
  const named = await structured(await s.post(call("upcoming_deadlines", { workspace_id: B, days: 30 }), auth(KEY_A)));
  assert(named.isError && /workspace_id/.test(named.content[0].text) && !/secret/i.test(named.content[0].text), named.content[0].text);
  const filings = await structured(await s.post(call("filing_status", { which: "all" }), auth(KEY_A)));
  assert(!JSON.stringify(filings).includes("B-SECRET"));
  assert(s.reads.every((r) => r.endsWith(A)), `only A's rows were read: ${s.reads.join(", ")}`);
  // and B's token reads B, not A
  const b = await structured(await s.post(call("compliance_status", {}), auth(KEY_B)));
  assert(/Oakland secret store/.test(b.content[0].text) && !/Flushing/.test(b.content[0].text));
  assert(s.audits.every((a) => (a.code === "mcp:aaaaaaaa") === (a.workspace_id === A)), "each call is logged to its own token's workspace");
});

Deno.test("scopes, argument checks, rate limits, origins, and every call audited", async () => {
  const s = server();
  const list = await json(await s.post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, auth(KEY_PLAN)));
  assertEquals((list.result!.tools as { name: string }[]).map((t) => t.name), ["plan_preview"]);
  const denied = await json(await s.post(call("filing_status", {}), auth(KEY_PLAN)));
  assert(denied.error?.code === -32602 && /scope/.test(denied.error.message), JSON.stringify(denied));
  const bad = await structured(await s.post(call("upcoming_deadlines", { days: "30" }), auth(KEY_A)));
  assert(bad.isError && /days must be integer/.test(bad.content[0].text), bad.content[0].text);
  const tooFar = await structured(await s.post(call("upcoming_deadlines", { days: 900 }), auth(KEY_A)));
  assert(tooFar.isError && /at most 365/.test(tooFar.content[0].text));
  assertEquals(s.audits.map((a) => [a.tool, a.decision, a.actor_role]), [["mcp:tools/list", "allow", "owner"], ["mcp:filing_status", "deny", "owner"], ["mcp:upcoming_deadlines", "deny", "owner"], ["mcp:upcoming_deadlines", "deny", "owner"]]);
  assert(s.audits.every((a) => /^[0-9a-f]{64}$/.test(a.input_hash)), "inputs are logged as hashes, never as text");

  const unknown = await json(await s.post({ jsonrpc: "2.0", id: 9, method: "sampling/createMessage" }, auth(KEY_A)));
  assertEquals([unknown.error!.code, (unknown.error!.data as { code: string }).code], [-32601, "method_not_found"]);
  assertEquals((await s.post({ jsonrpc: "2.0", method: "notifications/initialized" }, auth(KEY_A))).status, 202);
  assertEquals((await s.post([{ jsonrpc: "2.0", id: 1, method: "ping" }], auth(KEY_A))).status, 400, "no batches");
  assertEquals((await s.post("{nope", auth(KEY_A))).status, 400);
  const get = await handle(new Request(s.URL_, { method: "GET", headers: auth(KEY_A) }), s.deps);
  assertEquals([get.status, get.headers.get("allow")], [405, "POST, OPTIONS"]);
  assertEquals((await s.post({ jsonrpc: "2.0", id: 1, method: "ping" }, { ...auth(KEY_A), Origin: "https://evil.example" })).status, 403, "a page on another origin can't call it (DNS rebinding)");
  const fromClaude = await s.post({ jsonrpc: "2.0", id: 1, method: "ping" }, { ...auth(KEY_A), Origin: "https://claude.ai" });
  assertEquals([fromClaude.status, fromClaude.headers.get("access-control-allow-origin")], [200, "https://claude.ai"]);

  const limited = server({ limited: true });
  const r = await limited.post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, auth(KEY_A));
  assertEquals([r.status, r.headers.get("retry-after")], [429, "60"]);
  assertEquals((await json(r)).error!.data, { code: "rate_limited", retry_after_s: 60 });
  assert(PER_TOKEN <= 120);
});

const rpc = (method: string, params: Record<string, unknown> = {}, id = 1) => ({ jsonrpc: "2.0", id, method, params });

Deno.test("resources: each store's status as an address, templates, read, scopes, not found", async () => {
  const s = server();
  const init = await json(await s.post(rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1" } }), auth(KEY_A)));
  const caps = init.result!.capabilities as Record<string, unknown>;
  assert(caps.resources && caps.prompts && caps.tools, JSON.stringify(caps));
  const list = await json(await s.post(rpc("resources/list"), auth(KEY_A)));
  const uris = (list.result!.resources as { uri: string; mimeType: string }[]).map((r) => r.uri);
  assertEquals(uris, ["placetta://status", "placetta://deadlines", "placetta://filings/open", "placetta://appeals", "placetta://inspections", "placetta://stores/flushing/status"]);
  const tpl = await json(await s.post(rpc("resources/templates/list"), auth(KEY_A)));
  assertEquals((tpl.result!.resourceTemplates as { uriTemplate: string }[]).map((t) => t.uriTemplate), ["placetta://stores/{store_id}/status", "placetta://stores/{store_id}/readiness", "placetta://filings/{application_id}/timeline"]);
  const read = await json(await s.post(rpc("resources/read", { uri: "placetta://stores/flushing/status" }), auth(KEY_A)));
  const c = (read.result!.contents as { uri: string; mimeType: string; text: string }[])[0];
  assert(c.mimeType === "application/json" && /Upload the landlord's consent/.test(c.text), c.text.slice(0, 200));
  const rd = await json(await s.post(rpc("resources/read", { uri: "placetta://stores/flushing/readiness" }), auth(KEY_A)));
  assert(/Ready to open/.test((rd.result!.contents as { text: string }[])[0].text));
  // another workspace's store, or an address that isn't Placetta's: not found, with a stable code
  const other = await json(await s.post(rpc("resources/read", { uri: "placetta://stores/oakland/status" }), auth(KEY_A)));
  assertEquals([other.error!.code, (other.error!.data as { code: string }).code], [-32002, "not_found"]);
  const wild = await json(await s.post(rpc("resources/read", { uri: "file:///etc/passwd" }), auth(KEY_A)));
  assertEquals(wild.error!.code, -32002);
  // a plan-only token sees none of them and can't read them
  const planList = await json(await s.post(rpc("resources/list"), auth(KEY_PLAN)));
  assertEquals(planList.result!.resources, []);
  const planRead = await json(await s.post(rpc("resources/read", { uri: "placetta://status" }), auth(KEY_PLAN)));
  assertEquals((planRead.error!.data as { code: string }).code, "scope_missing");
  assert(s.reads.every((r) => r.endsWith(A)), "only A's rows were read");
});

Deno.test("prompts: the renewal checklist comes with its data attached; scopes and arguments checked", async () => {
  const s = server();
  const list = await json(await s.post(rpc("prompts/list"), auth(KEY_A)));
  assertEquals((list.result!.prompts as { name: string }[]).map((p) => p.name), ["renewal_checklist", "weekly_brief", "opening_readiness", "appeal_deadlines", "inspection_prep"]);
  const got = await json(await s.post(rpc("prompts/get", { name: "renewal_checklist", arguments: { days: "90" } }), auth(KEY_A)));
  const msgs = got.result!.messages as { role: string; content: { type: string; text?: string; resource?: { uri: string; text: string } } }[];
  assert(msgs[0].content.type === "text" && /renewal checklist for the next 90 days/.test(msgs[0].content.text!), JSON.stringify(msgs[0]));
  const dl = msgs.find((m) => m.content.resource?.uri === "placetta://deadlines")!;
  assert(/File the sign permit/.test(dl.content.resource!.text) && !/Oakland|secret/i.test(JSON.stringify(msgs)), "A's deadlines, none of B's");
  const zh = await json(await s.post(rpc("prompts/get", { name: "weekly_brief", arguments: { lang: "zh" } }), auth(KEY_A)));
  assert(/这周/.test(JSON.stringify(zh.result!.messages)));
  const noStore = await json(await s.post(rpc("prompts/get", { name: "opening_readiness", arguments: {} }), auth(KEY_A)));
  assertEquals([noStore.error!.code, (noStore.error!.data as { code: string }).code], [-32602, "invalid_arguments"]);
  const plan = await json(await s.post(rpc("prompts/list"), auth(KEY_PLAN)));
  assertEquals(plan.result!.prompts, []);
  const planGet = await json(await s.post(rpc("prompts/get", { name: "renewal_checklist" }), auth(KEY_PLAN)));
  assertEquals((planGet.error!.data as { code: string }).code, "scope_missing");
});

Deno.test("pagination and error shapes: opaque cursors, an invalid cursor is -32602, tool errors carry a code", async () => {
  const s = server();
  const bad = await json(await s.post(rpc("tools/list", { cursor: "not-a-cursor" }), auth(KEY_A)));
  assertEquals([bad.error!.code, (bad.error!.data as { code: string }).code], [-32602, "invalid_cursor"]);
  const all = await json(await s.post(rpc("tools/list"), auth(KEY_A)));
  assert(!("nextCursor" in all.result!), "five tools fit on one page");
  assert((all.result!.tools as { outputSchema?: unknown; annotations: { readOnlyHint: boolean } }[]).every((t) => t.outputSchema && t.annotations.readOnlyHint));
  // a long list pages: 120 items, 50 a page
  const p1 = page(Array.from({ length: 120 }, (_, i) => i), undefined);
  const p2 = page(Array.from({ length: 120 }, (_, i) => i), p1.next);
  const p3 = page(Array.from({ length: 120 }, (_, i) => i), p2.next);
  assertEquals([p1.items[0], p2.items[0], p3.items.length, p3.next], [0, 50, 20, undefined]);
  const tcur = await structured(await s.post(call("filing_status", { cursor: "zzz" }), auth(KEY_A)));
  assertEquals([tcur.isError, (tcur.structuredContent.error as { code: string }).code], [true, "invalid_cursor"]);
  const nf = await structured(await s.post(call("store_readiness", { store_id: "nope" }), auth(KEY_A)));
  assertEquals((nf.structuredContent.error as { code: string }).code, "not_found");
  const scope = await json(await s.post(call("filing_status", {}), auth(KEY_PLAN)));
  assertEquals((scope.error!.data as { code: string }).code, "scope_missing");
});
