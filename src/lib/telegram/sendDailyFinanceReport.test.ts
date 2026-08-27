import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendTelegramMessage } from './sendDailyFinanceReport';

describe('sendTelegramMessage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries with the new chat id when Telegram upgrades a group', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          ok: false,
          error_code: 400,
          description: 'Bad Request: group chat was upgraded to a supergroup chat',
          parameters: { migrate_to_chat_id: -1001234567890 },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            message_id: 42,
            chat: { id: -1001234567890, title: 'Pixel', type: 'supergroup' },
            date: 1_787_799_537,
          },
        }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendTelegramMessage({
      botToken: 'test-token',
      chatId: '-1234567890',
      text: 'daily report',
    });

    expect(result.result.message_id).toBe(42);
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual([
      'chat_migrated',
      'sent',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      chat_id: '-1001234567890',
      text: 'daily report',
    });
  });

  it('retries server failures with bounded exponential backoff', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          ok: false,
          error_code: 503,
          description: 'Service Unavailable',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: {
            message_id: 43,
            chat: { id: -1001, title: 'Main', type: 'supergroup' },
            date: 1_787_799_538,
          },
        }),
      } as Response);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await sendTelegramMessage({
      botToken: 'test-token',
      chatId: '-1001',
      text: 'daily report',
      fetchImpl: fetchMock,
      sleep,
      baseDelayMs: 400,
    });

    expect(result.result.message_id).toBe(43);
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual(['server_error', 'sent']);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(400);
  });

  it('quarantines a bare gateway 502 instead of retrying it', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => null,
    } as Response);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const promise = sendTelegramMessage({
      botToken: 'test-token',
      chatId: '-1001',
      text: 'daily report',
      fetchImpl: fetchMock,
      sleep,
    });

    await expect(promise).rejects.toMatchObject({
      requiresManualReview: true,
      retryable: false,
      attempts: [expect.objectContaining({
        outcome: 'invalid_response',
        httpStatus: 502,
        retryDelayMs: null,
      })],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('honors Telegram retry_after when rate limited', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          ok: false,
          error_code: 429,
          description: 'Too Many Requests',
          parameters: { retry_after: 3 },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: {
            message_id: 44,
            chat: { id: -1002, type: 'supergroup' },
            date: 1_787_799_539,
          },
        }),
      } as Response);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await sendTelegramMessage({
      botToken: 'test-token',
      chatId: '-1002',
      text: 'daily report',
      fetchImpl: fetchMock,
      sleep,
      baseDelayMs: 100,
    });

    expect(sleep).toHaveBeenCalledWith(3_000);
    expect(result.attempts[0]).toMatchObject({
      outcome: 'rate_limited',
      retryAfterSeconds: 3,
      retryDelayMs: 3_000,
    });
  });

  it('fails retryably instead of violating a retry_after beyond the invocation limit', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        ok: false,
        error_code: 429,
        description: 'Too Many Requests',
        parameters: { retry_after: 45 },
      }),
    } as Response);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const promise = sendTelegramMessage({
      botToken: 'test-token',
      chatId: '-1002',
      text: 'daily report',
      fetchImpl: fetchMock,
      sleep,
      maxInProcessRetryDelayMs: 10_000,
    });

    await expect(promise).rejects.toMatchObject({
      retryable: true,
      retryAfterSeconds: 45,
      attempts: [expect.objectContaining({
        outcome: 'rate_limited',
        retryAfterSeconds: 45,
        retryDelayMs: null,
      })],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('quarantines a 2xx response with missing Telegram success JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const promise = sendTelegramMessage({
      botToken: 'test-token',
      chatId: '-1002',
      text: 'daily report',
      fetchImpl: fetchMock,
      sleep,
    });

    await expect(promise).rejects.toMatchObject({
      requiresManualReview: true,
      retryable: false,
      attempts: [expect.objectContaining({
        outcome: 'invalid_response',
        retryDelayMs: null,
      })],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry permanent Telegram client errors', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        ok: false,
        error_code: 400,
        description: 'Bad Request: chat not found',
      }),
    } as Response);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const promise = sendTelegramMessage({
      botToken: 'test-token',
      chatId: '-1003',
      text: 'daily report',
      fetchImpl: fetchMock,
      sleep,
    });

    await expect(promise).rejects.toMatchObject({
      name: 'TelegramSendError',
      retryable: false,
      attempts: [expect.objectContaining({ outcome: 'client_error' })],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('aborts a stalled request at the configured timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    }));

    const promise = sendTelegramMessage({
      botToken: 'test-token',
      chatId: '-1004',
      text: 'daily report',
      fetchImpl: fetchMock,
      maxAttempts: 1,
      timeoutMs: 250,
    });
    const assertion = expect(promise).rejects.toMatchObject({
      requiresManualReview: true,
      retryable: false,
      attempts: [expect.objectContaining({ outcome: 'timeout' })],
    });

    await vi.advanceTimersByTimeAsync(250);
    await assertion;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not retry an ambiguous network failure', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('socket reset'));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const promise = sendTelegramMessage({
      botToken: 'test-token',
      chatId: '-1005',
      text: 'daily report',
      fetchImpl: fetchMock,
      sleep,
    });

    await expect(promise).rejects.toMatchObject({
      requiresManualReview: true,
      retryable: false,
      attempts: [expect.objectContaining({
        outcome: 'network_error',
        retryDelayMs: null,
      })],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });
});
