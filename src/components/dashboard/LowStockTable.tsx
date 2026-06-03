'use client';

import { useTranslations } from 'next-intl';

interface LowStockRow {
  id: string;
  product: string;
  stockLeft: number;
  minimumStock: number;
  status: string;
}

interface LowStockTableProps {
  rows: LowStockRow[];
}

export function LowStockTable({ rows }: LowStockTableProps) {
  const t = useTranslations('dashboard');

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-gray-950">{t('lowStockAlerts')}</h2>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-bold uppercase text-gray-500">
              <th className="py-3 text-left">{t('product')}</th>
              <th className="py-3 text-right">{t('stockLeft')}</th>
              <th className="py-3 text-right">{t('minimum')}</th>
              <th className="py-3 text-right">{t('status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-500">
                  {t('noLowStock')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="py-3 font-semibold text-gray-900">{row.product}</td>
                  <td className="py-3 text-right text-gray-700">{row.stockLeft}</td>
                  <td className="py-3 text-right text-gray-700">{row.minimumStock}</td>
                  <td className="py-3 text-right">
                    <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
