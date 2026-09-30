'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { formatCurrency } from '@/lib/formatters';
import { ChartCard, formatAxis } from './ChartCard';

interface IncomeTrendChartProps {
  data: Array<{ date: string; income: number; expenses: number }>;
}

export function IncomeTrendChart({ data }: IncomeTrendChartProps) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const { locale } = useAppLocale();
  const currency = tc('currency');

  return (
    <ChartCard title={t('incomeTrend')}>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#475569' }} />
            <YAxis tickFormatter={(value: number) => formatAxis(value, locale)} tick={{ fontSize: 12, fill: '#475569' }} width={42} />
            <Tooltip formatter={(value) => [`${formatCurrency(Number(value))} ${currency}`, t('amount')]} />
            <Legend />
            <Bar dataKey="income" name={t('income')} fill="#2563eb" radius={[5, 5, 0, 0]} />
            <Bar dataKey="expenses" name={t('expenses')} fill="#ef4444" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
