# Database and authorization guide

Read this before changing Supabase queries, RPCs, RLS, membership behavior, or
migrations.

## Current application tables

| Table | Purpose | Important behavior |
|---|---|---|
| `profiles` | Global user identity/profile | Global role is not a substitute for club membership. |
| `clubs` | Club configuration | Holds business-day start and enabled payment methods. |
| `club_memberships` | Per-club role/access | Holds role and optional `feature_access`. |
| `products` | Catalog/live balance | Soft deletion preserves ledger history. |
| `stock_purchases` | Inventory purchase ledger | Write through inventory RPCs. |
| `daily_stock_counts` | Daily bar/accounting snapshots | Save through closing RPC. |
| `daily_cash_entries` | Game-club collections | Owners/admins write under time/role rules. |
| `expenses` | Current expense ledger | Includes `payment_source` and payment method. |
| `new_debts` | Debt principal ledger | Append-only to application users. |
| `debt_payments` | Debt collection ledger | Append-only; trigger updates parent. |
| `owner_withdrawals` | Monthly/source withdrawals | Insert through the take-all RPC. |
| `telegram_report_deliveries` | Service-only delivery state | Never expose to browser roles. |

Retired read-only ledgers: `income_transactions`, `expense_transactions`, and
`cash_movements`.

## Authorization model

Authorization has three layers:

1. Authenticated Supabase user.
2. Membership and role for the specific `club_id`.
3. Optional per-membership feature access.

`src/lib/permissions.ts` controls navigation and client access behavior.
Migration 033 applies corresponding RLS policies to reads and writes. UI checks
improve UX; RLS and database constraints remain authoritative.

Migration 054 keeps the same read feature unions but obtains permitted club IDs
through `current_user_readable_clubs(text[])` once per statement. It delegates
to the existing membership feature helper and never accepts a caller-supplied
user ID. Keep the policy subquery uncorrelated: passing each ledger row's club
into a permission function repeats membership work across history scans.
Stock insert/update/delete policies retain 033's predicates, but are separate
operations so the old `FOR ALL` write checks no longer run during SELECT.
`ledgerReadPermissions.test.ts` executes the original and new policies in local
PostgreSQL and compares read/write results, cross-club denial, and the query plan.

Owner-only behavior includes team management and destructive/sensitive finance
operations. At least one owner must remain in a club.

## Client selection

- Browser: `src/lib/supabase/client.ts`; respects the user's RLS.
- Authenticated server: `src/lib/supabase/server.ts`; validate using
  `auth.getUser()`.
- Service role: `src/lib/supabase/service.ts`; trusted server-only tasks. Because
  it bypasses RLS, explicitly scope every query and validate external inputs.

## Application RPCs

| RPC | Purpose |
|---|---|
| `create_club_with_owner` | Atomically create a club and its owner membership. |
| `record_stock_purchase` | Insert purchase and update stock/cost safely. |
| `delete_stock_purchase` | Remove a purchase and repair inventory safely. |
| `save_closing_stock_counts` | Save/validate daily counts and historical chain. |
| `withdraw_owner_money_for_month` | Atomically withdraw a custom amount for one month/source, or allocate across both sources. |
| `take_all_owner_money_for_month` | Atomically take one month/source remainder. |
| `get_dashboard_snapshot` | Efficient dashboard payload. |
| `get_dashboard_bootstrap` | Authenticated profile, memberships, and club configuration in one payload. |
| `get_finance_report_snapshot` | Selective, date-bounded finance ledgers for report/detail screens. |
| `get_latest_stock_closings` | Latest product closing values before a date. |
| Delivery ledger RPCs | Claim, begin dispatch, and complete Telegram delivery. |

PostgreSQL functions execute as `PUBLIC` unless restricted. Security-definer
functions must set a safe `search_path`, validate actor/club access, and have
explicit grants/revokes. Follow the patterns in the latest migrations.

## Pagination and query rules

Supabase commonly caps responses at 1,000 rows. Use `fetchAllRows` for complete
period/history totals. Build each page of a paginated query with the same
filters and deterministic ordering.

Always include `club_id` in browser and service-role queries for club-owned
tables, even when RLS would also filter it.

## Migration workflow

1. Inspect the latest migrations affecting the same objects; later migrations
   may deliberately replace early definitions.
2. Add a new SQL file with the next unique numeric prefix.
3. Make the final state safe for databases with all prior migrations applied.
4. Preserve data and ledger history; use an explicit audited repair when needed.
5. Restrict function execution and test important SQL text/behavior patterns.
6. Apply all committed migrations in order with `supabase db push`.
7. Coordinate database-first deployment when new application code requires a
   new function, column, constraint, or delivery ledger state.

Do not edit an old migration to fix a deployed database. Do not run only
`001_initial_schema.sql` when building a new environment.

## Compatibility fallbacks

Some membership selects retry without newer columns, and performance RPC reads
temporarily fall back to table queries. These handle application/database
deployment skew. Removal requires a deliberate cleanup after deployment state
is known, along with updates to fallback tests.

## Settings migration health

Owners can run the read-only Settings health check after applying
`052_migration_health.sql`. The RPC authorizes the selected club's owner before
reading metadata. It returns recorded migration versions and direct function
checks for 050/051; it never invokes a withdrawal RPC or returns function bodies.
SQL Editor execution may not populate `supabase_migrations.schema_migrations`,
so an unrecorded version is **unconfirmed**, not proof of a missing migration.
Exact function-body fingerprints identify a match to this app version; different
bodies require review, including harmless manual formatting changes.

When adding a migration, update `src/lib/supabase/migrationManifest.json` with its
filename. The manifest test checks that no committed migration is omitted. When
replacing a checked function in a future migration, add a new migration updating
the diagnostic fingerprints and their tests together.

For an existing withdrawal RPC that blocks manual execution of 051, use
`scripts/repair-051-custom-owner-withdrawals.sql` to apply its two definitions in
one transaction, then apply 052. The repair script preserves ledger rows and
does not update CLI migration history. Do not mark a version applied solely
because one function exists.
