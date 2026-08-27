import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendTelegramMessage } from './sendDailyFinanceReport';

describe('sendTelegramMessage', () => {
  afterEach(() => {
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      chat_id: '-1001234567890',
      text: 'daily report',
    });
  });
});
