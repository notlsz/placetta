#!/bin/bash
# Restore drill for the off-Supabase backup (docs/soc2/runbooks/backup-restore.md): restores a folder written by
# scripts/db-backup.sh into a scratch database on a local Postgres, checks it, runs the database tests on it, prints
# a summary for the quarterly drill record (docs/soc2/records/restore-drill-template.md), and drops the scratch copy.
#
#   1. the files match SHA256SUMS
#   2. Supabase's sign-in tables (stubbed as in CI) get the backup's accounts, then pg_restore loads public and
#      supabase_migrations with their grants; any restore error other than the expected "schema public already exists"
#      fails the drill
#   3. every public table has the row count the manifest recorded at dump time
#   4. every public table has row-level security on
#   5. the repo's database tests (supabase/tests) run against the restored copy. Each test raises at its end, so
#      nothing it writes is kept. A test for a migration the backup doesn't contain yet fails: the summary lists the
#      migrations in the repo that the backup lacks, so the drill record can say why
#
# Usage: PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=... scripts/restore-test.sh <backup-dir> [--keep]
# Needs psql and pg_restore at the backup's major version or newer, and node. Never point it at production: it only
# ever creates and drops its own scratch database.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=${1:?usage: scripts/restore-test.sh <backup-dir> [--keep]}
KEEP=${2:-}
SRC=$(cd "$SRC" && pwd)
DB=${RESTORE_DB:-placetta_restore_$(date -u +%Y%m%d%H%M%S)}
case "$DB" in placetta_restore_*) ;; *) echo "RESTORE_DB must start with placetta_restore_ (it is dropped at the end)" >&2; exit 1 ;; esac
LOG=$(mktemp -d)
t0=$(date +%s)
fail=0
note() { echo "$*"; }

note "Restore drill $(date -u +%Y-%m-%dT%H:%M:%SZ) from $SRC into $DB on ${PGHOST:-local}:${PGPORT:-5432}"
(cd "$SRC" && sha256sum --quiet -c SHA256SUMS) || { echo "FAIL checksums: the backup files don't match SHA256SUMS" >&2; exit 1; }
note "ok   checksums match"

psql -X -q -v ON_ERROR_STOP=1 -c "drop database if exists $DB" -c "create database $DB"
cleanup() { if [ "$KEEP" != "--keep" ]; then psql -X -q -c "drop database if exists $DB" || true; fi; rm -rf "$LOG"; }
trap cleanup EXIT

psql -X -q -d "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stubs.sql >/dev/null
# The backup brings its own migration history; the stub's empty copy would only collide with it.
psql -X -q -d "$DB" -v ON_ERROR_STOP=1 -c "drop schema supabase_migrations cascade" >/dev/null
# The stub grants every new public object to the API roles by default, as Supabase does. pg_dump writes each object's
# grants as changes from Postgres's built-in default, so with those defaults in place a revoked function would come back
# executable by signed-in users. Restore onto Postgres's own defaults; the dump then sets every grant exactly as it was.
psql -X -q -d "$DB" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public revoke all on functions from anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
SQL
psql -X -q -d "$DB" -v ON_ERROR_STOP=1 <<SQL
\copy auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, phone, deleted_at, last_sign_in_at, is_anonymous) from '$SRC/auth_users.csv' with (format csv, header)
\copy auth.identities (id, user_id, provider) from '$SRC/auth_identities.csv' with (format csv, header)
\copy auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) from '$SRC/auth_mfa_factors.csv' with (format csv, header)
SQL
t_auth=$(date +%s)

# Grants are restored, not skipped: without them the stub's default privileges would leave every table open to the
# API roles, and the copy would pass for working while being wide open. Every role the dump grants to (Supabase's own,
# the backup and filer roles) is created here as a stand-in without login, so each grant lands as it was.
pg_restore -f - "$SRC/placetta.dump" | grep -E '^(GRANT|REVOKE) ' | sed -E 's/ WITH GRANT OPTION//; s/.* (TO|FROM) (.*);$/\2/' \
  | tr ',' '\n' | sed -E 's/^ +//; s/"//g' | grep -vx PUBLIC | sort -u > "$LOG/roles.txt"
while read -r r; do
  [ -z "$r" ] && continue
  psql -X -q -v ON_ERROR_STOP=1 -v r="$r" <<'SQL' >/dev/null
select format('create role %I nologin', :'r') where not exists (select 1 from pg_roles where rolname = :'r') \gexec
SQL
done < "$LOG/roles.txt"
pg_restore --no-owner -d "$DB" "$SRC/placetta.dump" 2> "$LOG/restore.err" || true
unexpected=$(grep -E "^pg_restore: error:" "$LOG/restore.err" | grep -v 'schema "public" already exists' || true)
if [ -n "$unexpected" ]; then
  fail=1; echo "FAIL restore: $(echo "$unexpected" | wc -l) unexpected error(s):"; echo "$unexpected" | head -20
else
  note "ok   restore finished with no unexpected errors"
fi
t_restore=$(date +%s)

