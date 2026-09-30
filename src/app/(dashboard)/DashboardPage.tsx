'use client';

// Route: /

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BadgeDollarSign,
  Boxes,
  CalendarDays,
  ChartNoAxesCombined,
  RefreshCcw,
  Gamepad2,
  MonitorSmartphone,
  Users,
  Wallet,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { cn, todayIso } from '@/lib/utils';
import { formatDateShort } from '@/lib/formatters';
import { useClub } from '@/components/layout/DashboardShell';
import {
  AmountCard,
  Button,
  ButtonLink,
  Card,
  ChartSkeleton,
  DateRangePicker,
  InlineAlert,
  PageHeader,
  SectionHeading,
} from '@/components/PresentationFoundation';
import { ChartCard } from '@/components/dashboard/ChartCard';
import {
  buildPeriodTrend,
  buildMonthlyAverageGameClubIncome,
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
  type DebtPaymentValueRow,
  type ExpenseRow,
  type InventorySnapshotRow,
  type StockCountRow,
  type StockPurchaseCostRow,
} from '@/lib/calculations/dashboardMetrics';
import {
  dashboardPeriodForRange,
  initialDashboardRange,
} from '@/lib/calculations/dashboardRangeState';
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
  return <ChartSkeleton />;
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
const MonthlyAverageIncomeChart = dynamic(
  () => import('@/components/dashboard/MonthlyAverageIncomeChart').then((module) => module.MonthlyAverageIncomeChart),
  { ssr: false, loading: ChartLoading },
);

import type { MonthlyAverageIncomePoint } from '@/components/dashboard/MonthlyAverageIncomeChart';

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

type MetricSectionTone = 'gameClub' | 'bar';

// Static class names per tone so Tailwind can see every class at build time.
const metricSectionCardTone: Record<MetricSectionTone, 'info' | 'orange'> = {
  gameClub: 'info',
  bar: 'orange',
};

interface MetricSectionProps {
  id: string;
  title: string;
  description: string;
  tone: MetricSectionTone;
  children: ReactNode;
  gridClassName: string;
  actionLabel?: string;
  actionHref?: string;
}

function MetricSection({
  id,
  title,
  description,
  tone,
  children,
  gridClassName,
  actionLabel,
  actionHref,
}: MetricSectionProps) {
  const headingId = `${id}-heading`;
  return (
    <Card as="section" tone={metricSectionCardTone[tone]} className="space-y-4" aria-labelledby={headingId}>
      <SectionHeading
        size="lg"
        title={<span id={headingId}>{title}</span>}
        description={description}
        action={actionLabel && actionHref ? (
          <ButtonLink href={actionHref} variant="outline" iconRight={<ArrowRight size={18} aria-hidden="true" />}>
            {actionLabel}
          </ButtonLink>
        ) : undefined}
      />
      <div className={gridClassName}>{children}</div>
    </Card>
  );
}

export interface InitialDashboardSnapshot {
  clubId: string;
  data: DashboardData;
  range: { from: string; to: string };
  /** Server time (ms) the snapshot was built. Older snapshots are shown but refetched. */
  generatedAt?: number;
}

// Browser Back can replay an old server payload from the router cache. Only a
// snapshot younger than this is trusted without a silent client refetch.
const INITIAL_SNAPSHOT_MAX_AGE_MS = 15_000;

function isInitialSnapshotFresh(snapshot: InitialDashboardSnapshot): boolean {
  if (typeof snapshot.generatedAt !== 'number') return false;
  return Date.now() - snapshot.generatedAt < INITIAL_SNAPSHOT_MAX_AGE_MS;
}

