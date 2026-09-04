import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/047_money_report_snapshot.sql'),
  'utf8',
);

describe('money report snapshot migration', () => {
  it('authorizes the requested club and exposes the function only to authenticated users', () => {
    expect(migration).toContain('security invoker');
    expect(migration).toContain(
      "public.current_user_can_access_club_feature(p_club_id, 'reports')",
    );
    expect(migration).toMatch(
      /revoke all on function public\.get_money_report_snapshot\(uuid, date, date\)[\s\S]*from public, anon;/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.get_money_report_snapshot\(uuid, date, date\)[\s\S]*to authenticated;/i,
    );
  });

  it('scopes every report ledger to the requested club and date range', () => {
    for (const alias of ['entries', 'expenses', 'payments', 'counts', 'purchases']) {
      expect(migration).toContain(`${alias}.club_id = p_club_id`);
      expect(migration).toContain(`${alias}.date between p_range_from and p_range_to`);
    }
  });

  it('returns creator names with cash and expense rows in the same payload', () => {
    expect(migration.match(/profiles\.full_name as creator_name/g)).toHaveLength(2);
    expect(migration).toContain("'cash'");
    expect(migration).toContain("'expenses'");
    expect(migration).toContain("'debtPayments'");
    expect(migration).toContain("'barSales'");
    expect(migration).toContain("'stockPurchases'");
  });
});
