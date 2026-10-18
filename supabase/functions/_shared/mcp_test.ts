// deno test -A supabase/functions/_shared/mcp_test.ts
// The MCP client against a fake MCP server and a fake sign-in server, both running locally. The client is pointed at
// public-looking names (https://mcp.fake.test) whose lookups say "a public address", and a test network sends those
// requests to the local server, so the address guard stays exactly as it runs in production.
import { deepStrictEqual, match, ok as assert } from "node:assert";
import {
  authorizeUrl, checkUrl, chooseClient, chooseScope, clientMetadata, coversServer, discoverAuthServer, discoverResource, exchangeCode, guardedFetch, guardUrl,
  issOk, McpClient, McpError, type Net, nameFromUrl, parseChallenge, pkce, privateIp, readOnly, refreshTokens, resultText, slugFor, sseEvents, writeNamed,
} from "./mcp.ts";

/* ------------------------------------------------------------------ the fake servers */

type Seen = { method: string; path: string; headers: Headers; body: Record<string, unknown> | null };
type Mode = { stateless?: boolean; requireToken?: string; expireOnce?: boolean };

function fakeServer(mode: Mode = {}) {
  const seen: Seen[] = [];
  let sessions = 0, expired = false;
  const live = new Set<string>();
  const codes = new Map<string, { challenge: string; resource: string; client: string }>();
  const registered: Record<string, unknown>[] = [];
  const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...headers } });
  const rpc = (id: unknown, result: unknown, headers: Record<string, string> = {}) => json({ jsonrpc: "2.0", id, result }, 200, headers);
  const tools = [
    { name: "search_pages", description: "Search the workspace.", inputSchema: { type: "object", properties: { query: { type: "string" } } }, annotations: { readOnlyHint: true } },
    { name: "create_page", description: "Create a page.", inputSchema: { type: "object", properties: { title: { type: "string" } } }, annotations: { readOnlyHint: false } },
  ];
  const page2 = [
    { name: "delete_page", description: "Delete a page.", inputSchema: { type: "object" }, annotations: { readOnlyHint: true, destructiveHint: true } },
    { name: "get_status", description: "No annotations at all.", inputSchema: { type: "object" } },
    { name: "bad name with spaces", description: "skipped", inputSchema: { type: "object" } },
  ];

  const handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    let body: Record<string, unknown> | null = null;
    const raw = req.method === "POST" ? await req.text() : "";
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    seen.push({ method: req.method, path: url.pathname, headers: req.headers, body });

    // the sign-in side
    if (url.pathname === "/.well-known/oauth-protected-resource/mcp") return json({ resource: "https://mcp.fake.test/mcp", authorization_servers: ["https://auth.fake.test/tenant"], scopes_supported: ["pages.read", "pages.write"] });
    if (url.pathname === "/.well-known/oauth-authorization-server/tenant") {
      return json({
        issuer: "https://auth.fake.test/tenant", authorization_endpoint: "https://auth.fake.test/tenant/authorize", token_endpoint: "https://auth.fake.test/tenant/token",
        registration_endpoint: "https://auth.fake.test/tenant/register", code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
        scopes_supported: ["pages.read", "pages.write", "offline_access"], authorization_response_iss_parameter_supported: true,
      });
    }
    if (url.pathname === "/tenant/register") { registered.push(body ?? {}); return json({ client_id: `client-${registered.length}`, token_endpoint_auth_method: "none" }, 201); }
    if (url.pathname === "/tenant/token") {
      const f = new URLSearchParams(raw);
      if (f.get("grant_type") === "authorization_code") {
        const c = codes.get(f.get("code") ?? "");
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(f.get("code_verifier") ?? "")));
        const ch = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        if (!c || c.challenge !== ch || c.resource !== f.get("resource") || c.client !== f.get("client_id")) return json({ error: "invalid_grant" }, 400);
        return json({ access_token: "tok-1", token_type: "Bearer", refresh_token: "ref-1", expires_in: 3600 });
      }
      if (f.get("grant_type") === "refresh_token") return f.get("refresh_token") === "ref-1" ? json({ access_token: "tok-2", token_type: "bearer", expires_in: 60 }) : json({ error: "invalid_grant" }, 400);
      return json({ error: "unsupported_grant_type" }, 400);
    }

    // the MCP side
    if (url.pathname !== "/mcp") return new Response("not here", { status: 404 });
    if (req.method === "DELETE") { live.delete(req.headers.get("mcp-session-id") ?? ""); return new Response(null, { status: 204 }); }
    if (mode.requireToken && req.headers.get("authorization") !== `Bearer ${mode.requireToken}`) {
      return new Response("", { status: 401, headers: { "www-authenticate": `Bearer realm="OAuth", resource_metadata="https://mcp.fake.test/.well-known/oauth-protected-resource/mcp", scope="pages.read"` } });
    }
    const m = String(body?.method ?? ""), id = body?.id, params = (body?.params ?? {}) as Record<string, unknown>;
    if (mode.stateless) {
      if (m === "initialize") return json({ jsonrpc: "2.0", id, error: { code: -32022, message: "Unsupported protocol version", data: { supported: ["2026-07-28"] } } }, 400);
      const meta = (params._meta ?? {}) as Record<string, unknown>;
      if (meta["io.modelcontextprotocol/protocolVersion"] !== "2026-07-28" || req.headers.get("mcp-protocol-version") !== "2026-07-28" || req.headers.get("mcp-method") !== m) {
        return json({ jsonrpc: "2.0", id, error: { code: -32020, message: "Header mismatch" } }, 400);
      }
      if (m === "server/discover") return rpc(id, { resultType: "complete", supportedVersions: ["2026-07-28"], serverInfo: { name: "fake" } });
      if (m === "tools/list") return rpc(id, { resultType: "complete", tools: [{ name: "lookup", description: "x", inputSchema: { type: "object", properties: { region: { type: "string", "x-mcp-header": "Region" } } }, annotations: { readOnlyHint: true } }] });
      if (m === "tools/call") {
        if (req.headers.get("mcp-name") !== params.name || req.headers.get("mcp-param-region") !== "us-west") return json({ jsonrpc: "2.0", id, error: { code: -32020, message: "Header mismatch" } }, 400);
        return rpc(id, { resultType: "complete", content: [{ type: "text", text: "stateless ok" }] });
      }
      return json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }, 404);
    }
    if (m === "initialize") {
      const sid = `session-${++sessions}`;
      live.add(sid);
      return rpc(id, { protocolVersion: params.protocolVersion === "2025-11-25" ? "2025-06-18" : "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "Fake", version: "1" } }, { "mcp-session-id": sid });
    }
    const sid = req.headers.get("mcp-session-id") ?? "";
    if (!sid) return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Missing session" } }, 400);
    if (mode.expireOnce && !expired && m === "tools/list") { expired = true; live.delete(sid); }
    if (!live.has(sid)) return new Response("", { status: 404 });
    if (req.headers.get("mcp-protocol-version") !== "2025-06-18") return json({ jsonrpc: "2.0", id, error: { code: -32600, message: "Bad protocol version header" } }, 400);
    if (m === "notifications/initialized") return new Response(null, { status: 202 });
    if (m === "tools/list") return params.cursor === "p2" ? rpc(id, { tools: page2 }) : rpc(id, { tools, nextCursor: "p2" });
    if (m === "tools/call") {
      const name = params.name, args = (params.arguments ?? {}) as Record<string, unknown>;
      if (name === "search_pages") {
        // as a stream: a comment, a progress notice, a request from the server we don't answer, then the answer
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          start(c) {
            c.enqueue(enc.encode(": keep-alive\n\n"));
            c.enqueue(enc.encode(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: { progress: 1 } })}\n\n`));
            c.enqueue(enc.encode(`data: ${JSON.stringify({ jsonrpc: "2.0", id: 99, method: "sampling/createMessage", params: {} })}\r\n\r\n`));
            const answer = JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `found: ${String(args.query)}` }, { type: "image", data: "AAA", mimeType: "image/png" }] } });
            c.enqueue(enc.encode(`data: ${answer.slice(0, 20)}`));   // split across chunks
            c.enqueue(enc.encode(`${answer.slice(20)}\n\n`));
            c.close();
          },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream" } });
      }
      if (name === "slow") { await new Promise((r) => setTimeout(r, 1500)); return rpc(id, { content: [] }); }
      if (name === "huge") return rpc(id, { content: [{ type: "text", text: "x".repeat(60_000) }] });
      if (name === "broken") return rpc(id, { content: [{ type: "text", text: "Invalid date" }], isError: true });
      if (name === "rpc_error") return json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown tool: rpc_error" } });
      if (name === "structured") return rpc(id, { content: [], structuredContent: { total: 3 } });
      return rpc(id, { content: [{ type: "text", text: `ran ${String(name)}` }] });
    }
    return json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  };

  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen: () => {} }, handler);
  const port = (server.addr as Deno.NetAddr).port;
  const net: Net = {
    resolve: (host) => Promise.resolve(host.endsWith(".fake.test") ? ["93.184.216.34"] : host === "evil.example" ? ["10.1.2.3"] : host === "rebind.example" ? ["93.184.216.34", "169.254.169.254"] : null),
    fetch: (input, init) => {
      const u = new URL(String(input));
      if (!u.hostname.endsWith(".fake.test")) return Promise.reject(new TypeError(`no route to ${u.hostname}`));
      return fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`, init);
    },
  };
  return { net, seen, codes, registered, close: () => server.shutdown() };
}

