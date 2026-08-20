import { describe, expect, it } from 'vitest';
import { isMissingDatabaseFunction } from './errors';

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
});
