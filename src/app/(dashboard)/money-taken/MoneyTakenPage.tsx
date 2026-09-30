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
  type MetricTone,
} from '@/components/PresentationFoundation';
import { cn } from '@/lib/utils';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { createClient } from '@/lib/supabase/client';
import {
  calculateAvailableMoneyByMonth,
  type AvailableMoneyByMonth,
} from '@/lib/calculations/availableMoney';
import {
  buildOwnerProfitSnapshot,
  type OwnerProfitSnapshotPayload,
} from '@/lib/calculations/ownerProfitSnapshot';
import type { StockPurchaseCostRow } from '@/lib/calculations/barMoney';
import { clampWithdrawalInput } from '@/lib/withdrawalInput';
import { isMissingDatabaseFunction } from '@/lib/supabase/errors';
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
import { OWNER_WITHDRAWAL_SOURCES, type OwnerWithdrawal, type OwnerWithdrawalSource } from '@/types';

type MoneySource = OwnerWithdrawalSource | 'all';

const PROFIT_SOURCES: readonly MoneySource[] = ['all', ...OWNER_WITHDRAWAL_SOURCES];
const CLUB_PAYMENT_METHODS = ['cash', 'terminal', 'card', 'playstation'] as const;

/** One line of the breakdown table: a profit source, or a payment method under the club. */
interface BreakdownRow {
  key: string;
  label: string;
  earned: number;
  withdrawn: number | null;
  available: number | null;
  nested?: boolean;
}

interface HistoryRow {
  month: string;
  withdrawal: OwnerWithdrawal;
}

