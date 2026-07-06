import { calculateGameClubIncome } from './dailyCash';
import { calculateBarMoney, sumStockPurchaseCost } from './barMoney';
import type { StockPurchaseCostRow } from './barMoney';

export { STOCK_PURCHASE_DEDUCTION_START_DATE, sumStockPurchaseCost } from './barMoney';
export type { StockPurchaseCostRow } from './barMoney';

export type DashboardPeriod =
  | 'today'
  | 'yesterday'
  | 'last7Days'
  | 'week'
  | 'lastWeek'
  | 'month'
  | 'lastMonth'
  | 'custom';

export interface DailyCashRow {
  date: string;
  cash_income: number;
  terminal_income: number;
  card_income: number;
  playstation_income?: number;
  created_at?: string;
}

export interface StockCountRow {
  date: string;
  bar_income: number;
  bar_profit: number;
  bar_cost: number;
  sold_quantity: number;
  updated_at?: string;
}

export interface ExpenseRow {
  id: string;
  date: string;
  amount: number;
  category: string;
  payment_method?: string | null;
  payment_source?: 'game_club' | 'bar' | null;
  comment: string | null;
  created_at: string;
}

export interface ProductValueRow {
  current_stock: number;
  cost_price: number;
}

export interface DebtValueRow {
  remaining_amount: number;
  status: string;
}

export interface DashboardTotals {
  cashIncome: number;
  terminalIncome: number;
  cardIncome: number;
  playstationIncome: number;
  computerIncome: number;
  gameClubIncome: number;
  barSales: number;
  stockPurchaseCost: number;
  barIncome: number;
  totalIncome: number;
  totalExpenses: number;
  gameClubExpenses: number;
  barExpenses: number;
  gameClubMoneyLeft: number;
  netProfit: number;
  inventoryValue: number;
  activeDebts: number;
  activeDebtCount: number;
  profitMargin: number;
}

export interface TrendRow {
  date: string;
  income: number;
  expenses: number;
}

export interface MoneyLeftByPaymentMethod {
  cash: number;
  terminal: number;
  card: number;
  playstation: number;
}

export const emptyMoneyLeftByPaymentMethod: MoneyLeftByPaymentMethod = {
  cash: 0,
  terminal: 0,
  card: 0,
  playstation: 0,
};

export const emptyDashboardTotals: DashboardTotals = {
  cashIncome: 0,
  terminalIncome: 0,
  cardIncome: 0,
  playstationIncome: 0,
  computerIncome: 0,
  gameClubIncome: 0,
  barSales: 0,
  stockPurchaseCost: 0,
  barIncome: 0,
  totalIncome: 0,
  totalExpenses: 0,
  gameClubExpenses: 0,
  barExpenses: 0,
  gameClubMoneyLeft: 0,
  netProfit: 0,
  inventoryValue: 0,
  activeDebts: 0,
  activeDebtCount: 0,
  profitMargin: 0,
};

export function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getDashboardRange(
  period: DashboardPeriod,
  selectedDate: string,
  customRange?: { from: string; to: string },
): { from: string; to: string } {
  const base = parseLocalIsoDate(selectedDate);

  if (period === 'today') {
    return { from: selectedDate, to: selectedDate };
  }

  if (period === 'yesterday') {
    const yesterday = localIsoDate(addDays(base, -1));
    return { from: yesterday, to: yesterday };
  }

  if (period === 'last7Days') {
    return { from: localIsoDate(addDays(base, -6)), to: selectedDate };
  }

  if (period === 'week') {
    const day = base.getDay() || 7;
    const monday = addDays(base, 1 - day);
    const sunday = addDays(monday, 6);
    return { from: localIsoDate(monday), to: localIsoDate(sunday) };
  }

  if (period === 'lastWeek') {
    const day = base.getDay() || 7;
    const thisMonday = addDays(base, 1 - day);
    const lastMonday = addDays(thisMonday, -7);
    const lastSunday = addDays(lastMonday, 6);
    return { from: localIsoDate(lastMonday), to: localIsoDate(lastSunday) };
  }

  if (period === 'lastMonth') {
    const monthStart = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    const monthEnd = new Date(base.getFullYear(), base.getMonth(), 0);
    return { from: localIsoDate(monthStart), to: localIsoDate(monthEnd) };
  }

  if (period === 'custom' && customRange?.from && customRange?.to) {
    return customRange.from <= customRange.to
      ? customRange
      : { from: customRange.to, to: customRange.from };
  }

  const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
  const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { from: localIsoDate(monthStart), to: localIsoDate(monthEnd) };
}

