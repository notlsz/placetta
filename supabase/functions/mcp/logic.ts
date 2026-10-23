// Placetta's own MCP server: the protocol, the token check, the rate limit and the audit, with the database behind Deps
// (index.ts wires it in). Read only. Streamable HTTP, stateless: one JSON-RPC request per POST, answered with JSON.
//   2026-07-28: no handshake or session; the version comes in each request's _meta; server/discover; resultType;
//               Mcp-Method and Mcp-Name headers must match the body; list results carry ttlMs and cacheScope.
//   2025-11-25, 2025-06-18, 2025-03-26: initialize (no Mcp-Session-Id: every request stands alone), ping.
// Auth is a workspace token (Settings, AI assistants): "Authorization: Bearer plc_mcp_..." or, for an assistant whose
// setup only takes a URL, the token as the last part of the path (.../functions/v1/mcp/plc_mcp_...). Only its SHA-256
// is looked up. The workspace always comes from the token, never from the request.
// Spec: https://modelcontextprotocol.io/specification/2026-07-28/changelog (and the 2025-11-25 transports page).
// Besides tools: resources (each store's status as an address an assistant can attach), resource templates, prompts
// ("Prepare my renewal checklist" with the data attached), opaque-cursor pagination on every list, and errors that
// carry a stable code in error.data.code or, for a tool, structuredContent.error.code.

// @ts-types="./tools.d.ts"
import type { EventRow, FilingRow, McpExtras, McpToolDef, Scope } from "./tools.js";
import { type OAuthDeps, oauthRoute, wwwAuthenticate } from "./oauth.ts";

export const STATELESS = "2026-07-28";
export const LEGACY = ["2025-11-25", "2025-06-18", "2025-03-26"];
export const SUPPORTED = [STATELESS, ...LEGACY];
export const SERVER_INFO = { name: "placetta", title: "Placetta", version: "1.0.0" };
const INSTRUCTIONS = "Placetta tracks a business's licenses, permits, filings, appeals, inspections and compliance deadlines per store. Every tool only reads, and only this token's workspace. Start with compliance_status for the store ids; status_timeline shows how each filing has moved, appeals the deadlines to contest a denial, inspections what is booked. Dates are YYYY-MM-DD. Lists longer than 50 come in pages: pass next_cursor back as cursor.";
/** Calls per token per minute, and requests per address per minute before a token is checked. */
export const PER_TOKEN = 60, PER_IP = 120;

export type Token = { token_id: string; prefix: string; workspace_id: string; scopes: Scope[]; actor_id: string; role: "owner" | "admin" };
export type Audit = { workspace_id: string; actor_id: string; actor_role: string; tool: string; input_hash: string; decision: "allow" | "deny" | "error"; code: string; reason?: string };
export type Deps = {
  auth(hash: string): Promise<Token | null>;
  limit(key: string, max: number, windowSeconds: number): Promise<boolean>;
  workspace(id: string): Promise<{ name: string; state: unknown } | null>;
  filings(id: string): Promise<FilingRow[]>;
  /** The workspace's filing timelines (filing_events), newest first; only status_timeline reads them. */
  events?(id: string): Promise<EventRow[]>;
  audit(a: Audit): Promise<void>;
  tools: McpToolDef[];
  run(name: string, args: Record<string, unknown>, ctx: { workspace: { name: string; state: unknown }; filings: FilingRow[]; events?: EventRow[]; today: string }): unknown;
  isToolError(e: unknown): boolean;
  check(schema: unknown, input: unknown): { ok: boolean; errors: string[] };
  today(): string;
  /** Browser origins allowed to call (Origin is checked against DNS rebinding); calls without an Origin are servers. */
  origins: string[];
  /** Resources, prompts and pagination (src/mcpServer.ts). */
  x: McpExtras;
  /** OAuth sign-in (oauth.ts): metadata, registration, authorize and token. Without it only pasted tokens work. */
  oauth?: OAuthDeps;
};

const enc = new TextEncoder();
export async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v ?? null);
const TOKEN = /^plc_mcp_[0-9a-f]{8}_[0-9a-f]{48}$/;

type Rpc = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
type Answer = { status: number; body?: unknown; headers?: Record<string, string> };

