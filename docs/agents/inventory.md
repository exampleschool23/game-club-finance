# Inventory and closing-stock guide

Read this before changing products, purchases, stock counts, imports, or bar
financials.

## Inventory model

`products.current_stock` is the live operational balance. Products can either
track inventory or be made to order:

- Tracked products derive sold quantity from opening, additions, explicit
  adjustment, and closing balance.
- Made-to-order products record direct sold quantity without a carried stock
  balance.
- Soft-deleted products are inactive and must have `current_stock = 0`, while
  their historical ledger rows remain unchanged.

New stock purchase quantities must be positive whole units. Historical
fractional rows remain readable for compatibility.

## Canonical calculations

The implementation is `src/lib/calculations/stock.ts`:

```text
availableStock = previousStock + addedToday + adjustmentQuantity
soldQuantity   = max(0, availableStock - closingStock)
barIncome      = soldQuantity * salePrice
barCost        = soldQuantity * costPrice
barProfit      = barIncome - barCost
```

Closing stock cannot exceed available stock unless an owner records an explicit
adjustment and reason through the supported flow.

Purchase cost updates use weighted average cost:

```text
newCost = (currentStock * currentCost + purchasedQty * purchaseCost)
          / (currentStock + purchasedQty)
```

## Required atomic write paths

Browser code must use these RPCs:

| Operation | RPC |
|---|---|
| Record a purchase and update stock/cost | `record_stock_purchase` |
| Delete a purchase and repair affected state | `delete_stock_purchase` |
| Save closing counts and validate/cascade history | `save_closing_stock_counts` |

Do not split an RPC into separate inserts/updates. The functions lock and
validate related rows so concurrent writes cannot leave partial ledger state.

The dashboard and closing page also use read RPCs
`get_dashboard_snapshot` and `get_latest_stock_closings` for performance. Their
direct-query paths are deployment compatibility fallbacks, not alternative
business definitions.

## Historical snapshot rule

For an open business day, purchases are the live source of `added_today`. Once a
saved stock count is historical, its `added_today`, `closing_stock`, sales, cost,
and profit are an accounting snapshot. Later purchase metadata edits may expose
a mismatch, but must not silently rewrite that saved result.

Owner edits to a past closing are handled atomically and may validate/recalculate
the forward stock chain. Preserve the database behavior in migrations 034 and
038 and the matching tests.

## Relevant files

- `src/app/(dashboard)/products/page.tsx`: product catalog and soft deletion.
- `src/app/(dashboard)/stock-purchase/StockPurchasePage.tsx`: purchase UI/RPCs.
- `src/app/(dashboard)/closing-stock/ClosingStockPage.tsx`: closing workflow.
- `src/lib/closingStock.ts`: drafts/import transformation.
- `src/lib/calculations/stock.ts`: pure formulas.
- `src/lib/calculations/barMoney.ts`: bar cash and purchase cutoff.
- `supabase/migrations/034_atomic_closing_stock_save.sql`: atomic stock model.
- `supabase/migrations/038_stock_snapshot_and_payment_method_integrity.sql`:
  historical snapshot and archive rules.

## Verification focus

Test current-day purchases, purchase deletion, historical closings, forward
stock-chain edits, made-to-order sales, soft deletion, adjustments, weighted
cost, and the bar-money cutoff. See `docs/agents/testing.md` for commands.

