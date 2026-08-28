import { PAYMENT_METHODS, type EntryPaymentMethod } from '../types';

export function normalizePaymentMethods(value: unknown): EntryPaymentMethod[] {
  if (!Array.isArray(value)) return [...PAYMENT_METHODS];

  const requested = new Set(value);
  const methods = PAYMENT_METHODS.filter((method) => requested.has(method));

  return methods.length > 0 ? methods : [...PAYMENT_METHODS];
}

export function defaultPaymentMethod(methods: readonly EntryPaymentMethod[]): EntryPaymentMethod {
  return methods[0] ?? PAYMENT_METHODS[0];
}
