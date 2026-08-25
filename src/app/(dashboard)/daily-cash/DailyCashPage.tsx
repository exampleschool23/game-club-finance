'use client';

// Route: /daily-cash

import { useCallback, useEffect, useMemo, useState, type ElementType, type FormEvent } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Banknote,
  Clock3,
  CreditCard,
  Edit3,
  Gamepad2,
  Info,
  MonitorSmartphone,
  RefreshCcw,
  Save,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { calculateGameClubIncome } from '@/lib/calculations/dailyCash';
import { canEditEntryForRole, getEditDeadline } from '@/lib/time/editWindow';
import { useClub } from '@/components/layout/DashboardShell';
import { DatePicker } from '@/components/ui/CalendarPicker';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { todayIso } from '@/lib/utils';
import { formatCurrency, formatCurrencyInput, formatDateTime, parseCurrencyInput } from '@/lib/formatters';
import type { DailyCashEntry } from '@/types';

interface CashFormData {
  date: string;
  cash_income: string;
  terminal_income: string;
  card_income: string;
  playstation_income: string;
  comment: string;
}

interface BarSummary {
  sales: number;
  profit: number;
}

const emptyForm = (date = todayIso()): CashFormData => ({
  date,
  cash_income: '',
  terminal_income: '',
  card_income: '',
  playstation_income: '',
  comment: '',
});

