# Runbook: keep a year of platform logs, and review them weekly

| | |
| --- | --- |
| Who runs it | The founder (setup changes live accounts); the weekly review is the security lead's |
| Time | 1 hour to set up; 15 minutes a week to review |
| Cost | Option A: storage only, cents to a few dollars a month. Option B: $60 a month per drain plus usage |
| Closes | SOC 2 CC7.2c, CC7.3a (evidence); ISO/IEC 27001:2022 A.8.15, A.8.16, A.5.28; FedRAMP AU-6, AU-9, AU-11 |
| Policy | [logging-monitoring.md](../policies/logging-monitoring.md) |
| Status on 2026-10-22 | **Supabase keeps 1 day of platform logs on the current Free plan** (7 on Pro). Nothing is kept longer. The export code is in the repo and tested against a stand-in for the API; it has never run against production |

## What we keep, and for how long

| Log | Supabase source | Why we need it | Kept by us |
| --- | --- | --- | --- |
| Sign-ins, token refreshes, password and email changes, two-step events | `auth_logs`, `auth_audit_logs` | Who signed in, from where, and when: the first question in any account-takeover investigation | 1 year |
| Every server function call: path, status, time | `function_edge_logs` | What reached the server, and what it answered | 1 year |
| What each function printed (errors, warnings) | `function_logs` | Why a call failed | 1 year |
| Every API gateway request (REST, Storage, Auth) | `edge_logs` | Requests that didn't go through a function | 1 year |
| Database statements and errors | `postgres_logs` | Off by default: statements can contain customer data. Add with `--sources` only for a specific investigation | Not kept by default |
| Placetta's own audit trail | `public.audit_log` in the database | Customer-facing record of every action | As long as the workspace exists (decision on retention after deletion is pending: CONTROLS.md C1.2b) |

One year matches what customers' security reviews usually ask for and what ISO/IEC 27001 auditors accept for a company this size. Federal systems need more (OMB M-21-31 sets 12 months active plus 18 months in cold storage for many log types); see [docs/fedramp/feasibility.md](../../fedramp/feasibility.md).

## Option A (recommended now): the hourly export

`.github/workflows/log-export.yml` runs every hour at :23. [scripts/log-export.mjs](../../../scripts/log-export.mjs) reads the hour that ended an hour earlier from the Management API (`GET /v1/projects/{ref}/analytics/endpoints/logs`, ClickHouse SQL on the `logs` table, at most 24 hours a call), writes one gzipped file per source per hour with a manifest of counts and SHA-256 hashes, and the workflow encrypts the folder with the backup age key and uploads it. A run without the secrets only warns.

1. **A bucket that can't forget early.** At the same provider as the off-site backup (or another), create a bucket such as `placetta-logs`, in the United States, with **object lock** and a default retention of **366 days** in compliance mode, and a lifecycle rule that deletes objects after **400 days**. Create a key that can only put objects into it.
2. **A token that can only read logs.** In Supabase, Account, Access Tokens, create a token for this purpose only. If fine-grained tokens are offered, give it just `analytics_logs_read` (the API reference names that permission); if only full-access tokens exist, record that as an exception in [RECORDS.md](../RECORDS.md#exceptions) and rotate it every 90 days.
3. **Secrets.** Each prompt takes the value:

   ```sh
   for s in SUPABASE_LOGS_TOKEN LOG_BUCKET LOG_S3_ENDPOINT LOG_S3_REGION LOG_AWS_ACCESS_KEY_ID LOG_AWS_SECRET_ACCESS_KEY; do
     gh secret set "$s" --repo notlsz/placetta
   done
   ```

   `BACKUP_AGE_RECIPIENT` is shared with the backup ([backup-restore.md](backup-restore.md), step 2).
4. **First run and backfill.** Actions, Log export, Run workflow. Leave the times empty for the usual hour, or backfill what Supabase still keeps: on Free, the last 24 hours (for example from `2026-10-21T04:00Z` to `2026-10-22T04:00Z`); on Pro, run it once per day for the last 7 days. The run summary shows the object and its event count.
5. **Check it.** In the bucket: `logs/YYYY/MM/DD/placetta-logs-<stamp>.tar.age`. Try to delete one with an admin key: the lock must refuse.
6. **Gaps.** A missed hourly run leaves a gap that Supabase still covers for 1 day (Free) or 7 (Pro). The weekly review below lists missing hours; backfill them by hand within the window.

## Option B: a Supabase log drain

Supabase announced log drains for Pro on 5 March 2026: $60 a month per drain per project, $0.20 per million events, $0.09 per GB of egress, to S3, Datadog, Grafana Loki, Axiom, Sentry or any HTTP endpoint ([Supabase blog](https://supabase.com/blog/log-drains-now-available-on-pro)). A drain streams every source as it happens, without gaps, and needs no workflow. Choose it once the company has a log tool where someone looks at alerts; until then option A keeps the same records for much less. If you switch: Project, Settings, Log Drains, add an S3 destination pointing at the locked bucket from step 1, then disable `log-export.yml` (remove its secrets) and record the change.

## The weekly log review (15 minutes, every Monday)

Record it in the monthly review ([RECORDS.md](../RECORDS.md#monthly-review)) with one line a week.

1. **Coverage.** Every hour of the past week has an object in `logs/`. List with the read-only key: `aws s3 ls s3://placetta-logs/logs/2026/10/ --recursive | wc -l` (168 a week). Backfill gaps while Supabase still has them.
2. **Sign-ins.** In the Supabase dashboard's Logs Explorer (the live 1 or 7 days), run:

   ```sql
   select log_attributes['msg'] as msg, count() as n from logs
   where source = 'auth_logs' and timestamp > now() - interval 7 day group by msg order by n desc limit 50
   ```

   Look for spikes in failed sign-ins, password resets you didn't expect, and new two-step factors on staff accounts.
3. **Functions.** Count 5xx answers per function over the week (`function_edge_logs`, `log_attributes['response.status_code']`, cast to a number), and read the newest errors in `function_logs`.
4. **Staff use of saved logins.** In the app's audit trail (or `select count(*) from audit_log where actor = 'team' and action->>'en' like '%opened the saved login%' and created_at > now() - interval '7 days'`), each opening should match a filing.
5. Anything unexplained becomes an incident entry ([incident-response.md](../policies/incident-response.md)).

## In an investigation

```sh
aws s3 cp s3://placetta-logs/logs/2026/10/21/ . --recursive   # with the read-only key
for f in placetta-logs-*.tar.age; do age -d -i placetta-backup-key.txt "$f" | tar -xf -; done
zcat logs/auth_logs/2026/10/21/*.ndjson.gz | jq -c 'select(.event_message | test("user@example.com"))'
sha256sum logs/auth_logs/2026/10/21/14.ndjson.gz   # matches the manifest: the file wasn't changed
```

Work on a copy; keep the original objects untouched (the lock does that anyway) and note in the incident record which objects were read, by whom and when. That is the chain of custody ISO/IEC 27001 A.5.28 asks for.

## Record

| Date | Step | Result | Evidence | By |
| --- | --- | --- | --- | --- |
| | Log bucket with 366-day lock and 400-day lifecycle | | | |
| | Logs-only token; secrets set | | | |
| | First run and backfill | | | |
| | Delete refused by the lock | | | |
| | First weekly review | | | |
