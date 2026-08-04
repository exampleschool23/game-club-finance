'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  Calendar,
  ChevronDown,
  CircleDollarSign,
  Gamepad2,
  GlassWater,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useClub } from '@/components/layout/DashboardShell';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { Toast, useToast } from '@/components/ui/Toast';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { createClient } from '@/lib/supabase/client';
import { calculateAvailableMoney } from '@/lib/calculations/availableMoney';
import type { StockPurchaseCostRow } from '@/lib/calculations/barMoney';
import type {
  DailyCashRow,
  DebtPaymentValueRow,
  ExpenseRow,
  StockCountRow,
} from '@/lib/calculations/dashboardMetrics';
import {
  formatCurrency,
  formatCurrencyInput,
  formatDateOnly,
  formatDatePickerValue,
  parseCurrencyInput,
} from '@/lib/formatters';
import { todayIso } from '@/lib/utils';
import {
  OWNER_WITHDRAWAL_SOURCES,
  PAYMENT_METHODS,
  type EntryPaymentMethod,
  type OwnerWithdrawal,
  type OwnerWithdrawalSource,
} from '@/types';

type MoneySource = OwnerWithdrawalSource;

interface AvailableBalances {
  gameClubEarned: number;
  barEarned: number;
  gameClubTaken: number;
  barTaken: number;
  gameClubAvailable: number;
  barAvailable: number;
}

interface LedgerRows {
  cashRows: DailyCashRow[];
  stockRows: StockCountRow[];
  purchaseRows: StockPurchaseCostRow[];
  expenseRows: ExpenseRow[];
  debtPaymentRows: DebtPaymentValueRow[];
  withdrawalRows: OwnerWithdrawal[];
}

const emptyBalances: AvailableBalances = {
  gameClubEarned: 0,
  barEarned: 0,
  gameClubTaken: 0,
  barTaken: 0,
  gameClubAvailable: 0,
  barAvailable: 0,
};

const emptyLedgerRows: LedgerRows = {
  cashRows: [],
  stockRows: [],
  purchaseRows: [],
  expenseRows: [],
  debtPaymentRows: [],
  withdrawalRows: [],
};

