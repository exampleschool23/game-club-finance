'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, RefreshCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useClub } from '@/components/layout/DashboardShell';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CurrencyInput,
  DataTable,
  EmptyState,
  Field,
  FormSkeleton,
  IconButton,
  InlineAlert,
  Input,
  MonthPicker,
  PageHeader,
  SectionHeading,
  SegmentedControl,
  Skeleton,
  TableSkeleton,
  metricToneClassName,
  toneForAmount,
  useConfirm,
  useToast,
  type DataTableColumn,
} from '@/components/PresentationFoundation';
import { cn } from '@/lib/utils';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { createClient } from '@/lib/supabase/client';
import {
  calculateAvailableMoneyByMonth,
  type AvailableMoneyByMonth,
} from '@/lib/calculations/availableMoney';
import {
  availableForPaymentMethod,
  buildOwnerProfitSnapshot,
  gameClubWithdrawalsByMethod,
  type OwnerProfitSnapshotPayload,
} from '@/lib/calculations/ownerProfitSnapshot';
import type { StockPurchaseCostRow } from '@/lib/calculations/barMoney';
import { clampWithdrawalInput } from '@/lib/withdrawalInput';
import { isMissingDatabaseColumn, isMissingDatabaseFunction } from '@/lib/supabase/errors';
import {
  calculateGameClubMoneyLeftByPaymentMethod,
  DailyCashRow,
  DebtPaymentValueRow,
  emptyMoneyLeftByPaymentMethod,
  ExpenseRow,
  type MoneyLeftByPaymentMethod,
  StockCountRow,
} from '@/lib/calculations/dashboardMetrics';
import {
  formatCurrency,
  parseCurrencyInput,
  formatDateTime,
  formatYearMonth,
} from '@/lib/formatters';
import { currentYearMonth, todayIso } from '@/lib/utils';
import {
  OWNER_WITHDRAWAL_PAYMENT_METHODS,
  OWNER_WITHDRAWAL_SOURCES,
  type OwnerWithdrawal,
  type OwnerWithdrawalPaymentMethod,
  type OwnerWithdrawalSource,
} from '@/types';

type MoneySource = OwnerWithdrawalSource | 'all';

const PROFIT_SOURCES: readonly MoneySource[] = ['all', ...OWNER_WITHDRAWAL_SOURCES];

/** One line of the breakdown table: a profit source, or a payment method under the club. */
interface BreakdownRow {
  key: string;
  label: string;
  /** null when the row has no earnings of its own (withdrawals without a method). */
  earned: number | null;
  withdrawn: number;
  available: number | null;
  nested?: boolean;
  hint?: string;
}

interface WithdrawalMethodRow {
  id: string;
  payment_method: OwnerWithdrawalPaymentMethod;
}

interface HistoryRow {
  month: string;
  withdrawal: OwnerWithdrawal;
}

