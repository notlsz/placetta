// Run: deno test -A supabase/functions/mcp/oauth_test.ts
// OAuth sign-in for Placetta's MCP server, end to end through handle() the way Claude and ChatGPT run it: the 401 that
// points at the metadata, discovery, registration, authorize (refusing unregistered redirects, requiring PKCE S256),
// the person's consent (simulated: the database's part is supabase/tests/mcp_oauth.sql), the token endpoint with a
// form-encoded body, the access token on an MCP call, and refresh rotation.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { type Deps, handle, sha256, type Token } from "./logic.ts";
import { authServerMetadata, type Grant, type OAuthDeps, s256 } from "./oauth.ts";
// @ts-types="./tools.d.ts"
import { checkArgs, getPrompt, listResources, page, PROMPTS, readResource, RESOURCE_TEMPLATES, resourceScope, runMcpTool, ToolError, TOOLS } from "./tools.js";

const BASE = "https://ref.fake.test/functions/v1/mcp";
const CB = "https://claude.ai/api/mcp/auth_callback";
const A = "11111111-1111-1111-1111-111111111111";

function fixture() {
  const clients = new Map<string, { name: string; redirects: string[] }>();
  const codes = new Map<string, { client: string; redirect: string; challenge: string; scopes: string[]; used: boolean }>();
  const access = new Map<string, Token>(), refresh = new Map<string, { client: string; scopes: string[] }>(), oldRefresh = new Set<string>();
  let n = 0;
  const hexOf = () => (++n).toString(16).padStart(8, "0");
  const issue = async (client: string, scopes: string[]): Promise<Grant> => {
    const p = hexOf(), acc = `plc_mcp_${p}_${"a".repeat(40)}${p}`, ref = `plc_mrt_${"b".repeat(56)}${p}`;
    access.set(await sha256(acc), { token_id: `t-${p}`, prefix: p, workspace_id: A, scopes: scopes as Token["scopes"], actor_id: "u-a", role: "owner" });
    refresh.set(await sha256(ref), { client, scopes });
    return { access_token: acc, token_type: "Bearer", expires_in: 3600, refresh_token: ref, scope: scopes.join(" ") };
  };
  const oauth: OAuthDeps = {
    base: BASE, consent: "https://app.placetta.test/app/",
    limit: () => Promise.resolve(true),
    register: (name, redirects) => {
      if (!redirects.every((r) => /^https:\/\//.test(r) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(r))) return Promise.resolve(null);
      const id = `plc_client_${"c".repeat(24)}${hexOf()}`;
      clients.set(id, { name: name || "AI assistant", redirects });
      return Promise.resolve({ client_id: id, client_name: name || "AI assistant", redirect_uris: redirects });
    },
    client: (id, redirect) => { const c = clients.get(id); return Promise.resolve(c ? { name: c.name, redirect_ok: c.redirects.includes(redirect) } : null); },
    exchange: async (codeHash, clientId, redirect, challenge) => {
      const k = codes.get(codeHash);
      if (!k || k.used) return { error: "invalid_grant" };
      k.used = true;
      if (k.client !== clientId || k.redirect !== redirect || k.challenge !== challenge) return { error: "invalid_grant" };
      return await issue(clientId, k.scopes);
    },
    refresh: async (h, clientId) => {
      if (oldRefresh.has(h)) return { error: "invalid_grant" };
      const r = refresh.get(h);
      if (!r || r.client !== clientId) return { error: "invalid_grant" };
      refresh.delete(h); oldRefresh.add(h);
      return await issue(clientId, r.scopes);
    },
  };
  /** The consent screen and mcp_oauth_approve: the person allows these scopes; a code for the redirect. */
  const approve = async (req: { client_id: string; redirect_uri: string; code_challenge: string; scope: string }) => {
    const code = `code-${hexOf()}`;
    codes.set(await sha256(code), { client: req.client_id, redirect: req.redirect_uri, challenge: req.code_challenge, scopes: req.scope.split(" "), used: false });
    return code;
  };
  const deps: Deps = {
    auth: (h) => Promise.resolve(access.get(h) ?? null),
    limit: () => Promise.resolve(true),
    workspace: () => Promise.resolve({ name: "Lucky Leaf", state: { business: { en: "Lucky Leaf", zh: "Lucky Leaf" }, stores: [], apps: [], deadlines: [] } }),
    filings: () => Promise.resolve([]),
    audit: () => Promise.resolve(),
    tools: TOOLS, run: runMcpTool, isToolError: (e) => e instanceof ToolError, check: checkArgs,
    today: () => "2026-10-22", origins: ["https://claude.ai"],
    x: { page, RESOURCE_TEMPLATES, listResources, resourceScope, readResource, PROMPTS, getPrompt },
    oauth,
  };
  const get = (path: string) => handle(new Request(BASE + path, { method: "GET" }), deps);
  const postForm = (path: string, body: Record<string, string>) => handle(new Request(BASE + path, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() }), deps);
  const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) => handle(new Request(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }), deps);
  return { deps, get, postForm, postJson, approve };
}

