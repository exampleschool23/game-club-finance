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

interface DashboardBarChartProps {
  title: string;
  data: Array<{ name: string; value: number; fill: string }>;
}

function formatAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export function DashboardBarChart({ title, data }: DashboardBarChartProps) {
  const t = useTranslations('dashboard');

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-gray-950">{title}</h2>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} interval={0} />
            <YAxis tickFormatter={formatAxis} tick={{ fontSize: 12, fill: '#475569' }} width={42} />
            <Tooltip formatter={(value) => [`${formatCurrency(Number(value))} UZS`, t('amount')]} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((item) => (
                <Cell key={item.name} fill={item.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
