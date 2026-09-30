'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/lib/formatters';
import { ChartCard, ChartEmpty, ChartLegend, ChartTotal } from './ChartCard';

export interface PieBreakdownChartProps {
  title: string;
  data: Array<{ name: string; value: number; color: string }>;
  total: number;
  totalLabel?: string;
  emptyLabel?: string;
  totalTone?: 'neutral' | 'danger' | 'success';
}

/** Donut + legend chart shared by the payment-method and income-category charts. */
export function PieBreakdownChart({ title, data, total, totalLabel, emptyLabel, totalTone = 'neutral' }: PieBreakdownChartProps) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const currency = tc('currency');
  const hasData = data.some((item) => item.value > 0);

  return (
    <ChartCard title={title}>
      <div className="mt-4 flex flex-1 flex-col gap-4">
        <ChartTotal value={total} label={totalLabel ?? t('total')} tone={totalTone} />
        {!hasData ? (
          <ChartEmpty title={emptyLabel ?? t('noComparisonData')} />
        ) : (
          // Pie above, legend below: side by side the legend has no room for
          // "11 505 000 сум 16%" once the card shares a row with a chart.
          <div className="flex flex-col gap-3">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart accessibilityLayer>
                  <Pie data={data} dataKey="value" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">
                    {data.map((item) => <Cell key={item.name} fill={item.color} />)}
                  </Pie>
                  <Tooltip formatter={(value) => [`${formatCurrency(Number(value))} ${currency}`, t('amount')]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div
              className="max-h-48 overflow-y-auto rounded-md pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              role="region"
              tabIndex={0}
              aria-label={t('chartLegendLabel', { title })}
            >
              <ChartLegend items={data.map((item) => ({ key: item.name, ...item }))} total={total} />
            </div>
          </div>
        )}
      </div>
    </ChartCard>
  );
}
