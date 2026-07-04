'use client';

import { Fragment, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, CircleDollarSign } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export interface RecentTransactionRow {
  id: string;
  type: 'Income' | 'Expense' | 'Purchase' | 'Debt Payment';
  description: string;
  amount: number;
  date: string;
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
    description: string;
    amount: string;
  }
> = {
  Income: {
    icon: <ArrowUp size={14} />,
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    iconWrap: 'bg-emerald-100 text-emerald-700',
    description: 'font-bold text-emerald-700',
    amount: 'text-emerald-700',
  },
  Expense: {
    icon: <ArrowDown size={14} />,
    badge: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
    iconWrap: 'bg-rose-100 text-rose-700',
    description: 'font-bold text-rose-700',
    amount: 'text-rose-700',
  },
  Purchase: {
    icon: <ArrowDown size={14} />,
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
    iconWrap: 'bg-amber-100 text-amber-700',
    description: 'font-bold text-amber-700',
    amount: 'text-amber-700',
  },
  'Debt Payment': {
    icon: <CircleDollarSign size={14} />,
    badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
    iconWrap: 'bg-violet-100 text-violet-700',
    description: 'font-bold text-violet-700',
    amount: 'text-violet-700',
  },
};

function styleFor(type: RecentTransactionRow['type']) {
  return TRANSACTION_STYLES[type];
}

export function RecentTransactionsTable({ rows }: RecentTransactionsTableProps) {
  const t = useTranslations('dashboard');
  const groupedRows = rows.reduce<Array<{ date: string; rows: RecentTransactionRow[] }>>((groups, row) => {
    const lastGroup = groups.at(-1);
    if (lastGroup?.date === row.date) {
      lastGroup.rows.push(row);
    } else {
      groups.push({ date: row.date, rows: [row] });
    }
    return groups;
  }, []);

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
      <div className="mt-4 overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-bold uppercase text-gray-500">
              <th className="w-[108px] py-3 text-left">{t('type')}</th>
              <th className="py-3 text-left">{t('description')}</th>
              <th className="w-[116px] py-3 text-right">{t('amount')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-gray-500">
                  {t('noRecentTransactions')}
                </td>
              </tr>
            ) : (
              groupedRows.map((group) => (
                <Fragment key={group.date}>
                  <tr>
                    <td colSpan={3} className="bg-gray-50 px-3 py-2 text-xs font-bold uppercase text-gray-500">
                      {group.date}
                    </td>
                  </tr>
                  {group.rows.map((row) => {
                    const style = styleFor(row.type);

                    return (
                      <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                        <td className="py-3 pr-2 align-top">
                          <span className={cn('inline-flex h-8 max-w-full items-center gap-1.5 rounded-full px-2 text-xs font-bold', style.badge)}>
                            <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', style.iconWrap)}>
                              {style.icon}
                            </span>
                            <span className="truncate">{typeLabel(row.type)}</span>
                          </span>
                        </td>
                        <td className="py-3 pr-3 align-top">
                          <div className={cn('leading-5', style.description)}>{row.description}</div>
                          <div className="mt-1 text-xs font-semibold text-gray-500">{row.time}</div>
                        </td>
                        <td className={cn('whitespace-nowrap py-3 text-right align-top font-bold', style.amount)}>
                          {formatCurrency(row.amount)} UZS
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
