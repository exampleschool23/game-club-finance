'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PeriodTabs } from '@/components/dashboard/PeriodTabs';
import {
  RecentTransactionsTable,
  type RecentTransactionRow,
} from '@/components/dashboard/RecentTransactionsTable';
import { createClient } from '@/lib/supabase/client';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { useClub, useDashboardDate } from '@/components/layout/DashboardShell';
import { formatDateOnly, formatTime } from '@/lib/formatters';
import { todayIso } from '@/lib/utils';
import {
  getDashboardRange,
  type DailyCashRow,
  type DashboardPeriod,
  type ExpenseRow,
  type StockCountRow,
} from '@/lib/calculations/dashboardMetrics';

const PAGE_SIZE = 12;

interface StockPurchaseRow {
  id: string;
  date: string;
  quantity: number;
  cost_price: number;
  comment: string | null;
  created_at: string;
  products?: { name: string } | { name: string }[] | null;
}

interface DebtRow {
  id: string;
  person_name: string;
}

interface DebtPaymentRow {
  id: string;
  debt_id: string;
  date: string;
  amount: number;
  created_at: string;
}

type TransactionDescriptionKey =
  | 'cashIncomeDesc'
  | 'terminalIncomeDesc'
  | 'cardIncomeDesc'
  | 'playstationIncomeDesc'
  | 'barSalesDesc'
  | 'productPurchaseDesc'
  | 'debtPaymentSuffix'
  | 'debtPayment'
  | `expenseCategory:${string}`;

interface RawTransactionRow extends Omit<RecentTransactionRow, 'dateKey' | 'date' | 'description' | 'time'> {
  description?: string;
  descriptionKey?: TransactionDescriptionKey;
  productName?: string | null;
  debtName?: string;
  expenseComment?: string | null;
  dateValue?: string | null;
  timeValue?: string | null;
}

function productName(relation: StockPurchaseRow['products']): string | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0]?.name ?? null : relation.name;
}

