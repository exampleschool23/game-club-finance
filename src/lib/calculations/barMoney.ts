export const STOCK_PURCHASE_DEDUCTION_START_DATE = '2026-07-02';

export interface BarSalesRow {
  bar_income: number;
}

export interface StockPurchaseCostRow {
  date: string;
  quantity: number;
  cost_price: number;
}

export interface BarMoneyResult {
  barSales: number;
  stockPurchaseCost: number;
  barMoney: number;
}

export function sumBarSales(rows: BarSalesRow[]): number {
  return rows.reduce((sum, row) => sum + Number(row.bar_income ?? 0), 0);
}

export function sumStockPurchaseCost(rows: StockPurchaseCostRow[]): number {
  return rows.reduce(
    (sum, row) =>
      row.date >= STOCK_PURCHASE_DEDUCTION_START_DATE
        ? sum + Number(row.quantity ?? 0) * Number(row.cost_price ?? 0)
        : sum,
    0,
  );
}

export function calculateBarMoney(
  salesRows: BarSalesRow[],
  purchaseRows: StockPurchaseCostRow[],
): BarMoneyResult {
  const barSales = sumBarSales(salesRows);
  const stockPurchaseCost = sumStockPurchaseCost(purchaseRows);

  return {
    barSales,
    stockPurchaseCost,
    barMoney: barSales - stockPurchaseCost,
  };
}
