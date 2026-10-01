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
  SegmentedControl,
  Select,
  Textarea,
} from '@/components/PresentationFoundation';
import { parseCurrencyInput } from '@/lib/formatters';
import { MANUAL_EXPENSE_CATEGORIES } from '@/lib/expenseCategories';
import { mutateFinanceRequest } from '@/lib/supabase/client';
import { todayIso } from '@/lib/utils';
import { defaultPaymentMethod } from '@/lib/paymentMethods';
import type { EntryPaymentMethod } from '@/types';

const PAYMENT_SOURCES = ['game_club', 'bar'] as const;
type PaymentSource = (typeof PAYMENT_SOURCES)[number];

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Blocks a second submit before the `saving` state re-renders the button.
  const submitPending = useRef(false);
  const [form, setForm] = useState({
    date: businessToday,
    amount: '',
    category: '',
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
      category: '',
        payment_method: defaultPaymentMethod(enabledPaymentMethods),
      payment_source: 'game_club',
      comment: '',
    });
  }, [businessToday, enabledPaymentMethods, selectedClubId]);

  function set<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function categoryLabel(category: string): string {
    return t(`categories.${category}`);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitPending.current) return;
    const amount = parseCurrencyInput(form.amount);
    const category = form.category;

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
        category: '',
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
          <Select id="expense-category" required value={form.category} onChange={(event) => set('category', event.target.value)}>
            <option value="" disabled>{t('selectCategory')}</option>
            {MANUAL_EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>{categoryLabel(category)}</option>
            ))}
          </Select>
        </Field>
      </div>

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
