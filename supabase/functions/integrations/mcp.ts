// Connect any app: a business's own remote MCP servers, for Odelia.
//   mcp_available  which catalog apps can connect now (some need Placetta's own client registered with the app)
//   mcp_list       the connected servers, each tool with whether it only reads and whether it's on
//   mcp_connect    owner: a server address (or a catalog app), with a pasted token, no sign-in, or OAuth with PKCE
//   mcp_refresh    owner: list a server's tools again
//   mcp_tool       owner: switch one tool off or on for Odelia
//   mcp_disconnect owner: forget a server, its sign-in and its tools
//   mcp_tools      the tools Odelia may offer this person: on, from servers they may use
//   mcp_call       run a tool that only reads
//   mcp_propose    put a call to any other tool up for an owner's approval (it doesn't run)
//   mcp_approve    owner: run a proposed call, once
//   mcp_decline    owner: turn a proposed call down
// Tokens live in the vault (mcp_servers.secret_id); the server row keeps the address, the tools and the switches.
// The rules themselves are in mcp_rules.ts; the protocol and the address guard in ../_shared/mcp.ts.
import type { User } from "npm:@supabase/supabase-js@2.117.2";
import { admin, allowedReturn, appOrigins, audit, HttpError, ok, optText, same, signState, SUPABASE_URL, text, uuidParam } from "./shared.ts";
import { REDIRECT_URI } from "./providers.ts";
import {
  authorizeUrl, chooseClient, chooseScope, defaultNet, discoverAuthServer, discoverResource, McpClient, McpError, type McpSecret, type McpTool, type Net,
  nameFromUrl, pkce, refreshTokens, revokeToken, slugFor, guardUrl, type Challenge,
} from "../_shared/mcp.ts";
import { catalogEntry, MCP_CATALOG } from "../_shared/mcp_catalog.ts";
import { approveOnce, argsOf, isRefusal, keepDisabled, mayUse, type Refusal, remoteAllows, runsDirectly, sameCall, type StoredTool, toolOf } from "./mcp_rules.ts";

type Ctx = { user: User; jwt: string; ws: string; body: Record<string, unknown>; access: string };
type Action = (c: Ctx) => Promise<Response>;

export type ServerRow = {
  id: string; workspace_id: string; slug: string; name: string; url: string; catalog_id: string | null; auth: "none" | "bearer" | "oauth";
  secret_id: string | null; status: "connected" | "error"; error: string | null; tools: StoredTool[]; disabled: string[]; protocol: string | null;
  connected_by: string | null; connected_at: string; listed_at: string | null; last_used_at: string | null;
};
const COLS = "id, workspace_id, slug, name, url, catalog_id, auth, secret_id, status, error, tools, disabled, protocol, connected_by, connected_at, listed_at, last_used_at";
const MAX_SERVERS = 20, MAX_WAITING = 50;

const net: Net = defaultNet();
const okJson = (data: Record<string, unknown>) => ok(data);
const fail = (r: Refusal): never => { throw new HttpError(r.code, r.en, r.zh); };
const you = (c: Ctx) => ({ workspace_id: c.ws, actor: "you" as const, actor_id: c.user.id });

/** An MCP problem as the person sees it. */
function toHttp(e: unknown): never {
  if (e instanceof HttpError) throw e;
  if (e instanceof McpError) {
    const code = e.code === "bad_url" || e.code === "private_address" ? "bad_request" : e.code === "too_large" ? "too_large" : e.code === "auth" ? "not_connected" : "upstream_error";
    throw new HttpError(code, e.message, e.zh);
  }
  throw e;
}

/* ------------------------------------------------------------------ the vault and the rows */

