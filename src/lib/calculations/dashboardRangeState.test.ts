import { describe, expect, it } from 'vitest';
import {
  dashboardPeriodForRange,
  dashboardPeriodFromQuery,
  initialDashboardRange,
} from './dashboardRangeState';

function query(values: Record<string, string | null>) {
  return { get: (name: string) => values[name] ?? null };
}

describe('dashboard range state', () => {
  it('defaults unknown periods to the current month', () => {
    expect(dashboardPeriodFromQuery('unknown')).toBe('month');
    expect(initialDashboardRange(query({}), '2026-08-27')).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('normalizes an explicit reversed range', () => {
    expect(initialDashboardRange(query({ from: '2026-08-20', to: '2026-08-05' }), '2026-08-27')).toEqual({
      from: '2026-08-05',
      to: '2026-08-20',
    });
  });

  it('recognizes preset and custom ranges', () => {
    expect(dashboardPeriodForRange({ from: '2026-08-01', to: '2026-08-31' }, '2026-08-27')).toBe('month');
    expect(dashboardPeriodForRange({ from: '2026-08-03', to: '2026-08-19' }, '2026-08-27')).toBe('custom');
  });
});

