/**
 * Central date/time formatting for the app.
 * All user-facing date strings must use these functions.
 * Never use toLocaleDateString(), toLocaleString(), Intl formatters,
 * or ad-hoc number formatting in components.
 */

export type FormatterLocale = 'ru' | 'uz' | 'en';

const DATE_LOCALES: Record<FormatterLocale, string> = {
  ru: 'ru-RU',
  uz: 'uz-Latn-UZ',
  en: 'en-GB',
};

const TIME_LOCALES: Record<FormatterLocale, string> = {
  ru: 'ru-RU',
  uz: 'uz-Latn-UZ',
  en: 'en-US',
};

let currentFormatterLocale: FormatterLocale = 'en';

function isFormatterLocale(locale: string): locale is FormatterLocale {
  return locale === 'ru' || locale === 'uz' || locale === 'en';
}

function resolveFormatterLocale(locale?: string): FormatterLocale {
  return locale && isFormatterLocale(locale) ? locale : currentFormatterLocale;
}

export function setFormatterLocale(locale: string) {
  if (isFormatterLocale(locale)) {
    currentFormatterLocale = locale;
  }
}

function parseDateValue(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  // Pure date strings like "2026-06-03" must be treated as local midnight,
  // not UTC midnight, to avoid off-by-one day in negative-offset timezones.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDayMonth(date: Date, includeYear: boolean, locale?: string): string {
  const appLocale = resolveFormatterLocale(locale);
  const parts = new Intl.DateTimeFormat(DATE_LOCALES[appLocale], {
    day: 'numeric',
    month: 'long',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).formatToParts(date);

  const day = parts.find((part) => part.type === 'day')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const year = parts.find((part) => part.type === 'year')?.value;

  if (!day || !month) return '-';
  return includeYear && year ? `${day} ${month} ${year}` : `${day} ${month}`;
}

/**
 * Format a date+time value.
 * Output: "3 June 2026 · 11:05 AM"
 * Use for: created_at, updated_at, transaction times, purchase times, debt payment times.
 */
export function formatDateTime(value: string | Date | null | undefined, locale?: string): string {
  const date = parseDateValue(value);
  if (!date) return '-';
  const appLocale = resolveFormatterLocale(locale);
  const time = new Intl.DateTimeFormat(TIME_LOCALES[appLocale], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: appLocale === 'en',
  }).format(date);

  return `${formatDayMonth(date, true, appLocale)} · ${time}`;
}

/**
 * Format a date-only value (no time).
 * Output: "3 June 2026"
 * Use for: date columns in tables, date labels on cards, report rows.
 * IMPORTANT: For ISO date strings like "2026-06-03" append T00:00:00 to avoid
 * timezone shifting the day backward. Already handled inside this function.
 */
export function formatDateOnly(value: string | Date | null | undefined, locale?: string): string {
  const date = parseDateValue(value);
  return date ? formatDayMonth(date, true, locale) : '-';
}

/**
 * Format a date without a year.
 * Output: "3 June"
 * Use for: dense chart labels where the surrounding period already provides the year.
 */
export function formatDateShort(value: string | Date | null | undefined, locale?: string): string {
  const date = parseDateValue(value);
  return date ? formatDayMonth(date, false, locale) : '-';
}

/**
 * Format an ISO date for compact date picker controls.
 * Output: "3 June 2026"
 */
export function formatDatePickerValue(value: string | null | undefined, locale?: string): string {
  return formatDateOnly(value, locale);
}

export function formatDate(value: string | Date | null | undefined, locale?: string): string {
  return formatDateOnly(value, locale);
}

export function formatNumber(value: number, locale = 'ru-UZ'): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value).replace(/[\u00a0\u202f]/g, ' ');
}

export function formatCurrency(amount: number, locale = 'ru-UZ'): string {
  return formatNumber(amount, locale);
}

export function extractCurrencyDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D/g, '');
}

export function parseCurrencyInput(value: string | number | null | undefined): number {
  const digits = extractCurrencyDigits(value);
  return digits ? Number(digits) : 0;
}

export function formatCurrencyInput(value: string | number | null | undefined): string {
  const digits = extractCurrencyDigits(value);
  if (!digits) return '';
  return formatCurrency(Number(digits));
}
