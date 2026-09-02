'use client';

// Route: /reports

import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from 'react';
import {
  Banknote,
  CircleDollarSign,
  CreditCard,
  Filter,
  Gamepad2,
  Landmark,
  LoaderCircle,
  ReceiptText,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useClub } from '@/components/layout/DashboardShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { DateRangePicker } from '@/components/ui/CalendarPicker';
import { Skeleton, TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { Modal } from '@/components/ui/Modal';
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
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { todayIso } from '@/lib/utils';
import { canAccessFeature } from '@/lib/permissions';
import ExpenseRegistrationForm from './ExpensesPanel';

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

function Amount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('tabular-nums', value < 0 && 'text-red-600', className)}>
      {formatCurrency(value)} UZS
    </span>
  );
}

const knownExpenseCategories = [
  'rent',
  'salary',
  'electricity',
  'internet',
  'repair',
  'cleaning',
  'food_drinks',
  'marketing',
  'equipment',
  'tax',
  'other',
] as const;

type KnownExpenseCategory = (typeof knownExpenseCategories)[number];

function isKnownExpenseCategory(category: string): category is KnownExpenseCategory {
  return knownExpenseCategories.includes(category as KnownExpenseCategory);
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
  other: 'border-red-200 bg-red-50 text-red-700',
};

function expenseCategoryStyle(category: string): string {
  return isKnownExpenseCategory(category)
    ? expenseActivityStyles[category]
    : 'border-red-200 bg-red-50 text-red-700';
}

