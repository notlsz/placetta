# Listing Placetta in Claude's connector directory and as a ChatGPT app

What each directory asks for, filled in from what the server does today. Written 2026-10-22, completed 2026-10-23
against the portal's ten steps as Claude's submission page lists them
([submission](https://claude.com/docs/connectors/building/submission), read 2026-10-23). Nothing here is submitted: the
founder submits from Placetta's accounts (steps at the end).

What the page says happens next: "Anthropic scans your submission automatically for policy compliance and, by default,
lists it as a Community connector with no action from you." Some submissions also get a person's review. So a complete
submission is the step that lists Placetta; the Verified label is a separate, later step
([verification](https://claude.com/docs/connectors/verification.md)).

## What both require, and where the server stands

| Requirement | Source | Placetta's server |
|---|---|---|
| Remote server over HTTPS | [Claude submission](https://claude.com/docs/connectors/building/submission) | `https://<ref>.supabase.co/functions/v1/mcp`, Streamable HTTP |
| OAuth for a service that reads a person's account | Claude submission ("use OAuth 2.0 for authenticated services"); [Apps SDK auth](https://developers.openai.com/apps-sdk/build/auth) | Built (`supabase/functions/mcp/oauth.ts`): dynamic client registration, PKCE S256, rotating refresh tokens |
| `401` with `WWW-Authenticate: Bearer resource_metadata=...`; `resource` equal to the server's address | [Claude authentication](https://claude.com/docs/connectors/building/authentication.md) | Yes, tested (`oauth_test.ts`), and end to end with the official SDK (`inspector_test.ts`) |
| Redirects: `https://claude.ai/api/mcp/auth_callback`, and Claude Code's loopback on any port | Claude authentication | Registered by the client; loopback matched on any port (`mcp_oauth_redirect_matches`) |
| ChatGPT redirect: `https://chatgpt.com/connector_platform_oauth_redirect` with RFC 9207 `iss` | Apps SDK auth | `authorization_response_iss_parameter_supported: true`, `iss` on every response |
| `resource` parameter honored | Apps SDK auth | Checked at authorize and bound to the code |
| Token endpoint takes `application/x-www-form-urlencoded`; `invalid_grant` for a dead refresh token | Claude authentication | Yes, tested |
| Every tool has `title` and `readOnlyHint` or `destructiveHint` | Claude submission | All 8: `title`, `readOnlyHint: true`, `destructiveHint: false` |
| Structured output that matches each tool's `outputSchema` | MCP spec (tools, structured content); the official SDK client checks it | Every tool, checked by `inspector_test.ts` (it caught `plan_preview` returning a count for a boolean, fixed 2026-10-23) |
| Per-tool `securitySchemes` | Apps SDK auth | `oauth2` with the tool's own scope |
| Run every tool yourself, "either through MCP Inspector or as a custom connector in Claude" | Claude submission, step 8 | Locally: MCP Inspector CLI 2.10.0 and the SDK 1.32.1 client against the handler (2026-10-23). **Founder:** again against the deployed address, then in Claude as a custom connector |
| Documentation, privacy policy, support contact, icon | Claude submission | `docs/MCP_SERVER.md` (publish a public page for it), https://www.placetta.com/privacy.html, support@placetta.com, `site/icon-512.png` |
| A fully populated test account for reviewers | Claude submission | **Founder:** a workspace with sample stores, deadlines, filings with timelines, an appeal and a booked inspection |
| Endpoints answer within 10 s (refresh 30 s) | Claude authentication | Each is one or two database calls |

## Claude connector directory: the portal's ten steps

1. **Connection:** one URL for everyone, `https://<ref>.supabase.co/functions/v1/mcp` (or `MCP_PUBLIC_URL` if it moves to
   a placetta.com address). Not "users connect to different URLs": the workspace comes from the sign-in, not the address.
2. **Tools:** synced from the server: 8 tools, all read only (`compliance_status`, `upcoming_deadlines`,
   `store_readiness`, `plan_preview`, `filing_status`, `status_timeline`, `appeals`, `inspections`), 5 prompts
   (`renewal_checklist`, `weekly_brief`, `opening_readiness`, `appeal_deadlines`, `inspection_prep`), 5 resources and
   3 resource templates. Nothing flagged: every tool has a title and annotations.
3. **Listing:**
   - **Server name (100 max):** Placetta
   - **One-liner (200 max):** Read-only license and permit status, deadlines, filing timelines, appeals and inspections
     for your stores, from Placetta.
   - **Description (2,000 max):** Placetta tracks the licenses, permits and filings each of your stores needs, with the
     agency, the deadline and the official source for each. Connected to Claude, it answers "which stores have renewals
     in the next 60 days?", "where is the Flushing health permit with the agency?", "when do we have to file the appeal
     for the sign permit?", "when is the next health inspection?" or "what permits does a milk tea shop in Irvine
     need?" from your own workspace. Each filing's timeline shows what the agency's own lookup said and when. It only
     reads: it can't change, file, pay or send anything. You choose the workspace and what it may read when you
     connect, and you can disconnect it at any time in Placetta's Settings. Placetta isn't a law firm; where an
     attorney is advised for an appeal, it says so.
   - **Categories (1 to 5):** Productivity; Business operations; Legal and compliance (pick the closest the portal offers).
   - **Documentation URL:** the public setup page (founder step 3). **Privacy policy URL:** https://www.placetta.com/privacy.html.
     **Support contact:** support@placetta.com. **Icon:** `site/icon-512.png`.
   - **Slug (permanent once published):** `placetta`
4. **Use cases:** compliance status by store; deadlines and renewals; a filing's timeline with the agency; appeal
   deadlines after a denial; inspections booked and their results; readiness before opening or an inspection; a permit
   plan preview for a US city. **What users need:** a Placetta workspace where they are an owner or admin. **Reads or
   writes:** reads only.
5. **Company:** Placetta, https://www.placetta.com, the founder as primary contact.
6. **Authentication:** required; OAuth with dynamic client registration (no client ID or secret for Anthropic to hold:
   Claude registers itself).
7. **Data handling:** Placetta's own API. No personal health data (a health permit is a business license; the server
   holds no one's medical information). No sponsored content.
8. **Test & launch:** a reviewer opens the connector, signs in to Placetta with the reviewers' account, chooses the
   "Moonleaf Tea (review)" workspace and allows every scope, then asks: "Which stores have deadlines in the next 60
   days?", "Show the timeline for the Flushing health permit", "Which appeals are due?", "When is the next inspection
   in Flushing?", "What permits does a bubble tea shop in Irvine, CA need?", and picks "Prepare my renewal checklist".
   Confirm every tool was run through MCP Inspector or as a custom connector.
9. **Compliance (all seven):** directory guidelines; first-party API (Placetta's own); no financial transactions (the
   server reads; paying happens only in Placetta's app); no AI media generation; prompt injection (every value from an
   agency page or a customer's own app reaches Placetta's agent fenced as data, and the MCP server returns records,
   never instructions); conversation data (the server logs the tool name, a hash of the arguments and the decision,
   never the conversation); public documentation (the setup page).
10. **Review and submit.**

**Allowed link URIs (optional):** `https://www.placetta.com` only. Tool results also link to agency pages, which stay
behind Claude's confirmation prompt: they aren't Placetta's to list.

## ChatGPT app

- Same server address and OAuth. ChatGPT registers itself through `registration_endpoint` once per connection.
- After submission, copy the exact production redirect URI from the app's management page; with `iss` supported it is
  `https://chatgpt.com/connector_platform_oauth_redirect`, which registration accepts like any https address.
- Tools are read only, so no confirmation prompts are needed on ChatGPT's side.

## Founder steps

1. Deploy: apply `20261028090000_mcp_oauth`, redeploy `mcp` (see `docs/MCP_SERVER.md`, Founder steps).
2. Run the MCP Inspector against the deployed address and test as a custom connector in Claude and in ChatGPT's
   developer mode with the server address alone; call every tool.
3. Make the reviewers' test workspace and publish a public setup page (the content of `docs/MCP_SERVER.md`, without
   the internal sections).
4. Submit at https://claude.ai/directory/manage (MCP connector) and in OpenAI's app submission, with the fields above.
