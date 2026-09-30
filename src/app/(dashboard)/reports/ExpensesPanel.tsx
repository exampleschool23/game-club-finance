'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote, Building2, CreditCard, Save, WalletCards } from 'lucide-react';
import { useClub } from '@/components/layout/DashboardShell';
import {
  Button,
  CurrencyInput,
  DatePicker,
  Field,
  InlineAlert,
  Input,
  SegmentedControl,
  Select,
  Textarea,
} from '@/components/PresentationFoundation';
import { parseCurrencyInput } from '@/lib/formatters';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { createClient, mutateFinanceRequest } from '@/lib/supabase/client';
import { todayIso } from '@/lib/utils';
import { defaultPaymentMethod } from '@/lib/paymentMethods';
import type { EntryPaymentMethod, Expense } from '@/types';

export const EXPENSE_CATEGORIES = [
  'rent', 'salary', 'electricity', 'internet', 'repair',
  'cleaning', 'food_drinks', 'marketing', 'equipment', 'tax', 'other',
] as const;
export type KnownExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function isKnownExpenseCategory(category: string): category is KnownExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(category);
}

const CUSTOM_CATEGORY_VALUE = '__custom__';
const PAYMENT_SOURCES = ['game_club', 'bar'] as const;
type PaymentSource = (typeof PAYMENT_SOURCES)[number];

