# Access Control Policy

| | |
| --- | --- |
| Owner | Founder (security lead) |
| Applies to | Customer accounts in the app, staff access to customer records, and every admin console we use |
| Review | Every 12 months; the access review itself runs every quarter |
| Approved | Not yet: drafted 2026-10-18 for the founder's approval |
| Last reviewed | 2026-10-18 |
| Next review | 2027-10-18 |

## Customers in the app

1. Sign-in is by email code or link, Google, or Microsoft (Supabase Auth). An account that only ever signed in with Microsoft never claims an invite or team access by email, because Microsoft can send unverified addresses (`SETUP.md`, "Sign in with Google or Microsoft").
2. Each workspace has owners, admins, members and viewers. Owners approve filings, payments, messages, integrations, saved logins and billing, and alone make, change or remove owners; a workspace always keeps one. Admins manage people, roles, single sign-on and SCIM and export the audit trail, but can't file, pay or send. Members use logs, documents and Odelia. Viewers read and change nothing. Every role change and invite is in the audit trail. (Admins and viewers come with `20261022000000_enterprise_access.sql`, written and tested, not yet applied: [docs/ENTERPRISE.md](../../ENTERPRISE.md#1-roles).)
3. Row-level security decides every read and write: `can_view` for reads, `is_member` (member and up) for writes, `is_admin`, `is_owner`, `is_staff` (`supabase/migrations/20261005040308_placetta_app.sql`, `20261005085958_two_step_helpers.sql`, `20261022000000_enterprise_access.sql`). Only an owner can request a filing; the database refuses anyone else. The server functions apply the same ranks (`requireAccess`).
4. Single sign-on: a workspace that verified its email domain (a DNS TXT record) can require everyone at it to sign in with SAML or one OAuth/OIDC provider; until they do, the database gives them nothing (`sso_session_ok` inside `mfa_ok()`). Each customer's SAML identity provider is registered by the founder (`supabase sso add`).
5. SCIM 2.0: a customer's identity provider can add people (they get access when that email signs in) and deactivate them (taken off the workspace, invites canceled, sessions ended). SCIM never makes, changes or removes an owner. Its token is kept only as a SHA-256 and shown once.
6. Two-step sign-in is optional for customers. Once an account turns it on, `mfa_ok()` refuses that account everything until the code is entered (an `aal2` session). An optional six-digit PIN guards sensitive settings (`settings_pin`, locked for 15 minutes after 5 wrong tries).

## Staff

1. Staff are the emails in `public.staff_emails`. `is_staff()` is true only for a confirmed email on that list **and** a two-step (`aal2`) session, so a staff member without two-step sees nothing a customer can't. The `logins` function requires the same before it opens a saved agency login, and writes the opening to the audit trail before showing it.
2. Staff open a customer's records only to do the filing or support work the customer asked for.
3. Adding someone to `staff_emails` is a change like any other: a recorded SQL statement, approved by the founder, logged in the access review.

## Least privilege for keys and services

| Credential | Where it lives | Who can use it |
| --- | --- | --- |
| Publishable key (`sb_publishable_...`) | `.env.production`, the browser | Anyone; row-level security limits it |
| Service role key | Supabase function secrets, Render (`SUPABASE_SERVICE_ROLE_KEY`, `sync: false`) | Server functions and the filer only; every caller is checked first (`supabase/functions/logins/shared.ts`) |
| Vendor API keys | Supabase function secrets, Render | Server only; never in the app, the repo or a prompt |
| Supabase access token | The founder's machine; meant to be a GitHub Actions secret for deploys | Deploys and admin |

Server-only tables have no API grants, and since `20261016114500_security_hardening.sql` new tables, functions and sequences get no grants to `anon` or `authenticated` by default. That migration is written and tested but **not yet applied** to the live database (checked 2026-10-18).

## Admin consoles

Every console in [information-security.md](information-security.md) (Supabase, Vercel, Render, GitHub, Stripe, the AI vendors, Telnyx, Linq, Meta, Resend, Lob, the domain and email provider) must:

1. be owned by a company account, not a personal one;
2. have two-step sign-in on, with an authenticator app or a security key (not SMS);
3. have only the people who need it, at the lowest role that works.

On 2026-10-18 nobody has checked these settings and written them down: that is the first access review.

## AI coding agents and production

AI coding sessions can reach the live Supabase project through the Supabase connector, under the founder's account, and migrations and function deploys have been made that way (`docs/MIGRATION_DRIFT.md`). That is production write access outside the change process. The rule from here on:

1. Coding sessions get the Supabase connector in read-only mode, scoped to the project.
2. Migrations and deploys go through a pull request and CI ([change-management.md](change-management.md)).
3. A session that needs production write access for an incident is an emergency change, recorded as one.

## The quarterly access review

In the first week of January, April, July and October, the founder:

1. runs `node scripts/soc2-evidence.mjs --out <evidence folder>`, which lists staff with their two-step status and last sign-in, GitHub collaborators and roles, and the function secret names;
2. adds what the script can't reach: members of the Supabase organization, Vercel team, Render workspace, Stripe team and each vendor console, with each account's two-step status;
3. removes anyone who no longer needs access, and checks that every staff account has two-step on;
4. writes the result in the access review record ([RECORDS.md](../RECORDS.md#access-review)) and keeps it, with the bundle, in the evidence folder.

## How we prove it

1. Row-level security and its tests: `supabase/tests/teams.sql`, `hardening.sql`, `enterprise.sql` (roles, SSO, SCIM), and the other database tests CI runs on every change; the end-to-end scenario "g3. enterprise access" (`npm run test:e2e`).
2. The evidence bundle: staff list with two-step status, all-account two-step totals, GitHub collaborators, row-level security on every public table (`supabase.database`).
3. The quarterly access review records.
4. The audit trail: every opening of a saved login, every team change.
