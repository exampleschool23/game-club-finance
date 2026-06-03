'use client';

import { CalendarDays, CalendarRange, Calendar } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type DashboardPeriod = 'today' | 'week' | 'month';

interface PeriodTabsProps {
  value: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
}

export function PeriodTabs({ value, onChange }: PeriodTabsProps) {
  const t = useTranslations('dashboard');

  const tabs = [
    { value: 'today' as const, label: t('today'), icon: CalendarDays },
    { value: 'week' as const, label: t('thisWeek'), icon: CalendarRange },
    { value: 'month' as const, label: t('thisMonth'), icon: Calendar },
  ];

  return (
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
              'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition',
              active
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            )}
          >
            <Icon size={16} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
