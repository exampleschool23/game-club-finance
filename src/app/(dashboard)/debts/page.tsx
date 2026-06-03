'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate, todayIso } from '@/lib/utils';
import { calculateRemainingDebt, getDebtStatus } from '@/lib/calculations/debt';
import { Plus, X, Users } from 'lucide-react';
import type { NewDebt, DebtPayment } from '@/types';

const PAYMENT_METHODS = ['cash', 'terminal', 'qr', 'transfer'];

type DebtStatusVariant = 'danger' | 'warning' | 'success';

function statusVariant(status: string): DebtStatusVariant {
  if (status === 'paid') return 'success';
  if (status === 'partial') return 'warning';
  return 'danger';
}

export default function DebtsPage() {
  const t = useTranslations('debts');
  const tc = useTranslations('common');

  const [debts, setDebts] = useState<NewDebt[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [payDebtId, setPayDebtId] = useState<string | null>(null);
  const [paymentsMap, setPaymentsMap] = useState<Record<string, DebtPayment[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [addForm, setAddForm] = useState({
    person_name: '',
    amount: '',
    date: todayIso(),
    category: 'other',
    comment: '',
  });

  const [payForm, setPayForm] = useState({
    amount: '',
    payment_method: 'cash',
    date: todayIso(),
    comment: '',
  });

  const fetchDebts = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('new_debts')
      .select('*')
      .order('date', { ascending: false });
    setDebts((data as NewDebt[]) ?? []);
  }, []);

  useEffect(() => {
    fetchDebts().catch(() => {});
  }, [fetchDebts]);

  async function loadPayments(debtId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from('debt_payments')
      .select('*')
      .eq('debt_id', debtId)
      .order('date', { ascending: false });
    setPaymentsMap((prev) => ({ ...prev, [debtId]: (data as DebtPayment[]) ?? [] }));
  }

  function openPayModal(debtId: string) {
    setPayDebtId(debtId);
    setPayForm({ amount: '', payment_method: 'cash', date: todayIso(), comment: '' });
    setError('');
    loadPayments(debtId).catch(() => {});
  }

  async function handleAddDebt(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(addForm.amount);
    if (!amount || amount <= 0) { setError(tc('invalidAmount')); return; }
    if (!addForm.person_name.trim()) { setError(tc('required')); return; }
    setSaving(true);
    setError('');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const { error: err } = await supabase.from('new_debts').insert({
      person_name: addForm.person_name.trim(),
      amount,
      remaining_amount: amount,
      date: addForm.date,
      category: addForm.category,
      comment: addForm.comment || null,
      status: 'unpaid',
      created_by: session?.user?.id ?? null,
    });

    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setAddOpen(false);
      setAddForm({ person_name: '', amount: '', date: todayIso(), category: 'other', comment: '' });
      await fetchDebts();
    }
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payDebtId) return;
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) { setError(tc('invalidAmount')); return; }
    setSaving(true);
    setError('');

    const supabase = createClient();
    const { error: err } = await supabase.from('debt_payments').insert({
      debt_id: payDebtId,
      amount,
      payment_method: payForm.payment_method,
      date: payForm.date,
      comment: payForm.comment || null,
    });

    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setPayDebtId(null);
      await fetchDebts();
    }
  }

  const activeDebt = payDebtId ? debts.find((d) => d.id === payDebtId) : null;
  const unpaid = debts.filter((d) => d.status !== 'paid');
  const paid = debts.filter((d) => d.status === 'paid');

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <button className="btn-primary flex items-center gap-2" onClick={() => { setError(''); setAddOpen(true); }}>
            <Plus size={16} />
            {t('addDebt')}
          </button>
        }
      />

      {debts.length === 0 ? (
        <EmptyState icon={Users} title={tc('noData')} />
      ) : (
        <div className="space-y-6">
          {/* Unpaid / Partial */}
          {unpaid.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {t('unpaid')} / {t('partial')}
              </h2>
              <div className="space-y-3">
                {unpaid.map((debt) => {
                  const remaining = calculateRemainingDebt(debt.amount, debt.paid_amount);
                  const status = getDebtStatus(debt.amount, debt.paid_amount);
                  return (
                    <div key={debt.id} className="card flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">{debt.person_name}</p>
                          <Badge variant={statusVariant(status)}>{t(status)}</Badge>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDate(debt.date)}
                          {debt.comment ? ` · ${debt.comment}` : ''}
                        </p>
                        {debt.paid_amount > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {t('paidAmount')}: {formatCurrency(debt.paid_amount)} |{' '}
                            {t('remaining')}: {formatCurrency(remaining)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-bold text-danger-700">
                          {formatCurrency(debt.amount)}
                        </span>
                        <button
                          className="btn-secondary text-xs px-3 py-1.5"
                          onClick={() => openPayModal(debt.id)}
                        >
                          {t('addPayment')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Paid */}
          {paid.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {t('paid')}
              </h2>
              <div className="space-y-2">
                {paid.map((debt) => (
                  <div key={debt.id} className="card flex items-center justify-between opacity-60">
                    <div>
                      <p className="font-medium text-gray-700">{debt.person_name}</p>
                      <p className="text-xs text-gray-400">{formatDate(debt.date)}</p>
                    </div>
                    <span className="font-bold text-success-600">{formatCurrency(debt.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Debt Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{t('addDebt')}</h2>
              <button onClick={() => setAddOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddDebt} className="p-6 space-y-4">
              <div>
                <label className="label">{t('personName')}</label>
                <input
                  type="text"
                  className="input-field"
                  value={addForm.person_name}
                  onChange={(e) => setAddForm((p) => ({ ...p, person_name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">{t('amount')}</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="input-field"
                  value={addForm.amount}
                  onChange={(e) => setAddForm((p) => ({ ...p, amount: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">{t('date')}</label>
                <input
                  type="date"
                  className="input-field"
                  value={addForm.date}
                  onChange={(e) => setAddForm((p) => ({ ...p, date: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">{t('comment')}</label>
                <input
                  type="text"
                  className="input-field"
                  value={addForm.comment}
                  onChange={(e) => setAddForm((p) => ({ ...p, comment: e.target.value }))}
                />
              </div>
              {error && <p className="text-sm text-danger-500">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setAddOpen(false)}>
                  {tc('cancel')}
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? tc('saving') : tc('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Payment Modal */}
      {payDebtId && activeDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{t('partialPayment')}</h2>
              <button onClick={() => setPayDebtId(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 pt-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm mb-4">
                <p className="font-semibold text-gray-800">{activeDebt.person_name}</p>
                <p className="text-gray-500">
                  {t('remaining')}: {formatCurrency(activeDebt.remaining_amount)}
                </p>
              </div>

              {/* Payment history */}
              {(paymentsMap[payDebtId] ?? []).length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    {t('debtPayments')}
                  </p>
                  <div className="space-y-1">
                    {(paymentsMap[payDebtId] ?? []).map((p) => (
                      <div key={p.id} className="flex justify-between text-sm text-gray-600">
                        <span>{formatDate(p.date)}</span>
                        <span className="font-medium text-success-600">+{formatCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleAddPayment} className="px-6 pb-6 space-y-4">
              <div>
                <label className="label">{t('amount')}</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="input-field"
                  value={payForm.amount}
                  onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">{t('paymentMethod')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayForm((p) => ({ ...p, payment_method: m }))}
                      className={`py-2 text-sm rounded-lg border font-medium transition-all ${
                        payForm.payment_method === m
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-primary-400'
                      }`}
                    >
                      {tc(`paymentMethods.${m}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">{t('date')}</label>
                <input
                  type="date"
                  className="input-field"
                  value={payForm.date}
                  onChange={(e) => setPayForm((p) => ({ ...p, date: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">{t('comment')}</label>
                <input
                  type="text"
                  className="input-field"
                  value={payForm.comment}
                  onChange={(e) => setPayForm((p) => ({ ...p, comment: e.target.value }))}
                />
              </div>
              {error && <p className="text-sm text-danger-500">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setPayDebtId(null)}>
                  {tc('cancel')}
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? tc('saving') : tc('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
