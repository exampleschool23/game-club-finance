// Shared date and business-day utilities.

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const DEFAULT_BUSINESS_DAY_START_HOUR = 0;

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeBusinessDayStartHour(value: unknown): number {
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_BUSINESS_DAY_START_HOUR;
}

export function businessDayDate(date = new Date(), businessDayStartHour = DEFAULT_BUSINESS_DAY_START_HOUR): Date {
  const d = new Date(date);
  const startHour = normalizeBusinessDayStartHour(businessDayStartHour);

  if (d.getHours() < startHour) {
    d.setDate(d.getDate() - 1);
  }

  return d;
}

export function todayIso(date = new Date(), businessDayStartHour = DEFAULT_BUSINESS_DAY_START_HOUR): string {
  return isoDate(businessDayDate(date, businessDayStartHour));
}

export function calendarTodayIso(date = new Date()): string {
  return isoDate(date);
}

export function currentYearMonth(date = new Date(), businessDayStartHour = DEFAULT_BUSINESS_DAY_START_HOUR): string {
  const d = businessDayDate(date, businessDayStartHour);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function monthRange(yearMonth: string): { from: string; to: string } {
  const [year, month] = yearMonth.split('-').map(Number);
  const fromDate = new Date(year, month - 1, 1);
  const toDate = new Date(year, month, 0);
  const from = isoDate(fromDate);
  const to = isoDate(toDate);
  return { from, to };
}
