'use client';

import type { ElementType } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

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
  helper?: string;
}

export function MetricCard({
  label,
  amount,
  icon: Icon,
  iconBgClassName,
  iconClassName,
  comparison,
  helper,
}: MetricCardProps) {
  const isPositive = (comparison?.value ?? 0) >= 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBgClassName}`}>
          <Icon size={22} className={iconClassName} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-600">{label}</p>
          <p className="mt-2 text-2xl font-bold leading-tight text-gray-950">
            {formatCurrency(amount)}
          </p>
          <p className="text-sm font-medium text-gray-600">UZS</p>
        </div>
      </div>
      {comparison ? (
        <p
          className={`mt-4 flex items-center gap-1 text-xs font-semibold ${
            isPositive ? 'text-green-600' : 'text-red-500'
          }`}
        >
          {isPositive ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
          {Math.abs(comparison.value)}% <span className="font-medium text-gray-500">{comparison.label}</span>
        </p>
      ) : helper ? (
        <p className="mt-4 text-xs font-medium text-gray-500">{helper}</p>
      ) : null}
    </div>
  );
}
