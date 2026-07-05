'use client';

// Route: /

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Boxes,
  ChartNoAxesCombined,
  Gamepad2,
  MonitorSmartphone,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { todayIso } from '@/lib/utils';
import { formatDateOnly, formatDateShort, formatTime } from '@/lib/formatters';
import { useClub, useDashboardDate } from '@/components/layout/DashboardShell';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { PeriodTabs } from '@/components/dashboard/PeriodTabs';
import { DashboardBarChart } from '@/components/dashboard/DashboardBarChart';
import { PaymentMethodChart } from '@/components/dashboard/PaymentMethodChart';
import { IncomeTrendChart } from '@/components/dashboard/IncomeTrendChart';
import { IncomeCategoryChart } from '@/components/dashboard/IncomeCategoryChart';
import { ExpensesByCategoryChart } from '@/components/dashboard/ExpensesByCategoryChart';
import {
  buildPeriodTrend,
  calculateDashboardTotals,
  emptyDashboardTotals,
  getDashboardRange,
  getPreviousDashboardRange,
  percentChange,
  type DailyCashRow,
  type DashboardPeriod,
  type DashboardTotals,
  type ExpenseRow,
  type StockCountRow,
  type StockPurchaseCostRow,
  type TrendRow,
} from '@/lib/calculations/dashboardMetrics';
import type { Product } from '@/types';

interface StockPurchaseRow {
  id: string;
  date: string;
  quantity: number;
  cost_price: number;
  comment: string | null;
  created_at: string;
  products?: { name: string } | { name: string }[] | null;
}

interface DebtRow {
  id: string;
  person_name: string;
  remaining_amount: number;
  status: string;
}

interface DashboardData {
  totals: DashboardTotals;
  previousTotals: DashboardTotals;
  trend: TrendRow[];
  lowStockCount: number;
  expenseCategories: Array<{ category: string; value: number }>;
}

const emptyData: DashboardData = {
  totals: emptyDashboardTotals,
  previousTotals: emptyDashboardTotals,
  trend: [],
  lowStockCount: 0,
  expenseCategories: [],
};

function isMissingSortOrder(error: { message?: string } | null | undefined) {
  return error?.message?.includes('sort_order') ?? false;
}

async function fetchActiveProductsOrdered(supabase: ReturnType<typeof createClient>, clubId: string) {
  const ordered = await supabase
    .from('products')
    .select('*')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (!isMissingSortOrder(ordered.error)) return ordered;

  return supabase
    .from('products')
    .select('*')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .order('name', { ascending: true });
}

function inRangeQuery<T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(
  query: T,
  range: { from: string; to: string },
): T {
  return query.gte('date', range.from).lte('date', range.to);
}

