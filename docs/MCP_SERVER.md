# Placetta's MCP server

Customers ask their own assistant (Claude, ChatGPT, Claude Code, Cursor or any MCP client) about their stores. The
server is `supabase/functions/mcp`, read only.

| Tool | Scope | Answers |
|---|---|---|
| `compliance_status` | status | Each store's licenses and permits by status, with the open items and their next step |
| `upcoming_deadlines` | deadlines | Deadlines in the next 1 to 365 days (default 60), soonest first |
| `store_readiness` | readiness | Ready-to-open or inspection-ready score per store, with its parts |
| `plan_preview` | plan | The permits a kind of business needs in a US city, from the registry, each with its source |
| `filing_status` | filings | Filings the team submits: status, confirmation number, dates |

**Resources** (an assistant attaches them as context, or a person @-mentions them in Claude), each needing the scope
shown: `placetta://status` (status), `placetta://stores/<id>/status` (status, one per store, also a template),
`placetta://stores/<id>/readiness` (readiness, template), `placetta://deadlines` (deadlines, next 60 days) and
`placetta://filings/open` (filings). They are built from the same tools, so a resource and its tool always agree.

**Prompts** (Claude shows them as slash commands), each with its data attached so it answers in one turn:
`renewal_checklist` (days, store_id, lang), `weekly_brief` (lang) and `opening_readiness` (store_id, lang). A prompt
is listed only for a token with every scope it reads.

**Pages and errors.** Every list (`tools/list`, `resources/list`, `resources/templates/list`, `prompts/list`) and the
two long tools (`upcoming_deadlines`, `filing_status`) return 50 at a time with an opaque `nextCursor` /
`next_cursor`; an invalid cursor is `-32602`. Every error carries a stable code: protocol errors in `error.data.code`
(`unauthorized`, `rate_limited`, `scope_missing`, `unknown_tool`, `not_found`, `invalid_cursor`, `workspace_gone`,
`method_not_found`, `internal`), tool errors in `structuredContent.error.code` with `isError: true`, so the model can
correct itself. Each tool has an `outputSchema`.

Copied from: the MCP spec's resources, prompts, pagination and tools pages (2025-11-25 and 2026-07-28); GitHub's and
Linear's servers (resources for records, read-only annotations); Stripe's API (stable error codes); Devin's server
(`mcp.devin.ai`, Streamable HTTP with a bearer key).

## How it works

- **Protocol.** Streamable HTTP, stateless: one JSON-RPC request per POST, answered with JSON. It speaks 2026-07-28
  (`server/discover`, version in `_meta`, `resultType`, `Mcp-Method` and `Mcp-Name` checked, `ttlMs` and
  `cacheScope` on `tools/list`) and 2025-11-25, 2025-06-18 and 2025-03-26 (`initialize` without a session). GET is 405.
  Every tool is annotated `readOnlyHint`.
- **Auth.** A workspace token, `plc_mcp_<prefix>_<48 hex>`, made in Settings, Connections, AI assistants by an owner
  or admin. It is shown once; only its SHA-256 is stored (`mcp_tokens`). It is sent as `Authorization: Bearer`, or as
  the last part of the address for assistants whose setup only takes a URL. Each token has scopes (the table above).
  It stops when revoked, or when the person who made it is no longer an owner or admin of that workspace.
- **One workspace.** The workspace comes from the token, never from the arguments. A store id from another workspace
  is "no such store", and an argument naming a workspace is refused (`logic_test.ts`, cross-tenant test).
- **Limits and audit.** 60 calls a minute per token and 120 a minute per address (`rate_hit`). Every call is logged in
  `agent_tool_calls` as `mcp:<method or tool>`, with the token's maker and role, a hash of the input and the decision.
  Making and revoking tokens go in the audit trail. Browser origins other than the app, claude.ai and chatgpt.com
  are refused (DNS rebinding); set `MCP_ALLOWED_ORIGINS` to add more.
