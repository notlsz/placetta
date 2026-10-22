#!/bin/bash
# A logical backup of Placetta's database, kept off Supabase (docs/soc2/runbooks/backup-restore.md):
#   placetta.dump        pg_dump custom format of Placetta's own schemas, structure and data: public, supabase_migrations
#   auth_*.csv           the sign-in rows those tables point at (users, identities, two-step factors), in the columns a
#                        restore into plain Postgres needs; never passwords, tokens or sessions
#   manifest.json        when, from which server version, and the row count of every public table at dump time
#   SHA256SUMS           fingerprints of all of the above, checked before any restore
# Not in it, by design: Vault secret values (encrypted with a key that never leaves Supabase; a full recovery uses
# Supabase's own backups), storage files (copied separately), Supabase's managed schemas.
# Usage: DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres scripts/db-backup.sh <out-dir>
# Needs pg_dump and psql at the server's major version or newer (17 for production).
set -euo pipefail
OUT=${1:?usage: scripts/db-backup.sh <out-dir>}
: "${DATABASE_URL:?set DATABASE_URL to the connection string of the database (session mode, port 5432)}"
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
export PGCONNECT_TIMEOUT=20

server=$(psql "$DATABASE_URL" -XAtq -c "show server_version")
client=$(pg_dump --version | awk '{print $3}')
if [ "${client%%.*}" -lt "${server%%.*}" ]; then echo "pg_dump $client is older than the server ($server): install the newer client" >&2; exit 1; fi

# Grants are kept on purpose: a copy restored without them would leave every table open to the API roles.
pg_dump "$DATABASE_URL" --format=custom --compress=6 --no-owner \
  --schema=public --schema=supabase_migrations --file="$OUT/placetta.dump"

psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 <<SQL
\copy (select instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, phone, deleted_at, last_sign_in_at, coalesce(is_anonymous, false) as is_anonymous from auth.users order by id) to '$OUT/auth_users.csv' with (format csv, header)
\copy (select id, user_id, provider from auth.identities order by id) to '$OUT/auth_identities.csv' with (format csv, header)
\copy (select id, user_id, friendly_name, factor_type::text, status::text, created_at, updated_at from auth.mfa_factors order by id) to '$OUT/auth_mfa_factors.csv' with (format csv, header)
SQL

# Exact row counts of every public table, so a restore can be checked table by table.
counts=$(psql "$DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 -c "
  select coalesce(json_object_agg(c.relname, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint order by c.relname), '{}'::json)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')")
migrations=$(psql "$DATABASE_URL" -XAtq -c "select coalesce(json_agg(version order by version), '[]'::json) from supabase_migrations.schema_migrations")
auth_users=$(psql "$DATABASE_URL" -XAtq -c "select count(*) from auth.users")
printf '{"taken_at":"%s","server_version":"%s","pg_dump":"%s","auth_users":%s,"tables":%s,"migrations":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$server" "$client" "$auth_users" "$counts" "$migrations" > "$OUT/manifest.json"

(cd "$OUT" && sha256sum placetta.dump auth_users.csv auth_identities.csv auth_mfa_factors.csv manifest.json > SHA256SUMS)
echo "backup written to $OUT ($(du -sh "$OUT" | cut -f1)); $(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(Object.keys(m.tables).length+" tables, "+Object.values(m.tables).reduce((a,b)=>a+b,0)+" rows, "+m.auth_users+" accounts")' "$OUT/manifest.json")"
