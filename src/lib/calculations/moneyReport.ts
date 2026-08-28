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

export interface MoneyReportActivity {
  id: string | null;
  source: 'daily_cash' | 'debt_payment' | 'expense';
  kind: 'income' | 'debt_payment' | 'expense';
  category: string | null;
  /** Positive values are collections; negative values are deductions. */
  amount: number;
  paymentMethod: string | null;
  comment: string | null;
  createdAt: string | null;
  createdByName?: string | null;
  paymentBreakdown?: {
    cash: number;
    terminal: number;
    card: number;
    playstation: number;
  };
}

export interface MoneyReportDay {
  date: string;
  cash: number;
  terminal: number;
  card: number;
  playstation: number;
  total: number;
  income: number;
  expenses: number;
  activities: MoneyReportActivity[];
}

export interface MoneyReport {
  totalCollected: number;
  totalExpenses: number;
  totalLeft: number;
  paymentMethods: Record<keyof MoneyLeftByPaymentMethod, MoneyReportPaymentBreakdown>;
  days: MoneyReportDay[];
}

export interface MoneyReportCashRow extends DailyCashRow {
  id?: string;
  comment?: string | null;
}

export interface MoneyReportDebtPaymentRow extends DebtPaymentValueRow {
  id?: string;
  comment?: string | null;
  created_at?: string;
}

export type MoneyReportCategoryFilter =
  | 'all'
  | 'income'
  | 'debt_payment'
  | 'expense'
  | `expense:${string}`;

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

function buildDailyActivities(
  cashRows: MoneyReportCashRow[],
  expenseRows: ExpenseRow[],
  debtPaymentRows: MoneyReportDebtPaymentRow[],
): MoneyReportActivity[] {
  const activities: MoneyReportActivity[] = [];

  cashRows.forEach((row) => {
    const paymentBreakdown = {
      cash: Number(row.cash_income ?? 0),
      terminal: Number(row.terminal_income ?? 0),
      card: Number(row.card_income ?? 0),
      playstation: Number(row.playstation_income ?? 0),
    };
    activities.push({
      id: row.id ?? null,
      source: 'daily_cash',
      kind: 'income',
      category: null,
      amount: Object.values(paymentBreakdown).reduce((sum, amount) => sum + amount, 0),
      paymentMethod: null,
      comment: row.comment ?? null,
      createdAt: row.created_at ?? null,
      ...(row.creator_name !== undefined ? { createdByName: row.creator_name } : {}),
      paymentBreakdown,
    });
  });

  debtPaymentRows.forEach((row) => {
    activities.push({
      id: row.id ?? null,
      source: 'debt_payment',
      kind: 'debt_payment',
      category: null,
      amount: Number(row.amount ?? 0),
      paymentMethod: row.payment_method,
      comment: row.comment ?? null,
      createdAt: row.created_at ?? null,
    });
  });

  expenseRows
    .filter((row) => row.payment_source !== 'bar')
    .sort((rowA, rowB) => rowA.created_at.localeCompare(rowB.created_at))
    .forEach((row) => {
      activities.push({
        id: row.id,
        source: 'expense',
        kind: 'expense',
        category: row.category || 'other',
        amount: -Number(row.amount ?? 0),
        paymentMethod: row.payment_method ?? null,
        comment: row.comment,
        createdAt: row.created_at,
        ...(row.creator_name !== undefined ? { createdByName: row.creator_name } : {}),
      });
    });

  return activities;
}

export function buildMoneyReport(
  cashRows: MoneyReportCashRow[],
  expenseRows: ExpenseRow[],
  debtPaymentRows: MoneyReportDebtPaymentRow[] = [],
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
    const activities = buildDailyActivities(
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
      income: activities
        .filter((activity) => activity.amount > 0)
        .reduce((sum, activity) => sum + activity.amount, 0),
      expenses: activities
        .filter((activity) => activity.kind === 'expense')
        .reduce((sum, activity) => sum + Math.abs(activity.amount), 0),
      activities,
    };

    return day;
  });

  return { totalCollected, totalExpenses, totalLeft, paymentMethods, days };
}

export function buildFilteredMoneyReport(
  cashRows: MoneyReportCashRow[],
  expenseRows: ExpenseRow[],
  debtPaymentRows: MoneyReportDebtPaymentRow[] = [],
  categoryFilter: MoneyReportCategoryFilter = 'all',
): MoneyReport {
  if (categoryFilter === 'income') {
    return buildMoneyReport(cashRows, [], []);
  }
  if (categoryFilter === 'debt_payment') {
    return buildMoneyReport([], [], debtPaymentRows);
  }
  if (categoryFilter === 'expense') {
    return buildMoneyReport([], expenseRows, []);
  }
  if (categoryFilter.startsWith('expense:')) {
    const category = categoryFilter.slice('expense:'.length);
    return buildMoneyReport(
      [],
      expenseRows.filter((row) => row.category === category),
      [],
    );
  }

  return buildMoneyReport(cashRows, expenseRows, debtPaymentRows);
}
