'use client';

import { CalendarDays, CalendarRange, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DashboardPeriod = 'today' | 'week' | 'month';

interface PeriodTabsProps {
  value: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
}

const tabs = [
  { value: 'today' as const, label: 'Today', icon: CalendarDays },
  { value: 'week' as const, label: 'This Week', icon: CalendarRange },
  { value: 'month' as const, label: 'This Month', icon: Calendar },
];

export function PeriodTabs({ value, onChange }: PeriodTabsProps) {
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
