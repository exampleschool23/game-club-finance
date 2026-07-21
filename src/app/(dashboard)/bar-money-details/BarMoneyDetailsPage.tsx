'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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
  purchaseDetails: string[];
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
        return `${product?.name ?? row.comment ?? '—'} × ${Number(row.quantity ?? 0)}`;
      }),
      expenses,
      expenseDetails: dayExpenses.map((row) =>
        row.comment ? `${row.category}: ${row.comment}` : row.category,
      ),
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
      setError(fetchError instanceof Error ? fetchError.message : t('loadError'));
      setLoading(false);
    });
  }, [fetchDetails, t]);

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
            className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-950"
          >
            <ArrowLeft size={17} />
            {t('backToDashboard')}
          </button>
          <h1 className="text-2xl font-bold text-gray-950 sm:text-3xl">{t('barMoneyCalculation')}</h1>
          <p className="mt-1 text-sm font-medium text-gray-600">
            {t('barMoneyCalculationDesc')} · {formatDateShort(from, locale)} – {formatDateShort(to, locale)}
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm font-semibold text-gray-500">{t('loading')}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm font-semibold text-gray-500">{t('noBarMoneyData')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-3">{t('date')}</th>
                  <th className="px-3 py-3 text-right">{t('barSales')}</th>
                  <th className="px-3 py-3">{t('purchasedProducts')}</th>
                  <th className="px-3 py-3 text-right">{t('stockPurchases')}</th>
                  <th className="px-3 py-3">{t('barExpenseDetails')}</th>
                  <th className="px-3 py-3 text-right">{t('barPaidExpenses')}</th>
                  <th className="px-3 py-3 text-right">{t('moneyLeftForDay')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {rows.map((row) => (
                  <tr key={row.date} className="align-top">
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-gray-950">{formatDateShort(row.date, locale)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{formatNumber(row.sales, locale)}</td>
                    <td className="max-w-64 px-3 py-3 text-xs leading-5">{row.purchaseDetails.length ? row.purchaseDetails.join(', ') : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-red-600">{row.purchases ? `− ${formatNumber(row.purchases, locale)}` : '—'}</td>
                    <td className="max-w-64 px-3 py-3 text-xs leading-5">{row.expenseDetails.length ? row.expenseDetails.join(', ') : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-red-600">{row.expenses ? `− ${formatNumber(row.expenses, locale)}` : '—'}</td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right font-bold ${row.moneyLeft < 0 ? 'text-red-600' : 'text-green-700'}`}>{formatNumber(row.moneyLeft, locale)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-green-50 font-bold text-gray-950">
                <tr>
                  <td className="px-3 py-3">{t('total')}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(totals.sales, locale)}</td>
                  <td />
                  <td className="px-3 py-3 text-right text-red-600">− {formatNumber(totals.purchases, locale)}</td>
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
