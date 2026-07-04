'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, CircleDollarSign } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

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

const TRANSACTION_STYLES: Record<
  RecentTransactionRow['type'],
  {
    icon: ReactNode;
    badge: string;
    iconWrap: string;
    amount: string;
  }
> = {
  Income: {
    icon: <ArrowUp size={14} />,
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    iconWrap: 'bg-emerald-100 text-emerald-700',
    amount: 'text-emerald-700',
  },
  Expense: {
    icon: <ArrowDown size={14} />,
    badge: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
    iconWrap: 'bg-rose-100 text-rose-700',
    amount: 'text-rose-700',
  },
  Purchase: {
    icon: <ArrowDown size={14} />,
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
    iconWrap: 'bg-amber-100 text-amber-700',
    amount: 'text-amber-700',
  },
  'Debt Payment': {
    icon: <CircleDollarSign size={14} />,
    badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
    iconWrap: 'bg-violet-100 text-violet-700',
    amount: 'text-violet-700',
  },
};

function styleFor(type: RecentTransactionRow['type']) {
  return TRANSACTION_STYLES[type];
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
              rows.map((row) => {
                const style = styleFor(row.type);

                return (
                  <tr key={row.id}>
                    <td className="py-3">
                      <span className={cn('inline-flex h-8 items-center gap-2 rounded-full px-2.5 text-xs font-bold', style.badge)}>
                        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full', style.iconWrap)}>
                          {style.icon}
                        </span>
                        {typeLabel(row.type)}
                      </span>
                    </td>
                    <td className="py-3 font-medium text-gray-900">{row.description}</td>
                    <td className={cn('py-3 text-right font-bold', style.amount)}>
                      {formatCurrency(row.amount)} UZS
                    </td>
                    <td className="py-3 text-right text-gray-600">{row.time}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
