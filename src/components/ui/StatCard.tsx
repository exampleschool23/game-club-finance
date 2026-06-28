import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'blue';
  subtitle?: string;
}

const variantStyles = {
  default: { card: 'border-gray-100', icon: 'bg-gray-100 text-gray-600', value: 'text-gray-900' },
  success: { card: 'border-success-100', icon: 'bg-success-50 text-success-600', value: 'text-success-700' },
  danger:  { card: 'border-danger-100',  icon: 'bg-danger-50 text-danger-600',   value: 'text-danger-700' },
  warning: { card: 'border-warning-100', icon: 'bg-warning-50 text-warning-600', value: 'text-warning-700' },
  blue:    { card: 'border-primary-100', icon: 'bg-primary-50 text-primary-600', value: 'text-primary-700' },
};

export function StatCard({ title, value, icon: Icon, variant = 'default', subtitle }: StatCardProps) {
  const styles = variantStyles[variant];

  return (
    <div className={cn('stat-card min-w-0', styles.card)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 truncate">{title}</p>
          <p className={cn('text-xl sm:text-2xl font-bold mt-1 leading-tight break-words tabular-nums', styles.value)}>
            {formatCurrency(value)}
          </p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={cn('p-2 rounded-lg flex-shrink-0', styles.icon)}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}
