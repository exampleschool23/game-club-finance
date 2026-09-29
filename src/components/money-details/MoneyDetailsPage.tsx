'use client';

// Shared breakdown page for /bar-money-details and /game-club-money-details.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, CircleMinus, CirclePlus, Equal } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { useClub } from '@/components/layout/DashboardShell';
import {
  Badge,
  Button,
  Card,
  DateRangePicker,
  DetailListSkeleton,
  EmptyState,
  InlineAlert,
  Money,
  PageHeader,
} from '@/components/PresentationFoundation';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { cn, todayIso } from '@/lib/utils';

export interface MoneyDetailLine {
  label: string;
  amount: number;
  /** Category chip shown above the label (e.g. "Stock purchases"). */
  kind?: string;
  tone?: 'orange' | 'danger';
}

export interface MoneyDetailRow {
  date: string;
  /** Positive contributions, shown on the left. */
  collected: Array<{ label: string; amount: number }>;
  collectedTotal: number;
  deductions: MoneyDetailLine[];
  deductionsTotal: number;
  moneyLeft: number;
}

export interface MoneyDetailsPageProps {
  variant: 'bar' | 'gameClub';
  requestedFrom?: string;
  requestedTo?: string;
  /** Loads rows for a club and range; must resolve with rows sorted by date. */
  loadRows: (clubId: string, from: string, to: string) => Promise<MoneyDetailRow[]>;
  labels: {
    title: string;
    description: string;
    resultLabel: string;
    resultDescription: string;
    collectedLabel: string;
    deductionsLabel: string;
    deductionsHint?: string;
    emptyLabel: string;
  };
}

function validDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function inRangeQuery<T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(
  query: T,
  from: string,
  to: string,
): T {
  return query.gte('date', from).lte('date', to);
}

