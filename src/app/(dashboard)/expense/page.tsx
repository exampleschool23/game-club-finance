'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { todayIso } from '@/lib/utils';
import { Toast, useToast } from '@/components/ui/Toast';
import type { PaymentSource, ExpenseCategory } from '@/types';

const PAYMENT_SOURCES: PaymentSource[] = ['cash', 'terminal', 'bank'];
const CATEGORIES: ExpenseCategory[] = [
  'rent', 'salary', 'electricity', 'internet', 'repair',
  'cleaning', 'food_drinks', 'marketing', 'equipment', 'tax', 'other',
];

export default function ExpensePage() {
  const t = useTranslations('expense');
  const tc = useTranslations('common');
  const { toast, showToast, hideToast } = useToast();

  const [form, setForm] = useState({
    amount: '',
    category: 'other' as ExpenseCategory,
    payment_source: 'cash' as PaymentSource,
    comment: '',
    transaction_date: todayIso(),
  });
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      showToast(tc('invalidAmount'), 'error');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('expense_transactions').insert({
      amount,
      category: form.category,
      payment_source: form.payment_source,
      comment: form.comment || null,
      transaction_date: form.transaction_date,
      created_by: user!.id,
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
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('title')}</h1>

      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Amount */}
        <div>
          <label className="label">{t('amount')} *</label>
          <input
            type="number"
            name="amount"
            value={form.amount}
            onChange={handleChange}
            className="input-field text-lg font-semibold"
            placeholder="0"
            min="1"
            required
          />
        </div>

        {/* Payment Source */}
        <div>
          <label className="label">{t('paymentSource')}</label>
          <div className="grid grid-cols-3 gap-2">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