const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

Deno.test("a call with no token gets a 401 that points at the resource metadata", async () => {
  const f = fixture();
  const r = await f.postJson("", { jsonrpc: "2.0", id: 1, method: "tools/list" });
  assertEquals(r.status, 401);
  const h = r.headers.get("www-authenticate") ?? "";
  assert(h.includes(`resource_metadata="${BASE}/.well-known/oauth-protected-resource"`), h);
  assert(h.includes('scope="status deadlines readiness plan filings"'), h);
  assert(!h.includes("invalid_token"), "no error when no token was sent (RFC 6750 3.1)");
  const bad = await f.postJson("", { jsonrpc: "2.0", id: 1, method: "tools/list" }, { Authorization: `Bearer plc_mcp_00000000_${"0".repeat(48)}` });
  assert((bad.headers.get("www-authenticate") ?? "").includes('error="invalid_token"'), "a bad token says so");
});

Deno.test("discovery: the resource is the server's address exactly, and the issuer advertises S256, public clients and iss", async () => {
  const f = fixture();
  const prm = await (await f.get("/.well-known/oauth-protected-resource")).json();
  assertEquals(prm.resource, BASE);
  assertEquals(prm.authorization_servers, [BASE]);
  for (const p of ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"]) {
    const r = await f.get(p);
    assertEquals(r.status, 200);
    const m = await r.json();
    assertEquals(m, authServerMetadata(BASE));
    assertEquals(m.code_challenge_methods_supported, ["S256"]);
    assertEquals(m.token_endpoint_auth_methods_supported, ["none"]);
    assert(m.registration_endpoint === `${BASE}/oauth/register` && m.authorization_response_iss_parameter_supported === true);
    assert(!("client_id_metadata_document_supported" in m), "no CIMD: Claude and ChatGPT fall back to registration");
  }
});