export default function MoneyDetailsPage({ variant, requestedFrom, requestedTo, loadRows, labels }: MoneyDetailsPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('dashboard');
  const { locale } = useAppLocale();
  const { selectedClubId, businessDayStartHour } = useClub();
  const fallbackDate = useMemo(() => todayIso(new Date(), businessDayStartHour), [businessDayStartHour]);
  const requested = useMemo(() => {
    const from = validDate(requestedFrom) ? requestedFrom : fallbackDate;
    const to = validDate(requestedTo) ? requestedTo : fallbackDate;
    return from <= to ? { from, to } : { from: to, to: from };
  }, [fallbackDate, requestedFrom, requestedTo]);
  const [range, setRange] = useState(requested);
  const [rows, setRows] = useState<MoneyDetailRow[]>([]);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const accent = variant === 'bar'
    ? { text: 'text-orange-700', result: 'bg-orange-300 text-orange-950' }
    : { text: 'text-emerald-700', result: 'bg-emerald-400 text-emerald-950' };

  useEffect(() => {
    setRange(requested);
  }, [requested]);

  const fetchDetails = useCallback(async (isCurrent: () => boolean) => {
    if (!selectedClubId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const next = await loadRows(selectedClubId, range.from, range.to);
      if (!isCurrent()) return;
      setRows(next);
    } catch (loadError) {
      if (!isCurrent()) return;
      setError(loadError instanceof Error && loadError.message ? loadError.message : t('loadError'));
      setRows([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [loadRows, range.from, range.to, selectedClubId, t]);

  useEffect(() => {
    let cancelled = false;
    void fetchDetails(() => !cancelled);
    return () => { cancelled = true; };
  }, [fetchDetails]);

  function updateRange(next: { from: string; to: string }) {
    setRange(next);
    const params = new URLSearchParams({ from: next.from, to: next.to });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const totals = rows.reduce(
    (sum, row) => ({
      collected: sum.collected + row.collectedTotal,
      deductions: sum.deductions + row.deductionsTotal,
      moneyLeft: sum.moneyLeft + row.moneyLeft,
    }),
    { collected: 0, deductions: 0, moneyLeft: 0 },
  );
  const allRowsExpanded = rows.length > 0 && rows.every((row) => expandedDates.has(row.date));

  function toggleDate(date: string) {
    setExpandedDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function toggleAllDates() {
    setExpandedDates(allRowsExpanded ? new Set() : new Set(rows.map((row) => row.date)));
  }

  const summaryTile = (icon: ReactNode, label: string, amount: number, hint?: string) => (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
      {icon}
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 break-words text-base font-bold tabular-nums sm:text-xl">{formatCurrency(amount)}</p>
      {hint && <p className="mt-1 text-xs font-semibold text-gray-600">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        back="/"
        backLabel={t('backToDashboard')}
        title={labels.title}
        description={labels.description}
        action={(
          <DateRangePicker
            from={range.from}
            to={range.to}
            fromLabel={t('from')}
            toLabel={t('to')}
            max={fallbackDate}
            onChange={updateRange}
            className="sm:w-80"
          />
        )}
      />

      {error ? <InlineAlert variant="danger">{error}</InlineAlert> : null}

      {loading ? (
        <DetailListSkeleton />
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={CalendarDays} title={labels.emptyLabel} /></Card>
      ) : (
        <>
          <Card as="section" padding="none" className="overflow-hidden rounded-2xl text-gray-950">
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
              <div>
                <p className={cn('text-sm font-bold', accent.text)}>{labels.resultLabel}</p>
                <p className={cn('mt-2 break-words text-3xl font-bold tracking-tight tabular-nums sm:text-4xl', totals.moneyLeft < 0 ? 'text-danger-600' : 'text-gray-950')}>
                  <Money amount={totals.moneyLeft} currencyClassName="text-lg text-gray-500" />
                </p>
                <p className="mt-2 text-sm leading-5 text-gray-600">{labels.resultDescription}</p>
                <Badge variant="neutral" className="mt-3 px-3 py-1.5 text-sm" icon={<CalendarDays size={15} aria-hidden="true" />}>
                  {formatDateShort(range.from, locale)} – {formatDateShort(range.to, locale)}
                </Badge>
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 sm:gap-3">
                {summaryTile(<CirclePlus size={18} className="text-emerald-600" aria-hidden="true" />, labels.collectedLabel, totals.collected)}
                <CircleMinus size={20} className="self-center text-gray-400" aria-hidden="true" />
                {summaryTile(<CircleMinus size={18} className="text-danger-600" aria-hidden="true" />, labels.deductionsLabel, totals.deductions, labels.deductionsHint)}
                <div className={cn('col-span-3 flex items-center gap-2 rounded-xl px-4 py-3', accent.result)}>
                  <Equal size={19} className="shrink-0" aria-hidden="true" />
                  <span className="text-sm font-bold">{t('moneyLeftForPeriod')}</span>
                  <span className="ml-auto break-words text-right text-base font-bold tabular-nums sm:text-lg">{formatCurrency(totals.moneyLeft)}</span>
                </div>
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAllDates}
              aria-expanded={allRowsExpanded}
              icon={<ChevronDown size={17} className={cn('transition-transform', allRowsExpanded && 'rotate-180')} aria-hidden="true" />}
            >
              {allRowsExpanded ? t('collapseAll') : t('expandAll')}
            </Button>
          </div>

          <section className="space-y-3">
            {rows.map((row) => (
              <details key={row.date} open={expandedDates.has(row.date)} className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <summary
                  onClick={(event) => { event.preventDefault(); toggleDate(row.date); }}
                  className="flex cursor-pointer list-none flex-col gap-3 bg-gray-50 px-4 py-3 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 sm:flex-row sm:items-center sm:justify-between sm:px-5 [&::-webkit-details-marker]:hidden"
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays size={18} className="text-gray-500" aria-hidden="true" />
                    <span className="text-base font-bold text-gray-950">{formatDateShort(row.date, locale)}</span>
                    <ChevronDown size={18} className="text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-xs font-bold text-gray-500">{t('moneyLeftForDay')}</span>
                    <span className={cn('rounded-lg px-3 py-1.5 text-sm font-bold tabular-nums', row.moneyLeft < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700')}>
                      <Money amount={row.moneyLeft} />
                    </span>
                  </div>
                </summary>

                <div className={cn('grid border-t border-gray-200', variant === 'bar' ? 'lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]' : 'lg:grid-cols-2')}>
                  <section className="p-4 sm:p-5 lg:border-r lg:border-gray-200">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-gray-950">{labels.collectedLabel}</h3>
                      <span className="text-sm font-bold tabular-nums text-emerald-700">+ {formatCurrency(row.collectedTotal)}</span>
                    </div>
                    {row.collected.length === 1 ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 p-4">
                        <span className="text-sm font-bold text-emerald-800">{row.collected[0].label}</span>
                        <span className="text-base font-bold tabular-nums text-gray-950">+ {formatCurrency(row.collected[0].amount)}</span>
                      </div>
                    ) : (
                      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {row.collected.map((item) => (
                          <div key={item.label} className="rounded-lg bg-emerald-50 p-3">
                            <dt className="text-xs font-semibold text-emerald-800">{item.label}</dt>
                            <dd className="mt-1 break-words text-sm font-bold tabular-nums text-gray-950">{formatCurrency(item.amount)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>

                  <section className="border-t border-gray-200 p-4 sm:p-5 lg:border-t-0">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-gray-950">{labels.deductionsLabel}</h3>
                      <span className="text-sm font-bold tabular-nums text-danger-600">− {formatCurrency(row.deductionsTotal)}</span>
                    </div>
                    {row.deductions.length ? (
                      <div className="space-y-2">
                        {row.deductions.map((line, index) => (
                          <div
                            key={`${line.label}-${index}`}
                            className={cn(
                              'flex items-start justify-between gap-4 rounded-lg border px-3 py-2.5',
                              line.tone === 'orange' ? 'border-orange-100 bg-orange-50/70' : 'border-red-100 bg-red-50/60',
                            )}
                          >
                            <div className="min-w-0">
                              {line.kind && (
                                <span className={cn('block text-[11px] font-bold uppercase tracking-wide', line.tone === 'orange' ? 'text-orange-700' : 'text-red-700')}>
                                  {line.kind}
                                </span>
                              )}
                              <span className="mt-0.5 block text-sm font-semibold leading-5 text-gray-700">{line.label}</span>
                            </div>
                            <span className="shrink-0 text-sm font-bold tabular-nums text-danger-600">− {formatCurrency(line.amount)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState compact bordered title="—" className="py-5" />
                    )}
                  </section>
                </div>
              </details>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
