'use client';

// Route: /expense

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { todayIso } from '@/lib/utils';
import { Toast, useToast } from '@/components/ui/Toast';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/formatters';
import type { PaymentSource, ExpenseCategory } from '@/types';

const PAYMENT_SOURCES: PaymentSource[] = ['cash', 'terminal', 'bank'];
const CATEGORIES: ExpenseCategory[] = [
  'rent', 'salary', 'electricity', 'internet', 'repair',
  'cleaning', 'food_drinks', 'marketing', 'equipment', 'tax', 'other',
];

export default function ExpensePage() {
  const t = useTranslations('expense');
  const tc = useTranslations('common');
  const { selectedClubId, businessDayStartHour } = useClub();
  const { toast, showToast, hideToast } = useToast();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);

  const [form, setForm] = useState({
    amount: '',
    category: 'other' as ExpenseCategory,
    payment_source: 'cash' as PaymentSource,
    comment: '',
    transaction_date: businessToday,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm((prev) => ({ ...prev, transaction_date: businessToday }));
  }, [businessToday, selectedClubId]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const value = e.target.name === 'amount' ? formatCurrencyInput(e.target.value) : e.target.value;
    setForm((prev) => ({ ...prev, [e.target.name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseCurrencyInput(form.amount);
    if (!selectedClubId) {
      showToast(tc('error'), 'error');
      return;
    }
    if (!amount || amount <= 0) {
      showToast(tc('invalidAmount'), 'error');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const { error } = await supabase.from('expense_transactions').insert({
      club_id: selectedClubId,
      amount,
      category: form.category,
      payment_source: form.payment_source,
      comment: form.comment || null,
      transaction_date: form.transaction_date,
      created_by: session!.user.id,
    });

    setLoading(false);
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast(t('success'), 'success');
      setForm((prev) => ({ ...prev, amount: '', comment: '' }));
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('title')}</h1>

      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Amount */}
        <div>
          <label className="label">{t('amount')} *</label>
          <input
            type="text"
            inputMode="numeric"
            name="amount"
            value={form.amount}
            onChange={handleChange}
            className="input-field text-lg font-semibold"
            placeholder="0"
            required
          />
        </div>

        {/* Payment Source */}
        <div>
          <label className="label">{t('paymentSource')}</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PAYMENT_SOURCES.map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => setForm((p) => ({ ...p, payment_source: src }))}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                  form.payment_source === src
                    ? 'bg-danger-500 text-white border-danger-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-danger-400'
                }`}
              >
                {t(`sources.${src}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="label">{t('category')}</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setForm((p) => ({ ...p, category: cat }))}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all text-left ${
                  form.category === cat
                    ? 'bg-warning-500 text-white border-warning-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-warning-400'
                }`}
              >
                {t(`categories.${cat}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="label">{t('date')}</label>
          <input
            type="date"
            name="transaction_date"
            value={form.transaction_date}
            onChange={handleChange}
            className="input-field"
          />
        </div>

        {/* Comment */}
        <div>
          <label className="label">{t('comment')}</label>
          <textarea
            name="comment"
            value={form.comment}
            onChange={handleChange}
            className="input-field resize-none"
            rows={2}
            placeholder="..."
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
          {loading ? tc('loading') : t('submit')}
        </button>
      </form>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
