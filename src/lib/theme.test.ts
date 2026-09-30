import { describe, expect, it } from 'vitest';
import { parseAppTheme, themeAttribute } from './theme';

describe('app theme', () => {
  it('accepts known themes and falls back to System', () => {
    expect(parseAppTheme('light')).toBe('light');
    expect(parseAppTheme('dark')).toBe('dark');
    expect(parseAppTheme('system')).toBe('system');
    expect(parseAppTheme('purple')).toBe('system');
    expect(parseAppTheme(undefined)).toBe('system');
  });

  it('leaves data-theme unset for System', () => {
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('dark')).toBe('dark');
    expect(themeAttribute('system')).toBeUndefined();
  });
});
