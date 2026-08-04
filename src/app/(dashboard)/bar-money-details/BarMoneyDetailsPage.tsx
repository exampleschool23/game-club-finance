'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronDown, CircleMinus, CirclePlus, Equal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { useClub } from '@/components/layout/DashboardShell';
import { STOCK_PURCHASE_DEDUCTION_START_DATE } from '@/lib/calculations/barMoney';
import { formatDateShort, formatNumber } from '@/lib/formatters';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { createClient } from '@/lib/supabase/client';
import { todayIso } from '@/lib/utils';

interface StockRow {
  date: string;
  bar_income: number;
}

interface PurchaseRow {
  date: string;
  quantity: number;
  cost_price: number;
  comment: string | null;
  products?: { name: string } | { name: string }[] | null;
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
  sales: number;
  purchases: number;
  purchaseDetails: Array<{ label: string; amount: number }>;
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

function buildDailyRows(stockRows: StockRow[], purchaseRows: PurchaseRow[], expenseRows: ExpenseRow[]): DailyRow[] {
  const dates = new Set<string>();
  stockRows.forEach((row) => dates.add(row.date));
  purchaseRows.forEach((row) => dates.add(row.date));
  expenseRows.filter((row) => row.payment_source === 'bar').forEach((row) => dates.add(row.date));

  return Array.from(dates).sort().map((date) => {
    const sales = stockRows
      .filter((row) => row.date === date)
      .reduce((sum, row) => sum + Number(row.bar_income ?? 0), 0);
    const dayPurchases = purchaseRows.filter(
      (row) => row.date === date && date >= STOCK_PURCHASE_DEDUCTION_START_DATE,
    );
    const dayExpenses = expenseRows.filter(
      (row) => row.date === date && row.payment_source === 'bar',
    );
    const purchases = dayPurchases.reduce(
      (sum, row) => sum + Number(row.quantity ?? 0) * Number(row.cost_price ?? 0),
      0,
    );
    const expenses = dayExpenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

    return {
      date,
      sales,
      purchases,
      purchaseDetails: dayPurchases.map((row) => {
        const product = Array.isArray(row.products) ? row.products[0] : row.products;
        return {
          label: `${product?.name ?? row.comment ?? '—'} × ${Number(row.quantity ?? 0)}`,
          amount: Number(row.quantity ?? 0) * Number(row.cost_price ?? 0),
        };
      }),
      expenses,
      expenseDetails: dayExpenses.map((row) => ({
        label: row.comment ? `${row.category}: ${row.comment}` : row.category,
        amount: Number(row.amount ?? 0),
      })),
      moneyLeft: sales - purchases - expenses,
    };
  });
}

export default function BarMoneyDetailsPage({
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
    const [stockRes, purchaseRes, expenseRes] = await Promise.all([
      fetchAllRows<StockRow>(() =>
        inRangeQuery(
          supabase
            .from('daily_stock_counts')
            .select('date,bar_income')
            .eq('club_id', selectedClubId)
            .order('date', { ascending: true }),
          from,
          to,
        ),
      ),
      fetchAllRows<PurchaseRow>(() =>
        inRangeQuery(
          supabase
            .from('stock_purchases')
            .select('date,quantity,cost_price,comment,products(name)')
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

    const firstError = [stockRes.error, purchaseRes.error, expenseRes.error].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      setRows([]);
    } else {
      setRows(buildDailyRows(stockRes.data ?? [], purchaseRes.data ?? [], expenseRes.data ?? []));
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
      sales: sum.sales + row.sales,
      purchases: sum.purchases + row.purchases,
      expenses: sum.expenses + row.expenses,
      moneyLeft: sum.moneyLeft + row.moneyLeft,
    }),
    { sales: 0, purchases: 0, expenses: 0, moneyLeft: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600 shadow-sm transition hover:border-gray-300 hover:text-gray-950"
          >
            <ArrowLeft size={17} />
            {t('backToDashboard')}
          </button>
          <h1 className="text-2xl font-bold text-gray-950 sm:text-3xl">{t('barMoneyCalculation')}</h1>
          <p className="mt-1 text-sm font-medium text-gray-600">{t('barMoneyCalculationDesc')}</p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700">
            <CalendarDays size={15} />
            {formatDateShort(from, locale)} – {formatDateShort(to, locale)}
          </div>
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
              <p className="text-sm font-bold text-orange-700">{t('barMoneyLeft')}</p>
              <p className={`mt-2 break-words text-3xl font-black tracking-tight sm:text-4xl ${totals.moneyLeft < 0 ? 'text-red-600' : 'text-gray-950'}`}>
                {formatNumber(totals.moneyLeft, locale)} <span className="text-lg font-bold text-gray-500">UZS</span>
              </p>
              <p className="mt-2 text-sm leading-5 text-gray-600">{t('barMoneyLeftDesc')}</p>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 sm:gap-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                <CirclePlus size={18} className="text-emerald-600" />
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">{t('barSales')}</p>
                <p className="mt-1 break-words text-base font-black sm:text-xl">{formatNumber(totals.sales, locale)}</p>
              </div>
              <CircleMinus size={20} className="self-center text-gray-400" aria-hidden="true" />
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                <CircleMinus size={18} className="text-red-600" />
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">{t('totalDeductions')}</p>
                <p className="mt-1 break-words text-base font-black sm:text-xl">{formatNumber(totals.purchases + totals.expenses, locale)}</p>
                <p className="mt-1 text-xs font-semibold text-gray-600">{t('stockPurchases')} + {t('expenses')}</p>
              </div>
              <div className="col-span-3 flex items-center gap-2 rounded-xl bg-orange-300 px-4 py-3 text-orange-950">
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
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm font-semibold text-gray-500 shadow-sm">{t('noBarMoneyData')}</div>
        ) : (
          rows.map((row) => (
            <details key={row.date} className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none flex-col gap-3 bg-gray-50 px-4 py-3 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 sm:flex-row sm:items-center sm:justify-between sm:px-5 [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2">
                  <CalendarDays size={18} className="text-gray-500" />
                  <h2 className="text-base font-black text-gray-950">{formatDateShort(row.date, locale)}</h2>
                  <ChevronDown size={18} className="text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="text-xs font-bold text-gray-500">{t('moneyLeftForDay')}</span>
                  <span className={`rounded-lg px-3 py-1.5 text-sm font-black ${row.moneyLeft < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {formatNumber(row.moneyLeft, locale)} UZS
                  </span>
                </div>
              </summary>

              <div className="grid border-t border-gray-200 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
                <section className="p-4 sm:p-5 lg:border-r lg:border-gray-200">
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 p-4">
                    <span className="text-sm font-bold text-emerald-800">{t('barSales')}</span>
                    <span className="text-base font-black text-gray-950">+ {formatNumber(row.sales, locale)}</span>
                  </div>
                </section>

                <section className="border-t border-gray-200 p-4 sm:p-5 lg:border-t-0">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-black text-gray-950">{t('totalDeductions')}</h3>
                    <span className="text-sm font-black text-red-600">− {formatNumber(row.purchases + row.expenses, locale)}</span>
                  </div>
                  {row.purchaseDetails.length || row.expenseDetails.length ? (
                    <div className="space-y-2">
                      {row.purchaseDetails.map((purchase, index) => (
                        <div key={`${purchase.label}-${index}`} className="flex items-start justify-between gap-4 rounded-lg border border-orange-100 bg-orange-50/70 px-3 py-2.5">
                          <div className="min-w-0">
                            <span className="block text-[11px] font-bold uppercase tracking-wide text-orange-700">{t('stockPurchases')}</span>
                            <span className="mt-0.5 block text-sm font-semibold leading-5 text-gray-700">{purchase.label}</span>
                          </div>
                          <span className="shrink-0 text-sm font-black text-red-600">− {formatNumber(purchase.amount, locale)}</span>
                        </div>
                      ))}
                      {row.expenseDetails.map((expense, index) => (
                        <div key={`${expense.label}-${index}`} className="flex items-start justify-between gap-4 rounded-lg border border-red-100 bg-red-50/60 px-3 py-2.5">
                          <div className="min-w-0">
                            <span className="block text-[11px] font-bold uppercase tracking-wide text-red-700">{t('expenses')}</span>
                            <span className="mt-0.5 block text-sm font-semibold leading-5 text-gray-700">{expense.label}</span>
                          </div>
                          <span className="shrink-0 text-sm font-black text-red-600">− {formatNumber(expense.amount, locale)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-sm font-semibold text-gray-400">—</div>
                  )}
                </section>
              </div>
            </details>
          ))
        )}
      </section>
    </div>
  );
}