export default function DashboardPage() {
  const { selectedDate } = useDashboardDate();
  const { selectedClubId, businessDayStartHour } = useClub();
  const { locale } = useAppLocale();
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [customFrom, setCustomFrom] = useState(() => businessToday);
  const [customTo, setCustomTo] = useState(() => businessToday);
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const t = useTranslations('dashboard');

  const range = useMemo(
    () => getDashboardRange(period, selectedDate || businessToday, { from: customFrom, to: customTo }),
    [businessToday, customFrom, customTo, period, selectedDate],
  );

  useEffect(() => {
    setCustomFrom(businessToday);
    setCustomTo(businessToday);
  }, [businessToday, selectedClubId]);

  const fetchDashboard = useCallback(async () => {
    if (!selectedClubId) {
      setData(emptyData);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const supabase = createClient();
    const previousRange = getPreviousDashboardRange(range);

    const [
      cashRes,
      stockRes,
      expenseRes,
      productRes,
      debtRes,
      purchaseRes,
      prevCashRes,
      prevStockRes,
      prevPurchaseRes,
      prevExpenseRes,
      trendCashRes,
      trendStockRes,
      trendPurchaseRes,
      trendExpenseRes,
    ] = await Promise.all([
      inRangeQuery(
        supabase
          .from('daily_cash_entries')
          .select('date,cash_income,terminal_income,card_income,playstation_income,created_at')
          .eq('club_id', selectedClubId),
        range,
      ),
      inRangeQuery(
        supabase
          .from('daily_stock_counts')
          .select('date,bar_income,bar_profit,bar_cost,sold_quantity,updated_at')
          .eq('club_id', selectedClubId),
        range,
      ),
      inRangeQuery(
        supabase
          .from('expenses')
          .select('id,date,amount,category,payment_source,comment,created_at')
          .eq('club_id', selectedClubId)
          .order('created_at', { ascending: false }),
        range,
      ),
      fetchActiveProductsOrdered(supabase, selectedClubId),
      supabase
        .from('new_debts')
        .select('id,person_name,remaining_amount,status')
        .eq('club_id', selectedClubId)
        .order('created_at', { ascending: false }),
      inRangeQuery(
        supabase
          .from('stock_purchases')
          .select('id,date,quantity,cost_price,comment,created_at')
          .eq('club_id', selectedClubId)
          .order('created_at', { ascending: false }),
        range,
      ),
      inRangeQuery(
        supabase
          .from('daily_cash_entries')
          .select('date,cash_income,terminal_income,card_income,playstation_income')
          .eq('club_id', selectedClubId),
        previousRange,
      ),
      inRangeQuery(
        supabase
          .from('daily_stock_counts')
          .select('date,bar_income,bar_profit,bar_cost,sold_quantity')
          .eq('club_id', selectedClubId),
        previousRange,
      ),
      inRangeQuery(
        supabase
          .from('stock_purchases')
          .select('date,quantity,cost_price,created_at')
          .eq('club_id', selectedClubId),
        previousRange,
      ),
      inRangeQuery(
        supabase
          .from('expenses')
          .select('id,date,amount,category,payment_source,comment,created_at')
          .eq('club_id', selectedClubId),
        previousRange,
      ),
      supabase
        .from('daily_cash_entries')
        .select('date,cash_income,terminal_income,card_income,playstation_income')
        .eq('club_id', selectedClubId)
        .gte('date', range.from)
        .lte('date', range.to),
      supabase
        .from('daily_stock_counts')
        .select('date,bar_income,bar_profit,bar_cost,sold_quantity')
        .eq('club_id', selectedClubId)
        .gte('date', range.from)
        .lte('date', range.to),
      supabase
        .from('stock_purchases')
        .select('date,quantity,cost_price,created_at')
        .eq('club_id', selectedClubId)
        .gte('date', range.from)
        .lte('date', range.to),
      supabase
        .from('expenses')
        .select('id,date,amount,category,payment_source,comment,created_at')
        .eq('club_id', selectedClubId)
        .gte('date', range.from)
        .lte('date', range.to),
    ]);

    const firstError = [
      cashRes.error,
      stockRes.error,
      expenseRes.error,
      productRes.error,
      debtRes.error,
      purchaseRes.error,
      prevCashRes.error,
      prevStockRes.error,
      prevPurchaseRes.error,
      prevExpenseRes.error,
      trendCashRes.error,
      trendStockRes.error,
      trendPurchaseRes.error,
      trendExpenseRes.error,
    ].find(Boolean);

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const cashRows = (cashRes.data ?? []) as DailyCashRow[];
    const stockRows = (stockRes.data ?? []) as StockCountRow[];
    const expenseRows = (expenseRes.data ?? []) as ExpenseRow[];
    const products = (productRes.data ?? []) as Product[];
    const debts = (debtRes.data ?? []) as DebtRow[];
    const purchases = (purchaseRes.data ?? []) as unknown as StockPurchaseRow[];
    const activeDebts = debts.filter((debt) => debt.status !== 'paid');

    const totals = calculateDashboardTotals(cashRows, stockRows, purchases, expenseRows, products, activeDebts);
    const previousTotals = calculateDashboardTotals(
      (prevCashRes.data ?? []) as DailyCashRow[],
      (prevStockRes.data ?? []) as StockCountRow[],
      (prevPurchaseRes.data ?? []) as StockPurchaseCostRow[],
      (prevExpenseRes.data ?? []) as ExpenseRow[],
      products,
      activeDebts,
    );

    const trendCashRows = (trendCashRes.data ?? []) as DailyCashRow[];
    const trendStockRows = (trendStockRes.data ?? []) as StockCountRow[];
    const trendPurchaseRows = (trendPurchaseRes.data ?? []) as StockPurchaseCostRow[];
    const trendExpenseRows = (trendExpenseRes.data ?? []) as ExpenseRow[];
    const trend = buildPeriodTrend(range, trendCashRows, trendStockRows, trendPurchaseRows, trendExpenseRows);

    const lowStockCount = products.filter(
      (product) => product.current_stock <= (product.low_stock_threshold ?? 5),
    ).length;

    const expenseCategories = Array.from(
      expenseRows.reduce((categoryMap, row) => {
        categoryMap.set(row.category, (categoryMap.get(row.category) ?? 0) + Number(row.amount ?? 0));
        return categoryMap;
      }, new Map<string, number>()),
      ([category, value]) => ({ category, value }),
    ).sort((a, b) => b.value - a.value);

    setData({
      totals,
      previousTotals,
      trend,
      lowStockCount,
      expenseCategories,
    });
    setLoading(false);
  }, [range, selectedClubId]);

  useEffect(() => {
    fetchDashboard().catch((fetchError) => {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      setLoading(false);
    });
  }, [fetchDashboard]);

  const { totals, previousTotals } = data;

  const periodLabel = period === 'today'
    ? t('today')
    : period === 'yesterday'
      ? t('yesterday')
      : period === 'last7Days'
        ? t('last7Days')
        : period === 'week'
          ? t('thisWeek')
          : period === 'lastWeek'
            ? t('lastWeek')
            : period === 'month'
              ? t('thisMonth')
              : period === 'lastMonth'
                ? t('lastMonth')
                : `${formatDateShort(range.from, locale)} - ${formatDateShort(range.to, locale)}`;

  const incomeComparisonLabel =
    period === 'today'
      ? t('vsYesterday')
      : period === 'week'
        ? t('vsLastWeek')
        : period === 'month'
          ? t('vsLastMonth')
          : t('vsPreviousPeriod');

  const trend = useMemo(
    () => data.trend.map((row) => ({
      ...row,
      date: formatDateShort(row.date, locale),
    })),
    [data.trend, locale],
  );

  const incomeExpenseData = [
    { name: t('gameClubIncome'), value: totals.computerIncome, fill: '#2563eb' },
    { name: t('playstationIncome'), value: totals.playstationIncome, fill: '#f59e0b' },
    { name: t('barSales'), value: totals.barSales, fill: '#f97316' },
    { name: t('stockPurchases'), value: totals.stockPurchaseCost, fill: '#dc2626' },
    { name: t('totalExpenses'), value: totals.totalExpenses, fill: '#ef4444' },
    { name: t('netProfit'), value: totals.netProfit, fill: '#22c55e' },
  ];

  const paymentData = [
    { name: t('cash'), value: totals.cashIncome, color: '#22c55e' },
    { name: t('terminal'), value: totals.terminalIncome, color: '#2563eb' },
    { name: t('card'), value: totals.cardIncome, color: '#7c3aed' },
  ];

  const categoryData = [
    { name: t('gameClub'), value: totals.computerIncome, color: '#2563eb' },
    { name: t('playstation'), value: totals.playstationIncome, color: '#f59e0b' },
    { name: t('barMoneyLeft'), value: Math.max(0, totals.barIncome), color: '#f97316' },
  ];
  const incomeCategoryTotal = categoryData.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-normal text-gray-950 sm:text-3xl">{t('title')}</h1>
          <p className="mt-1 text-base text-gray-600">{t('subtitle')}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <MetricCard
          label={t('gameClubIncome')}
          amount={totals.computerIncome}
          icon={MonitorSmartphone}
          iconBgClassName="bg-blue-100"
          iconClassName="text-blue-600"
          helper={t('gameClubIncomeMetricDesc')}
          comparison={{ value: percentChange(totals.computerIncome, previousTotals.computerIncome), label: incomeComparisonLabel }}
        />
        <MetricCard
          label={t('totalBarMoney')}
          amount={totals.barSales}
          icon={Banknote}
          iconBgClassName="bg-orange-100"
          iconClassName="text-orange-600"
          helper={t('totalBarMoneyDesc')}
          comparison={{ value: percentChange(totals.barSales, previousTotals.barSales), label: incomeComparisonLabel }}
        />
        <MetricCard
          label={t('stockPurchase')}
          amount={totals.stockPurchaseCost}
          icon={ShoppingBag}
          iconBgClassName="bg-red-100"
          iconClassName="text-red-500"
          helper={t('stockPurchaseMetricDesc')}
        />
        <MetricCard
          label={t('playstationIncome')}
          amount={totals.playstationIncome}
          icon={Gamepad2}
          iconBgClassName="bg-amber-100"
          iconClassName="text-amber-600"
          helper={t('playstationIncomeMetricDesc')}
          comparison={{ value: percentChange(totals.playstationIncome, previousTotals.playstationIncome), label: incomeComparisonLabel }}
        />
        <MetricCard
          label={t('barMoneyNetProfit')}
          amount={totals.barIncome}
          icon={ChartNoAxesCombined}
          iconBgClassName="bg-green-100"
          iconClassName="text-green-600"
          helper={t('barMoneyNetProfitDesc')}
          comparison={{ value: percentChange(totals.barIncome, previousTotals.barIncome), label: incomeComparisonLabel }}
        />
        <MetricCard
          label={t('totalMoneyLeft')}
          amount={totals.gameClubMoneyLeft}
          icon={Wallet}
          iconBgClassName="bg-emerald-100"
          iconClassName="text-emerald-600"
          helper={t('totalMoneyLeftDesc')}
          comparison={{ value: percentChange(totals.gameClubMoneyLeft, previousTotals.gameClubMoneyLeft), label: incomeComparisonLabel }}
        />
        <MetricCard
          label={t('inventoryValue')}
          amount={totals.inventoryValue}
          icon={Boxes}
          iconBgClassName="bg-blue-100"
          iconClassName="text-blue-600"
          helper={`${t('inventoryValueDesc')} - ${t('lowStockAlertsCount', { count: data.lowStockCount })}`}
        />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <PeriodTabs
          value={period}
          onChange={setPeriod}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
      </section>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm font-semibold text-gray-500">
          {t('loading')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <DashboardBarChart title={`${t('incomeVsExpenses')} (${periodLabel})`} data={incomeExpenseData} />
            <PaymentMethodChart
              title={`${t('incomeByPaymentMethod')} (${periodLabel})`}
              data={paymentData}
              total={totals.computerIncome}
            />
            <IncomeTrendChart data={trend} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ExpensesByCategoryChart data={data.expenseCategories} total={totals.totalExpenses} />
            <IncomeCategoryChart data={categoryData} total={incomeCategoryTotal} />
          </div>
        </>
      )}
    </div>
  );
}
