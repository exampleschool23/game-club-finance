'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Card, EmptyState } from '@/components/PresentationFoundation';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

/** Card wrapper shared by every dashboard chart; the section is named by its heading. */
export function ChartCard({ title, description, action, className, children }: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <Card as="section" className={className} aria-labelledby={headingId}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id={headingId} className="text-base font-bold text-gray-950">{title}</h2>
          {description && <p className="mt-1 text-sm font-medium text-gray-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** Dot + name + amount legend row used under pie charts. */
export function ChartLegend({ items, total }: {
  items: Array<{ key: string; name: string; value: number; color: string }>;
  total: number;
}) {
  const currency = useTranslations('common')('currency');
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
        return (
          <li key={item.key} className="flex items-start gap-3 text-sm">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-gray-900">{item.name}</p>
              <p className="text-gray-600">{formatCurrency(item.value)} {currency} ({pct}%)</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Big total tile shown next to a pie. */
export function ChartTotal({ value, label, tone = 'neutral' }: { value: number; label: string; tone?: 'neutral' | 'danger' | 'success' }) {
  const styles = {
    neutral: 'bg-gray-50 text-gray-950 [&>p:last-child]:text-gray-500',
    danger: 'bg-danger-50 text-danger-600 [&>p:last-child]:text-danger-500',
    success: 'bg-success-50 text-success-600 [&>p:last-child]:text-success-600',
  };
  return (
    <div className={cn('rounded-lg p-3 text-center', styles[tone])}>
      <p className="text-xl font-bold tabular-nums">{formatCurrency(value)}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}

export function ChartEmpty({ title, className }: { title: string; className?: string }) {
  return <EmptyState compact title={title} className={cn('min-h-56 rounded-lg bg-gray-50', className)} />;
}

/** Horizontal bar list used by the income/expense and money-left charts. */
export function HorizontalBars({ data }: { data: Array<{ name: string; value: number; color: string }> }) {
  const currency = useTranslations('common')('currency');
  const maxValue = data.reduce((max, item) => Math.max(max, Math.abs(item.value)), 0);
  return (
    <ul className="space-y-3">
      {data.map((item) => {
        const width = maxValue > 0 ? `${(Math.abs(item.value) / maxValue) * 100}%` : '0%';
        const color = item.value < 0 ? '#ef4444' : item.color;
        return (
          <li key={item.name} className="space-y-2" aria-label={`${item.name}: ${formatCurrency(item.value)} ${currency}`}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <p className="min-w-0 break-words text-sm font-semibold leading-5 text-gray-900">{item.name}</p>
              </div>
              <p className={cn('shrink-0 text-sm font-bold tabular-nums', item.value < 0 ? 'text-danger-600' : 'text-gray-950')}>
                {formatCurrency(item.value)} {currency}
              </p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
              <div className="h-full rounded-full" style={{ width, minWidth: item.value === 0 ? undefined : '0.75rem', backgroundColor: color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// App locale -> BCP 47 tag for number formatting (matches src/lib/formatters.ts).
const NUMBER_LOCALES: Record<string, string> = {
  en: 'en-GB',
  ru: 'ru-RU',
  uz: 'uz-Latn-UZ',
};

const compactFormatters = new Map<string, Intl.NumberFormat>();

/** Compact axis tick label ("1.2M", "1,2 млн", ...) in the selected app language. */
export function formatAxis(value: number, locale: string): string {
  const tag = NUMBER_LOCALES[locale] ?? locale;
  let formatter = compactFormatters.get(tag);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 });
    } catch {
      formatter = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
    }
    compactFormatters.set(tag, formatter);
  }
  return formatter.format(value);
}
