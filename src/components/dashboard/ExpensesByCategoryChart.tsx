'use client';

import { useTranslations } from 'next-intl';
import { ChartCard, ChartEmpty, ChartTotal, HorizontalBars, chartColors } from './ChartCard';

interface ExpenseCategoryDatum {
  category: string;
  value: number;
}

interface ExpensesByCategoryChartProps {
  data: ExpenseCategoryDatum[];
  total: number;
}

/** Categories shown on their own; everything below them folds into "Other". */
const TOP_CATEGORIES = 5;

export function ExpensesByCategoryChart({ data, total }: ExpensesByCategoryChartProps) {
  const t = useTranslations('dashboard');
  const expenseCategories = useTranslations('expenses.categories');
  const otherLabel = expenseCategories('other');

  const sorted = [...data].sort((a, b) => b.value - a.value);
  const top: Array<{ name: string; value: number; color: string }> = sorted.slice(0, TOP_CATEGORIES).map((item) => ({
    name: expenseCategories.has(item.category)
      ? expenseCategories(item.category as Parameters<typeof expenseCategories>[0])
      : item.category.replace(/_/g, ' '),
    value: item.value,
    color: chartColors.danger,
  }));
  const rest = sorted.slice(TOP_CATEGORIES).reduce((sum, item) => sum + item.value, 0);
  const existingOther = top.find((item) => item.name === otherLabel);
  if (rest > 0 && existingOther) {
    existingOther.value += rest;
  } else if (rest > 0) {
    top.push({ name: otherLabel, value: rest, color: chartColors.gray });
  }
  const hasData = top.some((item) => item.value > 0);

  return (
    <ChartCard title={t('expensesByCategory')}>
      <div className="mt-4 flex flex-1 flex-col gap-5">
        <ChartTotal value={total} label={t('totalExpenses')} tone="danger" />
        {hasData ? <HorizontalBars data={top} /> : <ChartEmpty title={t('noExpensesForPeriod')} />}
      </div>
    </ChartCard>
  );
}
