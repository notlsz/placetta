# Encryption Policy

| | |
| --- | --- |
| Owner | Founder (security lead) |
| Applies to | Customer information in transit and at rest, credentials we hold for customers, and our own keys |
| Review | Every 12 months |
| Approved | Not yet: drafted 2026-10-18 for the founder's approval |
| Last reviewed | 2026-10-18 |
| Next review | 2027-10-18 |

## In transit

1. Browser to placetta.com and the app: HTTPS only. Vercel serves TLS 1.3 ([Vercel](https://vercel.com/docs/security/compliance)); `vercel.json` sends `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` and `upgrade-insecure-requests` in the Content Security Policy.
2. App and servers to Supabase, and server functions to every vendor: HTTPS. The trust page states TLS 1.2 or newer.
3. Webhooks we receive are checked against the sender's signature before anything is read: Stripe, Telnyx (public key, five-minute window), Linq and Resend (Standard Webhooks), Meta (`X-Hub-Signature-256`), Slack (HMAC-SHA256, five minutes), Lark (signature and AES decryption), WeChat (safe mode), Postmark (a random password in the URL). Code: `supabase/functions/stripe-webhook`, `odelia-sms`, `odelia-mail`, `chat-events`, `_shared/bots.ts`, `_shared/linq.ts`, `_shared/whatsapp.ts`, `_shared/wechat.ts`.
4. Direct database connections: Supabase's "Enforce SSL" setting should be on. The evidence bundle reports it (`supabase.network`); it hasn't been checked yet.

## At rest

1. Supabase encrypts all customer data at rest with AES-256 ([Supabase security](https://supabase.com/security)): the database, file storage and their backups once backups exist.
2. Vercel encrypts data at rest with AES-256 ([Vercel](https://vercel.com/docs/security/compliance)).
3. On top of that, for what would open a customer's accounts elsewhere:

| Secret | How it's stored | Code |
| --- | --- | --- |
| Saved agency logins, connected-account tokens, chat webhook links, MCP server tokens | Supabase Vault, encrypted with a key held outside the database; only server functions can read them (`vault_get` is revoked from every API role); dropped when their row is deleted or replaced | `vault_put`, `vault_get`, `vault_drop` in `20261005042601_integrations_logins_fees.sql`; `drop_row_secret` in `20261016114500_security_hardening.sql` and `20261017140000_mcp_connectors.sql` (not yet applied live) |
| Settings PIN | bcrypt (`crypt` with `gen_salt('bf', 10)`); 5 wrong tries lock it for 15 minutes | `pin_set`, `pin_check` |
| Partner API keys | Only a SHA-256 hash is kept | `20261017210100_partners.sql` |
| The monitor key | Compared by SHA-256 digest, so timing says nothing | `monitor_key_ok` |
| Card numbers | Never reach us; Stripe holds them | |

## Keys we hold

1. Service and vendor keys live in Supabase function secrets, Render environment (`sync: false`) and Vercel settings, and in the company password manager. Never in the repo (gitleaks checks every commit), the app, a prompt or a log.
2. Rotate a key at once when someone who could see it leaves, or when it may have been exposed (an incident). Rotate the Supabase service role key, Stripe, Anthropic and Telnyx keys every 12 months.
3. Keep a record of each rotation: which key, when, why ([RECORDS.md](../RECORDS.md#console-changes)).

## How we prove it

1. `vercel.json` headers, and a TLS scan of placetta.com (for example SSL Labs) saved yearly.
2. The Vault functions and their tests (`supabase/tests/hardening.sql` checks secrets follow their rows).
3. The vendor attestations in [vendor-management.md](vendor-management.md) for encryption at rest.
4. `supabase.network` in the evidence bundle for database TLS.
5. The key rotation records.
