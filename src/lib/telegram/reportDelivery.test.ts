import { describe, expect, it, vi } from 'vitest';
import { describeUnknownError, retryReportBuild } from './reportDelivery';

describe('describeUnknownError', () => {
  it('keeps Supabase error details instead of returning object Object', () => {
    expect(describeUnknownError({
      code: 'PGRST001',
      message: 'Database request failed',
      details: 'Connection was interrupted',
    })).toBe(
      'message: Database request failed; details: Connection was interrupted; code: PGRST001',
    );
  });
});

describe('retryReportBuild', () => {
  it('retries transient build failures before returning the report', async () => {
    const build = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ message: 'temporary database error' })
      .mockResolvedValue('report');
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(retryReportBuild(build, { sleep })).resolves.toBe('report');
    expect(build).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it('returns a useful error after the final failed attempt', async () => {
    const build = vi.fn<() => Promise<string>>().mockRejectedValue({
      code: '57014',
      message: 'statement timeout',
    });

    await expect(retryReportBuild(build, {
      attempts: 2,
      sleep: async () => undefined,
    })).rejects.toThrow(
      'Report build failed after 2 attempts: message: statement timeout; code: 57014',
    );
  });
});