function parseAmount(value: string): number {
  const parsed = parseCurrencyInput(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function amountToInput(value: number | null | undefined): string {
  return value && value > 0 ? formatCurrencyInput(value) : '';
}


function formatRemaining(ms: number): string {
  const safe = Math.max(0, ms);
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function entryToForm(entry: DailyCashEntry): CashFormData {
  return {
    date: entry.date,
    cash_income: amountToInput(entry.cash_income),
    terminal_income: amountToInput(entry.terminal_income),
    card_income: amountToInput(entry.card_income),
    playstation_income: amountToInput(entry.playstation_income),
    comment: entry.comment ?? '',
  };
}

interface PaymentCardProps {
  label: string;
  value: string;
  icon: ElementType;
  iconClassName: string;
  iconBgClassName: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

function PaymentCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  iconBgClassName,
  disabled,
  onChange,
}: PaymentCardProps) {
  const amount = parseAmount(value);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBgClassName}`}>
          <Icon size={19} className={iconClassName} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-gray-700">{label}</p>
          <p className="mt-1 break-words text-lg font-bold leading-tight text-gray-950">
            {formatCurrency(amount)}
          </p>
          <p className="text-[11px] font-medium text-gray-500">UZS</p>
        </div>
      </div>
      <input
        type="text"
        inputMode="numeric"
        className="mt-3 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
        placeholder="0"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(formatCurrencyInput(event.target.value))}
      />
    </div>
  );
}

export default function DailyCashPage() {
  const t = useTranslations('dailyCash');
  const tc = useTranslations('common');
  const { selectedClubId, role: currentRole, businessDayStartHour } = useClub();
  const { locale } = useAppLocale();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [form, setForm] = useState<CashFormData>(() => emptyForm(businessToday));
  const [entry, setEntry] = useState<DailyCashEntry | null>(null);
  const [createdByName, setCreatedByName] = useState('Admin');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [barSummary, setBarSummary] = useState<BarSummary>({ sales: 0, profit: 0 });

  useEffect(() => {
    setForm(emptyForm(businessToday));
  }, [businessToday, selectedClubId]);

  const fetchExisting = useCallback(
    async (date: string) => {
      if (!selectedClubId) {
        setEntry(null);
        setForm(emptyForm(date));
        setBarSummary({ sales: 0, profit: 0 });
        setLoading(false);
        return;
      }

      const supabase = createClient();
      setLoading(true);
      setMessage('');
      setError('');

      const [cashRes, barRes] = await Promise.all([
        supabase
          .from('daily_cash_entries')
          .select('*')
          .eq('club_id', selectedClubId)
          .eq('date', date)
          .maybeSingle(),
        supabase
          .from('daily_stock_counts')
          .select('bar_income,bar_profit')
          .eq('club_id', selectedClubId)
          .eq('date', date),
      ]);

      const { data, error: fetchError } = cashRes;

      if (fetchError || barRes.error) {
        setError(fetchError?.message ?? barRes.error?.message ?? 'Error');
        setEntry(null);
        setForm(emptyForm(date));
        setBarSummary({ sales: 0, profit: 0 });
        setLoading(false);
        return;
      }

      const stockRows = (barRes.data ?? []) as Array<{ bar_income: number | null; bar_profit: number | null }>;
      setBarSummary(
        stockRows.reduce(
          (acc, row) => ({
            sales: acc.sales + Number(row.bar_income ?? 0),
            profit: acc.profit + Number(row.bar_profit ?? 0),
          }),
          { sales: 0, profit: 0 },
        ),
      );

      const cashEntry = data as DailyCashEntry | null;
      setEntry(cashEntry);
      setForm(cashEntry ? entryToForm(cashEntry) : emptyForm(date));

      if (cashEntry?.created_by) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', cashEntry.created_by)
          .maybeSingle();
        setCreatedByName(profile?.full_name ?? 'Admin');
      } else {
        setCreatedByName('Admin');
      }

      setLoading(false);
    },
    [selectedClubId],
  );

  useEffect(() => {
    fetchExisting(form.date).catch((fetchError) => {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      setLoading(false);
    });
  }, [form.date, fetchExisting]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function setField(field: keyof CashFormData, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage('');
    setError('');
  }

  const values = useMemo(
    () => ({
      cashIncome: parseAmount(form.cash_income),
      terminalIncome: parseAmount(form.terminal_income),
      cardIncome: parseAmount(form.card_income),
      playstationIncome: parseAmount(form.playstation_income),
    }),
    [form.cash_income, form.terminal_income, form.card_income, form.playstation_income],
  );

  const total = calculateGameClubIncome(values);
  const netProfit = total + barSummary.profit;
  const editable = entry ? canEditEntryForRole(currentRole, entry.created_at, now) : true;
  const locked = Boolean(entry && !editable);
  const deadline = entry ? getEditDeadline(entry.created_at) : null;
  const remainingMs = deadline ? deadline.getTime() - now.getTime() : 0;
  const disabled = loading || saving || locked;

  async function handleSave(event: FormEvent) {
    event.preventDefault();

    if (locked) {
      setError(t('entryLocked'));
      return;
    }

    if (!selectedClubId) {
      setError(tc('error'));
      return;
    }

    if (form.date > businessToday) {
      setError(t('futureDateError'));
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const payload = {
      date: form.date,
      club_id: selectedClubId,
      cash_income: values.cashIncome,
      terminal_income: values.terminalIncome,
      card_income: values.cardIncome,
      playstation_income: values.playstationIncome,
      comment: form.comment.trim() ? form.comment.trim() : null,
      updated_at: new Date().toISOString(),
    };

    const result = entry
      ? await supabase.from('daily_cash_entries').update(payload).eq('id', entry.id).eq('club_id', selectedClubId)
      : await supabase.from('daily_cash_entries').insert({
          ...payload,
          created_by: session?.user?.id ?? null,
        });

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setMessage(entry ? t('entryUpdated') : t('entrySaved'));
    await fetchExisting(form.date);
  }

  async function handleDelete() {
    if (!entry || currentRole !== 'owner' || !selectedClubId) return;

    const supabase = createClient();
    setSaving(true);
    setError('');
    setMessage('');

    const { error: deleteError } = await supabase
      .from('daily_cash_entries')
      .delete()
      .eq('club_id', selectedClubId)
      .eq('id', entry.id);

    setSaving(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setEntry(null);
    setForm(emptyForm(form.date));
    setMessage(t('entryDeleted'));
  }

  function handleReset() {
    setMessage('');
    setError('');
    setForm(entry ? entryToForm(entry) : emptyForm(form.date));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-normal text-gray-950 sm:text-3xl">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {t('subtitle')}
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 sm:w-auto"
        >
          {t('reports')}
          <TrendingUp size={16} className="text-primary-600" />
        </Link>
      </div>

      <form
        onSubmit={handleSave}
        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-[300px]">
            <label className="mb-2 block text-sm font-semibold text-gray-700">{t('date')}</label>
            <DatePicker
              value={form.date}
              max={businessToday}
              onChange={(value) => setField('date', value)}
            />
          </div>

          {entry && deadline && editable && (
            <div className="flex items-center gap-3 rounded-full bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">
              <Clock3 size={17} />
              {currentRole === 'owner' ? (
                <span>{t('ownerAccessEdit')}</span>
              ) : (
                <>
                  <span>{t('editUntil', { time: formatDateTime(deadline, locale) })}</span>
                  <span className="rounded-full bg-green-100 px-2 py-1">{formatRemaining(remainingMs)}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2.5">
          <div className="flex gap-2.5">
            <Info size={18} className="mt-0.5 shrink-0 text-primary-600" />
            <div>
              <p className="text-sm font-semibold text-primary-900">
                {t('gameClubOnly')}
              </p>
              <p className="text-xs text-primary-800">
                {t('barSalesNote')}
              </p>
            </div>
          </div>
        </div>

        {locked && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {t('entryLocked')}
          </div>
        )}

        <div className="mt-5">
          <h2 className="text-base font-bold text-gray-950">{t('incomeByMethod')}</h2>
          <p className="mt-0.5 text-xs text-gray-600">
            {t('enterIncome')}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PaymentCard
            label={t('cash')}
            value={form.cash_income}
            disabled={disabled}
            onChange={(value) => setField('cash_income', value)}
            icon={Banknote}
            iconBgClassName="bg-green-100"
            iconClassName="text-green-600"
          />
          <PaymentCard
            label={t('terminal')}
            value={form.terminal_income}
            disabled={disabled}
            onChange={(value) => setField('terminal_income', value)}
            icon={MonitorSmartphone}
            iconBgClassName="bg-blue-100"
            iconClassName="text-blue-600"
          />
          <PaymentCard
            label={t('card')}
            value={form.card_income}
            disabled={disabled}
            onChange={(value) => setField('card_income', value)}
            icon={CreditCard}
            iconBgClassName="bg-purple-100"
            iconClassName="text-purple-600"
          />
          <PaymentCard
            label={t('playstation')}
            value={form.playstation_income}
            disabled={disabled}
            onChange={(value) => setField('playstation_income', value)}
            icon={Gamepad2}
            iconBgClassName="bg-amber-100"
            iconClassName="text-amber-600"
          />
        </div>

        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{t('totalGameClubIncome')}</p>
              <p className="mt-1 break-words text-2xl font-bold text-green-600">
                {formatCurrency(total)} UZS
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
              <TrendingUp size={19} className="text-green-600" />
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold text-gray-500">{t('barSales')}</p>
            <p className="mt-1 break-words text-lg font-bold text-gray-950">
              {formatCurrency(barSummary.sales)} <span className="text-sm font-semibold text-gray-500">UZS</span>
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold text-gray-500">{t('barProfit')}</p>
            <p className="mt-1 break-words text-lg font-bold text-green-600">
              {formatCurrency(barSummary.profit)} <span className="text-sm font-semibold text-gray-500">UZS</span>
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold text-gray-500">{t('netProfit')}</p>
            <p className="mt-1 break-words text-lg font-bold text-primary-600">
              {formatCurrency(netProfit)} <span className="text-sm font-semibold text-gray-500">UZS</span>
            </p>
          </div>
        </div>

        <div className="mt-6">
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            {t('commentOptional')}
          </label>
          <textarea
            className="h-24 w-full resize-none rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
            maxLength={300}
            placeholder={t('commentPlaceholder')}
            value={form.comment}
            disabled={disabled}
            onChange={(event) => setField('comment', event.target.value)}
          />
          <p className="mt-1 text-right text-xs text-gray-500">{form.comment.length}/300</p>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-danger-500">{error}</p>}
        {message && <p className="mt-4 text-sm font-semibold text-green-600">{message}</p>}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.2fr]">
          <button
            type="button"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 font-semibold text-primary-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading || saving}
            onClick={handleReset}
          >
            <RefreshCcw size={18} />
            {t('reset')}
          </button>
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
          >
            <Save size={18} />
            {saving ? tc('saving') : t('saveEntry')}
          </button>
        </div>
      </form>

      {entry && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-gray-950 sm:text-xl">{t('todayEntry')}</h2>
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                {t('savedBadge')}
              </span>
            </div>

            {editable && (
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-primary-200 bg-white px-4 text-sm font-semibold text-primary-600 transition hover:bg-primary-50"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                >
                  <Edit3 size={16} />
                  {tc('edit')}
                </button>
                {currentRole === 'owner' && (
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                    disabled={saving}
                    onClick={handleDelete}
                  >
                    <Trash2 size={16} />
                    {tc('delete')}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 divide-x divide-y divide-gray-100 rounded-lg border border-gray-200 lg:grid-cols-5 lg:divide-y-0">
            <div className="p-4">
              <p className="text-sm font-medium text-gray-500">{t('cash')}</p>
              <p className="mt-1 text-lg font-bold text-gray-950">
                {formatCurrency(entry.cash_income)} <span className="text-sm font-medium">UZS</span>
              </p>
            </div>
            <div className="p-4">
              <p className="text-sm font-medium text-gray-500">{t('terminal')}</p>
              <p className="mt-1 text-lg font-bold text-gray-950">
                {formatCurrency(entry.terminal_income)} <span className="text-sm font-medium">UZS</span>
              </p>
            </div>
            <div className="p-4">
              <p className="text-sm font-medium text-gray-500">{t('card')}</p>
              <p className="mt-1 text-lg font-bold text-gray-950">
                {formatCurrency(entry.card_income)} <span className="text-sm font-medium">UZS</span>
              </p>
            </div>
            <div className="p-4">
              <p className="text-sm font-medium text-gray-500">{t('playstation')}</p>
              <p className="mt-1 text-lg font-bold text-gray-950">
                {formatCurrency(entry.playstation_income ?? 0)} <span className="text-sm font-medium">UZS</span>
              </p>
            </div>
            <div className="p-4">
              <p className="text-sm font-medium text-gray-500">{t('total')}</p>
              <p className="mt-1 text-lg font-bold text-green-600">
                {formatCurrency(
                  calculateGameClubIncome({
                    cashIncome: entry.cash_income,
                    terminalIncome: entry.terminal_income,
                    cardIncome: entry.card_income,
                    playstationIncome: entry.playstation_income ?? 0,
                  }),
                )}{' '}
                UZS
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
            <span>{t('createdLabel')} {formatDateTime(entry.created_at, locale)}</span>
            <span>{t('byLabel')} {createdByName}</span>
            {deadline && editable && (
              <span>
                {currentRole === 'owner'
                  ? t('ownerEditable')
                  : t('editUntil', { time: formatDateTime(deadline.toISOString(), locale) })}
              </span>
            )}
          </div>

          <div
            className={`mt-4 rounded-lg border p-4 ${
              editable ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Clock3 size={20} className={editable ? 'text-amber-500' : 'text-gray-500'} />
              <div>
                <p className="font-bold text-gray-950">{t('editWindowTitle')}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {editable
                    ? currentRole === 'owner'
                      ? t('ownerEditNote')
                      : t('adminEditNote', { remaining: formatRemaining(remainingMs) })
                    : t('entryLocked')}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
