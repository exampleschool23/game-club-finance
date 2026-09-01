'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Banknote, Building2, CreditCard, LoaderCircle, Save, WalletCards } from 'lucide-react';
import { useClub } from '@/components/layout/DashboardShell';
import { DatePicker } from '@/components/ui/CalendarPicker';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/formatters';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { createClient } from '@/lib/supabase/client';
import { todayIso } from '@/lib/utils';
import { defaultPaymentMethod } from '@/lib/paymentMethods';
import type { Expense } from '@/types';

const CATEGORIES = [
  'rent', 'salary', 'electricity', 'internet', 'repair',
  'cleaning', 'food_drinks', 'marketing', 'equipment', 'tax', 'other',
];
const CUSTOM_CATEGORY_VALUE = '__custom__';
const PAYMENT_SOURCES = ['game_club', 'bar'] as const;

function normalizeCustomCategory(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

interface ExpenseRegistrationFormProps {
  onSaved?: () => void | Promise<void>;
}

export default function ExpenseRegistrationForm({ onSaved }: ExpenseRegistrationFormProps) {
  const t = useTranslations('expenses');
  const tc = useTranslations('common');
  const { selectedClubId, businessDayStartHour, enabledPaymentMethods } = useClub();
  const businessToday = useMemo(
    () => todayIso(new Date(), businessDayStartHour),
    [businessDayStartHour],
  );
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const categoryLoadSequence = useRef(0);
  const [form, setForm] = useState({
    date: businessToday,
    amount: '',
    category: 'other',
    custom_category: '',
    payment_method: defaultPaymentMethod(enabledPaymentMethods),
    payment_source: 'game_club',
    comment: '',
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      date: businessToday,
      payment_method: enabledPaymentMethods.some((method) => method === current.payment_method)
        ? current.payment_method
        : defaultPaymentMethod(enabledPaymentMethods),
    }));
  }, [businessToday, enabledPaymentMethods, selectedClubId]);

  useEffect(() => {
    const requestId = ++categoryLoadSequence.current;

    if (!selectedClubId) {
      setCustomCategories([]);
      return;
    }

    const supabase = createClient();
    fetchAllRows<Pick<Expense, 'category'>>(() => supabase
      .from('expenses')
      .select('category')
      .eq('club_id', selectedClubId))
      .then((result) => {
        if (requestId !== categoryLoadSequence.current) return;
        if (result.error) {
          setError(result.error.message);
          return;
        }

        const knownCategories = new Set(CATEGORIES);
        setCustomCategories(Array.from(new Set(
          (result.data ?? [])
            .map((expense) => expense.category)
            .filter((category) => category && !knownCategories.has(category)),
        )).sort((a, b) => a.localeCompare(b)));
      })
      .catch((loadError) => {
        if (requestId === categoryLoadSequence.current) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });
  }, [selectedClubId]);

  function set(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function categoryLabel(category: string): string {
    return CATEGORIES.includes(category)
      ? t(`categories.${category}` as Parameters<typeof t>[0])
      : category;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const amount = parseCurrencyInput(form.amount);
    const category = form.category === CUSTOM_CATEGORY_VALUE
      ? normalizeCustomCategory(form.custom_category)
      : form.category;

    if (!selectedClubId) {
      setError(tc('error'));
      return;
    }
    if (!amount || amount <= 0) {
      setError(tc('invalidAmount'));
      return;
    }
    if (!category || !PAYMENT_SOURCES.includes(form.payment_source as (typeof PAYMENT_SOURCES)[number])) {
      setError(tc('required'));
      return;
    }

    setSaving(true);
    setError('');

    const response = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clubId: selectedClubId,
        date: form.date,
        amount,
        category,
        paymentMethod: form.payment_method,
        paymentSource: form.payment_source,
        comment: form.comment || null,
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      setError(result?.error ?? tc('error'));
      setSaving(false);
      return;
    }

    setForm({
      date: businessToday,
      amount: '',
      category: 'other',
      custom_category: '',
      payment_method: defaultPaymentMethod(enabledPaymentMethods),
      payment_source: 'game_club',
      comment: '',
    });
    setSaving(false);
    await onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700" role="alert">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className="label" htmlFor="expense-amount">{t('amount')}</label>
        <div className="relative">
          <input
            id="expense-amount"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            className="input-field h-14 pr-16 text-xl font-bold tabular-nums text-gray-950 placeholder:text-gray-300"
            value={form.amount}
            onChange={(event) => set('amount', formatCurrencyInput(event.target.value))}
            placeholder="0"
            required
          />
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-bold uppercase tracking-wide text-gray-400">
            {tc('currency')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">{t('date')}</label>
          <DatePicker value={form.date} onChange={(value) => set('date', value)} />
        </div>
        <div>
          <label className="label" htmlFor="expense-category">{t('category')}</label>
          <select id="expense-category" className="input-field h-11" value={form.category} onChange={(event) => set('category', event.target.value)}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>{categoryLabel(category)}</option>
            ))}
            {customCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
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
            onChange={(event) => set('custom_category', event.target.value)}
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
                className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${selected ? 'bg-white text-primary-700 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-800'}`}
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
        <div className={`grid gap-2 ${enabledPaymentMethods.length === 1 ? 'grid-cols-1' : enabledPaymentMethods.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {enabledPaymentMethods.map((method) => {
            const selected = form.payment_method === method;
            const MethodIcon = method === 'cash' ? Banknote : method === 'terminal' ? CreditCard : WalletCards;
            return (
              <button
                key={method}
                type="button"
                aria-pressed={selected}
                onClick={() => set('payment_method', method)}
                className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold transition sm:text-sm ${selected ? 'border-primary-600 bg-primary-50 text-primary-700 ring-1 ring-primary-600' : 'border-gray-200 bg-white text-gray-500 hover:border-primary-500 hover:text-gray-800'}`}
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
          className="input-field min-h-24 resize-y"
          value={form.comment}
          onChange={(event) => set('comment', event.target.value)}
          placeholder={t('commentPlaceholder')}
          maxLength={300}
        />
      </div>

      <button type="submit" className="btn-primary h-12 w-full text-base shadow-sm" disabled={saving}>
        {saving ? <LoaderCircle size={18} className="animate-spin" /> : <Save size={18} />}
        {saving ? tc('saving') : t('submit')}
      </button>
    </form>
  );
}
