# 🎮 Game Club Finance

Finance & Accounting web app for a game club.  
**Stack:** Next.js 14 · Supabase · TypeScript · Tailwind CSS · Recharts

---

## Quick Start

### 1. Clone & install

```bash
git clone <your-repo>
cd game-club-finance
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/migrations/001_initial_schema.sql` in the **SQL Editor**
3. Copy your project URL and keys

### 3. Configure env

```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### 4. Create the first owner user

In Supabase Dashboard → Authentication → Users → Add User.  
Then update their profile role:

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
| **Dashboard** | Today & month KPIs, all balance accounts |
| **Add Income** | Cash / Terminal / QR / Transfer / Debt |
| **Add Expense** | 11 categories, 3 payment sources |
| **Daily Report** | Last 31 days, income by method, expense by category |
| **Monthly Report** | Charts (bar + pie), Excel/CSV export |
| **Balance** | Cash movements (deposit/withdraw/correction) |
| **Debts** | Customer debts, mark as paid with method selection |

## Roles

| Role | Can do |
|---|---|
| **owner** | Everything |
| **admin** | Add income & expense, view all reports, manage balance |
| **cashier** | Add income, view today's report |

## Localization

Switch language from the sidebar footer: **RU / UZ / EN**
