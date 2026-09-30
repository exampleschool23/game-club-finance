'use client';

// Route: /reports

import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  CircleDollarSign,
  CreditCard,
  Filter,
  Gamepad2,
  Landmark,
  ReceiptText,
  RefreshCcw,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useClub } from '@/components/layout/DashboardShell';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DateRangePicker,
  EmptyState,
  InlineAlert,
  MetricCard,
  Modal,
  Money,
  PageHeader,
  SectionHeading,
  Select,
  Skeleton,
  TableSkeleton,
  toneForAmount,
  useConfirm,
  useToast,
} from '@/components/PresentationFoundation';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import {
  buildFilteredMoneyReport,
  type MoneyReportActivity,
  type MoneyReportCategoryFilter,
  type MoneyReportCashRow,
  type MoneyReportBarSalesRow,
  type MoneyReportDebtPaymentRow,
  type MoneyReportPaymentBreakdown,
} from '@/lib/calculations/moneyReport';
import type { StockPurchaseCostRow } from '@/lib/calculations/barMoney';
import {
  getDashboardRange,
  type ExpenseRow,
} from '@/lib/calculations/dashboardMetrics';
import { formatCurrency, formatDateOnly, formatTime } from '@/lib/formatters';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { createClient, mutateFinanceRequest } from '@/lib/supabase/client';
import { isMissingDatabaseFunction } from '@/lib/supabase/errors';
import { cn } from '@/lib/utils';
import { todayIso } from '@/lib/utils';
import { canAccessFeature } from '@/lib/permissions';
import ExpenseRegistrationForm, { EXPENSE_CATEGORIES, isKnownExpenseCategory, type KnownExpenseCategory } from './ExpensesPanel';

const emptyReportRows = {
  cash: [] as MoneyReportCashRow[],
  expenses: [] as ExpenseRow[],
  debtPayments: [] as MoneyReportDebtPaymentRow[],
  barSales: [] as MoneyReportBarSalesRow[],
  stockPurchases: [] as StockPurchaseCostRow[],
};

interface ReportProfileRow {
  id: string;
  full_name: string;
}

interface MoneyReportSnapshotPayload {
  cash: MoneyReportCashRow[];
  expenses: ExpenseRow[];
  debtPayments: MoneyReportDebtPaymentRow[];
  barSales: MoneyReportBarSalesRow[];
  stockPurchases: StockPurchaseCostRow[];
}

function Amount({ value, className }: { value: number; className?: string }) {
  return <Money amount={value} signed className={className} />;
}

function activityKindBadge(kind: MoneyReportActivity['kind']): string {
  if (kind === 'income') return 'border-success-500/30 bg-success-50 text-success-600';
  if (kind === 'debt_payment') return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  return 'border-danger-500/30 bg-danger-50 text-danger-600';
}

const expenseActivityStyles: Record<KnownExpenseCategory, string> = {
  salary: 'border-violet-200 bg-violet-50 text-violet-700',
  rent: 'border-amber-200 bg-amber-50 text-amber-700',
  electricity: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  internet: 'border-blue-200 bg-blue-50 text-blue-700',
  repair: 'border-orange-200 bg-orange-50 text-orange-700',
  cleaning: 'border-teal-200 bg-teal-50 text-teal-700',
  food_drinks: 'border-pink-200 bg-pink-50 text-pink-700',
  marketing: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  equipment: 'border-sky-200 bg-sky-50 text-sky-700',
  tax: 'border-rose-200 bg-rose-50 text-rose-700',
  other: 'border-danger-500/30 bg-danger-50 text-danger-600',
};

function expenseCategoryStyle(category: string): string {
  return isKnownExpenseCategory(category)
    ? expenseActivityStyles[category]
    : 'border-danger-500/30 bg-danger-50 text-danger-600';
}

function activityRowStyle(activity: MoneyReportActivity): string {
  if (activity.kind === 'income') return 'border-l-success-500 bg-success-50/20';
  if (activity.kind === 'debt_payment') return 'border-l-cyan-500 bg-cyan-50/20';
  if (activity.category === 'salary') return 'border-l-violet-500 bg-violet-50/20';
  return 'border-l-danger-500 bg-danger-50/20';
}

