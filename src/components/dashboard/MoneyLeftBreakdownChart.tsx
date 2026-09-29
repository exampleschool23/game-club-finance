'use client';

import { useTranslations } from 'next-intl';
import { ChartCard, ChartEmpty, ChartTotal, HorizontalBars } from './ChartCard';

interface MoneyLeftBreakdownChartProps {
  title: string;
  data: Array<{ name: string; value: number; color: string }>;
  total: number;
}

export function MoneyLeftBreakdownChart({ title, data, total }: MoneyLeftBreakdownChartProps) {
  const t = useTranslations('dashboard');
  const hasData = data.some((item) => item.value !== 0) || total !== 0;

  return (
    <ChartCard title={title}>
      <div className="mt-4 grid min-h-72 grid-cols-1 gap-4 sm:grid-cols-[1fr_0.85fr]">
        {hasData ? <HorizontalBars data={data} /> : <ChartEmpty title={t('noMoneyLeftForPeriod')} />}
        <div className="space-y-3">
          <ChartTotal value={total} label={t('remainingAfterExpenses')} tone={total >= 0 ? 'success' : 'danger'} />
          <div className="rounded-lg bg-gray-50 p-3 text-xs font-medium leading-5 text-gray-600">{t('totalMoneyLeftDesc')}</div>
        </div>
      </div>
    </ChartCard>
  );
}
