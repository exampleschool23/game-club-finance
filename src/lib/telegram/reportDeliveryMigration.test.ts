import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/037_telegram_report_delivery_ledger.sql'),
  'utf8',
);

describe('Telegram report delivery ledger migration', () => {
  it('uses one durable idempotency row per date, target, and delivery key', () => {
    expect(migration).toContain('create table public.telegram_report_deliveries');
    expect(migration).toMatch(/unique \(business_date, target_key, delivery_key\)/i);
    expect(migration).toContain("delivery_key = 'scheduled'");
    expect(migration).toContain("'^force:");
    expect(migration).toContain('retry_not_before timestamptz');
    expect(migration).toContain("'outcome', 'retry_deferred'");
  });

  it('atomically claims deliveries with a renewable, token-checked lease', () => {
    expect(migration).toContain('create or replace function public.claim_telegram_report_delivery');
    expect(migration).toContain('on conflict (business_date, target_key, delivery_key) do nothing');
    expect(migration).toContain('for update;');
    expect(migration).toContain("v_delivery.status = 'dispatching'");
    expect(migration).toContain("'outcome', 'manual_review'");
    expect(migration).toContain("status = 'manual_review'");
    expect(migration).toContain("'reason', 'dispatch_lease_expired'");
    expect(migration).toContain('create or replace function public.begin_telegram_report_dispatch');
    expect(migration).toContain('dispatch_started_at');
    expect(migration).toContain('claim_token = p_claim_token');
  });

  it('keeps delivery metadata service-only', () => {
    expect(migration).toMatch(
      /revoke all on table public\.telegram_report_deliveries\s+from public, anon, authenticated;/i,
    );
    expect(migration).toMatch(
      /grant select, insert, update on table public\.telegram_report_deliveries\s+to service_role;/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.claim_telegram_report_delivery[\s\S]*?to service_role;/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.begin_telegram_report_dispatch[\s\S]*?to service_role;/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.complete_telegram_report_delivery[\s\S]*?to service_role;/i,
    );
  });
});
