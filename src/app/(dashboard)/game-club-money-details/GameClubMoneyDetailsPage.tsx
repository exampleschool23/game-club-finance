'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, CircleMinus, CirclePlus, Equal } from 'lucide-react';
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
  expenseDetails: Array<{ label: string; amount: number }>;
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
      expenseDetails: dayExpenses.map((row) => ({
        label: row.comment ? `${row.category}: ${row.comment}` : row.category,
        amount: Number(row.amount ?? 0),
      })),
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
  const totalCollected = totals.cash + totals.terminal + totals.card + totals.playstation + totals.debtPayments;

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600 shadow-sm transition hover:border-gray-300 hover:text-gray-950"
        >
          <ArrowLeft size={17} />
          {t('backToDashboard')}
        </button>
        <h1 className="text-2xl font-bold text-gray-950 sm:text-3xl">{t('gameClubMoneyCalculation')}</h1>
        <p className="mt-1 text-sm font-medium text-gray-600">{t('gameClubMoneyCalculationDesc')}</p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700">
          <CalendarDays size={15} />
          {formatDateShort(from, locale)} – {formatDateShort(to, locale)}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error === 'loadError' ? t('loadError') : error}
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-950 shadow-sm">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
            <div>
              <p className="text-sm font-bold text-emerald-700">{t('totalMoneyLeft')}</p>
              <p className={`mt-2 break-words text-3xl font-black tracking-tight sm:text-4xl ${totals.moneyLeft < 0 ? 'text-red-600' : 'text-gray-950'}`}>
                {formatNumber(totals.moneyLeft, locale)} <span className="text-lg font-bold text-gray-500">UZS</span>
              </p>
              <p className="mt-2 text-sm leading-5 text-gray-600">{t('totalMoneyLeftDesc')}</p>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 sm:gap-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                <CirclePlus size={18} className="text-emerald-600" />
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">{t('totalCollected')}</p>
                <p className="mt-1 break-words text-base font-black sm:text-xl">{formatNumber(totalCollected, locale)}</p>
              </div>
              <CircleMinus size={20} className="self-center text-gray-400" aria-hidden="true" />
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                <CircleMinus size={18} className="text-red-600" />
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">{t('gameClubPaidExpenses')}</p>
                <p className="mt-1 break-words text-base font-black sm:text-xl">{formatNumber(totals.expenses, locale)}</p>
              </div>
              <div className="col-span-3 flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-emerald-950">
                <Equal size={19} className="shrink-0" aria-hidden="true" />
                <span className="text-sm font-black">{t('moneyLeftForPeriod')}</span>
                <span className="ml-auto break-words text-right text-base font-black sm:text-lg">{formatNumber(totals.moneyLeft, locale)}</span>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm font-semibold text-gray-500 shadow-sm">{t('loading')}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm font-semibold text-gray-500 shadow-sm">{t('noGameClubMoneyData')}</div>
        ) : (
          rows.map((row) => (
            <article key={row.date} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <header className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex items-center gap-2">
                  <CalendarDays size={18} className="text-gray-500" />
                  <h2 className="text-base font-black text-gray-950">{formatDateShort(row.date, locale)}</h2>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="text-xs font-bold text-gray-500">{t('moneyLeftForDay')}</span>
                  <span className={`rounded-lg px-3 py-1.5 text-sm font-black ${row.moneyLeft < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {formatNumber(row.moneyLeft, locale)} UZS
                  </span>
                </div>
              </header>

              <div className="grid lg:grid-cols-2">
                <section className="p-4 sm:p-5 lg:border-r lg:border-gray-200">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-black text-gray-950">{t('totalCollected')}</h3>
                    <span className="text-sm font-black text-emerald-700">
                      + {formatNumber(row.cash + row.terminal + row.card + row.playstation + row.debtPayments, locale)}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[
                      [t('cash'), row.cash],
                      [t('terminal'), row.terminal],
                      [t('card'), row.card],
                      [t('playstation'), row.playstation],
                      [t('debtPaymentsCollected'), row.debtPayments],
                    ].map(([label, amount]) => (
                      <div key={String(label)} className="rounded-lg bg-emerald-50 p-3">
                        <dt className="text-xs font-semibold text-emerald-800">{label}</dt>
                        <dd className="mt-1 break-words text-sm font-black text-gray-950">{formatNumber(Number(amount), locale)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section className="border-t border-gray-200 p-4 sm:p-5 lg:border-t-0">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-black text-gray-950">{t('gameClubPaidExpenses')}</h3>
                    <span className="text-sm font-black text-red-600">− {formatNumber(row.expenses, locale)}</span>
                  </div>
                  {row.expenseDetails.length ? (
                    <div className="space-y-2">
                      {row.expenseDetails.map((expense, index) => (
                        <div key={`${expense.label}-${index}`} className="flex items-start justify-between gap-4 rounded-lg border border-red-100 bg-red-50/60 px-3 py-2.5">
                          <span className="min-w-0 text-sm font-semibold leading-5 text-gray-700">{expense.label}</span>
                          <span className="shrink-0 text-sm font-black text-red-600">− {formatNumber(expense.amount, locale)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-sm font-semibold text-gray-400">—</div>
                  )}
                </section>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
