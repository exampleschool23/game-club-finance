'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Banknote,
  CircleDollarSign,
  CreditCard,
  Gamepad2,
  GlassWater,
  Landmark,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useClub } from '@/components/layout/DashboardShell';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import {
  Badge,
  Button,
  Card,
  CurrencyInput,
  EmptyState,
  Field,
  FormSkeleton,
  IconButton,
  InlineAlert,
  Input,
  MetricCard,
  MonthPicker,
  PageHeader,
  SectionHeading,
  SegmentedControl,
  TableSkeleton,
  toneForAmount,
  useConfirm,
  useToast,
} from '@/components/PresentationFoundation';
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
  const [error, setError] = useState('');
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
      setError('');
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
        setError(snapshotResult.error.message);
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
        setError(firstError.message);
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
    } catch (loadError: unknown) {
      if (id === requestId.current) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
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
          : insertError.code === '23514' ? t('exceedsAvailable') : insertError.message, 'error');
        await loadData({ silent: true });
        return;
      }

      setForm((current) => ({ ...current, comment: '', amount: '' }));
      showToast(t('saved'), 'success');
      await loadData({ silent: true });
    } catch (saveError: unknown) {
      if (operationRequestId !== requestId.current) return;
      showToast(saveError instanceof Error ? saveError.message : String(saveError), 'error');
      await loadData({ silent: true });
    } finally {
      mutationPending.current = false;
      setSaving(false);
    }
  }

  async function handleDelete(row: OwnerWithdrawal) {
    if (mutationPending.current || loading || error || row.club_id !== selectedClubId) return;
    if (!selectedClubId || !isOwner) return;
    const confirmed = await confirm({ title: tc('delete'), description: t('deleteConfirm'), confirmLabel: tc('delete') });
    if (!confirmed) return;

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
        showToast(deleteError.message, 'error');
        return;
      }

      showToast(t('deleted'), 'success');
      await loadData({ silent: true });
    } catch (deleteError: unknown) {
      if (operationRequestId !== requestId.current) return;
      showToast(deleteError instanceof Error ? deleteError.message : String(deleteError), 'error');
      await loadData({ silent: true });
    } finally {
      mutationPending.current = false;
      setDeletingId(null);
    }
  }

  const currency = (amount: number) => `${formatCurrency(amount)} ${tc('currency')}`;
  const sourceOptions = PROFIT_SOURCES.map((source) => ({ value: source, label: t(`sources.${source}`) }));

  function renderSourceSection(
    source: 'game_club' | 'bar',
    balance: { earned: number; withdrawn: number; available: number } | undefined,
    icon: typeof Gamepad2,
  ) {
    return (
      <Card as="section" tone={source === 'bar' ? 'orange' : 'info'} className="mt-5" aria-labelledby={`profit-source-${source}`}>
        <h2 id={`profit-source-${source}`} className="mb-4 font-bold text-gray-950">
          {t(`sources.${source}`)} · {formatYearMonth(form.month, locale)}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard loading={loading} label={t('earnedBeforeWithdrawals')} value={currency(balance?.earned ?? 0)} icon={icon} tone={toneForAmount(balance?.earned ?? 0, 'primary')} />
          <MetricCard loading={loading} label={t('monthlyWithdrawn')} value={currency(balance?.withdrawn ?? 0)} icon={ArrowDownToLine} tone="danger" />
          <MetricCard loading={loading} label={t('monthlyRemaining')} value={currency(balance?.available ?? 0)} icon={CircleDollarSign} tone={toneForAmount(balance?.available ?? 0)} />
        </div>
        {source === 'game_club' && (
          <>
            <p className="mb-3 mt-4 text-sm text-gray-600">{t('clubMethodsBeforeWithdrawals')}</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ['cash', Banknote],
                ['terminal', Landmark],
                ['card', CreditCard],
                ['playstation', Gamepad2],
              ] as const).map(([method, Icon]) => (
                <MetricCard
                  key={method}
                  loading={loading}
                  label={method === 'playstation' ? t('playstation') : tc(`paymentMethods.${method}`)}
                  value={currency(paymentMethodBalances[method])}
                  icon={Icon}
                  tone={toneForAmount(paymentMethodBalances[method], 'primary')}
                />
              ))}
            </div>
          </>
        )}
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={(
          <Field label={t('month')} className="sm:w-64">
            <MonthPicker value={form.month} max={currentMonth} onChange={(value) => setField('month', value)} />
          </Field>
        )}
      />

      {error ? <InlineAlert variant="danger" className="mb-5">{error}</InlineAlert> : null}

      <section aria-label={t('monthlyOverallProfit')}>
        <MetricCard
          loading={loading}
          label={`${t('monthlyOverallProfit')} · ${formatYearMonth(form.month, locale)}`}
          value={currency(monthlyOverallProfit)}
          icon={CircleDollarSign}
          tone={toneForAmount(monthlyOverallProfit, 'primary')}
          helper={t('monthlyOverallProfitDescription')}
        />
      </section>

      {renderSourceSection('game_club', monthlyBalance?.gameClub, Gamepad2)}
      {renderSourceSection('bar', monthlyBalance?.bar, GlassWater)}

      {loading && withdrawals.length === 0 ? (
        <div className={`mt-5 grid gap-5 ${isOwner ? 'xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]' : ''}`}>
          {isOwner ? <FormSkeleton /> : null}
          <TableSkeleton rows={5} columns={4} />
        </div>
      ) : (
        <div className={`mt-5 grid gap-5 ${isOwner ? 'xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]' : ''}`}>
          {isOwner ? (
            <Card as="form" onSubmit={handleSubmit} className="h-fit">
              <SectionHeading
                icon={<ArrowDownToLine size={21} aria-hidden="true" />}
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

          <Card as="section">
            <SectionHeading title={t('historyTitle')} description={t('historyDescription')} className="mb-4" />

            {withdrawals.length === 0 ? (
              <EmptyState compact bordered title={t('noHistory')} />
            ) : (
              <div className="space-y-6">
                {withdrawalMonths.map(([month, rows]) => (
                  <section key={month} aria-labelledby={`withdrawal-month-${month}`}>
                    <h3 id={`withdrawal-month-${month}`} className="mb-3 border-b border-gray-200 pb-2 text-sm font-bold text-gray-700">
                      {formatYearMonth(month, locale)}
                    </h3>
                    <div className="space-y-2">
                      {rows.map((row) => (
                        <article key={row.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <Badge variant={row.source === 'bar' ? 'orange' : 'info'}>{t(`sources.${row.source}`)}</Badge>
                              <p className="mt-2 text-lg font-bold tabular-nums text-danger-600">− {currency(row.amount)}</p>
                              {row.comment ? <p className="mt-1 break-words text-sm text-gray-600">{row.comment}</p> : null}
                              <p className="mt-1 text-xs font-medium text-gray-400">
                                {t('recordedAt', { date: formatDateTime(row.created_at, locale) })}
                              </p>
                            </div>
                            {isOwner ? (
                              <IconButton
                                variant="danger"
                                size="sm"
                                label={tc('delete')}
                                icon={<Trash2 size={16} />}
                                loading={deletingId === row.id}
                                disabled={loading || !!error || saving || deletingId !== null}
                                onClick={() => handleDelete(row)}
                              />
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {toastElement}
      {confirmDialog}
    </div>
  );
}
