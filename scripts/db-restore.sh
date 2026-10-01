#!/usr/bin/env bash
# Restore an encrypted nightly dump into a NEW, empty Supabase project.
# Rehearse on a scratch project first; see docs/runbooks/database-backup.md.
# Usage: AGE_IDENTITY_FILE=key.txt scripts/db-restore.sh <backup.dump.age> <target-db-url>
# Optional: PG_RESTORE and PSQL (client paths, version 17 or newer).
set -euo pipefail

[ $# -eq 2 ] || { echo "Usage: AGE_IDENTITY_FILE=key.txt $0 <backup.dump.age> <target-db-url>" >&2; exit 1; }
[ -n "${AGE_IDENTITY_FILE:-}" ] || { echo "Set AGE_IDENTITY_FILE to your age private key file." >&2; exit 1; }

backup="$1" target="$2"
pg_restore_bin="${PG_RESTORE:-pg_restore}" psql_bin="${PSQL:-psql}"
for tool in age "$pg_restore_bin" "$psql_bin"; do
  command -v "$tool" > /dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done
sql() { "$psql_bin" "$target" -X -q -v ON_ERROR_STOP=1 -At "$@"; }

# Never restore over a live database: the target must have no club tables and no accounts.
existing="$(sql -c "select (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','p'))
  + (select count(*) from auth.users)")"
[ "$existing" = 0 ] || { echo "Target already has tables in public or users in auth; use a new, empty project." >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"
age -d -i "$AGE_IDENTITY_FILE" "$backup" > "$work/backup.dump"
"$pg_restore_bin" --list "$work/backup.dump" > "$work/toc.txt"

# 1. Sign-in accounts, data only. The app's auth.users trigger is not there yet, so
#    restoring accounts creates no duplicate profiles; profiles come with public data.
#    The list runs in file order; users must precede identities, which reference them.
for table in users identities; do
  grep -E "^[0-9]+; [0-9]+ [0-9]+ TABLE DATA auth ${table} " "$work/toc.txt" \
    || { echo "Backup has no auth.${table} data." >&2; exit 1; }
done > "$work/auth.list"
"$pg_restore_bin" --dbname="$target" --data-only --single-transaction --use-list="$work/auth.list" "$work/backup.dump"
echo "Restored accounts."

# 2. Every public object, row, policy and grant, plus the app's own triggers on auth tables.
#    Supabase owns the public schema and its default privileges, so those entries are skipped.
supabase_triggers="$(sql -c "select string_agg(tgname, '|') from pg_trigger
  where tgrelid in (select oid from pg_class where relnamespace = 'auth'::regnamespace) and not tgisinternal")"
grep -E '^[0-9]+; [0-9]+ [0-9]+ [A-Z ]+ public ' "$work/toc.txt" | grep -v ' DEFAULT ACL ' > "$work/app.list"
grep -E '^[0-9]+; [0-9]+ [0-9]+ TRIGGER auth [a-z_]+ [A-Za-z0-9_]+ ' "$work/toc.txt" \
  | { if [ -n "$supabase_triggers" ]; then grep -vE " TRIGGER auth [a-z_]+ (${supabase_triggers}) "; else cat; fi; } \
  >> "$work/app.list" || true

# pg_dump records grants relative to Postgres defaults, but Supabase also grants anon,
# authenticated and service_role on every new public object. Pause those defaults so a
# revoked grant stays revoked, and put them back afterwards for future migrations.
defaults() {
  sql -c "alter default privileges in schema public $1 all on tables $2 anon, authenticated, service_role;
    alter default privileges in schema public $1 all on sequences $2 anon, authenticated, service_role;
    alter default privileges in schema public $1 all on functions $2 anon, authenticated, service_role;"
}
defaults revoke from
trap 'defaults grant to || true; rm -rf "$work"' EXIT
"$pg_restore_bin" --dbname="$target" --no-owner --single-transaction --use-list="$work/app.list" "$work/backup.dump"
echo "Restored club data, policies, functions and grants."

sql -c "select 'auth.users: ' || count(*) from auth.users"
echo "Restore finished. Next: run scripts/db-compare.sh against the source, then follow the runbook's after-restore steps."