export default function MoneyTakenPage() {
  const t = useTranslations('moneyTaken');
  const tc = useTranslations('common');
  const { locale } = useAppLocale();
  const { selectedClubId, role, businessDayStartHour } = useClub();
  const { showToast, toastElement } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const currentMonth = useMemo(() => currentYearMonth(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [balancesByMonth, setBalancesByMonth] = useState<AvailableMoneyByMonth>({});
  const [paymentMethodBalancesByMonth, setPaymentMethodBalancesByMonth] = useState<Record<string, MoneyLeftByPaymentMethod>>({});
  const [withdrawals, setWithdrawals] = useState<OwnerWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Balances failed to load; mutations stay disabled until a successful reload. */
  const [error, setError] = useState(false);
  const [form, setForm] = useState({
    month: currentMonth,
    source: 'game_club' as MoneySource,
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
    setForm({ month: currentMonth, source: 'game_club', amount: '', comment: '' });
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
      const snapshotResult = await supabase.rpc('get_owner_profit_snapshot', {
        p_club_id: selectedClubId,
        p_through_date: businessToday,
      });

      if (id !== requestId.current) return;

      if (!snapshotResult.error && snapshotResult.data?.paymentMethodBalancesByMonth) {
        const snapshot = buildOwnerProfitSnapshot(snapshotResult.data as OwnerProfitSnapshotPayload);
        setBalancesByMonth(snapshot.byMonth);
        setWithdrawals(snapshot.withdrawals);
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
      setWithdrawals(withdrawalRows);
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
  useEffect(() => {
    setForm((current) => {
      const amount = clampWithdrawalInput(current.amount, sourceAvailable);
      return amount === current.amount ? current : { ...current, amount };
    });
  }, [sourceAvailable]);

  const paymentMethodBalances = paymentMethodBalancesByMonth[form.month] ?? emptyMoneyLeftByPaymentMethod;
  const monthlyBalance = balancesByMonth[form.month];
  const monthlyOverallProfit = monthlyBalance?.totalEarned ?? 0;
  const monthlyWithdrawn = monthlyBalance?.totalWithdrawn ?? 0;
  const monthlyAvailable = monthlyBalance?.totalAvailable ?? 0;
  const amountValue = parseCurrencyInput(form.amount);
  const amountValid = Number.isFinite(amountValue) && amountValue > 0 && amountValue <= sourceAvailable;

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
    if (!Number.isFinite(amount) || amount <= 0 || amount > sourceAvailable) {
      showToast(t('exceedsAvailable'), 'error');
      return;
    }

    const operationRequestId = requestId.current;
    mutationPending.current = true;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.rpc('withdraw_owner_money_for_month', {
        p_club_id: selectedClubId,
        p_period_month: `${form.month}-01`,
        p_source: form.source,
        p_amount: amount,
        p_comment: form.comment.trim() || null,
      });

      if (operationRequestId !== requestId.current) return;
      if (insertError) {
        showToast(isMissingDatabaseFunction(insertError, 'withdraw_owner_money_for_month')
          ? t('migrationRequired')
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
        source: t(`sources.${row.source}`),
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
  const sourceOptions = PROFIT_SOURCES.map((source) => ({ value: source, label: t(`sources.${source}`) }));

  const breakdownRows: BreakdownRow[] = [
    {
      key: 'game_club',
      label: t('sources.game_club'),
      earned: monthlyBalance?.gameClub.earned ?? 0,
      withdrawn: monthlyBalance?.gameClub.withdrawn ?? 0,
      available: monthlyBalance?.gameClub.available ?? 0,
    },
    ...CLUB_PAYMENT_METHODS.map((method) => ({
      key: `method:${method}`,
      label: method === 'playstation' ? t('playstation') : tc(`paymentMethods.${method}`),
      earned: paymentMethodBalances[method],
      withdrawn: null,
      available: null,
      nested: true,
    })),
    {
      key: 'bar',
      label: t('sources.bar'),
      earned: monthlyBalance?.bar.earned ?? 0,
      withdrawn: monthlyBalance?.bar.withdrawn ?? 0,
      available: monthlyBalance?.bar.available ?? 0,
    },
  ];

  const signedCell = (amount: number, tone: MetricTone) => (
    <span className={cn('font-semibold', metricToneClassName[tone])}>{formatCurrency(amount)}</span>
  );

  const breakdownColumns: DataTableColumn<BreakdownRow>[] = [
    {
      key: 'label',
      header: t('source'),
      render: (row) => (
        <span className={cn(row.nested ? 'pl-5 text-gray-500' : 'font-semibold text-gray-900')}>{row.label}</span>
      ),
    },
    {
      key: 'earned',
      header: t('earnedBeforeWithdrawals'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => (row.nested
        ? <span className="text-gray-600">{formatCurrency(row.earned)}</span>
        : signedCell(row.earned, toneForAmount(row.earned, 'default'))),
    },
    {
      key: 'withdrawn',
      header: t('monthlyWithdrawn'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => (row.withdrawn === null
        ? <span className="text-gray-300">—</span>
        : <span className={cn(row.withdrawn > 0 ? 'text-danger-600' : 'text-gray-600')}>{formatCurrency(row.withdrawn)}</span>),
    },
    {
      key: 'available',
      header: t('monthlyRemaining'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => (row.available === null
        ? <span className="text-gray-300">—</span>
        : signedCell(row.available, toneForAmount(row.available))),
    },
  ];

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
      render: (row) => <Badge variant="neutral">{t(`sources.${row.withdrawal.source}`)}</Badge>,
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
        : <span className="text-gray-300">—</span>),
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
          label={`${tc('delete')}: ${t(`sources.${row.withdrawal.source}`)} · ${currency(row.withdrawal.amount)}`}
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
            keyExtractor={(row) => row.key}
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
                  hint={(
                    <>
                      {t('availableForSource')}:{' '}
                      <span className={sourceAvailable < 0 ? 'font-semibold text-danger-600' : 'font-semibold text-success-600'}>{currency(sourceAvailable)}</span>
                    </>
                  )}
                >
                  <SegmentedControl label={t('source')} options={sourceOptions} value={form.source} onChange={(source) => setField('source', source)} disabled={loading} />
                </Field>

                <Field
                  label={`${t('amount')} (${tc('currency')})`}
                  htmlFor="withdrawal-amount"
                  required
                  hint={form.source === 'all' ? t('allAllocation') : undefined}
                  error={form.amount && !amountValid ? t('exceedsAvailable') : undefined}
                >
                  <CurrencyInput
                    id="withdrawal-amount"
                    required
                    value={form.amount}
                    invalid={Boolean(form.amount) && !amountValid}
                    onValueChange={(value) => setField('amount', clampWithdrawalInput(value, sourceAvailable))}
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