export function getPreviousDashboardRange(range: {
  from: string;
  to: string;
}): { from: string; to: string } {
  const from = parseLocalIsoDate(range.from);
  const to = parseLocalIsoDate(range.to);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, 1 - days);
  return { from: localIsoDate(previousFrom), to: localIsoDate(previousTo) };
}

export function countDashboardRangeDays(range: { from: string; to: string }): number {
  const from = parseLocalIsoDate(range.from);
  const to = parseLocalIsoDate(range.to);
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
}

export function getDashboardAverageDayCount(
  period: DashboardPeriod,
  range: { from: string; to: string },
  selectedDate: string,
): number {
  if (period !== 'week' && period !== 'month') return countDashboardRangeDays(range);

  const from = parseLocalIsoDate(range.from);
  const to = parseLocalIsoDate(range.to);
  const selected = parseLocalIsoDate(selectedDate);

  if (selected < from || selected > to) return countDashboardRangeDays(range);

  return countDashboardRangeDays({ from: range.from, to: localIsoDate(selected) });
}

export function getLatestRowDateInRange<T extends { date: string }>(
  rows: T[],
  range: { from: string; to: string },
): string | null {
  return rows.reduce<string | null>((latest, row) => {
    if (row.date < range.from || row.date > range.to) return latest;
    return latest === null || row.date > latest ? row.date : latest;
  }, null);
}

export function countDashboardRangeDaysThroughDate(
  range: { from: string; to: string },
  throughDate: string | null | undefined,
): number {
  if (!throughDate || throughDate < range.from) return countDashboardRangeDays(range);
  const cappedTo = throughDate > range.to ? range.to : throughDate;
  return countDashboardRangeDays({ from: range.from, to: cappedTo });
}

export function calculateAverageDailyIncome(total: number, days: number): number {
  return Math.round(total / Math.max(1, days));
}

export function sumGameClubRows(rows: DailyCashRow[]): Pick<
  DashboardTotals,
  | 'cashIncome'
  | 'terminalIncome'
  | 'cardIncome'
  | 'playstationIncome'
  | 'computerIncome'
  | 'gameClubIncome'
> {
  const cashIncome = rows.reduce((sum, row) => sum + Number(row.cash_income ?? 0), 0);
  const terminalIncome = rows.reduce((sum, row) => sum + Number(row.terminal_income ?? 0), 0);
  const cardIncome = rows.reduce((sum, row) => sum + Number(row.card_income ?? 0), 0);
  const playstationIncome = rows.reduce((sum, row) => sum + Number(row.playstation_income ?? 0), 0);
  const computerIncome = cashIncome + terminalIncome + cardIncome;
  return {
    cashIncome,
    terminalIncome,
    cardIncome,
    playstationIncome,
    computerIncome,
    gameClubIncome: calculateGameClubIncome({ cashIncome, terminalIncome, cardIncome, playstationIncome }),
  };
}

function gameClubExpensePaymentBucket(method: string | null | undefined): 'cash' | 'terminal' | 'card' {
  if (method === 'cash') return 'cash';
  if (method === 'terminal') return 'terminal';
  return 'card';
}

export function calculateGameClubMoneyLeftByPaymentMethod(
  cashRows: DailyCashRow[],
  expenseRows: ExpenseRow[],
): MoneyLeftByPaymentMethod {
  const gameClub = sumGameClubRows(cashRows);
  const expensesByPayment = expenseRows.reduce(
    (acc, row) => {
      if (row.payment_source === 'bar') return acc;

      const bucket = gameClubExpensePaymentBucket(row.payment_method);
      acc[bucket] += Number(row.amount ?? 0);
      return acc;
    },
    { cash: 0, terminal: 0, card: 0 },
  );

  return {
    cash: gameClub.cashIncome - expensesByPayment.cash,
    terminal: gameClub.terminalIncome - expensesByPayment.terminal,
    card: gameClub.cardIncome - expensesByPayment.card,
    playstation: gameClub.playstationIncome,
  };
}