- **OAuth 2.1 (added 2026-10-22).** Both directories require it for a server that reads a person's account: Claude's
  submission page says "Authentication: use OAuth 2.0 for authenticated services"
  ([submission](https://claude.com/docs/connectors/building/submission)), and ChatGPT apps sign in with OAuth and PKCE
  ([Apps SDK auth](https://developers.openai.com/apps-sdk/build/auth)). `supabase/functions/mcp/oauth.ts` makes the
  server its own authorization server, at its own address (issuer = resource):
  - a call with no token gets `401` and `WWW-Authenticate: Bearer resource_metadata=".../mcp/.well-known/oauth-protected-resource", scope="..."`;
  - `GET .../mcp/.well-known/oauth-protected-resource` (RFC 9728) and `GET .../mcp/.well-known/oauth-authorization-server`
    (RFC 8414, also at `openid-configuration`): S256 only, public clients only (`token_endpoint_auth_methods_supported: ["none"]`),
    `authorization_response_iss_parameter_supported: true` so ChatGPT uses its stable redirect;
  - `POST .../mcp/oauth/register` (RFC 7591): https redirects, or a loopback address matched on any port (Claude Code);
  - `GET .../mcp/oauth/authorize`: refuses a redirect the client didn't register with a page (never a redirect), requires
    `code_challenge_method=S256`, checks `resource` is this server, then sends the person to the app's consent screen
    (`src/cloud/McpConsent.tsx`): which assistant, where they go back to (with a warning for a loopback address, as the MCP
    spec asks), the workspace and the scopes. The database makes the code only for an owner or admin (`mcp_oauth_approve`);
  - `POST .../mcp/oauth/token`, form-encoded (JSON accepted): codes are single use for ten minutes, bound to client,
    redirect, PKCE and resource; a code used twice revokes what it gave; access tokens last an hour; refresh tokens last
    90 days, rotate on every use, and an old one used again disconnects the assistant and says so in the audit trail.
    Errors are RFC 6749 codes (`invalid_grant`, `unsupported_grant_type`).
  An OAuth connection is a row in `mcp_tokens`, so Settings lists it ("Connected by signing in") and Disconnect stops
  it at once. Pasted tokens still work for clients without OAuth. Not offered: client ID metadata documents (both
  directories fall back to registration, and fetching a client's document means Placetta fetching an address a caller
  names), and confidential clients. Tests: `supabase/functions/mcp/oauth_test.ts`, `supabase/tests/mcp_oauth.sql`.
- **Per-tool security schemes.** Each tool says `securitySchemes: [{ type: "oauth2", scopes: ["<its scope>"] }]`, which
  ChatGPT reads to show the sign-in and the scope asked for.

## Founder steps

1. Apply migrations `20261023090000_run_push` and `20261023100000_mcp_tokens`.
2. Deploy the function: `supabase functions deploy mcp` (`verify_jwt = false` is in `supabase/config.toml`).
3. Make a token in Settings, Connections, AI assistants, and add it to Claude with the address shown there. Ask
   "which of my stores have deadlines in the next 60 days?", or pick "Prepare my renewal checklist" from the prompts.
4. OAuth: apply `20261028090000_mcp_oauth`, redeploy `mcp`, and check `APP_ORIGINS` starts with the app's origin (the
   consent screen is `<that origin>/app/`; set `MCP_CONSENT_URL` otherwise). Then in Claude, Settings, Connectors, Add
   custom connector, paste only `https://<ref>.supabase.co/functions/v1/mcp`: Claude should send you to Placetta to
   allow it. Do the same in ChatGPT (developer mode, Create, OAuth). Directory submissions: `docs/mcp/DIRECTORIES.md`.
5. List it in the MCP Registry (optional, free): `docs/mcp/server.json` is ready. Prove you own placetta.com with a
   DNS TXT record (`mcp-publisher login dns --domain placetta.com`), then `mcp-publisher publish docs/mcp/server.json`.
   See https://modelcontextprotocol.io/registry/remote-servers.
