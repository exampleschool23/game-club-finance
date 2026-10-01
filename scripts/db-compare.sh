#!/usr/bin/env bash
# Compare a restored database with its source: row counts, grants, RLS, policies and triggers.
# Prints only counts and schema metadata, never row contents.
# Usage: scripts/db-compare.sh <source-db-url> <restored-db-url>
set -euo pipefail

[ $# -eq 2 ] || { echo "Usage: $0 <source-db-url> <restored-db-url>" >&2; exit 1; }
psql_bin="${PSQL:-psql}"

read -r -d '' fingerprint <<'SQL' || true
select 'rows ' || c.relname || ' ' || (xpath('/row/n/text()',
  query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
union all select 'rows auth.users ' || count(*) from auth.users
union all select 'rows auth.identities ' || count(*) from auth.identities
union all select 'grant ' || c.relkind::text || ' ' || c.relname || ' ' || coalesce(c.relacl::text, 'default')
  || ' rls=' || c.relrowsecurity
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S')
union all select 'function ' || p.oid::regprocedure || ' ' || coalesce(p.proacl::text, 'default')
  || ' definer=' || p.prosecdef || ' config=' || coalesce(p.proconfig::text, '')
from pg_proc p where p.pronamespace = 'public'::regnamespace
union all select 'policy ' || tablename || ' ' || policyname || ' ' || cmd || ' ' || roles::text
  || ' using=' || coalesce(qual, '') || ' check=' || coalesce(with_check, '')
from pg_policies where schemaname = 'public'
union all select 'trigger ' || t.tgrelid::regclass || ' ' || t.tgname
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.relnamespace in ('public'::regnamespace, 'auth'::regnamespace)
order by 1
SQL

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
"$psql_bin" "$1" -X -At -v ON_ERROR_STOP=1 -c "$fingerprint" > "$work/source.txt"
"$psql_bin" "$2" -X -At -v ON_ERROR_STOP=1 -c "$fingerprint" > "$work/restored.txt"

echo "Checked $(grep -c '^rows ' "$work/source.txt") tables, $(grep -c '^function ' "$work/source.txt") functions, $(grep -c '^policy ' "$work/source.txt") policies."
if diff -u "$work/source.txt" "$work/restored.txt" > "$work/diff.txt"; then
  echo "MATCH: the restored database has the same rows, grants, policies and triggers."
else
  grep -E '^[-+][a-z]' "$work/diff.txt" | sed 's/^-/source:   /; s/^+/restored: /'
  echo "DIFFERENT: see the lines above." >&2
  exit 1
fi
