// mcp: Placetta's own MCP server, read only, for Claude, ChatGPT and any other MCP client. The protocol and the rules
// are in logic.ts; the tools are src/mcpServer.ts, bundled into tools.js by `npm run build:agent`. This file wires in the
// database with the service role: every call is checked against its token first (mcp_token_auth), reads only that
// token's workspace, is rate-limited (rate_hit) and is logged in agent_tool_calls. Deployed with verify_jwt = false
// (supabase/config.toml): it checks its own tokens. Setup for each assistant: docs/MCP_SERVER.md.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { type Audit, type Deps, handle, type Token } from "./logic.ts";
// @ts-types="./tools.d.ts"
import { checkArgs, getPrompt, listResources, page, PROMPTS, readResource, RESOURCE_TEMPLATES, resourceScope, runMcpTool, ToolError, TOOLS, type FilingRow } from "./tools.js";

const URL_ = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
// browser clients allowed besides the app's own origins (servers send no Origin and aren't affected)
const origins = [...(Deno.env.get("APP_ORIGINS") ?? "").split(","), ...(Deno.env.get("MCP_ALLOWED_ORIGINS") ?? "").split(","), "https://claude.ai", "https://chatgpt.com"]
  .map((x) => x.trim()).filter(Boolean);

const deps: Deps = {
  async auth(hash) {
    const { data, error } = await admin.rpc("mcp_token_auth", { p_hash: hash });
    if (error) { console.error("mcp_token_auth", error.code ?? ""); return null; }
    return (data as Token | null) ?? null;
  },
  async limit(key, max, windowSeconds) {
    const { data, error } = await admin.rpc("rate_hit", { p_key: key, p_limit: max, p_window_seconds: windowSeconds });
    if (error) { console.error("rate_hit", error.code ?? ""); return false; }
    return data === true;
  },
  async workspace(id) {
    const { data, error } = await admin.from("workspaces").select("name, state").eq("id", id).maybeSingle();
    if (error) throw new Error(`workspace read failed: ${error.code ?? ""}`);
    return data as { name: string; state: unknown } | null;
  },
  async filings(id) {
    const { data, error } = await admin.from("filings").select("app_id, title, agency, status, confirmation_number, submitted_at, decided_at, updated_at")
      .eq("workspace_id", id).order("updated_at", { ascending: false }).limit(200);
    if (error) throw new Error(`filings read failed: ${error.code ?? ""}`);
    return (data ?? []) as FilingRow[];
  },
  async audit(a: Audit) {
    const { error } = await admin.from("agent_tool_calls").insert({ workspace_id: a.workspace_id, actor_id: a.actor_id, actor_role: a.actor_role, tool: a.tool, scope: "read", input_hash: a.input_hash, decision: a.decision, code: a.code, reason: a.reason ?? null });
    if (error) console.error("mcp audit", error.code ?? "");
  },
  tools: TOOLS,
  run: runMcpTool,
  isToolError: (e) => e instanceof ToolError,
  check: checkArgs,
  today: () => new Date().toISOString().slice(0, 10),
  origins,
  x: { page, RESOURCE_TEMPLATES, listResources, resourceScope, readResource, PROMPTS, getPrompt },
  // OAuth sign-in for Claude's connector directory and ChatGPT apps (oauth.ts; migration 20261028090000_mcp_oauth).
  // MCP_PUBLIC_URL: the address people add (the resource and issuer), when it isn't the function's own.
  // MCP_CONSENT_URL: the app page that asks the person, when it isn't <first APP_ORIGINS>/app/.
  oauth: {
    base: (Deno.env.get("MCP_PUBLIC_URL") ?? `${URL_}/functions/v1/mcp`).replace(/\/+$/, ""),
    consent: Deno.env.get("MCP_CONSENT_URL") ?? `${(Deno.env.get("APP_ORIGINS") ?? "").split(",")[0].trim().replace(/\/+$/, "")}/app/`,
    async limit(key, max, windowSeconds) {
      const { data, error } = await admin.rpc("rate_hit", { p_key: key, p_limit: max, p_window_seconds: windowSeconds });
      if (error) { console.error("rate_hit", error.code ?? ""); return false; }
      return data === true;
    },
    async register(name, redirects) {
      const { data, error } = await admin.rpc("mcp_oauth_register", { p_name: name, p_redirects: redirects });
      if (error) { if (!/invalid_redirect_uri/.test(error.message ?? "")) console.error("mcp_oauth_register", error.code ?? ""); return null; }
      return data as { client_id: string; client_name: string; redirect_uris: string[] };
    },
    async client(id, redirect) {
      const { data, error } = await admin.rpc("mcp_oauth_client", { p_client_id: id, p_redirect: redirect });
      if (error) { console.error("mcp_oauth_client", error.code ?? ""); return null; }
      return (data as { name: string; redirect_ok: boolean } | null) ?? null;
    },
    async exchange(codeHash, clientId, redirect, challenge, resource) {
      const { data, error } = await admin.rpc("mcp_oauth_exchange", { p_code_hash: codeHash, p_client_id: clientId, p_redirect: redirect, p_challenge: challenge, p_resource: resource });
      if (error) { console.error("mcp_oauth_exchange", error.code ?? ""); return { error: "invalid_grant" }; }
      return data as Record<string, never>;
    },
    async refresh(refreshHash, clientId) {
      const { data, error } = await admin.rpc("mcp_oauth_refresh", { p_refresh_hash: refreshHash, p_client_id: clientId });
      if (error) { console.error("mcp_oauth_refresh", error.code ?? ""); return { error: "invalid_grant" }; }
      return data as Record<string, never>;
    },
  },
};

Deno.serve(async (req) => {
  try {
    return await handle(req, deps);
  } catch (e) {
    console.error("mcp:", String((e as Error)?.message ?? e).slice(0, 200));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Something went wrong. Try again." } }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
