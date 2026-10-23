// OAuth 2.1 for Placetta's MCP server, so it can be listed in Claude's connector directory and as a ChatGPT app: both
// take OAuth for a service that reads a person's account. Copied from their published requirements:
//   Claude   https://claude.com/docs/connectors/building/authentication: a 401 with resource_metadata, protected resource
//            metadata whose resource is the server's address exactly, RFC 8414 metadata, dynamic client registration,
//            PKCE S256 advertised, form-encoded token requests, rotating refresh tokens, invalid_grant when one is
//            no longer good, redirects https://claude.ai/api/mcp/auth_callback and a loopback address on any port.
//   ChatGPT  https://developers.openai.com/apps-sdk/build/auth: the same, plus the resource parameter copied into the
//            grant, and RFC 9207's iss on every authorization response so ChatGPT can use its stable redirect.
// Placetta is its own authorization server here, at the MCP server's own address (issuer = resource). The person signs
// in to Placetta and chooses the workspace and scopes on Placetta's consent screen (src/cloud/McpConsent.tsx); the
// database makes the code (mcp_oauth_approve) and trades it (mcp_oauth_exchange). Access tokens are ordinary workspace
// tokens that last an hour, so the MCP server checks them exactly as it checks a pasted one.
// Public clients only (no client secrets), as Claude and ChatGPT register themselves. Client ID metadata documents
// aren't offered: both fall back to registration, and fetching a client's document would mean Placetta fetching any
// address a caller names.

export const SCOPES = ["status", "deadlines", "readiness", "plan", "filings"] as const;
export const ACCESS_SECONDS = 3600;
/** Registrations and token requests per address per minute. */
export const PER_IP_OAUTH = 30;

export type Grant = { access_token?: string; token_type?: string; expires_in?: number; refresh_token?: string; scope?: string; error?: string };
export type OAuthDeps = {
  /** The MCP server's public address: the resource, and the issuer. */
  base: string;
  /** The app's page that asks the person (src/cloud/McpConsent.tsx). */
  consent: string;
  limit(key: string, max: number, windowSeconds: number): Promise<boolean>;
  register(name: string, redirects: string[]): Promise<{ client_id: string; client_name: string; redirect_uris: string[] } | null>;
  client(id: string, redirect: string): Promise<{ name: string; redirect_ok: boolean } | null>;
  exchange(codeHash: string, clientId: string, redirect: string, challenge: string, resource: string | null): Promise<Grant>;
  refresh(refreshHash: string, clientId: string): Promise<Grant>;
};

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const sha256hex = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
/** PKCE S256: BASE64URL(SHA256(verifier)) (RFC 7636 4.2). */
export const s256 = async (verifier: string) => b64url(await crypto.subtle.digest("SHA-256", enc.encode(verifier)));
/** The request the consent screen gets, as one URL-safe parameter. */
export const packRequest = (o: Record<string, string>) => b64url(enc.encode(JSON.stringify(o)));
const trimSlash = (u: string) => u.replace(/\/+$/, "");

export const resourceMetadataUrl = (base: string) => `${trimSlash(base)}/.well-known/oauth-protected-resource`;
/** RFC 9728: what a client reads after the 401. */
export const protectedResource = (base: string) => ({
  resource: trimSlash(base), authorization_servers: [trimSlash(base)], scopes_supported: [...SCOPES], bearer_methods_supported: ["header"],
  resource_name: "Placetta", resource_documentation: "https://www.placetta.com/trust",
});
/** RFC 8414 (and the same document at openid-configuration, for clients that look there for an issuer with a path). */
export const authServerMetadata = (base: string) => {
  const b = trimSlash(base);
  return {
    issuer: b, authorization_endpoint: `${b}/oauth/authorize`, token_endpoint: `${b}/oauth/token`, registration_endpoint: `${b}/oauth/register`,
    response_types_supported: ["code"], response_modes_supported: ["query"], grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: [...SCOPES],
    authorization_response_iss_parameter_supported: true,
  };
};
/** The 401's header: where the metadata is and the scopes to ask for; error only when a token was sent and failed. */
export const wwwAuthenticate = (base: string, badToken: boolean) =>
  `Bearer resource_metadata="${resourceMetadataUrl(base)}", scope="${SCOPES.join(" ")}"${badToken ? `, error="invalid_token", error_description="The token is missing, expired or revoked"` : ""}`;

/** Which OAuth address a request is for, or null when it's an MCP call. Matched on the end of the path, since the
 *  function sees its path with or without /functions/v1. */
export function oauthPath(pathname: string): "prm" | "as" | "register" | "authorize" | "token" | null {
  if (/\/\.well-known\/oauth-protected-resource(\/.*)?$/.test(pathname)) return "prm";
  if (/\/\.well-known\/(oauth-authorization-server|openid-configuration)(\/.*)?$/.test(pathname)) return "as";
  if (/\/oauth\/register\/?$/.test(pathname)) return "register";
  if (/\/oauth\/authorize\/?$/.test(pathname)) return "authorize";
  if (/\/oauth\/token\/?$/.test(pathname)) return "token";
  return null;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache", ...CORS, ...extra } });
const page = (status: number, title: string, text: string) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px;color:#0E1116"><h1 style="font-size:20px">${title}</h1><p>${text}</p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "X-Frame-Options": "DENY" } });
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

async function form(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  const text = await req.text();
  if (/application\/json/i.test(type)) {
    try { const o = JSON.parse(text); return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v : ""])) : {}; } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