async function vaultGet(id: string | null): Promise<McpSecret | null> {
  if (!id) return null;
  const { data, error } = await admin.rpc("vault_get", { p_id: id });
  if (error) throw new Error(`vault read failed: ${error.code ?? ""}`);
  try { const s = JSON.parse(String(data ?? "")); return s && typeof s.access_token === "string" ? s as McpSecret : null; } catch { return null; }
}
async function vaultPut(s: unknown, name: string, id: string | null = null): Promise<string> {
  const { data, error } = await admin.rpc("vault_put", { p_secret: JSON.stringify(s), p_name: name, ...(id ? { p_id: id } : {}) });
  if (error || typeof data !== "string") throw new Error(`vault write failed: ${error?.code ?? ""}`);
  return data;
}
async function vaultDrop(id: string | null) {
  if (!id) return;
  const { error } = await admin.rpc("vault_drop", { p_id: id });
  if (error) console.error("vault drop failed:", error.code ?? "");
}

async function servers(ws: string): Promise<ServerRow[]> {
  const { data, error } = await admin.from("mcp_servers").select(COLS).eq("workspace_id", ws).order("connected_at", { ascending: true });
  if (error) throw new Error(`mcp_servers lookup failed: ${error.code ?? ""}`);
  return (data ?? []) as ServerRow[];
}
async function serverOf(ws: string, id: unknown): Promise<ServerRow> {
  const sid = uuidParam(id, "server_id");
  const { data, error } = await admin.from("mcp_servers").select(COLS).eq("workspace_id", ws).eq("id", sid).maybeSingle();
  if (error) throw new Error(`mcp_servers lookup failed: ${error.code ?? ""}`);
  if (!data) throw new HttpError("not_found", "That app isn't connected.", "该应用未连接。");
  return data as ServerRow;
}
async function markError(row: ServerRow, en: string) {
  await admin.from("mcp_servers").update({ status: "error", error: en.slice(0, 300) }).eq("id", row.id);
  row.status = "error";
}

/** What Placetta keeps of a listed tool: its schema at most 30 KB (the model can't use more), the rest as listed. */
const stored = (tools: McpTool[]): StoredTool[] => tools.map((t) => ({ ...t, input_schema: JSON.stringify(t.input_schema).length > 30_000 ? { type: "object" } : t.input_schema }));

/* ------------------------------------------------------------------ talking to a connected server */

/** A session with a connected server for one piece of work: the token renewed when it's about to expire, and once
 *  more if the server says it's no longer good; a sign-in that can't be renewed marks the server for reconnecting. */
async function withServer<T>(row: ServerRow, work: (c: McpClient) => Promise<T>): Promise<T> {
  let secret = row.auth === "none" ? null : await vaultGet(row.secret_id);
  if (row.auth !== "none" && !secret) {
    await markError(row, "The saved sign-in is missing. Connect it again.");
    throw new HttpError("not_connected", `Connect ${row.name} again in Settings.`, `请在设置中重新连接${row.name}。`);
  }
  const renew = async () => {
    if (!secret?.refresh_token || !secret.token_endpoint || !secret.client_id || !secret.resource) throw new McpError("auth", "no refresh", "无法续期");
    const t = await refreshTokens(net, { token_endpoint: secret.token_endpoint, client_id: secret.client_id, client_secret: secret.client_secret, auth: secret.auth ?? "none", resource: secret.resource }, secret.refresh_token);
    secret = { ...secret, access_token: t.access_token, refresh_token: t.refresh_token ?? secret.refresh_token, expires_at: t.expires_at };
    await vaultPut(secret, `mcp:${row.id}`, row.secret_id);
  };
  const token = async () => {
    if (!secret) return null;
    if (row.auth === "oauth" && secret.expires_at && secret.expires_at - Date.now() < 60_000 && secret.refresh_token) await renew();
    return secret.access_token;
  };
  for (let attempt = 0; ; attempt++) {
    const client = new McpClient({ url: row.url, token, net, timeoutMs: 25_000 });
    try {
      await client.connect();
      const out = await work(client);
      void client.close();
      const patch: Record<string, unknown> = { last_used_at: new Date().toISOString(), protocol: client.protocol };
      if (row.status === "error") Object.assign(patch, { status: "connected", error: null });
      await admin.from("mcp_servers").update(patch).eq("id", row.id);
      return out;
    } catch (e) {
      if (e instanceof McpError && e.code === "auth") {
        // a sign-in that's fine but doesn't cover this action: say so, and leave the connection as it is
        if (e.extra.challenge?.error === "insufficient_scope") {
          throw new HttpError("forbidden", `${row.name} didn't give Placetta permission for that. An owner can connect it again and allow it.`, `${row.name}没有授予快哉执行此操作的权限。所有者可以重新连接并允许。`);
        }
        if (attempt === 0 && row.auth === "oauth" && secret?.refresh_token) {
          try { await renew(); continue; } catch { /* falls through to reconnect */ }
        }
        await markError(row, "The sign-in expired or was removed. Connect it again.");
        throw new HttpError("not_connected", `${row.name} needs you to sign in again: connect it again in Settings.`, `${row.name}需要您重新登录：请在设置中重新连接。`);
      }
      toHttp(e);
    }
  }
}

