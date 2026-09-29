'use client';

import { useTranslations } from 'next-intl';
import { PieBreakdownChart } from './PieBreakdownChart';

interface ExpenseCategoryDatum {
  category: string;
  value: number;
}

interface ExpensesByCategoryChartProps {
  data: ExpenseCategoryDatum[];
  total: number;
}

const colors = ['#dc2626', '#ef4444', '#f97316', '#fb923c', '#f59e0b', '#ea580c', '#b91c1c', '#c2410c', '#f43f5e', '#d97706', '#991b1b'];

export function ExpensesByCategoryChart({ data, total }: ExpensesByCategoryChartProps) {
  const t = useTranslations('dashboard');
  const expenseCategories = useTranslations('expenses.categories');

  const chartData = data.map((item, index) => ({
    name: expenseCategories.has(item.category) ? expenseCategories(item.category as Parameters<typeof expenseCategories>[0]) : item.category.replace(/_/g, ' '),
    value: item.value,
    color: colors[index % colors.length],
  }));

  return (
    <PieBreakdownChart
      title={t('expensesByCategory')}
      data={chartData}
      total={total}
      totalLabel={t('totalExpenses')}
      totalTone="danger"
      emptyLabel={t('noExpensesForPeriod')}
    />
  );
}