const URL_ = "https://mcp.fake.test/mcp";

/* ------------------------------------------------------------------ the address guard */

Deno.test("the guard: only https on the public internet", async () => {
  for (const bad of ["http://mcp.example.com/mcp", "ftp://mcp.example.com", "https://user:pw@mcp.example.com/mcp", "not a url", ""]) {
    assertEquals(throwsCode(() => checkUrl(bad)), "bad_url", bad);
  }
  for (const priv of ["https://localhost/mcp", "https://app.localhost", "https://10.0.0.5/mcp", "https://10.255.255.255", "https://192.168.1.1", "https://172.16.0.1",
    "https://169.254.169.254/latest/meta-data", "https://127.0.0.1:8443/mcp", "https://127.1/", "https://0x7f000001/", "https://[::1]/mcp", "https://[::ffff:127.0.0.1]/",
    "https://[::ffff:a9fe:a9fe]/", "https://[fe80::1]/", "https://[fd00::1]/", "https://0.0.0.0/", "https://100.64.0.1/", "https://metadata.google.internal/", "https://intranet/", "https://printer.local/"]) {
    assertEquals(throwsCode(() => checkUrl(priv)), "private_address", priv);
  }
  assertEquals(checkUrl("https://mcp.notion.com/mcp#frag").toString(), "https://mcp.notion.com/mcp");
  assertEquals(checkUrl("https://[2606:4700:4700::1111]/mcp").hostname, "[2606:4700:4700::1111]");
  assert(!privateIp("93.184.216.34") && !privateIp("2606:4700:4700::1111"));
  assert(privateIp("::") && privateIp("64:ff9b::a9fe:a9fe") && privateIp("2002:0a00:0001::") && privateIp("garbage"));
});

