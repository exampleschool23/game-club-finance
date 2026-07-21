'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { useClub } from '@/components/layout/DashboardShell';
import { formatDateShort, formatNumber } from '@/lib/formatters';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { createClient } from '@/lib/supabase/client';
import { todayIso } from '@/lib/utils';

interface CashRow {
  date: string;
  cash_income: number;
  terminal_income: number;
  card_income: number;
  playstation_income: number;
}

interface DebtPaymentRow {
  date: string;
  amount: number;
  payment_method: string;
}

interface ExpenseRow {
  date: string;
  amount: number;
  category: string;
  payment_source: 'game_club' | 'bar' | null;
  comment: string | null;
}

interface DailyRow {
  date: string;
  cash: number;
  terminal: number;
  card: number;
  playstation: number;
  debtPayments: number;
  expenses: number;
  expenseDetails: string[];
  moneyLeft: number;
}

function validDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function inRangeQuery<T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(
  query: T,
  from: string,
  to: string,
): T {
  return query.gte('date', from).lte('date', to);
}

function buildDailyRows(cashRows: CashRow[], debtRows: DebtPaymentRow[], expenseRows: ExpenseRow[]): DailyRow[] {
  const dates = new Set<string>();
  cashRows.forEach((row) => dates.add(row.date));
  debtRows.forEach((row) => dates.add(row.date));
  expenseRows.filter((row) => row.payment_source !== 'bar').forEach((row) => dates.add(row.date));

  return Array.from(dates).sort().map((date) => {
    const dayCash = cashRows.filter((row) => row.date === date);
    const dayDebtPayments = debtRows.filter((row) => row.date === date);
    const dayExpenses = expenseRows.filter(
      (row) => row.date === date && row.payment_source !== 'bar',
    );
    const cash = dayCash.reduce((sum, row) => sum + Number(row.cash_income ?? 0), 0);
    const terminal = dayCash.reduce((sum, row) => sum + Number(row.terminal_income ?? 0), 0);
    const card = dayCash.reduce((sum, row) => sum + Number(row.card_income ?? 0), 0);
    const playstation = dayCash.reduce((sum, row) => sum + Number(row.playstation_income ?? 0), 0);
    const debtPayments = dayDebtPayments.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const expenses = dayExpenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

    return {
      date,
      cash,
      terminal,
      card,
      playstation,
      debtPayments,
      expenses,
      expenseDetails: dayExpenses.map((row) =>
        row.comment ? `${row.category}: ${row.comment}` : row.category,
      ),
      moneyLeft: cash + terminal + card + playstation + debtPayments - expenses,
    };
  });
}

