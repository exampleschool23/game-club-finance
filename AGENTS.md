# Game Club Finance agent guide

This file is the short operating guide for coding agents. Read only the linked
guide relevant to the task; do not load every document or migration by default.

## Project map

- `src/app`: Next.js App Router pages and API routes.
- `src/components`: shared layout, UI, dashboard, and i18n components.
- `src/lib/calculations`: pure financial and inventory calculations. Reuse these
  functions instead of recreating formulas in components.
- `src/lib/supabase`: browser, server, and service clients plus query helpers.
- `src/lib/telegram`: daily report assembly, rendering, transport, and delivery.
- `src/messages/{en,ru,uz}.json`: all user-facing translations.
- `supabase/migrations`: the ordered production schema and database behavior.
- `scripts`: explicitly invoked maintenance and preview scripts.

## Read by task

| Task | Read |
|---|---|
| Runtime structure or data flow | `docs/agents/architecture.md` |
| Totals, reports, owner money, or financial definitions | `docs/agents/domain-finance.md` |
| Products, purchases, or closing stock | `docs/agents/inventory.md` |
| Tables, RLS, RPCs, auth, or migrations | `docs/agents/database.md` |
| Verification strategy | `docs/agents/testing.md` |
| Telegram reports, cron, retries, or deployment | `docs/runbooks/telegram-report.md` |

## Non-negotiable invariants

1. Scope every club-owned read and write to the selected `club_id`. UI state is
   not an authorization boundary; Supabase RLS and database constraints are.
2. A club's current date is its business date. Use `todayIso`,
   `currentYearMonth`, and related helpers from `src/lib/utils.ts`; do not add an
   ad hoc UTC or calendar-date implementation.
3. Use functions from `src/lib/calculations` as the canonical application
   formulas. Keep accounting profit separate from cash-left calculations.
4. Use the established atomic RPCs for inventory, closing stock, club creation,
   and owner withdrawals. Do not replace them with multiple browser writes.
5. Debts and debt payments are append-only accounting ledgers. A payment insert
   updates its parent through database logic; application users must not rewrite
   or erase that history.
6. Saved historical stock counts are accounting snapshots. Do not silently
   recompute them from later edits to purchase metadata.
7. The retired `income_transactions`, `expense_transactions`, and
   `cash_movements` tables are historical/read-only. New finance writes use the
   current ledgers listed in `docs/agents/database.md`.
8. Preserve migration compatibility fallbacks unless the task explicitly proves
   every deployed database has the required migration and removes the fallback
   as a coordinated change.
9. Add a new uniquely numbered migration for database changes. Never rewrite an
   already-applied migration to alter production state. Apply all migrations in
   order; `001_initial_schema.sql` is not a complete schema by itself.
10. When visible copy changes, update `en.json`, `ru.json`, and `uz.json`
    together and preserve matching message shapes.
11. Never expose `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, Telegram tokens, or
    private environment values to client code, logs, fixtures, or documentation.

## Implementation conventions

- Prefer `@/` imports for `src` modules.
- Keep business logic pure and tested under `src/lib`; components should mainly
  coordinate queries, state, and rendering.
- Use `src/lib/supabase/client.ts` only in browser code,
  `src/lib/supabase/server.ts` in authenticated server code, and
  `src/lib/supabase/service.ts` only in trusted server-only operations.
- Server authentication must validate with `auth.getUser()` rather than trusting
  a cookie session payload.
- Use `fetchAllRows` when a query can exceed Supabase's 1,000-row response cap.
- Keep payment methods within the club-configured subset of `cash`, `terminal`,
  and `card`; normalize through `src/lib/paymentMethods.ts`.
- Preserve unrelated user changes in a dirty working tree.

## Verification

Run the narrowest relevant test first, then broaden according to risk:

```bash
npx vitest run path/to/relevant.test.ts
npm run typecheck
npm run lint
npm test
npm run build
```

Financial, authorization, migration, configuration, or cross-route changes
normally require the full four quality checks. See `docs/agents/testing.md` for
the change-to-test matrix and manual checks.

