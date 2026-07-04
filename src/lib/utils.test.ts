// Tests for shared date and business-day utilities.

import { describe, expect, it } from 'vitest';
import {
  businessDayDate,
  calendarTodayIso,
  currentYearMonth,
  monthRange,
  normalizeBusinessDayStartHour,
  todayIso,
} from './utils';

describe('business day date helpers', () => {
  it('defaults to midnight business days', () => {
    expect(todayIso(new Date(2026, 6, 4, 5, 59, 59))).toBe('2026-07-04');
  });

  it('keeps entries before 6:00 AM on the previous club day', () => {
    expect(todayIso(new Date(2026, 6, 4, 5, 59, 59), 6)).toBe('2026-07-03');
  });

  it('starts the new club day at 6:00 AM', () => {
    expect(todayIso(new Date(2026, 6, 4, 6, 0, 0), 6)).toBe('2026-07-04');
  });

  it('uses the business day for current month defaults', () => {
    expect(currentYearMonth(new Date(2026, 6, 1, 5, 30, 0), 6)).toBe('2026-06');
    expect(currentYearMonth(new Date(2026, 6, 1, 6, 0, 0), 6)).toBe('2026-07');
  });

  it('keeps a calendar-date helper for places that need the real date', () => {
    expect(calendarTodayIso(new Date(2026, 6, 4, 5, 59, 59))).toBe('2026-07-04');
  });

  it('returns month boundaries for a selected month', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('returns a date object shifted to the business day when before 6:00 AM', () => {
    const businessDate = businessDayDate(new Date(2026, 0, 1, 1, 0, 0), 6);

    expect(businessDate.getFullYear()).toBe(2025);
    expect(businessDate.getMonth()).toBe(11);
    expect(businessDate.getDate()).toBe(31);
  });

  it('normalizes invalid business day hours back to midnight', () => {
    expect(normalizeBusinessDayStartHour(6)).toBe(6);
    expect(normalizeBusinessDayStartHour('23')).toBe(23);
    expect(normalizeBusinessDayStartHour(24)).toBe(0);
    expect(normalizeBusinessDayStartHour('bad')).toBe(0);
  });
});
