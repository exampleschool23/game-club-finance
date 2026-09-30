'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { formatCurrency } from '@/lib/formatters';
import { ChartCard, chartColors, formatAxis } from './ChartCard';

interface IncomeTrendChartProps {
  data: Array<{ date: string; income: number; expenses: number }>;
}

export function IncomeTrendChart({ data }: IncomeTrendChartProps) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const { locale } = useAppLocale();
  const currency = tc('currency');
  const seriesNames: Record<string, string> = { income: t('income'), expenses: t('expenses') };

  return (
    <ChartCard
      title={t('incomeTrend')}
      action={(
        <div className="flex flex-wrap gap-4 text-xs font-medium text-gray-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary-600" aria-hidden="true" />
            {t('income')}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-danger-500/55" aria-hidden="true" />
            {t('expenses')}
          </span>
        </div>
      )}
    >
      <div className="mt-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
            barGap={2}
            barCategoryGap="25%"
          >
            <CartesianGrid stroke={chartColors.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: chartColors.axis }}
              tickLine={false}
              axisLine={{ stroke: chartColors.grid }}
              minTickGap={16}
            />
            <YAxis
              tickFormatter={(value: number) => formatAxis(value, locale)}
              tick={{ fontSize: 11, fill: chartColors.axis }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: chartColors.cursor }}
              formatter={(value, name) => [`${formatCurrency(Number(value))} ${currency}`, seriesNames[String(name)] ?? String(name)]}
            />
            <Bar dataKey="income" name="income" fill={chartColors.primary} radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Bar dataKey="expenses" name="expenses" fill={chartColors.danger} fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
