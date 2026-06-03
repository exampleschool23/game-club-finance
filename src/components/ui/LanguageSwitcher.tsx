'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
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
  const router = useRouter();
  const locale = useLocale();
  const [current, setCurrent] = useState(locale);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCurrent(locale);
  }, [locale]);

  useEffect(() => {
    function handleLocaleChange(event: Event) {
      const nextLocale = (event as CustomEvent<string>).detail;
      if (nextLocale) setCurrent(nextLocale);
    }

    window.addEventListener('app-locale-change', handleLocaleChange);
    return () => window.removeEventListener('app-locale-change', handleLocaleChange);
  }, []);

  function switchLocale(nextLocale: string) {
    setCurrent(nextLocale);
    document.cookie = `locale=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new CustomEvent('app-locale-change', { detail: nextLocale }));
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex gap-1">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => switchLocale(lang.code)}
          disabled={isPending}
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
