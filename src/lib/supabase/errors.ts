export function isMissingDatabaseFunction(
  error: { code?: string; message?: string } | null | undefined,
  functionName: string,
): boolean {
  if (!error) return false;
  return error.code === 'PGRST202'
    || (error.message?.includes(functionName) && error.message.includes('function'))
    || false;
}

export function isMissingDatabaseColumn(
  error: { code?: string; message?: string } | null | undefined,
  columnName: string,
): boolean {
  if (!error) return false;
  return error.code === '42703'
    && (error.message?.includes(columnName) ?? false);
}
