import { formatCurrency } from '../formatters';
import { calculateDashboardTotals } from '../calculations/dashboardMetrics';
import type {
  DailyCashRow,
  ExpenseRow,
  StockCountRow,
  StockPurchaseCostRow,
} from '../calculations/dashboardMetrics';

export interface DailyFinanceReportInput {
  clubName: string;
  businessDateLabel: string;
  gameClubIncome: number;
  computerIncome: number;
  playstationIncome: number;
  barSales: number;
  stockPurchases: number;
  totalExpenses: number;
  gameClubExpenses: number;
  barExpenses: number;
  gameClubMoneyLeft: number;
  barMoneyLeft: number;
  netProfit: number;
  activeDebts: number;
}

export interface DailyFinanceReportDebtRow {
  remaining_amount: number;
  status: string;
}

export interface DailyFinanceReportRows {
  clubName: string;
  businessDateLabel: string;
  cashRows: DailyCashRow[];
  stockRows: StockCountRow[];
  stockPurchaseRows: StockPurchaseCostRow[];
  expenseRows: ExpenseRow[];
  monthCashRows?: DailyCashRow[];
  monthStockRows?: StockCountRow[];
  monthStockPurchaseRows?: StockPurchaseCostRow[];
  monthExpenseRows?: ExpenseRow[];
  debtRows: DailyFinanceReportDebtRow[];
}

function money(value: number): string {
  return `${formatCurrency(value)} UZS`;
}

export function buildDailyFinanceReportInput(rows: DailyFinanceReportRows): DailyFinanceReportInput {
  const dailyTotals = calculateDashboardTotals(
    rows.cashRows,
    rows.stockRows,
    rows.stockPurchaseRows,
    rows.expenseRows,
    [],
    rows.debtRows,
  );
  const monthTotals = calculateDashboardTotals(
    rows.monthCashRows ?? rows.cashRows,
    rows.monthStockRows ?? rows.stockRows,
    rows.monthStockPurchaseRows ?? rows.stockPurchaseRows,
    rows.monthExpenseRows ?? rows.expenseRows,
    [],
    rows.debtRows,
  );

  return {
    clubName: rows.clubName,
    businessDateLabel: rows.businessDateLabel,
    gameClubIncome: dailyTotals.gameClubIncome,
    computerIncome: dailyTotals.computerIncome,
    playstationIncome: dailyTotals.playstationIncome,
    barSales: dailyTotals.barSales,
    stockPurchases: dailyTotals.stockPurchaseCost,
    totalExpenses: dailyTotals.totalExpenses,
    gameClubExpenses: dailyTotals.gameClubExpenses,
    barExpenses: dailyTotals.barExpenses,
    gameClubMoneyLeft: monthTotals.gameClubMoneyLeft,
    barMoneyLeft: monthTotals.barIncome,
    netProfit: dailyTotals.netProfit,
    activeDebts: dailyTotals.activeDebts,
  };
}

export function formatRussianDailyFinanceReport(input: DailyFinanceReportInput): string {
  return [
    '📊 Ежедневный финансовый отчёт',
    input.clubName,
    `Рабочий день: ${input.businessDateLabel}`,
    '',
    `🎮 Доход клуба: ${money(input.gameClubIncome)}`,
    `  • Компьютеры: ${money(input.computerIncome)}`,
    `  • PlayStation: ${money(input.playstationIncome)}`,
    '',
    `🍫 Продажи бара: ${money(input.barSales)}`,
    `📦 Закупки склада: ${money(input.stockPurchases)}`,
    '',
    `💸 Расходы: ${money(input.totalExpenses)}`,
    `  • Из денег клуба: ${money(input.gameClubExpenses)}`,
    `  • Из денег бара: ${money(input.barExpenses)}`,
    '',
    `💰 Остаток денег клуба за месяц: ${money(input.gameClubMoneyLeft)}`,
    `🧾 Остаток денег бара за месяц: ${money(input.barMoneyLeft)}`,
    `✅ Чистая прибыль сегодня: ${money(input.netProfit)}`,
    '',
    `🤝 Активные долги: ${money(input.activeDebts)}`,
  ].join('\n');
}
