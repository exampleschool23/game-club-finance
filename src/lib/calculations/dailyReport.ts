import { calculateGameClubIncome } from './dailyCash';
import { calculateBarMoney } from './barMoney';
import type { BarSalesRow, StockPurchaseCostRow } from './barMoney';

export interface DailyCashEntry {
  cash_income: number;
  terminal_income: number;
  card_income: number;
  playstation_income?: number;
}

export interface FinancialReportStockRow extends BarSalesRow {
  bar_cost: number;
}

export interface FinancialReportExpenseRow {
  amount: number;
  payment_source?: 'game_club' | 'bar' | null;
}

export interface FinancialReportInput {
  manualIncome: number;
  debtIncome?: number;
  stockRows: FinancialReportStockRow[];
  purchaseRows: StockPurchaseCostRow[];
  expenseRows: FinancialReportExpenseRow[];
}

export interface FinancialReportTotals {
  manualIncome: number;
  debtIncome: number;
  /** Gross bar revenue recorded by closing stock. */
  barSales: number;
  /** Cost of the products sold during the report period. */
  barCost: number;
  /** Inventory cash outflow included in bar money from the configured cutoff date. */
  stockPurchaseCost: number;
  barExpenses: number;
  /** Gross game-club and bar revenue, including new debts. */
  totalIncome: number;
  totalExpenses: number;
  /** Bar cash left after inventory purchases and expenses paid by the bar. */
  barCashLeft: number;
  /** Revenue minus cost of goods sold and all recorded operating expenses. */
  accountingNetProfit: number;
}

export function calculateManualIncome(entry: DailyCashEntry): number {
  return calculateGameClubIncome({
    cashIncome: entry.cash_income,
    terminalIncome: entry.terminal_income,
    cardIncome: entry.card_income,
    playstationIncome: entry.playstation_income ?? 0,
  });
}

export function calculateTotalIncome(manualIncome: number, barIncome: number, debtIncome = 0): number {
  return manualIncome + barIncome + debtIncome;
}

export function calculateNetProfit(totalIncome: number, totalExpenses: number): number {
  return totalIncome - totalExpenses;
}

/**
 * Uses the same accounting and bar-cash definitions as the dashboard while
 * keeping those two views separate. Inventory purchases affect bar cash left;
 * cost of goods sold affects accounting profit.
 */
export function calculateFinancialReportTotals({
  manualIncome,
  debtIncome = 0,
  stockRows,
  purchaseRows,
  expenseRows,
}: FinancialReportInput): FinancialReportTotals {
  const { barSales, stockPurchaseCost, barMoney } = calculateBarMoney(stockRows, purchaseRows);
  const barCost = stockRows.reduce((sum, row) => sum + Number(row.bar_cost ?? 0), 0);
  const totalExpenses = expenseRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const barExpenses = expenseRows.reduce(
    (sum, row) => row.payment_source === 'bar' ? sum + Number(row.amount ?? 0) : sum,
    0,
  );
  const totalIncome = calculateTotalIncome(manualIncome, barSales, debtIncome);

  return {
    manualIncome,
    debtIncome,
    barSales,
    barCost,
    stockPurchaseCost,
    barExpenses,
    totalIncome,
    totalExpenses,
    barCashLeft: barMoney - barExpenses,
    accountingNetProfit: totalIncome - barCost - totalExpenses,
  };
}
