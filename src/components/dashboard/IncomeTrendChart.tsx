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
import { formatCurrency } from '@/lib/utils';

interface IncomeTrendChartProps {
  data: Array<{ date: string; income: number; expenses: number }>;
}

function formatAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export function IncomeTrendChart({ data }: IncomeTrendChartProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-gray-950">Income Trend</h2>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#475569' }} />
            <YAxis tickFormatter={formatAxis} tick={{ fontSize: 12, fill: '#475569' }} width={42} />
            <Tooltip formatter={(value) => [`${formatCurrency(Number(value))} UZS`, 'Amount']} />
            <Legend />
            <Bar dataKey="income" name="Income" fill="#2563eb" radius={[5, 5, 0, 0]} />
            <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
