'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormSection } from '@/components/ui/FormSection';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { todayIso } from '@/lib/utils';
import { formatCurrency, formatCurrencyInput, formatDate, formatDatePickerValue, parseCurrencyInput } from '@/lib/formatters';
import { Calendar, ChevronDown, MinusCircle } from 'lucide-react';
import type { Expense } from '@/types';

const CATEGORIES = [
  'rent', 'salary', 'electricity', 'internet', 'repair',
  'cleaning', 'food_drinks', 'marketing', 'equipment', 'tax', 'other',
];

export default function ExpensesPage() {
  const t = useTranslations('expenses');
  const tc = useTranslations('common');
  const { locale } = useAppLocale();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    date: todayIso(),
    amount: '',
    category: 'other',
    payment_method: 'cash',
    comment: '',
  });

  async function loadExpenses() {
    const supabase = createClient();
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    setExpenses(data ?? []);
  }

  useEffect(() => {
    loadExpenses().catch(() => {});
  }, []);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseCurrencyInput(form.amount);
    if (!amount || amount <= 0) {
      setError(tc('invalidAmount'));
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const { error: err } = await supabase.from('expenses').insert({
      date: form.date,
      amount,
      category: form.category,
      payment_method: form.payment_method,
      comment: form.comment || null,
      created_by: session?.user?.id ?? null,
    });

    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess(t('success'));
      setForm({ date: todayIso(), amount: '', category: 'other', payment_method: 'cash', comment: '' });
      await loadExpenses();
    }
  }

  const paymentMethods = ['cash', 'terminal', 'qr', 'transfer'];

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
                      {t(`categories.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{t('paymentMethod')}</label>
                <select
                  className="input-field"
                  value={form.payment_method}
                  onChange={(e) => set('payment_method', e.target.value)}
                >
                  {paymentMethods.map((m) => (
                    <option key={m} value={m}>
                      {tc(`paymentMethods.${m}`)}
                    </option>
                  ))}
                </select>
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
                { key: 'date', header: t('date'), render: (r) => formatDate(r.date, locale) },
                {
                  key: 'amount',
                  header: t('amount'),
                  render: (r) => (
                    <span className="font-semibold text-danger-500">
                      {formatCurrency(r.amount)}
                    </span>
                  ),
                },
                {
                  key: 'category',
                  header: t('category'),
                  render: (r) => t(`categories.${r.category}` as Parameters<typeof t>[0]),
                },
                { key: 'payment_method', header: t('paymentMethod') },
                { key: 'comment', header: tc('noData'), render: (r) => r.comment ?? '-' },
              ]}
            />
          )}
        </div>
      </div>
    </div>
  );
}
