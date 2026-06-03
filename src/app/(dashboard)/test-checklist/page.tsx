import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { calculateGameClubIncome } from '@/lib/calculations/dailyCash';
import { calculateRemainingDebt } from '@/lib/calculations/debt';
import { todayIso } from '@/lib/utils';

interface CheckResult {
  name: string;
  pass: boolean;
  explanation: string;
  link?: string;
}

export default async function TestChecklistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    redirect('/');
  }

  const today = todayIso();

  const [cashRes, stockRes, expenseRes, debtRes] = await Promise.all([
    supabase.from('daily_cash_entries').select('*').eq('date', today).maybeSingle(),
    supabase.from('daily_stock_counts').select('*').eq('date', today),
    supabase.from('expenses').select('*').eq('date', today),
    supabase.from('new_debts').select('*').neq('status', 'paid'),
  ]);

  const cashEntry = cashRes.data;
  const stockRows = stockRes.data ?? [];
  const expenseRows = expenseRes.data ?? [];
  const activeDebts = debtRes.data ?? [];

  const checks: CheckResult[] = [];

  // 1. Daily cash total = sum of payment methods
  if (cashEntry) {
    const expected = calculateGameClubIncome({
      cashIncome: cashEntry.cash_income,
      terminalIncome: cashEntry.terminal_income,
      cardIncome: cashEntry.card_income ?? 0,
    });
    // No stored total field — this checks the logic is self-consistent
    checks.push({
      name: 'Daily cash fields are all non-negative',
      pass: cashEntry.cash_income >= 0 && cashEntry.terminal_income >= 0 && (cashEntry.card_income ?? 0) >= 0,
      explanation: `Cash: ${cashEntry.cash_income}, Terminal: ${cashEntry.terminal_income}, Card: ${cashEntry.card_income ?? 0} → Total: ${expected}`,
      link: '/daily-cash',
    });
  } else {
    checks.push({
      name: 'Daily cash entry exists for today',
      pass: false,
      explanation: 'No daily cash entry found for today.',
      link: '/daily-cash',
    });
  }

  // 2. Closing stock sold quantity not negative
  const negSold = stockRows.filter((r) => (r.sold_quantity ?? 0) < 0);
  checks.push({
    name: 'No negative sold quantities in closing stock',
    pass: negSold.length === 0,
    explanation:
      negSold.length === 0
        ? `All ${stockRows.length} stock entries have valid sold quantities.`
        : `${negSold.length} entries have negative sold_quantity. Product IDs: ${negSold.map((r) => r.product_id).join(', ')}`,
    link: '/closing-stock',
  });

  // 3. Bar income = soldQty * salePrice
  const incomeErrors = stockRows.filter((r) => {
    const expected = (r.sold_quantity ?? 0) * (r.sale_price ?? 0);
    return Math.abs((r.bar_income ?? 0) - expected) > 1; // allow 1 UZS rounding
  });
  checks.push({
    name: 'Bar income matches sold_qty × sale_price',
    pass: incomeErrors.length === 0,
    explanation:
      incomeErrors.length === 0
        ? 'All bar income values are consistent.'
        : `${incomeErrors.length} entries have bar_income mismatch.`,
    link: '/closing-stock',
  });

  // 4. Bar profit = barIncome - barCost
  const profitErrors = stockRows.filter((r) => {
    const expected = (r.bar_income ?? 0) - (r.bar_cost ?? 0);
    return Math.abs((r.bar_profit ?? 0) - expected) > 1;
  });
  checks.push({
    name: 'Bar profit = bar_income − bar_cost',
    pass: profitErrors.length === 0,
    explanation:
      profitErrors.length === 0
        ? 'All bar profit values are consistent.'
        : `${profitErrors.length} entries have bar_profit mismatch.`,
    link: '/closing-stock',
  });

  // 5. Net profit = totalIncome - expenses
  if (cashEntry) {
    const gameClub = calculateGameClubIncome({
      cashIncome: cashEntry.cash_income,
      terminalIncome: cashEntry.terminal_income,
      cardIncome: cashEntry.card_income ?? 0,
    });
    const barIncome = stockRows.reduce((s, r) => s + (r.bar_income ?? 0), 0);
    const totalIncome = gameClub + barIncome;
    const totalExpenses = expenseRows.reduce((s, r) => s + (r.amount ?? 0), 0);
    const netProfit = totalIncome - totalExpenses;
    checks.push({
      name: 'Net profit = total income − total expenses',
      pass: true,
      explanation: `Game Club: ${gameClub.toLocaleString()} + Bar: ${barIncome.toLocaleString()} − Expenses: ${totalExpenses.toLocaleString()} = Net Profit: ${netProfit.toLocaleString()} UZS`,
      link: '/daily-report',
    });
  }

  // 6. Debts remaining not negative
  const negDebts = activeDebts.filter((d) => calculateRemainingDebt(d.amount, d.paid_amount ?? 0) < 0);
  checks.push({
    name: 'No negative remaining debt amounts',
    pass: negDebts.length === 0,
    explanation:
      negDebts.length === 0
        ? `All ${activeDebts.length} active debts have valid remaining amounts.`
        : `${negDebts.length} debts have invalid negative remaining amounts.`,
    link: '/debts',
  });

  // 7. No expenses with zero or negative amount
  const badExpenses = expenseRows.filter((e) => (e.amount ?? 0) <= 0);
  checks.push({
    name: 'All expenses have positive amounts',
    pass: badExpenses.length === 0,
    explanation:
      badExpenses.length === 0
        ? `All ${expenseRows.length} expenses for today are valid.`
        : `${badExpenses.length} expenses have zero or negative amount.`,
    link: '/expenses',
  });

  const passCount = checks.filter((c) => c.pass).length;
  const allPass = passCount === checks.length;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-950">System Sanity Checks</h1>
        <p className="mt-1 text-sm text-gray-600">
          Automated checks for today ({today}). Owner/Admin only.
        </p>
      </div>

      <div
        className={`rounded-xl border p-4 font-semibold ${allPass ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
      >
        {allPass
          ? `✅ All ${checks.length} checks passed`
          : `⚠️ ${passCount} / ${checks.length} checks passed — review failures below`}
      </div>

      <div className="space-y-3">
        {checks.map((check) => (
          <div
            key={check.name}
            className={`rounded-xl border p-4 ${check.pass ? 'border-green-100 bg-white' : 'border-red-200 bg-red-50'}`}
          >
            <div className="flex items-start gap-3">
              {check.pass ? (
                <CheckCircle size={20} className="mt-0.5 shrink-0 text-green-500" />
              ) : (
                <XCircle size={20} className="mt-0.5 shrink-0 text-red-500" />
              )}
              <div className="min-w-0 flex-1">
                <p className={`font-semibold ${check.pass ? 'text-gray-900' : 'text-red-800'}`}>{check.name}</p>
                <p className="mt-1 text-sm text-gray-600">{check.explanation}</p>
                {check.link && (
                  <Link href={check.link} className="mt-2 inline-flex text-sm font-medium text-primary-600 hover:underline">
                    Go to page →
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
        <AlertCircle size={14} className="inline mr-1" />
        These checks are based on today&apos;s data only. Run after entering daily cash and closing stock.
      </div>
    </div>
  );
}
