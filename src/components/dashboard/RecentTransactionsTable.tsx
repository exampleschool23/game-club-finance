'use client';

import { ArrowDown, ArrowUp, CircleDollarSign } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/lib/formatters';

export interface RecentTransactionRow {
  id: string;
  type: 'Income' | 'Expense' | 'Purchase' | 'Debt Payment';
  description: string;
  amount: number;
  time: string;
}

interface RecentTransactionsTableProps {
  rows: RecentTransactionRow[];
}

function iconFor(type: RecentTransactionRow['type']) {
  if (type === 'Expense' || type === 'Purchase') return <ArrowDown size={14} className="text-red-500" />;
  if (type === 'Debt Payment') return <CircleDollarSign size={14} className="text-purple-600" />;
  return <ArrowUp size={14} className="text-green-600" />;
}

export function RecentTransactionsTable({ rows }: RecentTransactionsTableProps) {
  const t = useTranslations('dashboard');

  function typeLabel(type: RecentTransactionRow['type']): string {
    if (type === 'Income') return t('income');
    if (type === 'Expense') return t('expense');
    if (type === 'Purchase') return t('purchase');
    return t('debtPayment');
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-gray-950">{t('recentTransactions')}</h2>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-bold uppercase text-gray-500">
              <th className="py-3 text-left">{t('type')}</th>
              <th className="py-3 text-left">{t('description')}</th>
              <th className="py-3 text-right">{t('amount')}</th>
              <th className="py-3 text-right">{t('time')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-500">
                  {t('noRecentTransactions')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-2 font-semibold text-gray-800">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100">
                        {iconFor(row.type)}
                      </span>
                      {typeLabel(row.type)}
                    </span>
                  </td>
                  <td className="py-3 font-medium text-gray-900">{row.description}</td>
                  <td className="py-3 text-right font-semibold text-gray-900">
                    {formatCurrency(row.amount)} UZS
                  </td>
                  <td className="py-3 text-right text-gray-600">{row.time}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
