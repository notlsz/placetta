// Run: deno test -A supabase/functions/mcp/inspector_test.ts
// Placetta's remote MCP server end to end, the way Claude and ChatGPT reach it, driven by the official MCP TypeScript SDK
// client (@modelcontextprotocol/sdk, the library the MCP Inspector is built on) over real HTTP on a local port:
//   1. the client calls the server with no token and gets 401 with WWW-Authenticate: resource_metadata
//   2. it reads the protected resource metadata (RFC 9728) and the authorization server metadata (RFC 8414)
//   3. it registers itself (RFC 7591) with a loopback redirect, as Claude Code does
//   4. it sends the person to /oauth/authorize with PKCE S256 and the resource; the server sends them to the consent
//      screen, where (here) the person allows it; the database's rules for the code are the migration's
//   5. it trades the code for tokens at /oauth/token (form-encoded), then initializes and calls every tool, lists and
//      reads the resources, lists and gets the prompts, and refreshes its token, which rotates
// The database behind it is in memory, with the same rules as 20261028090000_mcp_oauth (codes single use, bound to the
// client, redirect, PKCE and resource; refresh tokens rotate). The workspace is a tea shop with two stores, a filing
// with its timeline, an appeal and a booked inspection.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { Client } from "npm:@modelcontextprotocol/sdk@1.32.1/client/index.js";
import { StreamableHTTPClientTransport } from "npm:@modelcontextprotocol/sdk@1.32.1/client/streamableHttp.js";
import { UnauthorizedError, type OAuthClientProvider } from "npm:@modelcontextprotocol/sdk@1.32.1/client/auth.js";
import { type Deps, handle, sha256, type Token } from "./logic.ts";
import { type Grant, s256 } from "./oauth.ts";
// @ts-types="./tools.d.ts"
import { checkArgs, getPrompt, listResources, page, PROMPTS, readResource, RESOURCE_TEMPLATES, resourceScope, runMcpTool, ToolError, TOOLS } from "./tools.js";

const WS = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222", OWNER = "33333333-3333-4333-8333-333333333333";
const STATE = {
  business: { en: "Moonleaf Tea", zh: "月叶茶" },
  stores: [
    { id: "flushing", name: { en: "Flushing, Main St", zh: "法拉盛" }, address: "41-28 Main St, Flushing, NY 11355", stage: "open", rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: ["health", "sign"] },
    { id: "sanjose", name: { en: "San Jose", zh: "圣何塞" }, address: "88 N First St, San Jose, CA 95113", stage: "opening", plannedOpen: "2027-03-01", rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: [] },
  ],
  apps: [
    { id: "health", name: { en: "Food service establishment permit", zh: "餐饮许可" }, agency: { en: "NYC DOHMH", zh: "纽约市卫生局" }, level: "city", status: "review", fees: [], est: { en: "4 weeks", zh: "4 周" }, source: { label: "nyc.gov", url: "https://www.nyc.gov" }, fields: [], checklist: [] },
    { id: "sign", name: { en: "Sign permit", zh: "招牌许可" }, agency: { en: "NYC DOB", zh: "纽约市建筑局" }, level: "city", status: "needs", fees: [], est: { en: "2 weeks", zh: "2 周" }, source: { label: "nyc.gov", url: "https://www.nyc.gov" }, fields: [], checklist: [], next: { en: "Upload the landlord's consent", zh: "上传房东同意书" } },
  ],
  deadlines: [{ id: "d1", app: "sign", title: { en: "File the sign permit", zh: "提交招牌许可" }, date: "2026-11-15", kind: "filing" }],
  appeals: [{ id: "ap1", app: "sign", playbook: "nyc_bsa_appeal", route: "attorney", store: "flushing", decided: "2026-10-10", reason: "zoning", answers: {}, stage: "drafted", lastDay: "2026-11-09", fileBy: "2026-11-06", created: "2026-10-12", updated: "2026-10-20" }],
  bookings: [{ id: "b1", store: "flushing", inspection: "nyc-health", where: "nyc", name: { en: "Health inspection", zh: "卫生检查" }, agency: { en: "NYC DOHMH", zh: "纽约市卫生局" }, method: "not_booked", status: "booked", slot: "2026-11-03, morning", created: "2026-10-20", updated: "2026-10-21" }],
};
const FILING = "44444444-4444-4444-8444-444444444444";

