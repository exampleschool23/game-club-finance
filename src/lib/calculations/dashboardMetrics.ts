import { calculateGameClubIncome } from './dailyCash';

export type DashboardPeriod = 'today' | 'week' | 'month';

export interface DailyCashRow {
  date: string;
  cash_income: number;
  terminal_income: number;
  card_income: number;
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
  gameClubIncome: number;
  barIncome: number;
  totalIncome: number;
  totalExpenses: number;
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

export const emptyDashboardTotals: DashboardTotals = {
  cashIncome: 0,
  terminalIncome: 0,
  cardIncome: 0,
  gameClubIncome: 0,
  barIncome: 0,
  totalIncome: 0,
  totalExpenses: 0,
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
): { from: string; to: string } {
  const base = parseLocalIsoDate(selectedDate);

  if (period === 'today') {
    return { from: selectedDate, to: selectedDate };
  }

  if (period === 'week') {
    const day = base.getDay() || 7;
    const monday = addDays(base, 1 - day);
    const sunday = addDays(monday, 6);
    return { from: localIsoDate(monday), to: localIsoDate(sunday) };
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

export function sumGameClubRows(rows: DailyCashRow[]): Pick<
  DashboardTotals,
  'cashIncome' | 'terminalIncome' | 'cardIncome' | 'gameClubIncome'
> {
  const cashIncome = rows.reduce((sum, row) => sum + Number(row.cash_income ?? 0), 0);
  const terminalIncome = rows.reduce((sum, row) => sum + Number(row.terminal_income ?? 0), 0);
  const cardIncome = rows.reduce((sum, row) => sum + Number(row.card_income ?? 0), 0);
  return {
    cashIncome,
    terminalIncome,
    cardIncome,
    gameClubIncome: calculateGameClubIncome({ cashIncome, terminalIncome, cardIncome }),
  };
}

export function calculateDashboardTotals(
  cashRows: DailyCashRow[],
  stockRows: StockCountRow[],
  expenseRows: ExpenseRow[],
  products: ProductValueRow[],
  debts: DebtValueRow[],
): DashboardTotals {
  const gameClub = sumGameClubRows(cashRows);
  const barIncome = stockRows.reduce((sum, row) => sum + Number(row.bar_income ?? 0), 0);
  const totalExpenses = expenseRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const totalIncome = gameClub.gameClubIncome + barIncome;
  const netProfit = totalIncome - totalExpenses;
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
    barIncome,
    totalIncome,
    totalExpenses,
    netProfit,
    inventoryValue,
    activeDebts,
    activeDebtCount: activeDebtRows.length,
    profitMargin: totalIncome > 0 ? Math.round((netProfit / totalIncome) * 1000) / 10 : 0,
  };
}

export function percentChange(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function buildIncomeTrend(
  endDate: string,
  cashRows: DailyCashRow[],
  stockRows: StockCountRow[],
  expenseRows: ExpenseRow[],
): TrendRow[] {
  const trendDates = Array.from({ length: 7 }, (_, index) =>
    localIsoDate(addDays(parseLocalIsoDate(endDate), index - 6)),
  );

  return trendDates.map((date) => {
    const dayCash = cashRows.filter((row) => row.date === date);
    const dayStock = stockRows.filter((row) => row.date === date);
    const dayExpenses = expenseRows.filter((row) => row.date === date);
    const dayGame = sumGameClubRows(dayCash).gameClubIncome;
    const dayBar = dayStock.reduce((sum, row) => sum + Number(row.bar_income ?? 0), 0);

    return {
      date,
      income: dayGame + dayBar,
      expenses: dayExpenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    };
  });
}
