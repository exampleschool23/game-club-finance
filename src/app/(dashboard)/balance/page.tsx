'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '@/lib/formatters';
import { Banknote, CreditCard, QrCode, Users, DollarSign, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Toast, useToast } from '@/components/ui/Toast';
import type { MovementType, CashMovement } from '@/types';

const ACCOUNTS = [
  { key: 'cash',     label: 'cashBalance',    icon: Banknote,   color: 'text-success-600' },
  { key: 'terminal', label: 'terminalBalance', icon: CreditCard, color: 'text-primary-600' },
  { key: 'bank',     label: 'bankBalance',     icon: QrCode,     color: 'text-warning-600' },
  { key: 'debt',     label: 'debtBalance',     icon: Users,      color: 'text-danger-600' },
] as const;

export default function BalancePage() {
  const t  = useTranslations('balance');
  const td = useTranslations('dashboard');
  const { toast, showToast, hideToast } = useToast();

  const [balances, setBalances] = useState<Record<string, number>>({});
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    movement_type: 'deposit' as MovementType,
    account: 'cash',
    amount: '',
    comment: '',
  });
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const [{ data: bals }, { data: movs }] = await Promise.all([
      supabase.from('balances').select('*'),
      supabase.from('cash_movements').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    const balMap: Record<string, number> = {};
    (bals ?? []).forEach((b: { account: string; amount: number }) => { balMap[b.account] = b.amount; });
    setBalances(balMap);
    setMovements((movs ?? []) as CashMovement[]);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleMovement(e: React.FormEvent) {
    e.preventDefault();
    const raw = parseCurrencyInput(form.amount);
    if (!raw || raw <= 0) { showToast('Введите сумму', 'error'); return; }

    const amount = form.movement_type === 'withdraw' ? -raw : raw;

    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const { error } = await supabase.from('cash_movements').insert({
      movement_type: form.movement_type,
      account: form.account,
      amount,
      comment: form.comment || null,
      created_by: session!.user.id,
    });

    setLoading(false);
    if (error) { showToast(error.message, 'error'); return; }

    showToast(t('success'), 'success');
    setModalOpen(false);
    setForm((p) => ({ ...p, amount: '', comment: '' }));
    await fetchAll();
  }

  const total = (balances['cash'] ?? 0) + (balances['terminal'] ?? 0) + (balances['bank'] ?? 0);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <button onClick={() => setModalOpen(true)} className="btn-primary w-full sm:w-auto">
          <Plus size={16} /> {t('deposit')}
        </button>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ACCOUNTS.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="card flex items-center gap-3">
            <Icon size={22} className={color} />
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{td(label)}</p>
              <p className={`break-words text-lg font-bold ${color}`}>{formatCurrency(balances[key] ?? 0)}</p>
            </div>
          </div>
        ))}
        <div className="card flex items-center gap-3 sm:col-span-2 lg:col-span-1">
          <DollarSign size={22} className="text-gray-700" />
          <div className="min-w-0">
            <p className="text-xs text-gray-500">{td('totalBalance')}</p>
            <p className="break-words text-lg font-bold text-gray-900">{formatCurrency(total)}</p>
          </div>
        </div>
      </div>

      {/* Movement history */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-4">{t('movements')}</h2>
        {movements.length === 0 && <p className="text-gray-400 text-sm">Нет данных</p>}
        <div className="space-y-2">
          {movements.map((m) => (
            <div key={m.id} className="flex flex-col gap-1 border-b border-gray-50 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium capitalize text-gray-800">{m.movement_type} — {m.account}</p>
                {m.comment && <p className="text-xs text-gray-400">{m.comment}</p>}
              </div>
              <span className={`text-sm font-bold sm:text-right ${m.amount >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                {m.amount >= 0 ? '+' : ''}{formatCurrency(m.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Movement modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Движение средств">
        <form onSubmit={handleMovement} className="space-y-4">
          <div>
            <label className="label">Тип операции</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(['deposit', 'withdraw', 'correction'] as MovementType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, movement_type: type }))}
                  className={`py-2 text-sm rounded-lg border font-medium transition-all ${
                    form.movement_type === type
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary-400'
                  }`}
                >
                  {t(type)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">{t('account')}</label>
            <select
              value={form.account}
              onChange={(e) => setForm((p) => ({ ...p, account: e.target.value }))}
              className="input-field"
            >
              <option value="cash">Наличные</option>
              <option value="terminal">Терминал</option>
              <option value="bank">QR / Банк</option>
            </select>
          </div>

          <div>
            <label className="label">{t('amount')}</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: formatCurrencyInput(e.target.value) }))}
              className="input-field"
              placeholder="0"
              required
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

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </div>
  );
}
