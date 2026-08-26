import { describe, expect, it } from 'vitest';
import { isMissingDatabaseColumn, isMissingDatabaseFunction } from './errors';

describe('isMissingDatabaseFunction', () => {
  it('recognizes PostgREST missing-function errors', () => {
    expect(isMissingDatabaseFunction({ code: 'PGRST202' }, 'get_dashboard_snapshot')).toBe(true);
    expect(isMissingDatabaseFunction(
      { message: 'Could not find the public.get_dashboard_snapshot function in the schema cache' },
      'get_dashboard_snapshot',
    )).toBe(true);
  });

  it('does not hide unrelated database errors', () => {
    expect(isMissingDatabaseFunction({ code: '42501', message: 'permission denied' }, 'get_dashboard_snapshot')).toBe(false);
  });

  it('recognizes a missing database column without hiding other query failures', () => {
    expect(isMissingDatabaseColumn(
      { code: '42703', message: 'column club_memberships.feature_access does not exist' },
      'feature_access',
    )).toBe(true);
    expect(isMissingDatabaseColumn(
      { code: '42501', message: 'permission denied for feature_access' },
      'feature_access',
    )).toBe(false);
  });
});