export default function DashboardPage({
  initialSnapshot = null,
}: {
  initialSnapshot?: InitialDashboardSnapshot | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { selectedClubId, businessDayStartHour } = useClub();
  const { locale } = useAppLocale();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [range, setRange] = useState(() => initialDashboardRange(searchParams, businessToday));
  const initialSnapshotMatches = initialSnapshot?.clubId === selectedClubId
    && initialSnapshot.range.from === range.from
    && initialSnapshot.range.to === range.to;
  const [data, setData] = useState<DashboardData>(() => (
    initialSnapshotMatches ? initialSnapshot.data : emptyDashboardData
  ));
  const [loading, setLoading] = useState(!initialSnapshotMatches);
  const [error, setError] = useState(false);
  const [renderCharts, setRenderCharts] = useState(false);
  const [monthlyAverageIncome, setMonthlyAverageIncome] = useState<MonthlyAverageIncomePoint[]>([]);
  const [monthlyError, setMonthlyError] = useState(false);
  const [monthlyReloadToken, setMonthlyReloadToken] = useState(0);
  const requestSequence = useRef(0);
  const chartsAnchorRef = useRef<HTMLDivElement>(null);
  // Freshness only decides whether to refetch; the matching snapshot is always
  // rendered first, so server and client markup stay identical.
  const [initialSnapshotFresh] = useState(() => (
    initialSnapshotMatches && initialSnapshot ? isInitialSnapshotFresh(initialSnapshot) : false
  ));
  const initialRequestKey = `${selectedClubId}:${range.from}:${range.to}`;
  /** Key of the data currently on screen; a refetch for the same key is silent. */
  const displayedRequestKey = useRef(initialSnapshotMatches ? initialRequestKey : '');
  const loadedRequestKey = useRef(initialSnapshotFresh ? initialRequestKey : '');
  const hasMountedRangeSync = useRef(false);
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const currency = tc('currency');

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
      window.history.replaceState(null, '', nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }
  }, [pathname, range.from, range.to, searchParams]);

  const fetchDashboard = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const requestId = ++requestSequence.current;
    const requestKey = `${selectedClubId}:${range.from}:${range.to}`;

    if (!selectedClubId) {
      setData(emptyDashboardData);
      setError(false);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setError(false);

    try {
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
          displayedRequestKey.current = requestKey;
          setLoading(false);
          return;
        }

        if (!isMissingDatabaseFunction(snapshotResult.error, 'get_dashboard_snapshot')) {
          setError(true);
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
        setError(true);
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
      displayedRequestKey.current = requestKey;
      setLoading(false);
    } catch {
      if (requestId !== requestSequence.current) return;
      setError(true);
      setLoading(false);
    }
  }, [businessToday, period, range, selectedClubId]);

  useEffect(() => {
    if (!selectedClubId) {
      setMonthlyAverageIncome([]);
      return;
    }
    // This history is only used by the below-the-fold charts. Keep the initial
    // connection free for the current dashboard and operational page reads.
    if (!renderCharts) return;

    let cancelled = false;
    setMonthlyError(false);
    const supabase = createClient();
    async function loadMonthlyAverageIncome() {
      const currentMonth = businessToday.slice(0, 7);
      const [year, month] = currentMonth.split('-').map(Number);
      const firstMonthDate = new Date(year, month - 12, 1);
      const firstMonth = `${firstMonthDate.getFullYear()}-${String(firstMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
      const result = await fetchAllRows<DailyCashRow>(() => supabase
        .from('daily_cash_entries')
        .select('date,cash_income,terminal_income,card_income')
        .eq('club_id', selectedClubId)
        .gte('date', firstMonth)
        .lte('date', businessToday)
        .order('date', { ascending: true }));
      if (cancelled) return;
      if (result.error) {
        setMonthlyError(true);
        setMonthlyAverageIncome([]);
        return;
      }
      setMonthlyAverageIncome(buildMonthlyAverageGameClubIncome(result.data ?? [], businessToday));
    }

    loadMonthlyAverageIncome().catch(() => {
      if (cancelled) return;
      setMonthlyError(true);
      setMonthlyAverageIncome([]);
    });

    return () => { cancelled = true; };
  }, [businessToday, monthlyReloadToken, renderCharts, selectedClubId]);

  useEffect(() => {
    const requestKey = `${selectedClubId}:${range.from}:${range.to}`;
    if (loadedRequestKey.current === requestKey) return;
    loadedRequestKey.current = requestKey;

    // A stale server snapshot (or data already on screen for this key) stays
    // visible while it is refreshed in the background.
    void fetchDashboard({ silent: displayedRequestKey.current === requestKey });
  }, [fetchDashboard, range.from, range.to, selectedClubId]);

  const retryDashboard = useCallback(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (loading || renderCharts) return;
    const anchor = chartsAnchorRef.current;
    if (!anchor || typeof IntersectionObserver === 'undefined') {
      setRenderCharts(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setRenderCharts(true);
      observer.disconnect();
    }, { rootMargin: '600px 0px' });
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [loading, renderCharts]);

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
  const detailsQuery = new URLSearchParams({ from: range.from, to: range.to }).toString();

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        className="mb-0"
        action={(
          <DateRangePicker
            from={range.from}
            to={range.to}
            fromLabel={t('from')}
            toLabel={t('to')}
            max={businessToday}
            className="sm:w-80"
            onChange={setRange}
          />
        )}
      />

      {error && (
        <InlineAlert
          variant="danger"
          action={(
            <Button size="sm" variant="outline" onClick={retryDashboard} icon={<RefreshCcw size={15} aria-hidden="true" />}>
              {tc('retry')}
            </Button>
          )}
        >
          {t('loadErrorDashboard')}
        </InlineAlert>
      )}

      <MetricSection
        id="dashboard-game-club"
        tone="gameClub"
        title={t('gameClubPlaystationSection')}
        description={t('gameClubPlaystationSectionDesc')}
        gridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
        actionLabel={t('details')}
        actionHref={`/game-club-money-details?${detailsQuery}`}
      >
        <AmountCard
          loading={loading}
          currency={currency}
          label={t('gameClubIncome')}
          amount={totals.computerIncome}
          icon={MonitorSmartphone}
          iconBgClassName="bg-blue-100"
          iconClassName="text-blue-600"
          helper={t('gameClubIncomeMetricDesc')}
          comparison={comparisonFor(totals.computerIncome, previousTotals.computerIncome)}
        />
        <AmountCard
          loading={loading}
          currency={currency}
          label={t('playstationIncome')}
          amount={totals.playstationIncome}
          icon={Gamepad2}
          iconBgClassName="bg-amber-100"
          iconClassName="text-amber-600"
          helper={t('playstationIncomeMetricDesc')}
          comparison={comparisonFor(totals.playstationIncome, previousTotals.playstationIncome)}
        />
        <AmountCard
          loading={loading}
          currency={currency}
          label={t('activeDebts')}
          amount={totals.activeDebts}
          icon={Users}
          iconBgClassName="bg-rose-100"
          iconClassName="text-rose-600"
          helper={t('activeDebtsDesc', { count: totals.activeDebtCount })}
        />
        <AmountCard
          loading={loading}
          currency={currency}
          label={t('averageDailyIncome')}
          amount={averageGameClubIncome}
          icon={CalendarDays}
          iconBgClassName="bg-cyan-100"
          iconClassName="text-cyan-600"
          helper={t('averageDailyClubIncomeDesc')}
        />
        <AmountCard
          loading={loading}
          currency={currency}
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
        id="dashboard-bar"
        tone="bar"
        title={t('barStatisticsSection')}
        description={t('barStatisticsSectionDesc')}
        gridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        actionLabel={t('details')}
        actionHref={`/bar-money-details?${detailsQuery}`}
      >
        <AmountCard
          loading={loading}
          currency={currency}
          label={t('barMoneyLeft')}
          amount={totals.barIncome}
          icon={ChartNoAxesCombined}
          iconBgClassName="bg-green-100"
          iconClassName="text-green-600"
          helper={t('barMoneyLeftDesc')}
          comparison={comparisonFor(totals.barIncome, previousTotals.barIncome)}
        />
        <AmountCard
          loading={loading}
          currency={currency}
          label={t('averageDailyIncome')}
          amount={averageBarIncome}
          icon={CalendarDays}
          iconBgClassName="bg-sky-100"
          iconClassName="text-sky-600"
          helper={t('averageDailyBarIncomeDesc')}
        />
        <AmountCard
          loading={loading}
          currency={currency}
          label={t('barNetProfit')}
          amount={totals.barProfit}
          icon={BadgeDollarSign}
          iconBgClassName="bg-emerald-100"
          iconClassName="text-emerald-600"
          helper={t('barNetProfitDesc')}
          comparison={comparisonFor(totals.barProfit, previousTotals.barProfit)}
        />
        <AmountCard
          loading={loading}
          currency={currency}
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

      {!renderCharts ? (
        <div
          ref={chartsAnchorRef}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3"
          role="status"
          aria-label={t('loading')}
        >
          {Array.from({ length: 6 }).map((_, index) => <ChartLoading key={index} />)}
        </div>
      ) : (
        // Once rendered, charts stay mounted across range/club changes and are
        // dimmed while the next data loads instead of swapping to skeletons.
        <div
          className={cn('space-y-4 transition-opacity sm:space-y-5', loading && 'pointer-events-none opacity-60')}
          aria-busy={loading || undefined}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <DashboardBarChart title={`${t('incomeVsExpenses')} (${periodLabel})`} data={incomeExpenseData} />
            <PaymentMethodChart
              title={`${t('incomeByPaymentMethod')} (${periodLabel})`}
              data={paymentData}
              total={paymentData.reduce((sum, row) => sum + row.value, 0)}
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

          {monthlyError ? (
            <ChartCard title={t('monthlyAverageIncomeTitle')} description={t('monthlyAverageIncomeDescription')}>
              <InlineAlert
                variant="danger"
                className="mt-4"
                action={(
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMonthlyReloadToken((token) => token + 1)}
                    icon={<RefreshCcw size={15} aria-hidden="true" />}
                  >
                    {tc('retry')}
                  </Button>
                )}
              >
                {t('monthlyChartLoadError')}
              </InlineAlert>
            </ChartCard>
          ) : monthlyAverageIncome.length > 0 ? (
            <MonthlyAverageIncomeChart data={monthlyAverageIncome} locale={locale} />
          ) : null}
        </div>
      )}
    </div>
  );
}
