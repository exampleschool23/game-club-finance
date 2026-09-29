import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';

export interface MoneyProps {
  amount: number;
  /** Currency label; defaults to UZS. Pass `null` to hide it. */
  currency?: string | null;
  /** Colour negatives red. */
  signed?: boolean;
  /** Prefix positive values with "+" (activity feeds). */
  showPlus?: boolean;
  className?: string;
  currencyClassName?: string;
}

/** Formatted whole-UZS amount with thousands separators and a unit suffix. */
export function Money({ amount, currency = 'UZS', signed = false, showPlus = false, className, currencyClassName }: MoneyProps) {
  return (
    <span className={cn('tabular-nums', signed && amount < 0 && 'text-danger-600', className)}>
      {showPlus && amount > 0 ? '+' : ''}{formatCurrency(amount)}
      {currency ? <span className={cn('ml-1 font-medium', currencyClassName)}>{currency}</span> : null}
    </span>
  );
}
