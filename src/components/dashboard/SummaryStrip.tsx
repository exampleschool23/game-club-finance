'use client';

import type { ElementType } from 'react';
import { formatCurrency } from '@/lib/utils';

interface SummaryItem {
  label: string;
  value: number | string;
  helper?: string;
  icon: ElementType;
  iconBgClassName: string;
  iconClassName: string;
  isCurrency?: boolean;
}

interface SummaryStripProps {
  items: SummaryItem[];
}

export function SummaryStrip({ items }: SummaryStripProps) {
  return (
    <section className="grid grid-cols-1 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="flex items-center gap-4 p-5">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.iconBgClassName}`}>
              <Icon size={21} className={item.iconClassName} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-600">{item.label}</p>
              <p className="mt-1 text-xl font-bold text-gray-950">
                {typeof item.value === 'number' && item.isCurrency
                  ? `${formatCurrency(item.value)} UZS`
                  : item.value}
              </p>
              {item.helper && <p className="text-xs font-medium text-gray-500">{item.helper}</p>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
