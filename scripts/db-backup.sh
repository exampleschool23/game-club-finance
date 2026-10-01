#!/usr/bin/env bash
# Nightly encrypted dump of the Game Club Finance Supabase database to Cloudflare R2.
# Required env: SUPABASE_DB_URL, AGE_PUBLIC_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
# R2_SECRET_ACCESS_KEY, R2_BUCKET. Optional: BACKUP_KEEP (newest copies kept, default 14),
# BACKUP_KEEP_MONTHLY (newest monthly copies kept, default 24), PG_DUMP
# (path to a pg_dump at least as new as the server; the runner ships an older one first on PATH),
# BACKUP_PREFIX (default game-club-finance/db-backups; keeps a shared bucket separated per app).
set -euo pipefail

for name in SUPABASE_DB_URL AGE_PUBLIC_KEY R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  [ -n "${!name:-}" ] || { echo "Missing required variable: $name" >&2; exit 1; }
done

keep="${BACKUP_KEEP:-14}"
[[ "$keep" =~ ^[1-9][0-9]*$ ]] || { echo "BACKUP_KEEP must be a positive whole number." >&2; exit 1; }
keep_monthly="${BACKUP_KEEP_MONTHLY:-24}"
[[ "$keep_monthly" =~ ^[1-9][0-9]*$ ]] || { echo "BACKUP_KEEP_MONTHLY must be a positive whole number." >&2; exit 1; }
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
month="${stamp:0:7}"
prefix="${BACKUP_PREFIX:-game-club-finance/db-backups}"
monthly_prefix="${prefix}/monthly"
key="${prefix}/db-${stamp}.dump.age"
file="$(mktemp)"
trap 'rm -f "$file"' EXIT

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto
endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# public holds the club data; auth holds the accounts, so restored users can still sign in.
# Privileges stay in the dump: the migrations revoke access that a restore must not reopen.
"${PG_DUMP:-pg_dump}" "$SUPABASE_DB_URL" --format=custom --no-owner --schema=public --schema=auth \
  | age -r "$AGE_PUBLIC_KEY" > "$file"

# A truncated or empty dump must fail the job instead of looking like a backup.
[ "$(wc -c < "$file")" -gt 1024 ] || { echo "Dump is suspiciously small; aborting." >&2; exit 1; }

aws s3 cp "$file" "s3://${R2_BUCKET}/${key}" --endpoint-url "$endpoint" --only-show-errors
echo "Uploaded ${key} ($(wc -c < "$file") bytes)"

# The first successful dump of each UTC month is also kept as a monthly copy, so a mistake
# noticed weeks later can still be undone. Daily pruning never matches the monthly/ keys.
existing_monthly="$(aws s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "${monthly_prefix}/db-${month}" \
  --endpoint-url "$endpoint" --query 'length(Contents || `[]`)' --output text)"
if [ "$existing_monthly" = 0 ]; then
  aws s3 cp "$file" "s3://${R2_BUCKET}/${monthly_prefix}/db-${stamp}.dump.age" --endpoint-url "$endpoint" --only-show-errors
  echo "Uploaded monthly copy for ${month}"
fi

# Keys embed a sortable UTC timestamp, so newest-first order keeps the latest copies.
prune() { # <key prefix> <copies to keep>
  local dir="$1" keep="$2"
  aws s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "${dir}/" --endpoint-url "$endpoint" \
    --query "Contents[].Key" --output text \
    | tr '\t' '\n' | grep -E "^${dir}/db-.+\.dump\.age$" | sort -r | tail -n +"$((keep + 1))" \
    | while read -r old; do
        aws s3 rm "s3://${R2_BUCKET}/${old}" --endpoint-url "$endpoint" --only-show-errors
        echo "Pruned ${old}"
      done || true
}
prune "$prefix" "$keep"
prune "$monthly_prefix" "$keep_monthly"
