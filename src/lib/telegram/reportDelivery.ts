export function describeUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  if (error && typeof error === 'object') {
    const details = error as Record<string, unknown>;
    const preferredFields = ['message', 'details', 'hint', 'code']
      .filter((field) => details[field] !== undefined)
      .map((field) => `${field}: ${String(details[field])}`);

    if (preferredFields.length > 0) return preferredFields.join('; ');

    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown object error';
    }
  }

  return String(error);
}

export async function retryReportBuild<T>(
  build: () => Promise<T>,
  {
    attempts = 3,
    delayMs = 250,
    sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  }: {
    attempts?: number;
    delayMs?: number;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await build();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs * attempt);
    }
  }

  throw new Error(
    `Report build failed after ${attempts} attempts: ${describeUnknownError(lastError)}`,
  );
}
