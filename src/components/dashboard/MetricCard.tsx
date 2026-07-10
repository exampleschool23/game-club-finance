'use client';

import type { ElementType } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

interface MetricCardProps {
  label: string;
  amount: number;
  icon: ElementType;
  iconBgClassName: string;
  iconClassName: string;
  comparison?: {
    value: number;
    label: string;
  };
  subMetric?: {
    label: string;
    amount: number;
  };
  helper?: string;
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
}: MetricCardProps) {
  const isPositive = (comparison?.value ?? 0) >= 0;

  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBgClassName}`}>
          <Icon size={22} className={iconClassName} />
        </div>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-gray-600">{label}</p>
          <p className="mt-2 break-words text-xl font-bold leading-tight text-gray-950 sm:text-2xl">
            {formatCurrency(amount)}
          </p>
          <p className="text-sm font-medium text-gray-600">UZS</p>
        </div>
      </div>
      {helper && <p className="mt-3 text-xs font-medium leading-snug text-gray-500">{helper}</p>}
      {subMetric ? (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-500">{subMetric.label}</p>
          <p className="mt-1 break-words text-sm font-bold leading-tight text-gray-800">
            {formatCurrency(subMetric.amount)} <span className="font-semibold text-gray-500">UZS</span>
          </p>
        </div>
      ) : null}
      {comparison ? (
        <p
          className={`mt-3 flex flex-wrap items-center gap-1 text-xs font-semibold ${
            isPositive ? 'text-green-600' : 'text-red-500'
          }`}
        >
          {isPositive ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
          {Math.abs(comparison.value)}% <span className="font-medium text-gray-500">{comparison.label}</span>
        </p>
      ) : null}
    </div>
  );
}