export async function handle(req: Request, d: Deps): Promise<Response> {
  // OAuth's own addresses first: they answer any origin, hold no cookies and check PKCE instead
  if (d.oauth) { const r = await oauthRoute(req, d.oauth); if (r) return r; }
  const origin = req.headers.get("origin");
  const cors: Record<string, string> = origin && d.origins.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Expose-Headers": "WWW-Authenticate" } : {};
  const reply = (a: Answer) => new Response(a.body === undefined ? null : JSON.stringify(a.body), {
    status: a.status, headers: { ...(a.body === undefined ? {} : { "Content-Type": "application/json" }), "Cache-Control": "no-store", ...cors, ...(a.headers ?? {}) },
  });
  // DNS rebinding: a browser page from anywhere else may not call this
  if (origin && !d.origins.includes(origin)) return reply({ status: 403, body: rpcError(null, -32000, "This origin may not call Placetta's MCP server.") });
  if (req.method === "OPTIONS") {
    return reply({ status: 204, headers: { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name", "Access-Control-Max-Age": "600" } });
  }
  // no server-to-client stream and no sessions: only POST
  if (req.method !== "POST") return reply({ status: 405, headers: { Allow: "POST, OPTIONS" } });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await d.limit(`mcp-ip:${ip}`, PER_IP, 60))) return reply({ status: 429, headers: { "Retry-After": "60" }, body: rpcError(null, -32000, "Too many requests. Try again in a minute.", { code: "rate_limited", retry_after_s: 60 }) });

  // the token: the Authorization header, or the last part of the path for assistants whose setup only takes a URL
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const tail = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const raw = TOKEN.test(bearer) ? bearer : TOKEN.test(tail) ? tail : "";
  const tok = raw ? await d.auth(await sha256(raw)) : null;
  if (!tok) {
    // with OAuth on, the 401 points at the protected resource metadata, which starts sign-in in Claude and ChatGPT
    const challenge = d.oauth ? wwwAuthenticate(d.oauth.base, !!(bearer || TOKEN.test(tail)))
      : `Bearer realm="placetta", error="invalid_token", error_description="Make a token in Placetta, Settings, AI assistants"`;
    return reply({ status: 401, headers: { "WWW-Authenticate": challenge },
      body: rpcError(null, -32001, "Placetta needs a valid workspace token. Make one in Settings, AI assistants; a revoked token, or one whose maker is no longer an owner or admin, stops working.", { code: "unauthorized" }) });
  }
  if (!(await d.limit(`mcp:${tok.token_id}`, PER_TOKEN, 60))) {
    await d.audit({ workspace_id: tok.workspace_id, actor_id: tok.actor_id, actor_role: tok.role, tool: "mcp:rate_limit", input_hash: await sha256(""), decision: "deny", code: `mcp:${tok.prefix}`, reason: "rate limited" }).catch(() => undefined);
    return reply({ status: 429, headers: { "Retry-After": "60" }, body: rpcError(null, -32000, `At most ${PER_TOKEN} calls a minute for each token. Try again in a minute.`, { code: "rate_limited", retry_after_s: 60 }) });
  }

  let msg: Rpc;
  try { msg = JSON.parse(await req.text()); } catch { return reply({ status: 400, body: rpcError(null, -32700, "Parse error: the body isn't JSON.") }); }
  // batches were taken out of the protocol in 2025-06-18
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return reply({ status: 400, body: rpcError(null, -32600, "Invalid request: send one JSON-RPC 2.0 message.") });
  }
  const method = msg.method;
  const params = (msg.params && typeof msg.params === "object" && !Array.isArray(msg.params) ? msg.params : {}) as Record<string, unknown>;
  const meta = (params._meta && typeof params._meta === "object" ? params._meta : {}) as Record<string, unknown>;
  const metaVersion = typeof meta["io.modelcontextprotocol/protocolVersion"] === "string" ? String(meta["io.modelcontextprotocol/protocolVersion"]) : "";
  const headerVersion = req.headers.get("mcp-protocol-version") ?? "";
  const stateless = metaVersion !== "" || headerVersion === STATELESS || method === "server/discover";
  const id = msg.id;
  // a notification: nothing to answer (notifications/initialized and the like)
  if (id === undefined) return reply({ status: 202 });

  const version = metaVersion || headerVersion;
  if (version && !SUPPORTED.includes(version) && method !== "initialize") {
    return reply({ status: 400, body: rpcError(id, -32022, `Unsupported protocol version ${version.slice(0, 20)}.`, { supported: SUPPORTED, requested: version.slice(0, 20) }) });
  }
  // 2026-07-28: the standard headers must say what the body says
  const hMethod = req.headers.get("mcp-method"), hName = req.headers.get("mcp-name");
  const name = (method === "tools/call" || method === "prompts/get") && typeof params.name === "string" ? params.name
    : method === "resources/read" && typeof params.uri === "string" ? params.uri : "";
  if ((hMethod !== null && hMethod !== method) || (hName !== null && name && hName !== name)) {
    return reply({ status: 400, body: rpcError(id, -32020, "The Mcp-Method or Mcp-Name header doesn't match the request body.") });
  }

  const tools = d.tools.filter((t) => tok.scopes.includes(t.scope)).sort((a, b) => a.name.localeCompare(b.name));
  const done = (result: Record<string, unknown>) => reply({ status: 200, body: { jsonrpc: "2.0", id, result: stateless ? { resultType: "complete", ...result, _meta: { ...(result._meta as object ?? {}), "io.modelcontextprotocol/serverInfo": SERVER_INFO } } : result } });
  const log = async (tool: string, args: unknown, decision: Audit["decision"], reason?: string) =>
    d.audit({ workspace_id: tok.workspace_id, actor_id: tok.actor_id, actor_role: tok.role, tool: `mcp:${tool}`.slice(0, 120), input_hash: await sha256(stable(args)), decision, code: `mcp:${tok.prefix}`, ...(reason ? { reason: reason.slice(0, 400) } : {}) }).catch(() => undefined);
  const capabilities = { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } };
  const cache = stateless ? { ttlMs: 300_000, cacheScope: "private" } : {};
  const toolError = (code: string, text: string) => done({ content: [{ type: "text", text }], structuredContent: { error: { code, message: text } }, isError: true });
  // one page of a list (opaque cursor; an invalid one is -32602, as the pagination page says)
  const paged = <T,>(list: T[]): { items: T[]; next?: string } | null => { try { return d.x.page(list, params.cursor); } catch { return null; } };
  const badCursor = () => reply({ status: 200, body: rpcError(id, -32602, "That cursor isn't one this server gave out. Start again without a cursor.", { code: "invalid_cursor" }) });
  const ctx = async (needFilings: boolean, needEvents = false) => {
    const ws = await d.workspace(tok.workspace_id);
    if (!ws) return null;
    const [filings, events] = await Promise.all([needFilings || needEvents ? d.filings(tok.workspace_id) : [], needEvents && d.events ? d.events(tok.workspace_id) : []]);
    return { workspace: ws, filings, events, today: d.today() };
  };
  const gone = () => reply({ status: 200, body: rpcError(id, -32603, "This token's workspace no longer exists.", { code: "workspace_gone" }) });

  if (method === "initialize") {
    const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
    await log("initialize", {}, "allow");
    return done({ protocolVersion: LEGACY.includes(asked) ? asked : LEGACY[0], capabilities, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
  }
  if (method === "server/discover") {
    await log("server/discover", {}, "allow");
    return done({ supportedVersions: SUPPORTED, capabilities, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
  }
  if (method === "ping") return done({});
  if (method === "tools/list") {
    const p = paged(tools.map(({ scope: _s, ...t }) => t));
    if (!p) return badCursor();
    await log("tools/list", {}, "allow");
    return done({ tools: p.items, ...(p.next ? { nextCursor: p.next } : {}), ...cache });
  }
  if (method === "resources/templates/list") {
    const p = paged(d.x.RESOURCE_TEMPLATES.filter((t) => tok.scopes.includes(t.scope)).map(({ scope: _s, ...t }) => t));
    if (!p) return badCursor();
    await log("resources/templates/list", {}, "allow");
    return done({ resourceTemplates: p.items, ...(p.next ? { nextCursor: p.next } : {}), ...cache });
  }
  if (method === "resources/list") {
    const c = await ctx(false);
    if (!c) return gone();
    const p = paged(d.x.listResources(c).filter((r) => tok.scopes.includes(r.scope)).map(({ scope: _s, ...r }) => r));
    if (!p) return badCursor();
    await log("resources/list", {}, "allow");
    return done({ resources: p.items, ...(p.next ? { nextCursor: p.next } : {}), ...cache });
  }
  if (method === "resources/read") {
    const scope = d.x.resourceScope(name);
    if (!scope) {
      await log("resources/read", { uri: name }, "deny", "not found");
      return reply({ status: 200, body: rpcError(id, -32002, `No resource at ${name.slice(0, 80) || "(no uri)"}. resources/list has the addresses.`, { code: "not_found", uri: name.slice(0, 200) }) });
    }
    if (!tok.scopes.includes(scope)) {
      await log("resources/read", { uri: name }, "deny", "scope");
      return reply({ status: 200, body: rpcError(id, -32602, `This token doesn't have the ${scope} scope this resource needs.`, { code: "scope_missing", scope }) });
    }
    try {
      const c = await ctx(scope === "filings", /\/timeline$/.test(name));
      if (!c) return gone();
      const contents = [d.x.readResource(name, c)];
      await log("resources/read", { uri: name }, "allow");
      return done({ contents });
    } catch (e) {
      const err = e as Error & { code?: string };
      await log("resources/read", { uri: name }, d.isToolError(e) ? "deny" : "error", String(err?.message ?? e));
      if (d.isToolError(e)) return reply({ status: 200, body: rpcError(id, err.code === "not_found" ? -32002 : -32602, err.message, { code: err.code ?? "invalid_arguments", uri: name.slice(0, 200) }) });
      return reply({ status: 200, body: rpcError(id, -32603, "Placetta couldn't answer that right now. Try again.", { code: "internal" }) });
    }
  }
  if (method === "prompts/list") {
    const p = paged(d.x.PROMPTS.filter((x) => x.scopes.every((s) => tok.scopes.includes(s))).map(({ scopes: _s, ...x }) => x));
    if (!p) return badCursor();
    await log("prompts/list", {}, "allow");
    return done({ prompts: p.items, ...(p.next ? { nextCursor: p.next } : {}), ...cache });
  }
  if (method === "prompts/get") {
    const args = (params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {}) as Record<string, unknown>;
    const pr = d.x.PROMPTS.find((x) => x.name === name);
    if (!pr || !pr.scopes.every((s) => tok.scopes.includes(s))) {
      const why = pr ? `This token doesn't have the scopes ${name} needs (${pr.scopes.join(", ")}).` : `No prompt named ${name.slice(0, 60)}.`;
      await log(`prompt:${name || "unknown"}`, args, "deny", why);
      return reply({ status: 200, body: rpcError(id, -32602, why, { code: pr ? "scope_missing" : "not_found" }) });
    }
    try {
      const c = await ctx(false);
      if (!c) return gone();
      const out = d.x.getPrompt(name, args, c);
      await log(`prompt:${name}`, args, "allow");
      return done(out);
    } catch (e) {
      const err = e as Error & { code?: string };
      await log(`prompt:${name}`, args, d.isToolError(e) ? "deny" : "error", String(err?.message ?? e));
      if (d.isToolError(e)) return reply({ status: 200, body: rpcError(id, -32602, err.message, { code: err.code ?? "invalid_arguments" }) });
      return reply({ status: 200, body: rpcError(id, -32603, "Placetta couldn't answer that right now. Try again.", { code: "internal" }) });
    }
  }
  if (method === "tools/call") {
    const args = (params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {}) as Record<string, unknown>;
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      const why = d.tools.some((t) => t.name === name) ? `This token doesn't have the scope for ${name}.` : `No tool named ${name.slice(0, 60)}.`;
      await log(name || "unknown", args, "deny", why);
      return reply({ status: 200, body: rpcError(id, -32602, why, { code: d.tools.some((t) => t.name === name) ? "scope_missing" : "unknown_tool" }) });
    }
    const fit = d.check(tool.inputSchema, args);
    if (!fit.ok) {
      const why = `Invalid arguments for ${name}: ${fit.errors.join("; ")}.`;
      await log(name, args, "deny", why);
      return toolError("invalid_arguments", why);
    }
    try {
      const c = await ctx(tool.scope === "filings", name === "status_timeline");
      if (!c) { await log(name, args, "error", "workspace gone"); return toolError("workspace_gone", "This token's workspace no longer exists."); }
      const out = d.run(name, args, c);
      await log(name, args, "allow");
      return done({ content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: false });
    } catch (e) {
      if (d.isToolError(e)) {
        await log(name, args, "deny", (e as Error).message);
        return toolError((e as { code?: string }).code ?? "invalid_arguments", (e as Error).message);
      }
      await log(name, args, "error", String((e as Error)?.message ?? e));
      return reply({ status: 200, body: rpcError(id, -32603, "Placetta couldn't answer that right now. Try again.", { code: "internal" }) });
    }
  }
  await log(method.slice(0, 60), {}, "deny", "method not found");
  return reply({ status: 200, body: rpcError(id, -32601, `Method not found: ${method.slice(0, 60)}. Placetta's server offers tools, resources and prompts.`, { code: "method_not_found" }) });
}

function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
}
