# 🎮 Game Club Finance

Finance & Accounting web app for a game club.  
**Stack:** Next.js 16 · Supabase · TypeScript · Tailwind CSS · Recharts

---

## Quick Start

### 1. Clone & install

Node.js 20.9 or newer is required.

```bash
git clone <your-repo>
cd game-club-finance
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).
3. Link the repository and apply **all** committed migrations in order:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

Do not run only `001_initial_schema.sql`: later migrations contain required
multi-club, inventory, authorization, and reporting changes.

### 3. Configure env

```bash
cp .env.example .env.local
# Fill in the required Supabase values. Configure the optional Telegram block
# only when the scheduled daily report is enabled.
```

### 4. Create the first owner user

In Supabase Dashboard → Authentication → Users → Add User.  
Then promote their profile to the global owner role. Sign in as that user and
create the first club from Settings; the database will create its owner
membership atomically.

```sql
UPDATE profiles SET role = 'owner' WHERE id = '<user-uuid>';
```

### 5. Run

```bash
npm run dev
# open http://localhost:3000
```

---

## Features

| Page | Description |
|---|---|
| **Dashboard** | Daily, monthly, and custom-range KPIs |
| **Daily Cash** | Game-club income by cash, terminal, card, and PlayStation |
| **Expenses** | Categorized expenses with their payment method |
| **Reports** | Income, expenses, and money left by payment method |
| **Daily Report** | Income, bar activity, debts, expenses, and daily result |
| **Monthly Report** | Daily income, expense, and profit summary for a selected month |
| **Debts** | Customer debts and partial payment history |
| **Products & Stock** | Product prices, purchases, daily closings, inventory value, and low-stock alerts |

## Roles

| Role | Can do |
|---|---|
| **owner** | Everything |
| **admin** | Record daily cash and expenses, manage assigned ledgers, and view enabled reports |
| **viewer** | Read dashboards, reports, and ledgers without changing financial data |

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Scheduled Telegram report

The scheduled report is delivered as a generated PNG photo with a two-line
caption. Each configured target is built independently from that club's
Supabase rows:

```text
Supabase data → calculations → SVG → PNG → Telegram sendPhoto → delivery status saved
```

The primary cron runs every day at 01:00 UTC (06:00 in Tashkent) and reports
the previous Tashkent business date. Recovery runs at 02:00 and 03:00 UTC use
the same delivery ledger key, so they do not duplicate a successful photo.

> **Required deployment order:** apply
> `037_telegram_report_delivery_ledger.sql` and
> `038_stock_snapshot_and_payment_method_integrity.sql` to Supabase **before
> the next Telegram cron**—ideally before deploying this application version. If the
> application deploys first, the route fails closed with HTTP 500 and sends
> nothing during that gap; after the migration is applied, a later recovery run
> can safely catch up the same business date.

Vercel calls the primary route at 01:00 UTC, then distinct recovery routes at
02:00 and 03:00 UTC. All three use the same date/target ledger key, so recovery
runs skip successful deliveries and retry only definite image-build or Telegram
failures. Configure `CRON_SECRET`,
`TELEGRAM_BOT_TOKEN`, and at least one complete chat/club target pair from
`.env.example`. The endpoint rejects requests without the exact bearer secret.
`CRON_SECRET` must be a header-safe random string of at least 16 characters;
after changing it in Vercel, redeploy so the scheduler and function use the
same production value.

Migration `037_telegram_report_delivery_ledger.sql` provides the service-only
delivery ledger used to prevent concurrent or repeated scheduled runs from
sending the same target twice. A normal authenticated request is idempotent for
each business date and target.

The route durably marks dispatch before contacting Telegram. A timeout, network
failure, malformed success response, or interrupted post-send finalization has
an unknown outcome and is quarantined as `manual_review`; recovery crons return
HTTP 500 for it and never resend it automatically. Check the Telegram group and
delivery ledger first, then use an explicit forced resend only if the message is
confirmed missing.

An intentional resend must be scoped to exactly one date and target and must
include a new UUID chosen by the caller, for example:

```text
/api/cron/daily-finance-report?date=2026-08-26&target=pixel&force=1&requestId=40c05af5-5a59-45ae-a891-19a18228a721
```

Keep the same `requestId` when retrying that request: it will return the stored
delivery instead of sending again. Use a new UUID only when another Telegram
message is explicitly intended. Forced sends cannot be combined with `dryRun`.

## Localization

Switch language from the sidebar footer: **RU / UZ / EN**
