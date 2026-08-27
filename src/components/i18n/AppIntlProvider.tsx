'use client';

import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { setFormatterLocale } from '@/lib/formatters';
import {
  AppLocaleContext,
  isAppLocale,
  type AppLocale,
  type AppLocaleContextValue,
} from '@/components/i18n/AppLocaleContext';

export function AppIntlProvider({
  initialLocale,
  initialMessages,
  children,
}: {
  initialLocale: string;
  initialMessages: AbstractIntlMessages;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const locale: AppLocale = isAppLocale(initialLocale) ? initialLocale : 'ru';

  setFormatterLocale(locale);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setFormatterLocale(nextLocale);
    document.documentElement.lang = nextLocale;
    document.cookie = `locale=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);

  const value = useMemo<AppLocaleContextValue>(
    () => ({ locale, setLocale }),
    [locale, setLocale],
  );

  return (
    <AppLocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={initialMessages} timeZone="Asia/Tashkent">
        {children}
      </NextIntlClientProvider>
    </AppLocaleContext.Provider>
  );
}
