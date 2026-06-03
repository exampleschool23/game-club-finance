import React from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  className?: string;
  valueClassName?: string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  trendLabel,
  className,
  valueClassName,
}: MetricCardProps) {
  return (
    <div className={cn('bg-white rounded-xl shadow-sm border border-gray-100 p-5', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 truncate">{label}</p>
          <p className={cn('mt-1 text-2xl font-bold text-gray-900 truncate', valueClassName)}>
            {value}
          </p>
          {trendLabel && (
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
        </div>
        {Icon && (
          <div className="ml-3 flex-shrink-0 p-2 bg-primary-50 rounded-lg">
            <Icon size={20} className="text-primary-600" />
          </div>
        )}
      </div>
    </div>
  );
}
