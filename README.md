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

Vercel calls `/api/cron/daily-finance-report` daily. Configure `CRON_SECRET`,
`TELEGRAM_BOT_TOKEN`, and at least one complete chat/club target pair from
`.env.example`. The endpoint rejects requests without the exact bearer secret.

## Localization

Switch language from the sidebar footer: **RU / UZ / EN**
