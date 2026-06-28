'use client';

import { useEffect, useState } from 'react';
import { isAppLocale, useAppLocale, type AppLocale } from '@/components/i18n/AppLocaleContext';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { code: 'ru', label: 'RU' },
  { code: 'uz', label: 'UZ' },
  { code: 'en', label: 'EN' },
];

interface LanguageSwitcherProps {
  variant?: 'light' | 'dark';
}

export function LanguageSwitcher({ variant = 'light' }: LanguageSwitcherProps) {
  const { locale, setLocale } = useAppLocale();
  const [current, setCurrent] = useState(locale);

  useEffect(() => {
    setCurrent(locale);
  }, [locale]);

  useEffect(() => {
    function handleLocaleChange(event: Event) {
      const nextLocale = (event as CustomEvent<string>).detail;
      if (isAppLocale(nextLocale)) setCurrent(nextLocale);
    }

    window.addEventListener('app-locale-change', handleLocaleChange);
    return () => window.removeEventListener('app-locale-change', handleLocaleChange);
  }, []);

  function switchLocale(nextLocale: AppLocale) {
    if (nextLocale === locale) return;
    setCurrent(nextLocale);
    setLocale(nextLocale);
  }

  return (
    <div className="flex gap-1">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => {
            if (isAppLocale(lang.code)) switchLocale(lang.code);
          }}
          className={cn(
            'text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors disabled:opacity-60',
            current === lang.code
              ? 'bg-primary-600 text-white'
              : variant === 'dark'
                ? 'text-slate-300 hover:bg-white/10 hover:text-white'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
          )}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
