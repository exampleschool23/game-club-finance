#!/usr/bin/env bash
# Apply the committed migrations in migrations/ in order and record each one in
# supabase_migrations.schema_migrations, the history the Supabase CLI and the Settings
# migration health check read. See README.md and docs/agents/database.md.
# Usage: scripts/db-migrate.sh <db-url> [--dry-run]
#        scripts/db-migrate.sh <db-url> --mark-applied <version>
# Optional: PSQL (client path), MIGRATIONS_DIR (default: the repository's migrations/).
set -euo pipefail

usage="Usage: $0 <db-url> [--dry-run | --mark-applied <version>]"
[ $# -ge 1 ] || { echo "$usage" >&2; exit 1; }
target="$1" mode="${2:-apply}"
case "$mode" in
  apply|--dry-run) [ $# -le 2 ] || { echo "$usage" >&2; exit 1; } ;;
  --mark-applied) [ $# -eq 3 ] || { echo "$usage" >&2; exit 1; } ;;
  *) echo "$usage" >&2; exit 1 ;;
esac
dir="${MIGRATIONS_DIR:-$(cd "$(dirname "$0")/.." && pwd)/migrations}"
psql_bin="${PSQL:-psql}"
command -v "$psql_bin" > /dev/null || { echo "Missing tool: $psql_bin" >&2; exit 1; }
sql() { "$psql_bin" "$target" -X -q -v ON_ERROR_STOP=1 -At "$@"; }

# Versions are the numeric filename prefix, as the Supabase CLI parses them.
local_files="$(cd "$dir" && ls -1 | { grep -E '^[0-9]+_[A-Za-z0-9_]+\.sql$' || true; } | sort -n)"
[ -n "$local_files" ] || { echo "No migrations found in $dir." >&2; exit 1; }
duplicates="$(cut -d_ -f1 <<< "$local_files" | uniq -d)"
[ -z "$duplicates" ] || { echo "Duplicate migration versions: $duplicates" >&2; exit 1; }

sql -c "set client_min_messages = warning;
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations
    (version text not null primary key, statements text[], name text);"
recorded="$(sql -c "select version from supabase_migrations.schema_migrations order by length(version), version")"
is_recorded() { grep -qx "$1" <<< "$recorded"; }

if [ "$mode" = --mark-applied ]; then
  file="$(grep -E "^$3_" <<< "$local_files" || true)"
  [ -n "$file" ] || { echo "No migration with version $3 in $dir." >&2; exit 1; }
  name="${file#*_}"
  sql -v version="$3" -v name="${name%.sql}" <<< "insert into supabase_migrations.schema_migrations (version, name)
    values (:'version', :'name') on conflict (version) do nothing"
  echo "Recorded $file as applied without running it."
  exit 0
fi

unknown="$(grep -vxF -f <(cut -d_ -f1 <<< "$local_files") <<< "$recorded" || true)"
[ -z "$unknown" ] || { echo "The database records versions missing from $dir: $(echo $unknown). Pull the latest code first." >&2; exit 1; }

pending=""
while read -r file; do is_recorded "${file%%_*}" || pending+="$file"$'\n'; done <<< "$local_files"
pending="${pending%$'\n'}"
[ -n "$pending" ] || { echo "Database is up to date ($(wc -l <<< "$local_files" | tr -d ' ') migrations)."; exit 0; }

# A gap means migrations were run by hand (for example in the SQL editor) without being
# recorded. Re-running them could duplicate or undo later changes, so a person must
# verify each one and record it with --mark-applied before anything new is applied.
latest="$(tail -n 1 <<< "$recorded")"
tables="$(sql -c "select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','p')")"
gaps=""
if [ -n "$latest" ]; then
  while read -r file; do (( 10#${file%%_*} < 10#$latest )) && gaps+=" ${file%%_*}"; done <<< "$pending"
elif [ "$tables" != 0 ]; then
  gaps=" (no history recorded, but public already has $tables tables)"
fi
if [ -n "$gaps" ]; then
  echo "Unrecorded earlier migrations:$gaps" >&2
  echo "Confirm each is applied, record it with: $0 <db-url> --mark-applied <version>, then rerun." >&2
  exit 1
fi

echo "Pending migrations:"; echo "$pending"
[ "$mode" = --dry-run ] && exit 0

# Each file and its history row commit together, so a failed migration is not recorded.
# psql substitutes :'variables' in files and stdin, not in -c strings.
while read -r file; do
  name="${file#*_}"
  echo "Applying $file"
  sql -1 -v version="${file%%_*}" -v name="${name%.sql}" -f "$dir/$file" -f - \
    <<< "insert into supabase_migrations.schema_migrations (version, name) values (:'version', :'name');"
done <<< "$pending"
echo "Applied $(wc -l <<< "$pending" | tr -d ' ') migrations."