/* ------------------------------------------------------------------ what Settings sees */

const preregistered = (client?: string, issuer?: string) => {
  if (!client || !issuer) return undefined;
  const id = Deno.env.get(`MCP_${client.toUpperCase()}_CLIENT_ID`) ?? "";
  return id ? { issuer, client_id: id, client_secret: Deno.env.get(`MCP_${client.toUpperCase()}_CLIENT_SECRET`) || undefined } : undefined;
};
const oauthReady = () => (Deno.env.get("OAUTH_STATE_SECRET") ?? "").length >= 16 && appOrigins().length > 0;

const available: Action = async () => {
  const oauth = oauthReady();
  return okJson({ oauth, catalog: Object.fromEntries(MCP_CATALOG.map((e) => [e.id, oauth && (!e.client || !!preregistered(e.client, e.issuer))])) });
};

const view = (s: ServerRow, uid: string) => ({
  id: s.id, slug: s.slug, name: s.name, url: s.url, catalog_id: s.catalog_id, auth: s.auth, status: s.status, error: s.error,
  connected_at: s.connected_at, listed_at: s.listed_at, last_used_at: s.last_used_at, mine: s.connected_by === uid,
  tools: s.tools.map((t) => ({ name: t.name, title: t.title, description: t.description.slice(0, 300), read_only: t.read_only, on: !s.disabled.includes(t.name) })),
});

const list: Action = async (c) => okJson({ servers: (await servers(c.ws)).map((s) => view(s, c.user.id)) });

/* ------------------------------------------------------------------ connect */

/** Save a server Placetta can now talk to: a new row, or the same address again (its tools refreshed, the switches kept). */
async function save(c: Ctx, d: { url: string; name: string; catalog_id: string | null; auth: ServerRow["auth"]; secret_id: string | null; tools: McpTool[]; protocol: string | null }): Promise<ServerRow> {
  const all = await servers(c.ws);
  const same_ = all.find((s) => s.url === d.url);
  const tools = stored(d.tools);
  const fields = { name: d.name, catalog_id: d.catalog_id, auth: d.auth, secret_id: d.secret_id, status: "connected", error: null, tools, protocol: d.protocol, connected_by: c.user.id, listed_at: new Date().toISOString() };
  if (same_) {
    const { data, error } = await admin.from("mcp_servers").update({ ...fields, disabled: keepDisabled(same_.disabled, tools), connected_at: new Date().toISOString() }).eq("id", same_.id).select(COLS).single();
    if (error) throw new Error(`mcp_servers update failed: ${error.code ?? ""}`);
    return data as ServerRow;
  }
  if (all.length >= MAX_SERVERS) throw new HttpError("bad_request", `At most ${MAX_SERVERS} apps can be connected this way. Disconnect one first.`, `最多可这样连接 ${MAX_SERVERS} 个应用，请先断开一个。`);
  const slug = slugFor(d.catalog_id ?? d.name, all.map((s) => s.slug));
  const { data, error } = await admin.from("mcp_servers").insert({ ...fields, workspace_id: c.ws, slug, url: d.url, disabled: [] }).select(COLS).single();
  if (error) throw new Error(`mcp_servers insert failed: ${error.code ?? ""}`);
  return data as ServerRow;
}

