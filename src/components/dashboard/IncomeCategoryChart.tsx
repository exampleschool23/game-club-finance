'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/lib/utils';

interface IncomeCategoryChartProps {
  data: Array<{ name: string; value: number; color: string }>;
  total: number;
}

export function IncomeCategoryChart({ data, total }: IncomeCategoryChartProps) {
  const t = useTranslations('dashboard');

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-gray-950">{t('incomeByCategory')}</h2>
      <div className="mt-4 grid min-h-72 grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_0.9fr]">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius="58%" outerRadius="88%" paddingAngle={2}>
                {data.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${formatCurrency(Number(value))} UZS`, t('amount')]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg bg-gray-50 p-3 text-center">
            <p className="text-xl font-bold text-gray-950">{formatCurrency(total)}</p>
            <p className="text-xs font-medium text-gray-500">{t('total')}</p>
          </div>
          {data.map((item) => {
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <div key={item.name} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <div>
                  <p className="font-semibold text-gray-900">{item.name}</p>
                  <p className="text-gray-600">
                    {formatCurrency(item.value)} UZS ({pct}%)
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
