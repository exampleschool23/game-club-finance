#!/usr/bin/env bash
# Nightly encrypted dump of the Game Club Finance Supabase database to Cloudflare R2.
# Required env: SUPABASE_DB_URL, AGE_PUBLIC_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
# R2_SECRET_ACCESS_KEY, R2_BUCKET. Optional: BACKUP_KEEP (newest copies kept, default 14), PG_DUMP
# (path to a pg_dump at least as new as the server; the runner ships an older one first on PATH),
# BACKUP_PREFIX (default game-club-finance/db-backups; keeps a shared bucket separated per app).
set -euo pipefail

for name in SUPABASE_DB_URL AGE_PUBLIC_KEY R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  [ -n "${!name:-}" ] || { echo "Missing required variable: $name" >&2; exit 1; }
done

keep="${BACKUP_KEEP:-14}"
[[ "$keep" =~ ^[1-9][0-9]*$ ]] || { echo "BACKUP_KEEP must be a positive whole number." >&2; exit 1; }
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
prefix="${BACKUP_PREFIX:-game-club-finance/db-backups}"
key="${prefix}/db-${stamp}.dump.age"
file="$(mktemp)"
trap 'rm -f "$file"' EXIT

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto
endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# public holds the club data; auth holds the accounts, so restored users can still sign in.
"${PG_DUMP:-pg_dump}" "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges --schema=public --schema=auth \
  | age -r "$AGE_PUBLIC_KEY" > "$file"

# A truncated or empty dump must fail the job instead of looking like a backup.
[ "$(wc -c < "$file")" -gt 1024 ] || { echo "Dump is suspiciously small; aborting." >&2; exit 1; }

aws s3 cp "$file" "s3://${R2_BUCKET}/${key}" --endpoint-url "$endpoint" --only-show-errors
echo "Uploaded ${key} ($(wc -c < "$file") bytes)"

# Keys embed a sortable UTC timestamp, so newest-first order keeps the latest copies.
aws s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "${prefix}/" --endpoint-url "$endpoint" \
  --query "Contents[].Key" --output text \
  | tr '\t' '\n' | grep -E "^${prefix}/db-.+\.dump\.age$" | sort -r | tail -n +"$((keep + 1))" \
  | while read -r old; do
      aws s3 rm "s3://${R2_BUCKET}/${old}" --endpoint-url "$endpoint" --only-show-errors
      echo "Pruned ${old}"
    done || true
