import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';
type CardTone = 'default' | 'primary' | 'info' | 'success' | 'warning' | 'orange' | 'muted';

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3 sm:p-4',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
};

const toneClasses: Record<CardTone, string> = {
  default: 'border-gray-200 bg-white shadow-sm',
  primary: 'border-primary-100 bg-white shadow-sm',
  info: 'border-blue-100 bg-blue-50 shadow-sm',
  success: 'border-success-100 bg-success-50/70',
  warning: 'border-warning-500/30 bg-warning-50',
  orange: 'border-orange-100 bg-orange-50 shadow-sm',
  muted: 'border-gray-100 bg-gray-50',
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  padding?: CardPadding;
  tone?: CardTone;
  /** Dashed border, for placeholders and optional areas. */
  dashed?: boolean;
  children: ReactNode;
}

/** The single surface primitive: white rounded panel with border and shadow. */
export function Card({
  as: Component = 'div',
  padding = 'md',
  tone = 'default',
  dashed = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Component
      className={cn(
        'min-w-0 rounded-xl border',
        toneClasses[tone],
        dashed && 'border-dashed shadow-none',
        paddingClasses[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}

export interface SectionHeadingProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  iconClassName?: string;
  action?: ReactNode;
  /** Small chip rendered next to the title (a count, a status). */
  badge?: ReactNode;
  as?: 'h2' | 'h3';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const headingSize = {
  sm: 'text-sm font-bold text-gray-950',
  md: 'text-base font-bold text-gray-950',
  lg: 'text-lg font-bold text-gray-950 sm:text-xl',
};

/** Title + description row used at the top of cards and page sections. */
export function SectionHeading({
  title,
  description,
  icon,
  iconClassName,
  action,
  badge,
  as: Heading = 'h2',
  size = 'md',
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600',
              iconClassName,
            )}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Heading className={cn('break-words', headingSize[size])}>{title}</Heading>
            {badge}
          </div>
          {description && <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{action}</div>}
    </div>
  );
}

/** Card whose header/body are separated by a divider. */
export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('border-b border-gray-100 px-4 py-4 sm:px-5', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-4 sm:p-5', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('border-t border-gray-100 px-4 py-4 sm:px-5', className)} {...rest}>
      {children}
    </div>
  );
}
