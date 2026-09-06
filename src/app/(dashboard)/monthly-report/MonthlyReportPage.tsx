'use client';

// Route: /monthly-report

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricGridSkeleton, TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { MonthPicker } from '@/components/ui/CalendarPicker';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { currentYearMonth, monthRange } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { calculateFinancialReportTotals } from '@/lib/calculations/dailyReport';
import { calculateGameClubIncome } from '@/lib/calculations/dailyCash';
import { fetchFinanceReportSnapshot } from '@/lib/supabase/financeReportSnapshot';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { BarChart2 } from 'lucide-react';

interface DayRow {
  date: string;
  manualIncome: number;
  barSales: number;
  debtIncome: number;
  totalIncome: number;
  barCost: number;
  stockPurchaseCost: number;
  barExpenses: number;
  expenses: number;
  barCashLeft: number;
  accountingNetProfit: number;
}

interface MonthlyCashRow {
  date: string;
  cash_income: number;
  terminal_income: number;
  card_income: number;
  playstation_income: number | null;
}

interface MonthlyAmountRow {
  date: string;
  amount: number;
}

interface MonthlyStockRow {
  date: string;
  bar_income: number;
  bar_cost: number;
}

interface MonthlyPurchaseRow {
  date: string;
  quantity: number;
  cost_price: number;
}

interface MonthlyExpenseRow extends MonthlyAmountRow {
  payment_source: 'game_club' | 'bar' | null;
}

function groupRowsByDate<T extends { date: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const rows = grouped.get(item.date);
    if (rows) rows.push(item);
    else grouped.set(item.date, [item]);
  }
  return grouped;
}

