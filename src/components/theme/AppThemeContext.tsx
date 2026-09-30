'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { THEME_COOKIE, themeAttribute, type AppTheme } from '@/lib/theme';

interface AppThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

/** Holds the user's theme choice; the server renders the matching <html data-theme>. */
export function AppThemeProvider({ initialTheme, children }: { initialTheme: AppTheme; children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(initialTheme);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    setThemeState(nextTheme);
    const attribute = themeAttribute(nextTheme);
    if (attribute) document.documentElement.dataset.theme = attribute;
    else delete document.documentElement.dataset.theme;
    document.cookie = `${THEME_COOKIE}=${nextTheme}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) throw new Error('useAppTheme must be used inside AppThemeProvider');
  return context;
}
