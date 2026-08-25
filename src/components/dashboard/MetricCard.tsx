'use client';

import type { ElementType } from 'react';
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

interface MetricCardProps {
  label: string;
  amount: number;
  icon: ElementType;
  iconBgClassName: string;
  iconClassName: string;
  comparison?: {
    value: number | null;
    label: string;
  };
  subMetric?: {
    label: string;
    amount: number | null;
    unavailableLabel?: string;
  };
  helper?: string;
  onClick?: () => void;
  actionLabel?: string;
  loading?: boolean;
}

export function MetricCard({
  label,
  amount,
  icon: Icon,
  iconBgClassName,
  iconClassName,
  comparison,
  subMetric,
  helper,
  onClick,
  actionLabel,
  loading = false,
}: MetricCardProps) {
  const isPositive = typeof comparison?.value === 'number' && comparison.value >= 0;

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`min-w-0 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm sm:p-5 ${
        onClick
          ? 'group cursor-pointer transition hover:border-gray-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
          : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBgClassName}`}>
          <Icon size={22} className={iconClassName} />
        </div>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-gray-600">{label}</p>
          {loading ? (
            <div className="mt-2 space-y-2" role="status" aria-label="Loading">
              <div className="h-7 w-32 max-w-full animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-12 animate-pulse rounded bg-gray-100" />
            </div>
          ) : (
            <>
              <p className="mt-2 break-words text-xl font-bold leading-tight text-gray-950 sm:text-2xl">
                {formatCurrency(amount)}
              </p>
              <p className="text-sm font-medium text-gray-600">UZS</p>
            </>
          )}
        </div>
      </div>
      {loading ? (
        <div className="mt-3 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-gray-100" />
        </div>
      ) : helper ? <p className="mt-3 text-xs font-medium leading-snug text-gray-500">{helper}</p> : null}
      {!loading && subMetric ? (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-500">{subMetric.label}</p>
          <p className="mt-1 break-words text-sm font-bold leading-tight text-gray-800">
            {subMetric.amount === null ? (
              subMetric.unavailableLabel ?? '—'
            ) : (
              <>
                {formatCurrency(subMetric.amount)} <span className="font-semibold text-gray-500">UZS</span>
              </>
            )}
          </p>
        </div>
      ) : null}
      {!loading && comparison ? (
        comparison.value === null ? (
          <p className="mt-3 text-xs font-medium text-gray-500">{comparison.label}</p>
        ) : (
          <p
            className={`mt-3 flex flex-wrap items-center gap-1 text-xs font-semibold ${
              isPositive ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {isPositive ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
            {Math.abs(comparison.value)}% <span className="font-medium text-gray-500">{comparison.label}</span>
          </p>
        )
      ) : null}
      {onClick && actionLabel ? (
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs font-bold text-green-700 transition group-hover:bg-green-100">
          {actionLabel}
          <ArrowRight size={14} aria-hidden="true" />
        </span>
      ) : null}
    </Wrapper>
  );
}
