// Placetta's own MCP server: the protocol, the token check, the rate limit and the audit, with the database behind Deps
// (index.ts wires it in). Read only. Streamable HTTP, stateless: one JSON-RPC request per POST, answered with JSON.
//   2026-07-28: no handshake or session; the version comes in each request's _meta; server/discover; resultType;
//               Mcp-Method and Mcp-Name headers must match the body; list results carry ttlMs and cacheScope.
//   2025-11-25, 2025-06-18, 2025-03-26: initialize (no Mcp-Session-Id: every request stands alone), ping.
// Auth is a workspace token (Settings, AI assistants): "Authorization: Bearer plc_mcp_..." or, for an assistant whose
// setup only takes a URL, the token as the last part of the path (.../functions/v1/mcp/plc_mcp_...). Only its SHA-256
// is looked up. The workspace always comes from the token, never from the request.
// Spec: https://modelcontextprotocol.io/specification/2026-07-28/changelog (and the 2025-11-25 transports page).

// @ts-types="./tools.d.ts"
import type { FilingRow, McpToolDef, Scope } from "./tools.js";

export const STATELESS = "2026-07-28";
export const LEGACY = ["2025-11-25", "2025-06-18", "2025-03-26"];
export const SUPPORTED = [STATELESS, ...LEGACY];
export const SERVER_INFO = { name: "placetta", title: "Placetta", version: "1.0.0" };
const INSTRUCTIONS = "Placetta tracks a business's licenses, permits, filings and compliance deadlines per store. Every tool only reads, and only this token's workspace. Start with compliance_status for the store ids. Dates are YYYY-MM-DD.";
/** Calls per token per minute, and requests per address per minute before a token is checked. */
export const PER_TOKEN = 60, PER_IP = 120;

export type Token = { token_id: string; prefix: string; workspace_id: string; scopes: Scope[]; actor_id: string; role: "owner" | "admin" };
export type Audit = { workspace_id: string; actor_id: string; actor_role: string; tool: string; input_hash: string; decision: "allow" | "deny" | "error"; code: string; reason?: string };
export type Deps = {
  auth(hash: string): Promise<Token | null>;
  limit(key: string, max: number, windowSeconds: number): Promise<boolean>;
  workspace(id: string): Promise<{ name: string; state: unknown } | null>;
  filings(id: string): Promise<FilingRow[]>;
  audit(a: Audit): Promise<void>;
  tools: McpToolDef[];
  run(name: string, args: Record<string, unknown>, ctx: { workspace: { name: string; state: unknown }; filings: FilingRow[]; today: string }): unknown;
  isToolError(e: unknown): boolean;
  check(schema: unknown, input: unknown): { ok: boolean; errors: string[] };
  today(): string;
  /** Browser origins allowed to call (Origin is checked against DNS rebinding); calls without an Origin are servers. */
  origins: string[];
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
  if (!(await d.limit(`mcp-ip:${ip}`, PER_IP, 60))) return reply({ status: 429, headers: { "Retry-After": "60" }, body: rpcError(null, -32000, "Too many requests. Try again in a minute.") });

  // the token: the Authorization header, or the last part of the path for assistants whose setup only takes a URL
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const tail = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const raw = TOKEN.test(bearer) ? bearer : TOKEN.test(tail) ? tail : "";
  const tok = raw ? await d.auth(await sha256(raw)) : null;
  if (!tok) {
    return reply({ status: 401, headers: { "WWW-Authenticate": `Bearer realm="placetta", error="invalid_token", error_description="Make a token in Placetta, Settings, AI assistants"` },
      body: rpcError(null, -32001, "Placetta needs a valid workspace token. Make one in Settings, AI assistants; a revoked token, or one whose maker is no longer an owner or admin, stops working.") });
  }
  if (!(await d.limit(`mcp:${tok.token_id}`, PER_TOKEN, 60))) {
    await d.audit({ workspace_id: tok.workspace_id, actor_id: tok.actor_id, actor_role: tok.role, tool: "mcp:rate_limit", input_hash: await sha256(""), decision: "deny", code: `mcp:${tok.prefix}`, reason: "rate limited" }).catch(() => undefined);
    return reply({ status: 429, headers: { "Retry-After": "60" }, body: rpcError(null, -32000, `At most ${PER_TOKEN} calls a minute for each token. Try again in a minute.`) });
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
  const name = method === "tools/call" && typeof params.name === "string" ? params.name : "";
  if ((hMethod !== null && hMethod !== method) || (hName !== null && name && hName !== name)) {
    return reply({ status: 400, body: rpcError(id, -32020, "The Mcp-Method or Mcp-Name header doesn't match the request body.") });
  }

  const tools = d.tools.filter((t) => tok.scopes.includes(t.scope)).sort((a, b) => a.name.localeCompare(b.name));
  const done = (result: Record<string, unknown>) => reply({ status: 200, body: { jsonrpc: "2.0", id, result: stateless ? { resultType: "complete", ...result, _meta: { ...(result._meta as object ?? {}), "io.modelcontextprotocol/serverInfo": SERVER_INFO } } : result } });
  const log = async (tool: string, args: unknown, decision: Audit["decision"], reason?: string) =>
    d.audit({ workspace_id: tok.workspace_id, actor_id: tok.actor_id, actor_role: tok.role, tool: `mcp:${tool}`.slice(0, 120), input_hash: await sha256(stable(args)), decision, code: `mcp:${tok.prefix}`, ...(reason ? { reason: reason.slice(0, 400) } : {}) }).catch(() => undefined);
  const capabilities = { tools: { listChanged: false } };

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
    await log("tools/list", {}, "allow");
    return done({ tools: tools.map(({ scope: _s, ...t }) => t), ...(stateless ? { ttlMs: 300_000, cacheScope: "private" } : {}) });
  }
  if (method === "tools/call") {
    const args = (params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {}) as Record<string, unknown>;
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      const why = d.tools.some((t) => t.name === name) ? `This token doesn't have the scope for ${name}.` : `No tool named ${name.slice(0, 60)}.`;
      await log(name || "unknown", args, "deny", why);
      return reply({ status: 200, body: rpcError(id, -32602, why) });
    }
    const fit = d.check(tool.inputSchema, args);
    if (!fit.ok) {
      const why = `Invalid arguments for ${name}: ${fit.errors.join("; ")}.`;
      await log(name, args, "deny", why);
      return done({ content: [{ type: "text", text: why }], isError: true });
    }
    try {
      const ws = await d.workspace(tok.workspace_id);
      if (!ws) { await log(name, args, "error", "workspace gone"); return done({ content: [{ type: "text", text: "This token's workspace no longer exists." }], isError: true }); }
      const filings = tool.scope === "filings" ? await d.filings(tok.workspace_id) : [];
      const out = d.run(name, args, { workspace: ws, filings, today: d.today() });
      await log(name, args, "allow");
      return done({ content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: false });
    } catch (e) {
      if (d.isToolError(e)) {
        await log(name, args, "deny", (e as Error).message);
        return done({ content: [{ type: "text", text: (e as Error).message }], isError: true });
      }
      await log(name, args, "error", String((e as Error)?.message ?? e));
      return reply({ status: 200, body: rpcError(id, -32603, "Placetta couldn't answer that right now. Try again.") });
    }
  }
  await log(method.slice(0, 60), {}, "deny", "method not found");
  return reply({ status: 200, body: rpcError(id, -32601, `Method not found: ${method.slice(0, 60)}. Placetta's server offers tools only.`) });
}

function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
}
