'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/lib/formatters';
import { ChartCard, chartColors, formatAxis } from './ChartCard';

export interface MonthlyAverageIncomePoint {
  month: string;
  average_daily_income: number;
  is_current: boolean;
}

interface MonthlyAverageIncomeChartProps {
  data: MonthlyAverageIncomePoint[];
  locale: string;
}

function monthLabel(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}T00:00:00Z`));
}

export function MonthlyAverageIncomeChart({ data, locale }: MonthlyAverageIncomeChartProps) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const currency = tc('currency');
  const chartData = data.map((point) => ({
    ...point,
    label: monthLabel(point.month, locale),
    value: Number(point.average_daily_income ?? 0),
  }));

  return (
    <ChartCard
      title={t('monthlyAverageIncomeTitle')}
      description={t('monthlyAverageIncomeDescription')}
      action={(
        <div className="flex flex-wrap gap-4 text-xs font-medium text-gray-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary-600" aria-hidden="true" />
            {t('finalizedMonth')}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-warning-500" aria-hidden="true" />
            {t('currentMonth')}
          </span>
        </div>
      )}
    >
      <div className="mt-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
            <CartesianGrid stroke={chartColors.grid} vertical={false} />
            <XAxis
              dataKey="label"
              interval={0}
              tick={{ fontSize: 11, fill: chartColors.axis }}
              tickLine={false}
              axisLine={{ stroke: chartColors.grid }}
              angle={-20}
              textAnchor="end"
              height={52}
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
              formatter={(value) => [`${formatCurrency(Number(value))} ${currency}`, t('averageDailyIncome')]}
              labelStyle={{ fontWeight: 600 }}
            />
            <Bar dataKey="value" name={t('averageDailyIncome')} radius={[4, 4, 0, 0]} maxBarSize={64}>
              {chartData.map((point) => (
                <Cell key={point.month} fill={point.is_current ? chartColors.warning : chartColors.primary} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