export default function MoneyTakenPage() {
  const t = useTranslations('moneyTaken');
  const tc = useTranslations('common');
  const { locale } = useAppLocale();
  const { selectedClubId, role, businessDayStartHour, enabledPaymentMethods } = useClub();
  const { showToast, toastElement } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const currentMonth = useMemo(() => currentYearMonth(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [balancesByMonth, setBalancesByMonth] = useState<AvailableMoneyByMonth>({});
  const [paymentMethodBalancesByMonth, setPaymentMethodBalancesByMonth] = useState<Record<string, MoneyLeftByPaymentMethod>>({});
  const [withdrawals, setWithdrawals] = useState<OwnerWithdrawal[]>([]);
  /** Migration 066 is applied: Game Club withdrawals record a payment method. */
  const [methodsSupported, setMethodsSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Balances failed to load; mutations stay disabled until a successful reload. */
  const [error, setError] = useState(false);
  const [form, setForm] = useState({
    month: currentMonth,
    source: 'game_club' as MoneySource,
    paymentMethod: '' as OwnerWithdrawalPaymentMethod | '',
    comment: '',
    amount: '',
  });
  const requestId = useRef(0);
  const mutationPending = useRef(false);
  const isOwner = role === 'owner';
  const withdrawalMonths = useMemo(() => {
    const groups = new Map<string, OwnerWithdrawal[]>();
    for (const withdrawal of withdrawals) {
      const month = withdrawal.period_month.slice(0, 7);
      const rows = groups.get(month) ?? [];
      rows.push(withdrawal);
      groups.set(month, rows);
    }
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [withdrawals]);

  useEffect(() => {
    setForm({ month: currentMonth, source: 'game_club', paymentMethod: '', amount: '', comment: '' });
  }, [currentMonth, selectedClubId]);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    const id = ++requestId.current;
    try {
      if (!selectedClubId) {
        setBalancesByMonth({});
        setPaymentMethodBalancesByMonth({});
        setWithdrawals([]);
        setLoading(false);
        return;
      }

      if (!silent) setLoading(true);
      setError(false);
      const supabase = createClient();
      const [snapshotResult, methodRes] = await Promise.all([
        supabase.rpc('get_owner_profit_snapshot', {
          p_club_id: selectedClubId,
          p_through_date: businessToday,
        }),
        fetchAllRows<WithdrawalMethodRow>(() => supabase
          .from('owner_withdrawals')
          .select('id,payment_method')
          .eq('club_id', selectedClubId)
          .not('payment_method', 'is', null)
          .order('id')),
      ]);

      if (id !== requestId.current) return;

      // Before migration 066 there is no payment_method column: keep every
      // withdrawal unassigned and record new ones by source only.
      const methodsMissing = isMissingDatabaseColumn(methodRes.error as { code?: string; message?: string } | null, 'payment_method');
      if (methodRes.error && !methodsMissing) {
        setError(true);
        setLoading(false);
        return;
      }
      const methodById = new Map((methodRes.data ?? []).map((row) => [row.id, row.payment_method]));
      const withMethods = (rows: OwnerWithdrawal[]) => rows.map((row) => ({
        ...row,
        payment_method: methodById.get(row.id) ?? null,
      }));
      setMethodsSupported(!methodsMissing);

      if (!snapshotResult.error && snapshotResult.data?.paymentMethodBalancesByMonth) {
        const snapshot = buildOwnerProfitSnapshot(snapshotResult.data as OwnerProfitSnapshotPayload);
        setBalancesByMonth(snapshot.byMonth);
        setWithdrawals(withMethods(snapshot.withdrawals));
        setPaymentMethodBalancesByMonth(snapshot.paymentMethodBalancesByMonth);
        setLoading(false);
        return;
      }

      if (snapshotResult.error && !isMissingDatabaseFunction(snapshotResult.error, 'get_owner_profit_snapshot')) {
        setError(true);
        setLoading(false);
        return;
      }

      // Compatibility fallback while the application and migration are deployed separately.
      const [cashRes, stockRes, purchaseRes, expenseRes, debtPaymentRes, withdrawalRes] = await Promise.all([
        fetchAllRows<DailyCashRow>(() => supabase
          .from('daily_cash_entries')
          .select('date,cash_income,terminal_income,card_income,playstation_income')
          .eq('club_id', selectedClubId)
          .lte('date', businessToday)
          .order('id')),
        fetchAllRows<StockCountRow>(() => supabase
          .from('daily_stock_counts')
          .select('date,bar_income,bar_profit,bar_cost,sold_quantity')
          .eq('club_id', selectedClubId)
          .lte('date', businessToday)
          .order('id')),
        fetchAllRows<StockPurchaseCostRow>(() => supabase
          .from('stock_purchases')
          .select('date,quantity,cost_price')
          .eq('club_id', selectedClubId)
          .lte('date', businessToday)
          .order('id')),
        fetchAllRows<ExpenseRow>(() => supabase
          .from('expenses')
          .select('id,date,amount,category,payment_method,payment_source,comment,created_at')
          .eq('club_id', selectedClubId)
          .lte('date', businessToday)
          .order('id')),
        fetchAllRows<DebtPaymentValueRow>(() => supabase
          .from('debt_payments')
          .select('date,amount,payment_method')
          .eq('club_id', selectedClubId)
          .lte('date', businessToday)
          .order('id')),
        fetchAllRows<OwnerWithdrawal>(() => supabase
          .from('owner_withdrawals')
          .select('id,club_id,period_month,source,amount,comment,created_by,created_at,updated_at')
          .eq('club_id', selectedClubId)
          .lte('period_month', `${currentMonth}-01`)
          .order('period_month', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id')),
      ]);
      if (id !== requestId.current) return;
      const firstError = [
        cashRes.error,
        stockRes.error,
        purchaseRes.error,
        expenseRes.error,
        debtPaymentRes.error,
        withdrawalRes.error,
      ].find(Boolean);

      if (firstError) {
        setError(true);
        setLoading(false);
        return;
      }

      const withdrawalRows = withdrawalRes.data ?? [];
      const nextLedgerRows = {
        cashRows: cashRes.data ?? [],
        stockRows: stockRes.data ?? [],
        purchaseRows: purchaseRes.data ?? [],
        expenseRows: expenseRes.data ?? [],
        debtPaymentRows: debtPaymentRes.data ?? [],
        withdrawalRows,
      };
      setBalancesByMonth(calculateAvailableMoneyByMonth({
        ...nextLedgerRows,
        throughDate: businessToday,
      }));
      setWithdrawals(withMethods(withdrawalRows));
      const months = new Set([
        ...nextLedgerRows.cashRows,
        ...nextLedgerRows.expenseRows,
        ...nextLedgerRows.debtPaymentRows,
      ].map((row) => row.date.slice(0, 7)));
      setPaymentMethodBalancesByMonth(Object.fromEntries([...months].map((month) => [
        month,
        calculateGameClubMoneyLeftByPaymentMethod(
          nextLedgerRows.cashRows.filter((row) => row.date.startsWith(month)),
          nextLedgerRows.expenseRows.filter((row) => row.date.startsWith(month)),
          nextLedgerRows.debtPaymentRows.filter((row) => row.date.startsWith(month)),
        ),
      ])));
      setLoading(false);
    } catch {
      if (id === requestId.current) {
        setError(true);
        setLoading(false);
      }
    }
  }, [businessToday, currentMonth, selectedClubId]);

  useEffect(() => {
    void loadData();
    return () => { requestId.current += 1; };
  }, [loadData]);

  const sourceAvailable = useMemo(() => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(form.month)) return 0;

    const availableForMonth = balancesByMonth[form.month];
    if (!availableForMonth) return 0;
    const gameClubAvailable = Math.max(0, availableForMonth.gameClub.available);
    const barAvailable = Math.max(0, availableForMonth.bar.available);
    const sourceBalance = form.source === 'all'
      ? gameClubAvailable + barAvailable
      : form.source === 'bar'
        ? barAvailable
        : gameClubAvailable;

    return Math.max(0, sourceBalance);
  }, [balancesByMonth, form.month, form.source]);

  const paymentMethodBalances = paymentMethodBalancesByMonth[form.month] ?? emptyMoneyLeftByPaymentMethod;
  const monthlyBalance = balancesByMonth[form.month];
  const methodBreakdown = useMemo(
    () => gameClubWithdrawalsByMethod(paymentMethodBalances, withdrawals, form.month),
    [paymentMethodBalances, withdrawals, form.month],
  );
  const usesPaymentMethod = methodsSupported && form.source === 'game_club';
  /** Per method: its own balance, capped by what is left of Game Club profit this month. */
  const methodWithdrawable = useMemo(() => {
    const gameClubAvailable = Math.max(0, monthlyBalance?.gameClub.available ?? 0);
    return Object.fromEntries(methodBreakdown.methods.map((row) => [
      row.method,
      availableForPaymentMethod(row.available, gameClubAvailable),
    ])) as Record<OwnerWithdrawalPaymentMethod, number>;
  }, [methodBreakdown, monthlyBalance]);
  // Methods switched off for the club stay selectable only while they still hold money.
  const pickerMethods = OWNER_WITHDRAWAL_PAYMENT_METHODS.filter((method) => (
    method === 'playstation'
    || (enabledPaymentMethods as readonly string[]).includes(method)
    || methodWithdrawable[method] > 0
  ));
  const withdrawable = usesPaymentMethod
    ? (form.paymentMethod ? methodWithdrawable[form.paymentMethod] : 0)
    : sourceAvailable;

  useEffect(() => {
    if (!usesPaymentMethod) return;
    setForm((current) => {
      if (current.paymentMethod && methodWithdrawable[current.paymentMethod] > 0) return current;
      const next = OWNER_WITHDRAWAL_PAYMENT_METHODS.find((method) => methodWithdrawable[method] > 0) ?? '';
      return next === current.paymentMethod ? current : { ...current, paymentMethod: next };
    });
  }, [methodWithdrawable, usesPaymentMethod]);

  useEffect(() => {
    setForm((current) => {
      const amount = clampWithdrawalInput(current.amount, withdrawable);
      return amount === current.amount ? current : { ...current, amount };
    });
  }, [withdrawable]);

  const monthlyOverallProfit = monthlyBalance?.totalEarned ?? 0;
  const monthlyWithdrawn = monthlyBalance?.totalWithdrawn ?? 0;
  const monthlyAvailable = monthlyBalance?.totalAvailable ?? 0;
  const amountValue = parseCurrencyInput(form.amount);
  const amountValid = Number.isFinite(amountValue) && amountValue > 0 && amountValue <= withdrawable;

  function setField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mutationPending.current || loading || error) return;
    const amount = parseCurrencyInput(form.amount);

    if (!selectedClubId || !isOwner) {
      showToast(t('ownerOnly'), 'error');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > withdrawable || (usesPaymentMethod && !form.paymentMethod)) {
      showToast(t('exceedsAvailable'), 'error');
      return;
    }

    const operationRequestId = requestId.current;
    mutationPending.current = true;
    setSaving(true);
    try {
      const supabase = createClient();
      const rpcName = usesPaymentMethod ? 'withdraw_owner_game_club_money_by_method' : 'withdraw_owner_money_for_month';
      const { error: insertError } = usesPaymentMethod
        ? await supabase.rpc(rpcName, {
          p_club_id: selectedClubId,
          p_period_month: `${form.month}-01`,
          p_payment_method: form.paymentMethod,
          p_amount: amount,
          p_comment: form.comment.trim() || null,
        })
        : await supabase.rpc(rpcName, {
          p_club_id: selectedClubId,
          p_period_month: `${form.month}-01`,
          p_source: form.source,
          p_amount: amount,
          p_comment: form.comment.trim() || null,
        });

      if (operationRequestId !== requestId.current) return;
      if (insertError) {
        showToast(isMissingDatabaseFunction(insertError, rpcName)
          ? t(usesPaymentMethod ? 'methodMigrationRequired' : 'migrationRequired')
          : insertError.code === '23514' ? t('exceedsAvailable') : t('saveError'), 'error');
        await loadData({ silent: true });
        return;
      }

      setForm((current) => ({ ...current, comment: '', amount: '' }));
      showToast(t('saved'), 'success');
      await loadData({ silent: true });
    } catch {
      if (operationRequestId !== requestId.current) return;
      showToast(t('saveError'), 'error');
      await loadData({ silent: true });
    } finally {
      mutationPending.current = false;
      setSaving(false);
    }
  }

  async function handleDelete(row: OwnerWithdrawal) {
    if (mutationPending.current || loading || error || row.club_id !== selectedClubId) return;
    if (!selectedClubId || !isOwner) return;
    const requestIdBeforeConfirm = requestId.current;
    const confirmed = await confirm({
      title: tc('delete'),
      description: t('deleteConfirmDetailed', {
        amount: currency(row.amount),
        source: withdrawalSourceLabel(row),
        month: formatYearMonth(row.period_month.slice(0, 7), locale),
      }),
      confirmLabel: tc('delete'),
    });
    // A club switch or reload while the dialog was open makes `row` stale.
    if (!confirmed || requestIdBeforeConfirm !== requestId.current || mutationPending.current) return;

    const operationRequestId = requestId.current;
    mutationPending.current = true;
    setDeletingId(row.id);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from('owner_withdrawals')
        .delete()
        .eq('club_id', selectedClubId)
        .eq('id', row.id);

      if (operationRequestId !== requestId.current) return;
      if (deleteError) {
        showToast(t('deleteError'), 'error');
        return;
      }

      showToast(t('deleted'), 'success');
      await loadData({ silent: true });
    } catch {
      if (operationRequestId !== requestId.current) return;
      showToast(t('deleteError'), 'error');
      await loadData({ silent: true });
    } finally {
      mutationPending.current = false;
      setDeletingId(null);
    }
  }

  const currency = (amount: number) => `${formatCurrency(amount)} ${tc('currency')}`;
  const methodLabel = (method: OwnerWithdrawalPaymentMethod) => (
    method === 'playstation' ? t('playstation') : tc(`paymentMethods.${method}`)
  );
  function withdrawalSourceLabel(row: OwnerWithdrawal) {
    const source = t(`sources.${row.source}`);
    return row.payment_method ? `${source} · ${methodLabel(row.payment_method)}` : source;
  }
  const sourceOptions = PROFIT_SOURCES.map((source) => ({ value: source, label: t(`sources.${source}`) }));

  const breakdownRows: BreakdownRow[] = [
    {
      key: 'game_club',
      label: t('sources.game_club'),
      earned: monthlyBalance?.gameClub.earned ?? 0,
      withdrawn: monthlyBalance?.gameClub.withdrawn ?? 0,
      available: monthlyBalance?.gameClub.available ?? 0,
    },
    ...methodBreakdown.methods.map((row) => ({
      key: `method:${row.method}`,
      label: methodLabel(row.method),
      earned: row.earned,
      withdrawn: row.withdrawn,
      available: row.available,
      nested: true,
    })),
    ...(methodBreakdown.unassignedWithdrawn > 0 ? [{
      key: 'method:unassigned',
      label: t('unassignedMethod'),
      earned: null,
      withdrawn: methodBreakdown.unassignedWithdrawn,
      available: null,
      nested: true,
      hint: t('unassignedMethodHint'),
    }] : []),
    {
      key: 'bar',
      label: t('sources.bar'),
      earned: monthlyBalance?.bar.earned ?? 0,
      withdrawn: monthlyBalance?.bar.withdrawn ?? 0,
      available: monthlyBalance?.bar.available ?? 0,
    },
  ];

  const emptyCell = <span className="text-gray-300">—</span>;
  const amountCell = (amount: number, className: string) => (
    <span className={cn('tabular-nums', className)}>{formatCurrency(amount)}</span>
  );
  // Fixed widths keep the three money columns aligned between source and method rows.
  const moneyColumnClassName = 'w-[22%] whitespace-nowrap';

  const breakdownColumns: DataTableColumn<BreakdownRow>[] = [
    {
      key: 'label',
      header: t('source'),
      className: 'w-[34%]',
      render: (row) => (row.nested ? (
        <span className="flex items-center gap-2 pl-4 text-gray-600">
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-gray-200" />
          <span className="min-w-0">
            <span className="block">{row.label}</span>
            {row.hint ? <span className="block text-xs leading-5 text-gray-400">{row.hint}</span> : null}
          </span>
        </span>
      ) : (
        <span className="font-semibold text-gray-900">{row.label}</span>
      )),
    },
    {
      key: 'earned',
      header: t('earnedBeforeWithdrawals'),
      align: 'right',
      className: moneyColumnClassName,
      render: (row) => (row.earned === null
        ? emptyCell
        : amountCell(row.earned, cn(
          row.nested ? 'text-gray-700' : 'font-semibold',
          metricToneClassName[toneForAmount(row.earned, row.nested ? 'muted' : 'default')],
        ))),
    },
    {
      key: 'withdrawn',
      header: t('monthlyWithdrawn'),
      align: 'right',
      className: moneyColumnClassName,
      render: (row) => amountCell(row.withdrawn, cn(
        !row.nested && 'font-semibold',
        row.withdrawn > 0 ? 'text-danger-600' : 'text-gray-400',
      )),
    },
    {
      key: 'available',
      header: t('monthlyRemaining'),
      align: 'right',
      className: moneyColumnClassName,
      render: (row) => (row.available === null
        ? emptyCell
        : amountCell(row.available, cn(
          !row.nested && 'font-semibold',
          metricToneClassName[toneForAmount(row.available)],
        ))),
    },
  ];

  const breakdownFooter = {
    label: tc('total'),
    earned: amountCell(monthlyOverallProfit, metricToneClassName[toneForAmount(monthlyOverallProfit, 'default')]),
    withdrawn: amountCell(monthlyWithdrawn, monthlyWithdrawn > 0 ? 'text-danger-600' : 'text-gray-400'),
    available: amountCell(monthlyAvailable, metricToneClassName[toneForAmount(monthlyAvailable)]),
  };

  const historyRows: HistoryRow[] = withdrawalMonths.flatMap(([month, rows]) => rows.map((withdrawal) => ({ month, withdrawal })));

  const historyColumns: DataTableColumn<HistoryRow>[] = [
    {
      key: 'month',
      header: t('month'),
      className: 'whitespace-nowrap',
      render: (row) => <span className="font-medium text-gray-900">{formatYearMonth(row.month, locale)}</span>,
    },
    {
      key: 'source',
      header: t('source'),
      className: 'whitespace-nowrap',
      render: (row) => (
        <span className="flex flex-col items-start gap-1">
          <Badge variant="neutral">{t(`sources.${row.withdrawal.source}`)}</Badge>
          {row.withdrawal.source === 'game_club' ? (
            <span className={cn('text-xs', row.withdrawal.payment_method ? 'text-gray-600' : 'text-gray-400')}>
              {row.withdrawal.payment_method ? methodLabel(row.withdrawal.payment_method) : t('unassignedMethod')}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('amount'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => <span className="font-semibold text-danger-600">−{formatCurrency(row.withdrawal.amount)}</span>,
    },
    {
      key: 'comment',
      header: t('comment'),
      className: 'min-w-[160px]',
      render: (row) => (row.withdrawal.comment
        ? <span className="break-words text-gray-600">{row.withdrawal.comment}</span>
        : emptyCell),
    },
    {
      key: 'recorded',
      header: t('recordedColumn'),
      className: 'whitespace-nowrap',
      render: (row) => <span className="text-gray-500">{formatDateTime(row.withdrawal.created_at, locale)}</span>,
    },
    ...(isOwner ? [{
      key: 'actions',
      header: <span className="sr-only">{tc('actions')}</span>,
      align: 'right' as const,
      className: 'w-14',
      render: (row: HistoryRow) => (
        <IconButton
          variant="danger"
          size="sm"
          label={`${tc('delete')}: ${withdrawalSourceLabel(row.withdrawal)} · ${currency(row.withdrawal.amount)}`}
          icon={<Trash2 size={16} />}
          loading={deletingId === row.withdrawal.id}
          disabled={loading || !!error || saving || deletingId !== null}
          onClick={() => handleDelete(row.withdrawal)}
        />
      ),
    }] : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={t('title')} description={t('description')} />

      {error ? (
        <InlineAlert
          variant="danger"
          action={(
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => void loadData()}
              icon={<RefreshCcw size={15} aria-hidden="true" />}
            >
              {tc('retry')}
            </Button>
          )}
        >
          {t('loadError')}
        </InlineAlert>
      ) : null}

      {/* The one number that matters: what the owner can still take out this month. */}
      <Card as="section" padding="lg" aria-labelledby="owner-profit-headline">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p id="owner-profit-headline" className="text-[13px] font-medium text-gray-500">
              {t('monthlyRemaining')} · {formatYearMonth(form.month, locale)}
            </p>
            {loading ? (
              <div className="mt-3 space-y-2" role="status" aria-label={tc('loading')}>
                <Skeleton className="h-10 w-64 max-w-full" />
                <Skeleton className="h-3 w-40 bg-gray-100" />
              </div>
            ) : (
              <p className={cn('mt-2 break-words text-3xl font-bold leading-none tracking-tight tabular-nums sm:text-4xl', metricToneClassName[toneForAmount(monthlyAvailable)])}>
                {formatCurrency(monthlyAvailable)}
                <span className="ml-2 text-base font-medium tracking-normal text-gray-500">{tc('currency')}</span>
              </p>
            )}
            {!loading && (
              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div className="flex items-baseline gap-2">
                  <dt className="text-gray-500">{t('earnedBeforeWithdrawals')}</dt>
                  <dd className="font-semibold tabular-nums text-gray-900">{formatCurrency(monthlyOverallProfit)}</dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="text-gray-500">{t('monthlyWithdrawn')}</dt>
                  <dd className={cn('font-semibold tabular-nums', monthlyWithdrawn > 0 ? 'text-danger-600' : 'text-gray-900')}>{formatCurrency(monthlyWithdrawn)}</dd>
                </div>
              </dl>
            )}
          </div>
          <Field label={t('month')} className="w-full sm:w-64 sm:shrink-0">
            <MonthPicker value={form.month} max={currentMonth} onChange={(value) => setField('month', value)} />
          </Field>
        </div>
      </Card>

      <Card as="section" padding="none" className="overflow-hidden">
        <CardHeader>
          <SectionHeading title={t('breakdownTitle')} description={t('clubMethodsBeforeWithdrawals')} />
        </CardHeader>
        {loading ? (
          <TableSkeleton rows={6} columns={4} className="rounded-none border-0 shadow-none" />
        ) : (
          <DataTable
            bare
            dense
            label={t('breakdownTitle')}
            minWidth={640}
            columns={breakdownColumns}
            data={breakdownRows}
            footer={breakdownFooter}
            keyExtractor={(row) => row.key}
            rowClassName={(row) => (row.nested ? 'bg-gray-50/40' : undefined)}
          />
        )}
      </Card>

      {loading && withdrawals.length === 0 ? (
        <div className={`grid gap-5 ${isOwner ? 'xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]' : ''}`}>
          {isOwner ? <FormSkeleton /> : null}
          <TableSkeleton rows={5} columns={4} />
        </div>
      ) : (
        <div className={`grid gap-5 ${isOwner ? 'xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]' : ''}`}>
          {isOwner ? (
            <Card as="form" onSubmit={handleSubmit} className="h-fit">
              <SectionHeading
                title={t('recordTitle')}
                description={t('notAnExpense')}
                className="mb-5"
              />

              <div className="space-y-4">
                <Field
                  label={t('source')}
                  hint={usesPaymentMethod ? undefined : (
                    <>
                      {t('availableForSource')}:{' '}
                      <span className="font-semibold tabular-nums text-success-600">{currency(sourceAvailable)}</span>
                    </>
                  )}
                >
                  <SegmentedControl label={t('source')} options={sourceOptions} value={form.source} onChange={(source) => setField('source', source)} disabled={loading} />
                </Field>

                {usesPaymentMethod ? (
                  <Field
                    label={t('paymentMethod')}
                    required
                    hint={form.paymentMethod ? (
                      <>
                        {t('availableForMethod', { method: methodLabel(form.paymentMethod) })}:{' '}
                        <span className="font-semibold tabular-nums text-success-600">{currency(withdrawable)}</span>
                      </>
                    ) : t('noMethodAvailable')}
                  >
                    <SegmentedControl
                      label={t('paymentMethod')}
                      columns="auto"
                      className="grid-cols-2 sm:grid-cols-4"
                      value={form.paymentMethod}
                      onChange={(paymentMethod) => setField('paymentMethod', paymentMethod)}
                      disabled={loading}
                      options={pickerMethods.map((method) => ({
                        value: method,
                        disabled: methodWithdrawable[method] <= 0,
                        label: (
                          <span className="flex flex-col items-center py-1 leading-tight">
                            <span>{methodLabel(method)}</span>
                            <span className="mt-0.5 text-[11px] font-normal tabular-nums opacity-80">{formatCurrency(methodWithdrawable[method])}</span>
                          </span>
                        ),
                      }))}
                    />
                  </Field>
                ) : null}

                <Field
                  label={`${t('amount')} (${tc('currency')})`}
                  htmlFor="withdrawal-amount"
                  required
                  hint={form.source === 'all' ? t(methodsSupported ? 'allAllocationUnassigned' : 'allAllocation') : undefined}
                  error={form.amount && !amountValid ? t('exceedsAvailable') : undefined}
                >
                  <CurrencyInput
                    id="withdrawal-amount"
                    required
                    value={form.amount}
                    invalid={Boolean(form.amount) && !amountValid}
                    onValueChange={(value) => setField('amount', clampWithdrawalInput(value, withdrawable))}
                  />
                </Field>

                <Field label={t('comment')} htmlFor="withdrawal-comment">
                  <Input
                    id="withdrawal-comment"
                    type="text"
                    value={form.comment}
                    onChange={(event) => setField('comment', event.target.value)}
                    placeholder={t('commentPlaceholder')}
                    maxLength={250}
                  />
                </Field>

                <Button
                  type="submit"
                  fullWidth
                  disabled={loading || !!error || deletingId !== null || !amountValid}
                  loading={saving}
                  loadingLabel={tc('saving')}
                  icon={<ArrowDownToLine size={18} aria-hidden="true" />}
                >
                  {t('recordButton')}
                </Button>
              </div>
            </Card>
          ) : null}

          <Card as="section" padding="none" className="h-fit overflow-hidden">
            <CardHeader>
              <SectionHeading title={t('historyTitle')} description={t('historyDescription')} />
            </CardHeader>
            {error && withdrawals.length === 0 ? null : (
              <DataTable
                bare
                dense
                label={t('historyTitle')}
                minWidth={isOwner ? 720 : 640}
                columns={historyColumns}
                data={historyRows}
                keyExtractor={(row) => row.withdrawal.id}
                emptyState={<EmptyState compact title={t('noHistory')} />}
              />
            )}
          </Card>
        </div>
      )}

      {toastElement}
      {confirmDialog}
    </div>
  );
}
