/**
 * Central date/time formatting for the app.
 * All user-facing date strings must use these functions.
 * Never use toLocaleDateString(), toLocaleString(), or ad-hoc Intl calls in components.
 */

/**
 * Format a date+time value.
 * Output: "Jun 3, 2026 · 11:05 AM"
 * Use for: created_at, updated_at, transaction times, purchase times, debt payment times.
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .replace(/,/g, '')
    .replace(/(\d{4})/, '$1 ·');
}

/**
 * Format a date-only value (no time).
 * Output: "Jun 3, 2026"
 * Use for: date columns in tables, date labels on cards, report rows.
 * IMPORTANT: For ISO date strings like "2026-06-03" append T00:00:00 to avoid
 * timezone shifting the day backward. Already handled inside this function.
 */
export function formatDateOnly(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else {
    // Pure date strings like "2026-06-03" must be treated as local midnight,
    // not UTC midnight, to avoid off-by-one day in negative-offset timezones.
    date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  }
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
