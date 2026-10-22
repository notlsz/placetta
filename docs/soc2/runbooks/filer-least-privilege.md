# Runbook: move the portal filer off the service role key

| | |
| --- | --- |
| Who runs it | The founder (applies a migration, deploys the worker, changes Render settings) |
| Time | About 1 hour, plus watching the first portal filing |
| Cost | None |
| Closes | SOC 2 CC6.3 (least privilege), CC6.1; ISO/IEC 27001:2022 A.8.2, A.8.18; FedRAMP AC-6, CM-7. The assessment's rank 19 |
| Status on 2026-10-22 | **Code done, nothing applied.** The filer still holds `SUPABASE_SERVICE_ROLE_KEY` on Render's starter plan |

## What changed in the repo

1. **Its own database role.** [20261022120000_filer_least_privilege.sql](../../../supabase/migrations/20261022120000_filer_least_privilege.sql) creates `placetta_filer`: it can't log in, bypasses no row-level security, and has **no grant on any table**. It can call only the queue functions it already used and ten `filer_*` functions, each limited to filings handed to the portal agent. Safe to run twice.
2. **Audit before password.** `filer_open_login` writes the audit entry, then the opening time, then reads the password from Vault, in one transaction. If the audit entry can't be written, no password leaves the database. Before, the worker read the password first and wrote the audit row afterwards, ignoring a failed write.
3. **The worker uses only those functions** ([worker/filer/src/store.ts](../../../worker/filer/src/store.ts)), and Storage for files. It signs in with `FILER_DB_KEY`, falling back to the service key with a warning so a deploy before the key exists keeps working.
4. **Non-root container.** [worker/filer/Dockerfile](../../../worker/filer/Dockerfile) ends with `USER pwuser`.
5. **Tests.** `supabase/tests/filer_role.sql` (32 checks: no table access, cross-workspace refusals, audit-first with a failing audit log, storage paths), `worker/filer/test/store.test.ts` (every operation goes through a filer function; no password without the audit call), `worker/filer/test/docker.test.ts` (non-root, set after every build step).

## Order matters

The new worker code calls functions that exist only after the migration, so: **migration first, then the worker, then the key.**

## Step 1. Apply the migration (10 minutes)

Through the deploy workflow (preferred, once `SUPABASE_ACCESS_TOKEN` is a repository secret: merging to `main` applies it), or from a clone linked to the project:

```sh
supabase migration list            # check it's the only pending file you mean to apply, after the ones before it
supabase db push
```

Check in the SQL editor:

```sql
select rolname, rolcanlogin, rolbypassrls from pg_roles where rolname = 'placetta_filer';         -- f, f
select count(*) from information_schema.role_table_grants where grantee = 'placetta_filer';        -- 0
select pg_has_role('authenticator', 'placetta_filer', 'member');                                    -- t
select polname from pg_policy where polname like 'filer %';                                         -- 3 rows
```

If the last query returns no rows, the migration printed a notice that Storage refused the grants. Then the role can't read or add files; keep step 3's fallback in mind (below).

## Step 2. Deploy the worker (15 minutes)

Render rebuilds from `render.yaml` on merge to `main` (`autoDeploy: true`). Watch the deploy log: the container now starts as `pwuser`, and the worker prints `FILER_DB_KEY is not set: using the service role key...`. That warning is expected until step 3. Let one portal filing run end to end (or a dry run with `FILER_DRY_RUN=1`) and check its audit trail shows "Placetta opened the saved login for ...".

## Step 3. Make and set the filer's own key (15 minutes)

The key is a JWT naming the role, signed with the project's JWT secret, the same way Supabase makes its own `anon` and `service_role` keys.

1. Supabase, Project settings, JWT Keys (or API, "JWT Secret" on older dashboards): copy the **legacy JWT secret**. If the project has moved to the new asymmetric signing keys and the legacy secret has been revoked, stop here: a custom-role key can't be signed this way. Record it as an open item; the filer keeps the service key until Supabase offers custom-role keys for the new system.
2. On the founder's computer, with the secret only in the environment:

   ```sh
   read -rs SUPABASE_JWT_SECRET && export SUPABASE_JWT_SECRET
   node scripts/mint-role-key.mjs --ref esquxzcfsylffuijvzec --days 365 | pbcopy   # or xclip; never into a file
   unset SUPABASE_JWT_SECRET
   ```

3. Render, `placetta-filer`, Environment: set `FILER_DB_KEY` to the copied key and save. The worker restarts; the warning must be gone from the log.
4. Run one portal filing (or a dry run) again. Then **delete `SUPABASE_SERVICE_ROLE_KEY` from Render**, unless step 1's check showed Storage refused the grants; in that case the worker can't read uploaded files or save receipts on its own key. Keep the service key, record the exception in [RECORDS.md](../RECORDS.md#exceptions), and ask Supabase support how to grant a custom role on `storage.objects`.
5. Put the key's expiry date (printed by the script) in the calendar, 30 days early, and in the access review's machine identities.
6. Record the console change in [RECORDS.md](../RECORDS.md#console-changes) (name of the setting, never the value).

## Step 4. Render's plan

Render's SOC 2 report is available on its Organization tier and above ([vendor-management.md](../policies/vendor-management.md)); `render.yaml` uses `starter`. Either move the workspace to a tier whose report you can obtain, or record the exception with the reason (cost) and the compensating controls now in place: no service key, no table access, non-root container, per-run browser isolation.

## Undo

Set `FILER_DB_KEY` empty on Render and put back `SUPABASE_SERVICE_ROLE_KEY`; the worker falls back with a warning. The migration doesn't need undoing: the service role can call every `filer_*` function too.
