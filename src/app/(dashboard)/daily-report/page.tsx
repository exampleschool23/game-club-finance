import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { IncomeTransaction, ExpenseTransaction } from '@/types';

// Get last 31 days
function getLast31Days(): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 31; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export default async function DailyReportPage() {
  const t = await getTranslations('dailyReport');
  const te = await getTranslations('expense');
  const ti = await getTranslations('income');
  const supabase = await createClient();

  const dates = getLast31Days();
  const from = dates[dates.length - 1];
  const to = dates[0];

  const [{ data: incomes }, { data: expenses }] = await Promise.all([
    supabase.from('income_transactions').select('*').gte('transaction_date', from).lte('transaction_date', to),
    supabase.from('expense_transactions').select('*').gte('transaction_date', from).lte('transaction_date', to),
  ]);

  // Group by date
  const byDate = dates.map((date) => {
    const dayIncome = (incomes as IncomeTransaction[] ?? []).filter((r) => r.transaction_date === date);
    const dayExpense = (expenses as ExpenseTransaction[] ?? []).filter((r) => r.transaction_date === date);
    const totalIncome  = dayIncome.reduce((s, r) => s + r.amount, 0);
    const totalExpense = dayExpense.reduce((s, r) => s + r.amount, 0);

    const incomeByMethod: Record<string, number> = {};
    dayIncome.forEach((r) => {
      incomeByMethod[r.payment_method] = (incomeByMethod[r.payment_method] ?? 0) + r.amount;
    });

    const expenseByCategory: Record<string, number> = {};
    dayExpense.forEach((r) => {
      expenseByCategory[r.category] = (expenseByCategory[r.category] ?? 0) + r.amount;
    });

    return { date, totalIncome, totalExpense, profit: totalIncome - totalExpense, incomeByMethod, expenseByCategory, hasData: totalIncome > 0 || totalExpense > 0 };
  }).filter((d) => d.hasData);

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>

      {byDate.length === 0 && (
        <div className="card text-center text-gray-500 py-12">{t('noData')}</div>
      )}

      {byDate.map(({ date, totalIncome, totalExpense, profit, incomeByMethod, expenseByCategory }) => (
        <div key={date} className="card">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-gray-900 text-base">
              {formatDate(date)}
            </h2>
            <div className="flex gap-4 text-sm">
              <span className="text-success-600 font-medium">+{formatCurrency(totalIncome)}</span>
              <span className="text-danger-600 font-medium">−{formatCurrency(totalExpense)}</span>
              <span className={cn('font-bold', profit >= 0 ? 'text-primary-700' : 'text-danger-700')}>
                ={formatCurrency(profit)}
              </span>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Income breakdown */}
            {Object.keys(incomeByMethod).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Доход
                </p>
                <div className="space-y-1">
                  {Object.entries(incomeByMethod).map(([method, amt]) => (
                    <div key={method} className="flex justify-between text-sm">
                      <span className="text-gray-600">{ti(`methods.${method}`)}</span>
                      <span className="font-medium text-success-700">{formatCurrency(amt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expense breakdown */}
            {Object.keys(expenseByCategory).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Расход
                </p>
                <div className="space-y-1">
                  {Object.entries(expenseByCategory).map(([cat, amt]) => (
                    <div key={cat} className="flex justify-between text-sm">
                      <span className="text-gray-600">{te(`categories.${cat}`)}</span>
                      <span className="font-medium text-danger-700">{formatCurrency(amt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
