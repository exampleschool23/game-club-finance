import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import ru from './ru.json';
import uz from './uz.json';

type Messages = Record<string, unknown>;

const locales = { en, ru, uz } as const;

function flattenLeaves(value: Messages, prefix = '', result = new Set<string>()): Set<string> {
  Object.entries(value).forEach(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenLeaves(child as Messages, path, result);
    } else {
      result.add(path);
    }
  });
  return result;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return ['.ts', '.tsx'].includes(extname(path)) && !path.endsWith('.test.ts') ? [path] : [];
  });
}

function hasPath(messages: Messages, path: string): boolean {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Messages)[key] : undefined
  ), messages) !== undefined;
}

describe('localization messages', () => {
  it('keeps the same message shape in every locale', () => {
    const englishKeys = flattenLeaves(en);

    Object.entries(locales).forEach(([locale, messages]) => {
      expect(flattenLeaves(messages), `${locale} message keys`).toEqual(englishKeys);
    });
  });

  it('defines every statically referenced translation key in every locale', () => {
    const missing: string[] = [];

    sourceFiles(resolve(process.cwd(), 'src')).forEach((file) => {
      const source = readFileSync(file, 'utf8');
      const bindings = new Map<string, string>();

      source.matchAll(/const\s+(\w+)\s*=\s*useTranslations\(['"]([^'"]+)['"]\)/g)
        .forEach((match) => bindings.set(match[1], match[2]));

      bindings.forEach((namespace, binding) => {
        const calls = new RegExp(`\\b${binding}\\(\\s*['"]([^'"]+)['"]`, 'g');
        source.matchAll(calls).forEach((match) => {
          const key = `${namespace}.${match[1]}`;
          Object.entries(locales).forEach(([locale, messages]) => {
            if (!hasPath(messages, key)) missing.push(`${locale}: ${key} (${file})`);
          });
        });
      });
    });

    expect(missing).toEqual([]);
  });
});
