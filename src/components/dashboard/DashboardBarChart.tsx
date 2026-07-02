import { formatCurrency } from '@/lib/formatters';

interface DashboardBarChartProps {
  title: string;
  data: Array<{ name: string; value: number; fill: string }>;
}

export function DashboardBarChart({ title, data }: DashboardBarChartProps) {
  const maxValue = data.reduce((max, item) => Math.max(max, Math.abs(item.value)), 0);

  return (
    <section className="min-h-72 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-gray-950">{title}</h2>
      <div className="mt-4 space-y-3" role="list">
        {data.map((item) => {
          const width = maxValue > 0 ? `${(Math.abs(item.value) / maxValue) * 100}%` : '0%';
          const color = item.value < 0 ? '#ef4444' : item.fill;

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
                  <p className="min-w-0 text-sm font-semibold leading-5 text-gray-900">
                    {item.name}
                  </p>
                </div>
                <p className={`shrink-0 text-sm font-bold tabular-nums ${item.value < 0 ? 'text-red-600' : 'text-gray-950'}`}>
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
    </section>
  );
}
