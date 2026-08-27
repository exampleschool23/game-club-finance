'use client';

import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
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
} satisfies Record<AppLocale, AbstractIntlMessages>;

export function AppIntlProvider({
  initialLocale,
  initialMessages,
  children,
}: {
  initialLocale: string;
  initialMessages: AbstractIntlMessages;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(
    isAppLocale(initialLocale) ? initialLocale : 'ru',
  );

  setFormatterLocale(locale);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setFormatterLocale(nextLocale);
    setLocaleState(nextLocale);
    document.documentElement.lang = nextLocale;
    document.cookie = `locale=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo<AppLocaleContextValue>(
    () => ({ locale, setLocale }),
    [locale, setLocale],
  );

  return (
    <AppLocaleContext.Provider value={value}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === initialLocale ? initialMessages : messagesByLocale[locale]}
        timeZone="Asia/Tashkent"
      >
        {children}
      </NextIntlClientProvider>
    </AppLocaleContext.Provider>
  );
}
