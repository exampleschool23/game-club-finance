'use client';

import { useTranslations } from 'next-intl';
import { PieBreakdownChart, type PieBreakdownChartProps } from './PieBreakdownChart';

export function IncomeCategoryChart(props: Pick<PieBreakdownChartProps, 'data' | 'total'>) {
  const t = useTranslations('dashboard');
  return <PieBreakdownChart title={t('incomeByCategory')} {...props} />;
}
