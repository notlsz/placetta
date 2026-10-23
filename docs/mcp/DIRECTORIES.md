# Listing Placetta in Claude's connector directory and as a ChatGPT app

What each directory asks for, filled in from what the server does today. Written 2026-10-22 from the directories'
own pages. Nothing here is submitted: the founder submits from Placetta's accounts (steps at the end).

## What both require, and where the server stands

| Requirement | Source | Placetta's server |
|---|---|---|
| Remote server over HTTPS | [Claude submission](https://claude.com/docs/connectors/building/submission) | `https://<ref>.supabase.co/functions/v1/mcp`, Streamable HTTP |
| OAuth for a service that reads a person's account | Claude submission ("use OAuth 2.0 for authenticated services"); [Apps SDK auth](https://developers.openai.com/apps-sdk/build/auth) | Built (`supabase/functions/mcp/oauth.ts`): dynamic client registration, PKCE S256, rotating refresh tokens |
| `401` with `WWW-Authenticate: Bearer resource_metadata=...`; `resource` equal to the server's address | [Claude authentication](https://claude.com/docs/connectors/building/authentication.md) | Yes, tested (`oauth_test.ts`) |
| Redirects: `https://claude.ai/api/mcp/auth_callback`, and Claude Code's loopback on any port | Claude authentication | Registered by the client; loopback matched on any port (`mcp_oauth_redirect_matches`) |
| ChatGPT redirect: `https://chatgpt.com/connector_platform_oauth_redirect` with RFC 9207 `iss` | Apps SDK auth | `authorization_response_iss_parameter_supported: true`, `iss` on every response |
| `resource` parameter honored | Apps SDK auth | Checked at authorize and bound to the code |
| Token endpoint takes `application/x-www-form-urlencoded`; `invalid_grant` for a dead refresh token | Claude authentication | Yes, tested |
| Every tool has `title` and `readOnlyHint` or `destructiveHint` | Claude submission | Every tool: `title`, `readOnlyHint: true`, `destructiveHint: false` |
| Per-tool `securitySchemes` | Apps SDK auth | `oauth2` with the tool's own scope |
| Documentation, privacy policy, support contact, icon | Claude submission | `docs/MCP_SERVER.md` (publish a public page for it), https://www.placetta.com/privacy.html, support@placetta.com, `site/icon-512.png` |
| A fully populated test account for reviewers | Claude submission | **Founder:** a workspace with sample stores, deadlines and filings |
| Endpoints answer within 10 s (refresh 30 s) | Claude authentication | Each is one database call |

## Claude connector directory: the portal's fields

- **Connection:** universal URL, `https://<ref>.supabase.co/functions/v1/mcp` (or `MCP_PUBLIC_URL` if it moves to a
  placetta.com address).
- **Server name:** Placetta
- **One-liner (200 max):** Read-only license and permit status, deadlines, store readiness, permit plans and filings
  for your stores, from Placetta.
- **Description (2,000 max):** Placetta tracks the licenses, permits and filings each of your stores needs, with the
  agency, the deadline and the official source for each. Connected to Claude, it answers "which stores have renewals in
  the next 60 days?", "what's still open for the Flushing store?" or "what permits does a milk tea shop in Irvine
  need?" from your own workspace. It only reads: it can't change, file, pay or send anything. You choose the workspace
  and what it may read when you connect, and you can disconnect it at any time in Placetta's Settings.
- **Categories:** Productivity; Business operations (pick the closest the portal offers).
- **Use cases:** compliance status by store, upcoming deadlines and renewals, readiness before opening or an inspection,
  a permit plan preview for a city, filing status.
- **What users need:** a Placetta workspace where they are an owner or admin.
- **Reads or writes:** reads only.
- **Authentication:** `oauth_dcr` (OAuth with dynamic client registration).
- **Data handling:** Placetta's own API.
- **Allowed link URIs:** `https://www.placetta.com` (tool results link to agency pages, which stay behind Claude's
  confirmation prompt: they aren't Placetta's to list).
- **Compliance acknowledgments:** no financial transactions, no AI media generation, no conversation data collected
  (the server logs the tool name, a hash of the arguments and the decision, never the conversation).

## ChatGPT app

- Same server address and OAuth. ChatGPT registers itself through `registration_endpoint` once per connection.
- After submission, copy the exact production redirect URI from the app's management page; with `iss` supported it is
  `https://chatgpt.com/connector_platform_oauth_redirect`, which registration accepts like any https address.
- Tools are read only, so no confirmation prompts are needed on ChatGPT's side.

## Founder steps

1. Deploy: apply `20261028090000_mcp_oauth`, redeploy `mcp` (see `docs/MCP_SERVER.md`, Founder steps).
2. Test as a custom connector in Claude and in ChatGPT's developer mode with the server address alone; call every tool.
3. Make the reviewers' test workspace and publish a public setup page (the content of `docs/MCP_SERVER.md`, without
   the internal sections).
4. Submit at https://claude.ai/directory/manage (MCP connector) and in OpenAI's app submission, with the fields above.