function normalizeCustomCategory(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

interface ExpenseRegistrationFormProps {
  /** Custom categories already known by the parent; avoids an extra read. */
  knownCustomCategories?: string[];
  onSaved?: () => void | Promise<void>;
}

export default function ExpenseRegistrationForm({ knownCustomCategories, onSaved }: ExpenseRegistrationFormProps) {
  const t = useTranslations('expenses');
  const tc = useTranslations('common');
  const { selectedClubId, businessDayStartHour, enabledPaymentMethods } = useClub();
  const businessToday = useMemo(
    () => todayIso(new Date(), businessDayStartHour),
    [businessDayStartHour],
  );
  const [customCategories, setCustomCategories] = useState<string[]>(knownCustomCategories ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const categoryLoadSequence = useRef(0);
  const customCategoryRef = useRef<HTMLInputElement>(null);
  // Blocks a second submit before the `saving` state re-renders the button.
  const submitPending = useRef(false);
  const [form, setForm] = useState({
    date: businessToday,
    amount: '',
    category: 'other',
    custom_category: '',
    payment_method: defaultPaymentMethod(enabledPaymentMethods),
    payment_source: 'game_club' as PaymentSource,
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
  }, [businessToday, enabledPaymentMethods]);

  // A half-filled form belongs to the club it was started for: clear it when
  // the user switches clubs so it cannot be saved into the new club.
  const previousClubId = useRef(selectedClubId);
  useEffect(() => {
    if (previousClubId.current === selectedClubId) return;
    previousClubId.current = selectedClubId;
    setError('');
    setForm({
      date: businessToday,
      amount: '',
      category: 'other',
      custom_category: '',
      payment_method: defaultPaymentMethod(enabledPaymentMethods),
      payment_source: 'game_club',
      comment: '',
    });
  }, [businessToday, enabledPaymentMethods, selectedClubId]);

  useEffect(() => {
    // The parent already knows the custom categories in the visible range;
    // only read the full ledger when nothing was passed in.
    if (knownCustomCategories) {
      setCustomCategories(knownCustomCategories);
      return;
    }
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
        if (result.error) return;
        setCustomCategories(Array.from(new Set(
          (result.data ?? [])
            .map((expense) => expense.category)
            .filter((category) => category && !isKnownExpenseCategory(category)),
        )).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});
    return () => { categoryLoadSequence.current += 1; };
  }, [knownCustomCategories, selectedClubId]);

  useEffect(() => {
    if (form.category === CUSTOM_CATEGORY_VALUE) customCategoryRef.current?.focus();
  }, [form.category]);

  function set<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function categoryLabel(category: string): string {
    return isKnownExpenseCategory(category) ? t(`categories.${category}`) : category;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitPending.current) return;
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
    if (!category) {
      setError(tc('required'));
      return;
    }
    if (!enabledPaymentMethods.includes(form.payment_method)) {
      setError(t('paymentMethodUnavailable'));
      return;
    }
    if (form.date > businessToday) {
      setError(t('futureDateError'));
      return;
    }

    submitPending.current = true;
    setSaving(true);
    setError('');

    let saved = false;
    try {
      const response = await mutateFinanceRequest('/api/expenses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clubId: selectedClubId,
          date: form.date,
          amount,
          category,
          paymentMethod: form.payment_method,
          paymentSource: form.payment_source,
          comment: form.comment.trim() || null,
        }),
      });

      if (!response.ok) {
        // The API returns raw database text; show a translated message instead.
        setError(response.status === 401 || response.status === 403
          ? tc('accessDeniedDescription')
          : t('saveError'));
        return;
      }

      saved = true;
      setForm({
        date: businessToday,
        amount: '',
        category: 'other',
        custom_category: '',
        payment_method: defaultPaymentMethod(enabledPaymentMethods),
        payment_source: 'game_club',
        comment: '',
      });
    } catch {
      setError(t('saveError'));
    } finally {
      submitPending.current = false;
      setSaving(false);
    }
    if (saved) await onSaved?.();
  }

  const methodIcon = (method: EntryPaymentMethod) =>
    method === 'cash' ? <Banknote size={16} aria-hidden="true" /> : method === 'terminal' ? <CreditCard size={16} aria-hidden="true" /> : <WalletCards size={16} aria-hidden="true" />;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <InlineAlert variant="danger">{error}</InlineAlert>}
      {enabledPaymentMethods.length === 0 && <InlineAlert variant="warning">{t('paymentMethodUnavailable')}</InlineAlert>}

      <Field label={t('amount')} htmlFor="expense-amount" required>
        <CurrencyInput
          id="expense-amount"
          controlSize="lg"
          autoFocus
          required
          value={form.amount}
          onValueChange={(value) => set('amount', value)}
          trailingAddon={tc('currency')}
          className="text-gray-950 placeholder:text-gray-300"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('date')}>
          <DatePicker ariaLabel={t('date')} value={form.date} max={businessToday} onChange={(value) => set('date', value)} />
        </Field>
        <Field label={t('category')} htmlFor="expense-category">
          <Select id="expense-category" value={form.category} onChange={(event) => set('category', event.target.value)}>
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>{categoryLabel(category)}</option>
            ))}
            {customCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
            <option value={CUSTOM_CATEGORY_VALUE}>{t('addCategory')}</option>
          </Select>
        </Field>
      </div>

      {form.category === CUSTOM_CATEGORY_VALUE && (
        <Field label={t('customCategoryPlaceholder')} htmlFor="expense-custom-category" required>
          <Input
            ref={customCategoryRef}
            id="expense-custom-category"
            type="text"
            value={form.custom_category}
            onChange={(event) => set('custom_category', event.target.value)}
            maxLength={80}
            required
          />
        </Field>
      )}

      <Field label={t('paymentSource')} hint={t('paymentSourceHelp')}>
        <SegmentedControl
          variant="soft"
          label={t('paymentSource')}
          value={form.payment_source}
          onChange={(source) => set('payment_source', source)}
          options={PAYMENT_SOURCES.map((source) => ({
            value: source,
            label: t(`paymentSources.${source}`),
            icon: source === 'game_club' ? <Building2 size={16} aria-hidden="true" /> : <WalletCards size={16} aria-hidden="true" />,
          }))}
        />
      </Field>

      <Field label={t('paymentMethod')}>
        <SegmentedControl
          label={t('paymentMethod')}
          value={form.payment_method}
          onChange={(method) => set('payment_method', method)}
          options={enabledPaymentMethods.map((method) => ({
            value: method,
            label: tc(`paymentMethods.${method}`),
            icon: methodIcon(method),
          }))}
        />
      </Field>

      <Field label={t('comment')} htmlFor="expense-comment">
        <Textarea
          id="expense-comment"
          value={form.comment}
          onChange={(event) => set('comment', event.target.value)}
          placeholder={t('commentPlaceholder')}
          maxLength={300}
          showCount
        />
      </Field>

      <Button type="submit" size="lg" fullWidth disabled={enabledPaymentMethods.length === 0} loading={saving} loadingLabel={tc('saving')} icon={<Save size={18} aria-hidden="true" />}>
        {t('submit')}
      </Button>
    </form>
  );
}
