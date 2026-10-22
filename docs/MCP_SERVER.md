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
- **No OAuth.** Not needed for a read-only server with revocable tokens. Add it when listing in the Claude or ChatGPT
  directories requires it.

## Founder steps

1. Apply migrations `20261023090000_run_push` and `20261023100000_mcp_tokens`.
2. Deploy the function: `supabase functions deploy mcp` (`verify_jwt = false` is in `supabase/config.toml`).
3. Make a token in Settings, Connections, AI assistants, and add it to Claude with the address shown there. Ask
   "which of my stores have deadlines in the next 60 days?", or pick "Prepare my renewal checklist" from the prompts.
4. List it in the MCP Registry (optional, free): `docs/mcp/server.json` is ready. Prove you own placetta.com with a
   DNS TXT record (`mcp-publisher login dns --domain placetta.com`), then `mcp-publisher publish docs/mcp/server.json`.
   See https://modelcontextprotocol.io/registry/remote-servers.
