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

/** Donut + legend chart shared by payment-method, income-category and expense charts. */
export function PieBreakdownChart({ title, data, total, totalLabel, emptyLabel, totalTone = 'neutral' }: PieBreakdownChartProps) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const currency = tc('currency');
  const hasData = data.some((item) => item.value > 0);

  return (
    <ChartCard title={title}>
      <div className="mt-4 grid min-h-72 grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_0.9fr]">
        {!hasData ? (
          <ChartEmpty title={emptyLabel ?? t('noComparisonData')} className="sm:col-span-2" />
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart accessibilityLayer>
                  <Pie data={data} dataKey="value" innerRadius="58%" outerRadius="88%" paddingAngle={2}>
                    {data.map((item) => <Cell key={item.name} fill={item.color} />)}
                  </Pie>
                  <Tooltip formatter={(value) => [`${formatCurrency(Number(value))} ${currency}`, t('amount')]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              <ChartTotal value={total} label={totalLabel ?? t('total')} tone={totalTone} />
              <div
                className="max-h-44 overflow-y-auto rounded-md pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                role="region"
                tabIndex={0}
                aria-label={t('chartLegendLabel', { title })}
              >
                <ChartLegend items={data.map((item) => ({ key: item.name, ...item }))} total={total} />
              </div>
            </div>
          </>
        )}
      </div>
    </ChartCard>
  );
}
