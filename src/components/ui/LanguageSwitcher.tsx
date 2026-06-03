'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

const LANGUAGES = [
  { code: 'ru', label: 'RU' },
  { code: 'uz', label: 'UZ' },
  { code: 'en', label: 'EN' },
];

export function LanguageSwitcher() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchLocale(locale: string) {
    document.cookie = `locale=${locale}; path=/; max-age=31536000`;
    startTransition(() => {
      router.refresh();
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
          disabled={isPending}
          className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors disabled:opacity-60 ${
            current === lang.code
              ? 'bg-primary-600 text-white'
              : 'text-slate-300 hover:bg-white/10 hover:text-white'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
