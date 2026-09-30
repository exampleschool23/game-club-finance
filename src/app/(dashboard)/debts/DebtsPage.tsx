'use client';

// Route: /debts

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useClub } from '@/components/layout/DashboardShell';
import {
  Badge,
  Button,
  Card,
  CurrencyInput,
  DatePicker,
  DetailListSkeleton,
  EmptyState,
  Field,
  InlineAlert,
  Input,
  Modal,
  Money,
  PageHeader,
  SectionHeading,
  SegmentedControl,
  Skeleton,
  useToast,
} from '@/components/PresentationFoundation';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { todayIso } from '@/lib/utils';
import { formatCurrency, formatDate, parseCurrencyInput } from '@/lib/formatters';
import { calculateRemainingDebt, canManageDebts, getDebtStatus } from '@/lib/calculations/debt';
import { getDebtDateIssue, validateDebtPayment } from '@/lib/validation';
import { AlertTriangle, Plus, RefreshCw, Users, Wallet } from 'lucide-react';
import { defaultPaymentMethod } from '@/lib/paymentMethods';
import type { NewDebt, DebtPayment, EntryPaymentMethod } from '@/types';

type DebtStatusVariant = 'danger' | 'warning' | 'success';

function statusVariant(status: string): DebtStatusVariant {
  if (status === 'paid') return 'success';
  if (status === 'partial') return 'warning';
  return 'danger';
}

/** Single source for the outstanding amount shown in the list, the modal and validation. */
function remainingFor(debt: Pick<NewDebt, 'amount' | 'paid_amount'>): number {
  return calculateRemainingDebt(Number(debt.amount) || 0, Number(debt.paid_amount) || 0);
}

