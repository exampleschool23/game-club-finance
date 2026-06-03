'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate, todayIso } from '@/lib/utils';
import {
  calculateManualIncome,
  calculateTotalIncome,
  calculateNetProfit,
} from '@/lib/calculations/dailyReport';
import { FileText, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import type { DailyCashEntry, DailyStockCount, Expense } from '@/types';

interface ProductRow extends DailyStockCount {
  products: { name: string } | null;
}

export default function DailyReportPage() {
  const t = useTranslations('dailyReport');
  const tc = useTranslations('common');
  const te = useTranslations('expenses');

  const [date, setDate] = useState(todayIso());
  const [cashEntry, setCashEntry] = useState<DailyCashEntry | null>(null);
  const [stockCounts, setStockCounts] = useState<ProductRow[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (selectedDate: string) => {
    setLoading(true);
    const supabase = createClient();

    const [cashRes, stockRes, expRes] = await Promise.all([
      supabase.from('daily_cash_entries').select('*').eq('date', selectedDate).maybeSingle(),
      supabase
        .from('daily_stock_counts')
        .select('*, products(name)')
        .eq('date', selectedDate),
      supabase.from('expenses').select('*').eq('date', selectedDate).order('created_at'),
    ]);

    setCashEntry(cashRes.data as DailyCashEntry | null);
    setStockCounts((stockRes.data as ProductRow[]) ?? []);
    setExpenses((expRes.data as Expense[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData(date).catch(() => {});
  }, [date, fetchData]);

  const manualIncome = cashEntry
    ? calculateManualIncome({
        cash_income: cashEntry.cash_income,
        terminal_income: cashEntry.terminal_income,
        qr_income: cashEntry.qr_income,
        transfer_income: cashEntry.transfer_income,
        debt_income: cashEntry.debt_income,
        game_income: cashEntry.game_income,
        other_income: cashEntry.other_income,
      })
    : 0;

  const barIncome = stockCounts.reduce((s, r) => s + r.bar_income, 0);
  const totalIncome = calculateTotalIncome(manualIncome, barIncome);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = calculateNetProfit(totalIncome, totalExpenses);

  const hasData = cashEntry !== null || stockCounts.length > 0 || expenses.length > 0;
  const currency = tc('currency');

  return (
    <div className="max-w-4xl">
      <PageHeader title={t('title')} />

      <div className="mb-6 flex items-center gap-3">
        <label className="label mb-0">{t('date')}</label>
        <input
          type="date"
          className="input-field w-auto"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-gray-500">{tc('loading')}</p>
      ) : !hasData ? (
        <EmptyState icon={FileText} title={t('noData')} />
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard
              label={t('manualIncome')}
              value={`${formatCurrency(manualIncome)} ${currency}`}
              icon={TrendingUp}
              valueClassName="text-success-600"
            />
            <MetricCard
              label={t('barIncome')}
              value={`${formatCurrency(barIncome)} ${currency}`}
              icon={TrendingUp}
              valueClassName="text-success-600"
            />
            <MetricCard
              label={t('totalExpenses')}
              value={`${formatCurrency(totalExpenses)} ${currency}`}
              icon={TrendingDown}
              valueClassName="text-danger-500"
            />
            <MetricCard
              label={t('netProfit')}
              value={`${formatCurrency(netProfit)} ${currency}`}
              icon={DollarSign}
              valueClassName={netProfit >= 0 ? 'text-success-600' : 'text-danger-500'}
            />
          </div>

          {/* Cash Entry */}
          {cashEntry && (
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {t('cashEntry')}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {cashEntry.cash_income > 0 && (
                  <div>
                    <p className="text-gray-500">{tc('paymentMethods.cash')}</p>
                    <p className="font-semibold">{formatCurrency(cashEntry.cash_income)}</p>
                  </div>
                )}
                {cashEntry.terminal_income > 0 && (
                  <div>
                    <p className="text-gray-500">{tc('paymentMethods.terminal')}</p>
                    <p className="font-semibold">{formatCurrency(cashEntry.terminal_income)}</p>
                  </div>
                )}
                {cashEntry.qr_income > 0 && (
                  <div>
                    <p className="text-gray-500">{tc('paymentMethods.qr')}</p>
                    <p className="font-semibold">{formatCurrency(cashEntry.qr_income)}</p>
                  </div>
                )}
                {cashEntry.transfer_income > 0 && (
                  <div>
                    <p className="text-gray-500">{tc('paymentMethods.transfer')}</p>
                    <p className="font-semibold">{formatCurrency(cashEntry.transfer_income)}</p>
                  </div>
                )}
                {cashEntry.debt_income > 0 && (
                  <div>
                    <p className="text-gray-500">{tc('paymentMethods.debt')}</p>
                    <p className="font-semibold">{formatCurrency(cashEntry.debt_income)}</p>
                  </div>
                )}
                {cashEntry.game_income > 0 && (
                  <div>
                    <p className="text-gray-500">Game</p>
                    <p className="font-semibold">{formatCurrency(cashEntry.game_income)}</p>
                  </div>
                )}
                {cashEntry.other_income > 0 && (
                  <div>
                    <p className="text-gray-500">Other</p>
                    <p className="font-semibold">{formatCurrency(cashEntry.other_income)}</p>
                  </div>
                )}
              </div>
              {cashEntry.comment && (
                <p className="mt-2 text-xs text-gray-400">{cashEntry.comment}</p>
              )}
            </div>
          )}

          {/* Bar Stock Summary */}
          {stockCounts.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {t('stockSummary')}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-gray-500 font-medium">Product</th>
                      <th className="text-right py-2 text-gray-500 font-medium">Sold</th>
                      <th className="text-right py-2 text-gray-500 font-medium">{t('barIncome')}</th>
                      <th className="text-right py-2 text-gray-500 font-medium">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockCounts.map((sc) => (
                      <tr key={sc.id} className="border-b border-gray-50">
                        <td className="py-2">{sc.products?.name ?? sc.product_id}</td>
                        <td className="py-2 text-right">{sc.sold_quantity}</td>
                        <td className="py-2 text-right text-success-600">
                          {formatCurrency(sc.bar_income)}
                        </td>
                        <td className="py-2 text-right font-medium">
                          <span className={sc.bar_profit >= 0 ? 'text-success-600' : 'text-danger-500'}>
                            {formatCurrency(sc.bar_profit)}
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-2">{tc('total')}</td>
                      <td />
                      <td className="py-2 text-right text-success-600">
                        {formatCurrency(barIncome)}
                      </td>
                      <td className="py-2 text-right">
                        {formatCurrency(stockCounts.reduce((s, r) => s + r.bar_profit, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Expenses */}
          {expenses.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {t('expensesList')}
              </h2>
              <div className="space-y-2">
                {expenses.map((e) => (
                  <div key={e.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      {te(`categories.${e.category}` as Parameters<typeof te>[0])}
                      {e.comment ? ` · ${e.comment}` : ''}
                    </span>
                    <span className="font-medium text-danger-500">{formatCurrency(e.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold border-t border-gray-100 pt-2">
                  <span>{tc('total')}</span>
                  <span className="text-danger-500">{formatCurrency(totalExpenses)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
