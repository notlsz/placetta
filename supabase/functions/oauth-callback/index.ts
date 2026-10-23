// oauth-callback: the redirect URI for every provider. Deployed with verify_jwt off; it trusts only its own signed state.
// GET ?code&state (&realmId for QuickBooks, &merchant_id for Clover, &shop&hmac for Shopify, &error when the user declined).
// It exchanges the code and parks the tokens in oauth_pending. It does not connect anything: the app finishes
// the connection with integrations {action: "finish", id} as the signed-in user, which binds it to that user.
// Always ends in a 302 back to the app: ?connect_finish=<id>&kind=<kind>, or ?connect_error=<short code>.
// It also serves Placetta's client metadata document (GET .../oauth-callback/mcp-client.json): the client id Placetta
// signs in to an app's MCP server with, when that app's sign-in server takes client ID metadata documents.
import { admin, allowedReturn, appOrigins, CORS_HEADERS, describe, HttpError, isMember, json, SUPABASE_URL, verifyState, withParam } from "./shared.ts";
import { dropSecret, exchangeCode, isKind, REDIRECT_URI, writeBundle } from "./providers.ts";
import { clientMetadata } from "../_shared/mcp.ts";
import { CLIENT_DOC_PATH, mcpCallback } from "./mcp.ts";

const RESULT_PARAMS = ["connected", "connect_error", "connect_finish", "kind"];

function redirect(to: string): Response {
  return new Response(null, {
    status: 302,
    headers: { ...CORS_HEADERS, Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

function withParams(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const k of RESULT_PARAMS) u.searchParams.delete(k);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const origins = appOrigins();
  const fallback = origins.length ? `${origins[0]}/` : null;
  const refuse = (code: string): Response =>
    fallback ? redirect(withParam(fallback, "connect_error", code)) : json({ error: { code: "bad_request", message: "This sign-in link is not valid." } }, 400);

  if (req.method !== "GET") return refuse("bad_request");
  // the client metadata document: its client_id is its own address, exactly (client-registration, metadata documents)
  if (new URL(req.url).pathname.endsWith(CLIENT_DOC_PATH)) return json(clientMetadata(`${SUPABASE_URL}/functions/v1/oauth-callback${CLIENT_DOC_PATH}`, REDIRECT_URI));
  const q = new URL(req.url).searchParams;

  const st = await verifyState(q.get("state"));
  if (typeof st === "string") return refuse(st);

  // an app's own MCP server (integrations mcp_connect): its pending row holds the PKCE verifier and where to trade the code
  if (st.kind.startsWith("mcp:")) {
    const back = allowedReturn(st.ret, origins) ?? fallback;
    if (!back) return refuse("invalid_state");
    try {
      if (!(await isMember(st.ws, st.uid))) return redirect(withParams(back, { connect_error: "forbidden" }));
    } catch (e) {
      console.error("membership check failed:", describe(e));
      return redirect(withParams(back, { connect_error: "server_error" }));
    }
    const r = await mcpCallback({ id: st.kind.slice(4), ws: st.ws, uid: st.uid, q });
    return redirect(withParams(back, "finish" in r ? { connect_finish: r.finish, kind: "mcp" } : { connect_error: r.error }));
  }
  if (!isKind(st.kind)) return refuse("invalid_state");
  const kind = st.kind;
  const ret = allowedReturn(st.ret, origins) ?? fallback;
  if (!ret) return refuse("invalid_state");
  const fail = (code: string) => redirect(withParams(ret, { connect_error: code }));

  const denied = q.get("error");
  if (denied) return fail(denied === "access_denied" ? "denied" : "provider_error");
  const code = q.get("code");
  if (!code || code.length > 4096) return fail("missing_code");

  try {
    if (!(await isMember(st.ws, st.uid))) return fail("forbidden");
  } catch (e) {
    console.error("membership check failed:", describe(e));
    return fail("server_error");
  }

  let ex;
  try {
    ex = await exchangeCode(kind, code, q.get("realmId"), q);
  } catch (e) {
    if (e instanceof HttpError) {
      const short = e.code === "not_configured" ? "not_configured" : ["missing_realm", "no_webhook", "bad_signature", "missing_merchant"].includes(e.message) ? e.message : "token_exchange";
      console.error(`${kind} code exchange failed:`, short);
      return fail(short);
    }
    console.error(`${kind} code exchange failed:`, describe(e));
    return fail("token_exchange");
  }

  let secretId: string | null = null;
  try {
    secretId = await writeBundle(ex.bundle, `integration:${kind}:${st.ws}`, null);
    const id = hex(crypto.getRandomValues(new Uint8Array(32)));
    const { error } = await admin.from("oauth_pending").insert({
      id,
      workspace_id: st.ws,
      user_id: st.uid,
      kind,
      secret_id: secretId,
      account: ex.account,
      scopes: ex.scopes,
      meta: ex.meta,
    });
    if (error) throw new Error(`pending insert failed: ${error.code ?? ""}`);
    return redirect(withParams(ret, { connect_finish: id, kind }));
  } catch (e) {
    console.error(`${kind} save failed:`, describe(e));
    await dropSecret(secretId);
    return fail("save_failed");
  }
});
