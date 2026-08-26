interface QueryError {
  message?: string;
}

interface QueryResult {
  error: QueryError | null;
}

interface RefreshResult {
  error: QueryError | null;
}

interface RefreshableClient {
  auth: {
    refreshSession: () => Promise<RefreshResult>;
  };
}

let refreshInFlight: Promise<boolean> | null = null;

export function isJwtIssuedAtFutureError(error: QueryError | null | undefined) {
  return error?.message?.toLowerCase().includes('jwt issued at future') ?? false;
}

async function refreshSessionOnce(client: RefreshableClient) {
  if (!refreshInFlight) {
    refreshInFlight = client.auth
      .refreshSession()
      .then(({ error }) => !error)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

/**
 * A session can occasionally contain a token issued just ahead of the database
 * server's clock. Refresh it once and repeat the read instead of leaving the UI
 * empty until the user reloads or signs in again.
 */
export async function runWithJwtTimingRetry<T>(
  client: RefreshableClient,
  operation: () => Promise<T>,
): Promise<T> {
  const firstResult = await operation();
  const { error } = firstResult as QueryResult;
  if (!isJwtIssuedAtFutureError(error)) return firstResult;

  const refreshed = await refreshSessionOnce(client);
  if (!refreshed) return firstResult;

  return operation();
}
