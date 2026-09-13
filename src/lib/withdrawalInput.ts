import { formatCurrencyInput, parseCurrencyInput } from './formatters';

export function clampWithdrawalInput(value: string, available: number): string {
  if (!value.replace(/\D/g, '')) return '';
  const maximum = Number.isFinite(available) ? Math.max(0, Math.floor(available)) : 0;
  return formatCurrencyInput(Math.min(parseCurrencyInput(value), maximum));
}