/** The OAuth side of the server: metadata, registration, the start of sign-in, and the token endpoint. */
export async function oauthRoute(req: Request, d: OAuthDeps): Promise<Response | null> {
  const url = new URL(req.url);
  const which = oauthPath(url.pathname);
  if (!which) return null;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "600" } });
  if (which === "prm") return req.method === "GET" ? json(200, protectedResource(d.base), { "Cache-Control": "public, max-age=300" }) : json(405, { error: "invalid_request" });
  if (which === "as") return req.method === "GET" ? json(200, authServerMetadata(d.base), { "Cache-Control": "public, max-age=300" }) : json(405, { error: "invalid_request" });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  if (which === "register") {
    if (req.method !== "POST") return json(405, { error: "invalid_request" });
    if (!(await d.limit(`mcp-oauth-reg:${ip}`, PER_IP_OAUTH, 60))) return json(429, { error: "slow_down", error_description: "Too many registrations. Try again in a minute." }, { "Retry-After": "60" });
    let body: Record<string, unknown>;
    try { body = JSON.parse(await req.text()); } catch { return json(400, { error: "invalid_client_metadata", error_description: "The body isn't JSON." }); }
    const redirects = Array.isArray(body?.redirect_uris) ? body.redirect_uris.filter((x): x is string => typeof x === "string") : [];
    if (!redirects.length || redirects.length > 5) return json(400, { error: "invalid_redirect_uri", error_description: "Give 1 to 5 redirect_uris." });
    const method = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
    if (method !== "none") return json(400, { error: "invalid_client_metadata", error_description: "Only public clients (token_endpoint_auth_method none) with PKCE are supported." });
    const grants = Array.isArray(body.grant_types) ? body.grant_types : ["authorization_code"];
    if (grants.some((g) => g !== "authorization_code" && g !== "refresh_token")) return json(400, { error: "invalid_client_metadata", error_description: "Only authorization_code and refresh_token." });
    const made = await d.register(typeof body.client_name === "string" ? body.client_name : "", redirects);
    if (!made) return json(400, { error: "invalid_redirect_uri", error_description: "Redirect addresses must be https, or http on localhost or 127.0.0.1, with no fragment." });
    return json(201, { ...made, client_id_issued_at: Math.floor(Date.now() / 1000), grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" });
  }

  if (which === "authorize") {
    if (req.method !== "GET") return json(405, { error: "invalid_request" });
    const q = url.searchParams;
    const clientId = q.get("client_id") ?? "", redirect = q.get("redirect_uri") ?? "", state = q.get("state") ?? "";
    const c = clientId && redirect ? await d.client(clientId, redirect) : null;
    // never redirect anywhere a client didn't register (RFC 6749 4.1.2.1)
    if (!c || !c.redirect_ok) return page(400, "This sign-in link isn't valid", "The assistant that sent you here isn't registered with Placetta for this address. Start the connection again from the assistant.");
    const back = (params: Record<string, string>) => {
      const u = new URL(redirect);
      for (const [k, v] of Object.entries({ ...params, ...(state ? { state } : {}), iss: trimSlash(d.base) })) u.searchParams.set(k, v);
      return new Response(null, { status: 302, headers: { Location: u.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    };
    if (q.get("response_type") !== "code") return back({ error: "unsupported_response_type" });
    const challenge = q.get("code_challenge") ?? "";
    if (q.get("code_challenge_method") !== "S256" || !CHALLENGE.test(challenge)) return back({ error: "invalid_request", error_description: "PKCE with S256 is required." });
    const asked = (q.get("scope") ?? "").split(/\s+/).filter(Boolean);
    const scopes = asked.length ? SCOPES.filter((s) => asked.includes(s)) : [...SCOPES];
    if (!scopes.length) return back({ error: "invalid_scope", error_description: `Scopes are ${SCOPES.join(", ")}.` });
    const resource = q.get("resource");
    if (resource && trimSlash(resource) !== trimSlash(d.base)) return back({ error: "invalid_target", error_description: "This server's resource is its own address." });
    const to = new URL(d.consent);
    to.searchParams.set("mcp_auth", packRequest({ client_id: clientId, redirect_uri: redirect, scope: scopes.join(" "), state, code_challenge: challenge, resource: resource ?? "", iss: trimSlash(d.base) }));
    return new Response(null, { status: 302, headers: { Location: to.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }

  // the token endpoint
  if (req.method !== "POST") return json(405, { error: "invalid_request" });
  if (!(await d.limit(`mcp-oauth-token:${ip}`, PER_IP_OAUTH, 60))) return json(429, { error: "slow_down" }, { "Retry-After": "60" });
  const f = await form(req);
  const clientId = f.client_id ?? "";
  if (!clientId) return json(401, { error: "invalid_client", error_description: "client_id is required." });
  const out = (g: Grant) => g.error || !g.access_token ? json(400, { error: g.error ?? "invalid_grant" }) : json(200, g);
  if (f.grant_type === "authorization_code") {
    if (!f.code || !f.redirect_uri || !VERIFIER.test(f.code_verifier ?? "")) return json(400, { error: "invalid_request", error_description: "code, redirect_uri and a code_verifier are required." });
    return out(await d.exchange(await sha256hex(f.code), clientId, f.redirect_uri, await s256(f.code_verifier), f.resource || null));
  }
  if (f.grant_type === "refresh_token") {
    if (!f.refresh_token) return json(400, { error: "invalid_request", error_description: "refresh_token is required." });
    return out(await d.refresh(await sha256hex(f.refresh_token), clientId));
  }
  return json(400, { error: "unsupported_grant_type" });
}
