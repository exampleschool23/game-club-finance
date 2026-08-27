import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Supabase migration files', () => {
  it('uses a unique version prefix for every migration', () => {
    const migrationDirectory = resolve(process.cwd(), 'supabase/migrations');
    const migrationFiles = readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql'));
    const versions = migrationFiles.map((name) => {
      const match = /^(\d+)_/.exec(name);
      expect(match, `${name} must start with a numeric migration version`).not.toBeNull();
      return match![1];
    });

    expect(versions.length).toBe(new Set(versions).size);
  });

  it('protects ledger-controlled product fields at the database boundary', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/034_atomic_closing_stock_save.sql'),
      'utf8',
    );
    const updateGrant = /grant update\s*\(([\s\S]*?)\)\s*on table public\.products/i.exec(migration);

    expect(updateGrant).not.toBeNull();
    expect(updateGrant![1].split(',').map((column) => column.trim())).toEqual([
      'name',
      'category',
      'sale_price',
      'cost_price',
      'low_stock_threshold',
      'sort_order',
      'is_active',
      'is_deleted',
      'deleted_at',
      'updated_at',
    ]);
    expect(migration).toContain('security invoker');
    expect(migration).toContain("current_user::text in ('authenticated', 'anon')");
    expect(migration).toContain("public.current_user_club_role(OLD.club_id) is distinct from 'owner'");
    expect(migration).toContain('revoke all on function public.enforce_product_cost_price_owner()');
  });

  it('keeps debts and payments append-only for application roles', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/036_financial_integrity_hardening.sql'),
      'utf8',
    );

    expect(migration).toContain('drop policy if exists "club_admin_write_debts"');
    expect(migration).toContain('create policy "club_admin_insert_debts"');
    expect(migration).toMatch(
      /revoke update, delete, truncate, references, trigger\s+on table public\.new_debts, public\.debt_payments\s+from PUBLIC, anon, authenticated;/i,
    );
    expect(migration).toContain("NEW.status <> 'unpaid'");
    expect(migration).toContain('NEW.remaining_amount <> NEW.amount');
  });
});
