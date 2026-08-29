import { formatCurrency } from '../formatters';
import {
  calculateAverageDailyIncome,
  calculateDashboardTotals,
  calculateInventoryValueFromLatestStockCounts,
  countDashboardRangeDaysThroughDate,
  getLatestRowDateInRange,
  percentChange,
} from '../calculations/dashboardMetrics';
import type {
  DailyCashRow,
  ExpenseRow,
  InventorySnapshotRow,
  StockCountRow,
  StockPurchaseCostRow,
  ProductValueRow,
} from '../calculations/dashboardMetrics';

export interface DailyFinanceReportInput {
  clubName: string;
  businessDateLabel: string;
  dailyRevenue: number;
  gameClubIncome: number;
  computerIncome: number;
  debtIncome: number;
  playstationIncome: number;
  barSales: number;
  barCost: number;
  grossProfit: number;
  netProfit: number;
  stockPurchases: number;
  totalExpenses: number;
  gameClubExpenses: number;
  barExpenses: number;
  gameClubExpenseCategories: DailyFinanceExpenseCategory[];
  barExpenseCategories: DailyFinanceExpenseCategory[];
  salaryCosts: number;
  kpiCosts: number;
  rentCosts: number;
  utilitiesCosts: number;
  otherOperatingCosts: number;
  monthToDateRevenue: number;
  averageDailyRevenue: number;
  gameClubMoneyLeft: number;
  averageDailyGameClubIncome: number;
  barMoneyLeft: number;
  inventoryValue: number;
  averageDailyGameClubIncomeChange?: number | null;
  barMoneyLeftChange?: number | null;
  inventoryValueChange?: number | null;
  activeDebts: number;
}

export interface DailyFinanceExpenseCategory {
  name: string;
  amount: number;
}

export interface DailyFinanceReportDebtRow {
  date?: string;
  amount?: number;
  remaining_amount: number;
  status: string;
}

