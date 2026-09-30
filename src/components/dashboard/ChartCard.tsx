'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Card, EmptyState } from '@/components/PresentationFoundation';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

/**
 * Chart palette: the same hexes as the Tailwind tokens so Recharts (which
 * cannot read Tailwind classes) stays on the design system's colours.
 */
export const chartColors = {
  primary: '#2f52e0',
  success: '#12a36f',
  danger: '#e0453f',
  warning: '#e39a1e',
  purple: '#7c5cf2',
  orange: '#f07a2b',
  gray: '#98a2b3',
  axis: '#667085',
  grid: '#e3e7ee',
  cursor: '#f7f8fa',
} as const;

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
    <Card as="section" className={cn('flex flex-col', className)} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <h2 id={headingId} className="break-words text-sm font-semibold text-gray-950">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-5 text-gray-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** Dot + name + right-aligned amount legend row used under pie charts. */
export function ChartLegend({ items, total }: {
  items: Array<{ key: string; name: string; value: number; color: string }>;
  total: number;
}) {
  const currency = useTranslations('common')('currency');
  return (
    <ul className="divide-y divide-gray-100">
      {items.map((item) => {
        const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
        return (
          <li key={item.key} className="flex items-center gap-3 py-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
            <p className="min-w-0 flex-1 break-words text-gray-700">{item.name}</p>
            <p className="shrink-0 text-right font-semibold tabular-nums text-gray-950">
              {formatCurrency(item.value)}
              <span className="ml-1 text-xs font-medium text-gray-500">{currency}</span>
              <span className="ml-2 inline-block w-9 text-right text-xs font-medium tabular-nums text-gray-400">{pct}%</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** Plain big total shown above a chart: label, number, currency suffix on one line. */
export function ChartTotal({ value, label, tone = 'neutral', className }: {
  value: number;
  label: string;
  tone?: 'neutral' | 'danger' | 'success';
  className?: string;
}) {
  const currency = useTranslations('common')('currency');
  const toneClassName = {
    neutral: 'text-gray-950',
    danger: 'text-danger-600',
    success: 'text-success-600',
  };
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={cn('mt-1 break-words text-2xl font-bold leading-none tracking-tight tabular-nums', toneClassName[tone])}>
        {formatCurrency(value)}
        <span className="ml-1.5 text-sm font-medium tracking-normal text-gray-500">{currency}</span>
      </p>
    </div>
  );
}

export function ChartEmpty({ title, className }: { title: string; className?: string }) {
  return <EmptyState compact bordered title={title} className={cn('min-h-56 border-gray-200', className)} />;
}

/** Horizontal bar list used by the income/expense, expenses-by-category and money-left charts. */
export function HorizontalBars({ data }: { data: Array<{ name: string; value: number; color: string }> }) {
  const currency = useTranslations('common')('currency');
  const maxValue = data.reduce((max, item) => Math.max(max, Math.abs(item.value)), 0);
  return (
    <ul className="space-y-3">
      {data.map((item, index) => {
        const width = maxValue > 0 ? `${(Math.abs(item.value) / maxValue) * 100}%` : '0%';
        const color = item.value < 0 ? chartColors.danger : item.color;
        return (
          <li key={`${index}-${item.name}`} className="space-y-1.5" aria-label={`${item.name}: ${formatCurrency(item.value)} ${currency}`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 break-words text-sm leading-5 text-gray-700">{item.name}</p>
              <p className={cn('shrink-0 text-sm font-semibold tabular-nums', item.value < 0 ? 'text-danger-600' : 'text-gray-950')}>
                {formatCurrency(item.value)}
                <span className="ml-1 text-xs font-medium text-gray-500">{currency}</span>
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
              <div className="h-full rounded-full" style={{ width, minWidth: item.value === 0 ? undefined : '0.5rem', backgroundColor: color }} />
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
