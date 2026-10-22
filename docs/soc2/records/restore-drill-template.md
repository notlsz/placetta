# Quarterly restore drill record (template)

Copy this file to the evidence folder as `YYYY-MM-DD-restore-drill.md` and fill it in during the drill, not afterwards. One per quarter; alternate drill A (the off-site copy) and drill B (Supabase's backup into a new project), with drill B at least once a year. The steps are in [runbooks/backup-restore.md](../runbooks/backup-restore.md). Policy: [backup-disaster-recovery.md](../policies/backup-disaster-recovery.md). An auditor samples these records in a SOC 2 Type II window; ISO/IEC 27001 A.8.13 asks for the same evidence.

```
Restore drill, <YYYY> Q<n>, drill <A or B>
Done <date>, from <start UTC> to <end UTC>, by <name>; witnessed by <name, or "none">

Backup used
  Drill A: object <db/YYYY/MM/placetta-db-<stamp>.tar.age>, taken <manifest taken_at>, Postgres <server_version>
  Drill B: <daily backup of date> or <PITR point, UTC>; new project ref <ref>
Age of the newest backup when the drill started: <hours>        (target: under 24 hours; under 1 hour with PITR)

Timings
  Download and decrypt (A) or restore requested (B):   <time>
  Database ready:                                     <time>
  Checks finished:                                    <time>
  Total minutes: <n>                                  (target: 240)

Results (drill A: paste scripts/restore-test.sh output below; drill B: fill in each line)
  Checksums match:                                     yes / no
  Restore errors, other than "schema public already exists": none / <list>
  Row counts equal to the backup's manifest (A) or to production at the restore point (B): yes / no <tables that differ>
  Row-level security on for every public table:        yes / no <tables>
  Database tests on the copy: <n> passed, <n> known limits, <n> failed <files>
  Migrations in the repo but not in the backup, and why: <versions, e.g. "pending in production, see MIGRATION_DRIFT.md">
  Vault secrets readable in the copy (B only):         yes / no
  One stored file restored from the off-site file copy and opened: <path> / not done because
  Cron jobs unscheduled in the copy within <n> minutes of it starting (B only); calls from the copy seen in production logs: none / <what>

Clean-up
  Scratch database dropped (A) / new project deleted (B) at: <time>
  Decrypted files deleted from the drill machine at: <time>

Problems found, and what changes because of them (each with an owner and a date, or a pull request):

Sign-off: <founder name>, <date>
```

## Script output (drill A)

```
<paste the full output of scripts/restore-test.sh here>
```
