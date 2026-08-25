'use client';

// Route: /reports

import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from 'react';
import {
  Banknote,
  CircleDollarSign,
  CreditCard,
  Gamepad2,
  Landmark,
  ReceiptText,
  WalletCards,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useClub } from '@/components/layout/DashboardShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { DateRangePicker } from '@/components/ui/CalendarPicker';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { buildMoneyReport, type MoneyReportPaymentBreakdown } from '@/lib/calculations/moneyReport';
import {
  getDashboardRange,
  type DailyCashRow,
  type DashboardPeriod,
  type DebtPaymentValueRow,
  type ExpenseRow,
} from '@/lib/calculations/dashboardMetrics';
import { formatCurrency, formatDateOnly } from '@/lib/formatters';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { todayIso } from '@/lib/utils';

type ReportPeriod = Extract<DashboardPeriod, 'today' | 'yesterday' | 'last7Days' | 'month' | 'custom'>;

const emptyReport = buildMoneyReport([], [], []);

function Amount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('tabular-nums', value < 0 && 'text-red-600', className)}>
      {formatCurrency(value)} UZS
    </span>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  iconBackground,
}: {
  label: string;
  value: number;
  icon: ElementType;
  iconClassName: string;
  iconBackground: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconBackground)}>
        <Icon size={20} className={iconClassName} aria-hidden="true" />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 break-words text-2xl font-extrabold tracking-tight text-gray-950">
        <Amount value={value} />
      </p>
    </div>
  );
}

function PaymentCard({
  label,
  data,
  icon: Icon,
  iconClassName,
  iconBackground,
  collectedLabel,
  expensesLabel,
  leftLabel,
}: {
  label: string;
  data: MoneyReportPaymentBreakdown;
  icon: ElementType;
  iconClassName: string;
  iconBackground: string;
  collectedLabel: string;
  expensesLabel: string;
  leftLabel: string;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', iconBackground)}>
            <Icon size={21} className={iconClassName} aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-gray-950">{label}</h3>
        </div>

        <div className="mt-5 space-y-3 text-sm">
          <div className="flex items-start justify-between gap-3 text-gray-600">
            <span>{collectedLabel}</span>
            <Amount value={data.collected} className="shrink-0 font-semibold text-gray-950" />
          </div>
          <div className="flex items-start justify-between gap-3 text-gray-600">
            <span>{expensesLabel}</span>
            <Amount value={data.expenses} className="shrink-0 font-semibold text-red-600" />
          </div>
        </div>
      </div>
      <div className={cn(
        'flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-5',
        data.left < 0 ? 'border-red-100 bg-red-50' : 'border-emerald-100 bg-emerald-50',
      )}>
        <span className={cn('text-sm font-bold', data.left < 0 ? 'text-red-700' : 'text-emerald-700')}>
          {leftLabel}
        </span>
        <Amount
          value={data.left}
          className={cn('shrink-0 text-base font-extrabold', data.left < 0 ? 'text-red-700' : 'text-emerald-700')}
        />
      </div>
    </article>
  );
}

