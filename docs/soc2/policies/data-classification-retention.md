# Data Classification and Retention Policy

| | |
| --- | --- |
| Owner | Founder (security lead) |
| Applies to | All information Placetta holds, in every system in [information-security.md](information-security.md) |
| Review | Every 12 months, and whenever a new kind of personal data is collected or a retention period changes |
| Approved | Not yet: drafted 2026-10-18 for the founder's approval |
| Last reviewed | 2026-10-18 |
| Next review | 2027-10-18 |

## Classes

| Class | What | Handling |
| --- | --- | --- |
| Restricted | Saved agency logins, connected-account tokens, chat webhook links and MCP tokens (all in Supabase Vault); our own service keys; Social Security numbers and ITINs; identity documents; anything that opens a customer's account elsewhere | Vault or a secrets store only. Never in a log, prompt, ticket, chat or screenshot. SSNs and ITINs are never filed by our software and Odelia's tools refuse to save them (`src/guard.ts`, `supabase/functions/file/logic.ts`). Every opening of a saved login is audited |
| Confidential | Workspace information: business facts, applications, documents, conversations with Odelia, texts and call records, approvals and signatures, the audit trail; staff and partner records; billing records | The database and file storage behind row-level security; staff reach it only with two-step; it leaves only to the vendors listed in [vendor-management.md](vendor-management.md), under the rules there |
| Internal | Source code, these documents, metrics, AI cost data | GitHub and company accounts; not shared outside the company without a reason |
| Public | placetta.com, the guides, the trust page, the publishable key, the legacy anon key, the IndexNow key | Anyone may see it. Public keys are listed, with reasons, in `.github/gitleaks.toml` |

Customer data is Confidential at least, and Restricted where the table says so. Card numbers never reach us: Stripe holds them.

## Retention

What the Privacy Policy ([legal/privacy.md](../../../legal/privacy.md), "Retention") promises, and what enforces it:

| Data | Kept | Enforced by | Status (2026-10-18) |
| --- | --- | --- | --- |
| Workspace information and documents | While the workspace exists; deleted with it, including when its only owner deletes their account | Account deletion (`team` function, `20261012200000_account_deletion.sql`); owners can also delete a single document and its file | In place for account deletion. Single-document deletion is in `20261016114500_security_hardening.sql`, not yet applied |
| Audit trail | Privacy Policy: deleted with the workspace | After the hardening migration: append-only, and kept when the workspace is deleted (no foreign key to the workspace) | **Conflict.** Once the hardening migration runs, the Privacy Policy is wrong. Decide a period (for example 7 years after the workspace ends, for filings' proof), change the Privacy Policy, and add a deliberate purge for audit rows past it. Founder decision, then legal text and code |
| Account information, texts and call records | While the account exists | Account deletion | In place |
| Terms acceptance records | 6 years after the account ends | Kept on deletion | Kept; nothing deletes them after 6 years yet. First due 2032; add to `purge_expired()` before then |
| Text and call consent records | 5 years | `phone_consent_log` is append-only | Kept; nothing deletes them after 5 years yet. First due 2031 |
| Chat bot event ids | 30 days | `purge_expired()` | Written, not live |
| Unfinished account connections (`oauth_pending`) | 1 day, and their vault secret | `purge_expired()` | Written, not live |
| Scheduled check claims (`routine_runs`) | 180 days | `purge_expired()` | Written, not live |
| Page view counters | 400 days untouched | `purge_expired()` | Written, not live |
| Odelia's working notes for a finished task (model conversation, steps, draft) | 365 days after it finishes; the request and the answer stay | `purge_expired()` | Written, not live |
| Finished app-connector calls (`mcp_calls`) | 90 days | `purge_expired()` | Written, not live |
| Plan requests from placetta.com | While needed to follow up, or until the person asks | By hand | By hand |
| Billing records | As the law requires | Stripe, and `billing` rows | In place |
| Backups | None exist yet | | The Privacy Policy must say how long deleted data stays in backups before backups start ([backup-disaster-recovery.md](backup-disaster-recovery.md)) |

`purge_expired()` is defined in `20261016114500_security_hardening.sql` and extended in `20261017140000_mcp_connectors.sql`, and runs daily at 09:23 UTC as the `placetta-purge` pg_cron job. Neither migration is applied to the live database yet, so none of the "Written, not live" rows happen today. The trust page already marks them "Rolling out".

## Deleting on request

A customer can delete their account in Settings, or email support@placetta.com to delete a document, a workspace or their data. Privacy requests are answered within 45 days (trust page, CCPA). Record each request and its completion in the support mailbox.

## How we prove it

1. The retention table above against `purge_expired()` and the Privacy Policy, reviewed together in the same pull request whenever one changes.
2. The evidence bundle's `supabase.database` source lists the scheduled jobs, so `placetta-purge` shows once it's live.
3. `supabase/tests/hardening.sql` checks the purge removes what it should and nothing else, and that members can't run it.
4. Deletion requests and their completion dates in the support mailbox.