Deno.test("the guard checks again after the DNS lookup, and on every redirect", async () => {
  const f = fakeServer();
  try {
    await assertRejects(() => guardUrl(f.net, "https://evil.example/mcp"), McpError, "public internet");
    await assertRejects(() => guardUrl(f.net, "https://rebind.example/mcp"), McpError, "public internet");
    const redirecting: Net = { resolve: f.net.resolve, fetch: () => Promise.resolve(new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest" } })) };
    await assertRejects(() => guardedFetch(redirecting, "https://mcp.fake.test/x", { method: "GET" }, 2000), McpError, "public internet");
    const toPrivateName: Net = { resolve: f.net.resolve, fetch: () => Promise.resolve(new Response(null, { status: 307, headers: { location: "https://evil.example/" } })) };
    await assertRejects(() => guardedFetch(toPrivateName, "https://mcp.fake.test/x", { method: "POST", body: "{}" }, 2000), McpError, "public internet");
    // a name the runtime can't look up at all still gets the name checks
    assertEquals((await guardUrl({ ...f.net, resolve: () => Promise.resolve(null) }, "https://unknown.example/mcp")).hostname, "unknown.example");
    // a client pointed at a private address never sends anything
    const before = f.seen.length;
    await assertRejects(() => new McpClient({ url: "https://10.0.0.7/mcp", net: f.net }).connect(), McpError, "public internet");
    await assertRejects(() => new McpClient({ url: "https://[::1]/mcp", net: f.net }).connect(), McpError, "public internet");
    assertEquals(f.seen.length, before);
  } finally { await f.close(); }
});

/* ------------------------------------------------------------------ the protocol */

Deno.test("initialize, the session id, the version header, paging through tools/list", async () => {
  const f = fakeServer();
  try {
    const c = new McpClient({ url: URL_, net: f.net });
    await c.connect();
    assertEquals([c.protocol, c.session, c.stateless], ["2025-06-18", "session-1", false]);
    const init = f.seen.find((s) => s.body?.method === "initialize")!;
    assertEquals((init.body!.params as Record<string, unknown>).protocolVersion, "2025-11-25");
    assertMatch(init.headers.get("accept") ?? "", /application\/json.*text\/event-stream/);
    assertEquals(init.headers.get("mcp-session-id"), null);
    const notice = f.seen.find((s) => s.body?.method === "notifications/initialized")!;
    assertEquals([notice.headers.get("mcp-session-id"), notice.headers.get("mcp-protocol-version"), "id" in (notice.body ?? {})], ["session-1", "2025-06-18", false]);

    const tools = await c.listTools();
    assertEquals(tools.map((t) => [t.name, t.read_only]), [["search_pages", true], ["create_page", false], ["delete_page", false], ["get_status", false]]);
    assert(f.seen.filter((s) => s.body?.method === "tools/list").every((s) => s.headers.get("mcp-session-id") === "session-1"));
    await c.close();
    assert(f.seen.some((s) => s.method === "DELETE" && s.headers.get("mcp-session-id") === "session-1"));
  } finally { await f.close(); }
});

Deno.test("tools/call: an answer streamed as server-sent events, split across chunks, past notices and server requests", async () => {
  const f = fakeServer();
  try {
    const c = new McpClient({ url: URL_, net: f.net });
    await c.connect();
    const r = await c.callTool("search_pages", { query: "health permit" });
    assertEquals(r, { text: "found: health permit\n\n[image not shown]", is_error: false });
    assertEquals(await c.callTool("broken", {}), { text: "Invalid date", is_error: true });
    assertEquals((await c.callTool("structured", {})).text, '{"total":3}');
    await assertRejects(() => c.callTool("rpc_error", {}), McpError, "Unknown tool");
  } finally { await f.close(); }
});

Deno.test("a session the server ended: a new one is started and the request asked once more", async () => {
  const f = fakeServer({ expireOnce: true });
  try {
    const c = new McpClient({ url: URL_, net: f.net });
    await c.connect();
    const tools = await c.listTools();
    assertEquals(tools.length, 4);
    assertEquals(c.session, "session-2");
    assertEquals(f.seen.filter((s) => s.body?.method === "initialize").length, 2);
  } finally { await f.close(); }
});

Deno.test("time and size limits", async () => {
  const f = fakeServer();
  try {
    const slow = new McpClient({ url: URL_, net: f.net, timeoutMs: 300 });
    await slow.connect();
    const e = await assertRejects(() => slow.callTool("slow", {}), McpError);
    assertEquals(e.code, "timeout");
    const small = new McpClient({ url: URL_, net: f.net, maxBytes: 10_000 });
    await small.connect();
    assertEquals((await assertRejects(() => small.callTool("huge", {}), McpError)).code, "too_large");
    // a long answer within the byte limit is cut to the character limit, saying so
    const c = new McpClient({ url: URL_, net: f.net });
    await c.connect();
    const r = await c.callTool("huge", {}, { maxChars: 1000 });
    assert(r.text.length < 1100 && r.text.includes("[cut:"));
  } finally { await f.close(); }
});

Deno.test("errors: a 401 carries the challenge; an unreachable server says so", async () => {
  const f = fakeServer({ requireToken: "secret" });
  try {
    const e = await assertRejects(() => new McpClient({ url: URL_, net: f.net }).connect(), McpError);
    assertEquals([e.code, e.extra.challenge], ["auth", { resource_metadata: "https://mcp.fake.test/.well-known/oauth-protected-resource/mcp", scope: "pages.read" }]);
    const ok = new McpClient({ url: URL_, net: f.net, token: () => Promise.resolve("secret") });
    await ok.connect();
    assertEquals((await ok.callTool("anything", {})).text, "ran anything");
    assert(f.seen.filter((s) => s.path === "/mcp" && s.method === "POST").slice(-3).every((s) => s.headers.get("authorization") === "Bearer secret"));
    const down = await assertRejects(() => new McpClient({ url: "https://down.fake.test/mcp", net: { ...f.net, fetch: () => Promise.reject(new TypeError("refused")) } }).connect(), McpError);
    assertEquals(down.code, "unreachable");
  } finally { await f.close(); }
});

Deno.test("a server that only speaks the stateless revision: discover, then the version and method on every request", async () => {
  const f = fakeServer({ stateless: true });
  try {
    const c = new McpClient({ url: URL_, net: f.net });
    await c.connect();
    assertEquals([c.stateless, c.protocol, c.session], [true, "2026-07-28", null]);
    const tools = await c.listTools();
    assertEquals(tools.map((t) => [t.name, t.read_only, t.headers]), [["lookup", true, { region: "Region" }]]);
    assertEquals((await c.callTool("lookup", { region: "us-west" }, { headers: tools[0].headers })).text, "stateless ok");
  } finally { await f.close(); }
});

Deno.test("server-sent events by the spec: comments, multi-line data, CRLF and CR line ends", async () => {
  const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(":hi\r\ndata: a\rdata: b\n\nevent: other\ndata: c\n\ndata:d")); c.close(); } });
  const got: { event: string; data: string }[] = [];
  for await (const ev of sseEvents(body, 1000)) got.push(ev);
  assertEquals(got, [{ event: "message", data: "a\nb" }, { event: "other", data: "c" }, { event: "message", data: "d" }]);
});

