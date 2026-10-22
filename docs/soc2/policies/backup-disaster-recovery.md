# Backup and Disaster Recovery Policy

| | |
| --- | --- |
| Owner | Founder (security lead) |
| Applies to | The Supabase database and file storage, the code, the hosting setup and the secrets needed to rebuild them |
| Review | Every 12 months; the restore test runs every quarter |
| Approved | Not yet: drafted 2026-10-18 for the founder's approval |
| Last reviewed | 2026-10-18 |
| Next review | 2027-10-18 |

## Where we are today (2026-10-18)

**There are no database backups.** The Supabase project is on the Free plan, which has no automatic backups ([Supabase pricing](https://supabase.com/pricing.md): automatic backups "Not included" on Free); Supabase's own advice for Free projects is to export with `supabase db dump` and keep the copies elsewhere ([Database backups](https://supabase.com/docs/guides/platform/backups.md)). Nobody has been doing that. The trust page and the Privacy Policy both say we don't keep backups yet, which is true.

If the database were lost today, every workspace, document record, audit entry and vault secret would be lost with it. The code would survive (GitHub and every clone), and so would the files' hosting setup, but not the data.

## The plan

| What | How | Cost (checked 2026-10-18) | Who |
| --- | --- | --- | --- |
| Daily backups, kept 7 days | Supabase Pro plan | $25 a month, which includes $10 of compute credit ([pricing](https://supabase.com/pricing.md)) | Founder |
| Point-in-time recovery, 7 days | The PITR add-on, which needs at least the Small compute size ([backups](https://supabase.com/docs/guides/platform/backups.md)) | $100 a month for PITR, plus Small compute at $15 a month (the Pro credit covers $10 of it) | Founder |
| Copies of uploaded files | Database backups don't include Storage objects ("Database backups do not include objects you store via the Storage API", [backups](https://supabase.com/docs/guides/platform/backups.md)). Every Sunday, `.github/workflows/db-backup.yml` copies the `documents` bucket to a bucket at another provider, encrypted with an age key whose private half stays offline, under object lock | Storage at the other provider, a few dollars a month at today's volume | Code written 2026-10-22, not running until the founder sets it up ([runbook](../runbooks/backup-restore.md), steps 2 and 3) |
| An off-platform copy of the database | Every day, the same workflow runs `scripts/db-backup.sh` (a `pg_dump` of Placetta's schemas with their grants, the sign-in rows they reference, row counts and checksums) and uploads it, encrypted, to the same separate bucket, so a Supabase account problem can't take the backups with it | Included above | Code written 2026-10-22, not running until set up |
| Secrets | Every value in Supabase function secrets, Render and Vercel lives in the company password manager too; the evidence bundle lists the secret names to check against | The password manager's plan | Founder |
| Code and config | GitHub, plus every clone; Vercel keeps past deployments for instant rollback | Already paid | In place |

In total, about $130 a month for Supabase (Pro, Small compute and PITR), plus a small amount for the second bucket. The Privacy Policy must say, before backups start, how long deleted data can stay in them (7 days with this plan).

## Recovery targets

| | Target once the plan is in place | Today |
| --- | --- | --- |
| Database: how much data we can lose (RPO) | Minutes, with PITR | Everything |
| Database: how long to be back (RTO) | 4 hours | Not possible |
| Uploaded files (RPO) | 7 days, with the weekly copy | Everything |
| The site and app | 15 minutes: Vercel instant rollback, or a redeploy from `main` | Same |
| Server functions | 30 minutes: redeploy from git | Same |
| The portal filer | 1 hour: Render rebuilds from the repo (`render.yaml`) | Same |

## The quarterly restore test

In the second week of each quarter, once backups exist, run one of the two drills in [runbooks/backup-restore.md](../runbooks/backup-restore.md) and fill in [records/restore-drill-template.md](../records/restore-drill-template.md): drill A restores the off-site copy into a scratch Postgres with `scripts/restore-test.sh`, which checks it and runs the database tests on it; drill B, at least once a year, is the one below. A copy restored from Supabase's backup starts its scheduled jobs at once and they call production, so the runbook unschedules them first.

1. Restore the latest backup, or a point in time from the day before, into a **new** Supabase project, never over production.
2. Check it: row counts for `workspaces`, `documents`, `audit_log`, `filings` against production; row-level security on every public table; one test vault secret decrypts in the restored project (if it doesn't, write down how vault keys survive a restore: that is the answer we need before a real disaster).
3. Restore one file from the bucket copy and open it.
4. Time each step against the RTO above.
5. Delete the test project, and record the result in [RECORDS.md](../RECORDS.md#restore-test).

A failed or skipped test is a SEV3 incident.

## How we prove it

1. The evidence bundle's `supabase.backups` source: whether point-in-time recovery is on, how many backups exist, and the latest.
2. The quarterly restore test records, with times.
3. The bucket copy's listing, dated.