function activityRowStyle(activity: MoneyReportActivity): string {
  if (activity.kind === 'income') return 'border-l-emerald-500 bg-emerald-50/20';
  if (activity.kind === 'debt_payment') return 'border-l-cyan-500 bg-cyan-50/20';
  if (activity.category === 'salary') return 'border-l-violet-500 bg-violet-50/20';
  return 'border-l-red-500 bg-red-50/20';
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  iconBackground,
  loading = false,
}: {
  label: string;
  value: number;
  icon: ElementType;
  iconClassName: string;
  iconBackground: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconBackground)}>
        <Icon size={20} className={iconClassName} aria-hidden="true" />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-500">{label}</p>
      {loading ? (
        <div className="mt-2 space-y-2" role="status" aria-label="Loading">
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-3 w-16 bg-gray-100" />
        </div>
      ) : (
        <p className="mt-1 break-words text-2xl font-extrabold tracking-tight text-gray-950">
          <Amount value={value} />
        </p>
      )}
    </div>
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
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
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
            <Amount value={data.expenses} className="shrink-0 font-semibold text-red-600" />
          </div>
        </div>
      </div>
      <div className={cn(
        'flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-5',
        data.left < 0 ? 'border-red-100 bg-red-50' : 'border-emerald-100 bg-emerald-50',
      )}>
        <span className={cn('text-sm font-bold', data.left < 0 ? 'text-red-700' : 'text-emerald-700')}>
          {leftLabel}
        </span>
        <Amount
          value={data.left}
          className={cn('shrink-0 text-base font-extrabold', data.left < 0 ? 'text-red-700' : 'text-emerald-700')}
        />
      </div>
    </article>
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<{ activity: MoneyReportActivity; date: string } | null>(null);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const requestSequence = useRef(0);
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
    const knownCategories = new Set<string>(knownExpenseCategories);
    return Array.from(new Set(
      reportRows.expenses
        .map((expense) => expense.category)
        .filter((category) => category && !knownCategories.has(category)),
    )).sort((a, b) => a.localeCompare(b));
  }, [reportRows.expenses]);

  useEffect(() => {
    if (!categoryFilter.startsWith('expense:')) return;
    const category = categoryFilter.slice('expense:'.length);
    if (!isKnownExpenseCategory(category) && !customExpenseCategories.includes(category)) {
      setCategoryFilter('all');
    }
  }, [categoryFilter, customExpenseCategories]);

  const loadReport = useCallback(async () => {
    const requestId = ++requestSequence.current;

    if (!selectedClubId || !hasReportsAccess) {
      setReportRows(emptyReportRows);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const supabase = createClient();
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
      setError(firstError.message);
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
      setError(profileResult.error.message);
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
  }, [hasReportsAccess, range.from, range.to, selectedClubId]);

  useEffect(() => {
    loadReport().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setLoading(false);
    });
  }, [loadReport]);

  useEffect(() => {
    const nextRange = getDashboardRange('month', businessToday);
    setRange((currentRange) => (
      currentRange.from === nextRange.from && currentRange.to === nextRange.to
        ? currentRange
        : nextRange
    ));
  }, [businessToday, selectedClubId]);

  async function handleDeleteActivity(activity: MoneyReportActivity) {
    if (!isOwner || !selectedClubId || !activity.id || activity.source === 'debt_payment') return;
    if (!window.confirm(t('deleteEntryConfirm'))) return;

    const key = `${activity.source}:${activity.id}`;
    setDeletingKey(key);
    setError('');
    setSuccess('');

    let deleteError: { message: string } | null = null;
    if (activity.source === 'expense') {
      const response = await fetch('/api/expenses', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clubId: selectedClubId, expenseId: activity.id }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        deleteError = { message: result?.error ?? 'Could not delete expense' };
      }
    } else {
      const supabase = createClient();
      const result = await supabase
        .from('daily_cash_entries')
        .delete()
        .eq('club_id', selectedClubId)
        .eq('id', activity.id);
      deleteError = result.error;
    }

    setDeletingKey(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setSuccess(t('entryDeleted'));
    await loadReport();
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
      iconClassName: 'text-emerald-600',
      iconBackground: 'bg-emerald-50',
    },
    {
      method: 'terminal' as const,
      label: t('terminal'),
      icon: Landmark,
      iconClassName: 'text-blue-600',
      iconBackground: 'bg-blue-50',
    },
    {
      method: 'card' as const,
      label: t('card'),
      icon: CreditCard,
      iconClassName: 'text-violet-600',
      iconBackground: 'bg-violet-50',
    },
    {
      method: 'playstation' as const,
      label: t('playstation'),
      icon: Gamepad2,
      iconClassName: 'text-amber-600',
      iconBackground: 'bg-amber-50',
    },
  ];

  async function handleExpenseRegistered() {
    setExpenseDialogOpen(false);
    setSuccess(t('expenseRegistered'));
    if (hasReportsAccess) await loadReport();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={hasExpensesAccess ? (
          <button type="button" className="btn-primary h-11" onClick={() => setExpenseDialogOpen(true)}>
            <ReceiptText size={18} />
            {t('registerExpense')}
          </button>
        ) : undefined}
      />

      {(error || success) && (
        <div className={cn(
          'rounded-lg border px-4 py-3 text-sm font-semibold',
          error ? 'border-red-200 bg-red-50 text-red-600' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
        )}>
          {error || success}
        </div>
      )}

      <div className="grid max-w-5xl gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
        <DateRangePicker
          from={range.from}
          to={range.to}
          fromLabel={t('from')}
          toLabel={t('to')}
          onChange={setRange}
        />
        <label className="relative block min-w-0">
          <span className="sr-only">{t('filterByCategory')}</span>
          <Filter
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-primary-600"
            aria-hidden="true"
          />
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as MoneyReportCategoryFilter)}
            className="input-field h-14 w-full appearance-none pl-10 pr-9 font-bold text-gray-900"
            aria-label={t('filterByCategory')}
          >
            <option value="all">{t('allCategories')}</option>
            <optgroup label={t('incomeCategories')}>
              <option value="income">{t('dailyClubIncome')}</option>
              <option value="debt_payment">{t('debtPayment')}</option>
            </optgroup>
            <optgroup label={t('expenseCategories')}>
              <option value="expense">{t('allExpenses')}</option>
              {knownExpenseCategories.map((category) => (
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
          </select>
        </label>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          loading={loading}
          label={t('totalCollected')}
          value={report.totalCollected}
          icon={WalletCards}
          iconClassName="text-blue-600"
          iconBackground="bg-blue-50"
        />
        <SummaryCard
          loading={loading}
          label={t('expenses')}
          value={report.totalExpenses}
          icon={ReceiptText}
          iconClassName="text-red-600"
          iconBackground="bg-red-50"
        />
        <SummaryCard
          loading={loading}
          label={t('barCashLeft')}
          value={report.barLeft}
          icon={Banknote}
          iconClassName="text-amber-600"
          iconBackground="bg-amber-50"
        />
        <SummaryCard
          loading={loading}
          label={t('totalLeft')}
          value={report.totalLeft}
          icon={CircleDollarSign}
          iconClassName="text-emerald-600"
          iconBackground="bg-emerald-50"
        />
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-gray-950">{t('moneyLeftByPaymentMethod')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('moneyLeftDescription')}</p>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-56 animate-pulse rounded-xl border border-gray-200 bg-white" />
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

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-4 sm:px-5">
          <h2 className="text-base font-bold text-gray-950">{t('dailyCloseout')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('dailyCloseoutDescription')}</p>
        </div>
        {loading ? (
          <TableSkeleton rows={6} columns={isOwner ? 6 : 5} className="rounded-none border-0 shadow-none" />
        ) : report.days.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold text-gray-500">{t('noData')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-44 px-4 py-3 text-left sm:px-5">{t('dateAndTime')}</th>
                  <th className="w-32 px-4 py-3 text-left">{t('type')}</th>
                  <th className="w-48 px-4 py-3 text-left">{t('category')}</th>
                  <th className="w-44 px-4 py-3 text-right">{t('amount')}</th>
                  <th className="min-w-[240px] px-4 py-3 text-left">{t('descriptionLabel')}</th>
                  {isOwner && <th className="w-24 px-4 py-3 text-right sm:px-5">{t('actions')}</th>}
                </tr>
              </thead>
              {report.days.map((day) => (
                <tbody key={day.date} className="divide-y divide-gray-100 border-b border-blue-100 last:border-b-0">
                  <tr className="bg-blue-50/80">
                    <td colSpan={isOwner ? 6 : 5} className="px-4 py-3 sm:px-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-blue-700">{formatDateOnly(day.date, locale)}</span>
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-blue-600 shadow-sm ring-1 ring-blue-100">
                            {day.activities.length}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                            {t('income')}: {formatCurrency(day.income)} UZS
                          </span>
                          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 ring-1 ring-red-100">
                            {t('expenses')}: {formatCurrency(day.expenses)} UZS
                          </span>
                          <span className={cn(
                            'rounded-full px-3 py-1 text-xs font-bold ring-1',
                            day.total < 0
                              ? 'bg-rose-50 text-rose-700 ring-rose-100'
                              : 'bg-blue-50 text-blue-700 ring-blue-100',
                          )}>
                            {t('totalLeft')}: {formatCurrency(day.total)} UZS
                          </span>
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
                        tabIndex={0}
                        role="button"
                        aria-label={t('viewEntryDetails', { category: categoryLabel(activity) })}
                        onClick={() => setSelectedEntry({ activity, date: day.date })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedEntry({ activity, date: day.date });
                          }
                        }}
                        className={cn(
                          'cursor-pointer border-l-4 transition-colors hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500',
                          activityRowStyle(activity),
                        )}
                      >
                        <td className="whitespace-nowrap px-4 py-4 align-top sm:px-5">
                          <p className="font-bold text-gray-700">{formatDateOnly(day.date, locale)}</p>
                          <p className="mt-1 text-xs font-medium text-gray-400">{formatTime(activity.createdAt, locale)}</p>
                          <p className="mt-1.5 max-w-40 truncate text-xs font-semibold text-gray-500" title={activity.createdByName || t('unknownCreator')}>
                            {t('addedBy')}: {activity.createdByName || t('unknownCreator')}
                          </p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <span className={cn(
                            'inline-flex rounded-full border px-2.5 py-1 text-xs font-bold',
                            activity.kind === 'income'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : activity.kind === 'debt_payment'
                                ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                                : 'border-red-200 bg-red-50 text-red-700',
                          )}>
                            {activity.kind === 'income'
                              ? t('income')
                              : activity.kind === 'debt_payment'
                                ? t('debtPayment')
                                : t('expense')}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <span className={cn(
                            'inline-flex rounded-full border px-2.5 py-1 text-xs font-bold',
                            activity.kind === 'income'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : activity.kind === 'debt_payment'
                                ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                                : expenseCategoryStyle(category),
                          )}>
                            {categoryLabel(activity)}
                          </span>
                        </td>
                        <td className={cn(
                          'whitespace-nowrap px-4 py-4 text-right align-top font-black tabular-nums',
                          activity.amount < 0 ? 'text-red-600' : 'text-emerald-700',
                        )}>
                          {activity.amount > 0 ? '+' : ''}{formatCurrency(activity.amount)} UZS
                        </td>
                        <td className="max-w-[320px] px-4 py-4 align-top text-sm leading-5 text-gray-600">
                          {activity.comment || t('noDescription')}
                        </td>
                        {isOwner && (
                          <td className="px-4 py-4 text-right align-top sm:px-5">
                            {canDelete ? (
                              <button
                                type="button"
                                disabled={deletingKey === deleteKey}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteActivity(activity);
                                }}
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold text-gray-500 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {deletingKey === deleteKey
                                  ? <LoaderCircle size={15} className="animate-spin" />
                                  : <Trash2 size={15} />}
                                {tc('delete')}
                              </button>
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
      </section>

      <Modal
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title={t('entryDetails')}
        className="sm:max-w-lg"
      >
        {selectedEntry && (
          <div className="space-y-5">
            <div className={cn(
              'rounded-xl border p-4 text-center',
              selectedEntry.activity.amount < 0
                ? 'border-red-100 bg-red-50'
                : 'border-emerald-100 bg-emerald-50',
            )}>
              <span className={cn(
                'inline-flex rounded-full border px-2.5 py-1 text-xs font-bold',
                selectedEntry.activity.kind === 'income'
                  ? 'border-emerald-200 bg-white text-emerald-700'
                  : selectedEntry.activity.kind === 'debt_payment'
                    ? 'border-cyan-200 bg-white text-cyan-700'
                    : 'border-red-200 bg-white text-red-700',
              )}>
                {activityTypeLabel(selectedEntry.activity)}
              </span>
              <p className={cn(
                'mt-3 text-2xl font-black tabular-nums',
                selectedEntry.activity.amount < 0 ? 'text-red-600' : 'text-emerald-700',
              )}>
                {selectedEntry.activity.amount > 0 ? '+' : ''}{formatCurrency(selectedEntry.activity.amount)} UZS
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
                            {paymentLabel(method)} · {formatCurrency(amount)} UZS
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
        className="sm:max-w-xl"
      >
        <ExpenseRegistrationForm onSaved={handleExpenseRegistered} />
      </Modal>
    </div>
  );
}
