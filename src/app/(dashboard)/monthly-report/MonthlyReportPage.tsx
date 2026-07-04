'use client';

// Route: /monthly-report

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { currentYearMonth, monthRange } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/formatters';
import {
  calculateTotalIncome,
  calculateNetProfit,
} from '@/lib/calculations/dailyReport';
import { calculateGameClubIncome } from '@/lib/calculations/dailyCash';
import { BarChart2 } from 'lucide-react';

interface DayRow {
  date: string;
  manualIncome: number;
  barIncome: number;
  totalIncome: number;
  expenses: number;
  profit: number;
}

export default function MonthlyReportPage() {
  const t = useTranslations('monthlyReport');
  const tc = useTranslations('common');
  const { selectedClubId, businessDayStartHour } = useClub();
  const { locale } = useAppLocale();
  const businessYearMonth = useMemo(() => currentYearMonth(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [month, setMonth] = useState(() => businessYearMonth);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (selectedMonth: string) => {
    if (!selectedClubId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { from, to } = monthRange(selectedMonth);

    const [cashRes, stockRes, expRes] = await Promise.all([
      supabase
        .from('daily_cash_entries')
        .select('date,cash_income,terminal_income,card_income,playstation_income')
        .eq('club_id', selectedClubId)
        .gte('date', from)
        .lte('date', to),
      supabase
        .from('daily_stock_counts')
        .select('date,bar_income')
        .eq('club_id', selectedClubId)
        .gte('date', from)
        .lte('date', to),
      supabase
        .from('expenses')
        .select('date,amount')
        .eq('club_id', selectedClubId)
        .gte('date', from)
        .lte('date', to),
    ]);

    const cashEntries = cashRes.data ?? [];
    const stockCounts = stockRes.data ?? [];
    const expenses = expRes.data ?? [];

    // Collect all unique dates
    const datesSet = new Set<string>([
      ...cashEntries.map((r) => r.date),
      ...stockCounts.map((r) => r.date),
      ...expenses.map((r) => r.date),
    ]);
    const dates = Array.from(datesSet).sort().reverse();

    const dayRows: DayRow[] = dates.map((date) => {
      const cashEntry = cashEntries.find((r) => r.date === date);
      const manualIncome = cashEntry
        ? calculateGameClubIncome({
            cashIncome: cashEntry.cash_income,
            terminalIncome: cashEntry.terminal_income,
            cardIncome: cashEntry.card_income,
            playstationIncome: cashEntry.playstation_income ?? 0,
          })
        : 0;
      const barIncome = stockCounts
        .filter((r) => r.date === date)
        .reduce((s, r) => s + (r.bar_income ?? 0), 0);
      const totalIncome = calculateTotalIncome(manualIncome, barIncome);
      const dayExpenses = expenses
        .filter((r) => r.date === date)
        .reduce((s, r) => s + (r.amount ?? 0), 0);
      const profit = calculateNetProfit(totalIncome, dayExpenses);
      return { date, manualIncome, barIncome, totalIncome, expenses: dayExpenses, profit };
    });

    setRows(dayRows);
    setLoading(false);
  }, [selectedClubId]);

  useEffect(() => {
    fetchData(month).catch(() => {});
  }, [month, fetchData]);

  useEffect(() => {
    setMonth(businessYearMonth);
  }, [businessYearMonth, selectedClubId]);

  const totalIncome = rows.reduce((s, r) => s + r.totalIncome, 0);
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  const currency = tc('currency');

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t('title')} />

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <label className="label mb-0">{t('selectMonth')}</label>
        <input
          type="month"
          className="input-field w-full sm:w-auto"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-gray-500">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={BarChart2} title={t('noData')} />
      ) : (
        <div className="space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card text-center">
              <p className="text-sm text-gray-500">{t('totalIncome')}</p>
              <p className="text-xl font-bold text-success-600">
                {formatCurrency(totalIncome)} {currency}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500">{t('expenses')}</p>
              <p className="text-xl font-bold text-danger-500">
                {formatCurrency(totalExpenses)} {currency}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500">{t('profit')}</p>
              <p
                className={`text-xl font-bold ${
                  totalProfit >= 0 ? 'text-success-600' : 'text-danger-500'
                }`}
              >
                {formatCurrency(totalProfit)} {currency}
              </p>
            </div>
          </div>

          {/* Day-by-day table */}
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    {t('date')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('income')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('barIncome')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('totalIncome')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('expenses')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('profit')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row) => (
                  <tr key={row.date} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-700">{formatDate(row.date, locale)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(row.manualIncome)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(row.barIncome)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-success-600">
                      {formatCurrency(row.totalIncome)}
                    </td>
                    <td className="px-4 py-3 text-right text-danger-500">
                      {formatCurrency(row.expenses)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      <span className={row.profit >= 0 ? 'text-success-600' : 'text-danger-500'}>
                        {formatCurrency(row.profit)}
                      </span>
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                  <td className="px-4 py-3">{t('totals')}</td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(rows.reduce((s, r) => s + r.manualIncome, 0))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(rows.reduce((s, r) => s + r.barIncome, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-success-600">
                    {formatCurrency(totalIncome)}
                  </td>
                  <td className="px-4 py-3 text-right text-danger-500">
                    {formatCurrency(totalExpenses)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={totalProfit >= 0 ? 'text-success-600' : 'text-danger-500'}>
                      {formatCurrency(totalProfit)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