export default function DebtsPage() {
  const t = useTranslations('debts');
  const tc = useTranslations('common');
  const { selectedClubId, businessDayStartHour, enabledPaymentMethods, role } = useClub();
  const { locale } = useAppLocale();
  const { showToast, toastElement } = useToast();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);

  const [debts, setDebts] = useState<NewDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [payDebtId, setPayDebtId] = useState<string | null>(null);
  const [paymentsMap, setPaymentsMap] = useState<Record<string, DebtPayment[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [showPaid, setShowPaid] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState('');
  // Club the open modal belongs to; a submit is refused if the selected club changed meanwhile.
  const [formClubId, setFormClubId] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const paymentsRequestSequence = useRef(0);
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
    payment_method: defaultPaymentMethod(enabledPaymentMethods),
    date: businessToday,
    comment: '',
  });

  useEffect(() => {
    setAddForm((prev) => ({ ...prev, date: businessToday }));
    setPayForm((prev) => ({
      ...prev,
      date: businessToday,
      payment_method: enabledPaymentMethods.some((method) => method === prev.payment_method)
        ? prev.payment_method
        : defaultPaymentMethod(enabledPaymentMethods),
    }));
  }, [businessToday, enabledPaymentMethods, selectedClubId]);

  // Switching clubs closes any open form and drops cached payment history of the previous club.
  useEffect(() => {
    paymentsRequestSequence.current += 1;
    setAddOpen(false);
    setPayDebtId(null);
    setPaymentsMap({});
    setPaymentsLoading(false);
    setPaymentsError('');
    setFormClubId(null);
    setError('');
  }, [selectedClubId]);

  const fetchDebts = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++requestSequence.current;
    if (!silent) setLoading(true);
    if (!selectedClubId) {
      setDebts([]);
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('new_debts')
        .select('*')
        .eq('club_id', selectedClubId)
        .order('date', { ascending: false });
      if (requestId !== requestSequence.current) return;
      if (fetchError) {
        console.error('Failed to load debts', fetchError);
        setLoadError(t('loadError'));
        setLoading(false);
        return;
      }
      setLoadError('');
      setDebts((data as NewDebt[]) ?? []);
      setLoading(false);
    } catch (fetchError) {
      if (requestId !== requestSequence.current) return;
      console.error('Failed to load debts', fetchError);
      setLoadError(t('loadError'));
      setLoading(false);
    }
  }, [selectedClubId, t]);

  useEffect(() => {
    void fetchDebts();
    return () => { requestSequence.current += 1; };
  }, [fetchDebts]);

  async function loadPayments(debtId: string, clubId: string) {
    const requestId = ++paymentsRequestSequence.current;
    setPaymentsLoading(true);
    setPaymentsError('');

    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('debt_payments')
        .select('*')
        .eq('club_id', clubId)
        .eq('debt_id', debtId)
        .order('date', { ascending: false });
      if (requestId !== paymentsRequestSequence.current) return;
      if (fetchError) {
        console.error('Failed to load debt payments', fetchError);
        setPaymentsError(t('paymentsLoadError'));
        return;
      }
      setPaymentsMap((prev) => ({ ...prev, [debtId]: (data as DebtPayment[]) ?? [] }));
    } catch (fetchError) {
      if (requestId !== paymentsRequestSequence.current) return;
      console.error('Failed to load debt payments', fetchError);
      setPaymentsError(t('paymentsLoadError'));
    } finally {
      if (requestId === paymentsRequestSequence.current) setPaymentsLoading(false);
    }
  }

  function openPayModal(debtId: string) {
    if (!selectedClubId) return;
    setPayDebtId(debtId);
    setFormClubId(selectedClubId);
    setPayForm({ amount: '', payment_method: defaultPaymentMethod(enabledPaymentMethods), date: businessToday, comment: '' });
    setError('');
    void loadPayments(debtId, selectedClubId);
  }

  function closePayModal() {
    paymentsRequestSequence.current += 1;
    setPaymentsLoading(false);
    setPayDebtId(null);
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
    setFormClubId(selectedClubId || null);
    setAddOpen(true);
  }

  async function handleAddDebt(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseCurrencyInput(addForm.amount);
    if (!selectedClubId) { setError(tc('error')); return; }
    if (formClubId !== selectedClubId) { setError(t('clubChanged')); return; }
    if (!amount || amount <= 0) { setError(tc('invalidAmount')); return; }
    if (!addForm.person_name.trim()) { setError(tc('required')); return; }
    const dateIssue = getDebtDateIssue({ date: addForm.date, businessDate: businessToday });
    if (dateIssue) { setError(dateIssue === 'future' ? t('futureDateError') : tc('error')); return; }
    setSaving(true);
    setError('');

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      const { error: err } = await supabase.from('new_debts').insert({
        club_id: selectedClubId,
        person_name: addForm.person_name.trim(),
        amount,
        remaining_amount: amount,
        date: addForm.date,
        category: addForm.category,
        comment: addForm.comment.trim() || null,
        status: 'unpaid',
        created_by: session?.user?.id ?? null,
      });

      if (err) {
        console.error('Failed to save debt', err);
        setError(t('saveError'));
        return;
      }

      setAddOpen(false);
      showToast(t('debtSaved'));
      await fetchDebts({ silent: true });
    } catch (saveError) {
      console.error('Failed to save debt', saveError);
      setError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payDebtId) return;
    const amount = parseCurrencyInput(payForm.amount);
    if (!selectedClubId) { setError(tc('error')); return; }
    if (formClubId !== selectedClubId) { setError(t('clubChanged')); return; }
    if (!amount || amount <= 0) { setError(tc('invalidAmount')); return; }
    const debt = debts.find((row) => row.id === payDebtId);
    if (!debt) { setError(tc('error')); return; }
    const dateIssue = getDebtDateIssue({
      date: payForm.date,
      businessDate: businessToday,
      debtDate: debt.date,
    });
    if (dateIssue) {
      setError(
        dateIssue === 'future'
          ? t('futureDateError')
          : dateIssue === 'before_debt'
            ? t('paymentBeforeDebtDate')
            : tc('error'),
      );
      return;
    }
    const paymentValidation = validateDebtPayment({
      paymentAmount: amount,
      remainingDebt: remainingFor(debt),
    });
    if (!paymentValidation.valid) { setError(t('paymentExceedsRemaining')); return; }
    setSaving(true);
    setError('');

    try {
      const supabase = createClient();
      const { error: err } = await supabase.from('debt_payments').insert({
        club_id: selectedClubId,
        debt_id: payDebtId,
        amount,
        payment_method: payForm.payment_method,
        date: payForm.date,
        comment: payForm.comment.trim() || null,
      });

      if (err) {
        console.error('Failed to save debt payment', err);
        setError(t('saveError'));
        return;
      }

      const paidDebtId = payDebtId;
      closePayModal();
      // The cached history for this debt is now stale.
      setPaymentsMap((prev) => {
        const next = { ...prev };
        delete next[paidDebtId];
        return next;
      });
      showToast(t('paymentSaved'));
      await fetchDebts({ silent: true });
    } catch (saveError) {
      console.error('Failed to save debt payment', saveError);
      setError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  const activeDebt = payDebtId ? debts.find((d) => d.id === payDebtId) : null;
  const unpaid = debts.filter((d) => d.status !== 'paid');
  const paid = debts.filter((d) => d.status === 'paid');
  const outstandingTotal = unpaid.reduce((sum, debt) => sum + remainingFor(debt), 0);
  const activePayments = payDebtId ? paymentsMap[payDebtId] ?? [] : [];
  const paymentMethodOptions = enabledPaymentMethods.map((method) => ({
    value: method,
    label: tc(`paymentMethods.${method}`),
  }));

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={canManage ? (
          <Button onClick={() => openAddDebtModal()} icon={<Plus size={16} aria-hidden="true" />}>
            {t('addDebt')}
          </Button>
        ) : undefined}
      />

      {loading ? (
        <DetailListSkeleton rows={7} />
      ) : loadError ? (
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title={loadError}
            action={(
              <Button variant="outline" onClick={() => void fetchDebts()} icon={<RefreshCw size={16} aria-hidden="true" />}>
                {tc('retry')}
              </Button>
            )}
          />
        </Card>
      ) : debts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={tc('noData')}
            action={canManage ? (
              <Button onClick={() => openAddDebtModal()} icon={<Plus size={16} aria-hidden="true" />}>{t('addDebt')}</Button>
            ) : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {unpaid.length > 0 && (
            <section>
              <SectionHeading
                size="sm"
                className="mb-3 sm:items-center"
                title={t('outstanding')}
                action={(
                  <Badge variant="danger">
                    {t('remaining')}: <Money amount={outstandingTotal} />
                  </Badge>
                )}
              />
              <div className="space-y-3">
                {unpaid.map((debt) => {
                  const remaining = remainingFor(debt);
                  const status = getDebtStatus(debt.amount, debt.paid_amount);
                  return (
                    <Card key={debt.id} as="article" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words font-semibold text-gray-900">{debt.person_name}</p>
                          <Badge variant={statusVariant(status)}>{t(status)}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {formatDate(debt.date, locale)}
                          {debt.comment ? ` · ${debt.comment}` : ''}
                        </p>
                        {debt.paid_amount > 0 && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            {t('paidAmount')}: {formatCurrency(debt.paid_amount)} · {t('remaining')}: {formatCurrency(remaining)}
                          </p>
                        )}
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                        <span className="break-words font-bold text-danger-600 sm:text-right">
                          <Money amount={debt.amount} />
                        </span>
                        {canManage && (
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => openAddDebtModal(debt.person_name)} icon={<Plus size={14} aria-hidden="true" />}>
                              {t('addDebt')}
                            </Button>
                            <Button variant="secondary" size="sm" className="flex-1 sm:flex-none" onClick={() => openPayModal(debt.id)} icon={<Wallet size={14} aria-hidden="true" />}>
                              {t('addPayment')}
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {paid.length > 0 && (
            <section>
              <SectionHeading
                size="sm"
                className="mb-3 sm:items-center"
                title={t('paid')}
                badge={<Badge variant="neutral" size="sm">{paid.length}</Badge>}
                action={(
                  <Button variant="ghost" size="sm" aria-expanded={showPaid} onClick={() => setShowPaid((value) => !value)}>
                    {showPaid ? t('hidePaid') : t('showPaid')}
                  </Button>
                )}
              />
              {showPaid && (
                <div className="space-y-2">
                  {paid.map((debt) => (
                    <Card key={debt.id} as="article" padding="sm" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-700">{debt.person_name}</p>
                        <p className="text-xs text-gray-400">{formatDate(debt.date, locale)}</p>
                      </div>
                      <span className="break-words font-bold text-success-600 sm:text-right"><Money amount={debt.amount} /></span>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t('addDebt')}
        locked={saving}
        footer={(
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>{tc('cancel')}</Button>
            <Button type="submit" form="add-debt-form" loading={saving} loadingLabel={tc('saving')}>{tc('save')}</Button>
          </>
        )}
      >
        <form id="add-debt-form" onSubmit={handleAddDebt} className="space-y-4">
          <Field label={t('personName')} htmlFor="debt-person" required>
            <Input
              id="debt-person"
              type="text"
              maxLength={120}
              value={addForm.person_name}
              onChange={(e) => setAddForm((p) => ({ ...p, person_name: e.target.value }))}
              required
            />
          </Field>
          <Field label={t('amount')} htmlFor="debt-amount" required>
            <CurrencyInput
              id="debt-amount"
              value={addForm.amount}
              onValueChange={(value) => setAddForm((p) => ({ ...p, amount: value }))}
              trailingAddon={tc('currency')}
              required
            />
          </Field>
          <Field label={t('date')}>
            <DatePicker
              ariaLabel={t('date')}
              value={addForm.date}
              onChange={(value) => setAddForm((previous) => ({ ...previous, date: value }))}
              max={businessToday}
            />
          </Field>
          <Field label={t('comment')} htmlFor="debt-comment">
            <Input
              id="debt-comment"
              type="text"
              maxLength={250}
              value={addForm.comment}
              onChange={(e) => setAddForm((p) => ({ ...p, comment: e.target.value }))}
            />
          </Field>
          {error && <InlineAlert variant="danger">{error}</InlineAlert>}
        </form>
      </Modal>

      <Modal
        open={Boolean(payDebtId && activeDebt)}
        onClose={closePayModal}
        title={t('partialPayment')}
        locked={saving}
        footer={(
          <>
            <Button variant="outline" onClick={closePayModal} disabled={saving}>{tc('cancel')}</Button>
            <Button type="submit" form="add-payment-form" loading={saving} loadingLabel={tc('saving')}>{tc('save')}</Button>
          </>
        )}
      >
        {activeDebt && payDebtId && (
          <form id="add-payment-form" onSubmit={handleAddPayment} className="space-y-4">
            <Card tone="muted" padding="sm">
              <p className="font-semibold text-gray-800">{activeDebt.person_name}</p>
              <p className="text-sm text-gray-500">
                {t('remaining')}: <Money amount={remainingFor(activeDebt)} className="font-semibold text-gray-900" />
              </p>
            </Card>

            {paymentsLoading ? (
              <div role="status" aria-label={t('paymentsLoading')} className="space-y-2">
                <Skeleton className="h-3 w-32 bg-gray-100" />
                <Skeleton className="h-9 w-full rounded-lg bg-gray-100" />
              </div>
            ) : paymentsError ? (
              <InlineAlert
                variant="warning"
                action={formClubId ? (
                  <Button variant="ghost" size="sm" onClick={() => void loadPayments(payDebtId, formClubId)}>{tc('retry')}</Button>
                ) : undefined}
              >
                {paymentsError}
              </InlineAlert>
            ) : activePayments.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">{t('debtPayments')}</p>
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                  {activePayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-gray-600">
                      <span>{formatDate(p.date, locale)} · {tc.has(`paymentMethods.${p.payment_method}`) ? tc(`paymentMethods.${p.payment_method as EntryPaymentMethod}`) : p.payment_method}</span>
                      <span className="font-medium text-success-600">+<Money amount={p.amount} /></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Field label={t('amount')} htmlFor="payment-amount" required>
              <CurrencyInput
                id="payment-amount"
                value={payForm.amount}
                onValueChange={(value) => setPayForm((p) => ({ ...p, amount: value }))}
                trailingAddon={tc('currency')}
                required
                autoFocus
              />
            </Field>
            <Field label={t('paymentMethod')}>
              <SegmentedControl
                label={t('paymentMethod')}
                options={paymentMethodOptions}
                value={payForm.payment_method}
                onChange={(method) => setPayForm((p) => ({ ...p, payment_method: method }))}
              />
            </Field>
            <Field label={t('date')}>
              <DatePicker
                ariaLabel={t('date')}
                value={payForm.date}
                onChange={(value) => setPayForm((previous) => ({ ...previous, date: value }))}
                min={activeDebt.date}
                max={businessToday}
              />
            </Field>
            <Field label={t('comment')} htmlFor="payment-comment">
              <Input
                id="payment-comment"
                type="text"
                maxLength={250}
                value={payForm.comment}
                onChange={(e) => setPayForm((p) => ({ ...p, comment: e.target.value }))}
              />
            </Field>
            {error && <InlineAlert variant="danger">{error}</InlineAlert>}
          </form>
        )}
      </Modal>

      {toastElement}
    </div>
  );
}
