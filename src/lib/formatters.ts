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

// Some browsers ship incomplete Uzbek ICU data and return placeholders such as
// "M07" instead of a month name. Keep Uzbek month names deterministic.
const UZBEK_MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
] as const;

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

  if (appLocale === 'uz') {
    const day = date.getDate();
    const month = UZBEK_MONTHS[date.getMonth()];
    return includeYear ? `${day} ${month} ${date.getFullYear()}` : `${day} ${month}`;
  }

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
 * Format a time-only value.
 * Output: "11:05" or "11:05 AM"
 * Use for: compact transaction rows where the date is shown separately.
 */
export function formatTime(value: string | Date | null | undefined, locale?: string): string {
  const date = parseDateValue(value);
  if (!date) return '-';
  const appLocale = resolveFormatterLocale(locale);

  return new Intl.DateTimeFormat(TIME_LOCALES[appLocale], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: appLocale === 'en',
  }).format(date);
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

/**
 * Format an ISO year-month value.
 * Output: "June 2026"
 * Use for: month picker controls and month-based ledger entries.
 */
export function formatYearMonth(value: string | null | undefined, locale?: string): string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return '-';

  const [year, month] = value.split('-').map(Number);
  if (!Number.isInteger(year) || month < 1 || month > 12) return '-';

  const appLocale = resolveFormatterLocale(locale);
  if (appLocale === 'uz') {
    return `${UZBEK_MONTHS[month - 1]} ${year}`;
  }

  const parts = new Intl.DateTimeFormat(DATE_LOCALES[appLocale], {
    month: 'long',
    year: 'numeric',
  }).formatToParts(new Date(year, month - 1, 1));
  const formattedMonth = parts.find((part) => part.type === 'month')?.value;
  const formattedYear = parts.find((part) => part.type === 'year')?.value;

  return formattedMonth && formattedYear ? `${formattedMonth} ${formattedYear}` : '-';
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

/**
 * Format a weighted-average unit cost without hiding meaningful fractions.
 * Aggregate UZS totals still use formatCurrency() and round to whole sums.
 */
export function formatUnitCurrency(amount: number, locale = 'ru-UZ'): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount).replace(/[\u00a0\u202f]/g, ' ');
}

export function extractCurrencyDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';

  // Database numeric columns can contain fractional weighted-average prices.
  // Treat numeric values as numbers before extracting digits so 2108.42 does
  // not become 210842 when it is loaded into a whole-currency input.
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(Math.max(0, Math.round(value)));
  }

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
