# Finance domain guide

Read this before changing dashboard totals, reports, owner money, Telegram
finance output, or the meaning of an accounting field.

## Sources of truth

| Concept | Current ledger |
|---|---|
| Game-club collections | `daily_cash_entries` |
| Bar sales and cost of goods sold | `daily_stock_counts` |
| Inventory cash outflow | `stock_purchases` |
| Operating expenses | `expenses` |
| Customer debt principal | `new_debts` |
| Cash collected from debts | `debt_payments` |
| Owner money taken | `owner_withdrawals` |

The older `income_transactions`, `expense_transactions`, and `cash_movements`
tables are retired ledgers. They remain readable for history but must not accept
new application writes.

Every row above is club-owned. Always scope reports and mutations by `club_id`.

## Canonical formulas

Use the implementations under `src/lib/calculations`; these definitions explain
their intent but are not a second implementation.

```text
gameClubIncome = cash + terminal + card + playstation
barSales       = sum(daily_stock_counts.bar_income)
barCost        = sum(daily_stock_counts.bar_cost)
totalIncome    = gameClubIncome + barSales + debtIncome
totalExpenses  = sum(expenses.amount)
accountingNetProfit = totalIncome - barCost - totalExpenses
```

`debtIncome` in financial reports represents new debt principal for the period.
Debt payments are collections used in retained/available game-club money; do not
count the same cash as both new income and collection without checking the
specific report definition.

Accounting profit and available cash answer different questions:

- Cost of goods sold (`barCost`) reduces accounting profit.
- Inventory purchases are cash outflow and reduce bar cash left only on or after
  `STOCK_PURCHASE_DEDUCTION_START_DATE` (`2026-07-02`). This historical cutoff is
  defined in `src/lib/calculations/barMoney.ts`; do not duplicate or casually
  change it.
- An expense reduces the source selected by `payment_source`: `game_club` or
  `bar`.

```text
barCashLeft = barSales - qualifyingStockPurchaseCost - barExpenses
```

## Owner available money

`src/lib/calculations/availableMoney.ts` calculates independent monthly and
source-specific buckets:

```text
gameClubEarned = gameClubCollections + debtCollections - gameClubExpenses
barEarned      = barSales - qualifyingStockPurchases - barExpenses
available      = earned - prior withdrawals for the same month and source
```

Positive money in another month or source cannot validate an over-withdrawal.
The database RPC `take_all_owner_money_for_month` atomically takes the complete
positive remainder for exactly one month/source. Do not replace it with a
client-computed amount followed by a direct insert.

## Debts

- New debts begin unpaid with `paid_amount = 0` and the full amount remaining.
- Payment dates cannot precede the debt date or use a future club business date.
- Payments cannot exceed the remaining debt.
- Debt and payment rows are append-only for application users.
- A database trigger updates the parent balance and status after payment insert.

Keep UI validation for feedback, but rely on database constraints/triggers for
integrity under concurrency or direct API access.

## Dates and periods

Browser/server finance pages use the selected club's configurable business-day
start from `src/lib/utils.ts`. Scheduled Telegram reporting uses
`Asia/Tashkent` and reports the previous Tashkent business date. A calendar
month owner bucket is stored as its first day (`YYYY-MM-01`).

## Change checklist

When a formula changes, inspect all consumers: dashboard, daily/monthly reports,
money details, owner money, Telegram report, and tests. Prefer changing one pure
calculation and its tests rather than fixing each consumer independently.