export default function ReportsPage() {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const { locale } = useAppLocale();
  const { selectedClubId, businessDayStartHour } = useClub();
  const businessToday = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const [customFrom, setCustomFrom] = useState(() => businessToday);
  const [customTo, setCustomTo] = useState(() => businessToday);
  const [report, setReport] = useState(emptyReport);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  const range = useMemo(
    () => getDashboardRange(period, businessToday, { from: customFrom, to: customTo }),
    [businessToday, customFrom, customTo, period],
  );

  const loadReport = useCallback(async () => {
    const requestId = ++requestSequence.current;

    if (!selectedClubId) {
      setReport(emptyReport);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const supabase = createClient();
    const [cashResult, expenseResult, debtPaymentResult] = await Promise.all([
      fetchAllRows<DailyCashRow>(() => supabase
        .from('daily_cash_entries')
        .select('date,cash_income,terminal_income,card_income,playstation_income,created_at')
        .eq('club_id', selectedClubId)
        .gte('date', range.from)
        .lte('date', range.to)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })),
      fetchAllRows<ExpenseRow>(() => supabase
        .from('expenses')
        .select('id,date,amount,category,payment_method,payment_source,comment,created_at')
        .eq('club_id', selectedClubId)
        .gte('date', range.from)
        .lte('date', range.to)
        .order('date', { ascending: true })
        .order('id', { ascending: true })),
      fetchAllRows<DebtPaymentValueRow>(() => supabase
        .from('debt_payments')
        .select('id,date,amount,payment_method')
        .eq('club_id', selectedClubId)
        .gte('date', range.from)
        .lte('date', range.to)
        .order('date', { ascending: true })
        .order('id', { ascending: true })),
    ]);

    if (requestId !== requestSequence.current) return;

    const firstError = [cashResult.error, expenseResult.error, debtPaymentResult.error].find(Boolean);
    if (firstError) {
      setReport(emptyReport);
      setError(firstError.message);
      setLoading(false);
      return;
    }

    setReport(buildMoneyReport(
      (cashResult.data ?? []) as DailyCashRow[],
      (expenseResult.data ?? []) as ExpenseRow[],
      (debtPaymentResult.data ?? []) as DebtPaymentValueRow[],
    ));
    setLoading(false);
  }, [range.from, range.to, selectedClubId]);

  useEffect(() => {
    loadReport().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : tc('error'));
      setLoading(false);
    });
  }, [loadReport, tc]);

  useEffect(() => {
    setPeriod('today');
    setCustomFrom(businessToday);
    setCustomTo(businessToday);
  }, [businessToday, selectedClubId]);

  const periodOptions: Array<{ value: ReportPeriod; label: string }> = [
    { value: 'today', label: t('today') },
    { value: 'yesterday', label: t('yesterday') },
    { value: 'last7Days', label: t('last7Days') },
    { value: 'month', label: t('month') },
    { value: 'custom', label: t('custom') },
  ];
  const paymentCards = [
    {
      method: 'cash' as const,
      label: t('cash'),
      icon: Banknote,
      iconClassName: 'text-emerald-600',
      iconBackground: 'bg-emerald-50',
    },
    {
      method: 'terminal' as const,
      label: t('terminal'),
      icon: Landmark,
      iconClassName: 'text-blue-600',
      iconBackground: 'bg-blue-50',
    },
    {
      method: 'card' as const,
      label: t('card'),
      icon: CreditCard,
      iconClassName: 'text-violet-600',
      iconBackground: 'bg-violet-50',
    },
    {
      method: 'playstation' as const,
      label: t('playstation'),
      icon: Gamepad2,
      iconClassName: 'text-amber-600',
      iconBackground: 'bg-amber-50',
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={t('title')} description={t('description')} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap gap-2">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={period === option.value}
              onClick={() => setPeriod(option.value)}
              className={cn(
                'min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold transition sm:flex-none',
                period === option.value
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4 border-t border-gray-100 pt-4">
          <DateRangePicker
            from={range.from}
            to={range.to}
            fromLabel={t('from')}
            toLabel={t('to')}
            disabled={period !== 'custom'}
            className="max-w-3xl"
            onChange={(nextRange) => {
              setCustomFrom(nextRange.from);
              setCustomTo(nextRange.to);
            }}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          label={t('totalCollected')}
          value={report.totalCollected}
          icon={WalletCards}
          iconClassName="text-blue-600"
          iconBackground="bg-blue-50"
        />
        <SummaryCard
          label={t('expenses')}
          value={report.totalExpenses}
          icon={ReceiptText}
          iconClassName="text-red-600"
          iconBackground="bg-red-50"
        />
        <SummaryCard
          label={t('totalLeft')}
          value={report.totalLeft}
          icon={CircleDollarSign}
          iconClassName="text-emerald-600"
          iconBackground="bg-emerald-50"
        />
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-gray-950">{t('moneyLeftByPaymentMethod')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('moneyLeftDescription')}</p>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-56 animate-pulse rounded-xl border border-gray-200 bg-white" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {paymentCards.map((card) => (
              <PaymentCard
                key={card.method}
                label={card.label}
                icon={card.icon}
                iconClassName={card.iconClassName}
                iconBackground={card.iconBackground}
                data={report.paymentMethods[card.method]}
                collectedLabel={t('collected')}
                expensesLabel={t('expenses')}
                leftLabel={t('left')}
              />
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-4 sm:px-5">
          <h2 className="text-base font-bold text-gray-950">{t('dailyCloseout')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('dailyCloseoutDescription')}</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm font-semibold text-gray-500">{tc('loading')}</div>
        ) : report.days.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold text-gray-500">{t('noData')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left sm:px-5">{t('date')}</th>
                  <th className="px-4 py-3 text-right">{t('cash')}</th>
                  <th className="px-4 py-3 text-right">{t('terminal')}</th>
                  <th className="px-4 py-3 text-right">{t('card')}</th>
                  <th className="px-4 py-3 text-right">{t('playstation')}</th>
                  <th className="px-4 py-3 text-right sm:px-5">{t('totalLeft')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.days.map((day) => (
                  <tr key={day.date} className="hover:bg-gray-50/70">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-gray-900 sm:px-5">
                      {formatDateOnly(day.date, locale)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right"><Amount value={day.cash} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right"><Amount value={day.terminal} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right"><Amount value={day.card} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right"><Amount value={day.playstation} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-gray-950 sm:px-5">
                      <Amount value={day.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
