import { describe, expect, it } from 'vitest';
import { canEditEntry, canEditEntryForRole, getEditDeadline } from './editWindow';

describe('edit window helpers', () => {
  const now = new Date('2026-06-03T10:25:00.000Z');

  it('allows editing when the entry was created 10 minutes ago', () => {
    expect(canEditEntry('2026-06-03T10:15:00.000Z', now)).toBe(true);
  });

  it('blocks editing when the entry was created 15 minutes ago', () => {
    expect(canEditEntry('2026-06-03T10:10:00.000Z', now)).toBe(false);
  });

  it('blocks editing when the entry was created 16 minutes ago', () => {
    expect(canEditEntry('2026-06-03T10:09:00.000Z', now)).toBe(false);
  });

  it('returns the edit deadline', () => {
    expect(getEditDeadline('2026-06-03T10:10:00.000Z').toISOString()).toBe(
      '2026-06-03T10:25:00.000Z',
    );
  });

  it('allows owners to edit after the 15 minute window', () => {
    expect(canEditEntryForRole('owner', '2026-06-03T09:00:00.000Z', now)).toBe(true);
  });

  it('keeps admins blocked after the 15 minute window', () => {
    expect(canEditEntryForRole('admin', '2026-06-03T10:09:00.000Z', now)).toBe(false);
  });

  it('allows admins inside the 15 minute window', () => {
    expect(canEditEntryForRole('admin', '2026-06-03T10:15:00.000Z', now)).toBe(true);
  });

  it('does not allow viewers to edit entries', () => {
    expect(canEditEntryForRole('viewer', '2026-06-03T10:15:00.000Z', now)).toBe(false);
  });
});