/* ------------------------------------------------------------------ what only reads */

Deno.test("only reads: readOnlyHint true, not destructive, and a name that doesn't say it changes things", () => {
  assert(readOnly({ name: "search_pages", annotations: { readOnlyHint: true } }));
  assert(readOnly({ name: "notion-search", annotations: { readOnlyHint: true } }));
  assert(readOnly({ name: "get_post", annotations: { readOnlyHint: true } }));
  assert(!readOnly({ name: "search_pages" }));
  assert(!readOnly({ name: "search_pages", annotations: { readOnlyHint: false } }));
  assert(!readOnly({ name: "lookup", annotations: { readOnlyHint: true, destructiveHint: true } }));
  assert(!readOnly({ name: "send_email", annotations: { readOnlyHint: true } }));
  assert(!readOnly({ name: "notion-create-pages", annotations: { readOnlyHint: true } }));
  assert(!readOnly({ name: "deletePage", annotations: { readOnlyHint: true } }));
  assert(writeNamed("PostMessage") && !writeNamed("address_lookup") && !writeNamed("settings_read"));
  assertEquals(resultText({ content: [{ type: "resource_link", name: "Lease", uri: "https://x/lease.pdf" }, { type: "resource", resource: { uri: "file:///a", text: "inside" } }] }, 100), "[link] Lease https://x/lease.pdf\n\ninside");
});

