'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormSection } from '@/components/ui/FormSection';
import { MetricCard } from '@/components/ui/MetricCard';
import { todayIso, formatCurrency } from '@/lib/utils';
import { calculateManualIncome } from '@/lib/calculations/dailyReport';
import { TrendingUp } from 'lucide-react';

interface CashFormData {
  date: string;
  cash_income: string;
  terminal_income: string;
  qr_income: string;
  transfer_income: string;
  debt_income: string;
  game_income: string;
  other_income: string;
  comment: string;
}

const defaultForm = (): CashFormData => ({
  date: todayIso(),
  cash_income: '',
  terminal_income: '',
  qr_income: '',
  transfer_income: '',
  debt_income: '',
  game_income: '',
  other_income: '',
  comment: '',
});

function parseNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

export default function DailyCashPage() {
  const t = useTranslations('dailyCash');
  const tc = useTranslations('common');
  const [form, setForm] = useState<CashFormData>(defaultForm());
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [existingId, setExistingId] = useState<string | null>(null);

  const fetchExisting = useCallback(
    async (date: string) => {
      const supabase = createClient();
      const { data } = await supabase
        .from('daily_cash_entries')
        .select('*')
        .eq('date', date)
        .maybeSingle();

      if (data) {
        setExistingId(data.id);
        setForm({
          date: data.date,
          cash_income: data.cash_income > 0 ? String(data.cash_income) : '',
          terminal_income: data.terminal_income > 0 ? String(data.terminal_income) : '',
          qr_income: data.qr_income > 0 ? String(data.qr_income) : '',
          transfer_income: data.transfer_income > 0 ? String(data.transfer_income) : '',
          debt_income: data.debt_income > 0 ? String(data.debt_income) : '',
          game_income: data.game_income > 0 ? String(data.game_income) : '',
          other_income: data.other_income > 0 ? String(data.other_income) : '',
          comment: data.comment ?? '',
        });
      } else {
        setExistingId(null);
      }
    },
    [],
  );

  useEffect(() => {
    fetchExisting(form.date).catch(() => {});
  }, [form.date, fetchExisting]);

  function set(field: keyof CashFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const total = calculateManualIncome({
    cash_income: parseNum(form.cash_income),
    terminal_income: parseNum(form.terminal_income),
    qr_income: parseNum(form.qr_income),
    transfer_income: parseNum(form.transfer_income),
    debt_income: parseNum(form.debt_income),
    game_income: parseNum(form.game_income),
    other_income: parseNum(form.other_income),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const payload = {
      date: form.date,
      cash_income: parseNum(form.cash_income),
      terminal_income: parseNum(form.terminal_income),
      qr_income: parseNum(form.qr_income),
      transfer_income: parseNum(form.transfer_income),
      debt_income: parseNum(form.debt_income),
      game_income: parseNum(form.game_income),
      other_income: parseNum(form.other_income),
      comment: form.comment || null,
      created_by: session?.user?.id ?? null,
      updated_at: new Date().toISOString(),
    };

    let err: string | null = null;
    if (existingId) {
      const { error: e } = await supabase
        .from('daily_cash_entries')
        .update(payload)
        .eq('id', existingId);
      err = e?.message ?? null;
    } else {
      const { error: e } = await supabase.from('daily_cash_entries').insert(payload);
      err = e?.message ?? null;
    }

    setLoading(false);
    if (err) {
      setError(err);
    } else {
      setSuccess(t('success'));
      await fetchExisting(form.date);
    }
  }

  const fields: Array<{ key: keyof CashFormData; label: string }> = [
    { key: 'cash_income', label: t('cashIncome') },
    { key: 'terminal_income', label: t('terminalIncome') },
    { key: 'qr_income', label: t('qrIncome') },
    { key: 'transfer_income', label: t('transferIncome') },
    { key: 'debt_income', label: t('debtIncome') },
    { key: 'game_income', label: t('gameIncome') },
    { key: 'other_income', label: t('otherIncome') },
  ];

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('title')} description={t('description')} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormSection title={t('date')}>
          <input
            type="date"
            className="input-field"
            value={form.date}
            onChange={(e) => {
              set('date', e.target.value);
              setSuccess('');
              setError('');
            }}
          />
        </FormSection>

        <FormSection title={t('title')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map(({ key, label }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input-field"
                  placeholder="0"
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="label">{t('comment')}</label>
              <textarea
                className="input-field resize-none"
                rows={2}
                value={form.comment}
                onChange={(e) => set('comment', e.target.value)}
              />
            </div>
          </div>
        </FormSection>

        <MetricCard
          label={t('totalManual')}
          value={`${formatCurrency(total)} ${tc('currency')}`}
          icon={TrendingUp}
          valueClassName="text-success-600"
        />

        {error && <p className="text-sm text-danger-500">{error}</p>}
        {success && <p className="text-sm text-success-600">{success}</p>}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? tc('saving') : t('submit')}
        </button>
      </form>
    </div>
  );
}