function SummaryCard({
  label,
  value,
  icon,
  iconClassName,
  loading = false,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  iconClassName: string;
  loading?: boolean;
}) {
  return (
    <MetricCard
      label={label}
      value={<Money amount={value} />}
      tone={toneForAmount(value, 'default')}
      icon={icon}
      iconClassName={iconClassName}
      loading={loading}
    />
  );
}

function PaymentCard({
  label,
  data,
  icon: Icon,
  iconClassName,
  iconBackground,
  collectedLabel,
  expensesLabel,
  leftLabel,
}: {
  label: string;
  data: MoneyReportPaymentBreakdown;
  icon: ElementType;
  iconClassName: string;
  iconBackground: string;
  collectedLabel: string;
  expensesLabel: string;
  leftLabel: string;
}) {
  return (
    <Card as="article" padding="none" className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', iconBackground)}>
            <Icon size={21} className={iconClassName} aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-gray-950">{label}</h3>
        </div>

        <div className="mt-5 space-y-3 text-sm">
          <div className="flex items-start justify-between gap-3 text-gray-600">
            <span>{collectedLabel}</span>
            <Amount value={data.collected} className="shrink-0 font-semibold text-gray-950" />
          </div>
          <div className="flex items-start justify-between gap-3 text-gray-600">
            <span>{expensesLabel}</span>
            <Amount value={data.expenses} className="shrink-0 font-semibold text-danger-600" />
          </div>
        </div>
      </div>
      <div className={cn(
        'flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-5',
        data.left < 0 ? 'border-danger-50 bg-danger-50' : 'border-success-50 bg-success-50',
      )}>
        <span className={cn('text-sm font-bold', data.left < 0 ? 'text-danger-600' : 'text-success-600')}>
          {leftLabel}
        </span>
        <Amount
          value={data.left}
          className={cn('shrink-0 text-base font-extrabold', data.left < 0 ? 'text-danger-600' : 'text-success-600')}
        />
      </div>
    </Card>
  );
}

