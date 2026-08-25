import { describe, expect, it } from 'vitest';
import {
  canAccessPath,
  defaultPathForAccess,
  featureAccessForMembership,
  featureForPath,
  normalizeFeatureAccess,
  updateFeatureAccessSelection,
} from './permissions';

describe('feature permissions', () => {
  it('keeps current role defaults until an owner saves an explicit list', () => {
    expect(featureAccessForMembership('admin', null)).toContain('expenses');
    expect(featureAccessForMembership('viewer', null)).not.toContain('expenses');
    expect(featureAccessForMembership('admin', [])).toEqual([]);
  });

  it('normalizes unknown and duplicate feature keys', () => {
    expect(normalizeFeatureAccess(['reports', 'unknown', 'reports', 'dashboard'])).toEqual([
      'dashboard',
      'reports',
    ]);
  });

  it('updates an explicit selection in stable display order', () => {
    expect(updateFeatureAccessSelection(['reports'], 'dashboard', true)).toEqual(['dashboard', 'reports']);
    expect(updateFeatureAccessSelection(['dashboard', 'reports'], 'dashboard', false)).toEqual(['reports']);
  });

  it('maps detail and legacy routes to their parent feature', () => {
    expect(featureForPath('/game-club-money-details')).toBe('dashboard');
    expect(featureForPath('/monthly-report')).toBe('reports');
    expect(featureForPath('/expense')).toBe('expenses');
  });

  it('guards paths and picks the first allowed destination', () => {
    expect(canAccessPath('admin', ['reports'], '/expenses')).toBe(false);
    expect(canAccessPath('admin', ['reports'], '/reports')).toBe(true);
    expect(defaultPathForAccess('admin', ['reports'])).toBe('/reports');
  });

  it('always gives owners full access and keeps Team owner-only', () => {
    expect(canAccessPath('owner', [], '/expenses')).toBe(true);
    expect(canAccessPath('admin', ['team'], '/team')).toBe(false);
  });
});
