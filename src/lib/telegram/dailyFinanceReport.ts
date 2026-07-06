import { formatCurrency } from '../formatters';
import {
  calculateAverageDailyIncome,
  calculateDashboardTotals,
  countDashboardRangeDaysThroughDate,
  getLatestRowDateInRange,
} from '../calculations/dashboardMetrics';
import type {
  DailyCashRow,
  ExpenseRow,
  StockCountRow,
  StockPurchaseCostRow,
  ProductValueRow,
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
  gameClubExpenseCategories: DailyFinanceExpenseCategory[];
  barExpenseCategories: DailyFinanceExpenseCategory[];
  gameClubMoneyLeft: number;
  averageDailyGameClubIncome: number;
  barMoneyLeft: number;
  netProfit: number;
  inventoryValue: number;
  activeDebts: number;
}

export interface DailyFinanceExpenseCategory {
  name: string;
  amount: number;
}

export interface DailyFinanceReportDebtRow {
  remaining_amount: number;
  status: string;
}

export interface DailyFinanceReportRows {
  clubName: string;
  businessDate: string;
  businessDateLabel: string;
  cashRows: DailyCashRow[];
  stockRows: StockCountRow[];
  stockPurchaseRows: StockPurchaseCostRow[];
  expenseRows: ExpenseRow[];
  monthCashRows?: DailyCashRow[];
  monthStockRows?: StockCountRow[];
  monthStockPurchaseRows?: StockPurchaseCostRow[];
  monthExpenseRows?: ExpenseRow[];
  productRows?: ProductValueRow[];
  debtRows: DailyFinanceReportDebtRow[];
}

function money(value: number): string {
  return `${formatCurrency(value)} UZS`;
}

const RUSSIAN_EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  rent: 'Аренда',
  salary: 'Зарплата',
  electricity: 'Электричество',
  internet: 'Интернет',
  repair: 'Ремонт',
  cleaning: 'Уборка',
  food_drinks: 'Еда / Напитки',
  marketing: 'Маркетинг',
  equipment: 'Оборудование',
  tax: 'Налог',
  other: 'Другое',
};

function categoryName(category: string): string {
  return RUSSIAN_EXPENSE_CATEGORY_LABELS[category] ?? category;
}

export function summarizeExpenseCategories(
  rows: ExpenseRow[],
  paymentSource: 'game_club' | 'bar',
): DailyFinanceExpenseCategory[] {
  const totals = rows.reduce((categoryMap, row) => {
    if ((row.payment_source ?? 'game_club') !== paymentSource) return categoryMap;

    const name = categoryName(row.category);
    categoryMap.set(name, (categoryMap.get(name) ?? 0) + Number(row.amount ?? 0));
    return categoryMap;
  }, new Map<string, number>());

  return Array.from(totals, ([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ru'));
}

function categoryLines(categories: DailyFinanceExpenseCategory[]): string[] {
  return categories.map((category) => `    - ${category.name}: ${money(category.amount)}`);
}

export function buildDailyFinanceReportInput(rows: DailyFinanceReportRows): DailyFinanceReportInput {
  const monthStart = `${rows.businessDate.slice(0, 7)}-01`;
  const monthRange = { from: monthStart, to: rows.businessDate };
  const dailyTotals = calculateDashboardTotals(
    rows.cashRows,
    rows.stockRows,
    rows.stockPurchaseRows,
    rows.expenseRows,
    rows.productRows ?? [],
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
  const latestDailyCashEntryDate = getLatestRowDateInRange(rows.monthCashRows ?? rows.cashRows, monthRange);
  const averageGameClubDayCount = countDashboardRangeDaysThroughDate(monthRange, latestDailyCashEntryDate);

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
    gameClubExpenseCategories: summarizeExpenseCategories(rows.expenseRows, 'game_club'),
    barExpenseCategories: summarizeExpenseCategories(rows.expenseRows, 'bar'),
    gameClubMoneyLeft: monthTotals.gameClubMoneyLeft,
    averageDailyGameClubIncome: calculateAverageDailyIncome(monthTotals.gameClubIncome, averageGameClubDayCount),
    barMoneyLeft: monthTotals.barIncome,
    netProfit: dailyTotals.netProfit,
    inventoryValue: dailyTotals.inventoryValue,
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
    ...categoryLines(input.gameClubExpenseCategories),
    `  • Из денег бара: ${money(input.barExpenses)}`,
    ...categoryLines(input.barExpenseCategories),
    '',
    `💰 Остаток денег клуба за месяц: ${money(input.gameClubMoneyLeft)}`,
    `📈 Средний дневной доход клуба за месяц: ${money(input.averageDailyGameClubIncome)}`,
    `🧾 Остаток денег бара за месяц: ${money(input.barMoneyLeft)}`,
    `✅ Чистая прибыль сегодня: ${money(input.netProfit)}`,
    '',
    `📦 Стоимость склада: ${money(input.inventoryValue)}`,
    `🤝 Активные долги: ${money(input.activeDebts)}`,
  ].join('\n');
}