# Row counts against the manifest, and row-level security on every public table.
psql -X -At -d "$DB" -v ON_ERROR_STOP=1 -c "
  select coalesce(json_object_agg(c.relname, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint), '{}'::json)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p')" > "$LOG/counts.json"
psql -X -At -d "$DB" -v ON_ERROR_STOP=1 -c "
  select coalesce(json_agg(c.relname order by c.relname), '[]'::json) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity" > "$LOG/no_rls.json"
psql -X -At -d "$DB" -c "select coalesce(json_agg(version order by version), '[]'::json) from supabase_migrations.schema_migrations" > "$LOG/migrations.json"
ls supabase/migrations/*.sql | sed -E 's#.*/([0-9]+)_.*#\1#' | sort -u > "$LOG/repo_versions.txt"
node -e '
const fs = require("fs"); const [man, got, norls, mig, repo] = process.argv.slice(1);
const m = JSON.parse(fs.readFileSync(man, "utf8")), c = JSON.parse(fs.readFileSync(got, "utf8"));
let bad = 0;
for (const [t, n] of Object.entries(m.tables)) if (c[t] !== n) { bad++; console.log(`FAIL rows ${t}: ${c[t] ?? "missing"} restored, ${n} at dump time`); }
const rows = Object.values(m.tables).reduce((a, b) => a + b, 0);
if (!bad) console.log(`ok   ${Object.keys(m.tables).length} tables, ${rows} rows, the same as at dump time (${m.taken_at}, Postgres ${m.server_version})`);
const nr = JSON.parse(fs.readFileSync(norls, "utf8"));
if (nr.length) { bad++; console.log(`FAIL row-level security off on ${nr.length} public table(s): ${nr.join(", ")}`); } else console.log("ok   row-level security on for every public table");
const have = new Set(JSON.parse(fs.readFileSync(mig, "utf8") || "[]")), missing = fs.readFileSync(repo, "utf8").trim().split("\n").filter(v => !have.has(v));
console.log(missing.length ? `note ${missing.length} migration(s) in the repo are not in the backup history (tests for them will fail): ${missing.join(" ")}` : "ok   the backup history has every migration in the repo");
process.exit(bad ? 1 : 0);
' "$SRC/manifest.json" "$LOG/counts.json" "$LOG/no_rls.json" "$LOG/migrations.json" "$LOG/repo_versions.txt" || fail=1
t_checks=$(date +%s)

# A check that can't pass on this copy by design (it reads a Vault secret, or a storage policy) is listed with its
# reason in scripts/restore-known-limits.txt and reported as a known limit, not a failure. Anything else fails.
passed=0; limited=0; failed=0; failed_files=""; limits=""
for t in supabase/tests/*.sql; do
  f=$(basename "$t")
  [ "$f" = supabase_stubs.sql ] && continue
  out=$(psql -X -q -d "$DB" -f "$t" 2>&1 | sed -n 's/.*TEST_RESULTS //p')
  verdict=$(printf '%s' "$out" | node -e '
    const fs = require("fs"), [file, known] = process.argv.slice(1), raw = fs.readFileSync(0, "utf8").trim();
    const allowed = fs.readFileSync(known, "utf8").split("\n").filter(l => l && !l.startsWith("#")).map(l => l.split("\t"))
      .filter(([f]) => f === file).map(([, c]) => c);
    if (!raw) { console.log(allowed.includes("*") ? "limit whole file" : "fail no results"); process.exit(0); }
    const bad = Object.entries(JSON.parse(raw)).filter(([, v]) => v !== true).map(([k]) => k);
    if (!bad.length) console.log("pass");
    else if (bad.every(k => allowed.includes(k))) console.log("limit " + bad.join("; "));
    else console.log("fail " + bad.filter(k => !allowed.includes(k)).join("; "));
  ' "$f" scripts/restore-known-limits.txt)
  case "$verdict" in
    pass) passed=$((passed + 1)) ;;
    limit*) limited=$((limited + 1)); limits="$limits
     $f: ${verdict#limit }" ;;
    *) failed=$((failed + 1)); failed_files="$failed_files
     $f: ${verdict#fail }" ;;
  esac
done
t_tests=$(date +%s)
if [ "$failed" -eq 0 ]; then note "ok   database tests: $passed files passed, $limited with known limits of this copy only"
else fail=1; note "FAIL database tests: $passed files passed, $limited with known limits, $failed failed:$failed_files"; fi
[ -n "$limits" ] && note "note known limits (scripts/restore-known-limits.txt says why):$limits"

note ""
note "Timings (seconds): accounts $((t_auth - t0)), restore $((t_restore - t_auth)), checks $((t_checks - t_restore)), tests $((t_tests - t_checks)); total $((t_tests - t0))"
[ "$KEEP" = "--keep" ] && note "Scratch database kept: $DB (drop it when done)"
if [ "$fail" -eq 0 ]; then note "RESULT restore drill passed"; else note "RESULT restore drill FAILED"; fi
exit $fail
