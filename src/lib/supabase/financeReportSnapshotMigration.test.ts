import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/049_finance_report_snapshot.sql'),
  'utf8',
);

describe('finance report snapshot migration', () => {
  it('authorizes the requested club through dashboard or reports access', () => {
    expect(migration).toContain('security invoker');
    expect(migration).toContain('public.current_user_can_access_club_feature_any(');
    expect(migration).toContain("array['dashboard', 'reports']::text[]");
    expect(migration).toMatch(
      /revoke all on function public\.get_finance_report_snapshot\(uuid, date, date, text\[\]\)[\s\S]*from public, anon;/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.get_finance_report_snapshot\(uuid, date, date, text\[\]\)[\s\S]*to authenticated;/i,
    );
  });

  it('rejects invalid ranges and unrecognized payload sections', () => {
    expect(migration).toContain('if p_range_from > p_range_to then');
    expect(migration).toContain("raise exception 'Invalid report date range.'");
    expect(migration).toContain("raise exception 'Invalid finance report section.'");
    for (const section of [
      'cash',
      'stock_totals',
      'stock_counts',
      'purchases',
      'expenses',
      'debts',
      'debt_payments',
    ]) {
      expect(migration).toContain(`'${section}'`);
    }
  });

  it('scopes every requested ledger to the club and range', () => {
    for (const alias of ['entries', 'counts', 'purchases', 'expenses', 'debts', 'payments']) {
      expect(migration).toContain(`${alias}.club_id = p_club_id`);
      expect(migration).toContain(`${alias}.date between p_range_from and p_range_to`);
    }
  });

  it('guards each potentially large section behind an explicit request', () => {
    for (const [section, payload] of [
      ['cash', 'cashRows'],
      ['stock_totals', 'stockTotalRows'],
      ['stock_counts', 'stockCountRows'],
      ['purchases', 'purchaseRows'],
      ['expenses', 'expenseRows'],
      ['debts', 'debtRows'],
      ['debt_payments', 'debtPaymentRows'],
    ]) {
      expect(migration).toContain(`'${payload}', case when '${section}' = any(v_sections)`);
    }
  });
});
