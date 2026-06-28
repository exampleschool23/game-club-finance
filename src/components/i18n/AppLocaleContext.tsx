'use client';

import { createContext, useContext } from 'react';

export const APP_LOCALES = ['ru', 'uz', 'en'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export interface AppLocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}

export const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

export function isAppLocale(locale: string): locale is AppLocale {
  return (APP_LOCALES as readonly string[]).includes(locale);
}

export function useAppLocale() {
  const context = useContext(AppLocaleContext);
  if (!context) {
    throw new Error('useAppLocale must be used inside AppIntlProvider');
  }
  return context;
}
