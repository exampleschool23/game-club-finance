'use client';

// Route: /debts

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { DatePicker } from '@/components/ui/CalendarPicker';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { todayIso } from '@/lib/utils';
import { formatCurrency, formatCurrencyInput, formatDate, parseCurrencyInput } from '@/lib/formatters';
import { calculateRemainingDebt, canManageDebts, getDebtStatus } from '@/lib/calculations/debt';
import { validateDebtPayment } from '@/lib/validation';
import { Plus, X, Users } from 'lucide-react';
import { PAYMENT_METHODS, type NewDebt, type DebtPayment } from '@/types';

type DebtStatusVariant = 'danger' | 'warning' | 'success';

function statusVariant(status: string): DebtStatusVariant {
  if (status === 'paid') return 'success';
  if (status === 'partial') return 'warning';
  return 'danger';
}

export default function DebtsPage() {
  const t = useTranslations('debts');
  const tc = useTranslations('common');
  const { selectedClubId, businessDayStartHour, role } = useClub();
  const { locale } = useAppLocale();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);

  const [debts, setDebts] = useState<NewDebt[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [payDebtId, setPayDebtId] = useState<string | null>(null);
  const [paymentsMap, setPaymentsMap] = useState<Record<string, DebtPayment[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const canManage = canManageDebts(role);

  const [addForm, setAddForm] = useState({
    person_name: '',
    amount: '',
    date: businessToday,
    category: 'other',
    comment: '',
  });

  const [payForm, setPayForm] = useState({
    amount: '',
    payment_method: 'cash',
    date: businessToday,
    comment: '',
  });

  useEffect(() => {
    setAddForm((prev) => ({ ...prev, date: businessToday }));
    setPayForm((prev) => ({ ...prev, date: businessToday }));
  }, [businessToday, selectedClubId]);

  const fetchDebts = useCallback(async () => {
    if (!selectedClubId) {
      setDebts([]);
      return;
    }

    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from('new_debts')
      .select('*')
      .eq('club_id', selectedClubId)
      .order('date', { ascending: false });
    if (fetchError) {
      setLoadError(fetchError.message);
      return;
    }
    setLoadError('');
    setDebts((data as NewDebt[]) ?? []);
  }, [selectedClubId]);

  useEffect(() => {
    fetchDebts().catch((fetchError) => {
      setLoadError(fetchError instanceof Error ? fetchError.message : tc('error'));
    });
  }, [fetchDebts, tc]);

  async function loadPayments(debtId: string) {
    if (!selectedClubId) return;

    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from('debt_payments')
      .select('*')
      .eq('club_id', selectedClubId)
      .eq('debt_id', debtId)
      .order('date', { ascending: false });
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    setPaymentsMap((prev) => ({ ...prev, [debtId]: (data as DebtPayment[]) ?? [] }));
  }

  function openPayModal(debtId: string) {
    setPayDebtId(debtId);
    setPayForm({ amount: '', payment_method: 'cash', date: businessToday, comment: '' });
    setError('');
    loadPayments(debtId).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : tc('error'));
    });
  }

  function openAddDebtModal(personName = '') {
    setAddForm({
      person_name: personName,
      amount: '',
      date: businessToday,
      category: 'other',
      comment: '',
    });
    setError('');
    setAddOpen(true);
  }

  async function handleAddDebt(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseCurrencyInput(addForm.amount);
    if (!selectedClubId) { setError(tc('error')); return; }
    if (!amount || amount <= 0) { setError(tc('invalidAmount')); return; }
    if (!addForm.person_name.trim()) { setError(tc('required')); return; }
    setSaving(true);
    setError('');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const { error: err } = await supabase.from('new_debts').insert({
      club_id: selectedClubId,
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
      setAddForm({ person_name: '', amount: '', date: businessToday, category: 'other', comment: '' });
      await fetchDebts();
    }
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payDebtId) return;
    const amount = parseCurrencyInput(payForm.amount);
    if (!selectedClubId) { setError(tc('error')); return; }
    if (!amount || amount <= 0) { setError(tc('invalidAmount')); return; }
    const debt = debts.find((row) => row.id === payDebtId);
    if (!debt) { setError(tc('error')); return; }
    const paymentValidation = validateDebtPayment({
      paymentAmount: amount,
      remainingDebt: debt.remaining_amount,
    });
    if (!paymentValidation.valid) { setError(t('paymentExceedsRemaining')); return; }
    setSaving(true);
    setError('');

    const supabase = createClient();
    const { error: err } = await supabase.from('debt_payments').insert({
      club_id: selectedClubId,
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
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={canManage ? (
          <button className="btn-primary flex items-center gap-2" onClick={() => openAddDebtModal()}>
            <Plus size={16} />
            {t('addDebt')}
          </button>
        ) : undefined}
      />

      {loadError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {loadError}
        </div>
      )}

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
                    <div key={debt.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words font-semibold text-gray-900">{debt.person_name}</p>
                          <Badge variant={statusVariant(status)}>{t(status)}</Badge>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDate(debt.date, locale)}
                          {debt.comment ? ` · ${debt.comment}` : ''}
                        </p>
                        {debt.paid_amount > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {t('paidAmount')}: {formatCurrency(debt.paid_amount)} |{' '}
                            {t('remaining')}: {formatCurrency(remaining)}
                          </p>
                        )}
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                        <span className="break-words font-bold text-danger-700 sm:text-right">
                          {formatCurrency(debt.amount)}
                        </span>
                        {canManage && <div className="flex flex-wrap gap-2">
                          <button
                            className="btn-secondary flex-1 whitespace-nowrap px-3 py-1.5 text-xs sm:flex-none"
                            onClick={() => openAddDebtModal(debt.person_name)}
                          >
                            <Plus size={14} />
                            {t('addDebt')}
                          </button>
                          <button
                            className="btn-secondary flex-1 whitespace-nowrap px-3 py-1.5 text-xs sm:flex-none"
                            onClick={() => openPayModal(debt.id)}
                          >
                            {t('addPayment')}
                          </button>
                        </div>}
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
                  <div key={debt.id} className="card flex flex-col gap-2 opacity-60 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-700">{debt.person_name}</p>
                      <p className="text-xs text-gray-400">{formatDate(debt.date, locale)}</p>
                    </div>
                    <span className="break-words font-bold text-success-600 sm:text-right">{formatCurrency(debt.amount)}</span>
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
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
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
                  type="text"
                  inputMode="numeric"
                  className="input-field"
                  value={addForm.amount}
                  onChange={(e) => setAddForm((p) => ({ ...p, amount: formatCurrencyInput(e.target.value) }))}
                  required
                />
              </div>
              <div>
                <label className="label">{t('date')}</label>
                <DatePicker
                  value={addForm.date}
                  onChange={(value) => setAddForm((previous) => ({ ...previous, date: value }))}
                  buttonClassName="h-10"
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
              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
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
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
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
                      <div key={p.id} className="flex flex-col gap-1 text-sm text-gray-600 sm:flex-row sm:justify-between">
                        <span>{formatDate(p.date, locale)}</span>
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
                  type="text"
                  inputMode="numeric"
                  className="input-field"
                  value={payForm.amount}
                  onChange={(e) => setPayForm((p) => ({ ...p, amount: formatCurrencyInput(e.target.value) }))}
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
                <DatePicker
                  value={payForm.date}
                  onChange={(value) => setPayForm((previous) => ({ ...previous, date: value }))}
                  buttonClassName="h-10"
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
              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
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