/** The database, in memory, with the migration's rules. */
function database() {
  const clients = new Map<string, { name: string; redirects: string[] }>();
  const codes = new Map<string, { client: string; redirect: string; challenge: string; resource: string | null; scopes: string[]; ws: string; used: boolean; at: number }>();
  const tokens = new Map<string, Token & { expires: number; refresh?: string }>();
  const refreshes = new Map<string, { client: string; token: string; used: boolean; scopes: string[] }>();
  const audit: { tool: string; decision: string }[] = [];
  const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const loopbackOrHttps = (u: string) => { try { const x = new URL(u); return !x.hash && (x.protocol === "https:" || (x.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(x.hostname))); } catch { return false; } };
  const mint = async (client: string, scopes: string[]): Promise<Grant> => {
    const prefix = hex(4), access = `plc_mcp_${prefix}_${hex(24)}`, refresh = `plc_rt_${hex(32)}`;
    tokens.set(await sha256(access), { token_id: crypto.randomUUID(), prefix, workspace_id: WS, scopes: scopes as Token["scopes"], actor_id: OWNER, role: "owner", expires: Date.now() + 3600e3 });
    refreshes.set(await sha256(refresh), { client, token: access, used: false, scopes });
    return { access_token: access, token_type: "Bearer", expires_in: 3600, refresh_token: refresh, scope: scopes.join(" ") };
  };
  return {
    clients, codes, tokens, audit,
    /** The consent screen: the person (an owner of WS) allows the assistant; the database makes the code. */
    async approve(p: { client_id: string; redirect_uri: string; scope: string; code_challenge: string; resource: string }) {
      const c = clients.get(p.client_id);
      if (!c || !c.redirects.includes(p.redirect_uri)) throw new Error("unknown client or redirect");
      const code = hex(24);
      codes.set(await sha256(code), { client: p.client_id, redirect: p.redirect_uri, challenge: p.code_challenge, resource: p.resource || null, scopes: p.scope.split(" "), ws: WS, used: false, at: Date.now() });
      return code;
    },
    async register(name: string, redirects: string[]) {
      if (!redirects.every(loopbackOrHttps)) return null;
      const id = `mcpc_${hex(12)}`;
      clients.set(id, { name: name || "MCP client", redirects });
      return { client_id: id, client_name: name || "MCP client", redirect_uris: redirects };
    },
    async client(id: string, redirect: string) { const c = clients.get(id); return c ? { name: c.name, redirect_ok: c.redirects.includes(redirect) } : null; },
    async exchange(codeHash: string, clientId: string, redirect: string, challenge: string, resource: string | null): Promise<Grant> {
      const k = codes.get(codeHash);
      if (!k || k.used || k.client !== clientId || k.redirect !== redirect || k.challenge !== challenge || (k.resource && resource && k.resource !== resource) || Date.now() - k.at > 600e3) return { error: "invalid_grant" };
      k.used = true;
      return await mint(clientId, k.scopes);
    },
    async refresh(refreshHash: string, clientId: string): Promise<Grant> {
      const r = refreshes.get(refreshHash);
      if (!r || r.client !== clientId) return { error: "invalid_grant" };
      if (r.used) { tokens.delete(await sha256(r.token)); return { error: "invalid_grant" }; }   // a reused refresh token disconnects
      r.used = true;
      return await mint(clientId, r.scopes);
    },
  };
}

