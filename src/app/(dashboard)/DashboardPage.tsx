'use client';

// Route: /

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BadgeDollarSign,
  Boxes,
  CalendarDays,
  ChartNoAxesCombined,
  Gamepad2,
  MonitorSmartphone,
  Users,
  Wallet,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { todayIso } from '@/lib/utils';
import { formatDateShort } from '@/lib/formatters';
import { useClub } from '@/components/layout/DashboardShell';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { DateRangePicker } from '@/components/ui/CalendarPicker';
import {
  buildPeriodTrend,
  calculateAverageDailyIncome,
  calculateDashboardInventoryValue,
  calculateDashboardTotals,
  calculateGameClubMoneyLeftByPaymentMethod,
  calculateInventoryValueFromLatestStockCounts,
  countDashboardRangeDaysThroughDate,
  getDashboardComparisonRange,
  getDashboardRange,
  getLatestRowDateInRange,
  percentChange,
  type DailyCashRow,
  type DashboardPeriod,
  type DebtPaymentValueRow,
  type ExpenseRow,
  type InventorySnapshotRow,
  type StockCountRow,
  type StockPurchaseCostRow,
} from '@/lib/calculations/dashboardMetrics';
import {
  buildDashboardDataFromSnapshot,
  emptyDashboardData,
  type DashboardData,
  type DashboardSnapshotPayload,
} from '@/lib/calculations/dashboardSnapshot';
import { isMissingDatabaseFunction } from '@/lib/supabase/errors';
import {
  markPerformanceRpcAvailable,
  markPerformanceRpcMissing,
  shouldTryPerformanceRpc,
} from '@/lib/supabase/performanceRpc';
import type { Product } from '@/types';

function ChartLoading() {
  return <div className="h-80 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />;
}

const DashboardBarChart = dynamic(
  () => import('@/components/dashboard/DashboardBarChart').then((module) => module.DashboardBarChart),
  { ssr: false, loading: ChartLoading },
);
const PaymentMethodChart = dynamic(
  () => import('@/components/dashboard/PaymentMethodChart').then((module) => module.PaymentMethodChart),
  { ssr: false, loading: ChartLoading },
);
const IncomeTrendChart = dynamic(
  () => import('@/components/dashboard/IncomeTrendChart').then((module) => module.IncomeTrendChart),
  { ssr: false, loading: ChartLoading },
);
const IncomeCategoryChart = dynamic(
  () => import('@/components/dashboard/IncomeCategoryChart').then((module) => module.IncomeCategoryChart),
  { ssr: false, loading: ChartLoading },
);
const ExpensesByCategoryChart = dynamic(
  () => import('@/components/dashboard/ExpensesByCategoryChart').then((module) => module.ExpensesByCategoryChart),
  { ssr: false, loading: ChartLoading },
);
const MoneyLeftBreakdownChart = dynamic(
  () => import('@/components/dashboard/MoneyLeftBreakdownChart').then((module) => module.MoneyLeftBreakdownChart),
  { ssr: false, loading: ChartLoading },
);

interface StockPurchaseRow extends StockPurchaseCostRow {
  id: string;
  comment: string | null;
  created_at: string;
}

interface DebtRow {
  id: string;
  person_name: string;
  date: string;
  amount: number;
  remaining_amount: number;
  status: string;
}

const dashboardPresetPeriods = ['today', 'yesterday', 'last7Days', 'week', 'lastWeek', 'month', 'lastMonth'] as const;

function dashboardPeriodFromQuery(value: string | null): DashboardPeriod {
  return [...dashboardPresetPeriods, 'custom'].includes(value as DashboardPeriod)
    ? value as DashboardPeriod
    : 'month';
}

function validQueryDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function initialDashboardRange(
  query: { get: (name: string) => string | null },
  businessToday: string,
): { from: string; to: string } {
  const queryFrom = query.get('from');
  const queryTo = query.get('to');

  if (validQueryDate(queryFrom) && validQueryDate(queryTo)) {
    return queryFrom <= queryTo
      ? { from: queryFrom, to: queryTo }
      : { from: queryTo, to: queryFrom };
  }

  return getDashboardRange(dashboardPeriodFromQuery(query.get('period')), businessToday, {
    from: businessToday,
    to: businessToday,
  });
}