export interface DailyFinanceReportDebtPaymentRow {
  date: string;
  amount: number;
  payment_method: string;
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
  previousMonthCashRows?: DailyCashRow[];
  previousMonthStockRows?: StockCountRow[];
  previousMonthStockPurchaseRows?: StockPurchaseCostRow[];
  previousMonthExpenseRows?: ExpenseRow[];
  previousMonthDebtPaymentRows?: DailyFinanceReportDebtPaymentRow[];
  previousMonthInventoryRows?: InventorySnapshotRow[];
  productRows?: ProductValueRow[];
  debtRows: DailyFinanceReportDebtRow[];
  debtPaymentRows?: DailyFinanceReportDebtPaymentRow[];
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

function expenseName(row: ExpenseRow): string {
  const comment = row.comment?.trim();
  if (row.category === 'other' && comment) return comment;

  return RUSSIAN_EXPENSE_CATEGORY_LABELS[row.category] ?? row.category;
}

export function summarizeExpenseCategories(
  rows: ExpenseRow[],
  paymentSource: 'game_club' | 'bar',
): DailyFinanceExpenseCategory[] {
  const totals = rows.reduce((categoryMap, row) => {
    if ((row.payment_source ?? 'game_club') !== paymentSource) return categoryMap;

    const name = expenseName(row);
    categoryMap.set(name, (categoryMap.get(name) ?? 0) + Number(row.amount ?? 0));
    return categoryMap;
  }, new Map<string, number>());

  return Array.from(totals, ([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ru'));
}

function categoryLines(categories: DailyFinanceExpenseCategory[]): string[] {
  return categories.map((category) => `    - ${category.name}: ${money(category.amount)}`);
}

function isKpiExpense(row: ExpenseRow): boolean {
  return /(?:^|\W)(?:kpi|кпи|bonus|бонус)(?:\W|$)/iu.test(
    `${row.category} ${row.comment ?? ''}`,
  );
}

function summarizeOperatingCosts(rows: ExpenseRow[]) {
  return rows.reduce((summary, row) => {
    const amount = Number(row.amount ?? 0);
    const description = `${row.category} ${row.comment ?? ''}`;

    if (isKpiExpense(row)) summary.kpiCosts += amount;
    else if (row.category === 'salary' || /зарплат|oylik/iu.test(description)) {
      summary.salaryCosts += amount;
    } else if (row.category === 'rent' || /аренд|ijara/iu.test(description)) {
      summary.rentCosts += amount;
    } else if (
      row.category === 'electricity'
      || row.category === 'internet'
      || /elektr|электр|svet|свет|kommun|коммун|internet|интернет/iu.test(description)
    ) {
      summary.utilitiesCosts += amount;
    } else summary.otherOperatingCosts += amount;

    return summary;
  }, {
    salaryCosts: 0,
    kpiCosts: 0,
    rentCosts: 0,
    utilitiesCosts: 0,
    otherOperatingCosts: 0,
  });
}

function percent(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format((value / total) * 100)}%`;
}

function previousComparableMonthRange(date: string): { from: string; to: string } {
  const [year, month, day] = date.split('-').map(Number);
  const previousMonthStart = new Date(Date.UTC(year, month - 2, 1));
  const previousMonthLastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const comparableDay = Math.min(day, previousMonthLastDay);
  const prefix = `${previousMonthStart.getUTCFullYear()}-${String(previousMonthStart.getUTCMonth() + 1).padStart(2, '0')}`;

  return { from: `${prefix}-01`, to: `${prefix}-${String(comparableDay).padStart(2, '0')}` };
}

export function buildDailyFinanceReportInput(rows: DailyFinanceReportRows): DailyFinanceReportInput {
  const monthStart = `${rows.businessDate.slice(0, 7)}-01`;
  const monthRange = { from: monthStart, to: rows.businessDate };
  const previousMonthRange = previousComparableMonthRange(rows.businessDate);
  const dailyDebtRows = rows.debtRows.filter((row) => row.date === rows.businessDate);
  const monthDebtRows = rows.debtRows.filter(
    (row) => Boolean(row.date && row.date >= monthRange.from && row.date <= monthRange.to),
  );
  const dailyDebtPaymentRows = (rows.debtPaymentRows ?? []).filter(
    (row) => row.date === rows.businessDate,
  );
  const monthDebtPaymentRows = (rows.debtPaymentRows ?? []).filter(
    (row) => row.date >= monthRange.from && row.date <= monthRange.to,
  );
  const dailyTotals = calculateDashboardTotals(
    rows.cashRows,
    rows.stockRows,
    rows.stockPurchaseRows,
    rows.expenseRows,
    rows.productRows ?? [],
    dailyDebtRows,
    dailyDebtPaymentRows,
    rows.debtRows,
  );
  const monthTotals = calculateDashboardTotals(
    rows.monthCashRows ?? rows.cashRows,
    rows.monthStockRows ?? rows.stockRows,
    rows.monthStockPurchaseRows ?? rows.stockPurchaseRows,
    rows.monthExpenseRows ?? rows.expenseRows,
    [],
    monthDebtRows,
    monthDebtPaymentRows,
    rows.debtRows,
  );
  const previousMonthDebtRows = rows.debtRows.filter((row) =>
    Boolean(row.date && row.date >= previousMonthRange.from && row.date <= previousMonthRange.to));
  const previousMonthTotals = calculateDashboardTotals(
    rows.previousMonthCashRows ?? [],
    rows.previousMonthStockRows ?? [],
    rows.previousMonthStockPurchaseRows ?? [],
    rows.previousMonthExpenseRows ?? [],
    [],
    previousMonthDebtRows,
    rows.previousMonthDebtPaymentRows ?? [],
    rows.debtRows,
  );
  const latestDailyCashEntryDate = getLatestRowDateInRange(rows.monthCashRows ?? rows.cashRows, monthRange);
  const averageRevenueDayCount = countDashboardRangeDaysThroughDate(
    monthRange,
    latestDailyCashEntryDate,
  );
  const previousLatestDailyCashEntryDate = getLatestRowDateInRange(
    rows.previousMonthCashRows ?? [],
    previousMonthRange,
  );
  const previousAverageDayCount = countDashboardRangeDaysThroughDate(
    previousMonthRange,
    previousLatestDailyCashEntryDate,
  );
  const previousAverageDailyGameClubIncome = calculateAverageDailyIncome(
    previousMonthTotals.gameClubIncome,
    previousAverageDayCount,
  );
  const previousInventoryValue = calculateInventoryValueFromLatestStockCounts(
    rows.previousMonthInventoryRows ?? [],
  );
  const dailyRevenue = dailyTotals.gameClubIncome + dailyTotals.barSales;
  const monthToDateRevenue = monthTotals.gameClubIncome;
  const operatingCosts = summarizeOperatingCosts(rows.expenseRows);

  return {
    clubName: rows.clubName,
    businessDateLabel: rows.businessDateLabel,
    dailyRevenue,
    gameClubIncome: dailyTotals.gameClubIncome,
    computerIncome: dailyTotals.computerIncome,
    debtIncome: dailyTotals.debtIncome,
    playstationIncome: dailyTotals.playstationIncome,
    barSales: dailyTotals.barSales,
    barCost: dailyTotals.barCost,
    grossProfit: dailyRevenue - dailyTotals.barCost,
    netProfit: dailyTotals.accountingNetProfit,
    stockPurchases: dailyTotals.stockPurchaseCost,
    totalExpenses: dailyTotals.totalExpenses,
    gameClubExpenses: dailyTotals.gameClubExpenses,
    barExpenses: dailyTotals.barExpenses,
    gameClubExpenseCategories: summarizeExpenseCategories(rows.expenseRows, 'game_club'),
    barExpenseCategories: summarizeExpenseCategories(rows.expenseRows, 'bar'),
    ...operatingCosts,
    monthToDateRevenue,
    averageDailyRevenue: calculateAverageDailyIncome(monthToDateRevenue, averageRevenueDayCount),
    gameClubMoneyLeft: monthTotals.gameClubMoneyLeft,
    averageDailyGameClubIncome: calculateAverageDailyIncome(monthTotals.gameClubIncome, averageRevenueDayCount),
    barMoneyLeft: monthTotals.barIncome,
    inventoryValue: dailyTotals.inventoryValue,
    averageDailyGameClubIncomeChange: percentChange(
      calculateAverageDailyIncome(monthTotals.gameClubIncome, averageRevenueDayCount),
      previousAverageDailyGameClubIncome,
    ),
    barMoneyLeftChange: percentChange(monthTotals.barIncome, previousMonthTotals.barIncome),
    inventoryValueChange: percentChange(dailyTotals.inventoryValue, previousInventoryValue),
    activeDebts: dailyTotals.activeDebts,
  };
}

export function formatRussianDailyFinanceReport(input: DailyFinanceReportInput): string {
  return [
    '📊 Ежедневный финансовый отчёт',
    input.clubName,
    `Рабочий день: ${input.businessDateLabel}`,
    '',
    `💳 Выручка за день: ${money(input.dailyRevenue)}`,
    `🎮 Доход клуба: ${money(input.gameClubIncome)}`,
    `  • Компьютеры: ${money(input.computerIncome)} (${percent(input.computerIncome, input.dailyRevenue)})`,
    `  • Долги: ${money(input.debtIncome)} (${percent(input.debtIncome, input.dailyRevenue)})`,
    `  • PlayStation: ${money(input.playstationIncome)} (${percent(input.playstationIncome, input.dailyRevenue)})`,
    '',
    `🍫 Продажи бара: ${money(input.barSales)} (${percent(input.barSales, input.dailyRevenue)})`,
    `📉 Себестоимость бара: ${money(input.barCost)}`,
    `📈 Валовая прибыль: ${money(input.grossProfit)}`,
    `✅ Чистая прибыль: ${money(input.netProfit)}`,
    `📦 Закупки склада: ${money(input.stockPurchases)}`,
    '',
    `💸 Расходы: ${money(input.totalExpenses)}`,
    `  • Из денег клуба: ${money(input.gameClubExpenses)}`,
    ...categoryLines(input.gameClubExpenseCategories),
    `  • Из денег бара: ${money(input.barExpenses)}`,
    ...categoryLines(input.barExpenseCategories),
    `  • Зарплата: ${money(input.salaryCosts)}`,
    `  • KPI и бонусы: ${money(input.kpiCosts)}`,
    `  • Аренда: ${money(input.rentCosts)}`,
    `  • Коммунальные услуги: ${money(input.utilitiesCosts)}`,
    `  • Прочие расходы: ${money(input.otherOperatingCosts)}`,
    '',
    `🗓 Доход клуба с начала месяца: ${money(input.monthToDateRevenue)}`,
    `📊 Средний доход клуба в день: ${money(input.averageDailyRevenue)}`,
    `💰 Остаток денег клуба за месяц: ${money(input.gameClubMoneyLeft)}`,
    `📈 Средний дневной доход клуба за месяц: ${money(input.averageDailyGameClubIncome)}`,
    `🧾 Остаток денег бара за месяц: ${money(input.barMoneyLeft)}`,
    '',
    `📦 Стоимость склада: ${money(input.inventoryValue)}`,
    `🤝 Активные долги: ${money(input.activeDebts)}`,
  ].join('\n');
}

export function formatRussianDailyFinanceReportCaption(input: DailyFinanceReportInput): string {
  return [
    '📊 Ежедневный финансовый отчёт',
    `Рабочий день: ${input.businessDateLabel}`,
  ].join('\n');
}
