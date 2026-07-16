'use client';

// Route: /daily-report

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { todayIso } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import {
  calculateTotalIncome,
  calculateNetProfit,
} from '@/lib/calculations/dailyReport';
import { calculateGameClubIncome } from '@/lib/calculations/dailyCash';
import { calculateBarMoney } from '@/lib/calculations/barMoney';
import { FileText, TrendingUp, TrendingDown, DollarSign, Users } from 'lucide-react';
import type { DailyCashEntry, DailyStockCount, Expense, StockPurchase } from '@/types';

interface ProductRow extends DailyStockCount {
  products: { name: string; sort_order?: number | null } | null;
}

function isMissingSortOrder(error: { message?: string } | null | undefined) {
  return error?.message?.includes('sort_order') ?? false;
}

export default function DailyReportPage() {
  const t = useTranslations('dailyReport');
  const tc = useTranslations('common');
  const te = useTranslations('expenses');
  const { selectedClubId, businessDayStartHour } = useClub();

  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [date, setDate] = useState(() => businessToday);
  const [cashEntry, setCashEntry] = useState<DailyCashEntry | null>(null);
  const [stockCounts, setStockCounts] = useState<ProductRow[]>([]);
  const [stockPurchases, setStockPurchases] = useState<StockPurchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [debtIncome, setDebtIncome] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (selectedDate: string) => {
    if (!selectedClubId) {
      setCashEntry(null);
      setStockCounts([]);
      setStockPurchases([]);
      setExpenses([]);
      setDebtIncome(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    let [cashRes, stockRes, purchaseRes, expRes, debtRes] = await Promise.all([
      supabase
        .from('daily_cash_entries')
        .select('*')
        .eq('club_id', selectedClubId)
        .eq('date', selectedDate)
        .maybeSingle(),
      supabase
        .from('daily_stock_counts')
        .select('*, products(name, sort_order)')
        .eq('club_id', selectedClubId)
        .eq('date', selectedDate),
      supabase
        .from('stock_purchases')
        .select('*')
        .eq('club_id', selectedClubId)
        .eq('date', selectedDate),
      supabase
        .from('expenses')
        .select('*')
        .eq('club_id', selectedClubId)
        .eq('date', selectedDate)
        .order('created_at'),
      supabase
        .from('new_debts')
        .select('amount')
        .eq('club_id', selectedClubId)
        .eq('date', selectedDate),
    ]);

    if (isMissingSortOrder(stockRes.error)) {
      stockRes = await supabase
        .from('daily_stock_counts')
        .select('*, products(name)')
        .eq('club_id', selectedClubId)
        .eq('date', selectedDate);
    }

    setCashEntry(cashRes.data as DailyCashEntry | null);
    setStockCounts(
      ((stockRes.data as ProductRow[]) ?? []).sort((a, b) => {
        const orderA = a.products?.sort_order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.products?.sort_order ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return (a.products?.name ?? a.product_id).localeCompare(b.products?.name ?? b.product_id);
      }),
    );
    setStockPurchases((purchaseRes.data as StockPurchase[]) ?? []);
    setExpenses((expRes.data as Expense[]) ?? []);
    setDebtIncome((debtRes.data ?? []).reduce((sum, debt) => sum + Number(debt.amount ?? 0), 0));
    setLoading(false);
  }, [selectedClubId]);

  useEffect(() => {
    fetchData(date).catch(() => {});
  }, [date, fetchData]);

  useEffect(() => {
    setDate(businessToday);
  }, [businessToday, selectedClubId]);

  const manualIncome = cashEntry
    ? calculateGameClubIncome({
        cashIncome: cashEntry.cash_income,
        terminalIncome: cashEntry.terminal_income,
        cardIncome: cashEntry.card_income,
        playstationIncome: cashEntry.playstation_income ?? 0,
      })
    : 0;

  const barIncome = calculateBarMoney(stockCounts, stockPurchases).barMoney;
  const totalIncome = calculateTotalIncome(manualIncome, barIncome, debtIncome);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = calculateNetProfit(totalIncome, totalExpenses);

  const hasData = cashEntry !== null || stockCounts.length > 0 || stockPurchases.length > 0 || expenses.length > 0 || debtIncome > 0;
  const currency = tc('currency');

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={t('title')} />

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <label className="label mb-0">{t('date')}</label>
        <input
          type="date"
          className="input-field w-full sm:w-auto"
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
              label={t('debtIncome')}
              value={`${formatCurrency(debtIncome)} ${currency}`}
              icon={Users}
              valueClassName="text-danger-600"
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
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
                {cashEntry.card_income > 0 && (
                  <div>
                    <p className="text-gray-500">{t('card')}</p>
                    <p className="font-semibold">{formatCurrency(cashEntry.card_income)}</p>
                  </div>
                )}
                {(cashEntry.playstation_income ?? 0) > 0 && (
                  <div>
                    <p className="text-gray-500">{t('playstation')}</p>
                    <p className="font-semibold">{formatCurrency(cashEntry.playstation_income ?? 0)}</p>
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
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-gray-500 font-medium">{t('product')}</th>
                      <th className="text-right py-2 text-gray-500 font-medium">{t('sold')}</th>
                      <th className="text-right py-2 text-gray-500 font-medium">{t('barIncome')}</th>
                      <th className="text-right py-2 text-gray-500 font-medium">{t('profit')}</th>
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
                  <div key={e.id} className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
                    <span className="text-gray-600">
                      {te(`categories.${e.category}` as Parameters<typeof te>[0])}
                      {e.comment ? ` · ${e.comment}` : ''}
                    </span>
                    <span className="font-medium text-danger-500">{formatCurrency(e.amount)}</span>
                  </div>
                ))}
                <div className="flex flex-col gap-1 border-t border-gray-100 pt-2 text-sm font-semibold sm:flex-row sm:justify-between">
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