export function calculateDashboardTotals(
  cashRows: DailyCashRow[],
  stockRows: StockCountRow[],
  purchaseRows: StockPurchaseCostRow[],
  expenseRows: ExpenseRow[],
  products: ProductValueRow[],
  debts: DebtValueRow[],
): DashboardTotals {
  const gameClub = sumGameClubRows(cashRows);
  const barMoney = calculateBarMoney(stockRows, purchaseRows);
  const totalExpenses = expenseRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const barExpenses = expenseRows.reduce(
    (sum, row) => (row.payment_source === 'bar' ? sum + Number(row.amount ?? 0) : sum),
    0,
  );
  const gameClubExpenses = totalExpenses - barExpenses;
  const barIncome = barMoney.barMoney - barExpenses;
  const gameClubMoneyLeft = gameClub.gameClubIncome - gameClubExpenses;
  const totalIncome = gameClub.gameClubIncome + barMoney.barMoney;
  const netProfit = gameClubMoneyLeft + barIncome;
  const inventoryValue = products.reduce(
    (sum, product) => sum + Number(product.current_stock ?? 0) * Number(product.cost_price ?? 0),
    0,
  );
  const activeDebtRows = debts.filter((debt) => debt.status !== 'paid');
  const activeDebts = activeDebtRows.reduce(
    (sum, debt) => sum + Number(debt.remaining_amount ?? 0),
    0,
  );

  return {
    ...gameClub,
    barSales: barMoney.barSales,
    stockPurchaseCost: barMoney.stockPurchaseCost,
    barIncome,
    totalIncome,
    totalExpenses,
    gameClubExpenses,
    barExpenses,
    gameClubMoneyLeft,
    netProfit,
    inventoryValue,
    activeDebts,
    activeDebtCount: activeDebtRows.length,
    profitMargin: totalIncome > 0 ? Math.round((netProfit / totalIncome) * 1000) / 10 : 0,
  };
}

export function percentChange(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export function buildIncomeTrend(
  endDate: string,
  cashRows: DailyCashRow[],
  stockRows: StockCountRow[],
  purchaseRows: StockPurchaseCostRow[],
  expenseRows: ExpenseRow[],
): TrendRow[] {
  const trendDates = Array.from({ length: 7 }, (_, index) =>
    localIsoDate(addDays(parseLocalIsoDate(endDate), index - 6)),
  );

  return buildTrendForDates(trendDates, cashRows, stockRows, purchaseRows, expenseRows);
}

export function buildPeriodTrend(
  range: { from: string; to: string },
  cashRows: DailyCashRow[],
  stockRows: StockCountRow[],
  purchaseRows: StockPurchaseCostRow[],
  expenseRows: ExpenseRow[],
): TrendRow[] {
  const from = parseLocalIsoDate(range.from);
  const to = parseLocalIsoDate(range.to);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const trendDates = Array.from({ length: days }, (_, index) => localIsoDate(addDays(from, index)));

  return buildTrendForDates(trendDates, cashRows, stockRows, purchaseRows, expenseRows);
}

function buildTrendForDates(
  trendDates: string[],
  cashRows: DailyCashRow[],
  stockRows: StockCountRow[],
  purchaseRows: StockPurchaseCostRow[],
  expenseRows: ExpenseRow[],
): TrendRow[] {
  return trendDates.map((date) => {
    const dayCash = cashRows.filter((row) => row.date === date);
    const dayStock = stockRows.filter((row) => row.date === date);
    const dayPurchases = purchaseRows.filter((row) => row.date === date);
    const dayExpenses = expenseRows.filter((row) => row.date === date);
    const dayGame = sumGameClubRows(dayCash).gameClubIncome;
    const dayBarSales = dayStock.reduce((sum, row) => sum + Number(row.bar_income ?? 0), 0);
    const dayPurchaseCost = sumStockPurchaseCost(dayPurchases);

    return {
      date,
      income: dayGame + dayBarSales - dayPurchaseCost,
      expenses: dayExpenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    };
  });
}