const cleanName = (s: string) => s.replace(/[\u0000-\u001f\u007f<>"`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
const CLIENT_DOC = `${SUPABASE_URL}/functions/v1/oauth-callback/mcp-client.json`;

const connect: Action = async (c) => {
  const entry = catalogEntry(c.body.catalog_id);
  if (c.body.catalog_id !== undefined && c.body.catalog_id !== null && !entry) throw new HttpError("bad_request", "That app isn't in the list.", "列表中没有该应用。");
  let u: URL;
  try { u = await guardUrl(net, entry?.url ?? text(c.body.url, "url", 10, 500)); } catch (e) { toHttp(e); }
  // A token in the link (Zapier offers ?token=) would sit in the server list for every teammate to see: it moves to
  // the vault as the bearer token. Other secrets in a link are refused, with where to paste them instead.
  let token = optText(c.body.token, "token", 4000);
  const inLink = u.searchParams.get("token");
  if (inLink) { u.searchParams.delete("token"); token ??= inLink; }
  if ([...u.searchParams.keys()].some((k) => /key|secret|password|access_token|auth/i.test(k))) {
    throw new HttpError("bad_request", "That link has a key in it. Paste the link without it, and the key in the access token box.", "这个链接里带有密钥。请粘贴不含密钥的链接，并把密钥填在访问令牌一栏。");
  }
  // the canonical form: no trailing slash on a bare origin (authorization spec, canonical server URI)
  const url = u.pathname === "/" && !u.search ? u.origin : u.toString();
  const name = cleanName(optText(c.body.name, "name", 60) ?? entry?.name ?? nameFromUrl(url)) || nameFromUrl(url);
  if (token && !/^[\x21-\x7e]+$/.test(token)) throw new HttpError("bad_request", "Paste the token alone, without spaces.", "请只粘贴令牌，不要包含空格。");

  // First try as it is: with the pasted token, or with nothing for an app that needs no sign-in.
  const client = new McpClient({ url, token: async () => token, net, timeoutMs: 25_000 });
  let challenge: Challenge | null = null;
  try {
    await client.connect();
    const tools = await client.listTools();
    void client.close();
    const secret_id = token ? await vaultPut({ access_token: token } satisfies McpSecret, `mcp:${c.ws}`) : null;
    let row: ServerRow;
    try { row = await save(c, { url, name, catalog_id: entry?.id ?? null, auth: token ? "bearer" : "none", secret_id, tools, protocol: client.protocol }); }
    catch (e) { await vaultDrop(secret_id); throw e; }
    await audit({ ...you(c), action: { en: `Connected ${name}`, zh: `已连接${name}` }, object: same(name), detail: { en: `${tools.length} tools for Odelia`, zh: `Odelia 可用 ${tools.length} 个工具` } });
    return okJson({ server: view(row, c.user.id) });
  } catch (e) {
    if (!(e instanceof McpError && e.code === "auth")) toHttp(e);
    if (token) throw new HttpError("bad_request", `${name} didn't accept that token. Check it and paste it again.`, `${name}不接受这个令牌，请检查后重新粘贴。`);
    challenge = (e as McpError).extra.challenge ?? {};
  }

  // The app wants a sign-in: OAuth 2.1 with PKCE, as the MCP authorization spec lays it out.
  if (!oauthReady()) throw new HttpError("not_configured", "Signing in to apps isn't set up on this server yet. Paste an access token from the app instead.", "此服务器尚未设置应用登录。请改为粘贴该应用提供的访问令牌。");
  const origins = appOrigins();
  const ret = allowedReturn(c.body.return_to, origins) ?? `${origins[0]}/`;
  try {
    const rm = await discoverResource(net, url, challenge);
    const pre = preregistered(entry?.client, entry?.issuer);
    // the sign-in server: the one Placetta's own client is registered with, when the app lists it; else the first
    const issuer = (pre && rm.authorization_servers.find((s) => s.replace(/\/+$/, "") === pre.issuer.replace(/\/+$/, ""))) ?? rm.authorization_servers[0];
    if (entry?.client && !pre) throw new HttpError("not_configured", `${entry.name} only lets apps it already knows sign in, and Placetta's isn't set up yet.`, `${entry.name}只允许已登记的应用登录，快哉尚未完成设置。`);
    const as = await discoverAuthServer(net, issuer);
    const client_ = await chooseClient(net, as, { redirectUri: REDIRECT_URI, metadataUrl: CLIENT_DOC.startsWith("https://") ? CLIENT_DOC : undefined, preregistered: pre });
    const { verifier, challenge: code_challenge } = await pkce();
    const scope = chooseScope(challenge, rm, as, entry?.scope);
    const id = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const secretId = await vaultPut({ access_token: "", verifier, client_secret: client_.client_secret }, `mcp-pending:${c.ws}`);
    const all = await servers(c.ws);
    const meta = {
      stage: "authorize", url, name, catalog_id: entry?.id ?? null, server_id: all.find((s) => s.url === url)?.id ?? null,
      issuer: as.issuer, iss_param: as.authorization_response_iss_parameter_supported === true, token_endpoint: as.token_endpoint,
      revocation_endpoint: as.revocation_endpoint ?? null, client_id: client_.client_id, auth: client_.auth, resource: rm.resource, scope: scope ?? null,
    };
    const { error } = await admin.from("oauth_pending").insert({ id, workspace_id: c.ws, user_id: c.user.id, kind: "mcp", secret_id: secretId, account: name, scopes: scope ?? null, meta });
    if (error) { await vaultDrop(secretId); throw new Error(`pending insert failed: ${error.code ?? ""}`); }
    const state = await signState({ ws: c.ws, uid: c.user.id, kind: `mcp:${id}`, ret });
    return okJson({ auth_url: authorizeUrl(as, { client_id: client_.client_id, redirect_uri: REDIRECT_URI, challenge: code_challenge, state, resource: rm.resource, scope, extra: entry?.extra }) });
  } catch (e) {
    toHttp(e);
  }
};

/** The app finishing a sign-in that oauth-callback completed: the pending row (already claimed by the caller, who
 *  checked it's theirs and that they're an owner) becomes a connected server. */
export async function mcpFinish(c: Ctx, p: { secret_id: string; account: string | null; meta: Record<string, unknown> | null }): Promise<Response> {
  const m = (p.meta ?? {}) as Record<string, string | null>;
  const gone = () => new HttpError("not_found", "This sign-in expired or was already used. Connect again.", "此登录已过期或已使用，请重新连接。");
  if (m.stage !== "ready" || typeof m.url !== "string") { await vaultDrop(p.secret_id); throw gone(); }
  const secret = await vaultGet(p.secret_id);
  if (!secret?.access_token) { await vaultDrop(p.secret_id); throw gone(); }
  const name = cleanName(String(m.name ?? "")) || nameFromUrl(m.url);
  try {
    const client = new McpClient({ url: m.url, token: async () => secret.access_token, net, timeoutMs: 25_000 });
    await client.connect();
    const tools = await client.listTools();
    void client.close();
    const row = await save(c, { url: m.url, name, catalog_id: m.catalog_id ?? null, auth: "oauth", secret_id: p.secret_id, tools, protocol: client.protocol });
    await audit({ ...you(c), action: { en: `Connected ${name}`, zh: `已连接${name}` }, object: same(name), detail: { en: `${tools.length} tools for Odelia`, zh: `Odelia 可用 ${tools.length} 个工具` } });
    return okJson({ kind: "mcp", account: name, server: view(row, c.user.id) });
  } catch (e) {
    await vaultDrop(p.secret_id);
    toHttp(e);
  }
}

const refresh: Action = async (c) => {
  const row = await serverOf(c.ws, c.body.id);
  const tools = stored(await withServer(row, (cl) => cl.listTools()));
  const { data, error } = await admin.from("mcp_servers").update({ tools, disabled: keepDisabled(row.disabled, tools), listed_at: new Date().toISOString() }).eq("id", row.id).select(COLS).single();
  if (error) throw new Error(`mcp_servers update failed: ${error.code ?? ""}`);
  return okJson({ server: view(data as ServerRow, c.user.id) });
};

const toggle: Action = async (c) => {
  const row = await serverOf(c.ws, c.body.id);
  const name = text(c.body.tool, "tool", 1, 128);
  if (!row.tools.some((t) => t.name === name)) throw new HttpError("not_found", `${row.name} has no tool by that name.`, `${row.name}没有这个工具。`);
  const on = c.body.on === true;
  const disabled = on ? row.disabled.filter((n) => n !== name) : [...new Set([...row.disabled, name])];
  const { data, error } = await admin.from("mcp_servers").update({ disabled }).eq("id", row.id).select(COLS).single();
  if (error) throw new Error(`mcp_servers update failed: ${error.code ?? ""}`);
  await audit({ ...you(c), action: on ? { en: `Turned on a ${row.name} tool for Odelia`, zh: `为 Odelia 开启了${row.name}的工具` } : { en: `Turned off a ${row.name} tool for Odelia`, zh: `为 Odelia 关闭了${row.name}的工具` }, object: same(name) });
  return okJson({ server: view(data as ServerRow, c.user.id) });
};

const disconnect: Action = async (c) => {
  const row = await serverOf(c.ws, c.body.id);
  const secret = row.auth === "oauth" ? await vaultGet(row.secret_id).catch(() => null) : null;
  if (secret) await revokeToken(net, secret);
  const { error } = await admin.from("mcp_servers").delete().eq("id", row.id);
  if (error) throw new Error(`mcp_servers delete failed: ${error.code ?? ""}`);
  await vaultDrop(row.secret_id);
  await audit({ ...you(c), action: { en: `Disconnected ${row.name}`, zh: `已断开${row.name}` }, object: same(row.name) });
  return okJson({});
};

/* ------------------------------------------------------------------ Odelia's use */

/** The tools Odelia may offer this person, from servers they may use, switched on. remoteOnly: just the ones that read. */
async function toolsFor(ws: string, access: string, uid: string, remoteOnly: boolean) {
  return (await servers(ws)).filter((s) => s.status === "connected" && mayUse(access, s, uid)).flatMap((s) =>
    s.tools.filter((t) => !s.disabled.includes(t.name) && (!remoteOnly || runsDirectly(t))).map((t) => ({
      server_id: s.id, server: s.slug, server_name: s.name, name: t.name, ...(t.title ? { title: t.title } : {}), description: t.description, read_only: t.read_only, input_schema: t.input_schema,
    })));
}

const toolsAction: Action = async (c) => okJson({ tools: await toolsFor(c.ws, c.access, c.user.id, false) });

/** One read: the person may use the server, the tool is on and only reads, the arguments are plain, and the workspace
 *  is under 300 reads an hour. */
async function runRead(ws: string, access: string, uid: string, body: Record<string, unknown>, actor: "you" | "agent", gate?: (t: StoredTool) => Refusal | null) {
  const row = await serverOf(ws, body.server_id);
  if (!mayUse(access, row, uid)) fail({ code: "forbidden", en: "Only an owner, or the person who connected this app, can use it through Odelia.", zh: "只有所有者或连接此应用的人可以通过 Odelia 使用它。" });
  const t = toolOf(row, body.tool, row.name);
  if (isRefusal(t)) fail(t);
  const tool = t as StoredTool;
  const g = gate?.(tool);
  if (g) fail(g);
  if (!runsDirectly(tool)) fail({ code: "forbidden", en: `${tool.name} changes something in ${row.name}, so it waits for an owner's approval: propose it instead.`, zh: `${tool.name}会更改${row.name}中的内容，需要所有者批准：请改为提交审批。` });
  const args = argsOf(body.arguments);
  if (isRefusal(args)) fail(args);
  const { data: allowed } = await admin.rpc("rate_hit", { p_key: `mcp:${ws}`, p_limit: 300, p_window_seconds: 3600 });
  if (allowed === false) throw new HttpError("rate_limited", "That's 300 reads from connected apps this hour. Try again later.", "本小时已从已连接的应用读取 300 次，请稍后再试。");
  const out = await withServer(row, (cl) => cl.callTool(tool.name, args as Record<string, unknown>, { headers: tool.headers, maxChars: 12_000 }));
  await audit({ workspace_id: ws, actor, actor_id: actor === "you" ? uid : null, action: { en: `Read from ${row.name}`, zh: `从${row.name}读取` }, object: same(tool.title ?? tool.name) });
  return { server: row.name, tool: tool.name, text: out.text, is_error: out.is_error };
}

const call: Action = async (c) => okJson(await runRead(c.ws, c.access, c.user.id, c.body, "agent"));

const propose: Action = async (c) => {
  const row = await serverOf(c.ws, c.body.server_id);
  if (!mayUse(c.access, row, c.user.id)) fail({ code: "forbidden", en: "Only an owner, or the person who connected this app, can use it through Odelia.", zh: "只有所有者或连接此应用的人可以通过 Odelia 使用它。" });
  const t = toolOf(row, c.body.tool, row.name);
  if (isRefusal(t)) fail(t);
  const args = argsOf(c.body.arguments);
  if (isRefusal(args)) fail(args);
  const { count } = await admin.from("mcp_calls").select("id", { count: "exact", head: true }).eq("workspace_id", c.ws).eq("status", "waiting");
  if ((count ?? 0) >= MAX_WAITING) throw new HttpError("rate_limited", `${MAX_WAITING} requests to connected apps are already waiting for approval. Approve or decline some first.`, `已有 ${MAX_WAITING} 个连接应用的请求在等待批准，请先处理一些。`);
  const { data, error } = await admin.from("mcp_calls").insert({ workspace_id: c.ws, server_id: row.id, tool: (t as StoredTool).name, arguments: args, proposed_by: c.user.id }).select("id, expires_at").single();
  if (error || !data) throw new Error(`mcp_calls insert failed: ${error?.code ?? ""}`);
  await audit({ workspace_id: c.ws, actor: "agent", actor_id: null, action: { en: `Asked to use ${row.name}`, zh: `请求使用${row.name}` }, object: same((t as StoredTool).title ?? (t as StoredTool).name) });
  return okJson({ call_id: data.id, expires_at: data.expires_at, server: row.name, tool: (t as StoredTool).name });
};

const approve: Action = async (c) => {
  const id = uuidParam(c.body.id, "id");
  // what the owner saw on the card (the action and its inputs) must be what was proposed, or nothing runs
  const { data: waiting, error: we } = await admin.from("mcp_calls").select("tool, arguments").eq("id", id).eq("workspace_id", c.ws).eq("status", "waiting").maybeSingle();
  if (we) throw new Error(`mcp call lookup failed: ${we.code ?? ""}`);
  if (waiting && !sameCall(c.body.expect as { tool?: unknown; arguments?: unknown } | undefined, waiting as { tool: string; arguments: unknown })) {
    throw new HttpError("bad_request", "This request changed after Odelia wrote it, so nothing ran. Ask Odelia again.", "此请求在 Odelia 写好后被改动过，所以没有执行。请再让 Odelia 处理一次。");
  }
  let row: ServerRow | null = null;
  const r = await approveOnce({
    claim: async () => {
      const { data, error } = await admin.rpc("mcp_claim_call", { p_id: id, p_ws: c.ws, p_uid: c.user.id });
      if (error) throw new Error(`mcp claim failed: ${error.code ?? ""}`);
      return (data ?? null) as never;
    },
    run: async (cl) => {
      row = await serverOf(c.ws, cl.server_id);
      const t = toolOf(row, cl.tool, row.name);
      if (isRefusal(t)) fail(t);
      return await withServer(row, (m) => m.callTool(cl.tool, cl.arguments ?? {}, { headers: (t as StoredTool).headers, maxChars: 12_000 }));
    },
    settle: async (cl, ok, note) => {
      await admin.from("mcp_calls").update({ status: ok ? "done" : "failed", note: note.slice(0, 300), finished_at: new Date().toISOString() }).eq("id", cl.id);
    },
  });
  if (!r.ran) throw new HttpError("too_late", "This was already approved, declined or expired.", "此请求已被批准、拒绝或已过期。");
  const name = (row as ServerRow | null)?.name ?? "the app";
  await audit({ ...you(c), action: { en: `Approved and ran a ${name} action`, zh: `批准并执行了${name}操作` }, object: same(r.claimed.tool), detail: r.out.is_error ? { en: "The app reported an error", zh: "该应用报告了错误" } : null });
  return okJson({ server: name, tool: r.claimed.tool, text: r.out.text, is_error: r.out.is_error });
};

const decline: Action = async (c) => {
  const id = uuidParam(c.body.id, "id");
  const { data, error } = await admin.from("mcp_calls").update({ status: "declined", decided_by: c.user.id, decided_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", c.ws).eq("status", "waiting").select("tool");
  if (error) throw new Error(`mcp decline failed: ${error.code ?? ""}`);
  if (!data?.length) throw new HttpError("too_late", "This was already approved, declined or expired.", "此请求已被批准、拒绝或已过期。");
  await audit({ ...you(c), action: { en: "Declined a request to a connected app", zh: "拒绝了对已连接应用的请求" }, object: same(String(data[0].tool)) });
  return okJson({});
};

export const MCP_ACTIONS: Record<string, Action> = {
  mcp_available: available, mcp_list: list, mcp_connect: connect, mcp_refresh: refresh, mcp_tool: toggle, mcp_disconnect: disconnect,
  mcp_tools: toolsAction, mcp_call: call, mcp_propose: propose, mcp_approve: approve, mcp_decline: decline,
};

/* ------------------------------------------------------------------ from agent-run, for a request from outside the app */

/** agent-run (with the monitor key) on behalf of the member a text, call, email or chat came from: the tools that only
 *  read, and reads. Never a proposal or an approval, and nothing at all for plain SMS. */
export async function mcpRemote(body: Record<string, unknown>): Promise<Response> {
  const ws = uuidParam(body.workspace_id, "workspace_id"), uid = uuidParam(body.user_id, "user_id");
  const channel = typeof body.channel === "string" ? body.channel : "";
  if (!channel || channel === "app") throw new HttpError("bad_request", "channel is required.");
  if (body.plain_sms === true) throw new HttpError("forbidden", "Connected apps aren't used from a plain text message, which can be forged.", "普通短信可能被伪造，所以不会使用已连接的应用。");
  const { data: m } = await admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", uid).maybeSingle();
  if (!m) throw new HttpError("forbidden", "You are not a member of this workspace.");
  const access = m.role === "owner" ? "owner" : "member";
  if (body.action === "mcp_tools") return okJson({ tools: await toolsFor(ws, access, uid, true) });
  if (body.action === "mcp_call") return okJson(await runRead(ws, access, uid, body, "agent", (t) => remoteAllows(channel, false, t)));
  throw new HttpError("bad_request", "From outside the app only mcp_tools and mcp_call.");
}
