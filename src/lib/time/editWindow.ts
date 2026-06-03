const MINUTE_MS = 60_000;

type DateInput = string | Date;
type EntryEditorRole = 'owner' | 'admin' | 'viewer' | string | null | undefined;

export function getEditDeadline(createdAt: DateInput, windowMinutes = 15): Date {
  return new Date(new Date(createdAt).getTime() + windowMinutes * MINUTE_MS);
}

export function canEditEntry(
  createdAt: DateInput,
  now: DateInput = new Date(),
  windowMinutes = 15,
): boolean {
  return new Date(now).getTime() < getEditDeadline(createdAt, windowMinutes).getTime();
}

export function canEditEntryForRole(
  role: EntryEditorRole,
  createdAt: DateInput,
  now: DateInput = new Date(),
  windowMinutes = 15,
): boolean {
  if (role === 'owner') return true;
  if (role === 'admin') return canEditEntry(createdAt, now, windowMinutes);
  return false;
}