function serve(db: ReturnType<typeof database>) {
  const ctl = new AbortController();
  let base = "";
  const deps: Deps = {
    async auth(hash) { const t = db.tokens.get(hash); return t && t.expires > Date.now() ? t : null; },
    limit: () => Promise.resolve(true),
    async workspace(id) { return id === WS ? { name: "Moonleaf Tea", state: STATE } : { name: "Other", state: { stores: [{ id: "oakland", name: { en: "Oakland" }, address: "Oakland, CA" }] } }; },
    async filings(id) { return id === WS ? [{ id: FILING, app_id: "health", title: { en: "Food service establishment permit" }, agency: { en: "NYC DOHMH" }, status: "submitted", confirmation_number: "PA-2026-1188", submitted_at: "2026-10-01T15:00:00Z", decided_at: null, updated_at: "2026-10-20T12:00:00Z" }] : []; },
    async events(id) { return id === WS ? [
      { filing_id: FILING, at: "2026-10-01T15:00:00Z", kind: "status", status: "submitted", title: { en: "Submitted to the agency" }, source: "team", confidence: 1, url: null },
      { filing_id: FILING, at: "2026-10-20T12:00:00Z", kind: "agency", status: "in_review", title: { en: "The agency's lookup shows it under review" }, source: "agency_page", confidence: 0.9, url: "https://a810-dobnow.nyc.gov/" },
    ] : []; },
    async audit(a) { db.audit.push({ tool: a.tool, decision: a.decision }); },
    tools: TOOLS, run: runMcpTool, isToolError: (e) => e instanceof ToolError, check: checkArgs, today: () => "2026-10-23", origins: [],
    x: { page, RESOURCE_TEMPLATES, listResources, resourceScope, readResource, PROMPTS, getPrompt },
    get oauth() { return { base, consent: "https://app.placetta.test/app/", limit: () => Promise.resolve(true), register: db.register, client: db.client, exchange: db.exchange, refresh: db.refresh }; },
  };
  const srv = Deno.serve({ port: 0, hostname: "127.0.0.1", signal: ctl.signal, onListen: () => {} }, (req) => handle(req, deps));
  base = `http://127.0.0.1:${(srv.addr as Deno.NetAddr).port}/functions/v1/mcp`;
  return { base, stop: async () => { ctl.abort(); await srv.finished; } };
}

