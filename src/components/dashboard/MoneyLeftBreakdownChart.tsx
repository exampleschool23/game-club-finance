'use client';

import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/lib/formatters';

interface MoneyLeftBreakdownDatum {
  name: string;
  value: number;
  color: string;
}

interface MoneyLeftBreakdownChartProps {
  title: string;
  data: MoneyLeftBreakdownDatum[];
  total: number;
}

export function MoneyLeftBreakdownChart({ title, data, total }: MoneyLeftBreakdownChartProps) {
  const t = useTranslations('dashboard');
  const maxValue = data.reduce((max, item) => Math.max(max, Math.abs(item.value)), 0);
  const hasData = data.some((item) => item.value !== 0) || total !== 0;
  const isPositiveTotal = total >= 0;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-gray-950">{title}</h2>
      <div className="mt-4 grid min-h-72 grid-cols-1 gap-4 sm:grid-cols-[1fr_0.85fr]">
        {hasData ? (
          <div className="space-y-4" role="list">
            {data.map((item) => {
              const color = item.value < 0 ? '#ef4444' : item.color;
              const width = maxValue > 0 ? `${(Math.abs(item.value) / maxValue) * 100}%` : '0%';

              return (
                <div
                  key={item.name}
                  className="space-y-2"
                  role="listitem"
                  aria-label={`${item.name}: ${formatCurrency(item.value)} UZS`}
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <span
                        className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <p className="min-w-0 break-words text-sm font-semibold leading-5 text-gray-900">
                        {item.name}
                      </p>
                    </div>
                    <p
                      className={`shrink-0 text-sm font-bold tabular-nums ${
                        item.value < 0 ? 'text-red-600' : 'text-gray-950'
                      }`}
                    >
                      {formatCurrency(item.value)} UZS
                    </p>
                  </div>

                  <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width,
                        minWidth: item.value === 0 ? undefined : '0.75rem',
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-56 items-center justify-center rounded-lg bg-emerald-50/70 px-4 text-center text-sm font-semibold text-emerald-600">
            {t('noMoneyLeftForPeriod')}
          </div>
        )}

        <div className="space-y-3">
          <div className={`rounded-lg p-3 text-center ${isPositiveTotal ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <p className={`text-xl font-bold ${isPositiveTotal ? 'text-emerald-700' : 'text-red-600'}`}>
              {formatCurrency(total)}
            </p>
            <p className={`text-xs font-medium ${isPositiveTotal ? 'text-emerald-600' : 'text-red-500'}`}>
              {t('remainingAfterExpenses')}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-xs font-medium leading-5 text-gray-600">
            {t('totalMoneyLeftDesc')}
          </div>
        </div>
      </div>
    </section>
  );
}
