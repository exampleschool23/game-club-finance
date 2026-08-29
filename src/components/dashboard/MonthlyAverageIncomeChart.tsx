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

export interface MonthlyAverageIncomePoint {
  month: string;
  average_daily_income: number;
  is_current: boolean;
}

interface MonthlyAverageIncomeChartProps {
  data: MonthlyAverageIncomePoint[];
  locale: string;
}

function formatAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function monthLabel(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}T00:00:00Z`));
}

export function MonthlyAverageIncomeChart({ data, locale }: MonthlyAverageIncomeChartProps) {
  const t = useTranslations('dashboard');
  const chartData = data.map((point) => ({
    ...point,
    label: monthLabel(point.month, locale),
    value: Number(point.average_daily_income ?? 0),
  }));

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-950 sm:text-lg">{t('monthlyAverageIncomeTitle')}</h2>
          <p className="mt-1 text-sm font-medium text-gray-500">{t('monthlyAverageIncomeDescription')}</p>
        </div>
        <div className="flex flex-wrap gap-4 text-xs font-semibold text-gray-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-teal-600" />
            {t('finalizedMonth')}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-orange-500" />
            {t('currentMonth')}
          </span>
        </div>
      </div>

      <div className="mt-5 h-80 sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 12, right: 8, bottom: 8, left: 4 }}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="label"
              interval={0}
              tick={{ fontSize: 11, fill: '#64748b' }}
              angle={-20}
              textAnchor="end"
              height={58}
            />
            <YAxis tickFormatter={formatAxis} tick={{ fontSize: 12, fill: '#64748b' }} width={48} />
            <Tooltip
              formatter={(value) => [`${formatCurrency(Number(value))} UZS`, t('averageDailyIncome')]}
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
    </section>
  );
}

