import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { StatCard } from '@/components/ui/StatCard';
import {
  TrendingUp, TrendingDown, DollarSign,
  Banknote, CreditCard, QrCode, Users
} from 'lucide-react';
import { todayIso, monthRange, currentYearMonth } from '@/lib/utils';

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
  const supabase = await createClient();
  const today = todayIso();
  const { from, to } = monthRange(currentYearMonth());

  // Today income
  const { data: todayIncome } = await supabase
    .from('income_transactions')
    .select('amount')
    .eq('transaction_date', today);
  const todayIncomeTotal = todayIncome?.reduce((s, r) => s + r.amount, 0) ?? 0;

  // Today expense
  const { data: todayExpense } = await supabase
    .from('expense_transactions')
    .select('amount')
    .eq('transaction_date', today);
  const todayExpenseTotal = todayExpense?.reduce((s, r) => s + r.amount, 0) ?? 0;

  // Month income
  const { data: monthIncome } = await supabase
    .from('income_transactions')
    .select('amount')
    .gte('transaction_date', from)
    .lte('transaction_date', to);
  const monthIncomeTotal = monthIncome?.reduce((s, r) => s + r.amount, 0) ?? 0;

  // Month expense
  const { data: monthExpense } = await supabase
    .from('expense_transactions')
    .select('amount')
    .gte('transaction_date', from)
    .lte('transaction_date', to);
  const monthExpenseTotal = monthExpense?.reduce((s, r) => s + r.amount, 0) ?? 0;

  // Balances
  const { data: balances } = await supabase.from('balances').select('*');
  const bal = (account: string) =>
    balances?.find((b) => b.account === account)?.amount ?? 0;

  const cashBal     = bal('cash');
  const terminalBal = bal('terminal');
  const bankBal     = bal('bank');
  const debtBal     = bal('debt');
  const totalBal    = cashBal + terminalBal + bankBal;

  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>

      {/* Today */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Сегодня
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title={t('todayIncome')}  value={todayIncomeTotal}                     icon={TrendingUp}   variant="success" />
          <StatCard title={t('todayExpense')} value={todayExpenseTotal}                    icon={TrendingDown} variant="danger"  />
          <StatCard title={t('todayProfit')}  value={todayIncomeTotal - todayExpenseTotal} icon={DollarSign}   variant={todayIncomeTotal - todayExpenseTotal >= 0 ? 'blue' : 'danger'} />
        </div>
      </section>

      {/* Month */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Этот месяц
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title={t('monthIncome')}  value={monthIncomeTotal}                       icon={TrendingUp}   variant="success" />
          <StatCard title={t('monthExpense')} value={monthExpenseTotal}                      icon={TrendingDown} variant="danger"  />
          <StatCard title={t('monthProfit')}  value={monthIncomeTotal - monthExpenseTotal}   icon={DollarSign}   variant={monthIncomeTotal - monthExpenseTotal >= 0 ? 'blue' : 'danger'} />
        </div>
      </section>

      {/* Balances */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Баланс
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard title={t('cashBalance')}     value={cashBal}     icon={Banknote}    variant="success" />
          <StatCard title={t('terminalBalance')} value={terminalBal} icon={CreditCard}  variant="blue"    />
          <StatCard title={t('bankBalance')}     value={bankBal}     icon={QrCode}      variant="warning" />
          <StatCard title={t('debtBalance')}     value={debtBal}     icon={Users}       variant="danger"  />
          <StatCard title={t('totalBalance')}    value={totalBal}    icon={DollarSign}  variant="default" />
        </div>
      </section>
    </div>
  );
}
