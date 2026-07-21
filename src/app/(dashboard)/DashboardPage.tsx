'use client';

// Route: /

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Boxes,
  CalendarDays,
  ChartNoAxesCombined,
  Gamepad2,
  MonitorSmartphone,
  Users,
  Wallet,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { todayIso } from '@/lib/utils';
import { formatDateShort } from '@/lib/formatters';
import { useClub, useDashboardDate } from '@/components/layout/DashboardShell';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { PeriodTabs } from '@/components/dashboard/PeriodTabs';
import { DashboardBarChart } from '@/components/dashboard/DashboardBarChart';
import { PaymentMethodChart } from '@/components/dashboard/PaymentMethodChart';
import { IncomeTrendChart } from '@/components/dashboard/IncomeTrendChart';
import { IncomeCategoryChart } from '@/components/dashboard/IncomeCategoryChart';
import { ExpensesByCategoryChart } from '@/components/dashboard/ExpensesByCategoryChart';
import { MoneyLeftBreakdownChart } from '@/components/dashboard/MoneyLeftBreakdownChart';
import {
  buildPeriodTrend,
  calculateAverageDailyIncome,
  calculateDashboardTotals,
  calculateGameClubMoneyLeftByPaymentMethod,
  calculateInventoryValueFromLatestStockCounts,
  countDashboardRangeDaysThroughDate,
  emptyDashboardTotals,
  emptyMoneyLeftByPaymentMethod,
  getDashboardComparisonRange,
  getDashboardRange,
  getLatestRowDateInRange,
  percentChange,
  type DailyCashRow,
  type DashboardPeriod,
  type DashboardTotals,
  type DebtPaymentValueRow,
  type ExpenseRow,
  type InventorySnapshotRow,
  type MoneyLeftByPaymentMethod,
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
}

interface DebtRow {
  id: string;
  person_name: string;
  date: string;
  amount: number;
  remaining_amount: number;
  status: string;
}

interface DashboardData {
  totals: DashboardTotals;
  previousTotals: DashboardTotals;
  lastMonthInventoryValue: number;
  hasLastMonthInventoryData: boolean;
  trend: TrendRow[];
  lowStockCount: number;
  expenseCategories: Array<{ category: string; value: number }>;
  moneyLeftByPaymentMethod: MoneyLeftByPaymentMethod;
  latestDailyCashEntryDate: string | null;
  latestBarEntryDate: string | null;
}

