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
    <ChartCard title={title} description={t('totalMoneyLeftDesc')}>
      <div className="mt-4 flex flex-1 flex-col gap-5">
        <ChartTotal value={total} label={t('remainingAfterExpenses')} tone={total >= 0 ? 'success' : 'danger'} />
        {hasData ? <HorizontalBars data={data} /> : <ChartEmpty title={t('noMoneyLeftForPeriod')} />}
      </div>
    </ChartCard>
  );
}
