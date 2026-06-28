'use client';

import { NextIntlClientProvider } from 'next-intl';
import { useMemo, useState } from 'react';
import en from '@/messages/en.json';
import ru from '@/messages/ru.json';
import uz from '@/messages/uz.json';
import { setFormatterLocale } from '@/lib/formatters';
import {
  AppLocaleContext,
  isAppLocale,
  type AppLocale,
  type AppLocaleContextValue,
} from '@/components/i18n/AppLocaleContext';

const messagesByLocale = {
  ru,
  uz,
  en,
} satisfies Record<AppLocale, Record<string, unknown>>;

export function AppIntlProvider({
  initialLocale,
  children,
}: {
  initialLocale: string;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(
    isAppLocale(initialLocale) ? initialLocale : 'ru',
  );

  setFormatterLocale(locale);

  const value = useMemo<AppLocaleContextValue>(
    () => ({
      locale,
      setLocale(nextLocale) {
        setFormatterLocale(nextLocale);
        setLocaleState(nextLocale);
        document.documentElement.lang = nextLocale;
        document.cookie = `locale=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
        document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
        window.dispatchEvent(new CustomEvent('app-locale-change', { detail: nextLocale }));
      },
    }),
    [locale],
  );

  return (
    <AppLocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={messagesByLocale[locale]} timeZone="Asia/Tashkent">
        {children}
      </NextIntlClientProvider>
    </AppLocaleContext.Provider>
  );
}
