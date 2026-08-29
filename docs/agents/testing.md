# Testing guide

Start narrow for fast feedback, then broaden according to the affected risk.

## Commands

```bash
# One relevant file
npx vitest run src/lib/calculations/stock.test.ts

# Standard full checks
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` runs Vitest in the Node environment. Tests are colocated as
`*.test.ts` or `*.test.tsx` near the behavior they protect.

## Change-to-test matrix

| Change | Minimum focused coverage | Full checks? |
|---|---|---|
| Pure calculation | Matching calculation test | Yes for financial formulas |
| Closing stock/import | `stock.test.ts`, `closingStock.test.ts` | Yes |
| Product purchase/write | `productWrites.test.ts`, stock tests | Yes |
| Dashboard range/totals | dashboard calculation/snapshot tests | Yes |
| Debt validation | debt and validation tests | Yes |
| Permissions/feature access | `permissions.test.ts` plus affected route | Yes |
| Supabase fallback/pagination | matching `src/lib/supabase` tests | Usually |
| Migration/RLS/RPC | `migrationFiles.test.ts` plus domain tests | Yes |
| Telegram report formatting | daily report/image tests | Yes |
| Telegram transport/ledger/cron | delivery, send, route, migration tests | Yes |
| Locale-only copy | JSON shape review, typecheck/build | Build recommended |
| Styling isolated to one component | lint/typecheck and visual check | Risk-based |

Run the full four checks for financial, authorization, migration,
configuration, cron, cross-route, or shared-type changes.

## Manual checks

`TESTING_CHECKLIST.md` contains the 15-minute core workflow. The authenticated
`/test-checklist` page performs data sanity checks for owner/admin users.

Choose manual checks that match the change:

- Confirm behavior in all three locales after copy/layout changes.
- Confirm owner, admin, and viewer behavior after permission changes.
- Confirm two different clubs cannot see or mutate each other's data.
- Test before and after the configured business-day boundary for date changes.
- Compare dashboard, detail page, daily/monthly report, and Telegram totals after
  formula changes.
- For inventory, test both tracked and made-to-order products and a historical
  date with a saved closing.

## Database and Telegram precautions

Unit tests inspect important migration guarantees but do not replace testing an
actual migrated Supabase environment for SQL behavior. Never point seed/reset
scripts at production without explicit review.

Use Telegram `dryRun` or the local preview generator before a live send. A live
forced resend is an external side effect and requires an intentional unique
request ID; follow `docs/runbooks/telegram-report.md`.