/* ------------------------------------------------------------------ sign-in */

Deno.test("sign-in: the challenge, the resource and sign-in server metadata, registration, PKCE, the code and a refresh", async () => {
  const f = fakeServer({ requireToken: "tok-1" });
  try {
    const e = await assertRejects(() => new McpClient({ url: URL_, net: f.net }).connect(), McpError);
    const ch = e.extra.challenge!;
    const rm = await discoverResource(f.net, URL_, ch);
    assertEquals(rm.authorization_servers, ["https://auth.fake.test/tenant"]);
    const as = await discoverAuthServer(f.net, rm.authorization_servers[0]);
    assertEquals([as.issuer, as.token_endpoint, as.authorization_response_iss_parameter_supported], ["https://auth.fake.test/tenant", "https://auth.fake.test/tenant/token", true]);
    // the path-inserted RFC 8414 address first
    assert(f.seen.some((s) => s.path === "/.well-known/oauth-authorization-server/tenant"));

    const client = await chooseClient(f.net, as, { redirectUri: "https://p.example/functions/v1/oauth-callback" });
    assertEquals([client.client_id, client.auth, client.via], ["client-1", "none", "registered"]);
    assertEquals([f.registered[0].application_type, (f.registered[0].redirect_uris as string[])[0], f.registered[0].token_endpoint_auth_method], ["web", "https://p.example/functions/v1/oauth-callback", "none"]);

    const { verifier, challenge } = await pkce();
    assertMatch(verifier, /^[A-Za-z0-9_-]{43}$/);
    const scope = chooseScope(ch, rm, as);
    assertEquals(scope, "pages.read offline_access");
    const link = new URL(authorizeUrl(as, { client_id: client.client_id, redirect_uri: "https://p.example/cb", challenge, state: "st", resource: rm.resource, scope }));
    assertEquals([link.origin + link.pathname, link.searchParams.get("code_challenge_method"), link.searchParams.get("resource"), link.searchParams.get("state"), link.searchParams.get("response_type")],
      ["https://auth.fake.test/tenant/authorize", "S256", "https://mcp.fake.test/mcp", "st", "code"]);

    // the sign-in server hands back a code for that challenge
    f.codes.set("code-1", { challenge, resource: rm.resource, client: client.client_id });
    const t = { token_endpoint: as.token_endpoint, client_id: client.client_id, auth: client.auth, resource: rm.resource };
    await assertRejects(() => exchangeCode(f.net, t, { code: "code-1", verifier: "wrong-verifier-wrong-verifier-wrong-verifier", redirect_uri: "https://p.example/cb" }), McpError, "turned down");
    const got = await exchangeCode(f.net, t, { code: "code-1", verifier, redirect_uri: "https://p.example/cb" });
    assertEquals([got.access_token, got.refresh_token], ["tok-1", "ref-1"]);
    assert(got.expires_at! > Date.now() + 3500_000);
    const c = new McpClient({ url: URL_, net: f.net, token: () => Promise.resolve(got.access_token) });
    await c.connect();
    assertEquals((await refreshTokens(f.net, t, "ref-1")).access_token, "tok-2");
    await assertRejects(() => refreshTokens(f.net, t, "stale"), McpError, "turned down");
  } finally { await f.close(); }
});

