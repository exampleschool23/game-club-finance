import { describe, it, expect } from 'vitest';
import { formatDateTime, formatDateOnly } from './formatters';

describe('formatDateTime', () => {
  it('formats a full ISO datetime string', () => {
    const result = formatDateTime('2026-06-03T11:05:00');
    expect(result).toBe('Jun 3 2026 · 11:05 AM');
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
    expect(result).toContain('Jun 3');
    expect(result).toContain('2026');
    expect(result).toContain('·');
  });
});

describe('formatDateOnly', () => {
  it('formats an ISO date string without time shift', () => {
    expect(formatDateOnly('2026-06-03')).toBe('Jun 3, 2026');
  });

  it('returns "-" for null', () => {
    expect(formatDateOnly(null)).toBe('-');
  });

  it('returns "-" for an invalid string', () => {
    expect(formatDateOnly('bad')).toBe('-');
  });
});
