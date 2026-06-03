'use client';

import { useCallback, useEffect, useMemo, useState, type ElementType, type FormEvent } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Banknote,
  Calendar,
  Clock3,
  CreditCard,
  Edit3,
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
import { formatCurrency, todayIso } from '@/lib/utils';
import { formatDateTime } from '@/lib/formatters';
import type { DailyCashEntry, UserRole } from '@/types';

interface CashFormData {
  date: string;
  cash_income: string;
  terminal_income: string;
  card_income: string;
  comment: string;
}

const emptyForm = (date = todayIso()): CashFormData => ({
  date,
  cash_income: '',
  terminal_income: '',
  card_income: '',
  comment: '',
});

function parseAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function amountToInput(value: number | null | undefined): string {
  return value && value > 0 ? String(value) : '';
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
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBgClassName}`}>
          <Icon size={24} className={iconClassName} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          <p className="mt-2 text-2xl font-bold leading-tight text-gray-950">
            {formatCurrency(amount)}
          </p>
          <p className="text-xs font-medium text-gray-500">UZS</p>
        </div>
      </div>
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        className="mt-6 h-12 w-full rounded-lg border border-gray-200 bg-white px-4 text-base font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
        placeholder="0"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export default function DailyCashPage() {
  const t = useTranslations('dailyCash');
  const tc = useTranslations('common');
  const [form, setForm] = useState<CashFormData>(emptyForm());
  const [entry, setEntry] = useState<DailyCashEntry | null>(null);
  const [createdByName, setCreatedByName] = useState('Admin');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);

  const fetchExisting = useCallback(
    async (date: string) => {
      const supabase = createClient();
      setLoading(true);
      setMessage('');
      setError('');

      const { data, error: fetchError } = await supabase
        .from('daily_cash_entries')
        .select('*')
        .eq('date', date)
        .maybeSingle();

      if (fetchError) {
        setError(fetchError.message);
        setEntry(null);
        setForm(emptyForm(date));
        setLoading(false);
        return;
      }

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
    [],
  );

  useEffect(() => {
    fetchExisting(form.date).catch((fetchError) => {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      setLoading(false);
    });
  }, [form.date, fetchExisting]);

  useEffect(() => {
    async function fetchCurrentRole() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setCurrentRole(null);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      setCurrentRole((data?.role as UserRole | undefined) ?? null);
    }

    fetchCurrentRole().catch(() => setCurrentRole(null));
  }, []);

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
    }),
    [form.cash_income, form.terminal_income, form.card_income],
  );

  const total = calculateGameClubIncome(values);
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

    setSaving(true);
    setError('');
    setMessage('');

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const payload = {
      date: form.date,
      cash_income: values.cashIncome,
      terminal_income: values.terminalIncome,
      card_income: values.cardIncome,
      comment: form.comment.trim() ? form.comment.trim() : null,
      updated_at: new Date().toISOString(),
    };

    const result = entry
      ? await supabase.from('daily_cash_entries').update(payload).eq('id', entry.id)
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
    if (!entry || locked) return;

    const supabase = createClient();
    setSaving(true);
    setError('');
    setMessage('');

    const { error: deleteError } = await supabase
      .from('daily_cash_entries')
      .delete()
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-normal text-gray-950">{t('title')}</h1>
          <p className="mt-2 text-base text-gray-600">
            {t('subtitle')}
          </p>
        </div>
        <Link
          href="/reports"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50"
        >
          {t('reports')}
          <TrendingUp size={16} className="text-primary-600" />
        </Link>
      </div>

      <form
        onSubmit={handleSave}
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:w-56">
            <label className="mb-2 block text-sm font-semibold text-gray-700">{t('date')}</label>
            <div className="relative">
              <Calendar
                size={17}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="date"
                className="h-12 w-full rounded-lg border border-gray-200 bg-white pl-11 pr-4 font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={form.date}
                onChange={(event) => setField('date', event.target.value)}
              />
            </div>
          </div>

          {entry && deadline && editable && (
            <div className="flex items-center gap-3 rounded-full bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">
              <Clock3 size={17} />
              {currentRole === 'owner' ? (
                <span>{t('ownerAccessEdit')}</span>
              ) : (
                <>
                  <span>{t('editUntil', { time: formatDateTime(deadline) })}</span>
                  <span className="rounded-full bg-green-100 px-2 py-1">{formatRemaining(remainingMs)}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-primary-200 bg-primary-50 p-4">
          <div className="flex gap-3">
            <Info size={21} className="mt-0.5 shrink-0 text-primary-600" />
            <div>
              <p className="font-semibold text-primary-900">
                {t('gameClubOnly')}
              </p>
              <p className="mt-1 text-sm text-primary-800">
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

        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-950">{t('incomeByMethod')}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {t('enterIncome')}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
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
        </div>

        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-600">{t('totalGameClubIncome')}</p>
              <p className="mt-2 text-3xl font-bold text-green-600">
                {formatCurrency(total)} UZS
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-100">
              <TrendingUp size={22} className="text-green-600" />
            </div>
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
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-950">{t('todayEntry')}</h2>
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                {t('savedBadge')}
              </span>
            </div>

            {editable && (
              <div className="flex gap-3">
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-primary-200 bg-white px-4 text-sm font-semibold text-primary-600 transition hover:bg-primary-50"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                >
                  <Edit3 size={16} />
                  {tc('edit')}
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                  disabled={saving}
                  onClick={handleDelete}
                >
                  <Trash2 size={16} />
                  {tc('delete')}
                </button>
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 divide-y divide-gray-100 rounded-lg border border-gray-200 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
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
              <p className="text-sm font-medium text-gray-500">{t('total')}</p>
              <p className="mt-1 text-lg font-bold text-green-600">
                {formatCurrency(
                  calculateGameClubIncome({
                    cashIncome: entry.cash_income,
                    terminalIncome: entry.terminal_income,
                    cardIncome: entry.card_income,
                  }),
                )}{' '}
                UZS
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
            <span>{t('createdLabel')} {formatDateTime(entry.created_at)}</span>
            <span>{t('byLabel')} {createdByName}</span>
            {deadline && editable && (
              <span>
                {currentRole === 'owner'
                  ? t('ownerEditable')
                  : t('editUntil', { time: formatDateTime(deadline.toISOString()) })}
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
