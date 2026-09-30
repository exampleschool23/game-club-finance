'use client';

// Shared breakdown page for /bar-money-details and /game-club-money-details.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, CircleMinus, CirclePlus, Equal, RefreshCcw } from 'lucide-react';
import { usePathname } from 'next/navigation';
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
  StatTile,
} from '@/components/PresentationFoundation';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/formatters';
import { cn, todayIso } from '@/lib/utils';

/** Collected-money buckets; translated at render time so language changes never refetch. */
export type MoneyDetailCollectedKey = 'barSales' | 'cash' | 'terminal' | 'card' | 'playstation' | 'debtPayments';

export type MoneyDetailLine =
  | {
      kind: 'purchase';
      /** Product name, or the purchase comment when the product is gone. */
      name: string | null;
      quantity: number;
      amount: number;
    }
  | {
      kind: 'expense';
      /** Stored expense category: a known category key or custom text. */
      category: string;
      comment: string | null;
      amount: number;
    };

export interface MoneyDetailRow {
  date: string;
  /** Positive contributions, shown on the left. */
  collected: Array<{ key: MoneyDetailCollectedKey; amount: number }>;
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
  const pathname = usePathname();
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const te = useTranslations('expenses');
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
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const resultLabelClassName = variant === 'bar' ? 'text-orange-700' : 'text-success-600';

  useEffect(() => {
    setRange(requested);
  }, [requested]);

