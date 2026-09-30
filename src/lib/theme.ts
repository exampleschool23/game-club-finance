export const APP_THEMES = ['light', 'dark', 'system'] as const;
export type AppTheme = (typeof APP_THEMES)[number];

export const THEME_COOKIE = 'theme';
export const DEFAULT_THEME: AppTheme = 'system';

export function parseAppTheme(value: string | null | undefined): AppTheme {
  return (APP_THEMES as readonly string[]).includes(value ?? '') ? value as AppTheme : DEFAULT_THEME;
}

/** `data-theme` for <html>: absent for System so the OS setting applies. */
export function themeAttribute(theme: AppTheme): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme;
}
