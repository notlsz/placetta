// The way back from an app's MCP sign-in (integrations mcp_connect started it). Like every other sign-in here, it
// connects nothing: it checks the answer, trades the code for tokens and parks them on the pending row, and the app
// finishes as the signed-in owner (integrations finish, which hands the row to mcp.ts mcpFinish).
//
// The checks, from the MCP authorization spec (https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization):
//   the signed state names the pending row; the row must be this workspace's and this person's, still waiting, not expired
//   iss (RFC 9207): when the sign-in server said it sends iss, it must be there, and when it's there it must be the
//   issuer recorded before the redirect, compared exactly; on a mismatch nothing in the answer is used
//   the code goes only to the token endpoint recorded from the validated metadata, with the PKCE verifier and the
//   resource (RFC 8707), and that request goes through the same address guard as everything else (../_shared/mcp.ts)
import { admin, describe } from "./shared.ts";
import { REDIRECT_URI } from "./providers.ts";
import { defaultNet, exchangeCode, issOk, McpError, type McpSecret, type TokenAuth } from "../_shared/mcp.ts";

/** Where Placetta's client metadata document lives: its client id for sign-in servers that take them. */
export const CLIENT_DOC_PATH = "/mcp-client.json";

type Pending = { workspace_id: string; user_id: string; kind: string; secret_id: string; meta: Record<string, unknown> | null; expires_at: string };

/** A short reason for the app, or the pending id to finish with. */
export async function mcpCallback(o: { id: string; ws: string; uid: string; q: URLSearchParams }): Promise<{ finish: string } | { error: string }> {
  if (!/^[0-9a-f]{64}$/.test(o.id)) return { error: "invalid_state" };
  const { data, error } = await admin.from("oauth_pending").select("workspace_id, user_id, kind, secret_id, meta, expires_at").eq("id", o.id).maybeSingle();
  if (error) { console.error("mcp pending lookup failed:", error.code ?? ""); return { error: "server_error" }; }
  const p = data as Pending | null;
  const m = (p?.meta ?? {}) as Record<string, unknown>;
  if (!p || p.kind !== "mcp" || p.workspace_id !== o.ws || p.user_id !== o.uid || m.stage !== "authorize") return { error: "invalid_state" };
  if (Date.parse(p.expires_at) <= Date.now()) return { error: "expired" };

  // RFC 9207 before anything else in the answer is acted on, the error included
  if (!issOk({ issuer: String(m.issuer ?? ""), iss_param: m.iss_param === true }, o.q.get("iss"))) return { error: "wrong_issuer" };
  const denied = o.q.get("error");
  if (denied) return { error: denied === "access_denied" ? "denied" : "provider_error" };
  const code = o.q.get("code");
  if (!code || code.length > 4096) return { error: "missing_code" };

  const { data: raw } = await admin.rpc("vault_get", { p_id: p.secret_id });
  let held: { verifier?: string; client_secret?: string } = {};
  try { held = JSON.parse(String(raw ?? "{}")); } catch { /* missing */ }
  if (!held.verifier) return { error: "expired" };

  try {
    const t = await exchangeCode(defaultNet(), {
      token_endpoint: String(m.token_endpoint), client_id: String(m.client_id), client_secret: held.client_secret, auth: (m.auth ?? "none") as TokenAuth, resource: String(m.resource),
    }, { code, verifier: held.verifier, redirect_uri: REDIRECT_URI });
    const secret: McpSecret = {
      access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at, token_endpoint: String(m.token_endpoint), client_id: String(m.client_id),
      ...(held.client_secret ? { client_secret: held.client_secret } : {}), auth: (m.auth ?? "none") as TokenAuth, resource: String(m.resource), issuer: String(m.issuer),
      ...(typeof m.revocation_endpoint === "string" ? { revocation_endpoint: m.revocation_endpoint } : {}),
    };
    const { data: sid, error: ve } = await admin.rpc("vault_put", { p_secret: JSON.stringify(secret), p_name: `mcp:${o.ws}` });
    if (ve || typeof sid !== "string") throw new Error(`vault write failed: ${ve?.code ?? ""}`);
    // the tokens replace the verifier on the same row (the database drops the old secret); only a waiting row moves on
    const { data: moved, error: ue } = await admin.from("oauth_pending").update({ secret_id: sid, meta: { ...m, stage: "ready" }, ...(t.scope ? { scopes: t.scope } : {}) })
      .eq("id", o.id).eq("kind", "mcp").eq("meta->>stage", "authorize").select("id");
    if (ue || !moved?.length) { await admin.rpc("vault_drop", { p_id: sid }); throw new Error(`pending update failed: ${ue?.code ?? ""}`); }
    return { finish: o.id };
  } catch (e) {
    console.error("mcp code exchange failed:", e instanceof McpError ? `${e.code} ${e.extra.status ?? ""}` : describe(e));
    return { error: "token_exchange" };
  }
}
