'use client';

// Route: /expenses

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormSection } from '@/components/ui/FormSection';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { todayIso } from '@/lib/utils';
import { formatCurrency, formatCurrencyInput, formatDate, formatDatePickerValue, formatTime, parseCurrencyInput } from '@/lib/formatters';
import { Calendar, ChevronDown, MinusCircle, Trash2 } from 'lucide-react';
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
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('club_id', selectedClubId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    setExpenses(data ?? []);
  }, [selectedClubId]);

  useEffect(() => {
    loadExpenses().catch(() => {});
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
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={t('title')} description={t('description')} />
      <div className="space-y-6">
        <form onSubmit={handleSubmit}>
          <FormSection title={t('addExpense')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('date')}</label>
                <label className="relative block h-10 w-full cursor-pointer">
                  <input
                    type="date"
                    className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                    value={form.date}
                    onClick={(event) => event.currentTarget.showPicker?.()}
                    onChange={(e) => set('date', e.target.value)}
                  />
                  <span className="pointer-events-none flex h-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 text-sm shadow-sm transition peer-focus:border-primary-500 peer-focus:ring-2 peer-focus:ring-primary-100">
                    <Calendar size={16} className="shrink-0 text-gray-500" />
                    <span className="font-semibold text-gray-950">{formatDatePickerValue(form.date, locale)}</span>
                    <ChevronDown size={16} className="ml-auto shrink-0 text-gray-400" />
                  </span>
                </label>
              </div>
              <div>
                <label className="label">{t('amount')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="input-field"
                  value={form.amount}
                  onChange={(e) => set('amount', formatCurrencyInput(e.target.value))}
                  required
                />
              </div>
              <div>
                <label className="label">{t('category')}</label>
                <select
                  className="input-field"
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
                {form.category === CUSTOM_CATEGORY_VALUE && (
                  <input
                    type="text"
                    className="input-field mt-2"
                    value={form.custom_category}
                    onChange={(e) => set('custom_category', e.target.value)}
                    placeholder={t('customCategoryPlaceholder')}
                    maxLength={80}
                    required
                  />
                )}
              </div>
              <div>
                <label className="label">{t('paymentMethod')}</label>
                <select
                  className="input-field"
                  value={form.payment_method}
                  onChange={(e) => set('payment_method', e.target.value)}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {tc(`paymentMethods.${m}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{t('paymentSource')}</label>
                <select
                  className="input-field"
                  value={form.payment_source}
                  onChange={(e) => set('payment_source', e.target.value)}
                  required
                >
                  {PAYMENT_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {t(`paymentSources.${source}` as Parameters<typeof t>[0])}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs leading-5 text-gray-500">{t('paymentSourceHelp')}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="label">{t('comment')}</label>
                <input
                  type="text"
                  className="input-field"
                  value={form.comment}
                  onChange={(e) => set('comment', e.target.value)}
                />
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-danger-500">{error}</p>}
            {success && <p className="mt-3 text-sm text-success-600">{success}</p>}
            <button type="submit" className="btn-primary mt-4" disabled={saving}>
              {saving ? tc('saving') : t('submit')}
            </button>
          </FormSection>
        </form>

        <div>
          <h2 className="text-base font-semibold text-gray-700 mb-3">{t('recentExpenses')}</h2>
          {expenses.length === 0 ? (
            <EmptyState icon={MinusCircle} title={tc('noData')} />
          ) : (
            <DataTable
              keyExtractor={(r) => r.id}
              data={expenses}
              columns={[
                {
                  key: 'date',
                  header: t('date'),
                  render: (r) => (
                    <div>
                      <div className="font-medium text-gray-800">{formatDate(r.date, locale)}</div>
                      <div className="mt-1 text-xs font-semibold text-gray-500">{formatTime(r.created_at, locale)}</div>
                    </div>
                  ),
                  className: 'w-32 align-top',
                },
                {
                  key: 'amount',
                  header: t('amount'),
                  render: (r) => (
                    <span className="whitespace-nowrap font-semibold text-danger-500">
                      {formatCurrency(r.amount)}
                    </span>
                  ),
                  className: 'w-32 whitespace-nowrap align-top',
                },
                {
                  key: 'category',
                  header: t('category'),
                  render: (r) => categoryLabel(r.category),
                  className: 'align-top',
                },
                {
                  key: 'payment_method',
                  header: t('paymentMethod'),
                  render: (r) => tc(`paymentMethods.${r.payment_method}` as Parameters<typeof tc>[0]),
                  className: 'align-top',
                },
                {
                  key: 'payment_source',
                  header: t('paymentSource'),
                  render: (r) => t(`paymentSources.${r.payment_source ?? 'game_club'}` as Parameters<typeof t>[0]),
                  className: 'align-top',
                },
                { key: 'comment', header: tc('noData'), render: (r) => r.comment ?? '-', className: 'align-top' },
                ...(isOwner
                  ? [
                      {
                        key: 'actions',
                        header: tc('actions'),
                        render: (r: Expense) => (
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-danger-500 transition hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={tc('delete')}
                            title={tc('delete')}
                            disabled={deletingId === r.id}
                            onClick={() => handleDelete(r)}
                          >
                            <Trash2 size={16} />
                          </button>
                        ),
                        className: 'w-16',
                      },
                    ]
                  : []),
              ]}
            />
          )}
        </div>
      </div>
    </div>
  );
}
