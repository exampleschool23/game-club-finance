'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Boxes,
  ChartNoAxesCombined,
  CreditCard,
  Gamepad2,
  Receipt,
  ShoppingBag,
  TrendingUp,
  UserRoundCheck,
  WalletCards,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { todayIso } from '@/lib/utils';
import { formatCurrency, formatDateShort, formatDateTime } from '@/lib/formatters';
import { useDashboardDate } from '@/components/layout/DashboardShell';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { PeriodTabs } from '@/components/dashboard/PeriodTabs';
import { DashboardBarChart } from '@/components/dashboard/DashboardBarChart';
import { PaymentMethodChart } from '@/components/dashboard/PaymentMethodChart';
import { IncomeTrendChart } from '@/components/dashboard/IncomeTrendChart';
import { IncomeCategoryChart } from '@/components/dashboard/IncomeCategoryChart';
import { ExpensesByCategoryChart } from '@/components/dashboard/ExpensesByCategoryChart';
import {
  RecentTransactionsTable,
  type RecentTransactionRow,
} from '@/components/dashboard/RecentTransactionsTable';
import { SummaryStrip } from '@/components/dashboard/SummaryStrip';
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

interface DebtPaymentRow {
  id: string;
  debt_id: string;
  amount: number;
  created_at: string;
}

type DashboardDescriptionKey =
  | 'cashIncomeDesc'
  | 'terminalIncomeDesc'
  | 'cardIncomeDesc'
  | 'barSalesDesc'
  | 'productPurchaseDesc'
  | 'debtPaymentSuffix'
  | 'debtPayment';

interface DashboardTransactionRow extends Omit<RecentTransactionRow, 'description' | 'time'> {
  description?: string;
  descriptionKey?: DashboardDescriptionKey;
  productName?: string | null;
  debtName?: string;
  timeValue?: string | null;
}

interface DashboardData {
  totals: DashboardTotals;
  previousTotals: DashboardTotals;
  trend: TrendRow[];
  lowStockCount: number;
  expenseCategories: Array<{ category: string; value: number }>;
  recentTransactions: DashboardTransactionRow[];
}

const emptyData: DashboardData = {
  totals: emptyDashboardTotals,
  previousTotals: emptyDashboardTotals,
  trend: [],
  lowStockCount: 0,
  expenseCategories: [],
  recentTransactions: [],
};

function isMissingSortOrder(error: { message?: string } | null | undefined) {
  return error?.message?.includes('sort_order') ?? false;
}

async function fetchActiveProductsOrdered(supabase: ReturnType<typeof createClient>) {
  const ordered = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (!isMissingSortOrder(ordered.error)) return ordered;

  return supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });
}

function inRangeQuery<T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(
  query: T,
  range: { from: string; to: string },
): T {
  return query.gte('date', range.from).lte('date', range.to);
}

function expenseLabel(row: ExpenseRow): string {
  const category = row.category.replace(/_/g, ' ');
  return row.comment ? `${category} - ${row.comment}` : category;
}

function productName(relation: StockPurchaseRow['products']): string | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0]?.name ?? null : relation.name;
}