export default function GameClubMoneyDetailsPage({
  requestedFrom,
  requestedTo,
}: {
  requestedFrom?: string;
  requestedTo?: string;
}) {
  const router = useRouter();
  const t = useTranslations('dashboard');
  const { locale } = useAppLocale();
  const { selectedClubId, businessDayStartHour } = useClub();
  const fallbackDate = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const from = validDate(requestedFrom) ? requestedFrom : fallbackDate;
  const to = validDate(requestedTo) ? requestedTo : fallbackDate;
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDetails = useCallback(async () => {
    if (!selectedClubId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const supabase = createClient();
    const [cashRes, debtRes, expenseRes] = await Promise.all([
      fetchAllRows<CashRow>(() =>
        inRangeQuery(
          supabase
            .from('daily_cash_entries')
            .select('date,cash_income,terminal_income,card_income,playstation_income')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true }),
          from,
          to,
        ),
      ),
      fetchAllRows<DebtPaymentRow>(() =>
        inRangeQuery(
          supabase
            .from('debt_payments')
            .select('date,amount,payment_method')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true }),
          from,
          to,
        ),
      ),
      fetchAllRows<ExpenseRow>(() =>
        inRangeQuery(
          supabase
            .from('expenses')
            .select('date,amount,category,payment_source,comment')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true }),
          from,
          to,
        ),
      ),
    ]);

    const firstError = [cashRes.error, debtRes.error, expenseRes.error].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      setRows([]);
    } else {
      setRows(buildDailyRows(cashRes.data ?? [], debtRes.data ?? [], expenseRes.data ?? []));
    }
    setLoading(false);
  }, [from, selectedClubId, to]);

  useEffect(() => {
    fetchDetails().catch((fetchError: unknown) => {
      setError(fetchError instanceof Error ? fetchError.message : 'loadError');
      setLoading(false);
    });
  }, [fetchDetails]);

  const totals = rows.reduce(
    (sum, row) => ({
      cash: sum.cash + row.cash,
      terminal: sum.terminal + row.terminal,
      card: sum.card + row.card,
      playstation: sum.playstation + row.playstation,
      debtPayments: sum.debtPayments + row.debtPayments,
      expenses: sum.expenses + row.expenses,
      moneyLeft: sum.moneyLeft + row.moneyLeft,
    }),
    { cash: 0, terminal: 0, card: 0, playstation: 0, debtPayments: 0, expenses: 0, moneyLeft: 0 },
  );

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-950"
        >
          <ArrowLeft size={17} />
          {t('backToDashboard')}
        </button>
        <h1 className="text-2xl font-bold text-gray-950 sm:text-3xl">{t('gameClubMoneyCalculation')}</h1>
        <p className="mt-1 text-sm font-medium text-gray-600">
          {t('gameClubMoneyCalculationDesc')} · {formatDateShort(from, locale)} – {formatDateShort(to, locale)}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error === 'loadError' ? t('loadError') : error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm font-semibold text-gray-500">{t('loading')}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm font-semibold text-gray-500">{t('noGameClubMoneyData')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-3">{t('date')}</th>
                  <th className="px-3 py-3 text-right">{t('cash')}</th>
                  <th className="px-3 py-3 text-right">{t('terminal')}</th>
                  <th className="px-3 py-3 text-right">{t('card')}</th>
                  <th className="px-3 py-3 text-right">{t('playstation')}</th>
                  <th className="px-3 py-3 text-right">{t('debtPaymentsCollected')}</th>
                  <th className="px-3 py-3">{t('expenseDetails')}</th>
                  <th className="px-3 py-3 text-right">{t('gameClubPaidExpenses')}</th>
                  <th className="px-3 py-3 text-right">{t('moneyLeftForDay')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {rows.map((row) => (
                  <tr key={row.date} className="align-top">
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-gray-950">{formatDateShort(row.date, locale)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">{formatNumber(row.cash, locale)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">{formatNumber(row.terminal, locale)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">{formatNumber(row.card, locale)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">{formatNumber(row.playstation, locale)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">{row.debtPayments ? formatNumber(row.debtPayments, locale) : '—'}</td>
                    <td className="max-w-72 px-3 py-3 text-xs leading-5">{row.expenseDetails.length ? row.expenseDetails.join(', ') : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-red-600">{row.expenses ? `− ${formatNumber(row.expenses, locale)}` : '—'}</td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right font-bold ${row.moneyLeft < 0 ? 'text-red-600' : 'text-green-700'}`}>{formatNumber(row.moneyLeft, locale)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-emerald-50 font-bold text-gray-950">
                <tr>
                  <td className="px-3 py-3">{t('total')}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(totals.cash, locale)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(totals.terminal, locale)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(totals.card, locale)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(totals.playstation, locale)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(totals.debtPayments, locale)}</td>
                  <td />
                  <td className="px-3 py-3 text-right text-red-600">− {formatNumber(totals.expenses, locale)}</td>
                  <td className={`px-3 py-3 text-right ${totals.moneyLeft < 0 ? 'text-red-600' : 'text-green-700'}`}>{formatNumber(totals.moneyLeft, locale)} UZS</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
