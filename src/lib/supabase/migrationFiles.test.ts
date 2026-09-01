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

  it('preserves historical stock snapshots and validates payment methods', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/038_stock_snapshot_and_payment_method_integrity.sql'),
      'utf8',
    );

    expect(migration).toContain('if v_has_existing and p_date < v_business_date then');
    expect(migration).toContain('v_added := v_existing.added_today;');
    expect(migration).toMatch(
      /elsif v_purchase_added is not null and v_purchase_added <> trunc\(v_purchase_added\) then/i,
    );
    expect(migration).toContain('validate constraint expenses_payment_method_check');
    expect(migration).toContain('validate constraint debt_payments_payment_method_check');
    expect(migration).toContain('validate constraint stock_purchases_payment_method_check');
    expect(migration).toContain('NEW.current_stock := 0;');
    expect(migration).toContain(
      'counts.previous_stock is distinct from recalculated.canonical_previous',
    );
    expect(migration).toContain(
      'counts.bar_profit is distinct from',
    );
  });

  it('stores finalized monthly average income and reads only the current month live', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/042_monthly_average_income_snapshots.sql'),
      'utf8',
    );

    expect(migration).toContain('create table if not exists public.monthly_average_income_snapshots');
    expect(migration).toContain('primary key (club_id, month)');
    expect(migration).toContain('public.user_has_club_access(club_id)');
    expect(migration).toMatch(
      /revoke insert, update, delete, truncate, references, trigger\s+on table public\.monthly_average_income_snapshots from authenticated;/i,
    );
    expect(migration).toContain('create or replace function public.refresh_monthly_average_income_snapshot');
    expect(migration).toContain("'finalize-monthly-average-income'");
    expect(migration).toContain('create or replace function public.get_monthly_average_income_chart');
    expect(migration).toContain('entries.date between v_current_month and p_business_date');
    expect(migration).toContain('counts.date between v_current_month and p_business_date');
    expect(migration).toContain('debts.date between v_current_month and p_business_date');
    expect(migration).toContain('else coalesce(snapshots.average_daily_income, 0)');
    expect(migration).toContain('grant execute on function public.get_monthly_average_income_chart(uuid, date)');
  });

  it('limits monthly average income snapshots and live totals to game-club income', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/043_game_club_only_monthly_average_income.sql'),
      'utf8',
    );

    expect(migration).toContain('create or replace function public.refresh_monthly_average_income_snapshot');
    expect(migration).toContain('create or replace function public.get_monthly_average_income_chart');
    expect(migration).toContain('from public.daily_cash_entries entries');
    expect(migration).not.toContain('public.daily_stock_counts');
    expect(migration).not.toContain('public.new_debts');
    expect(migration).not.toContain('playstation_income');
    expect(migration).toContain('update public.monthly_average_income_snapshots snapshots');
  });

  it('returns compact, authorized owner-profit monthly aggregates', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/044_owner_profit_snapshot.sql'),
      'utf8',
    );

    expect(migration).toContain('create or replace function public.get_owner_profit_snapshot');
    expect(migration).toContain('not public.user_has_club_access(p_club_id)');
    expect(migration).toContain("purchases.date between date '2026-07-02' and p_through_date");
    expect(migration).toContain("expenses.payment_source = 'game_club'");
    expect(migration).toContain("expenses.payment_source = 'bar'");
    expect(migration).toContain('revoke all on function public.get_owner_profit_snapshot(uuid, date)');
    expect(migration).toContain('grant execute on function public.get_owner_profit_snapshot(uuid, date) to authenticated');
  });

  it('adds payment-method balances to the owner-profit snapshot', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/045_owner_profit_payment_method_balances.sql'),
      'utf8',
    );

    expect(migration).toContain("'paymentMethodBalances', jsonb_build_object(");
    expect(migration).toContain("payments.payment_method = 'cash'");
    expect(migration).toContain("expenses.payment_source = 'game_club'");
    expect(migration).toContain('not public.user_has_club_access(p_club_id)');
  });
});
