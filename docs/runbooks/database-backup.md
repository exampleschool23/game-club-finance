# Nightly database backup

A GitHub Actions workflow (`.github/workflows/db-backup.yml`) dumps the Supabase
`public` and `auth` schemas every night at 21:47 UTC (02:47 Asia/Tashkent),
encrypts the dump with [age](https://github.com/FiloSottile/age), uploads it to a
Cloudflare R2 bucket under `game-club-finance/db-backups/`, and deletes dumps in
that prefix older than 30 days (`BACKUP_RETENTION_DAYS`). It runs well clear of
the 01:00 UTC Telegram report.

## One-time setup

1. **age key pair.** Run `age-keygen -o age-key.txt`. The public key (`age1...`)
   goes into GitHub; keep `age-key.txt` in a password manager and nowhere else.
   Without it the backups cannot be read. Reusing the personal-finance key pair
   is fine.
2. **R2 bucket.** Create a private bucket (or reuse an existing one; the
   `game-club-finance/` prefix keeps dumps and pruning separate), then an R2 API
   token with Object Read & Write limited to that bucket. Note the account ID.
3. **Supabase connection string.** Project Settings → Database → Connection
   string → Session pooler (the direct host is IPv6-only and GitHub runners
   cannot reach it). Use this club project's string, not another app's.
4. **GitHub secrets** (Repo → Settings → Secrets and variables → Actions):
   `SUPABASE_DB_URL`, `AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Optional failure alerts:
   `TELEGRAM_BOT_TOKEN` and `BACKUP_ALERT_CHAT_ID`.
5. Run the workflow once from the Actions tab (Run workflow) and confirm a file
   appears in the bucket.

Never commit these values or copy them into `.env.example`, fixtures, or logs.

## Restore (test it once on a scratch database)

Create an empty scratch Postgres or Supabase project, download a dump from R2,
then:

```bash
AGE_IDENTITY_FILE=age-key.txt scripts/db-restore.sh db-2026-10-01T214700Z.dump.age "postgresql://scratch-url"
```

Needs `age` and a `pg_restore` of the same major version as the server.
Restoring into the live database overwrites it, including append-only debt
ledgers and saved stock snapshots; do that only in a real disaster.

## Notes

- GitHub pauses scheduled workflows after 60 days without repository activity.
- Storage buckets are not included; the app does not use Supabase Storage.
- Supabase Cron jobs and Vault secrets live outside `public`/`auth` and are not
  in the dump; recreate them from the [Telegram report runbook](telegram-report.md)
  after a restore.
- Rotating the age key does not re-encrypt old dumps; keep old private keys.