function dashboardPeriodForRange(
  range: { from: string; to: string },
  businessToday: string,
): DashboardPeriod {
  return dashboardPresetPeriods.find((preset) => {
    const presetRange = getDashboardRange(preset, businessToday);
    return presetRange.from === range.from && presetRange.to === range.to;
  }) ?? 'custom';
}

function isMissingSortOrder(error: { message?: string } | null | undefined) {
  return error?.message?.includes('sort_order') ?? false;
}

async function fetchActiveProductsOrdered(supabase: ReturnType<typeof createClient>, clubId: string) {
  const ordered = await fetchAllRows<Product>(() =>
    supabase
      .from('products')
      .select('*')
      .eq('club_id', clubId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .order('id', { ascending: true }),
  );

  if (!isMissingSortOrder(ordered.error)) return ordered;

  return fetchAllRows<Product>(() =>
    supabase
      .from('products')
      .select('*')
      .eq('club_id', clubId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .order('id', { ascending: true }),
  );
}

function inRangeQuery<T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(
  query: T,
  range: { from: string; to: string },
): T {
  return query.gte('date', range.from).lte('date', range.to);
}

interface MetricSectionProps {
  title: string;
  description: string;
  children: ReactNode;
  gridClassName: string;
  className: string;
  titleClassName: string;
  actionLabel?: string;
  onAction?: () => void;
}

function MetricSection({
  title,
  description,
  children,
  gridClassName,
  className,
  titleClassName,
  actionLabel,
  onAction,
}: MetricSectionProps) {
  return (
    <section className={`space-y-4 rounded-xl p-4 ring-1 sm:p-5 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={`text-lg font-bold tracking-normal sm:text-xl ${titleClassName}`}>{title}</h2>
          <p className="mt-1 max-w-4xl text-sm font-semibold leading-5 text-gray-700">{description}</p>
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-white px-4 py-2.5 text-base font-bold text-gray-900 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:self-center"
          >
            {actionLabel}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className={gridClassName}>{children}</div>
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { selectedClubId, businessDayStartHour, role } = useClub();
  const { locale } = useAppLocale();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [range, setRange] = useState(() => initialDashboardRange(searchParams, businessToday));
  const [data, setData] = useState<DashboardData>(emptyDashboardData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const hasMountedRangeSync = useRef(false);
  const t = useTranslations('dashboard');

  const period = useMemo(
    () => dashboardPeriodForRange(range, businessToday),
    [businessToday, range],
  );

  useEffect(() => {
    if (!hasMountedRangeSync.current) {
      hasMountedRangeSync.current = true;
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('period');
    params.set('from', range.from);
    params.set('to', range.to);

    const nextQuery = params.toString();
    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [pathname, range.from, range.to, router, searchParams]);

  const fetchDashboard = useCallback(async () => {
    const requestId = ++requestSequence.current;

    if (!selectedClubId) {
      setData(emptyDashboardData);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const supabase = createClient();
    const previousRange = getDashboardComparisonRange(period, range);
    const lastMonthRange = getDashboardRange('lastMonth', businessToday);
    const inventoryComparisonRange = period === 'lastMonth' ? previousRange : lastMonthRange;
    const inventoryQueryRange = period === 'lastMonth'
      ? { from: previousRange.from, to: range.to }
      : lastMonthRange;

    if (shouldTryPerformanceRpc()) {
      const snapshotResult = await supabase.rpc('get_dashboard_snapshot', {
        p_club_id: selectedClubId,
        p_range_from: range.from,
        p_range_to: range.to,
        p_previous_from: previousRange.from,
        p_previous_to: previousRange.to,
        p_inventory_from: inventoryComparisonRange.from,
        p_inventory_to: inventoryComparisonRange.to,
      });

      if (requestId !== requestSequence.current) return;

      if (!snapshotResult.error) {
        const snapshot = snapshotResult.data as Omit<DashboardSnapshotPayload, 'inventoryRows'> & {
          inventoryRows?: InventorySnapshotRow[];
        };
        setData(buildDashboardDataFromSnapshot({
          period,
          range,
          previousRange,
          inventoryComparisonRange,
          payload: {
            ...snapshot,
            inventoryRows: snapshot.inventoryRows ?? snapshot.stockRows as unknown as InventorySnapshotRow[],
          },
        }));
        markPerformanceRpcAvailable();
        setLoading(false);
        return;
      }

      if (!isMissingDatabaseFunction(snapshotResult.error, 'get_dashboard_snapshot')) {
        setError(snapshotResult.error.message);
        setLoading(false);
        return;
      }

      markPerformanceRpcMissing();
    }

    // Compatibility path for deployments where migration 030 has not reached
    // the database yet. Each table is read once for the union of the current
    // and comparison periods, keeping the fallback to one parallel phase.
    const financeRange = {
      from: range.from < previousRange.from ? range.from : previousRange.from,
      to: range.to > previousRange.to ? range.to : previousRange.to,
    };

    const [
      cashRes,
      stockRes,
      expenseRes,
      productRes,
      debtRes,
      debtPaymentRes,
      purchaseRes,
      inventorySnapshotRes,
    ] = await Promise.all([
      fetchAllRows<DailyCashRow>(() =>
        inRangeQuery(
          supabase
            .from('daily_cash_entries')
            .select('date,cash_income,terminal_income,card_income,playstation_income,created_at')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true }),
          financeRange,
        ),
      ),
      fetchAllRows<StockCountRow>(() =>
        inRangeQuery(
          supabase
            .from('daily_stock_counts')
            .select('product_id,date,bar_income,bar_profit,bar_cost,sold_quantity,updated_at')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true })
            .order('product_id', { ascending: true }),
          financeRange,
        ),
      ),
      fetchAllRows<ExpenseRow>(() =>
        inRangeQuery(
          supabase
            .from('expenses')
            .select('id,date,amount,category,payment_method,payment_source,comment,created_at')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true })
            .order('id', { ascending: true }),
          financeRange,
        ),
      ),
      fetchActiveProductsOrdered(supabase, selectedClubId),
      fetchAllRows<DebtRow>(() =>
        supabase
          .from('new_debts')
          .select('id,person_name,date,amount,remaining_amount,status')
          .eq('club_id', selectedClubId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true }),
      ),
      fetchAllRows<DebtPaymentValueRow>(() =>
        inRangeQuery(
          supabase
            .from('debt_payments')
            .select('id,date,amount,payment_method')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true })
            .order('id', { ascending: true }),
          financeRange,
        ),
      ),
      fetchAllRows<StockPurchaseRow>(() =>
        inRangeQuery(
          supabase
            .from('stock_purchases')
            .select('id,date,quantity,cost_price,comment,created_at')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true })
            .order('id', { ascending: true }),
          financeRange,
        ),
      ),
      fetchAllRows<InventorySnapshotRow>(() =>
        supabase
          .from('daily_stock_counts')
          .select('product_id,date,closing_stock,cost_price,products(tracks_inventory)')
          .eq('club_id', selectedClubId)
          .gte('date', inventoryQueryRange.from)
          .lte('date', inventoryQueryRange.to)
          .order('date', { ascending: true })
          .order('product_id', { ascending: true }),
      ),
    ]);

    if (requestId !== requestSequence.current) return;

    const firstError = [
      cashRes.error,
      stockRes.error,
      expenseRes.error,
      productRes.error,
      debtRes.error,
      debtPaymentRes.error,
      purchaseRes.error,
      inventorySnapshotRes.error,
    ].find(Boolean);

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const allCashRows = (cashRes.data ?? []) as DailyCashRow[];
    const allStockRows = (stockRes.data ?? []) as StockCountRow[];
    const allExpenseRows = (expenseRes.data ?? []) as ExpenseRow[];
    const products = (productRes.data ?? []) as Product[];
    const debts = (debtRes.data ?? []) as DebtRow[];
    const allPurchases = (purchaseRes.data ?? []) as unknown as StockPurchaseRow[];
    const allDebtPayments = (debtPaymentRes.data ?? []) as DebtPaymentValueRow[];
    const cashRows = allCashRows.filter((row) => row.date >= range.from && row.date <= range.to);
    const stockRows = allStockRows.filter((row) => row.date >= range.from && row.date <= range.to);
    const expenseRows = allExpenseRows.filter((row) => row.date >= range.from && row.date <= range.to);
    const purchases = allPurchases.filter((row) => row.date >= range.from && row.date <= range.to);
    const debtPayments = allDebtPayments.filter((row) => row.date >= range.from && row.date <= range.to);
    const activeDebts = debts.filter((debt) => debt.status !== 'paid');
    const rangeDebts = debts.filter((debt) => debt.date >= range.from && debt.date <= range.to);
    const inventorySnapshotRows = (inventorySnapshotRes.data ?? []) as InventorySnapshotRow[];
    const inventoryComparisonRows = inventorySnapshotRows.filter(
      (row) => row.date >= inventoryComparisonRange.from && row.date <= inventoryComparisonRange.to,
    );

    const liveTotals = calculateDashboardTotals(
      cashRows,
      stockRows,
      purchases,
      expenseRows,
      products,
      rangeDebts,
      debtPayments,
      activeDebts,
    );
    const totals = {
      ...liveTotals,
      inventoryValue: calculateDashboardInventoryValue(
        period,
        liveTotals.inventoryValue,
        inventorySnapshotRows,
        range,
      ),
    };
    const inventoryComparisonValue = calculateInventoryValueFromLatestStockCounts(
      inventoryComparisonRows,
    );
    const moneyLeftByPaymentMethod = calculateGameClubMoneyLeftByPaymentMethod(
      cashRows,
      expenseRows,
      debtPayments,
    );
    const latestDailyCashEntryDate = getLatestRowDateInRange([...cashRows, ...rangeDebts], range);
    const latestBarEntryDate = getLatestRowDateInRange(stockRows, range);
    const trend = buildPeriodTrend(range, cashRows, stockRows, purchases, expenseRows, rangeDebts);
    const lowStockCount = products.filter(
      (product) => product.tracks_inventory !== false
        && product.current_stock <= (product.low_stock_threshold ?? 5),
    ).length;
    const expenseCategories = Array.from(
      expenseRows.reduce((categoryMap, row) => {
        categoryMap.set(row.category, (categoryMap.get(row.category) ?? 0) + Number(row.amount ?? 0));
        return categoryMap;
      }, new Map<string, number>()),
      ([category, value]) => ({ category, value }),
    ).sort((a, b) => b.value - a.value);
    const previousDebts = debts.filter(
      (debt) => debt.date >= previousRange.from && debt.date <= previousRange.to,
    );
    const previousTotals = calculateDashboardTotals(
      allCashRows.filter((row) => row.date >= previousRange.from && row.date <= previousRange.to),
      allStockRows.filter((row) => row.date >= previousRange.from && row.date <= previousRange.to),
      allPurchases.filter((row) => row.date >= previousRange.from && row.date <= previousRange.to),
      allExpenseRows.filter((row) => row.date >= previousRange.from && row.date <= previousRange.to),
      products,
      previousDebts,
      allDebtPayments.filter((row) => row.date >= previousRange.from && row.date <= previousRange.to),
      activeDebts,
    );

    setData({
      totals,
      previousTotals,
      inventoryComparisonValue,
      hasInventoryComparisonData: inventoryComparisonRows.length > 0,
      trend,
      lowStockCount,
      expenseCategories,
      moneyLeftByPaymentMethod,
      latestDailyCashEntryDate,
      latestBarEntryDate,
    });
    setLoading(false);
  }, [businessToday, period, range, selectedClubId]);

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

  const comparisonFor = (current: number, previous: number, label = incomeComparisonLabel) => {
    const value = percentChange(current, previous);
    return { value, label: value === null ? t('noComparisonData') : label };
  };

  const trend = useMemo(
    () => data.trend.map((row) => ({
      ...row,
      date: formatDateShort(row.date, locale),
    })),
    [data.trend, locale],
  );
  const averageBarDayCount = countDashboardRangeDaysThroughDate(range, data.latestBarEntryDate);
  const averageGameClubDayCount = countDashboardRangeDaysThroughDate(range, data.latestDailyCashEntryDate);
  const averageGameClubIncome = calculateAverageDailyIncome(totals.gameClubIncome, averageGameClubDayCount);
  const averageBarIncome = calculateAverageDailyIncome(totals.barSales, averageBarDayCount);

  const incomeExpenseData = [
    { name: t('gameClubIncome'), value: totals.computerIncome, fill: '#2563eb' },
    { name: t('playstationIncome'), value: totals.playstationIncome, fill: '#f59e0b' },
    { name: t('barSales'), value: totals.barSales, fill: '#f97316' },
    { name: t('barCostOfGoodsSold'), value: totals.barCost, fill: '#dc2626' },
    { name: t('totalExpenses'), value: totals.totalExpenses, fill: '#ef4444' },
    { name: t('netProfit'), value: totals.accountingNetProfit, fill: '#22c55e' },
  ];

  const paymentData = [
    { name: t('cash'), value: totals.cashIncome, color: '#22c55e' },
    { name: t('terminal'), value: totals.terminalIncome, color: '#2563eb' },
    { name: t('card'), value: totals.cardIncome, color: '#7c3aed' },
    { name: t('debtIncome'), value: totals.debtIncome, color: '#ef4444' },
  ];

  const moneyLeftData = [
    { name: t('cash'), value: data.moneyLeftByPaymentMethod.cash, color: '#22c55e' },
    { name: t('terminal'), value: data.moneyLeftByPaymentMethod.terminal, color: '#2563eb' },
    { name: t('card'), value: data.moneyLeftByPaymentMethod.card, color: '#7c3aed' },
    { name: t('playstation'), value: data.moneyLeftByPaymentMethod.playstation, color: '#f59e0b' },
  ];

  const categoryData = [
    { name: t('gameClub'), value: totals.computerIncome, color: '#2563eb' },
    { name: t('playstation'), value: totals.playstationIncome, color: '#f59e0b' },
    { name: t('barSales'), value: totals.barSales, color: '#f97316' },
  ];
  const incomeCategoryTotal = categoryData.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-normal text-gray-950 sm:text-3xl">{t('title')}</h1>
          <p className="mt-1 text-base text-gray-600">{t('subtitle')}</p>
        </div>
        {role === 'owner' ? (
          <button
            type="button"
            onClick={() => router.push('/money-taken')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700"
          >
            <Wallet size={18} />
            {t('recordMoneyTaken')}
          </button>
        ) : null}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </div>
      )}

      <DateRangePicker
        from={range.from}
        to={range.to}
        fromLabel={t('from')}
        toLabel={t('to')}
        className="max-w-3xl"
        onChange={setRange}
      />

      <MetricSection
        title={t('gameClubPlaystationSection')}
        description={t('gameClubPlaystationSectionDesc')}
        gridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
        className="bg-cyan-200 ring-cyan-300"
        titleClassName="text-cyan-950"
        actionLabel={t('details')}
        onAction={() => router.push(`/game-club-money-details?from=${range.from}&to=${range.to}`)}
      >
        <MetricCard
          loading={loading}
          label={t('gameClubIncome')}
          amount={totals.computerIncome}
          icon={MonitorSmartphone}
          iconBgClassName="bg-blue-100"
          iconClassName="text-blue-600"
          helper={t('gameClubIncomeMetricDesc')}
          comparison={comparisonFor(totals.computerIncome, previousTotals.computerIncome)}
        />
        <MetricCard
          loading={loading}
          label={t('playstationIncome')}
          amount={totals.playstationIncome}
          icon={Gamepad2}
          iconBgClassName="bg-amber-100"
          iconClassName="text-amber-600"
          helper={t('playstationIncomeMetricDesc')}
          comparison={comparisonFor(totals.playstationIncome, previousTotals.playstationIncome)}
        />
        <MetricCard
          loading={loading}
          label={t('activeDebts')}
          amount={totals.activeDebts}
          icon={Users}
          iconBgClassName="bg-rose-100"
          iconClassName="text-rose-600"
          helper={t('activeDebtsDesc', { count: totals.activeDebtCount })}
        />
        <MetricCard
          loading={loading}
          label={t('averageDailyIncome')}
          amount={averageGameClubIncome}
          icon={CalendarDays}
          iconBgClassName="bg-cyan-100"
          iconClassName="text-cyan-600"
          helper={t('averageDailyClubIncomeDesc')}
        />
        <MetricCard
          loading={loading}
          label={t('totalMoneyLeft')}
          amount={totals.gameClubMoneyLeft}
          icon={Wallet}
          iconBgClassName="bg-emerald-100"
          iconClassName="text-emerald-600"
          helper={t('totalMoneyLeftDesc')}
          comparison={comparisonFor(totals.gameClubMoneyLeft, previousTotals.gameClubMoneyLeft)}
        />
      </MetricSection>

      <MetricSection
        title={t('barStatisticsSection')}
        description={t('barStatisticsSectionDesc')}
        gridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        className="bg-orange-200 ring-orange-300"
        titleClassName="text-orange-950"
        actionLabel={t('details')}
        onAction={() => router.push(`/bar-money-details?from=${range.from}&to=${range.to}`)}
      >
        <MetricCard
          loading={loading}
          label={t('barMoneyLeft')}
          amount={totals.barIncome}
          icon={ChartNoAxesCombined}
          iconBgClassName="bg-green-100"
          iconClassName="text-green-600"
          helper={t('barMoneyLeftDesc')}
          comparison={comparisonFor(totals.barIncome, previousTotals.barIncome)}
        />
        <MetricCard
          loading={loading}
          label={t('averageDailyIncome')}
          amount={averageBarIncome}
          icon={CalendarDays}
          iconBgClassName="bg-sky-100"
          iconClassName="text-sky-600"
          helper={t('averageDailyBarIncomeDesc')}
        />
        <MetricCard
          loading={loading}
          label={t('barNetProfit')}
          amount={totals.barProfit}
          icon={BadgeDollarSign}
          iconBgClassName="bg-emerald-100"
          iconClassName="text-emerald-600"
          helper={t('barNetProfitDesc')}
          comparison={comparisonFor(totals.barProfit, previousTotals.barProfit)}
        />
        <MetricCard
          loading={loading}
          label={t('inventoryValue')}
          amount={totals.inventoryValue}
          icon={Boxes}
          iconBgClassName="bg-blue-100"
          iconClassName="text-blue-600"
          helper={period === 'lastMonth'
            ? t('inventoryValuePeriodDesc')
            : `${t('inventoryValueDesc')} - ${t('lowStockAlertsCount', { count: data.lowStockCount })}`}
          subMetric={{
            label: period === 'lastMonth' ? t('previousMonthInventoryValue') : t('lastMonthInventoryValue'),
            amount: data.hasInventoryComparisonData ? data.inventoryComparisonValue : null,
            unavailableLabel: t('noComparisonData'),
          }}
          comparison={
            data.hasInventoryComparisonData
              ? comparisonFor(
                  totals.inventoryValue,
                  data.inventoryComparisonValue,
                  period === 'lastMonth' ? t('vsPreviousPeriod') : t('vsLastMonth'),
                )
              : undefined
          }
        />
      </MetricSection>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3" role="status" aria-label={t('loading')}>
          {Array.from({ length: 6 }).map((_, index) => <ChartLoading key={index} />)}
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <ExpensesByCategoryChart data={data.expenseCategories} total={totals.totalExpenses} />
            <MoneyLeftBreakdownChart
              title={`${t('totalMoneyLeftByCategory')} (${periodLabel})`}
              data={moneyLeftData}
              total={totals.gameClubMoneyLeft}
            />
            <IncomeCategoryChart data={categoryData} total={incomeCategoryTotal} />
          </div>
        </>
      )}
    </div>
  );
}
