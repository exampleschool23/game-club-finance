'use client';

import { Calendar, CalendarDays, CalendarRange } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/ui/CalendarPicker';
import type { DashboardPeriod } from '@/lib/calculations/dashboardMetrics';

interface PeriodTabsProps {
  value: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
}

export function PeriodTabs({
  value,
  onChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: PeriodTabsProps) {
  const t = useTranslations('dashboard');

  const tabs = [
    { value: 'today' as const, label: t('today'), icon: CalendarDays },
    { value: 'yesterday' as const, label: t('yesterday'), icon: CalendarDays },
    { value: 'month' as const, label: t('thisMonth'), icon: Calendar },
    { value: 'lastMonth' as const, label: t('lastMonth'), icon: Calendar },
    { value: 'custom' as const, label: t('customRange'), icon: CalendarRange },
  ];

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = value === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={cn(
                'inline-flex min-h-10 min-w-[calc(50%-0.25rem)] flex-1 items-center justify-center gap-2 rounded-lg px-3 text-center text-xs font-semibold leading-tight transition sm:min-w-0 sm:flex-none sm:text-sm',
                active
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              )}
            >
              <Icon size={16} className="shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {value === 'custom' && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 xl:max-w-3xl">
          <DateRangePicker
            from={customFrom}
            to={customTo}
            fromLabel={t('from')}
            toLabel={t('to')}
            onChange={(range) => {
              onCustomFromChange(range.from);
              onCustomToChange(range.to);
            }}
          />
        </div>
      )}
    </div>
  );
}
