export interface ExpenseEntry {
  id: string;
  date: string;
  amount: number;
  category: string;
  payment_method: string;
  comment: string | null;
}

/** Sum all expense amounts in the list */
export function calculateTotalExpenses(expenses: ExpenseEntry[]): number {
  return expenses.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
}

/** Filter expenses by ISO date (YYYY-MM-DD) */
export function filterExpensesByDate(expenses: ExpenseEntry[], date: string): ExpenseEntry[] {
  return expenses.filter((e) => e.date === date);
}

/** Filter expenses by category key */
export function filterExpensesByCategory(expenses: ExpenseEntry[], category: string): ExpenseEntry[] {
  return expenses.filter((e) => e.category === category);
}

/** Sum expenses grouped by category. Returns Record<category, total> */
export function expensesByCategory(expenses: ExpenseEntry[]): Record<string, number> {
  return expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount ?? 0);
    return acc;
  }, {});
}

/** Sum expenses grouped by payment_method. Returns Record<method, total> */
export function expensesByPaymentMethod(expenses: ExpenseEntry[]): Record<string, number> {
  return expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.payment_method] = (acc[e.payment_method] ?? 0) + Number(e.amount ?? 0);
    return acc;
  }, {});
}
