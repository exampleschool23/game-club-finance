import { describe, expect, it, vi } from 'vitest';
import { deleteTelegramMessage } from './deleteTelegramMessage';

describe('deleteTelegramMessage', () => {
  it('deletes the exact chat message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true, result: true }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    await deleteTelegramMessage({ botToken: 'token', chatId: '-1001', messageId: 42, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.telegram.org/bottoken/deleteMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '-1001', message_id: 42 }),
      }),
    );
  });

  it('treats an already missing message as deleted', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error_code: 400,
      description: 'Bad Request: message to delete not found',
    }), { status: 400, headers: { 'content-type': 'application/json' } }));

    await expect(deleteTelegramMessage({
      botToken: 'token',
      chatId: '-1001',
      messageId: 42,
      fetchImpl,
    })).resolves.toBeUndefined();
  });

  it('surfaces a Telegram refusal', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error_code: 400,
      description: "Bad Request: message can't be deleted",
    }), { status: 400, headers: { 'content-type': 'application/json' } }));

    await expect(deleteTelegramMessage({
      botToken: 'token',
      chatId: '-1001',
      messageId: 42,
      fetchImpl,
    })).rejects.toThrow("message can't be deleted");
  });
});
