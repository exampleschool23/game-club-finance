import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractCurrencyDigits,
  formatCurrency,
  formatCurrencyInput,
  formatDate,
  formatDateOnly,
  formatDatePickerValue,
  formatDateShort,
  formatDateTime,
  formatNumber,
  formatYearMonth,
  parseCurrencyInput,
  setFormatterLocale,
} from './formatters';

beforeEach(() => {
  setFormatterLocale('en');
});

describe('formatDateTime', () => {
  it('formats a full ISO datetime string', () => {
    const result = formatDateTime('2026-06-03T11:05:00');
    expect(result).toBe('3 June 2026 · 11:05 AM');
  });

  it('formats date and time in Russian', () => {
    expect(formatDateTime('2026-06-03T11:05:00', 'ru')).toBe('3 июня 2026 · 11:05');
  });

  it('formats date and time in Uzbek', () => {
    expect(formatDateTime('2026-06-03T11:05:00', 'uz')).toBe('3 iyun 2026 · 11:05');
  });

  it('returns "-" for null', () => {
    expect(formatDateTime(null)).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(formatDateTime(undefined)).toBe('-');
  });

  it('returns "-" for an invalid date string', () => {
    expect(formatDateTime('not-a-date')).toBe('-');
  });

  it('accepts a Date object', () => {
    const d = new Date('2026-06-03T11:05:00');
    const result = formatDateTime(d);
    expect(result).toContain('3 June');
    expect(result).toContain('2026');
    expect(result).toContain('·');
  });
});

describe('formatDateOnly', () => {
  it('formats an ISO date string without time shift', () => {
    expect(formatDateOnly('2026-06-03')).toBe('3 June 2026');
  });

  it('supports Russian month names', () => {
    expect(formatDateOnly('2026-06-03', 'ru')).toBe('3 июня 2026');
  });

  it('supports Uzbek month names', () => {
    expect(formatDateOnly('2026-06-03', 'uz')).toBe('3 iyun 2026');
    expect(formatDateOnly('2026-07-01', 'uz')).toBe('1 iyul 2026');
  });

  it('returns "-" for null', () => {
    expect(formatDateOnly(null)).toBe('-');
  });

  it('returns "-" for an invalid string', () => {
    expect(formatDateOnly('bad')).toBe('-');
  });
});

describe('formatDateShort', () => {
  it('formats an ISO date string without a year', () => {
    expect(formatDateShort('2026-06-03')).toBe('3 June');
  });

  it('formats a localized short date', () => {
    expect(formatDateShort('2026-06-03', 'ru')).toBe('3 июня');
    expect(formatDateShort('2026-06-03', 'uz')).toBe('3 iyun');
    expect(formatDateShort('2026-07-01', 'uz')).toBe('1 iyul');
  });
});

describe('formatDatePickerValue', () => {
  it('formats an ISO date for compact date controls', () => {
    expect(formatDatePickerValue('2026-06-03')).toBe('3 June 2026');
  });

  it('returns "-" for invalid input', () => {
    expect(formatDatePickerValue('bad')).toBe('-');
  });
});

describe('formatYearMonth', () => {
  it('formats an ISO month in English', () => {
    expect(formatYearMonth('2026-08')).toBe('August 2026');
  });

  it('formats localized month names', () => {
    expect(formatYearMonth('2026-08', 'ru')).toBe('август 2026');
    expect(formatYearMonth('2026-08', 'uz')).toBe('avgust 2026');
  });

  it('returns "-" for invalid input', () => {
    expect(formatYearMonth('2026-13')).toBe('-');
    expect(formatYearMonth('bad')).toBe('-');
    expect(formatYearMonth(null)).toBe('-');
  });
});

describe('formatDate', () => {
  it('uses the date-only formatter', () => {
    expect(formatDate('2026-06-03')).toBe('3 June 2026');
  });
});

describe('setFormatterLocale', () => {
  it('changes the default date formatter locale', () => {
    setFormatterLocale('uz');
    expect(formatDate('2026-06-03')).toBe('3 iyun 2026');
    setFormatterLocale('en');
    expect(formatDate('2026-06-03')).toBe('3 June 2026');
  });
});

describe('formatNumber', () => {
  it('formats a number with grouped thousands', () => {
    expect(formatNumber(1234567)).toBe('1 234 567');
  });
});

describe('formatCurrency', () => {
  it('uses the shared numeric currency format', () => {
    expect(formatCurrency(1234567)).toBe('1 234 567');
  });
});

describe('currency input helpers', () => {
  it('extracts digits from formatted input', () => {
    expect(extractCurrencyDigits('1 234 567 UZS')).toBe('1234567');
  });

  it('parses formatted currency input', () => {
    expect(parseCurrencyInput('1 234 567')).toBe(1234567);
  });

  it('formats text-field currency values', () => {
    expect(formatCurrencyInput('1234567')).toBe('1 234 567');
    expect(formatCurrencyInput('')).toBe('');
  });
});