  const fetchDetails = useCallback(async (isCurrent: () => boolean) => {
    if (!selectedClubId) {
      setRows([]);
      setError(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);
    try {
      const next = await loadRows(selectedClubId, range.from, range.to);
      if (!isCurrent()) return;
      setRows(next);
    } catch {
      if (!isCurrent()) return;
      setError(true);
      setRows([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [loadRows, range.from, range.to, selectedClubId]);

  useEffect(() => {
    let cancelled = false;
    void fetchDetails(() => !cancelled);
    return () => { cancelled = true; };
  }, [fetchDetails, reloadToken]);

  function updateRange(next: { from: string; to: string }) {
    setRange(next);
    // Keep the URL shareable without a server round-trip (same as the dashboard).
    const params = new URLSearchParams({ from: next.from, to: next.to });
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
  }

  const backHref = `/?${new URLSearchParams({ from: range.from, to: range.to }).toString()}`;

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

  function collectedLabel(key: MoneyDetailCollectedKey): string {
    switch (key) {
      case 'barSales': return t('barSales');
      case 'cash': return t('cash');
      case 'terminal': return t('terminal');
      case 'card': return t('card');
      case 'playstation': return t('playstation');
      case 'debtPayments': return t('debtPaymentsCollected');
    }
  }

  function expenseCategoryLabel(category: string): string {
    const key = `categories.${category}`;
    return te.has(key) ? te(key as Parameters<typeof te>[0]) : category.replace(/_/g, ' ');
  }

  function deductionLabel(line: MoneyDetailLine): string {
    if (line.kind === 'purchase') return `${line.name ?? '—'} × ${formatNumber(line.quantity)}`;
    const category = expenseCategoryLabel(line.category);
    return line.comment ? `${category}: ${line.comment}` : category;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        back={backHref}
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

      {error ? (
        <InlineAlert
          variant="danger"
          action={(
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => setReloadToken((token) => token + 1)}
              icon={<RefreshCcw size={15} aria-hidden="true" />}
            >
              {tc('retry')}
            </Button>
          )}
        >
          {t('loadError')}
        </InlineAlert>
      ) : null}

      {loading ? (
        <DetailListSkeleton />
      ) : error ? null : rows.length === 0 ? (
        <Card><EmptyState icon={CalendarDays} title={labels.emptyLabel} /></Card>
      ) : (
        <>
          <Card as="section" padding="none" className="overflow-hidden rounded-2xl text-gray-950">
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
              <div>
                <p className={cn('text-sm font-bold', resultLabelClassName)}>{labels.resultLabel}</p>
                <p className={cn('mt-2 break-words text-3xl font-bold tracking-tight tabular-nums sm:text-4xl', totals.moneyLeft < 0 ? 'text-danger-600' : 'text-gray-950')}>
                  <Money amount={totals.moneyLeft} currencyClassName="text-lg text-gray-500" />
                </p>
                <p className="mt-2 text-sm leading-5 text-gray-600">{labels.resultDescription}</p>
                <Badge variant="neutral" className="mt-3 px-3 py-1.5 text-sm" icon={<CalendarDays size={15} aria-hidden="true" />}>
                  {formatDateShort(range.from, locale)} – {formatDateShort(range.to, locale)}
                </Badge>
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 sm:gap-3">
                <StatTile
                  variant="soft"
                  className="border border-gray-200"
                  icon={CirclePlus}
                  iconClassName="bg-success-50 text-success-600"
                  label={labels.collectedLabel}
                  value={formatCurrency(totals.collected)}
                  unit={tc('currency')}
                />
                <CircleMinus size={20} className="self-center text-gray-400" aria-hidden="true" />
                <StatTile
                  variant="soft"
                  className="border border-gray-200"
                  icon={CircleMinus}
                  iconClassName="bg-danger-50 text-danger-600"
                  label={labels.deductionsHint ? (
                    <>
                      {labels.deductionsLabel}
                      <span className="mt-0.5 block font-medium text-gray-500">{labels.deductionsHint}</span>
                    </>
                  ) : labels.deductionsLabel}
                  value={formatCurrency(totals.deductions)}
                  unit={tc('currency')}
                />
                <div
                  className={cn(
                    'col-span-3 flex items-center gap-2 rounded-xl px-4 py-3',
                    totals.moneyLeft < 0 ? 'bg-danger-50 text-danger-600' : 'bg-success-50 text-success-600',
                  )}
                >
                  <Equal size={19} className="shrink-0" aria-hidden="true" />
                  <span className="text-sm font-bold">{t('moneyLeftForPeriod')}</span>
                  <Money amount={totals.moneyLeft} className="ml-auto break-words text-right text-base font-bold sm:text-lg" />
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
                    <Badge variant={row.moneyLeft < 0 ? 'danger' : 'success'} className="rounded-lg px-3 py-1.5 text-sm font-bold tabular-nums">
                      <Money amount={row.moneyLeft} />
                    </Badge>
                  </div>
                </summary>

                <div className={cn('grid border-t border-gray-200', variant === 'bar' ? 'lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]' : 'lg:grid-cols-2')}>
                  <section className="p-4 sm:p-5 lg:border-r lg:border-gray-200">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-gray-950">{labels.collectedLabel}</h3>
                      <Money amount={row.collectedTotal} showPlus className="text-sm font-bold text-success-600" />
                    </div>
                    {row.collected.length === 1 ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-success-50 p-4">
                        <span className="text-sm font-bold text-success-600">{collectedLabel(row.collected[0].key)}</span>
                        <Money amount={row.collected[0].amount} showPlus className="text-base font-bold text-gray-950" />
                      </div>
                    ) : (
                      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {row.collected.map((item) => (
                          <div key={item.key} className="rounded-lg bg-success-50 p-3">
                            <dt className="text-xs font-semibold text-success-600">{collectedLabel(item.key)}</dt>
                            <dd className="mt-1 break-words text-sm font-bold text-gray-950">
                              <Money amount={item.amount} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>

                  <section className="border-t border-gray-200 p-4 sm:p-5 lg:border-t-0">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-gray-950">{labels.deductionsLabel}</h3>
                      <span className="text-sm font-bold text-danger-600">− <Money amount={row.deductionsTotal} /></span>
                    </div>
                    {row.deductions.length ? (
                      <div className="space-y-2">
                        {row.deductions.map((line, index) => {
                          const isPurchase = line.kind === 'purchase';
                          return (
                            <div
                              key={`${line.kind}-${index}`}
                              className={cn(
                                'flex items-start justify-between gap-4 rounded-lg border px-3 py-2.5',
                                isPurchase ? 'border-orange-100 bg-orange-50/70' : 'border-danger-50 bg-danger-50/60',
                              )}
                            >
                              <div className="min-w-0">
                                {variant === 'bar' && (
                                  <span className={cn('block text-[11px] font-bold uppercase tracking-wide', isPurchase ? 'text-orange-700' : 'text-danger-600')}>
                                    {isPurchase ? t('stockPurchases') : t('expenses')}
                                  </span>
                                )}
                                <span className="mt-0.5 block break-words text-sm font-semibold leading-5 text-gray-700">{deductionLabel(line)}</span>
                              </div>
                              <span className="shrink-0 text-sm font-bold text-danger-600">− <Money amount={line.amount} /></span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState compact bordered title={t('noDeductionsForDay')} className="py-5" />
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
