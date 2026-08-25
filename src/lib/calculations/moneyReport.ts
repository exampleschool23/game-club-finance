import {
  calculateGameClubMoneyLeftByPaymentMethod,
  type DailyCashRow,
  type DebtPaymentValueRow,
  type ExpenseRow,
  type MoneyLeftByPaymentMethod,
} from './dashboardMetrics';

export interface MoneyReportPaymentBreakdown {
  collected: number;
  expenses: number;
  left: number;
}

export interface MoneyReportDay {
  date: string;
  cash: number;
  terminal: number;
  card: number;
  playstation: number;
  total: number;
}

export interface MoneyReport {
  totalCollected: number;
  totalExpenses: number;
  totalLeft: number;
  paymentMethods: Record<keyof MoneyLeftByPaymentMethod, MoneyReportPaymentBreakdown>;
  days: MoneyReportDay[];
}

function paymentBucket(method: string | null | undefined): 'cash' | 'terminal' | 'card' {
  if (method === 'cash') return 'cash';
  if (method === 'terminal') return 'terminal';
  return 'card';
}

function buildPaymentMethods(
  cashRows: DailyCashRow[],
  expenseRows: ExpenseRow[],
  debtPaymentRows: DebtPaymentValueRow[],
): MoneyReport['paymentMethods'] {
  const collected = cashRows.reduce(
    (totals, row) => {
      totals.cash += Number(row.cash_income ?? 0);
      totals.terminal += Number(row.terminal_income ?? 0);
      totals.card += Number(row.card_income ?? 0);
      totals.playstation += Number(row.playstation_income ?? 0);
      return totals;
    },
    { cash: 0, terminal: 0, card: 0, playstation: 0 },
  );

  debtPaymentRows.forEach((row) => {
    collected[paymentBucket(row.payment_method)] += Number(row.amount ?? 0);
  });

  const expenses = expenseRows.reduce(
    (totals, row) => {
      if (row.payment_source !== 'bar') {
        totals[paymentBucket(row.payment_method)] += Number(row.amount ?? 0);
      }
      return totals;
    },
    { cash: 0, terminal: 0, card: 0, playstation: 0 },
  );

  const left = calculateGameClubMoneyLeftByPaymentMethod(cashRows, expenseRows, debtPaymentRows);

  return {
    cash: { collected: collected.cash, expenses: expenses.cash, left: left.cash },
    terminal: { collected: collected.terminal, expenses: expenses.terminal, left: left.terminal },
    card: { collected: collected.card, expenses: expenses.card, left: left.card },
    playstation: {
      collected: collected.playstation,
      expenses: expenses.playstation,
      left: left.playstation,
    },
  };
}

export function buildMoneyReport(
  cashRows: DailyCashRow[],
  expenseRows: ExpenseRow[],
  debtPaymentRows: DebtPaymentValueRow[] = [],
): MoneyReport {
  const paymentMethods = buildPaymentMethods(cashRows, expenseRows, debtPaymentRows);
  const totalCollected = Object.values(paymentMethods)
    .reduce((sum, method) => sum + method.collected, 0);
  const totalExpenses = Object.values(paymentMethods)
    .reduce((sum, method) => sum + method.expenses, 0);
  const totalLeft = Object.values(paymentMethods)
    .reduce((sum, method) => sum + method.left, 0);
  const dates = Array.from(new Set([
    ...cashRows.map((row) => row.date),
    ...expenseRows.filter((row) => row.payment_source !== 'bar').map((row) => row.date),
    ...debtPaymentRows.map((row) => row.date),
  ])).sort((a, b) => b.localeCompare(a));

  const days = dates.map((date) => {
    const dayMethods = buildPaymentMethods(
      cashRows.filter((row) => row.date === date),
      expenseRows.filter((row) => row.date === date),
      debtPaymentRows.filter((row) => row.date === date),
    );
    const day = {
      date,
      cash: dayMethods.cash.left,
      terminal: dayMethods.terminal.left,
      card: dayMethods.card.left,
      playstation: dayMethods.playstation.left,
      total: Object.values(dayMethods).reduce((sum, method) => sum + method.left, 0),
    };

    return day;
  });

  return { totalCollected, totalExpenses, totalLeft, paymentMethods, days };
}