export default function DashboardPage() {
  const { selectedDate } = useDashboardDate();
  const { locale } = useAppLocale();
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const [customFrom, setCustomFrom] = useState(todayIso);
  const [customTo, setCustomTo] = useState(todayIso);
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const t = useTranslations('dashboard');

  const range = useMemo(
    () => getDashboardRange(period, selectedDate || todayIso(), { from: customFrom, to: customTo }),
    [customFrom, customTo, period, selectedDate],
  );

  const fetchDashboard = useCallback(async () => {
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
      debtPaymentsRes,
      prevCashRes,
      prevStockRes,
      prevExpenseRes,
      trendCashRes,
      trendStockRes,
      trendExpenseRes,
    ] = await Promise.all([
      inRangeQuery(
        supabase.from('daily_cash_entries').select('date,cash_income,terminal_income,card_income,created_at'),
        range,
      ),
      inRangeQuery(
        supabase
          .from('daily_stock_counts')
          .select('date,bar_income,bar_profit,bar_cost,sold_quantity,updated_at'),
        range,
      ),
      inRangeQuery(
        supabase
          .from('expenses')
          .select('id,date,amount,category,comment,created_at')
          .order('created_at', { ascending: false }),
        range,
      ),
      fetchActiveProductsOrdered(supabase),
      supabase
        .from('new_debts')
        .select('id,person_name,remaining_amount,status')
        .order('created_at', { ascending: false }),
      inRangeQuery(
        supabase
          .from('stock_purchases')
          .select('id,date,quantity,cost_price,comment,created_at,products(name)')
          .order('created_at', { ascending: false }),
        range,
      ),
      supabase
        .from('debt_payments')
        .select('id,debt_id,amount,created_at')
        .gte('created_at', `${range.from}T00:00:00`)
        .lte('created_at', `${range.to}T23:59:59`)
        .order('created_at', { ascending: false }),
      inRangeQuery(
        supabase.from('daily_cash_entries').select('date,cash_income,terminal_income,card_income'),
        previousRange,
      ),
      inRangeQuery(
        supabase.from('daily_stock_counts').select('date,bar_income,bar_profit,bar_cost,sold_quantity'),
        previousRange,
      ),
      inRangeQuery(
        supabase.from('expenses').select('id,date,amount,category,comment,created_at'),
        previousRange,
      ),
      supabase
        .from('daily_cash_entries')
        .select('date,cash_income,terminal_income,card_income')
        .gte('date', range.from)
        .lte('date', range.to),
      supabase
        .from('daily_stock_counts')
        .select('date,bar_income,bar_profit,bar_cost,sold_quantity')
        .gte('date', range.from)
        .lte('date', range.to),
      supabase
        .from('expenses')
        .select('id,date,amount,category,comment,created_at')
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
      debtPaymentsRes.error,
      prevCashRes.error,
      prevStockRes.error,
      prevExpenseRes.error,
      trendCashRes.error,
      trendStockRes.error,
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
    const debtPayments = (debtPaymentsRes.data ?? []) as unknown as DebtPaymentRow[];
    const activeDebts = debts.filter((debt) => debt.status !== 'paid');
    const debtNameById = new Map(debts.map((debt) => [debt.id, debt.person_name]));

    const totals = calculateDashboardTotals(cashRows, stockRows, expenseRows, products, activeDebts);
    const previousTotals = calculateDashboardTotals(
      (prevCashRes.data ?? []) as DailyCashRow[],
      (prevStockRes.data ?? []) as StockCountRow[],
      (prevExpenseRes.data ?? []) as ExpenseRow[],
      products,
      activeDebts,
    );

    const trendCashRows = (trendCashRes.data ?? []) as DailyCashRow[];
    const trendStockRows = (trendStockRes.data ?? []) as StockCountRow[];
    const trendExpenseRows = (trendExpenseRes.data ?? []) as ExpenseRow[];
    const trend = buildPeriodTrend(range, trendCashRows, trendStockRows, trendExpenseRows);

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

    const transactions: DashboardTransactionRow[] = [
      ...cashRows.flatMap((row) => {
        const createdAt = row.created_at ?? `${row.date}T00:00:00`;
        return [
          row.cash_income > 0
            ? {
                id: `cash-${row.date}`,
                type: 'Income' as const,
                descriptionKey: 'cashIncomeDesc' as const,
                amount: row.cash_income,
                timeValue: createdAt,
              }
            : null,
          row.terminal_income > 0
            ? {
                id: `terminal-${row.date}`,
                type: 'Income' as const,
                descriptionKey: 'terminalIncomeDesc' as const,
                amount: row.terminal_income,
                timeValue: createdAt,
              }
            : null,
          row.card_income > 0
            ? {
                id: `card-${row.date}`,
                type: 'Income' as const,
                descriptionKey: 'cardIncomeDesc' as const,
                amount: row.card_income,
                timeValue: createdAt,
              }
            : null,
        ];
      }),
      ...(stockRows.reduce((sum, row) => sum + (row.bar_income ?? 0), 0) > 0
        ? [
            {
              id: `bar-${range.from}-${range.to}`,
              type: 'Income' as const,
              descriptionKey: 'barSalesDesc' as const,
              amount: stockRows.reduce((sum, row) => sum + (row.bar_income ?? 0), 0),
              timeValue: stockRows[0]?.updated_at ?? null,
            },
          ]
        : []),
      ...expenseRows.map((row) => ({
        id: `expense-${row.id}`,
        type: 'Expense' as const,
        description: expenseLabel(row),
        amount: row.amount,
        timeValue: row.created_at,
      })),
      ...purchases.map((row) => ({
        id: `purchase-${row.id}`,
        type: 'Purchase' as const,
        descriptionKey: 'productPurchaseDesc' as const,
        productName: productName(row.products),
        amount: (row.quantity ?? 0) * (row.cost_price ?? 0),
        timeValue: row.created_at,
      })),
      ...debtPayments.map((row) => ({
        id: `debt-payment-${row.id}`,
        type: 'Debt Payment' as const,
        descriptionKey: debtNameById.get(row.debt_id) ? 'debtPaymentSuffix' as const : 'debtPayment' as const,
        debtName: debtNameById.get(row.debt_id),
        amount: row.amount,
        timeValue: row.created_at,
      })),
    ]
      .filter(Boolean)
      .slice(0, 8) as DashboardTransactionRow[];

    setData({
      totals,
      previousTotals,
      trend,
      lowStockCount,
      expenseCategories,
      recentTransactions: transactions,
    });
    setLoading(false);
  }, [range]);

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

  const recentTransactions = data.recentTransactions.map((row): RecentTransactionRow => {
    const { descriptionKey, productName: rowProductName, debtName, timeValue, ...base } = row;
    let description = row.description ?? (descriptionKey ? t(descriptionKey) : '');

    if (descriptionKey === 'productPurchaseDesc' && rowProductName) {
      description = `${t('productPurchaseDesc')} - ${rowProductName}`;
    }

    if (descriptionKey === 'debtPaymentSuffix' && debtName) {
      description = `${debtName} ${t('debtPaymentSuffix')}`;
    }

    return {
      ...base,
      description,
      time: timeValue ? formatDateTime(timeValue, locale) : '23:59',
    };
  });

  const incomeExpenseData = [
    { name: t('gameClubIncome'), value: totals.gameClubIncome, fill: '#2563eb' },
    { name: t('barIncome'), value: totals.barIncome, fill: '#f97316' },
    { name: t('totalExpenses'), value: totals.totalExpenses, fill: '#ef4444' },
    { name: t('netProfit'), value: totals.netProfit, fill: '#22c55e' },
  ];

  const paymentData = [
    { name: t('cash'), value: totals.cashIncome, color: '#22c55e' },
    { name: t('terminal'), value: totals.terminalIncome, color: '#2563eb' },
    { name: t('card'), value: totals.cardIncome, color: '#7c3aed' },
  ];

  const categoryData = [
    { name: t('gameClub'), value: totals.gameClubIncome, color: '#2563eb' },
    { name: t('bar'), value: totals.barIncome, color: '#f97316' },
  ];

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label={t('gameClubIncome')}
          amount={totals.gameClubIncome}
          icon={Gamepad2}
          iconBgClassName="bg-blue-100"
          iconClassName="text-blue-600"
          comparison={{ value: percentChange(totals.gameClubIncome, previousTotals.gameClubIncome), label: incomeComparisonLabel }}
        />
        <MetricCard
          label={t('barIncome')}
          amount={totals.barIncome}
          icon={ShoppingBag}
          iconBgClassName="bg-orange-100"
          iconClassName="text-orange-600"
          comparison={{ value: percentChange(totals.barIncome, previousTotals.barIncome), label: incomeComparisonLabel }}
        />
        <MetricCard
          label={t('totalIncome')}
          amount={totals.totalIncome}
          icon={Banknote}
          iconBgClassName="bg-green-100"
          iconClassName="text-green-600"
          comparison={{ value: percentChange(totals.totalIncome, previousTotals.totalIncome), label: incomeComparisonLabel }}
        />
        <MetricCard
          label={t('totalExpenses')}
          amount={totals.totalExpenses}
          icon={Receipt}
          iconBgClassName="bg-red-100"
          iconClassName="text-red-500"
          comparison={{ value: percentChange(totals.totalExpenses, previousTotals.totalExpenses), label: incomeComparisonLabel }}
        />
        <MetricCard
          label={t('netProfit')}
          amount={totals.netProfit}
          icon={ChartNoAxesCombined}
          iconBgClassName="bg-purple-100"
          iconClassName="text-purple-600"
          comparison={{ value: percentChange(totals.netProfit, previousTotals.netProfit), label: incomeComparisonLabel }}
        />
        <MetricCard
          label={t('inventoryValue')}
          amount={totals.inventoryValue}
          icon={Boxes}
          iconBgClassName="bg-blue-100"
          iconClassName="text-blue-600"
          helper={t('lowStockAlertsCount', { count: data.lowStockCount })}
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
              total={totals.gameClubIncome}
            />
            <IncomeTrendChart data={trend} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <ExpensesByCategoryChart data={data.expenseCategories} total={totals.totalExpenses} />
            <RecentTransactionsTable rows={recentTransactions} />
            <IncomeCategoryChart data={categoryData} total={totals.totalIncome} />
          </div>

          <SummaryStrip
            items={[
              {
                label: t('cashBalance'),
                value: totals.cashIncome,
                icon: Banknote,
                iconBgClassName: 'bg-green-100',
                iconClassName: 'text-green-600',
                isCurrency: true,
              },
              {
                label: t('terminalBalance'),
                value: totals.terminalIncome,
                icon: WalletCards,
                iconBgClassName: 'bg-blue-100',
                iconClassName: 'text-blue-600',
                isCurrency: true,
              },
              {
                label: t('cardIncome'),
                value: totals.cardIncome,
                icon: CreditCard,
                iconBgClassName: 'bg-purple-100',
                iconClassName: 'text-purple-600',
                isCurrency: true,
              },
              {
                label: t('activeDebts'),
                value: totals.activeDebts,
                helper: t('peopleCount', { count: totals.activeDebtCount }),
                icon: UserRoundCheck,
                iconBgClassName: 'bg-orange-100',
                iconClassName: 'text-orange-600',
                isCurrency: true,
              },
              {
                label: t('profitMargin'),
                value: `${totals.profitMargin}%`,
                helper: totals.profitMargin >= 0 ? t('good') : t('needsAttention'),
                icon: TrendingUp,
                iconBgClassName: 'bg-green-100',
                iconClassName: 'text-green-600',
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
