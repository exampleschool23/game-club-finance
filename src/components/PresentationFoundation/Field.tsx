'use client';

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrencyInput } from '@/lib/formatters';

/** Shared text-control styling; exported so bespoke controls can match it. */
export const controlClassName =
  'w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm outline-none transition ' +
  'placeholder:text-gray-400 hover:border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ' +
  'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 aria-[invalid=true]:border-danger-500 aria-[invalid=true]:focus:ring-danger-500/20';

export const labelClassName = 'mb-1.5 block text-sm font-semibold text-gray-700';

export interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  /** Trailing element on the label row (e.g. a lock icon). */
  labelAddon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label + control + hint/error wrapper. Use with Input/Select/Textarea/DatePicker. */
export function Field({ label, htmlFor, required, hint, error, labelAddon, children, className }: FieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label htmlFor={htmlFor} className={cn(labelClassName, 'flex items-center gap-1.5')}>
          <span>{label}</span>
          {required && <span className="text-danger-500" aria-hidden="true">*</span>}
          {labelAddon}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-xs font-semibold text-danger-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs leading-5 text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

type ControlSize = 'sm' | 'md' | 'lg';
const controlHeight: Record<ControlSize, string> = { sm: 'h-10', md: 'h-11', lg: 'h-14 text-xl font-bold' };

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  controlSize?: ControlSize;
  invalid?: boolean;
  leadingIcon?: ReactNode;
  /** Text or element pinned to the right inside the control (currency, unit). */
  trailingAddon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { controlSize = 'md', invalid, leadingIcon, trailingAddon, className, ...rest },
  ref,
) {
  const control = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlClassName, controlHeight[controlSize], leadingIcon && 'pl-10', trailingAddon && 'pr-16', className)}
      {...rest}
    />
  );

  if (!leadingIcon && !trailingAddon) return control;

  return (
    <div className="relative min-w-0">
      {leadingIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      {control}
      {trailingAddon && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold uppercase tracking-wide text-gray-500">
          {trailingAddon}
        </span>
      )}
    </div>
  );
});

export interface CurrencyInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type' | 'inputMode'> {
  value: string;
  /** Receives the already thousands-formatted string. Parse with `parseCurrencyInput` when saving. */
  onValueChange: (formatted: string) => void;
}

/** Whole-UZS input that keeps thousands separators while typing. */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(function CurrencyInput(
  { value, onValueChange, className, placeholder = '0', ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(formatCurrencyInput(event.target.value))}
      className={cn('tabular-nums', className)}
      {...rest}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Shows `current/max` under the control when `maxLength` is set. */
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, showCount = false, className, maxLength, value, ...rest },
  ref,
) {
  return (
    <>
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        maxLength={maxLength}
        value={value}
        className={cn(controlClassName, 'min-h-24 resize-y py-2.5', className)}
        {...rest}
      />
      {showCount && maxLength ? (
        <p className="mt-1 text-right text-xs text-gray-400">{String(value ?? '').length}/{maxLength}</p>
      ) : null}
    </>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  controlSize?: ControlSize;
  invalid?: boolean;
  leadingIcon?: ReactNode;
}

/** Native select with a consistent chevron. Native is deliberate for mobile. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { controlSize = 'md', invalid, leadingIcon, className, children, ...rest },
  ref,
) {
  return (
    <div className="relative min-w-0">
      {leadingIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gray-400" aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(controlClassName, controlHeight[controlSize], 'appearance-none pr-9', leadingIcon && 'pl-10', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" />
    </div>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}

export function Checkbox({ label, description, className, id, ...rest }: CheckboxProps) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm text-gray-700 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-70', className)}>
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded accent-primary-600" {...rest} />
      <span className="min-w-0">
        <span className="block font-medium text-gray-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-5 text-gray-500">{description}</span>}
      </span>
    </label>
  );
}
