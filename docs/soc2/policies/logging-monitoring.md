# Logging and Monitoring Policy

| | |
| --- | --- |
| Owner | Founder (security lead) |
| Applies to | The app's audit trail, platform logs at Supabase, Vercel, Render and GitHub, and the alerts we act on |
| Review | Every 12 months; logs are reviewed weekly and monthly as below |
| Approved | Not yet: drafted 2026-10-18 for the founder's approval |
| Last reviewed | 2026-10-18 |
| Next review | 2027-10-18 |

## What we record

| Log | What's in it | Where | Kept |
| --- | --- | --- | --- |
| The audit trail (`public.audit_log`) | Every action by Odelia, a customer, our team, an agency or a customer's identity provider (SCIM): what, to what, who, when; every opening of a saved agency login; team and role changes; filings; deleted documents. With `20261022000000_enterprise_access.sql` (not yet applied): sign-ins with their method, SSO settings, SCIM changes, second-owner approvals and data exports, and owners and admins export it as CSV ([ENTERPRISE.md](../../ENTERPRISE.md#4-the-audit-trail)) | Supabase | With the workspace today (see [data-classification-retention.md](data-classification-retention.md) for the change the hardening migration brings) |
| AI calls (`ai_events`) | Each model call: workspace, role, model, vendor, tokens, cost | Supabase | With the workspace |
| Agent runs (`agent_runs`) | Each job: status, timings, tool calls and errors | Supabase | Working notes cleared after 365 days, once the purge is live |
| Text and call consent (`phone_consent_log`) | Every change to consent | Supabase | 5 years, append-only |
| The incident log (`public.incidents`) | What happened, impact, fix | Supabase, once its migration is applied | Permanent |
| Supabase platform logs | API requests, Postgres, Auth, server function logs | Supabase | 1 day on Free, 7 on Pro, 28 on Team ([pricing](https://supabase.com/pricing.md)). Supabase notes connection logging is off by default for new projects and that customers with evidence needs must turn it on ([SOC 2 and Supabase](https://supabase.com/docs/guides/security/soc-2-compliance)). Our copy: auth, function and API gateway logs exported hourly and kept 1 year under a lock, once set up ([runbooks/log-retention.md](../runbooks/log-retention.md); written 2026-10-22, not running yet) |
| Vercel, Render and GitHub Actions logs | Requests, builds, deploys, CI runs | Each provider | Per the provider's plan |

## Protecting the audit trail

Once `20261016114500_security_hardening.sql` is applied: no role can update, delete or truncate `audit_log`, the service role and the table owner included; the database stamps each row's time itself; members can only record their own actions; and the trail outlives its workspace. Tested in `supabase/tests/hardening.sql`. Until then, the app gives no edit or delete path to anyone using it (trust page, "Audit trail"), but the database itself doesn't refuse.

Logs never hold secrets: Odelia's replay scrubs secrets from every input (`scripts/extreme-test.ts` section 18 tests it), password fields reach the filer's model as "(filled)", and SSNs are refused before they're saved.

## What watches

| Monitor | Runs | Alerts |
| --- | --- | --- |
| The monitor function (`supabase/functions/monitor`) | Daily (`placetta-monitor` pg_cron job, 12:15 UTC) | Deadline and renewal reminders, rule changes, stale filing destinations (the `file` function's daily sweep), and on Mondays the agent health summary emailed to every staff address (`governance.ts`) |
| Agent watchdog, stuck-filing requeue, send hold, AI throttle sweep | Every 1 to 15 minutes (pg_cron) | Team tasks and Updates |
| Message line health (Linq) | Every 10 minutes | A `line_health` team task when a line slips |
| The agent health page | On demand, staff only | Runs, failures, tool errors, cost by vendor |
| CI and Dependabot | Every push and weekly | GitHub notifications |
| Uptime of placetta.com, the app and the functions | **Nothing today** | Add an external uptime check (several free tiers exist) that emails and texts the founder. Founder action |

## Review

| Every | Who | What |
| --- | --- | --- |
| Week | Founder | The Monday agent health summary; Supabase logs for failed function calls and auth errors (with 1 day of logs on Free, this has to be daily until the project is on Pro or the hourly export runs); the steps are in [runbooks/log-retention.md](../runbooks/log-retention.md#the-weekly-log-review-15-minutes-every-monday) |
| Month | Founder | Run `scripts/soc2-evidence.mjs` and read its "Needs attention" list: audit entries by actor, staff logins, saved-login openings, incidents without a fix; the Supabase security advisors. Record it in [RECORDS.md](../RECORDS.md#monthly-review) |
| Quarter | Founder | The access review ([access-control.md](access-control.md)) |

## How we prove it

1. The audit-log counts by actor, and the latest entry, in each evidence bundle (`supabase.audit_log`); its triggers (`supabase.database`).
2. The weekly governance emails in the staff mailbox, and `governance_reports` rows.
3. The monthly review records.
4. The uptime monitor's history once it exists.
