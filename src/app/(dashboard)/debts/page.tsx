'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate, todayIso } from '@/lib/utils';
import { Plus, CheckCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Toast, useToast } from '@/components/ui/Toast';
import type { Debt, PaymentMethod } from '@/types';

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'terminal', 'qr', 'transfer'];

export default function DebtsPage() {
  const t  = useTranslations('debts');
  const ti = useTranslations('income');
  const { toast, showToast, hideToast } = useToast();

  const [debts, setDebts] = useState<Debt[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [payDebt, setPayDebt] = useState<Debt | null>(null);
  const [paidMethod, setPaidMethod] = useState<PaymentMethod>('cash');
  const [form, setForm] = useState({
    customer_name: '',
    amount: '',
    comment: '',
    debt_date: todayIso(),
  });
  const [loading, setLoading] = useState(false);

  const fetchDebts = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('debts')
      .select('*')
      .order('debt_date', { ascending: false });
    setDebts((data as Debt[]) ?? []);
  }, []);

  useEffect(() => { fetchDebts(); }, [fetchDebts]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { showToast('Введите сумму', 'error'); return; }
    if (!form.customer_name.trim()) { showToast('Введите имя клиента', 'error'); return; }

    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Insert debt as income with method=debt AND add debt record
    const [{ error: debtErr }, { error: incErr }] = await Promise.all([
      supabase.from('debts').insert({
        customer_name: form.customer_name.trim(),
        amount,
        comment: form.comment || null,
        debt_date: form.debt_date,
        created_by: user!.id,
      }),
      supabase.from('income_transactions').insert({
        amount,
        payment_method: 'debt',
        category: 'other',
        comment: `Долг: ${form.customer_name}`,
        transaction_date: form.debt_date,
        created_by: user!.id,
      }),
    ]);

    setLoading(false);
    if (debtErr || incErr) { showToast((debtErr ?? incErr)!.message, 'error'); return; }
    showToast(t('success'), 'success');
    setAddOpen(false);
    setForm({ customer_name: '', amount: '', comment: '', debt_date: todayIso() });
    fetchDebts();
  }

  async function handleMarkPaid() {
    if (!payDebt) return;
    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('debts')
      .update({ status: 'paid', paid_at: new Date().toISOString(), paid_method: paidMethod })
      .eq('id', payDebt.id);

    setLoading(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(t('success'), 'success');
    setPayDebt(null);
    fetchDebts();
  }

  const unpaid = debts.filter((d) => d.status === 'unpaid');
  const paid   = debts.filter((d) => d.status === 'paid');

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <button onClick={() => setAddOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> {t('addDebt')}
        </button>
      </div>

      {/* Summary */}
      <div className="card flex gap-6">
        <div>
          <p className="text-xs text-gray-500">Неоплаченных</p>
          <p className="text-xl font-bold text-danger-600">{formatCurrency(unpaid.reduce((s, d) => s + d.amount, 0))}</p>
          <p className="text-xs text-gray-400">{unpaid.length} записей</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Оплачено</p>
          <p className="text-xl font-bold text-success-600">{formatCurrency(paid.reduce((s, d) => s + d.amount, 0))}</p>
          <p className="text-xs text-gray-400">{paid.length} записей</p>
        </div>
      </div>

      {/* Unpaid debts */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{t('unpaid')}</h2>
        {unpaid.length === 0 && <p className="text-gray-400 text-sm card py-6 text-center">Нет неоплаченных долгов</p>}
        {unpaid.map((debt) => (
          <div key={debt.id} className="card flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">{debt.customer_name}</p>
              <p className="text-xs text-gray-400">{formatDate(debt.debt_date)}{debt.comment ? ` · ${debt.comment}` : ''}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-danger-700">{formatCurrency(debt.amount)}</span>
              <button
                onClick={() => { setPayDebt(debt); setPaidMethod('cash'); }}
                className="flex items-center gap-1 text-xs btn-secondary px-3 py-1.5"
              >
                <CheckCircle size={14} /> {t('markPaid')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Paid debts */}
      {paid.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{t('paid')}</h2>
          {paid.map((debt) => (
            <div key={debt.id} className="card flex items-center justify-between gap-3 opacity-60">
              <div className="flex-1">
                <p className="font-medium text-gray-700">{debt.customer_name}</p>
                <p className="text-xs text-gray-400">{formatDate(debt.debt_date)}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-success-600">{formatCurrency(debt.amount)}</p>
                <p className="text-xs text-gray-400">{debt.paid_method ? ti(`methods.${debt.paid_method}`) : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Debt Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('addDebt')}>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="label">{t('customerName')} *</label>
            <input
              type="text"
              value={form.customer_name}
              onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="label">{t('amount')} *</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              className="input-field"
              placeholder="0"
              min="1"
              required
            />
          </div>
          <div>
            <label className="label">{t('date')}</label>
            <input
              type="date"
              value={form.debt_date}
              onChange={(e) => setForm((p) => ({ ...p, debt_date: e.target.value }))}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">{t('comment')}</label>
            <input
              type="text"
              value={form.comment}
              onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
              className="input-field"
              placeholder="..."
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Сохранение...' : t('submit')}
          </button>
        </form>
      </Modal>

      {/* Mark Paid Modal */}
      <Modal open={!!payDebt} onClose={() => setPayDebt(null)} title={t('markPaid')}>
        <div className="space-y-4">
          {payDebt && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="font-semibold">{payDebt.customer_name}</p>
              <p className="text-danger-700 font-bold text-lg">{formatCurrency(payDebt.amount)}</p>
            </div>
          )}
          <div>
            <label className="label">{t('paymentMethod')}</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaidMethod(m)}
                  className={`py-2 text-sm rounded-lg border font-medium transition-all ${
                    paidMethod === m
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary-400'
                  }`}
                >
                  {ti(`methods.${m}`)}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleMarkPaid} disabled={loading} className="btn-primary w-full">
            {loading ? 'Сохранение...' : t('confirm')}
          </button>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
