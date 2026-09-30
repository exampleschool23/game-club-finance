'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAppTheme } from '@/components/theme/AppThemeContext';
import { APP_THEMES, type AppTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const ICONS: Record<AppTheme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

/** Light / Dark / System toggle, styled like LanguageSwitcher. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const t = useTranslations('common.theme');
  const { theme, setTheme } = useAppTheme();

  return (
    <div role="group" aria-label={t('label')} className={cn('inline-flex gap-0.5 rounded-lg bg-gray-100 p-0.5', className)}>
      {APP_THEMES.map((option) => {
        const Icon = ICONS[option];
        const selected = theme === option;
        return (
          <button
            key={option}
            type="button"
            title={t(option)}
            aria-label={t(option)}
            aria-pressed={selected}
            onClick={() => setTheme(option)}
            className={cn(
              'inline-flex min-h-8 min-w-9 items-center justify-center rounded-[7px] px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
              selected ? 'bg-surface text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900',
            )}
          >
            <Icon size={15} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