export default function MonthlyReportPage() {
  const t = useTranslations('monthlyReport');
  const tc = useTranslations('common');
  const { selectedClubId, businessDayStartHour } = useClub();
  const { locale } = useAppLocale();
  const businessYearMonth = useMemo(() => currentYearMonth(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [month, setMonth] = useState(() => businessYearMonth);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const requestSequence = useRef(0);

  const fetchData = useCallback(async (selectedMonth: string) => {
    const requestId = ++requestSequence.current;

    if (!selectedClubId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');
    const supabase = createClient();
    const { from, to } = monthRange(selectedMonth);

    const snapshotResult = await fetchFinanceReportSnapshot(
      supabase,
      selectedClubId,
      from,
      to,
      ['cash', 'stock_totals', 'purchases', 'expenses', 'debts'],
    );

    if (requestId !== requestSequence.current) return;

    if (snapshotResult.error) {
      setRows([]);
      setLoadError(snapshotResult.error.message);
      setLoading(false);
      return;
    }

    let cashEntries: MonthlyCashRow[];
    let stockCounts: MonthlyStockRow[];
    let stockPurchases: MonthlyPurchaseRow[];
    let expenses: MonthlyExpenseRow[];
    let debts: MonthlyAmountRow[];

    if (snapshotResult.data) {
      cashEntries = snapshotResult.data.cashRows;
      stockCounts = snapshotResult.data.stockTotalRows;
      stockPurchases = snapshotResult.data.purchaseRows;
      expenses = snapshotResult.data.expenseRows;
      debts = snapshotResult.data.debtRows;
    } else {
      // Compatibility path while migration 049 is being deployed.
      const [cashRes, stockRes, purchaseRes, expRes, debtRes] = await Promise.all([
        fetchAllRows<MonthlyCashRow>(() => supabase
          .from('daily_cash_entries')
          .select('date,cash_income,terminal_income,card_income,playstation_income')
          .eq('club_id', selectedClubId)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: true })),
        fetchAllRows<MonthlyStockRow>(() => supabase
          .from('daily_stock_counts')
          .select('date,bar_income,bar_cost')
          .eq('club_id', selectedClubId)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: true })
          .order('product_id', { ascending: true })),
        fetchAllRows<MonthlyPurchaseRow>(() => supabase
          .from('stock_purchases')
          .select('date,quantity,cost_price')
          .eq('club_id', selectedClubId)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: true })
          .order('id', { ascending: true })),
        fetchAllRows<MonthlyExpenseRow>(() => supabase
          .from('expenses')
          .select('date,amount,payment_source')
          .eq('club_id', selectedClubId)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: true })
          .order('id', { ascending: true })),
        fetchAllRows<MonthlyAmountRow>(() => supabase
          .from('new_debts')
          .select('date,amount')
          .eq('club_id', selectedClubId)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: true })
          .order('id', { ascending: true })),
      ]);

      if (requestId !== requestSequence.current) return;

      const firstError = [cashRes, stockRes, purchaseRes, expRes, debtRes]
        .find((result) => result.error)?.error;
      if (firstError) {
        setRows([]);
        setLoadError(firstError.message);
        setLoading(false);
        return;
      }

      cashEntries = (cashRes.data ?? []) as MonthlyCashRow[];
      stockCounts = (stockRes.data ?? []) as MonthlyStockRow[];
      stockPurchases = (purchaseRes.data ?? []) as MonthlyPurchaseRow[];
      expenses = (expRes.data ?? []) as MonthlyExpenseRow[];
      debts = (debtRes.data ?? []) as MonthlyAmountRow[];
    }

    const cashByDate = groupRowsByDate(cashEntries);
    const stockByDate = groupRowsByDate(stockCounts);
    const purchasesByDate = groupRowsByDate(stockPurchases);
    const expensesByDate = groupRowsByDate(expenses);
    const debtsByDate = groupRowsByDate(debts);
    const datesSet = new Set<string>([
      ...cashByDate.keys(),
      ...stockByDate.keys(),
      ...purchasesByDate.keys(),
      ...expensesByDate.keys(),
      ...debtsByDate.keys(),
    ]);
    const dates = Array.from(datesSet).sort().reverse();

    const dayRows: DayRow[] = dates.map((date) => {
      const cashEntry = cashByDate.get(date)?.[0];
      const manualIncome = cashEntry
        ? calculateGameClubIncome({
            cashIncome: cashEntry.cash_income,
            terminalIncome: cashEntry.terminal_income,
            cardIncome: cashEntry.card_income,
            playstationIncome: cashEntry.playstation_income ?? 0,
          })
        : 0;
      const debtIncome = (debtsByDate.get(date) ?? [])
        .reduce((sum, debt) => sum + Number(debt.amount ?? 0), 0);
      const totals = calculateFinancialReportTotals({
        manualIncome,
        debtIncome,
        stockRows: stockByDate.get(date) ?? [],
        purchaseRows: purchasesByDate.get(date) ?? [],
        expenseRows: expensesByDate.get(date) ?? [],
      });
      return {
        date,
        manualIncome,
        barSales: totals.barSales,
        debtIncome,
        totalIncome: totals.totalIncome,
        barCost: totals.barCost,
        stockPurchaseCost: totals.stockPurchaseCost,
        barExpenses: totals.barExpenses,
        expenses: totals.totalExpenses,
        barCashLeft: totals.barCashLeft,
        accountingNetProfit: totals.accountingNetProfit,
      };
    });

    setRows(dayRows);
    setLoadError('');
    setLoading(false);
  }, [selectedClubId]);

  useEffect(() => {
    let cancelled = false;
    fetchData(month).catch((fetchError) => {
      if (cancelled) return;
      setRows([]);
      setLoadError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [month, fetchData]);

  useEffect(() => {
    setMonth(businessYearMonth);
  }, [businessYearMonth, selectedClubId]);

  const totalIncome = rows.reduce((s, r) => s + r.totalIncome, 0);
  const totalBarCost = rows.reduce((s, r) => s + r.barCost, 0);
  const totalStockPurchaseCost = rows.reduce((s, r) => s + r.stockPurchaseCost, 0);
  const totalBarExpenses = rows.reduce((s, r) => s + r.barExpenses, 0);
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0);
  const totalBarCashLeft = rows.reduce((s, r) => s + r.barCashLeft, 0);
  const totalAccountingNetProfit = rows.reduce((s, r) => s + r.accountingNetProfit, 0);
  const currency = tc('currency');

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title={t('title')} />

      {loadError && <p className="mb-4 rounded-lg bg-danger-50 p-3 text-sm text-danger-600">{loadError}</p>}

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <label className="label mb-0">{t('selectMonth')}</label>
        <MonthPicker value={month} onChange={setMonth} className="w-full sm:w-72" />
      </div>

      {loading ? (
        <div className="space-y-4">
          <MetricGridSkeleton count={7} className="lg:grid-cols-4" />
          <TableSkeleton rows={8} columns={11} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={BarChart2} title={t('noData')} />
      ) : (
        <div className="space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card text-center">
              <p className="text-sm text-gray-500">{t('totalIncome')}</p>
              <p className="text-xl font-bold text-success-600">
                {formatCurrency(totalIncome)} {currency}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500">{t('inventoryPurchases')}</p>
              <p className="text-xl font-bold text-danger-500">
                {formatCurrency(totalStockPurchaseCost)} {currency}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500">{t('barExpenses')}</p>
              <p className="text-xl font-bold text-danger-500">
                {formatCurrency(totalBarExpenses)} {currency}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500">{t('barCashLeft')}</p>
              <p className={`text-xl font-bold ${totalBarCashLeft >= 0 ? 'text-success-600' : 'text-danger-500'}`}>
                {formatCurrency(totalBarCashLeft)} {currency}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500">{t('costOfGoodsSold')}</p>
              <p className="text-xl font-bold text-danger-500">
                {formatCurrency(totalBarCost)} {currency}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500">{t('expenses')}</p>
              <p className="text-xl font-bold text-danger-500">
                {formatCurrency(totalExpenses)} {currency}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500">{t('accountingNetProfit')}</p>
              <p
                className={`text-xl font-bold ${
                  totalAccountingNetProfit >= 0 ? 'text-success-600' : 'text-danger-500'
                }`}
              >
                {formatCurrency(totalAccountingNetProfit)} {currency}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500">{t('barCashFormula')}</p>

          {/* Day-by-day table */}
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
            <table className="w-full min-w-[1460px] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    {t('date')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('gameClubIncome')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('barSales')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('debtIncome')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('totalIncome')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('costOfGoodsSold')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('inventoryPurchases')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('barExpenses')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('expenses')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('barCashLeft')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    {t('accountingNetProfit')}
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
                      {formatCurrency(row.barSales)}
                    </td>
                    <td className="px-4 py-3 text-right text-danger-600">
                      {formatCurrency(row.debtIncome)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-success-600">
                      {formatCurrency(row.totalIncome)}
                    </td>
                    <td className="px-4 py-3 text-right text-danger-500">
                      {formatCurrency(row.barCost)}
                    </td>
                    <td className="px-4 py-3 text-right text-danger-500">
                      {formatCurrency(row.stockPurchaseCost)}
                    </td>
                    <td className="px-4 py-3 text-right text-danger-500">
                      {formatCurrency(row.barExpenses)}
                    </td>
                    <td className="px-4 py-3 text-right text-danger-500">
                      {formatCurrency(row.expenses)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      <span className={row.barCashLeft >= 0 ? 'text-success-600' : 'text-danger-500'}>
                        {formatCurrency(row.barCashLeft)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      <span className={row.accountingNetProfit >= 0 ? 'text-success-600' : 'text-danger-500'}>
                        {formatCurrency(row.accountingNetProfit)}
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
                    {formatCurrency(rows.reduce((s, r) => s + r.barSales, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-danger-600">
                    {formatCurrency(rows.reduce((s, r) => s + r.debtIncome, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-success-600">
                    {formatCurrency(totalIncome)}
                  </td>
                  <td className="px-4 py-3 text-right text-danger-500">
                    {formatCurrency(totalBarCost)}
                  </td>
                  <td className="px-4 py-3 text-right text-danger-500">
                    {formatCurrency(totalStockPurchaseCost)}
                  </td>
                  <td className="px-4 py-3 text-right text-danger-500">
                    {formatCurrency(totalBarExpenses)}
                  </td>
                  <td className="px-4 py-3 text-right text-danger-500">
                    {formatCurrency(totalExpenses)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={totalBarCashLeft >= 0 ? 'text-success-600' : 'text-danger-500'}>
                      {formatCurrency(totalBarCashLeft)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={totalAccountingNetProfit >= 0 ? 'text-success-600' : 'text-danger-500'}>
                      {formatCurrency(totalAccountingNetProfit)}
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