function transactionTimeMs(row: RawTransactionRow): number {
  if (!row.timeValue) return 0;
  const parsed = Date.parse(row.timeValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

function transactionDateKey(row: RawTransactionRow): string {
  if (row.dateValue) return row.dateValue;
  if (!row.timeValue) return '';
  const parsed = new Date(row.timeValue);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function compareTransactions(a: RawTransactionRow, b: RawTransactionRow): number {
  const dateCompare = transactionDateKey(b).localeCompare(transactionDateKey(a));
  if (dateCompare !== 0) return dateCompare;
  return transactionTimeMs(b) - transactionTimeMs(a);
}

function buildBarSaleTransactions(stockRows: StockCountRow[]): RawTransactionRow[] {
  const rowsByDate = stockRows.reduce((dateMap, row) => {
    const current = dateMap.get(row.date) ?? { amount: 0, timeValue: null as string | null };
    const rowTimeMs = row.updated_at ? Date.parse(row.updated_at) : 0;
    const currentTimeMs = current.timeValue ? Date.parse(current.timeValue) : 0;

    dateMap.set(row.date, {
      amount: current.amount + Number(row.bar_income ?? 0),
      timeValue: rowTimeMs > currentTimeMs ? row.updated_at ?? null : current.timeValue,
    });

    return dateMap;
  }, new Map<string, { amount: number; timeValue: string | null }>());

  return Array.from(rowsByDate, ([date, row]) => ({
    id: `bar-${date}`,
    type: 'Income' as const,
    descriptionKey: 'barSalesDesc' as const,
    amount: row.amount,
    dateValue: date,
    timeValue: row.timeValue,
  })).filter((row) => row.amount > 0);
}

function inRangeQuery<T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(
  query: T,
  range: { from: string; to: string },
): T {
  return query.gte('date', range.from).lte('date', range.to);
}

export default function RecentTransactionsPage() {
  const t = useTranslations('dashboard');
  const te = useTranslations('expenses');
  const { locale } = useAppLocale();
  const { selectedDate } = useDashboardDate();
  const { selectedClubId, businessDayStartHour } = useClub();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customFrom, setCustomFrom] = useState(() => businessToday);
  const [customTo, setCustomTo] = useState(() => businessToday);
  const [rows, setRows] = useState<RawTransactionRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const range = useMemo(
    () => getDashboardRange(period, selectedDate || businessToday, { from: customFrom, to: customTo }),
    [businessToday, customFrom, customTo, period, selectedDate],
  );

  useEffect(() => {
    setCustomFrom(businessToday);
    setCustomTo(businessToday);
  }, [businessToday, selectedClubId]);

  useEffect(() => {
    setPage(1);
  }, [range.from, range.to, selectedClubId]);

  const fetchTransactions = useCallback(async () => {
    if (!selectedClubId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const supabase = createClient();

    const [cashRes, stockRes, expenseRes, purchaseRes, debtsRes, debtPaymentsRes] = await Promise.all([
      inRangeQuery(
        supabase
          .from('daily_cash_entries')
          .select('date,cash_income,terminal_income,card_income,playstation_income,created_at')
          .eq('club_id', selectedClubId),
        range,
      ),
      inRangeQuery(
        supabase
          .from('daily_stock_counts')
          .select('date,bar_income,bar_profit,bar_cost,sold_quantity,updated_at')
          .eq('club_id', selectedClubId),
        range,
      ),
      inRangeQuery(
        supabase
          .from('expenses')
          .select('id,date,amount,category,payment_source,comment,created_at')
          .eq('club_id', selectedClubId),
        range,
      ),
      inRangeQuery(
        supabase
          .from('stock_purchases')
          .select('id,date,quantity,cost_price,comment,created_at,products(name)')
          .eq('club_id', selectedClubId),
        range,
      ),
      supabase
        .from('new_debts')
        .select('id,person_name')
        .eq('club_id', selectedClubId),
      inRangeQuery(
        supabase
          .from('debt_payments')
          .select('id,debt_id,date,amount,created_at')
          .eq('club_id', selectedClubId),
        range,
      ),
    ]);

    const firstError = [
      cashRes.error,
      stockRes.error,
      expenseRes.error,
      purchaseRes.error,
      debtsRes.error,
      debtPaymentsRes.error,
    ].find(Boolean);

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const cashRows = (cashRes.data ?? []) as DailyCashRow[];
    const stockRows = (stockRes.data ?? []) as StockCountRow[];
    const expenseRows = (expenseRes.data ?? []) as ExpenseRow[];
    const purchases = (purchaseRes.data ?? []) as unknown as StockPurchaseRow[];
    const debts = (debtsRes.data ?? []) as DebtRow[];
    const debtPayments = (debtPaymentsRes.data ?? []) as DebtPaymentRow[];
    const debtNameById = new Map(debts.map((debt) => [debt.id, debt.person_name]));

    const transactions = ([
      ...cashRows.flatMap((row) => {
        const createdAt = row.created_at ?? `${row.date}T00:00:00`;
        return [
          row.cash_income > 0
            ? {
                id: `cash-${row.date}`,
                type: 'Income' as const,
                descriptionKey: 'cashIncomeDesc' as const,
                amount: row.cash_income,
                dateValue: row.date,
                timeValue: createdAt,
              }
            : null,
          row.terminal_income > 0
            ? {
                id: `terminal-${row.date}`,
                type: 'Income' as const,
                descriptionKey: 'terminalIncomeDesc' as const,
                amount: row.terminal_income,
                dateValue: row.date,
                timeValue: createdAt,
              }
            : null,
          row.card_income > 0
            ? {
                id: `card-${row.date}`,
                type: 'Income' as const,
                descriptionKey: 'cardIncomeDesc' as const,
                amount: row.card_income,
                dateValue: row.date,
                timeValue: createdAt,
              }
            : null,
          (row.playstation_income ?? 0) > 0
            ? {
                id: `playstation-${row.date}`,
                type: 'Income' as const,
                descriptionKey: 'playstationIncomeDesc' as const,
                amount: row.playstation_income ?? 0,
                dateValue: row.date,
                timeValue: createdAt,
              }
            : null,
        ];
      }),
      ...buildBarSaleTransactions(stockRows),
      ...expenseRows.map((row) => ({
        id: `expense-${row.id}`,
        type: 'Expense' as const,
        descriptionKey: `expenseCategory:${row.category}` as const,
        expenseComment: row.comment,
        amount: row.amount,
        dateValue: row.date,
        timeValue: row.created_at,
      })),
      ...purchases.map((row) => ({
        id: `purchase-${row.id}`,
        type: 'Purchase' as const,
        descriptionKey: 'productPurchaseDesc' as const,
        productName: productName(row.products),
        amount: Number(row.quantity ?? 0) * Number(row.cost_price ?? 0),
        dateValue: row.date,
        timeValue: row.created_at,
      })),
      ...debtPayments.map((row) => ({
        id: `debt-payment-${row.id}`,
        type: 'Debt Payment' as const,
        descriptionKey: debtNameById.get(row.debt_id) ? 'debtPaymentSuffix' as const : 'debtPayment' as const,
        debtName: debtNameById.get(row.debt_id),
        amount: row.amount,
        dateValue: row.date,
        timeValue: row.created_at,
      })),
    ] as Array<RawTransactionRow | null>)
      .filter((row): row is RawTransactionRow => Boolean(row))
      .sort(compareTransactions);

    setRows(transactions);
    setLoading(false);
  }, [range, selectedClubId]);

  useEffect(() => {
    fetchTransactions().catch((fetchError) => {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      setLoading(false);
    });
  }, [fetchTransactions]);

  const formattedRows = rows.map((row): RecentTransactionRow => {
    const { descriptionKey, productName: rowProductName, debtName, expenseComment, dateValue, timeValue, ...base } = row;
    let description = row.description ?? (
      descriptionKey && !descriptionKey.startsWith('expenseCategory:') ? t(descriptionKey) : ''
    );

    if (descriptionKey?.startsWith('expenseCategory:')) {
      const category = descriptionKey.replace('expenseCategory:', '');
      const translationKey = `categories.${category}` as Parameters<typeof te>[0];
      const categoryLabel = te.has(translationKey) ? te(translationKey) : category.replace(/_/g, ' ');
      description = expenseComment ? `${categoryLabel} - ${expenseComment}` : categoryLabel;
    }

    if (descriptionKey === 'productPurchaseDesc' && rowProductName) {
      description = `${t('productPurchaseDesc')} - ${rowProductName}`;
    }

    if (descriptionKey === 'debtPaymentSuffix' && debtName) {
      description = `${debtName} ${t('debtPaymentSuffix')}`;
    }

    return {
      ...base,
      description,
      dateKey: transactionDateKey(row),
      date: dateValue ? formatDateOnly(dateValue, locale) : timeValue ? formatDateOnly(timeValue, locale) : '-',
      time: timeValue ? formatTime(timeValue, locale) : '-',
    };
  });

  const totalPages = Math.max(1, Math.ceil(formattedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = formattedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t('recentTransactions')} description={t('recentTransactionsDescription')} />

      <section className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <PeriodTabs
          value={period}
          onChange={setPeriod}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
      </section>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm font-semibold text-gray-500">
          {t('loading')}
        </div>
      ) : (
        <>
          <RecentTransactionsTable rows={pageRows} />
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-gray-600">
              {t('transactionPage', { page: currentPage, total: totalPages, count: formattedRows.length })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft size={16} />
                {t('previousPage')}
              </button>
              <button
                type="button"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                {t('nextPage')}
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
