# Production migration audit — 2026-09-09

Project: `game-club-finance`, `vmhpsizkzbtsjblrieie`, production `main`.

## Execution status

Audit completed. Following explicit user approval, migrations 043, 052, and 053
were applied successfully to production in one transaction on 2026-09-09.
The transaction verified that all eight source ledger fingerprints were unchanged.

The transaction applied the repository SQL for 043 and 052, then 053, in order.
It compared whole-row fingerprints of the eight source ledgers before and after
and would roll back on any difference. Only the derived monthly-average
snapshots were intentionally updated. The one-off execution script was discarded
after verification; the numbered migrations remain the source of truth.

## Findings

| Migration(s) | Observed final effects |
| --- | --- |
| 001–016 | Base tables, enums, profile trigger, club ownership columns, memberships, indexes, and current replacements exist. Three old permissive policies survived the migration chain; 053 removes them. |
| 017–026 | Current purchase and closing trigger bodies, business-date helper and date guard, product tracking mode, payment source/method fields, debt constraints, and payment triggers match the intended schema. |
| 027–029 | Monthly owner-withdrawal ledger, constraints, immutable trigger, and monthly helper/take-all functions exist. Retired cumulative functions and the old date/payment-method columns are absent as intended. |
| 030–038 | Latest dashboard, inventory, feature-access, debt-integrity, and Telegram function bodies match. Trigger wiring, RLS policies, explicit privilege restrictions, and constraints were inspected. |
| 039 | Telegram claim function uses the current UUID implementation. |
| 040 | Configured payment-method column and constraint exist. |
| 041 | Function differences are comments/whitespace only. Delivery audit columns, trigger, constraint, and active daily cron match; required Vault secret exists (value not read). |
| 042 | Snapshot table, read policy, restricted grants, and active monthly cron exist. |
| 043 | Applied: both functions now match the repository exactly. Derived snapshots were corrected to the cash/terminal/card-only monthly average and verified against the source entries. |
| 044–045 | Superseded by the matching 050 owner-profit function. |
| 046 | Expense Telegram coordinates and paired-value constraint exist. |
| 047–050 | Function bodies match exactly; authenticated execution is available and anonymous execution is revoked. |
| 051 | Both function bodies match exactly; monthly balance trigger is enabled and the RPC's execution grants are correct. The screenshot error was a duplicate CREATE FUNCTION, not evidence that 051 is absent. |
| 052 | Applied: `get_migration_health(uuid)` matches the repository exactly. Anonymous execution is revoked and authenticated execution is available with the function's owner check. |
| 053 | Applied: removed `admin_owner_insert_cash_entries`, `Viewer can view today income`, and `Viewer can view own debts`. Verified their club-scoped replacements remain. |

All 18 public application tables have RLS enabled. All 26 inspected application
triggers are enabled. The three stock-purchase constraints marked NOT VALID are
intentionally declared that way in 031/034 for legacy compatibility; this alone
does not mean those migrations are missing.

The database has no `supabase_migrations.schema_migrations` table. Consequently,
this audit verifies present schema effects, not historical execution dates or
proof that every one-time data repair ran. Early repairs that alter historical
ledger rows must not be blindly replayed. No fictional applied-history records
were inserted.

## Verification

- Focused migration tests: passed (18 tests).
- Full unit suite: passed (360 tests, 45 files).
- ESLint and TypeScript: passed.
- Production build: passed.
- Production application: committed successfully; all eight source ledger fingerprints unchanged.
- Nine post-application metadata and snapshot checks: all passed.
- Live smoke checks: owner health checks and 12-month chart reads passed for
  every club with an owner; anonymous and non-member health calls were rejected.
  These checks ran inside a rolled-back transaction and made no ledger writes.

The 043/052 body hashes match exactly, 051 remains unchanged and matching,
the three obsolete policies are absent, replacement policies remain, and every
saved monthly-average snapshot agrees with the corrected source aggregation.
