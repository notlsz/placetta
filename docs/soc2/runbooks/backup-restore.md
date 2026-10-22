# Runbook: backups, the off-site copy and the quarterly restore drill

| | |
| --- | --- |
| Who runs it | The founder (steps 1 to 3 change live accounts); anyone with the runbook and the keys can run a drill |
| Time | About 1 hour to switch on backups, 1 to 2 hours for the off-site copy, half a day for the first drill |
| Cost | About $130 a month for Supabase backups (Pro $25, Small compute about $15, PITR 7 days about $100); a few dollars a month for the off-site bucket |
| Closes | SOC 2 CC7.5a, A1.2a, A1.2b, A1.3a; ISO/IEC 27001:2022 A.8.13, A.8.14, A.5.30; FedRAMP CP-9, CP-4 |
| Policy | [backup-disaster-recovery.md](../policies/backup-disaster-recovery.md) (recovery targets: 4 hours to restore, at most 24 hours of data lost; PITR improves the second to minutes) |
| Status on 2026-10-22 | **No backups of any kind.** Nothing in this runbook has been run. The code for the off-site copy and the drill is in the repo and tested in CI against a stand-in database |

Facts about Supabase below come from its documentation, read on 2026-10-22: [Database Backups](https://supabase.com/docs/guides/platform/backups.md) and [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project). Check them again before you buy, because plans change.

## What protects what

| Layer | Protects against | Where it lives | Set up by |
| --- | --- | --- | --- |
| Supabase daily backups (Pro: last 7 days) or **PITR** (any second in the last 7 days; Supabase states a worst-case recovery point of 2 minutes) | A bad migration, a bug that deletes rows, a mistaken click | Supabase | Step 1 |
| **Off-site copy**: an encrypted logical dump every day, uploaded files every Sunday (`.github/workflows/db-backup.yml`) | Losing the Supabase project or account, a provider outage, ransomware on the account | A bucket at a second provider, in a different account | Steps 2 and 3 |
| Storage files | Supabase's backups **don't include Storage objects** ("Database backups do not include objects you store via the Storage API"), so the weekly file copy is their only backup | The off-site bucket | Step 3 |
| Vault secret values (saved agency logins, connected-account tokens) | Restoring with Supabase's own backup into a new project keeps the encryption root key, so they stay readable. The off-site dump can't carry them (the key never leaves Supabase); after a total loss, customers reconnect accounts and re-enter logins | Supabase | Step 1 |

## Step 1. Switch on Supabase backups and PITR (founder, 1 hour)

1. Supabase dashboard, Organization, Billing: move the organization to **Pro**.
2. Project `esquxzcfsylffuijvzec`, Settings, Compute and Disk: choose **Small** or larger (PITR requires at least Small).
3. Project, Database, Backups, Point in Time: enable PITR with **7 days** retention. Note from Supabase's documentation: once PITR is on, daily backups stop; PITR replaces them.
4. Record it in the console change log ([RECORDS.md](../RECORDS.md#console-changes)) with a screenshot of the Backups page.
5. Update the trust page and the Privacy Policy only after the first drill passes (milestone M1 in the readiness assessment). Until then, "We don't keep database backups yet" stays.

## Step 2. Pick the off-site bucket (founder, 30 minutes)

Use a different provider and a different account from Supabase, so one compromised login can't delete both.

1. Create a bucket at AWS S3, Cloudflare R2 or Backblaze B2, in the United States, named for example `placetta-offsite-backups`.
2. Turn on **object lock** (S3 and B2 call it Object Lock; on R2, a bucket lock rule) in compliance or governance mode with **35 days** of retention, and a lifecycle rule that deletes objects after **400 days**. The lock means a stolen key can add copies but not delete the last month of them.
3. Create an access key that can **only put objects** in that bucket (no list, get or delete). The restore uses a different, read-only key that stays offline with the founder.
4. Generate the encryption key pair on the founder's own computer, never on a server:

   ```sh
   age-keygen -o placetta-backup-key.txt     # prints the public key, age1...
   ```

   Store `placetta-backup-key.txt` (the private key) in the company password manager, with emergency access for the named backup person. Store a second copy offline (printed or on an encrypted USB drive in a safe place). Without it, the off-site copy can't be read by anyone, including us.

## Step 3. Connect the workflow (founder, 30 minutes)

1. Create a read-only database role for the dump, in the Supabase SQL editor (it can read, never write):

   ```sql
   create role offsite_backup login password '<a long random password>' bypassrls;
   grant usage on schema public, supabase_migrations, auth to offsite_backup;
   grant select on all tables in schema public, supabase_migrations to offsite_backup;
   grant select on auth.users, auth.identities, auth.mfa_factors to offsite_backup;
   grant select on all sequences in schema public to offsite_backup;
   alter default privileges in schema public grant select on tables to offsite_backup;
   ```

   `bypassrls` is needed so the dump sees every workspace's rows; the role has no write grant. If the project refuses `bypassrls` for a new role, use the `postgres` role's connection string instead and record that as an exception.
2. Copy the **session mode** connection string (port 5432) for that role from Project, Connect.
3. In Supabase, Storage, S3 Connection: create an S3 access key for the weekly file copy. It can read every bucket, so treat it like the service role key.
4. Add the repository secrets (each prompt takes the value; never paste them in a chat):

   ```sh
   for s in SUPABASE_DB_URL BACKUP_AGE_RECIPIENT BACKUP_BUCKET BACKUP_S3_ENDPOINT BACKUP_S3_REGION \
            BACKUP_AWS_ACCESS_KEY_ID BACKUP_AWS_SECRET_ACCESS_KEY \
            SUPABASE_S3_ENDPOINT SUPABASE_S3_REGION SUPABASE_S3_KEY_ID SUPABASE_S3_SECRET; do
     gh secret set "$s" --repo notlsz/placetta
   done
   ```

   `BACKUP_S3_ENDPOINT` is empty for AWS; for R2 it is `https://<account>.r2.cloudflarestorage.com`; for B2 the bucket's S3 endpoint. `SUPABASE_S3_ENDPOINT` is `https://esquxzcfsylffuijvzec.storage.supabase.co/storage/v1/s3`.
5. Run it once by hand: GitHub, Actions, Off-site backup, Run workflow, with "Also copy the uploaded files now" ticked. The run summary names each uploaded object. A run without the secrets only warns and copies nothing.
6. Check the bucket: one `db/YYYY/MM/placetta-db-*.tar.age` object and one `files/...` object.

What the database copy holds, and what it leaves out by design, is written at the top of [scripts/db-backup.sh](../../../scripts/db-backup.sh). It keeps the grants on every table and function: a copy restored without them would leave every table open to the API roles.

## Step 4. The quarterly restore drill

Every quarter, alternate between the two drills below, and fill in a record from [records/restore-drill-template.md](../records/restore-drill-template.md). The auditor samples these records (one a quarter) in a Type II window.

### Drill A: the off-site copy (any quarter; no production risk)

On the founder's computer or any machine with Postgres 17 (`pg_restore` and `psql` 17 or newer) and Node:

```sh
# 1. Download the newest copy with the read-only key
aws s3 cp s3://placetta-offsite-backups/db/2027/01/placetta-db-<stamp>.tar.age .   # add --endpoint-url for R2 or B2
# 2. Decrypt and unpack
age -d -i placetta-backup-key.txt placetta-db-<stamp>.tar.age | tar -xf -
# 3. Restore into a scratch database on a local Postgres 17, check it, run the database tests on it
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=<local password> scripts/restore-test.sh ./db
```

[scripts/restore-test.sh](../../../scripts/restore-test.sh) checks the files against `SHA256SUMS`, restores into a new database named `placetta_restore_<time>`, compares every table's row count with the count taken at dump time, checks row-level security is on for every public table, runs the repo's database tests on the restored copy, prints the timings, and drops the scratch database (`--keep` keeps it). It ends with `RESULT restore drill passed` or `FAILED`. Paste its output into the drill record.

Expected notes, not failures: checks that read a Vault secret or a storage policy are listed with their reasons in [scripts/restore-known-limits.txt](../../../scripts/restore-known-limits.txt); migrations in the repo that production hasn't applied yet are listed by version, and their tests fail until production catches up. Say which in the record.

Delete the decrypted files when done (`rm -rf ./db placetta-db-*.tar.age`): they hold customer data.

### Drill B: Supabase's own backup into a new project (at least once a year)

**Warning first.** A project restored from a physical backup starts its `pg_cron` jobs and `pg_net` calls the moment the restore finishes, and Supabase can't pause them. Placetta's jobs call production's server functions (the monitor, the agent watchdog, the outbox, reminders) with the same keys, because the restored Vault holds them. Left running, the copy could send real texts and emails or file twice. So:

1. Before starting, open the SQL editor of production and list the jobs: `select jobid, jobname, schedule from cron.job order by 1;` Keep the list.
2. In production's dashboard: Database, Backups, **Restore to a New Project**. Pick the newest backup, or a PITR time a few minutes ago. Review the cost shown and confirm. Note the start time.
3. **The moment the new project is up**, open its SQL editor and run:

   ```sql
   select cron.unschedule(jobid) from cron.job;
   delete from net.http_request_queue;
   ```

   Then check the production functions' logs for calls from the copy in that window, and record any.
4. Connect to the copy with its session-mode string and run the same checks as drill A, without restoring anything:

   ```sh
   psql "<copy's connection string>" -c "select count(*) from public.workspaces" -c "select count(*) from public.audit_log"
   psql "<copy's connection string>" -c "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity"
   psql "<copy's connection string>" -c "select count(*) from vault.decrypted_secrets"   # nonzero: saved logins survived
   ```

   Compare the counts with production at the restore point. The second query must return no rows.
5. Storage isn't copied by this route: restore one file from the off-site file copy (drill A's `files/` object) into the copy's `documents` bucket and open it, to prove the files can come back too.
6. Delete the new project (Settings, General, Delete project) and record the time. Never point a customer, a DNS name or a webhook at it.

### Recovering for real

The same steps, except: in a real loss of the database, restore PITR or the daily backup **in place** (Database, Backups) when the project still exists, or into a new project when it doesn't; then repoint the app (`VITE_SUPABASE_URL` in Vercel), the filer (`SUPABASE_URL` on Render) and every webhook at the new project; set the function secrets and redeploy the functions from `main`; apply any migrations the restore point lacks; re-create the storage buckets with the migrations and upload the files from the newest off-site file copy. Follow [incident-response.md](../policies/incident-response.md) throughout.

## Record

| Date | Step | Result | Evidence | By |
| --- | --- | --- | --- | --- |
| | Supabase Pro, Small compute, PITR 7 days on | | | |
| | Bucket with object lock and lifecycle; put-only key; age key stored twice | | | |
| | Backup role created; repository secrets set; first run uploaded both objects | | | |
| | First drill A passed | | | |
| | First drill B passed, cron jobs unscheduled within minutes, copy deleted | | | |
