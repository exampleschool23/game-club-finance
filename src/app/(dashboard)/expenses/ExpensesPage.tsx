'use client';

// Route: /expenses

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { DatePicker } from '@/components/ui/CalendarPicker';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { todayIso } from '@/lib/utils';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { formatCurrency, formatCurrencyInput, formatDate, formatDatePickerValue, formatTime, parseCurrencyInput } from '@/lib/formatters';
import {
  AlertCircle,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  MinusCircle,
  ReceiptText,
  Save,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { PAYMENT_METHODS, type Expense } from '@/types';

const CATEGORIES = [
  'rent', 'salary', 'electricity', 'internet', 'repair',
  'cleaning', 'food_drinks', 'marketing', 'equipment', 'tax', 'other',
];
const CUSTOM_CATEGORY_VALUE = '__custom__';
const PAYMENT_SOURCES = ['game_club', 'bar'] as const;

function normalizeCustomCategory(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export default function ExpensesPage() {
  const t = useTranslations('expenses');
  const tc = useTranslations('common');
  const { selectedClubId, role: currentRole, businessDayStartHour } = useClub();
  const { locale } = useAppLocale();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [todaySummary, setTodaySummary] = useState({ count: 0, total: 0 });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    date: businessToday,
    amount: '',
    category: 'other',
    custom_category: '',
    payment_method: 'cash',
    payment_source: 'game_club',
    comment: '',
  });
  const isOwner = currentRole === 'owner';

  useEffect(() => {
    setForm((prev) => ({ ...prev, date: businessToday }));
  }, [businessToday, selectedClubId]);

  const customCategories = useMemo(() => {
    const known = new Set(CATEGORIES);
    return Array.from(
      new Set(
        expenses
          .map((expense) => expense.category)
          .filter((category) => category && !known.has(category)),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [expenses]);

  function categoryLabel(category: string): string {
    if (CATEGORIES.includes(category)) {
      return t(`categories.${category}` as Parameters<typeof t>[0]);
    }
    return category;
  }

  const loadExpenses = useCallback(async () => {
    if (!selectedClubId) {
      setExpenses([]);
      setTodaySummary({ count: 0, total: 0 });
      return;
    }

    const supabase = createClient();
    const [recentResult, todayResult] = await Promise.all([
      supabase
        .from('expenses')
        .select('*')
        .eq('club_id', selectedClubId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50),
      fetchAllRows<Pick<Expense, 'amount'>>(() =>
        supabase
          .from('expenses')
          .select('amount')
          .eq('club_id', selectedClubId)
          .eq('date', businessToday),
      ),
    ]);
    const loadError = recentResult.error ?? todayResult.error;
    if (loadError) {
      setExpenses([]);
      setTodaySummary({ count: 0, total: 0 });
      setError(loadError.message);
      return;
    }
    setError('');
    setExpenses(recentResult.data ?? []);
    setTodaySummary({
      count: todayResult.data?.length ?? 0,
      total: (todayResult.data ?? []).reduce((total, expense) => total + Number(expense.amount), 0),
    });
  }, [businessToday, selectedClubId]);

  useEffect(() => {
    loadExpenses().catch((loadError) => {
      setExpenses([]);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
  }, [loadExpenses]);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseCurrencyInput(form.amount);
    if (!selectedClubId) {
      setError(tc('error'));
      return;
    }
    if (!amount || amount <= 0) {
      setError(tc('invalidAmount'));
      return;
    }
    const category = form.category === CUSTOM_CATEGORY_VALUE
      ? normalizeCustomCategory(form.custom_category)
      : form.category;
    if (!category) {
      setError(tc('required'));
      return;
    }
    if (!PAYMENT_SOURCES.includes(form.payment_source as (typeof PAYMENT_SOURCES)[number])) {
      setError(tc('required'));
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const { error: err } = await supabase.from('expenses').insert({
      club_id: selectedClubId,
      date: form.date,
      amount,
      category,
      payment_method: form.payment_method,
      payment_source: form.payment_source,
      comment: form.comment || null,
      created_by: session?.user?.id ?? null,
    });

    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess(t('success'));
      setForm({ date: businessToday, amount: '', category: 'other', custom_category: '', payment_method: 'cash', payment_source: 'game_club', comment: '' });
      await loadExpenses();
    }
  }

  async function handleDelete(expense: Expense) {
    if (!selectedClubId || !isOwner) return;
    if (!window.confirm(t('deleteConfirm'))) return;

    setDeletingId(expense.id);
    setError('');
    setSuccess('');

    const supabase = createClient();
    const { error: err } = await supabase
      .from('expenses')
      .delete()
      .eq('club_id', selectedClubId)
      .eq('id', expense.id);

    setDeletingId(null);
    if (err) {
      setError(err.message);
      return;
    }

    setSuccess(t('deleteSuccess'));
    await loadExpenses();
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('title')} description={t('description')} />

      {(error || success) && (
        <div
          className={`mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
            error
              ? 'border-red-200 bg-danger-50 text-red-700'
              : 'border-green-200 bg-success-50 text-green-700'
          }`}
          role="status"
        >
          {error ? <AlertCircle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
          <span>{error || success}</span>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.5fr)]">
        <form
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-6"
        >
          <div className="flex items-center gap-3 border-b border-gray-100 bg-gradient-to-r from-danger-50 to-white px-5 py-4 sm:px-6">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-danger-600">
              <ReceiptText size={20} />
            </span>
            <div>
              <h2 className="font-bold text-gray-950">{t('addExpense')}</h2>
              <p className="mt-0.5 text-xs text-gray-500">{t('quickEntryHelp')}</p>
            </div>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            <div>
              <label className="label" htmlFor="expense-amount">{t('amount')}</label>
              <div className="relative">
                <input
                  id="expense-amount"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="input-field h-14 pr-16 text-xl font-bold tabular-nums text-gray-950 placeholder:text-gray-300"
                  value={form.amount}
                  onChange={(e) => set('amount', formatCurrencyInput(e.target.value))}
                  placeholder="0"
                  required
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-bold uppercase tracking-wide text-gray-400">
                  {tc('currency')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div>
                <label className="label">{t('date')}</label>
                <DatePicker value={form.date} onChange={(value) => set('date', value)} />
              </div>
              <div>
                <label className="label" htmlFor="expense-category">{t('category')}</label>
                <select
                  id="expense-category"
                  className="input-field h-11"
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                  {customCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                  <option value={CUSTOM_CATEGORY_VALUE}>{t('addCategory')}</option>
                </select>
              </div>
            </div>

            {form.category === CUSTOM_CATEGORY_VALUE && (
              <div>
                <label className="label" htmlFor="expense-custom-category">{t('customCategoryPlaceholder')}</label>
                <input
                  id="expense-custom-category"
                  type="text"
                  className="input-field h-11"
                  value={form.custom_category}
                  onChange={(e) => set('custom_category', e.target.value)}
                  placeholder={t('customCategoryPlaceholder')}
                  maxLength={80}
                  required
                />
              </div>
            )}
            <fieldset>
              <legend className="label">{t('paymentSource')}</legend>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1.5">
                {PAYMENT_SOURCES.map((source) => {
                  const selected = form.payment_source === source;
                  const SourceIcon = source === 'game_club' ? Building2 : WalletCards;
                  return (
                    <button
                      key={source}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => set('payment_source', source)}
                      className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        selected
                          ? 'bg-white text-primary-700 shadow-sm ring-1 ring-gray-200'
                          : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      <SourceIcon size={16} />
                      <span className="truncate">{t(`paymentSources.${source}` as Parameters<typeof t>[0])}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-gray-500">{t('paymentSourceHelp')}</p>
            </fieldset>

            <fieldset>
              <legend className="label">{t('paymentMethod')}</legend>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((method) => {
                  const selected = form.payment_method === method;
                  const MethodIcon = method === 'cash' ? Banknote : method === 'terminal' ? CreditCard : WalletCards;
                  return (
                    <button
                      key={method}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => set('payment_method', method)}
                      className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition sm:flex-row lg:flex-col xl:flex-row ${
                        selected
                          ? 'border-primary-600 bg-primary-50 text-primary-700 ring-1 ring-primary-600'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-primary-500 hover:text-gray-800'
                      }`}
                    >
                      <MethodIcon size={16} />
                      <span className="truncate">{tc(`paymentMethods.${method}`)}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label className="label" htmlFor="expense-comment">{t('comment')}</label>
              <textarea
                id="expense-comment"
                className="input-field min-h-20 resize-y"
                value={form.comment}
                onChange={(e) => set('comment', e.target.value)}
                placeholder={t('commentPlaceholder')}
                maxLength={300}
              />
            </div>

            <button type="submit" className="btn-primary h-12 w-full text-base shadow-sm" disabled={saving}>
              {saving ? <LoaderCircle size={18} className="animate-spin" /> : <Save size={18} />}
              {saving ? tc('saving') : t('submit')}
            </button>
          </div>
        </form>

        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-red-100 bg-gradient-to-br from-danger-50 to-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-danger-600">
                <ReceiptText size={15} />
                {t('todaySpend')}
              </div>
              <p className="mt-2 break-words text-xl font-black tabular-nums text-gray-950 sm:text-2xl">
                {formatCurrency(todaySummary.total)}
              </p>
              <p className="mt-1 text-xs text-gray-500">{tc('currency')}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                <Calendar size={15} />
                {t('todayEntries')}
              </div>
              <p className="mt-2 text-xl font-black tabular-nums text-gray-950 sm:text-2xl">{todaySummary.count}</p>
              <p className="mt-1 text-xs text-gray-500">{formatDatePickerValue(businessToday, locale)}</p>
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-4 py-4 sm:px-5">
              <div>
                <h2 className="font-bold text-gray-950">{t('recentExpenses')}</h2>
                <p className="mt-0.5 text-xs text-gray-500">{t('latestCount', { count: expenses.length })}</p>
              </div>
              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-gray-100 px-2.5 text-xs font-bold text-gray-600">
                {expenses.length}
              </span>
            </div>

            {expenses.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={MinusCircle} title={tc('noData')} />
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/80">
                        <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('category')}</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('date')}</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('paymentMethod')}</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-gray-500">{t('amount')}</th>
                        {isOwner && <th className="w-14 px-3 py-3"><span className="sr-only">{tc('actions')}</span></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {expenses.map((expense) => (
                        <tr key={expense.id} className="group transition-colors hover:bg-gray-50/80">
                          <td className="max-w-[220px] px-5 py-4 align-top">
                            <p className="truncate font-bold text-gray-900">{categoryLabel(expense.category)}</p>
                            <p className="mt-1 truncate text-xs text-gray-500">{expense.comment || t('noComment')}</p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 align-top">
                            <p className="font-medium text-gray-700">{formatDate(expense.date, locale)}</p>
                            <p className="mt-1 text-xs text-gray-400">{formatTime(expense.created_at, locale)}</p>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <p className="font-medium text-gray-700">{tc(`paymentMethods.${expense.payment_method}` as Parameters<typeof tc>[0])}</p>
                            <span className="mt-1.5 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                              {t(`paymentSources.${expense.payment_source ?? 'game_club'}` as Parameters<typeof t>[0])}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-right align-top font-black tabular-nums text-danger-600">
                            − {formatCurrency(expense.amount)}
                          </td>
                          {isOwner && (
                            <td className="px-3 py-3 text-right align-middle">
                              <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={tc('delete')}
                                title={tc('delete')}
                                disabled={deletingId === expense.id}
                                onClick={() => handleDelete(expense)}
                              >
                                {deletingId === expense.id ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-gray-100 md:hidden">
                  {expenses.map((expense) => (
                    <article key={expense.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-gray-900">{categoryLabel(expense.category)}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {formatDate(expense.date, locale)} · {formatTime(expense.created_at, locale)}
                          </p>
                        </div>
                        <p className="shrink-0 whitespace-nowrap font-black tabular-nums text-danger-600">
                          − {formatCurrency(expense.amount)}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                          {tc(`paymentMethods.${expense.payment_method}` as Parameters<typeof tc>[0])}
                        </span>
                        <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700">
                          {t(`paymentSources.${expense.payment_source ?? 'game_club'}` as Parameters<typeof t>[0])}
                        </span>
                      </div>
                      {(expense.comment || isOwner) && (
                        <div className="mt-3 flex items-end justify-between gap-3 border-t border-gray-100 pt-3">
                          <p className="min-w-0 break-words text-xs leading-5 text-gray-500">{expense.comment || t('noComment')}</p>
                          {isOwner && (
                            <button
                              type="button"
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-danger-50 hover:text-danger-600 disabled:opacity-50"
                              aria-label={tc('delete')}
                              title={tc('delete')}
                              disabled={deletingId === expense.id}
                              onClick={() => handleDelete(expense)}
                            >
                              {deletingId === expense.id ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