export default function MoneyTakenPage() {
  const t = useTranslations('moneyTaken');
  const tc = useTranslations('common');
  const { locale } = useAppLocale();
  const { selectedClubId, role, businessDayStartHour } = useClub();
  const { toast, showToast, hideToast } = useToast();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [balances, setBalances] = useState<AvailableBalances>(emptyBalances);
  const [ledgerRows, setLedgerRows] = useState<LedgerRows>(emptyLedgerRows);
  const [withdrawals, setWithdrawals] = useState<OwnerWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    date: businessToday,
    source: 'game_club' as MoneySource,
    amount: '',
    payment_method: 'cash' as EntryPaymentMethod,
    comment: '',
  });
  const isOwner = role === 'owner';

  useEffect(() => {
    setForm((current) => ({ ...current, date: businessToday }));
  }, [businessToday, selectedClubId]);

  const loadData = useCallback(async () => {
    if (!selectedClubId) {
      setBalances(emptyBalances);
      setLedgerRows(emptyLedgerRows);
      setWithdrawals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const supabase = createClient();
    const [cashRes, stockRes, purchaseRes, expenseRes, debtPaymentRes, withdrawalRes] = await Promise.all([
      fetchAllRows<DailyCashRow>(() => supabase
        .from('daily_cash_entries')
        .select('date,cash_income,terminal_income,card_income,playstation_income')
        .eq('club_id', selectedClubId)
        .lte('date', businessToday)),
      fetchAllRows<StockCountRow>(() => supabase
        .from('daily_stock_counts')
        .select('date,bar_income,bar_profit,bar_cost,sold_quantity')
        .eq('club_id', selectedClubId)
        .lte('date', businessToday)),
      fetchAllRows<StockPurchaseCostRow>(() => supabase
        .from('stock_purchases')
        .select('date,quantity,cost_price')
        .eq('club_id', selectedClubId)
        .lte('date', businessToday)),
      fetchAllRows<ExpenseRow>(() => supabase
        .from('expenses')
        .select('id,date,amount,category,payment_method,payment_source,comment,created_at')
        .eq('club_id', selectedClubId)
        .lte('date', businessToday)),
      fetchAllRows<DebtPaymentValueRow>(() => supabase
        .from('debt_payments')
        .select('date,amount,payment_method')
        .eq('club_id', selectedClubId)
        .lte('date', businessToday)),
      fetchAllRows<OwnerWithdrawal>(() => supabase
        .from('owner_withdrawals')
        .select('id,club_id,date,source,amount,payment_method,comment,created_by,created_at,updated_at')
        .eq('club_id', selectedClubId)
        .lte('date', businessToday)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })),
    ]);
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
    const availableMoney = calculateAvailableMoney({
      ...nextLedgerRows,
      throughDate: businessToday,
    });
    setLedgerRows(nextLedgerRows);
    setWithdrawals(withdrawalRows);
    setBalances({
      gameClubEarned: availableMoney.gameClub.earned,
      barEarned: availableMoney.bar.earned,
      gameClubTaken: availableMoney.gameClub.withdrawn,
      barTaken: availableMoney.bar.withdrawn,
      gameClubAvailable: availableMoney.gameClub.available,
      barAvailable: availableMoney.bar.available,
    });
    setLoading(false);
  }, [businessToday, selectedClubId]);

  useEffect(() => {
    loadData().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : tc('error'));
      setLoading(false);
    });
  }, [loadData, tc]);

  const sourceAvailable = useMemo(() => {
    const availableOnDate = calculateAvailableMoney({ ...ledgerRows, throughDate: form.date });
    return form.source === 'bar' ? availableOnDate.bar.available : availableOnDate.gameClub.available;
  }, [form.date, form.source, ledgerRows]);
  const totalAvailable = balances.gameClubAvailable + balances.barAvailable;
  const totalTaken = balances.gameClubTaken + balances.barTaken;

  useEffect(() => {
    const maximumAmount = Math.max(0, Math.floor(sourceAvailable));
    setForm((current) => {
      const currentAmount = parseCurrencyInput(current.amount);
      return currentAmount > maximumAmount
        ? { ...current, amount: formatCurrencyInput(String(maximumAmount)) }
        : current;
    });
  }, [sourceAvailable]);

  function setField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const amount = parseCurrencyInput(form.amount);

    if (!selectedClubId || !isOwner) {
      showToast(t('ownerOnly'), 'error');
      return;
    }
    if (!amount || amount <= 0) {
      showToast(tc('invalidAmount'), 'error');
      return;
    }
    if (amount > sourceAvailable) {
      showToast(t('exceedsAvailable'), 'error');
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from('owner_withdrawals').insert({
      club_id: selectedClubId,
      date: form.date,
      source: form.source,
      amount,
      payment_method: form.payment_method,
      comment: form.comment.trim() || null,
    });
    setSaving(false);

    if (insertError) {
      showToast(insertError.code === '23514' ? t('exceedsAvailable') : insertError.message, 'error');
      return;
    }

    setForm((current) => ({ ...current, amount: '', comment: '' }));
    showToast(t('saved'), 'success');
    await loadData();
  }

  async function handleDelete(row: OwnerWithdrawal) {
    if (!selectedClubId || !isOwner || !window.confirm(t('deleteConfirm'))) return;

    setDeletingId(row.id);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from('owner_withdrawals')
      .delete()
      .eq('club_id', selectedClubId)
      .eq('id', row.id);
    setDeletingId(null);

    if (deleteError) {
      showToast(deleteError.message, 'error');
      return;
    }

    showToast(t('deleted'), 'success');
    await loadData();
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('title')} description={t('description')} />

      {error ? (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t('totalAvailable')}
          value={`${formatCurrency(totalAvailable, locale)} ${tc('currency')}`}
          icon={CircleDollarSign}
          valueClassName={totalAvailable < 0 ? 'text-red-600' : 'text-emerald-700'}
        />
        <MetricCard
          label={t('gameClubAvailable')}
          value={`${formatCurrency(balances.gameClubAvailable, locale)} ${tc('currency')}`}
          icon={Gamepad2}
          valueClassName={balances.gameClubAvailable < 0 ? 'text-red-600' : 'text-blue-700'}
        />
        <MetricCard
          label={t('barAvailable')}
          value={`${formatCurrency(balances.barAvailable, locale)} ${tc('currency')}`}
          icon={GlassWater}
          valueClassName={balances.barAvailable < 0 ? 'text-red-600' : 'text-orange-700'}
        />
        <MetricCard
          label={t('totalTaken')}
          value={`${formatCurrency(totalTaken, locale)} ${tc('currency')}`}
          icon={ArrowDownToLine}
        />
      </div>

      {loading ? (
        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-10 text-center text-sm font-semibold text-gray-500">
          {tc('loading')}
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <form onSubmit={handleSubmit} className="h-fit rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <ArrowDownToLine size={21} />
              </span>
              <div>
                <h2 className="font-bold text-gray-950">{t('recordTitle')}</h2>
                <p className="mt-0.5 text-sm text-gray-500">{t('notAnExpense')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">{t('source')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {OWNER_WITHDRAWAL_SOURCES.map((source) => (
                    <button
                      key={source}
                      type="button"
                      onClick={() => setField('source', source)}
                      className={`min-h-11 rounded-lg border px-3 text-sm font-bold transition ${form.source === source ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300'}`}
                    >
                      {t(`sources.${source}`)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs font-semibold text-gray-500">
                  {t('availableForSource')}: <span className={sourceAvailable < 0 ? 'text-red-600' : 'text-emerald-700'}>{formatCurrency(sourceAvailable, locale)} {tc('currency')}</span>
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">{t('date')}</label>
                  <label className="relative block h-11 cursor-pointer">
                    <input
                      type="date"
                      max={businessToday}
                      value={form.date}
                      onClick={(event) => event.currentTarget.showPicker?.()}
                      onChange={(event) => setField('date', event.target.value)}
                      className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      required
                    />
                    <span className="pointer-events-none flex h-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm shadow-sm peer-focus:border-primary-500 peer-focus:ring-2 peer-focus:ring-primary-100">
                      <Calendar size={16} className="text-gray-500" />
                      <span className="font-semibold text-gray-950">{formatDatePickerValue(form.date, locale)}</span>
                      <ChevronDown size={16} className="ml-auto text-gray-400" />
                    </span>
                  </label>
                </div>
                <div>
                  <label className="label">{t('amount')}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.amount}
                    onChange={(event) => {
                      const formattedAmount = formatCurrencyInput(event.target.value);
                      const enteredAmount = parseCurrencyInput(formattedAmount);
                      const maximumAmount = Math.max(0, Math.floor(sourceAvailable));
                      setField(
                        'amount',
                        enteredAmount > maximumAmount
                          ? formatCurrencyInput(String(maximumAmount))
                          : formattedAmount,
                      );
                    }}
                    className="input-field h-11 font-bold"
                    placeholder="0"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">{t('paymentMethod')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setField('payment_method', method)}
                      className={`min-h-10 rounded-lg border px-2 text-sm font-bold transition ${form.payment_method === method ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-600 hover:border-primary-300'}`}
                    >
                      {tc(`paymentMethods.${method}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">{t('comment')}</label>
                <input
                  type="text"
                  value={form.comment}
                  onChange={(event) => setField('comment', event.target.value)}
                  className="input-field"
                  placeholder={t('commentPlaceholder')}
                  maxLength={250}
                />
              </div>

              <button
                type="submit"
                disabled={saving || sourceAvailable <= 0}
                className="btn-primary min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                <WalletCards size={18} />
                {saving ? tc('saving') : t('recordButton')}
              </button>
            </div>
          </form>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="font-bold text-gray-950">{t('historyTitle')}</h2>
              <p className="mt-0.5 text-sm text-gray-500">{t('historyDescription')}</p>
            </div>

            {withdrawals.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-4 py-10 text-center text-sm font-semibold text-gray-400">
                {t('noHistory')}
              </div>
            ) : (
              <div className="space-y-2">
                {withdrawals.map((row) => (
                  <article key={row.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-1 text-xs font-bold ${row.source === 'bar' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                            {t(`sources.${row.source}`)}
                          </span>
                          <span className="text-xs font-semibold text-gray-500">{formatDateOnly(row.date, locale)}</span>
                          <span className="text-xs font-semibold text-gray-500">· {tc(`paymentMethods.${row.payment_method}`)}</span>
                        </div>
                        <p className="mt-2 text-lg font-black text-gray-950">− {formatCurrency(row.amount, locale)} {tc('currency')}</p>
                        {row.comment ? <p className="mt-1 break-words text-sm text-gray-600">{row.comment}</p> : null}
                      </div>
                      {isOwner ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          disabled={deletingId === row.id}
                          aria-label={tc('delete')}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 size={17} />
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {toast ? <Toast message={toast.message} type={toast.type} onClose={hideToast} /> : null}
    </div>
  );
}
