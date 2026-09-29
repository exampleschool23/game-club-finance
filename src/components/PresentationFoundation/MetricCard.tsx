import type { ElementType, ReactNode } from 'react';
import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import { Skeleton } from './Skeleton';

export type MetricTone = 'default' | 'success' | 'danger' | 'primary' | 'warning' | 'muted';

export const metricToneClassName: Record<MetricTone, string> = {
  default: 'text-gray-950',
  success: 'text-success-600',
  danger: 'text-danger-500',
  primary: 'text-primary-700',
  warning: 'text-warning-600',
  muted: 'text-gray-500',
};

/** Pick success/danger colouring from the sign of a number. */
export function toneForAmount(amount: number, positive: MetricTone = 'success'): MetricTone {
  return amount < 0 ? 'danger' : positive;
}

export interface MetricCardProps {
  label: ReactNode;
  /** Already formatted value (money, count, percentage). */
  value: ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  tone?: MetricTone;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: ReactNode;
  helper?: ReactNode;
  loading?: boolean;
  className?: string;
}

/** Compact KPI card with a formatted value. */
export function MetricCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  tone = 'default',
  trend,
  trendLabel,
  helper,
  loading = false,
  className,
}: MetricCardProps) {
  return (
    <div className={cn('min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5', className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-gray-500">{label}</p>
          {loading ? (
            <div className="mt-2 space-y-2" role="status" aria-label="Loading">
              <Skeleton className="h-7 w-36 max-w-full" />
              <Skeleton className="h-3 w-20 bg-gray-100" />
            </div>
          ) : (
            <p className={cn('mt-1 break-words text-xl font-bold leading-tight tabular-nums sm:text-2xl', metricToneClassName[tone])}>
              {value}
            </p>
          )}
          {!loading && trendLabel && (
            <p
              className={cn('mt-1 text-xs font-medium', {
                'text-success-600': trend === 'up',
                'text-danger-500': trend === 'down',
                'text-gray-500': trend === 'neutral' || !trend,
              })}
            >
              {trendLabel}
            </p>
          )}
          {!loading && helper && <p className="mt-1 text-xs leading-5 text-gray-500">{helper}</p>}
        </div>
        {Icon && (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600', iconClassName)}>
            <Icon size={20} aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}

export interface AmountCardProps {
  label: string;
  amount: number;
  icon: ElementType;
  iconBgClassName: string;
  iconClassName: string;
  currency?: string;
  comparison?: { value: number | null; label: string };
  subMetric?: { label: string; amount: number | null; unavailableLabel?: string };
  helper?: string;
  loading?: boolean;
}

/** Dashboard-style money card with comparison and secondary metric. */
export function AmountCard({
  label,
  amount,
  icon: Icon,
  iconBgClassName,
  iconClassName,
  currency = 'UZS',
  comparison,
  subMetric,
  helper,
  loading = false,
}: AmountCardProps) {
  const isPositive = typeof comparison?.value === 'number' && comparison.value >= 0;

  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', iconBgClassName)}>
          <Icon size={22} className={iconClassName} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-gray-600">{label}</p>
          {loading ? (
            <div className="mt-2 space-y-2" role="status" aria-label="Loading">
              <Skeleton className="h-7 w-32 max-w-full" />
              <Skeleton className="h-3 w-12 bg-gray-100" />
            </div>
          ) : (
            <>
              <p className="mt-2 break-words text-xl font-bold leading-tight tabular-nums text-gray-950 sm:text-2xl">
                {formatCurrency(amount)}
              </p>
              <p className="text-sm font-medium text-gray-600">{currency}</p>
            </>
          )}
        </div>
      </div>
      {loading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3 w-full bg-gray-100" />
          <Skeleton className="h-3 w-3/4 bg-gray-100" />
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
                {formatCurrency(subMetric.amount)} <span className="font-semibold text-gray-500">{currency}</span>
              </>
            )}
          </p>
        </div>
      ) : null}
      {!loading && comparison ? (
        comparison.value === null ? (
          <p className="mt-3 text-xs font-medium text-gray-500">{comparison.label}</p>
        ) : (
          <p className={cn('mt-3 flex flex-wrap items-center gap-1 text-xs font-semibold', isPositive ? 'text-success-600' : 'text-danger-500')}>
            {isPositive ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />}
            {Math.abs(comparison.value)}% <span className="font-medium text-gray-500">{comparison.label}</span>
          </p>
        )
      ) : null}
    </div>
  );
}

export interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  tone?: MetricTone;
  icon?: LucideIcon;
  iconClassName?: string;
  /** flat: no border/shadow (inside another card). soft: tinted background. */
  variant?: 'card' | 'flat' | 'soft';
  size?: 'sm' | 'md';
  align?: 'left' | 'center';
  className?: string;
}

/** Small label/value tile for summaries inside cards and forms. */
export function StatTile({
  label,
  value,
  unit,
  tone = 'default',
  icon: Icon,
  iconClassName,
  variant = 'card',
  size = 'md',
  align = 'left',
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-lg',
        variant === 'card' && 'border border-gray-200 bg-white px-4 py-3',
        variant === 'soft' && 'bg-gray-50 px-4 py-3',
        align === 'center' && 'text-center',
        className,
      )}
    >
      <div className={cn('flex items-start gap-3', align === 'center' && 'justify-center')}>
        {Icon && (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600', iconClassName)}>
            <Icon size={18} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-500">{label}</p>
          <p className={cn('mt-1 break-words font-bold leading-tight tabular-nums', size === 'sm' ? 'text-base' : 'text-lg', metricToneClassName[tone])}>
            {value}
            {unit && <span className="ml-1 text-sm font-semibold text-gray-500">{unit}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
