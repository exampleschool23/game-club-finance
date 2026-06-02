'use client';

import { useTransition } from 'react';

const LANGUAGES = [
  { code: 'ru', label: 'RU' },
  { code: 'uz', label: 'UZ' },
  { code: 'en', label: 'EN' },
];

export function LanguageSwitcher() {
  const [, startTransition] = useTransition();

  function switchLocale(locale: string) {
    startTransition(() => {
      document.cookie = `locale=${locale}; path=/; max-age=31536000`;
      window.location.reload();
    });
  }

  const current = typeof document !== 'undefined'
    ? document.cookie.match(/locale=([^;]+)/)?.[1] ?? 'ru'
    : 'ru';

  return (
    <div className="flex gap-1">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => switchLocale(lang.code)}
          className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
            current === lang.code
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
