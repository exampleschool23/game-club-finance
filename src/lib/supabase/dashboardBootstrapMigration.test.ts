import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/048_dashboard_bootstrap_snapshot.sql'),
  'utf8',
);

describe('dashboard bootstrap snapshot migration', () => {
  it('uses the authenticated user identity and invoker RLS', () => {
    expect(migration).toContain('v_user_id uuid := auth.uid()');
    expect(migration).toContain('security invoker');
    expect(migration).toContain('membership.user_id = v_user_id');
    expect(migration).toContain('profile.id = v_user_id');
  });

  it('returns profile, membership access, and club configuration together', () => {
    expect(migration).toContain("'profile'");
    expect(migration).toContain("'memberships'");
    expect(migration).toContain("'feature_access', membership.feature_access");
    expect(migration).toContain("'business_day_start_hour', club.business_day_start_hour");
    expect(migration).toContain("'enabled_payment_methods', club.enabled_payment_methods");
  });

  it('does not expose the function to anonymous callers', () => {
    expect(migration).toMatch(
      /revoke all on function public\.get_dashboard_bootstrap\(\) from public, anon;/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.get_dashboard_bootstrap\(\) to authenticated;/i,
    );
  });
});
