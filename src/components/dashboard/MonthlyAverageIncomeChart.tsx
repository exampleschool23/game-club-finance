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
import { ChartCard, formatAxis } from './ChartCard';

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
        <div className="flex flex-wrap gap-4 text-xs font-semibold text-gray-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-teal-600" aria-hidden="true" />
            {t('finalizedMonth')}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-orange-500" aria-hidden="true" />
            {t('currentMonth')}
          </span>
        </div>
      )}
    >

      <div className="mt-5 h-80 sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer data={chartData} margin={{ top: 12, right: 8, bottom: 8, left: 4 }}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="label"
              interval={0}
              tick={{ fontSize: 11, fill: '#64748b' }}
              angle={-20}
              textAnchor="end"
              height={58}
            />
            <YAxis tickFormatter={(value: number) => formatAxis(value, locale)} tick={{ fontSize: 12, fill: '#64748b' }} width={48} />
            <Tooltip
              formatter={(value) => [`${formatCurrency(Number(value))} ${currency}`, t('averageDailyIncome')]}
              labelStyle={{ fontWeight: 700 }}
            />
            <Bar dataKey="value" name={t('averageDailyIncome')} radius={[7, 7, 0, 0]} maxBarSize={88}>
              {chartData.map((point) => (
                <Cell key={point.month} fill={point.is_current ? '#f97316' : '#0f766e'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