Deno.test("sign-in refusals: no PKCE, a server describing itself as another, credentials for another issuer, a resource for another server", async () => {
  const meta = (over: Record<string, unknown>): Net => ({
    resolve: () => Promise.resolve(["93.184.216.34"]),
    fetch: () => Promise.resolve(new Response(JSON.stringify({ issuer: "https://as.example", authorization_endpoint: "https://as.example/a", token_endpoint: "https://as.example/t", code_challenge_methods_supported: ["S256"], ...over }), { headers: { "content-type": "application/json" } })),
  });
  await assertRejects(() => discoverAuthServer(meta({ code_challenge_methods_supported: undefined }), "https://as.example"), McpError, "PKCE");
  await assertRejects(() => discoverAuthServer(meta({ code_challenge_methods_supported: ["plain"] }), "https://as.example"), McpError, "PKCE");
  await assertRejects(() => discoverAuthServer(meta({ issuer: "https://honest.example" }), "https://as.example"), McpError, "different server");
  // a trailing slash in the listed issuer is the same issuer
  assertEquals((await discoverAuthServer(meta({}), "https://as.example/")).issuer, "https://as.example");
  const as = await discoverAuthServer(meta({ client_id_metadata_document_supported: true, token_endpoint_auth_methods_supported: ["none"] }), "https://as.example");
  await assertRejects(() => chooseClient(meta({}), as, { redirectUri: "https://p/cb", preregistered: { issuer: "https://other.example", client_id: "x" } }), McpError, "somewhere else");
  assertEquals((await chooseClient(meta({}), as, { redirectUri: "https://p/cb", preregistered: { issuer: "https://as.example/", client_id: "pre", client_secret: "s" } })).via, "preregistered");
  assertEquals((await chooseClient(meta({}), as, { redirectUri: "https://p/cb", metadataUrl: "https://p/functions/v1/oauth-callback/mcp-client.json" })).client_id, "https://p/functions/v1/oauth-callback/mcp-client.json");
  const noReg = await discoverAuthServer(meta({}), "https://as.example");
  await assertRejects(() => chooseClient(meta({}), noReg, { redirectUri: "https://p/cb" }), McpError, "already knows");
  // a resource description that points at a private address, or names another server, is refused
  await assertRejects(() => discoverResource(meta({}), "https://mcp.example.com/mcp", { resource_metadata: "https://169.254.169.254/latest" }), McpError, "public internet");
  const other: Net = { resolve: () => Promise.resolve(["93.184.216.34"]), fetch: () => Promise.resolve(new Response(JSON.stringify({ resource: "https://attacker.example/mcp", authorization_servers: ["https://as.example"] }))) };
  await assertRejects(() => discoverResource(other, "https://mcp.example.com/mcp", {}), McpError, "different server");
  assert(coversServer("https://mcp.airtable.com", "https://mcp.airtable.com/mcp") && coversServer("https://mcp.box.com/", "https://mcp.box.com") && !coversServer("https://mcp.example.com/other", "https://mcp.example.com/mcp"));
});