/** The assistant's side of OAuth, as the SDK asks for it; "the person" is the test, consenting on Placetta's screen. */
function provider(db: ReturnType<typeof database>, redirect: string) {
  const s: { info?: Record<string, unknown>; tokens?: Record<string, unknown>; verifier?: string; code?: string; consent?: Record<string, string>; iss?: string } = {};
  const p: OAuthClientProvider = {
    get redirectUrl() { return redirect; },
    get clientMetadata() { return { client_name: "MCP Inspector (test)", redirect_uris: [redirect], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }; },
    clientInformation: () => s.info as never,
    saveClientInformation: (i: unknown) => { s.info = i as never; },
    tokens: () => s.tokens as never,
    saveTokens: (t: unknown) => { s.tokens = t as never; },
    saveCodeVerifier: (v: string) => { s.verifier = v; },
    codeVerifier: () => s.verifier!,
    async redirectToAuthorization(url: URL) {
      // Placetta's authorize sends the person to its consent screen with the request packed in mcp_auth
      const r = await fetch(url, { redirect: "manual" });
      await r.body?.cancel();
      assertEquals(r.status, 302, "authorize sends the person on");
      const to = new URL(r.headers.get("location")!);
      assertEquals(to.origin + to.pathname, "https://app.placetta.test/app/", "to Placetta's own consent screen");
      const req = JSON.parse(atob(to.searchParams.get("mcp_auth")!.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, string>;
      s.consent = req;
      // the person allows it: the database makes the code, and the app sends them back with code, state and iss
      s.code = await db.approve(req as never);
      s.iss = req.iss;
    },
  };
  return { p, s };
}

Deno.test("an MCP client signs in with OAuth and reads everything a Placetta workspace offers (official SDK, real HTTP)", async () => {
  const db = database(), srv = serve(db);
  try {
    // 1. no token: 401, pointing at the protected resource metadata
    const bare = await fetch(srv.base, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "x", version: "1" } } }) });
    await bare.body?.cancel();
    assertEquals(bare.status, 401);
    assert(new RegExp(`resource_metadata="${srv.base}/.well-known/oauth-protected-resource"`).test(bare.headers.get("www-authenticate") ?? ""), bare.headers.get("www-authenticate") ?? "");

    // 2 to 4. the SDK discovers, registers and starts sign-in; it stops at the redirect, as a real client does
    const redirect = "http://127.0.0.1:33418/callback";
    const { p, s } = provider(db, redirect);
    const first = new StreamableHTTPClientTransport(new URL(srv.base), { authProvider: p });
    const c1 = new Client({ name: "inspector-test", version: "1.0.0" });
    let stopped = false;
    try { await c1.connect(first); } catch (e) { stopped = e instanceof UnauthorizedError; }
    assert(stopped, "the client stops for the person to sign in");
    assert(String(s.info?.client_id ?? "").startsWith("mcpc_"), "it registered itself (RFC 7591)");
    assertEquals([s.consent!.redirect_uri, s.consent!.resource.replace(/\/+$/, ""), s.consent!.iss], [redirect, srv.base, srv.base], "a loopback redirect, the resource bound, and the issuer");
    assert(/^[A-Za-z0-9_-]{43}$/.test(s.consent!.code_challenge) && s.consent!.code_challenge === await s256(s.verifier!), "PKCE S256 over the client's own verifier");
    assertEquals(s.consent!.scope.split(" ").sort(), ["deadlines", "filings", "plan", "readiness", "status"], "every scope asked for");

    // 5. the code for tokens, then the session
    await first.finishAuth(s.code!);
    assert(String(s.tokens?.access_token ?? "").startsWith("plc_mcp_") && s.tokens?.refresh_token, "an access token and a refresh token");
    // the same code again, at the token endpoint itself (the SDK won't send it twice once it has tokens)
    const again = await fetch(`${srv.base}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: s.code!, redirect_uri: redirect, code_verifier: s.verifier!, client_id: String(s.info!.client_id), resource: srv.base }) });
    assertEquals([again.status, (await again.json() as Grant).error], [400, "invalid_grant"], "the same code twice is refused");

    const client = new Client({ name: "inspector-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(srv.base), { authProvider: p }));
    assertEquals(client.getServerVersion()?.name, "placetta");

    type Tool = { name: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }; outputSchema?: unknown };
    const tools = (await client.listTools()).tools as Tool[];
    assertEquals(tools.map((t) => t.name).sort(), ["appeals", "compliance_status", "filing_status", "inspections", "plan_preview", "status_timeline", "store_readiness", "upcoming_deadlines"]);
    assert(tools.every((t) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false && !!t.outputSchema), "every tool is read only, with an output schema");
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name, arguments: args });
      assert(!r.isError, `${name}: ${JSON.stringify(r.content).slice(0, 300)}`);
      return r.structuredContent as Record<string, unknown>;
    };
    const status = await call("compliance_status");
    assert(JSON.stringify(status).includes("Upload the landlord's consent") && !JSON.stringify(status).includes("Oakland"), "its own workspace only");
    assertEquals((await call("upcoming_deadlines", { days: 60 })).total, 1);
    assert(((await call("store_readiness", { store_id: "sanjose" })).stores as unknown[]).length === 1);
    assert(((await call("plan_preview", { business: "bubble tea shop", place: "Flushing, NY" })).permits as unknown[]).length > 0);
    assertEquals(((await call("filing_status", { which: "all" })).filings as { confirmation_number: string }[])[0].confirmation_number, "PA-2026-1188");
    const tl = await call("status_timeline", { application_id: "health" });
    const ev = (tl.filings as { events: { kind: string; source: string; confidence?: number }[] }[])[0].events;
    assertEquals(ev.map((e) => [e.kind, e.source]), [["agency", "agency_page"], ["status", "team"]], "the timeline, newest first, with where each line came from");
    const ap = await call("appeals");
    const a0 = (ap.appeals as { file_by: string; days_left: number; attorney_advised: boolean }[])[0];
    assert(a0.file_by === "2026-11-06" && a0.days_left === 14 && a0.attorney_advised && /law firm/.test(String(ap.note)), JSON.stringify(ap).slice(0, 300));
    assertEquals(((await call("inspections", { store_id: "flushing" })).inspections as { slot: string }[])[0].slot, "2026-11-03, morning");

    // a workspace in the arguments, or an unknown tool, is refused with a stable code
    const wrong = await client.callTool({ name: "compliance_status", arguments: { workspace_id: OTHER } });
    assert(wrong.isError && /token belongs to/.test(JSON.stringify(wrong.content)), "the token decides the workspace");

    // resources and prompts
    const resources = (await client.listResources()).resources as { uri: string }[];
    assert(["placetta://status", "placetta://appeals", "placetta://inspections", "placetta://stores/flushing/status"].every((u) => resources.some((r) => r.uri === u)), resources.map((r) => r.uri).join(","));
    const resourceTemplates = (await client.listResourceTemplates()).resourceTemplates as { uriTemplate: string }[];
    assert(resourceTemplates.some((t) => t.uriTemplate === "placetta://filings/{application_id}/timeline"));
    const read = await client.readResource({ uri: "placetta://filings/health/timeline" });
    assert(/under review/.test(String((read.contents[0] as { text?: string }).text)), "a filing's timeline as a resource");
    const prompts = (await client.listPrompts()).prompts as { name: string }[];
    assertEquals(prompts.map((x) => x.name), ["renewal_checklist", "weekly_brief", "opening_readiness", "appeal_deadlines", "inspection_prep"]);
    const prep = await client.getPrompt({ name: "inspection_prep", arguments: { store_id: "flushing" } });
    assert((prep.messages as { content: unknown }[]).some((m) => (m.content as { resource?: { uri: string } }).resource?.uri === "placetta://inspections"), "the prompt carries its data");

    // the refresh token rotates; the old one, used again, disconnects
    const tokenUrl = `${srv.base}/oauth/token`;
    const old = String(s.tokens!.refresh_token);
    const r1 = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: old, client_id: String(s.info!.client_id) }) });
    const g1 = await r1.json() as Grant;
    assert(r1.status === 200 && g1.refresh_token && g1.refresh_token !== old, "a new refresh token");
    const r2 = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: old, client_id: String(s.info!.client_id) }) });
    assertEquals([r2.status, (await r2.json() as Grant).error], [400, "invalid_grant"], "the old one again: refused");

    assert(db.audit.some((x) => x.tool === "mcp:status_timeline" && x.decision === "allow") && db.audit.some((x) => x.tool === "mcp:compliance_status" && x.decision === "deny"), "every call is in the audit log");
    await client.close();
  } finally { await srv.stop(); }
});

Deno.test("a registration with a redirect that isn't https or loopback is refused, and authorize never redirects to an unregistered address", async () => {
  const db = database(), srv = serve(db);
  try {
    const bad = await fetch(`${srv.base}/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"], token_endpoint_auth_method: "none" }) });
    assertEquals([bad.status, (await bad.json() as { error: string }).error], [400, "invalid_redirect_uri"]);
    const good = await (await fetch(`${srv.base}/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "none", client_name: "Claude" }) })).json() as { client_id: string };
    const u = new URL(`${srv.base}/oauth/authorize`);
    for (const [k, v] of Object.entries({ client_id: good.client_id, redirect_uri: "https://evil.example/steal", response_type: "code", code_challenge: "x".repeat(43), code_challenge_method: "S256" })) u.searchParams.set(k, v);
    const r = await fetch(u, { redirect: "manual" });
    assertEquals([r.status, r.headers.get("location")], [400, null], "a page, never a redirect");
    await r.body?.cancel();
  } finally { await srv.stop(); }
});
