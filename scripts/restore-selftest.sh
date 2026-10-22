#!/bin/bash
# Proves the backup and restore scripts work, without production: builds a stand-in for the live database from the
# migrations (as scripts/test-db.sh does), adds an account, a workspace and audit rows, backs it up with
# scripts/db-backup.sh, then runs the full restore drill (scripts/restore-test.sh) on that backup. Runs in CI.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres PGPASSWORD=... scripts/restore-selftest.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SRC_DB=placetta_restore_source
OUT=$(mktemp -d)
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
trap 'psql -X -q -c "drop database if exists $SRC_DB" >/dev/null 2>&1 || true; rm -rf "$OUT"' EXIT

psql -X -q -c "drop database if exists $SRC_DB" -c "create database $SRC_DB"
psql -X -q -d $SRC_DB -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stubs.sql >/dev/null
for f in $(ls supabase/migrations/*.sql | sort); do
  sed '/create extension if not exists pg_net/d' "$f" | psql -X -q -d $SRC_DB -v ON_ERROR_STOP=1 -f - >/dev/null
  v=$(basename "$f" | cut -d_ -f1)
  psql -X -q -d $SRC_DB -c "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '$(basename "$f" .sql)') on conflict do nothing" >/dev/null
done
psql -X -q -d $SRC_DB -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'owner@restore.test', now(), now(), now(), '{}', '{}');
insert into auth.identities (user_id, provider) values ('11111111-1111-1111-1111-111111111111', 'email');
insert into public.workspaces (id, name, authorized_at, authorized_by, created_by)
  values ('22222222-2222-2222-2222-222222222222', 'Restore drill tea shop', now(), '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
insert into public.workspace_members (workspace_id, user_id, role) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'owner');
insert into public.audit_log (workspace_id, actor, action, object)
  select '22222222-2222-2222-2222-222222222222', 'you', jsonb_build_object('en', 'Restore drill entry ' || g, 'zh', '恢复演练记录 ' || g), jsonb_build_object('en', 'Drill', 'zh', '演练') from generate_series(1, 25) g;
SQL

DATABASE_URL="postgresql:///$SRC_DB" bash scripts/db-backup.sh "$OUT"
# A tampered backup must be refused before anything is restored.
cp "$OUT/manifest.json" "$OUT/manifest.orig" && echo " " >> "$OUT/manifest.json"
if bash scripts/restore-test.sh "$OUT" >/dev/null 2>&1; then echo "FAIL a backup that doesn't match SHA256SUMS was restored"; exit 1; fi
mv "$OUT/manifest.orig" "$OUT/manifest.json"
echo "ok   a tampered backup is refused"
bash scripts/restore-test.sh "$OUT" ${KEEP_RESTORE:-}