Deno.test("sign-in details: iss per RFC 9207, the challenge header, the client document, names", () => {
  assert(issOk({ issuer: "https://as.example", iss_param: true }, "https://as.example"));
  assert(!issOk({ issuer: "https://as.example", iss_param: true }, null));
  assert(!issOk({ issuer: "https://as.example", iss_param: false }, "https://as.example/"));
  assert(issOk({ issuer: "https://as.example", iss_param: false }, null));
  assertEquals(parseChallenge('Basic realm="x", Bearer error="invalid_token", error_description="a, b", resource_metadata="https://m/.well-known/x", scope="a b"'),
    { resource_metadata: "https://m/.well-known/x", scope: "a b", error: "invalid_token" });
  assertEquals(parseChallenge(null), {});
  const doc = clientMetadata("https://p/functions/v1/oauth-callback/mcp-client.json", "https://p/functions/v1/oauth-callback");
  assertEquals([doc.client_id, (doc.redirect_uris as string[])[0], doc.token_endpoint_auth_method], ["https://p/functions/v1/oauth-callback/mcp-client.json", "https://p/functions/v1/oauth-callback", "none"]);
  assertEquals(slugFor("Notion", []), "notion");
  assertEquals(slugFor("Notion", ["notion"]), "notion2");
  assertEquals(slugFor("飞书 Docs!", []), "docs");
  assertEquals(nameFromUrl("https://mcp.notion.com/mcp"), "Notion");
});

function throwsCode(fn: () => unknown): string {
  try { fn(); return "none"; } catch (e) { return e instanceof McpError ? e.code : "other"; }
}
function assertEquals(a: unknown, b: unknown, msg?: string) { deepStrictEqual(a, b, msg); }
function assertMatch(s: string, re: RegExp) { match(s, re); }
/** The error a promise rejects with: an McpError whose message includes the given words. */
async function assertRejects(fn: () => Promise<unknown>, _cls: typeof McpError, words?: string): Promise<McpError> {
  try { await fn(); } catch (e) {
    assert(e instanceof McpError, `expected an McpError, got ${e instanceof Error ? e.message : String(e)}`);
    if (words) assert(e.message.includes(words), `"${e.message}" doesn't say "${words}"`);
    return e;
  }
  throw new Error("expected it to fail");
}
