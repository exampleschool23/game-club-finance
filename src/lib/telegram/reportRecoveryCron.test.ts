import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Telegram report recovery crons', () => {
  it('uses three distinct once-daily paths for safe ledger-backed recovery', () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toEqual([
      { path: '/api/cron/daily-finance-report', schedule: '0 1 * * *' },
      { path: '/api/cron/daily-finance-report-retry-1', schedule: '0 2 * * *' },
      { path: '/api/cron/daily-finance-report-retry-2', schedule: '0 3 * * *' },
    ]);
    expect(new Set(config.crons.map((cron) => cron.path)).size).toBe(3);
  });

  it('routes both recovery invocations through the primary ledger-backed handler', () => {
    for (const route of ['daily-finance-report-retry-1', 'daily-finance-report-retry-2']) {
      const path = resolve(process.cwd(), 'src/app/api/cron', route, 'route.ts');
      expect(existsSync(path)).toBe(true);
      const source = readFileSync(path, 'utf8');
      expect(source).toContain("from '../daily-finance-report/route'");
      expect(source).toContain('export const GET = handleDailyFinanceReport');
    }
  });
});
