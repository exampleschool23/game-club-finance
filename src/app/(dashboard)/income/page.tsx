'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { todayIso } from '@/lib/utils';
import { Toast, useToast } from '@/components/ui/Toast';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/formatters';
import type { PaymentMethod, IncomeCategory } from '@/types';

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'terminal', 'qr', 'transfer', 'debt'];
const CATEGORIES: IncomeCategory[] = ['game_time', 'food', 'drinks', 'other'];

export default function IncomePage() {
  const t = useTranslations('income');
  const tc = useTranslations('common');
  const { selectedClubId } = useClub();
  const { toast, showToast, hideToast } = useToast();

  const [form, setForm] = useState({
    amount: '',
    payment_method: 'cash' as PaymentMethod,
    category: 'game_time' as IncomeCategory,
    comment: '',
    transaction_date: todayIso(),
  });
  const [loading, setLoading] = useState(false);

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

    const { error } = await supabase.from('income_transactions').insert({
      club_id: selectedClubId,
      amount,
      payment_method: form.payment_method,
      category: form.category,
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

        {/* Payment Method */}
        <div>
          <label className="label">{t('paymentMethod')}</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setForm((p) => ({ ...p, payment_method: method }))}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                  form.payment_method === method
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary-400'
                }`}
              >
                {t(`methods.${method}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="label">{t('category')}</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setForm((p) => ({ ...p, category: cat }))}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                  form.category === cat
                    ? 'bg-success-500 text-white border-success-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-success-400'
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
