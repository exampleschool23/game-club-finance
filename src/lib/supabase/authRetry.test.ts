import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isJwtIssuedAtFutureError, runWithJwtTimingRetry } from './authRetry';

describe('runWithJwtTimingRetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('recognizes JWT clock errors case-insensitively', () => {
    expect(isJwtIssuedAtFutureError({ message: 'JWT issued at future' })).toBe(true);
    expect(isJwtIssuedAtFutureError({ message: 'jwt ISSUED at FUTURE' })).toBe(true);
    expect(isJwtIssuedAtFutureError({ message: 'permission denied' })).toBe(false);
  });

  it('refreshes and retries after a JWT clock error', async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'JWT issued at future' } })
      .mockResolvedValueOnce({ data: ['product'], error: null });
    const refreshSession = vi.fn().mockResolvedValue({ error: null });

    const result = await runWithJwtTimingRetry({ auth: { refreshSession } }, operation);

    expect(refreshSession).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ data: ['product'], error: null });
  });

  it('does not retry unrelated errors', async () => {
    const resultWithError = { data: null, error: { message: 'permission denied' } };
    const operation = vi.fn().mockResolvedValue(resultWithError);
    const refreshSession = vi.fn().mockResolvedValue({ error: null });

    const result = await runWithJwtTimingRetry({ auth: { refreshSession } }, operation);

    expect(refreshSession).not.toHaveBeenCalled();
    expect(operation).toHaveBeenCalledOnce();
    expect(result).toBe(resultWithError);
  });

  it('deduplicates concurrent refreshes', async () => {
    let resolveRefresh: ((value: RefreshResult) => void) | undefined;
    type RefreshResult = { error: null };
    const refreshSession = vi.fn(() => new Promise<RefreshResult>((resolve) => {
      resolveRefresh = resolve;
    }));
    const firstOperation = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: 'JWT issued at future' } })
      .mockResolvedValueOnce({ error: null });
    const secondOperation = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: 'JWT issued at future' } })
      .mockResolvedValueOnce({ error: null });

    const first = runWithJwtTimingRetry({ auth: { refreshSession } }, firstOperation);
    const second = runWithJwtTimingRetry({ auth: { refreshSession } }, secondOperation);
    await vi.waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
    resolveRefresh?.({ error: null });

    await expect(Promise.all([first, second])).resolves.toEqual([{ error: null }, { error: null }]);
    expect(firstOperation).toHaveBeenCalledTimes(2);
    expect(secondOperation).toHaveBeenCalledTimes(2);
  });
});
