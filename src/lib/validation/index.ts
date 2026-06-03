export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const ok = (): ValidationResult => ({ valid: true });
const fail = (error: string): ValidationResult => ({ valid: false, error });

/** Amount must be a positive finite number */
export function validateAmount(value: unknown, fieldName = 'Amount'): ValidationResult {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fail(`${fieldName} must be a positive number.`);
  return ok();
}

/** Quantity must be zero or positive (stock can be zero) */
export function validateQuantity(value: unknown, fieldName = 'Quantity'): ValidationResult {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fail(`${fieldName} cannot be negative.`);
  return ok();
}

/** Date must be a valid ISO date string YYYY-MM-DD */
export function validateDate(value: unknown): ValidationResult {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fail('Date must be in YYYY-MM-DD format.');
  }
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fail('Invalid date.');
  return ok();
}

/** Closing stock cannot exceed previous + added (unless explicitly confirmed) */
export function validateClosingStock(opts: {
  previousStock: number;
  addedToday: number;
  closingStock: number;
  confirmAdjustment?: boolean;
}): ValidationResult {
  const max = opts.previousStock + opts.addedToday;
  if (opts.closingStock > max && !opts.confirmAdjustment) {
    return fail(
      `Closing stock (${opts.closingStock}) cannot exceed previous stock + added today (${max}) without an explicit adjustment.`,
    );
  }
  return ok();
}

/** Debt payment cannot exceed remaining balance */
export function validateDebtPayment(opts: {
  paymentAmount: number;
  remainingDebt: number;
}): ValidationResult {
  if (opts.paymentAmount <= 0) return fail('Payment amount must be positive.');
  if (opts.paymentAmount > opts.remainingDebt) {
    return fail(
      `Payment (${opts.paymentAmount}) exceeds remaining debt (${opts.remainingDebt}). Overpayment is not allowed.`,
    );
  }
  return ok();
}

/** Entry must be within edit window (or role is owner). Viewers can never edit. */
export function validateEditWindow(opts: {
  createdAt: string;
  now?: Date;
  role: string | null | undefined;
  windowMinutes?: number;
}): ValidationResult {
  if (opts.role === 'owner') return ok();
  if (opts.role !== 'admin') {
    return fail('This entry is locked. Admins can only edit entries within 15 minutes of creation.');
  }
  const created = new Date(opts.createdAt).getTime();
  const now = (opts.now ?? new Date()).getTime();
  const windowMs = (opts.windowMinutes ?? 15) * 60_000;
  if (now - created > windowMs) {
    return fail('This entry is locked. Admins can only edit entries within 15 minutes of creation.');
  }
  return ok();
}

/** Run multiple validations and return the first failure, or ok */
export function validateAll(...results: ValidationResult[]): ValidationResult {
  return results.find((r) => !r.valid) ?? ok();
}
