'use client';

import { isAppLocale, useAppLocale } from '@/components/i18n/AppLocaleContext';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { code: 'ru', label: 'RU', name: 'Русский' },
  { code: 'uz', label: 'UZ', name: "O'zbekcha" },
  { code: 'en', label: 'EN', name: 'English' },
];

interface LanguageSwitcherProps {
  variant?: 'light' | 'dark';
}

export function LanguageSwitcher({ variant = 'light' }: LanguageSwitcherProps) {
  const { locale, setLocale } = useAppLocale();

  return (
    <div role="group" aria-label="Language / Язык / Til" className="flex gap-1">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          lang={lang.code}
          aria-label={lang.name}
          aria-pressed={locale === lang.code}
          onClick={() => {
            if (isAppLocale(lang.code) && lang.code !== locale) setLocale(lang.code);
          }}
          className={cn(
            'min-h-9 min-w-10 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60',
            locale === lang.code
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
