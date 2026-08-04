'use client';

import { Calendar, CalendarDays, CalendarRange, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useAppLocale } from '@/components/i18n/AppLocaleContext';
import { formatDatePickerValue } from '@/lib/formatters';
import type { DashboardPeriod } from '@/lib/calculations/dashboardMetrics';

interface PeriodTabsProps {
  value: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
}

function RangeDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { locale } = useAppLocale();

  return (
    <label className="min-w-0 flex-1">
      <span className="mb-1 block text-xs font-semibold text-gray-500">{label}</span>
      <span className="relative block h-10 cursor-pointer">
        <input
          type="date"
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          value={value}
          onClick={(event) => event.currentTarget.showPicker?.()}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="pointer-events-none flex h-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm shadow-sm transition peer-focus:border-primary-500 peer-focus:ring-2 peer-focus:ring-primary-100">
          <CalendarDays size={15} className="shrink-0 text-gray-500" />
          <span className="truncate font-semibold text-gray-950">{formatDatePickerValue(value, locale)}</span>
          <ChevronDown size={15} className="ml-auto shrink-0 text-gray-400" />
        </span>
      </span>
    </label>
  );
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
        <div className="grid gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:grid-cols-2 xl:max-w-xl">
          <RangeDateInput label={t('from')} value={customFrom} onChange={onCustomFromChange} />
          <RangeDateInput label={t('to')} value={customTo} onChange={onCustomToChange} />
        </div>
      )}
    </div>
  );
}
