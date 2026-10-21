# Enterprise access and data controls

What is built in this repository for enterprise customers, how each piece works, what the founder still has to set up, and what the landing and trust pages may say about each one today. Written 2026-10-22.

**Nothing here is live yet.** Everything below is built and tested in this repository (database tests, function tests, the end-to-end suite), but production runs it only after the founder applies `supabase/migrations/20261022000000_enterprise_access.sql` and deploys the changed functions ([Deploy](#deploy)). Until then the trust page labels for these items are "Rolling out" or "In progress", never "In place".

| Item | Built and tested | Founder setup before a customer can use it |
| --- | --- | --- |
| [Roles](#1-roles) | Owner, admin, member, viewer, enforced by row-level security and in every server function; Settings to change roles; every change in the audit trail | Apply the migration, deploy the functions |
| [Single sign-on](#2-single-sign-on) | SAML 2.0 (Supabase Auth SSO by domain), Google, Microsoft Entra ID and custom OpenID Connect sign-in; domain verified by DNS; SSO required for a verified domain, enforced by the database | Supabase Pro or above; turn on SAML; register each customer's identity provider (`supabase sso add`); OAuth providers as needed |
| [SCIM 2.0](#3-scim-20-provisioning) | The `scim` function: /Users and /Groups per RFC 7643 and 7644, a hashed per-workspace token shown once, groups mapped to roles, deprovisioning that removes access and ends sessions | Deploy `scim`; check session revocation works on the live project |
| [Audit trail](#4-the-audit-trail) | Sign-ins, SSO, roles, invites, SCIM, filings, approvals, payments, data exports; CSV export for owners and admins | Apply the migration; decide retention (CONTROLS.md C1.2b) |
| [Filer isolation](#5-portal-filing-isolation) | Each portal filing run gets a new browser session and its own temporary folder, both removed when the run ends | Deploy the filer |
| [Zero data retention](#6-zero-data-retention) | An allowlist: with `AI_ZDR_REQUIRED=1`, AI calls go only to providers and modes on `AI_ZDR_PROVIDERS`, everything else is refused | Get each provider's written zero-retention confirmation, then set the two secrets. **Not in force today** |
| [Private networking](#7-private-networking) | Nothing in code | A contract item: Supabase Team or Enterprise and AWS PrivateLink, database connections only |

## 1. Roles

| Role | Can |
| --- | --- |
| Owner | Everything, and alone approves filings, payments and messages sent as the business, manages billing, connects accounts and saved logins. Only an owner makes, changes or removes an owner. A workspace always keeps one |
| Admin | Invites people and changes their roles (not owners), removes people (not owners), sets up single sign-on and SCIM, exports the audit trail. Works in the workspace like a member. Can't file, pay or send as the business |
| Member | Works in the workspace: Odelia, documents, logs, comments |
| Viewer | Reads everything the workspace shows. Changes nothing: no edits, uploads, comments, tasks for Odelia or invites |

Where it's enforced:

1. The database. `my_role(ws)` is the caller's role (only once two-step and the SSO rule are satisfied, `mfa_ok()`); `can_view` (any role), `is_member` (member and up, so a viewer fails every write check), `is_admin`, `is_owner`. Every SELECT policy and read-only function that checked `is_member` now checks `can_view`; every write policy and every function that changes data keeps `is_member` or stricter. File uploads need member and up (`can_use_folder`), reading files any role (`can_read_folder`). `set_member_role`, `invite_member`, `revoke_invite` and `check_remove_member` apply the owner and admin rules above.
2. The server functions. `requireAccess(ws, user, jwt, need)` in the shared helper (copied into eight functions) ranks the roles; `agent`, `agent-run` and `tts` refuse viewers; `billing` stays owner-only; Odelia by text, phone and chat counts owners, admins and members.
3. The app. Settings, Team shows the four roles; a viewer gets a "view only" message instead of saving or starting Odelia (the database refuses either way).

Every role change and invite is an audit entry ("Changed a role", with "Member to Viewer" style detail; "Invited someone").

Tests: `supabase/tests/enterprise.sql` (roles section), `scripts/e2e/run.ts` scenario "g3. enterprise access", `supabase/functions/_shared/access_test.ts`.

## 2. Single sign-on

### How it works

1. An owner or admin enters the company's email domain in Settings, Security, Single sign-on. Placetta gives a TXT record: `_placetta-verify.<domain>` with a value `placetta-verify=<32 hex characters>`.
2. They add it at their DNS host and press Check. The `sso` function looks the record up over DNS-over-HTTPS (Cloudflare, then Google) and marks the domain verified only when the exact value is there. A domain is verified by one workspace at a time.
3. They choose the method: SAML single sign-on, Google Workspace, Microsoft Entra ID, or another OpenID Connect provider (Okta and others, set up by Placetta as a custom provider).
4. They turn on "Require single sign-on for everyone at <domain>". Whoever turns it on, if their own email is at that domain, must be signed in that way at that moment, so nobody locks themselves out.

From then on, any account whose email is at that domain reaches no workspace data unless its current session used the required method:

1. SAML: the session's `amr` claim says `sso/saml` and names a provider that is registered in Supabase Auth for that same domain. A provider registered for another domain asserting this domain's emails is refused.
2. Google, Microsoft or a custom OIDC provider: the session's `amr` says `oauth`, the account has an identity from that provider, and no identity from any other OAuth provider. (Supabase's token doesn't say which OAuth provider a session used, so an account with two would be ambiguous; it's refused.)

This is checked by the database on every request (`mfa_ok()` calls `sso_session_ok`), and by the server functions, which get `sso_required` from `access_for`. The sign-in screen asks `sso_for_email` after the email is typed and goes straight to the required method. The rule covers the whole domain across Placetta, the way verified-domain SSO works in other products: a person at that domain who belongs to another company's workspace is held to it too. Odelia by text, phone and chat can't prove a sign-in method, so accounts at an enforced domain can't use those channels.

Supabase keeps SSO accounts separate from password accounts with the same email ([Supabase SAML docs](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml)). Invites and SCIM handle that: a SAML identity counts as a proven email when its provider is registered for that domain (`email_proven`), and a provisioned person's access moves to their SSO account the first time they sign in with SAML (`scim_claim`).

### Founder steps

1. **Plan.** SAML 2.0 is on Supabase Pro and above ([docs](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml)). Pro and Team include 50 monthly active SSO users; each one beyond is $0.015 ([usage docs](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users-sso)). The backups step in [soc2/README.md](soc2/README.md) already moves the project to Pro.
2. **Turn on SAML** in the Supabase dashboard, Authentication, Providers (it's off by default).
3. **Per customer using SAML**, with the Supabase CLI 1.46.4 or later:
   1. Run `supabase sso info --project-ref <ref>` and send the customer the entity ID, the ACS URL and the metadata URL it prints, for their identity provider's app.
   2. Ask them for their identity provider's SAML metadata URL (or file), and confirm their email domain.
   3. Run `supabase sso add --type saml --project-ref <ref> --metadata-url '<their metadata URL>' --domains <their domain>`. Add `--attribute-mapping-file` only if their IdP doesn't send the email as the NameID.
   4. In Placetta, their admin verifies the domain, picks SAML, and checks the status row reads "Set up in Placetta" (the `sso` function asks Supabase Auth whether a provider covers the domain).
4. **Google Workspace**: turn on the Google provider in Supabase Auth with a Google OAuth client (it may already be on for "Continue with Google"). The domain rule is what limits it to the company: only emails at the verified domain are held to it, and any Google account can still sign in for itself elsewhere.
5. **Microsoft Entra ID**: turn on the Azure provider in Supabase Auth with an app registration. For more than one customer tenant, register a multi-tenant app; the domain rule checks the email domain.
6. **Okta (or another OpenID Connect IdP)**: in the dashboard, Authentication, Providers, New Provider, Auto-discovery, with the customer's issuer URL (for Okta, `https://<their org>.okta.com`) and an identifier such as `custom:okta-acme`. Free projects get 3 custom providers, Pro and above unlimited ([docs](https://supabase.com/docs/guides/auth/custom-oauth-providers)). Their admin then picks "Another OpenID Connect provider" in Settings and enters that identifier. Okta also supports SAML, which needs no custom provider.
7. Make sure the app's address is on Supabase Auth's redirect allow list (it already is for sign-in links).

## 3. SCIM 2.0 provisioning

The `scim` function (deployed with `verify_jwt = false`; it checks its own token) serves `https://<project>.supabase.co/functions/v1/scim/v2`:

| Request | What it does |
| --- | --- |
| `GET /ServiceProviderConfig`, `/ResourceTypes`, `/Schemas` | Says what's supported: PATCH and filters yes; bulk, sort, ETags and password changes no |
| `GET /Users?filter=userName eq "x"` | Also `externalId eq` and `emails.value eq`; `startIndex` and `count` (at most 200) |
| `GET /Users/{id}` | |
| `POST /Users` | 201 with `Location`; 409 `uniqueness` when the userName exists (case-insensitive) |
| `PUT /Users/{id}` | Replaces the user |
| `PATCH /Users/{id}` | `add`, `replace`, `remove` on active, userName, externalId, displayName, name, emails, with or without a path; `"False"` as a string (Entra ID) works. `active: false` deprovisions |
| `DELETE /Users/{id}` | Deprovisions, then deletes; 204 |
| `GET /Groups?filter=displayName eq "x"` | Also `externalId eq`; `excludedAttributes=members` |
| `POST`, `PUT`, `PATCH`, `DELETE /Groups[/{id}]` | Members added and removed by list or by `members[value eq "<id>"]` |

Errors use the RFC 7644 error schema with a `scimType`. Each token is limited to 600 requests a minute.

How it maps to Placetta:

1. **The token.** Settings, Security, Provisioning: an owner or admin creates it; it's shown once (`scim_<8 hex>_<64 hex>`) and only its SHA-256 is stored. One live token per workspace; Replace makes a new one and the old one stops working at once; Turn off ends it.
2. **People.** A provisioned person is known by email: the userName when it is one, otherwise the primary email. They get access when that email signs in (`scim_claim`, run with `accept_invites` on every sign-in), or at once if they're already on the workspace. A provisioned person with no email (RFC 7644's own `bjensen` example) is kept but gets no access.
3. **Roles.** Groups pushed by the IdP appear in Settings; an owner or admin gives each group a role: admin, member or viewer. A person gets the highest role among their mapped groups, member when none. SCIM never makes, changes or removes an owner: deactivating an owner is refused with 400 `mutability` (and recorded), and an owner's role is left alone. People on the workspace who were never provisioned aren't touched.
4. **Deprovisioning** (`active: false` or DELETE): every account with that email is taken off the workspace, open invites for the email are canceled, and each account's sessions are ended by deleting its rows in `auth.sessions` and `auth.refresh_tokens`, so no refresh token works again. An access token already issued stays valid until it expires (Supabase's JWT expiry, an hour by default), but every database request checks membership, so the person reaches nothing in the workspace from the moment they're deprovisioned. If the database can't reach those auth tables, `revoke_sessions` returns -1 and the audit line says the sign-in "ends when it expires" instead of "signed out everywhere".
5. **The audit trail.** Every create, change, activation, deactivation, deletion, group change and refusal is an entry by the identity provider (`actor = 'idp'`); token creation, replacement and group-role mapping are entries by the admin who did them.

IdP setup (what the customer's admin does): in Okta, a SCIM 2.0 app integration with the base URL above, "Unique identifier field for users" set to `userName`, authentication "HTTP Header" with the token as the Bearer token, and push for users, deactivation and groups. In Microsoft Entra ID, an enterprise application's provisioning set to Automatic, tenant URL the base URL above, secret token the token.

Founder steps: deploy `scim`; on the live project, check session revocation works by running `select public.revoke_sessions('<a test account id>')` as the service role and confirming it returns 0 or more (not -1).

## 4. The audit trail

`public.audit_log` is append-only (no update, delete or truncate for any role, once `20261016114500_security_hardening.sql` is applied) and outlives its workspace. What's recorded:

| Event | Entry | Written by |
| --- | --- | --- |
| Sign-in | "Signed in", with how (password, code, link, SAML, Google, Microsoft) and two-step | `audit_sign_in()`, called by the app when a session opens; once per session per workspace |
| SSO | Domain set, verified, SSO required or not, method | `sso_set_domain`, `sso_mark_verified`, `sso_set_enforced` |
| Roles and team | Role changed (from and to), invited, invite canceled, joined, removed, left | `set_member_role`, `invite_member`, `revoke_invite`, `accept_invites`, `check_remove_member` |
| SCIM | Token created, replaced, turned off; group mapped; person provisioned, added, role changed, updated, reactivated, deactivated, deleted; group added, updated, deleted; refusals | The SCIM functions and the `scim` function |
| Filings | Approved for filing, started, submitted, accepted, returned, canceled; each step of a self-filing | `filings_audit` trigger, the `file` function, the filer |
| Approvals | A second owner's approval | `owner_approvals_audit` trigger (new) |
| Payments | Plan purchases and Odelia packs (Stripe webhook), purchases approved under the spending rules (`spend`) | `stripe-webhook`, `spend` |
| Data exports | Workspace data downloaded (JSON); the audit trail exported (CSV) | `audit_record_export` (the app records it before the download starts, and doesn't download if it can't), `audit_export` (records itself first) |
| Saved logins | Every opening | `logins`, the filer |

Export: Settings, Privacy and data, "Export the audit trail" (and Activity, Export) gives owners and admins a CSV of every entry, oldest first, with each person's email, in English and Chinese. Cells a spreadsheet could run as a formula are made inert. Members and viewers read the trail in the app but can't export it. The export function refuses anyone else.

Limits, stated plainly: the sign-in entry is written by the app when a session opens, so a modified client could skip it; Supabase Auth's own logs record every sign-in at the project level (7 days on Pro). How long the trail is kept after a workspace is deleted is still the founder's decision ([CONTROLS.md](soc2/CONTROLS.md) C1.2b).

Tests: `supabase/tests/enterprise.sql` (audit section), `scripts/agent-test.ts` "Audit trail export (CSV)", the e2e scenario.

## 5. Portal filing isolation

What it is, exactly: each portal filing run in `worker/filer` opens its own new browser session and its own temporary folder, and both are removed when the run ends, however it ends.

1. The session: a new Browserbase session (no saved Browserbase context) when `BROWSERBASE_API_KEY` is set, otherwise a new local Chromium process with a new, empty browser context (Playwright gives it a throwaway profile and deletes it on close). Never reused.
2. Before visiting anything the run checks the session is empty: no cookies, one page, not already on a website (`assertFresh`). A session that isn't is refused.
3. Files the run uploads are written to a folder made for that run (`filer-<filing id>-...` in the system's temp folder) and nowhere else; the folder is deleted in the run's `finally`, with the browser closed first.
4. Runs go one at a time.

What it is not: the worker is one container on Render that runs filings one after another. This is per-run browser and file isolation inside that container. It is not a separate virtual machine per run or per customer, and shouldn't be described as one.

Tests (`worker/filer/test/filer.test.ts`, real Chromium): a new browser per run, the second customer's run starts with no cookies after the first left one, the upload lands in the run's own folder and the folder is gone afterwards, a failed run still cleans up, and a used session is refused before it visits the portal.

## 6. Zero data retention

Code: `supabase/functions/_shared/zdr.ts`, used by the model router (`_shared/llm.ts`, every agent model call), phone calls (`voiceReady` in `_shared/odelia.ts`, since Telnyx's assistant hears the call), reading aloud (`tts`, Azure Speech) and the portal filer's model.

| Secret | Meaning |
| --- | --- |
| `AI_ZDR_REQUIRED=1` | Turns the rule on. Unset, nothing changes |
| `AI_ZDR_PROVIDERS` | Comma separated: a provider (`anthropic`, `gemini`, `openai`, `groq`, `cerebras`, `openrouter`, `deepseek`, `telnyx`, `azure_speech`), one model (`anthropic:claude-sonnet-5-5`), or Anthropic's web tools (`anthropic:web-tools`) |

With the rule on: a route keeps only allowed providers and models; Anthropic's server-side web search and fetch are dropped unless `anthropic:web-tools` is listed; a call with nothing left is refused before anything is sent ("Zero data retention is required..."); calls stay off unless `telnyx` is listed; reading aloud is off unless `azure_speech` is; the filer's model refuses and the filing goes to the team. Tests: `supabase/functions/_shared/zdr_test.ts`, `worker/filer/test/filer.test.ts`.

This code enforces the list; it can't check a provider's settings. **Zero data retention is not in force**: `AI_ZDR_REQUIRED` isn't set anywhere, and no provider has confirmed zero retention in writing for Placetta's account ([CONTROLS.md](soc2/CONTROLS.md) CC9.2d).

Founder steps:

1. Ask each provider Placetta uses for zero data retention on Placetta's account, and get it in writing (a signed addendum or the provider's written confirmation that names the account): Anthropic, Google (Gemini), and, if they stay in the routes, Groq, Cerebras and OpenRouter; Telnyx for calls; Microsoft for Azure Speech. Ask each whether it covers every feature Placetta uses (for Anthropic, the web search and fetch tools as well as Messages).
2. Keep each confirmation in the evidence folder with its date and scope, and list it in the vendor table ([vendor-management.md](soc2/policies/vendor-management.md)).
3. Set `AI_ZDR_PROVIDERS` to exactly what's confirmed, then `AI_ZDR_REQUIRED=1`, in the Supabase function secrets and on Render (the filer). Check Odelia still answers (a provider with a key must be on the list).
4. Only then may the trust page say zero data retention is in place, and only for what's listed.

## 7. Private networking

Not built and not needed for the app as it runs: the app, the functions and the filer reach Supabase over its public HTTPS API, which PrivateLink doesn't cover. Supabase PrivateLink is for Team and Enterprise customers and carries direct Postgres and PgBouncer connections only, not the API, Storage, Auth or Realtime ([docs](https://supabase.com/docs/guides/platform/privatelink)). It's a contract item: if an enterprise customer's contract needs it, the founder moves the project to Team or Enterprise, sets up the AWS PrivateLink connection in the project's settings (same AWS region, accept the resource share within 12 hours, security groups for ports 5432 and 6543), points any direct database clients at the private endpoint, and then may restrict public database access.

## Deploy

1. Apply `20261022000000_enterprise_access.sql` after the pending migrations ([MIGRATION_DRIFT.md](MIGRATION_DRIFT.md)). It replaces `mfa_ok`, `is_member`, `is_owner`, `access_for` and the team functions, so apply it with the functions below in the same change window.
2. Deploy the new functions `scim` and `sso`, and redeploy every function whose code or shared code changed (checked with `deno info`): `agent`, `agent-run`, `tts`, `billing`, `team`, `integrations`, `oauth-callback`, `logins`, `spend`, `file`, `forms`, `odelia-sms`, `odelia-voice`, `odelia-mail`, `chat-events` and `monitor`. `supabase/config.toml` already has `verify_jwt = false` for `scim`.
3. Rebuild and deploy the filer on Render (its Dockerfile now copies `_shared/zdr.ts`).
4. Deploy the app.

## What the landing and trust pages may say today

Each line is true of the code in this repository. While the migration and functions aren't deployed, keep the trust page's "Rolling out" label on items 1 to 5; item 6 stays "In progress"; item 7 isn't offered.

| Item | Wording | Label today |
| --- | --- | --- |
| Roles | "Owner, admin, member and viewer roles, enforced by the database on every request. Every role change is recorded in the audit trail." | Rolling out |
| Single sign-on | "SAML 2.0 single sign-on, plus sign-in with Google Workspace, Microsoft Entra ID or another OpenID Connect provider. Verify your email domain and require SSO for everyone at it." Add: "Placetta connects your identity provider for you" (each SAML connection is registered by Placetta, by hand) | Rolling out |
| SCIM | "SCIM 2.0 provisioning for users and groups (Okta, Microsoft Entra ID and other SCIM 2.0 providers), with groups mapped to roles. Deprovisioning removes access and ends the person's sessions." | Rolling out |
| Audit trail | "An append-only audit trail of sign-ins, role and SSO changes, provisioning, filings, approvals, payments and data exports. Owners and admins export it as CSV." | Rolling out |
| Filing isolation | "Each portal filing runs in its own new browser session with its own temporary files, deleted when the filing run ends. Nothing carries over between runs or customers." Never "VM", "sandboxed virtual machine" or "dedicated environment" | Rolling out |
| Zero data retention | "We're asking each AI provider to confirm zero data retention in writing. Placetta can limit AI processing to providers that have." Never "zero data retention" as a current fact | In progress |
| Private networking | Don't list it. If a contract calls for it: "Private database connectivity over AWS PrivateLink is available under an enterprise agreement" only once the founder has decided to offer it | Not offered |
