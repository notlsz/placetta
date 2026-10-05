#!/bin/bash
# Applies every migration to a local Postgres (with just enough of Supabase stubbed in) and runs the database tests.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db.sh      (needs psql and a local Postgres 15+)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=placetta_test
psql -q -c "drop database if exists $DB" -c "create database $DB"
psql -q -d $DB -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stubs.sql
for f in $(ls supabase/migrations/*.sql | sort); do
  sed '/create extension if not exists pg_net/d' "$f" | psql -q -d $DB -v ON_ERROR_STOP=1 -f - >/dev/null
  echo "applied $(basename "$f")"
done
for t in supabase/tests/*.sql; do
  [ "$(basename "$t")" = supabase_stubs.sql ] && continue
  out=$(psql -q -d $DB -f "$t" 2>&1 | sed -n 's/.*TEST_RESULTS //p')
  echo "$out" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));const bad=Object.entries(d).filter(([,v])=>v!==true);for(const [k,v] of Object.entries(d))console.log((v===true?"ok  ":"XX  ")+k);console.log(bad.length?`FAILED ${bad.length}`:`${Object.keys(d).length} checks passed`);process.exit(bad.length?1:0)'
done
psql -q -c "drop database $DB"
