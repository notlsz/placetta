# Incident Response Policy

| | |
| --- | --- |
| Owner | Founder (security lead), who is the incident lead |
| Applies to | Security incidents, outages, and anything that exposes, corrupts or loses customer information, at Placetta or a vendor |
| Review | Every 12 months, after every SEV1, and after the yearly tabletop exercise |
| Approved | Not yet: drafted 2026-10-18 for the founder's approval |
| Last reviewed | 2026-10-18 |
| Next review | 2027-10-18 |

## Severity

| Level | What it is | Examples |
| --- | --- | --- |
| SEV1 | Customer information exposed, changed or lost, or likely to have been; a filing, payment or message sent without an owner's approval; the service down for everyone | A leaked service role key; row-level security letting one workspace read another; a vault secret in a log; the database lost |
| SEV2 | A security control failing with no known exposure; part of the service down; a vendor's breach notice that may involve our data | The approval check bypassed in testing; a staff account found without two-step; Odelia's texts or calls down; a model vendor reports a breach |
| SEV3 | A weakness with a small, contained effect; one customer affected | A dependency advisory rated high; one workspace's failed import; a missed restore test |

When unsure, pick the higher level. The level can be lowered later, with the reason in the log.

## Timelines

| | SEV1 | SEV2 | SEV3 |
| --- | --- | --- | --- |
| Acknowledge and start the log entry | 1 hour from detection | 1 business day | 3 business days |
| Contain (stop the exposure or the harm) | 24 hours | 3 business days | 30 days |
| Tell affected customers | Without undue delay, and within 72 hours of confirming their information was involved, unless a contract or law sets a shorter time | If their data or service was affected | Not required |
| Post-incident review | Within 5 business days of containment | Within 10 business days | In the log entry |

Breach notification laws differ by state and country; for a SEV1 involving personal information, the founder confirms the legal deadline with counsel the same day.

## Contacts

| Who | How |
| --- | --- |
| Reports from outside | security@placetta.com (published in `site/.well-known/security.txt` and on the trust page); support@placetta.com |
| Incident lead | The founder. Phone and backup contact: to fill in, and kept in the password manager's emergency kit |
| Vendors | Each vendor's support portal from its console, listed in [vendor-management.md](vendor-management.md); Supabase support from the project dashboard |
| Customers | The owners of each affected workspace, by email from support@placetta.com, and an in-app update |
| Counsel | To fill in |

## Steps

1. **Detect and log.** Open an entry in the incident log at once, even if it may be nothing. Detection sources: security@ reports, the monitor's team tasks and Updates, the weekly governance summary, CI and Dependabot, vendor notices, customer reports.
2. **Assess.** Set the severity. Decide who is affected and what data.
3. **Contain.** Use the narrowest switch that stops it:
   1. filing: remove the agency from `FILER_AGENCIES`, empty `FILER_CHANNELS`, set `FILER_ENABLED=0` or `FILER_DRY_RUN=1` (Supabase function secrets, Render);
   2. payments: `update public.app_settings set payments_on = false;`
   3. AI: lower `AI_DAILY_LIMIT_USD`, or remove a vendor's key so routing skips it;
   4. a person or a key: sign the account out everywhere and ban it in Supabase Auth; rotate the key at its vendor and in the secrets store;
   5. the site or app: Vercel instant rollback to the last good deployment; a function: redeploy the previous version from git.
4. **Eradicate and recover.** Fix the cause through a pull request (an emergency change if it can't wait; see [change-management.md](change-management.md)). Restore data from backup if needed ([backup-disaster-recovery.md](backup-disaster-recovery.md)).
5. **Notify.** Customers whose information was involved: what happened, what information, what we did, what they should do, who to contact. Mark the entry public if it affected customers, so it shows on the trust page.
6. **Review.** What happened, why, what detected it, how long each step took, and what changes. Each action item becomes an issue or a pull request, linked from the entry.

## The incident log

The log is the `public.incidents` table (`supabase/migrations/20261017210300_agent_health.sql`): when it happened, a title, the impact, the fix, and whether it shows on the trust page. Staff with two-step add and update entries (`incident_add`, `incident_update`); the trust page shows entries marked public and the date the log began (`incident_log_public`, `site/incidents.js`).

Two gaps, both to close:

1. **The table isn't in the live database yet.** The migration is in the repo and tested (`supabase/tests/health.sql`) but not applied (checked 2026-10-18). Until it is, keep entries in the evidence folder using the template in [RECORDS.md](../RECORDS.md#incident).
2. **It has no columns for severity, detection, containment, resolution or customer notice times** in production. The migration that adds them (`20261022130000_incident_timeline.sql`, with `incident_timeline` for staff and `incident_timings` for reviews) is written and tested but not applied, and needs `20261017210300_agent_health.sql` first. Until both are live, write them at the start of the impact and fix text: `SEV2. Detected 2026-11-03 14:05 UTC. Contained 15:20 UTC.`

## Testing this plan

Once a year, a one-hour tabletop: walk a SEV1 scenario (a leaked service role key, or a vendor breach) through these steps, time each one, and log it in [RECORDS.md](../RECORDS.md#tabletop).

## How we prove it

1. The incident log: every entry with its severity, times, impact and fix (`supabase.incidents` in the evidence bundle counts them and flags any without a fix).
2. Post-incident reviews and their linked pull requests.
3. Customer notices, kept in the support mailbox.
4. The yearly tabletop record.
