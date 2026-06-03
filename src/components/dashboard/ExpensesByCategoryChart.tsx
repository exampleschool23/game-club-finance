'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/lib/utils';

interface ExpenseCategoryDatum {
  category: string;
  value: number;
}

interface ExpensesByCategoryChartProps {
  data: ExpenseCategoryDatum[];
  total: number;
}

const colors = [
  '#dc2626',
  '#ef4444',
  '#f97316',
  '#fb923c',
  '#f59e0b',
  '#ea580c',
  '#b91c1c',
  '#c2410c',
  '#f43f5e',
  '#d97706',
  '#991b1b',
];

export function ExpensesByCategoryChart({ data, total }: ExpensesByCategoryChartProps) {
  const t = useTranslations('dashboard');
  const expenseCategories = useTranslations('expenses.categories');

  const categoryLabels: Record<string, string> = {
    rent: expenseCategories('rent'),
    salary: expenseCategories('salary'),
    electricity: expenseCategories('electricity'),
    internet: expenseCategories('internet'),
    repair: expenseCategories('repair'),
    cleaning: expenseCategories('cleaning'),
    food_drinks: expenseCategories('food_drinks'),
    marketing: expenseCategories('marketing'),
    equipment: expenseCategories('equipment'),
    tax: expenseCategories('tax'),
    other: expenseCategories('other'),
  };

  const chartData = data.map((item, index) => ({
    ...item,
    name: categoryLabels[item.category] ?? item.category.replace(/_/g, ' '),
    color: colors[index % colors.length],
  }));

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-gray-950">{t('expensesByCategory')}</h2>
      <div className="mt-4 grid min-h-72 grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_0.95fr]">
        {total === 0 ? (
          <div className="flex min-h-56 items-center justify-center rounded-lg bg-red-50/60 px-4 text-center text-sm font-semibold text-red-500 sm:col-span-2">
            {t('noExpensesForPeriod')}
          </div>
        ) : (
          <>
            <div className="relative h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    innerRadius="58%"
                    outerRadius="88%"
                    paddingAngle={2}
                    startAngle={180}
                    endAngle={-180}
                  >
                    {chartData.map((item) => (
                      <Cell key={item.category} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${formatCurrency(Number(value))} UZS`, t('amount')]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              <div className="rounded-lg bg-red-50 p-3 text-center">
                <p className="text-xl font-bold text-red-600">{formatCurrency(total)}</p>
                <p className="text-xs font-medium text-red-500">{t('totalExpenses')}</p>
              </div>
              <div className="max-h-44 space-y-3 overflow-y-auto pr-1">
                {chartData.map((item) => {
                  const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                  return (
                    <div key={item.category} className="flex items-start gap-3 text-sm">
                      <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-gray-900">{item.name}</p>
                        <p className="text-gray-600">
                          {formatCurrency(item.value)} UZS ({pct}%)
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
