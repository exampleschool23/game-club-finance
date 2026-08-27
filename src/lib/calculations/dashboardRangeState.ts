import {
  getDashboardRange,
  type DashboardPeriod,
} from './dashboardMetrics';

const dashboardPresetPeriods = [
  'today',
  'yesterday',
  'last7Days',
  'week',
  'lastWeek',
  'month',
  'lastMonth',
] as const;

interface SearchParamReader {
  get(name: string): string | null;
}

export function dashboardPeriodFromQuery(value: string | null): DashboardPeriod {
  return [...dashboardPresetPeriods, 'custom'].includes(value as DashboardPeriod)
    ? value as DashboardPeriod
    : 'month';
}

function validQueryDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function initialDashboardRange(
  query: SearchParamReader,
  businessToday: string,
): { from: string; to: string } {
  const queryFrom = query.get('from');
  const queryTo = query.get('to');

  if (validQueryDate(queryFrom) && validQueryDate(queryTo)) {
    return queryFrom <= queryTo
      ? { from: queryFrom, to: queryTo }
      : { from: queryTo, to: queryFrom };
  }

  return getDashboardRange(dashboardPeriodFromQuery(query.get('period')), businessToday, {
    from: businessToday,
    to: businessToday,
  });
}

export function dashboardPeriodForRange(
  range: { from: string; to: string },
  businessToday: string,
): DashboardPeriod {
  return dashboardPresetPeriods.find((preset) => {
    const presetRange = getDashboardRange(preset, businessToday);
    return presetRange.from === range.from && presetRange.to === range.to;
  }) ?? 'custom';
}