Deno.test("the whole sign-in: register, authorize, consent, token, call, refresh", async () => {
  const f = fixture();
  // registration (JSON, RFC 7591)
  assertEquals((await f.postJson("/oauth/register", { redirect_uris: ["http://evil.example/cb"] })).status, 400, "plain http is refused");
  assertEquals((await f.postJson("/oauth/register", { redirect_uris: [CB], token_endpoint_auth_method: "client_secret_basic" })).status, 400, "confidential clients aren't offered");
  const reg = await f.postJson("/oauth/register", { client_name: "Claude", redirect_uris: [CB, "http://localhost/callback"], grant_types: ["authorization_code", "refresh_token"], token_endpoint_auth_method: "none" });
  assertEquals(reg.status, 201);
  const client = await reg.json();
  assert(/^plc_client_/.test(client.client_id) && client.token_endpoint_auth_method === "none");

  const challenge = await s256(verifier);
  assertEquals(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "S256 as RFC 7636's own example");
  const auth = (q: Record<string, string>) => f.get(`/oauth/authorize?${new URLSearchParams(q)}`);
  const good = { response_type: "code", client_id: client.client_id, redirect_uri: CB, code_challenge: challenge, code_challenge_method: "S256", state: "xyz", scope: "status deadlines", resource: BASE };
  // an address the client didn't register: a page, never a redirect
  const evil = await auth({ ...good, redirect_uri: "https://evil.example/cb" });
  assertEquals(evil.status, 400);
  assertEquals(evil.headers.get("location"), null);
  // no PKCE: back to the client with an error, its state and the issuer
  const nopkce = await auth({ ...good, code_challenge_method: "plain" });
  assertEquals(nopkce.status, 302);
  const np = new URL(nopkce.headers.get("location")!);
  assert(np.origin + np.pathname === CB && np.searchParams.get("error") === "invalid_request" && np.searchParams.get("state") === "xyz" && np.searchParams.get("iss") === BASE);
  const wrongResource = new URL((await auth({ ...good, resource: "https://other.example/mcp" })).headers.get("location")!);
  assertEquals(wrongResource.searchParams.get("error"), "invalid_target");
  // a good request goes to Placetta's consent screen with everything it needs
  const ok = await auth(good);
  assertEquals(ok.status, 302);
  const to = new URL(ok.headers.get("location")!);
  assertEquals(to.origin + to.pathname, "https://app.placetta.test/app/");
  const req = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(to.searchParams.get("mcp_auth")!.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
  assertEquals(req, { client_id: client.client_id, redirect_uri: CB, scope: "status deadlines", state: "xyz", code_challenge: challenge, resource: BASE, iss: BASE });

  // the person allows it; the assistant trades the code (form-encoded, as Claude and ChatGPT send it)
  const code = await f.approve(req);
  const wrong = await f.postForm("/oauth/token", { grant_type: "authorization_code", code, client_id: client.client_id, redirect_uri: CB, code_verifier: "x".repeat(43) });
  assertEquals(wrong.status, 400);
  assertEquals((await wrong.json()).error, "invalid_grant", "a wrong verifier is invalid_grant");
  const code2 = await f.approve(req);
  const tok = await f.postForm("/oauth/token", { grant_type: "authorization_code", code: code2, client_id: client.client_id, redirect_uri: CB, code_verifier: verifier, resource: BASE });
  assertEquals(tok.status, 200);
  assertEquals(tok.headers.get("cache-control"), "no-store");
  const t1 = await tok.json();
  assert(t1.access_token && t1.refresh_token && t1.expires_in === 3600 && t1.token_type === "Bearer");
  const again = await f.postForm("/oauth/token", { grant_type: "authorization_code", code: code2, client_id: client.client_id, redirect_uri: CB, code_verifier: verifier });
  assertEquals((await again.json()).error, "invalid_grant", "a code is good once");

  // the access token works on the MCP server, and only for the scopes allowed
  const list = await f.postJson("", { jsonrpc: "2.0", id: 2, method: "tools/list" }, { Authorization: `Bearer ${t1.access_token}` });
  assertEquals(list.status, 200);
  const tools = (await list.json()).result.tools as { name: string; securitySchemes?: { type: string; scopes: string[] }[] }[];
  assertEquals(tools.map((t) => t.name), ["compliance_status", "upcoming_deadlines"]);
  assertEquals(tools[0].securitySchemes, [{ type: "oauth2", scopes: ["status"] }], "each tool names its scope for ChatGPT");

  // refresh: new tokens; the old refresh token is refused after
  const r1 = await f.postForm("/oauth/token", { grant_type: "refresh_token", refresh_token: t1.refresh_token, client_id: client.client_id });
  assertEquals(r1.status, 200);
  const t2 = await r1.json();
  assert(t2.refresh_token !== t1.refresh_token, "the refresh token rotates");
  const reuse = await f.postForm("/oauth/token", { grant_type: "refresh_token", refresh_token: t1.refresh_token, client_id: client.client_id });
  assertEquals(reuse.status, 400);
  assertEquals((await reuse.json()).error, "invalid_grant");
  assertEquals((await (await f.postForm("/oauth/token", { grant_type: "password", client_id: client.client_id })).json()).error, "unsupported_grant_type");
  assertEquals((await f.postForm("/oauth/token", { grant_type: "refresh_token", refresh_token: "x" })).status, 401, "no client_id, no token");
});

Deno.test("a pasted workspace token still works with OAuth on", async () => {
  const f = fixture();
  const key = "plc_mcp_aaaaaaaa_" + "a".repeat(48);
  f.deps.auth = async (h) => (h === await sha256(key) ? { token_id: "t", prefix: "aaaaaaaa", workspace_id: A, scopes: ["plan"], actor_id: "u", role: "owner" } : null);
  const r = await f.postJson("", { jsonrpc: "2.0", id: 1, method: "tools/list" }, { Authorization: `Bearer ${key}` });
  assertEquals(r.status, 200);
});
