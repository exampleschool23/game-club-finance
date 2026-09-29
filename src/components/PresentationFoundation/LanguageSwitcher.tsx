'use client';

import { isAppLocale, useAppLocale } from '@/components/i18n/AppLocaleContext';
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

  return (
    <div className="flex gap-1">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => {
            if (isAppLocale(lang.code) && lang.code !== locale) setLocale(lang.code);
          }}
          className={cn(
            'text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors disabled:opacity-60',
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