export default function ReportsPage() {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const te = useTranslations('expenses.categories');
  const { locale } = useAppLocale();
  const { selectedClubId, businessDayStartHour, role, featureAccess } = useClub();
  const hasReportsAccess = canAccessFeature(role, featureAccess, 'reports');
  const hasExpensesAccess = canAccessFeature(role, featureAccess, 'expenses');
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [range, setRange] = useState(() => getDashboardRange('month', businessToday));
  const [reportRows, setReportRows] = useState(emptyReportRows);
  const [categoryFilter, setCategoryFilter] = useState<MoneyReportCategoryFilter>('all');
  const [loading, setLoading] = useState(true);
  /** The report failed to load; shown with a Retry action instead of the empty state. */
  const [loadFailed, setLoadFailed] = useState(false);
  /** Translated result of a failed delete. */
  const [actionError, setActionError] = useState('');
  const { showToast, toastElement } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<{ activity: MoneyReportActivity; date: string } | null>(null);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [allCustomCategories, setAllCustomCategories] = useState<string[] | null>(null);
  const requestSequence = useRef(0);
  const currentClubId = useRef(selectedClubId);
  const deletePending = useRef(false);
  const isOwner = role === 'owner';
  const report = useMemo(() => buildFilteredMoneyReport(
    reportRows.cash,
    reportRows.expenses,
    reportRows.debtPayments,
    categoryFilter,
    reportRows.barSales,
    reportRows.stockPurchases,
  ), [categoryFilter, reportRows]);
  const customExpenseCategories = useMemo(() => {
    const knownCategories = new Set<string>(EXPENSE_CATEGORIES);
    return Array.from(new Set(
      reportRows.expenses
        .map((expense) => expense.category)
        .filter((category) => category && !knownCategories.has(category)),
    )).sort((a, b) => a.localeCompare(b));
  }, [reportRows.expenses]);

  // Custom expense categories are read once per club (not on every dialog open)
  // so the expense form can offer categories used outside the visible range.
  useEffect(() => {
    if (!selectedClubId || !hasExpensesAccess) {
      setAllCustomCategories(null);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    fetchAllRows<{ category: string }>(() => supabase.from('expenses').select('category').eq('club_id', selectedClubId))
      .then((result) => {
        if (cancelled || result.error) return;
        setAllCustomCategories(Array.from(new Set(
          (result.data ?? []).map((row) => row.category).filter((category) => category && !isKnownExpenseCategory(category)),
        )).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hasExpensesAccess, selectedClubId]);

  useEffect(() => {
    if (!categoryFilter.startsWith('expense:')) return;
    const category = categoryFilter.slice('expense:'.length);
    if (!isKnownExpenseCategory(category) && !customExpenseCategories.includes(category)) {
      setCategoryFilter('all');
    }
  }, [categoryFilter, customExpenseCategories]);

  const loadReport = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++requestSequence.current;

    if (!selectedClubId || !hasReportsAccess) {
      setReportRows(emptyReportRows);
      setLoadFailed(false);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setLoadFailed(false);
    try {
      const supabase = createClient();
      const snapshotResult = await supabase.rpc('get_money_report_snapshot', {
        p_club_id: selectedClubId,
        p_range_from: range.from,
        p_range_to: range.to,
      });

      if (requestId !== requestSequence.current) return;

      if (!snapshotResult.error) {
        const snapshot = snapshotResult.data as MoneyReportSnapshotPayload;
        setReportRows({
          cash: snapshot.cash ?? [],
          expenses: snapshot.expenses ?? [],
          debtPayments: snapshot.debtPayments ?? [],
          barSales: snapshot.barSales ?? [],
          stockPurchases: snapshot.stockPurchases ?? [],
        });
        setLoading(false);
        return;
      }

      if (!isMissingDatabaseFunction(snapshotResult.error, 'get_money_report_snapshot')) {
        setReportRows(emptyReportRows);
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      // Compatibility path while migration 047 is being deployed.
      const [cashResult, expenseResult, debtPaymentResult, barSalesResult, stockPurchaseResult] = await Promise.all([
        fetchAllRows<MoneyReportCashRow>(() => supabase
          .from('daily_cash_entries')
          .select('id,date,cash_income,terminal_income,card_income,playstation_income,comment,created_by,created_at')
          .eq('club_id', selectedClubId)
          .gte('date', range.from)
          .lte('date', range.to)
          .order('date', { ascending: true })
          .order('created_at', { ascending: true })),
        fetchAllRows<ExpenseRow>(() => supabase
          .from('expenses')
          .select('id,date,amount,category,payment_method,payment_source,comment,created_by,created_at')
          .eq('club_id', selectedClubId)
          .gte('date', range.from)
          .lte('date', range.to)
          .order('date', { ascending: true })
          .order('id', { ascending: true })),
        fetchAllRows<MoneyReportDebtPaymentRow>(() => supabase
          .from('debt_payments')
          .select('id,date,amount,payment_method,comment,created_at')
          .eq('club_id', selectedClubId)
          .gte('date', range.from)
          .lte('date', range.to)
          .order('date', { ascending: true })
          .order('id', { ascending: true })),
        fetchAllRows<MoneyReportBarSalesRow>(() => supabase
          .from('daily_stock_counts')
          .select('date,bar_income')
          .eq('club_id', selectedClubId)
          .gte('date', range.from)
          .lte('date', range.to)),
        fetchAllRows<StockPurchaseCostRow>(() => supabase
          .from('stock_purchases')
          .select('date,quantity,cost_price')
          .eq('club_id', selectedClubId)
          .gte('date', range.from)
          .lte('date', range.to)),
      ]);

      if (requestId !== requestSequence.current) return;

      const firstError = [
        cashResult.error,
        expenseResult.error,
        debtPaymentResult.error,
        barSalesResult.error,
        stockPurchaseResult.error,
      ].find(Boolean);
      if (firstError) {
        setReportRows(emptyReportRows);
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      const cashRows = (cashResult.data ?? []) as MoneyReportCashRow[];
      const expenseRows = (expenseResult.data ?? []) as ExpenseRow[];
      const creatorIds = Array.from(new Set([
        ...cashRows.map((row) => row.created_by),
        ...expenseRows.map((row) => row.created_by),
      ].filter((creatorId): creatorId is string => Boolean(creatorId))));
      const profileResult = creatorIds.length > 0
        ? await supabase.from('profiles').select('id,full_name').in('id', creatorIds)
        : { data: [] as ReportProfileRow[], error: null };

      if (requestId !== requestSequence.current) return;

      if (profileResult.error) {
        setReportRows(emptyReportRows);
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      const creatorNames = new Map(
        ((profileResult.data ?? []) as ReportProfileRow[]).map((profile) => [profile.id, profile.full_name]),
      );

      setReportRows({
        cash: cashRows.map((row) => ({
          ...row,
          creator_name: row.created_by ? creatorNames.get(row.created_by) ?? null : null,
        })),
        expenses: expenseRows.map((row) => ({
          ...row,
          creator_name: row.created_by ? creatorNames.get(row.created_by) ?? null : null,
        })),
        debtPayments: (debtPaymentResult.data ?? []) as MoneyReportDebtPaymentRow[],
        barSales: (barSalesResult.data ?? []) as MoneyReportBarSalesRow[],
        stockPurchases: (stockPurchaseResult.data ?? []) as StockPurchaseCostRow[],
      });
      setLoading(false);
    } catch {
      if (requestId !== requestSequence.current) return;
      setReportRows(emptyReportRows);
      setLoadFailed(true);
      setLoading(false);
    }
  }, [hasReportsAccess, range.from, range.to, selectedClubId]);

  useEffect(() => {
    void loadReport();
    return () => { requestSequence.current += 1; };
  }, [loadReport]);

  // Dialogs belong to the club they were opened for: close them on a club
  // switch so an expense can never be registered into the newly selected club
  // from a form the user filled in for the previous one.
  useEffect(() => {
    currentClubId.current = selectedClubId;
    setSelectedEntry(null);
    setExpenseDialogOpen(false);
    setActionError('');
  }, [selectedClubId]);

  useEffect(() => {
    const nextRange = getDashboardRange('month', businessToday);
    setRange((currentRange) => (
      currentRange.from === nextRange.from && currentRange.to === nextRange.to
        ? currentRange
        : nextRange
    ));
  }, [businessToday, selectedClubId]);

  async function handleDeleteActivity(activity: MoneyReportActivity, date: string) {
    if (!isOwner || !selectedClubId || !activity.id || activity.source === 'debt_payment') return;
    if (deletePending.current) return;
    const clubId = selectedClubId;
    const confirmed = await confirm({
      title: tc('delete'),
      description: t('deleteEntryConfirmDetailed', {
        type: activityTypeLabel(activity),
        category: categoryLabel(activity),
        amount: `${formatCurrency(Math.abs(activity.amount))} ${tc('currency')}`,
        date: formatDateOnly(date, locale),
      }),
      confirmLabel: tc('delete'),
    });
    // The dialog can outlive a club switch; never delete from a stale list.
    if (!confirmed || currentClubId.current !== clubId || deletePending.current) return;

    const key = `${activity.source}:${activity.id}`;
    deletePending.current = true;
    setDeletingKey(key);
    setActionError('');

    try {
      let deleteError: string | null = null;
      if (activity.source === 'expense') {
        const response = await mutateFinanceRequest('/api/expenses', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ clubId, expenseId: activity.id }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => null) as { error?: string; code?: string } | null;
          deleteError = result?.code === 'SALARY_PAYMENT_IMMUTABLE'
            ? t('salaryPaymentProtected')
            : response.status === 401 || response.status === 403
              ? tc('accessDeniedDescription')
              : t('deleteError');
        }
      } else {
        const supabase = createClient();
        const result = await supabase
          .from('daily_cash_entries')
          .delete()
          .eq('club_id', clubId)
          .eq('id', activity.id)
          .select('id');
        if (result.error || (result.data ?? []).length === 0) deleteError = t('deleteError');
      }

      if (currentClubId.current !== clubId) return;
      if (deleteError) {
        setActionError(deleteError);
        return;
      }

      setSelectedEntry(null);
      showToast(t('entryDeleted'));
      await loadReport({ silent: true });
    } catch {
      if (currentClubId.current === clubId) setActionError(t('deleteError'));
    } finally {
      deletePending.current = false;
      setDeletingKey(null);
    }
  }

  function categoryLabel(activity: MoneyReportActivity): string {
    if (activity.kind === 'income') return t('dailyClubIncome');
    if (activity.kind === 'debt_payment') return t('debtPayment');
    const category = activity.category ?? 'other';
    const label = isKnownExpenseCategory(category) ? te(category) : category;
    return activity.paymentSource === 'bar' ? `${t('bar')} · ${label}` : label;
  }

  function activityTypeLabel(activity: MoneyReportActivity): string {
    if (activity.kind === 'income') return t('income');
    if (activity.kind === 'debt_payment') return t('debtPayment');
    return t('expense');
  }

  function paymentLabel(method: string | null): string {
    if (!method) return t('mixedPayments');
    if (method === 'playstation') return t('playstation');
    if (method === 'cash' || method === 'terminal' || method === 'card') {
      return tc(`paymentMethods.${method}`);
    }
    return method;
  }

  const paymentCards = [
    {
      method: 'cash' as const,
      label: t('cash'),
      icon: Banknote,
      iconClassName: 'text-success-600',
      iconBackground: 'bg-success-50',
    },
    {
      method: 'terminal' as const,
      label: t('terminal'),
      icon: Landmark,
      iconClassName: 'text-primary-600',
      iconBackground: 'bg-primary-50',
    },
    {
      method: 'card' as const,
      label: t('card'),
      icon: CreditCard,
      iconClassName: 'text-purple-600',
      iconBackground: 'bg-purple-50',
    },
    {
      method: 'playstation' as const,
      label: t('playstation'),
      icon: Gamepad2,
      iconClassName: 'text-warning-600',
      iconBackground: 'bg-warning-50',
    },
  ];

  async function handleExpenseRegistered() {
    setExpenseDialogOpen(false);
    setAllCustomCategories(null);
    showToast(t('expenseRegistered'));
    if (hasReportsAccess) await loadReport({ silent: true });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={hasExpensesAccess ? (
          <Button onClick={() => setExpenseDialogOpen(true)} icon={<ReceiptText size={18} aria-hidden="true" />}>
            {t('registerExpense')}
          </Button>
        ) : undefined}
      />

      {!hasReportsAccess && <InlineAlert variant="info">{tc('accessDeniedDescription')}</InlineAlert>}
      {hasReportsAccess && loadFailed && (
        <InlineAlert
          variant="danger"
          action={(
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => void loadReport()}
              icon={<RefreshCcw size={15} aria-hidden="true" />}
            >
              {tc('retry')}
            </Button>
          )}
        >
          {t('loadError')}
        </InlineAlert>
      )}
      {actionError && <InlineAlert variant="danger">{actionError}</InlineAlert>}

      {hasReportsAccess && (
        <>
          <div className="grid max-w-5xl gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
            <DateRangePicker
              from={range.from}
              to={range.to}
              fromLabel={t('from')}
              toLabel={t('to')}
              onChange={setRange}
            />
            <Select
              controlSize="lg"
              leadingIcon={<Filter size={17} className="text-primary-600" />}
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as MoneyReportCategoryFilter)}
              className="text-base font-bold text-gray-900"
              aria-label={t('filterByCategory')}
            >
                <option value="all">{t('allCategories')}</option>
                <optgroup label={t('incomeCategories')}>
                  <option value="income">{t('dailyClubIncome')}</option>
                  <option value="debt_payment">{t('debtPayment')}</option>
                </optgroup>
                <optgroup label={t('expenseCategories')}>
                  <option value="expense">{t('allExpenses')}</option>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category} value={`expense:${category}`}>
                      {te(category)}
                    </option>
                  ))}
                  {customExpenseCategories.map((category) => (
                    <option key={category} value={`expense:${category}`}>
                      {category}
                    </option>
                  ))}
                </optgroup>
            </Select>
          </div>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              loading={loading}
              label={t('totalCollected')}
              value={report.totalCollected}
              icon={WalletCards}
              iconClassName="bg-primary-50 text-primary-600"
            />
            <SummaryCard
              loading={loading}
              label={t('expenses')}
              value={report.totalExpenses}
              icon={ReceiptText}
              iconClassName="bg-danger-50 text-danger-600"
            />
            <SummaryCard
              loading={loading}
              label={t('barCashLeft')}
              value={report.barLeft}
              icon={Banknote}
              iconClassName="bg-warning-50 text-warning-600"
            />
            <SummaryCard
              loading={loading}
              label={t('totalLeft')}
              value={report.totalLeft}
              icon={CircleDollarSign}
              iconClassName="bg-success-50 text-success-600"
            />
          </section>

          <section>
            <SectionHeading size="lg" title={t('moneyLeftByPaymentMethod')} description={t('moneyLeftDescription')} className="mb-3" />
            {loading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3].map((item) => (
                  <Skeleton key={item} className="h-56 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {paymentCards.map((card) => (
                  <PaymentCard
                    key={card.method}
                    label={card.label}
                    icon={card.icon}
                    iconClassName={card.iconClassName}
                    iconBackground={card.iconBackground}
                    data={report.paymentMethods[card.method]}
                    collectedLabel={t('collected')}
                    expensesLabel={t('expenses')}
                    leftLabel={t('left')}
                  />
                ))}
              </div>
            )}
          </section>

          <Card as="section" padding="none" className="overflow-hidden">
            <CardHeader>
              <SectionHeading title={t('dailyCloseout')} description={t('dailyCloseoutDescription')} />
            </CardHeader>
            {loading ? (
              <TableSkeleton rows={6} columns={isOwner ? 6 : 5} className="rounded-none border-0 shadow-none" />
            ) : loadFailed ? null : report.days.length === 0 ? (
              <EmptyState compact title={t('noData')} />
            ) : (
              <div
                className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
                role="region"
                aria-label={t('dailyCloseout')}
                tabIndex={0}
              >
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="sticky left-0 z-10 w-44 bg-gray-50 px-4 py-3 text-left sm:px-5">{t('dateAndTime')}</th>
                      <th className="w-32 px-4 py-3 text-left">{t('type')}</th>
                      <th className="w-48 px-4 py-3 text-left">{t('category')}</th>
                      <th className="w-44 px-4 py-3 text-right">{t('amount')}</th>
                      <th className="min-w-[240px] px-4 py-3 text-left">{t('descriptionLabel')}</th>
                      {isOwner && <th className="w-24 px-4 py-3 text-right sm:px-5">{t('actions')}</th>}
                    </tr>
                  </thead>
                  {report.days.map((day) => (
                    <tbody key={day.date} className="divide-y divide-gray-100 border-b border-primary-100 last:border-b-0">
                      <tr className="bg-primary-50">
                        <td colSpan={isOwner ? 6 : 5} className="px-4 py-3 sm:px-5">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="sticky left-4 flex w-fit items-center gap-2 sm:left-5">
                              <span className="font-extrabold text-primary-700">{formatDateOnly(day.date, locale)}</span>
                              <Badge variant="outline" className="rounded-full font-bold text-primary-600">
                                {day.activities.length}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="success" className="rounded-full font-bold">
                                {t('income')}: <Money amount={day.income} />
                              </Badge>
                              <Badge variant="danger" className="rounded-full font-bold">
                                {t('expenses')}: <Money amount={day.expenses} />
                              </Badge>
                              <Badge variant={day.total < 0 ? 'danger' : 'primary'} className="rounded-full font-bold">
                                {t('totalLeft')}: <Money amount={day.total} />
                              </Badge>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {day.activities.map((activity, index) => {
                        const category = activity.category ?? 'other';
                        const deleteKey = activity.id ? `${activity.source}:${activity.id}` : null;
                        const canDelete = isOwner && activity.source !== 'debt_payment' && Boolean(activity.id);

                        return (
                          <tr
                            key={activity.id ?? `${day.date}-${activity.source}-${index}`}
                            onClick={() => setSelectedEntry({ activity, date: day.date })}
                            className={cn('cursor-pointer border-l-4 transition-colors hover:bg-gray-50', activityRowStyle(activity))}
                          >
                            <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-4 align-top sm:px-5">
                              <p className="font-bold text-gray-700">{formatDateOnly(day.date, locale)}</p>
                              <p className="mt-1 text-xs font-medium text-gray-400">{formatTime(activity.createdAt, locale)}</p>
                              <p className="mt-1.5 max-w-40 truncate text-xs font-semibold text-gray-500" title={activity.createdByName || t('unknownCreator')}>
                                {t('addedBy')}: {activity.createdByName || t('unknownCreator')}
                              </p>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); setSelectedEntry({ activity, date: day.date }); }}
                                aria-label={t('viewEntryDetails', { category: categoryLabel(activity) })}
                                className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500', activityKindBadge(activity.kind))}
                              >
                                {activityTypeLabel(activity)}
                              </button>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <span className={cn(
                                'inline-flex rounded-full border px-2.5 py-1 text-xs font-bold',
                                activity.kind === 'expense' ? expenseCategoryStyle(category) : activityKindBadge(activity.kind),
                              )}>
                                {categoryLabel(activity)}
                              </span>
                            </td>
                            <td className={cn(
                              'whitespace-nowrap px-4 py-4 text-right align-top font-black tabular-nums',
                              activity.amount < 0 ? 'text-danger-600' : 'text-success-600',
                            )}>
                              <Money amount={activity.amount} showPlus />
                            </td>
                            <td className="max-w-[320px] px-4 py-4 align-top text-sm leading-5 text-gray-600">
                              {activity.comment || t('noDescription')}
                            </td>
                            {isOwner && (
                              <td className="px-4 py-4 text-right align-top sm:px-5">
                                {canDelete ? (
                                  <Button
                                    variant="dangerOutline"
                                    size="sm"
                                    loading={deletingKey === deleteKey}
                                    disabled={deletingKey !== null && deletingKey !== deleteKey}
                                    aria-label={`${tc('delete')}: ${categoryLabel(activity)} · ${formatCurrency(Math.abs(activity.amount))} ${tc('currency')}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleDeleteActivity(activity, day.date);
                                    }}
                                    icon={<Trash2 size={15} aria-hidden="true" />}
                                  >
                                    {tc('delete')}
                                  </Button>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Modal
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title={t('entryDetails')}
        size="lg"
      >
        {selectedEntry && (
          <div className="space-y-5">
            <div className={cn(
              'rounded-xl border p-4 text-center',
              selectedEntry.activity.amount < 0
                ? 'border-danger-50 bg-danger-50'
                : 'border-success-50 bg-success-50',
            )}>
              <Badge variant="outline" className={activityKindBadge(selectedEntry.activity.kind)}>
                {activityTypeLabel(selectedEntry.activity)}
              </Badge>
              <p className={cn(
                'mt-3 text-2xl font-black tabular-nums',
                selectedEntry.activity.amount < 0 ? 'text-danger-600' : 'text-success-600',
              )}>
                <Money amount={selectedEntry.activity.amount} showPlus />
              </p>
            </div>

            <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 px-4">
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-3 text-sm">
                <dt className="font-medium text-gray-500">{t('dateAndTime')}</dt>
                <dd className="text-right font-bold text-gray-900">
                  {formatDateOnly(selectedEntry.date, locale)} · {formatTime(selectedEntry.activity.createdAt, locale)}
                </dd>
              </div>
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-3 text-sm">
                <dt className="font-medium text-gray-500">{t('category')}</dt>
                <dd className="break-words text-right font-bold text-gray-900">{categoryLabel(selectedEntry.activity)}</dd>
              </div>
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-3 text-sm">
                <dt className="font-medium text-gray-500">{t('addedBy')}</dt>
                <dd className="break-words text-right font-bold text-gray-900">
                  {selectedEntry.activity.createdByName || t('unknownCreator')}
                </dd>
              </div>
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-3 text-sm">
                <dt className="font-medium text-gray-500">{t('paymentMethod')}</dt>
                <dd className="text-right font-bold text-gray-900">
                  {selectedEntry.activity.paymentBreakdown ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      {Object.entries(selectedEntry.activity.paymentBreakdown)
                        .filter(([, amount]) => amount !== 0)
                        .map(([method, amount]) => (
                          <span key={method} className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs ring-1 ring-gray-200">
                            {paymentLabel(method)} · <Money amount={amount} />
                          </span>
                        ))}
                    </div>
                  ) : (
                    paymentLabel(selectedEntry.activity.paymentMethod)
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-3 text-sm">
                <dt className="font-medium text-gray-500">{t('descriptionLabel')}</dt>
                <dd className="break-words text-right font-medium text-gray-700">
                  {selectedEntry.activity.comment || t('noDescription')}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>

      <Modal
        open={expenseDialogOpen}
        onClose={() => setExpenseDialogOpen(false)}
        title={t('registerExpense')}
        size="xl"
      >
        <ExpenseRegistrationForm
          knownCustomCategories={allCustomCategories ? Array.from(new Set([...allCustomCategories, ...customExpenseCategories])).sort((a, b) => a.localeCompare(b)) : undefined}
          onSaved={handleExpenseRegistered}
        />
      </Modal>

      {toastElement}
      {confirmDialog}
    </div>
  );
}