const emptyData: DashboardData = {
  totals: emptyDashboardTotals,
  previousTotals: emptyDashboardTotals,
  lastMonthInventoryValue: 0,
  hasLastMonthInventoryData: false,
  trend: [],
  lowStockCount: 0,
  expenseCategories: [],
  moneyLeftByPaymentMethod: emptyMoneyLeftByPaymentMethod,
  latestDailyCashEntryDate: null,
  latestBarEntryDate: null,
};

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
  const requestSequence = useRef(0);
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
    const requestId = ++requestSequence.current;

    if (!selectedClubId) {
      setData(emptyData);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const supabase = createClient();
    const previousRange = getDashboardComparisonRange(period, range);
    const lastMonthRange = getDashboardRange('lastMonth', selectedDate || businessToday);

    const [
      cashRes,
      stockRes,
      expenseRes,
      productRes,
      debtRes,
      debtPaymentRes,
      purchaseRes,
    ] = await Promise.all([
      fetchAllRows<DailyCashRow>(() =>
        inRangeQuery(
          supabase
            .from('daily_cash_entries')
            .select('date,cash_income,terminal_income,card_income,playstation_income,created_at')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true }),
          range,
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
          range,
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
          range,
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
          range,
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
          range,
        ),
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
    const rangeDebts = debts.filter((debt) => debt.date >= range.from && debt.date <= range.to);
    const debtPayments = (debtPaymentRes.data ?? []) as DebtPaymentValueRow[];

    const totals = calculateDashboardTotals(
      cashRows,
      stockRows,
      purchases,
      expenseRows,
      products,
      rangeDebts,
      debtPayments,
      activeDebts,
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
      (product) => product.current_stock <= (product.low_stock_threshold ?? 5),
    ).length;
    const expenseCategories = Array.from(
      expenseRows.reduce((categoryMap, row) => {
        categoryMap.set(row.category, (categoryMap.get(row.category) ?? 0) + Number(row.amount ?? 0));
        return categoryMap;
      }, new Map<string, number>()),
      ([category, value]) => ({ category, value }),
    ).sort((a, b) => b.value - a.value);

    // Render the useful dashboard as soon as the selected period is ready.
    // Historical comparisons are supplementary and can arrive afterward.
    setData({
      totals,
      previousTotals: emptyDashboardTotals,
      lastMonthInventoryValue: 0,
      hasLastMonthInventoryData: false,
      trend,
      lowStockCount,
      expenseCategories,
      moneyLeftByPaymentMethod,
      latestDailyCashEntryDate,
      latestBarEntryDate,
    });
    setLoading(false);

    const [
      prevCashRes,
      prevStockRes,
      prevPurchaseRes,
      prevExpenseRes,
      prevDebtPaymentRes,
      lastMonthInventoryRes,
    ] = await Promise.all([
      fetchAllRows<DailyCashRow>(() =>
        inRangeQuery(
          supabase
            .from('daily_cash_entries')
            .select('date,cash_income,terminal_income,card_income,playstation_income')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true }),
          previousRange,
        ),
      ),
      fetchAllRows<StockCountRow>(() =>
        inRangeQuery(
          supabase
            .from('daily_stock_counts')
            .select('product_id,date,bar_income,bar_profit,bar_cost,sold_quantity')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true })
            .order('product_id', { ascending: true }),
          previousRange,
        ),
      ),
      fetchAllRows<StockPurchaseCostRow>(() =>
        inRangeQuery(
          supabase
            .from('stock_purchases')
            .select('id,date,quantity,cost_price')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true })
            .order('id', { ascending: true }),
          previousRange,
        ),
      ),
      fetchAllRows<ExpenseRow>(() =>
        inRangeQuery(
          supabase
            .from('expenses')
            .select('id,date,amount,category,payment_source,comment,created_at')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true })
            .order('id', { ascending: true }),
          previousRange,
        ),
      ),
      fetchAllRows<DebtPaymentValueRow>(() =>
        inRangeQuery(
          supabase
            .from('debt_payments')
            .select('id,date,amount,payment_method')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true })
            .order('id', { ascending: true }),
          previousRange,
        ),
      ),
      fetchAllRows<InventorySnapshotRow>(() =>
        supabase
          .from('daily_stock_counts')
          .select('product_id,date,closing_stock,cost_price')
          .eq('club_id', selectedClubId)
          .gte('date', lastMonthRange.from)
          .lte('date', lastMonthRange.to)
          .order('date', { ascending: true })
          .order('product_id', { ascending: true }),
      ),
    ]);

    if (requestId !== requestSequence.current) return;

    const comparisonError = [
      prevCashRes.error,
      prevStockRes.error,
      prevPurchaseRes.error,
      prevExpenseRes.error,
      prevDebtPaymentRes.error,
      lastMonthInventoryRes.error,
    ].find(Boolean);

    if (comparisonError) {
      setError(comparisonError.message);
      return;
    }

    const previousDebts = debts.filter(
      (debt) => debt.date >= previousRange.from && debt.date <= previousRange.to,
    );
    const previousDebtPayments = (prevDebtPaymentRes.data ?? []) as DebtPaymentValueRow[];
    const lastMonthInventoryValue = calculateInventoryValueFromLatestStockCounts(
      (lastMonthInventoryRes.data ?? []) as InventorySnapshotRow[],
    );
    const previousTotals = calculateDashboardTotals(
      (prevCashRes.data ?? []) as DailyCashRow[],
      (prevStockRes.data ?? []) as StockCountRow[],
      (prevPurchaseRes.data ?? []) as StockPurchaseCostRow[],
      (prevExpenseRes.data ?? []) as ExpenseRow[],
      products,
      previousDebts,
      previousDebtPayments,
      activeDebts,
    );

    setData((current) => ({
      ...current,
      previousTotals,
      lastMonthInventoryValue,
      hasLastMonthInventoryData: (lastMonthInventoryRes.data ?? []).length > 0,
    }));
  }, [businessToday, period, range, selectedClubId, selectedDate]);

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
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </div>
      )}

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
          label={t('gameClubIncome')}
          amount={totals.computerIncome}
          icon={MonitorSmartphone}
          iconBgClassName="bg-blue-100"
          iconClassName="text-blue-600"
          helper={t('gameClubIncomeMetricDesc')}
          comparison={comparisonFor(totals.computerIncome, previousTotals.computerIncome)}
        />
        <MetricCard
          label={t('playstationIncome')}
          amount={totals.playstationIncome}
          icon={Gamepad2}
          iconBgClassName="bg-amber-100"
          iconClassName="text-amber-600"
          helper={t('playstationIncomeMetricDesc')}
          comparison={comparisonFor(totals.playstationIncome, previousTotals.playstationIncome)}
        />
        <MetricCard
          label={t('activeDebts')}
          amount={totals.activeDebts}
          icon={Users}
          iconBgClassName="bg-rose-100"
          iconClassName="text-rose-600"
          helper={t('activeDebtsDesc', { count: totals.activeDebtCount })}
        />
        <MetricCard
          label={t('averageDailyIncome')}
          amount={averageGameClubIncome}
          icon={CalendarDays}
          iconBgClassName="bg-cyan-100"
          iconClassName="text-cyan-600"
          helper={t('averageDailyClubIncomeDesc')}
        />
        <MetricCard
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
        gridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        className="bg-orange-200 ring-orange-300"
        titleClassName="text-orange-950"
        actionLabel={t('details')}
        onAction={() => router.push(`/bar-money-details?from=${range.from}&to=${range.to}`)}
      >
        <MetricCard
          label={t('barMoneyLeft')}
          amount={totals.barIncome}
          icon={ChartNoAxesCombined}
          iconBgClassName="bg-green-100"
          iconClassName="text-green-600"
          helper={t('barMoneyLeftDesc')}
          comparison={comparisonFor(totals.barIncome, previousTotals.barIncome)}
        />
        <MetricCard
          label={t('averageDailyIncome')}
          amount={averageBarIncome}
          icon={CalendarDays}
          iconBgClassName="bg-sky-100"
          iconClassName="text-sky-600"
          helper={t('averageDailyBarIncomeDesc')}
        />
        <MetricCard
          label={t('inventoryValue')}
          amount={totals.inventoryValue}
          icon={Boxes}
          iconBgClassName="bg-blue-100"
          iconClassName="text-blue-600"
          helper={`${t('inventoryValueDesc')} - ${t('lowStockAlertsCount', { count: data.lowStockCount })}`}
          subMetric={{
            label: t('lastMonthInventoryValue'),
            amount: data.hasLastMonthInventoryData ? data.lastMonthInventoryValue : null,
            unavailableLabel: t('noComparisonData'),
          }}
          comparison={
            data.hasLastMonthInventoryData
              ? comparisonFor(totals.inventoryValue, data.lastMonthInventoryValue, t('vsLastMonth'))
              : undefined
          }
        />
      </MetricSection>

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
