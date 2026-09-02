interface DeleteTelegramMessageOptions {
  botToken: string;
  chatId: string;
  messageId: number;
  fetchImpl?: typeof fetch;
}
interface TelegramDeleteResponse {
  ok?: boolean;
  result?: boolean;
  description?: string;
}

export async function deleteTelegramMessage({
  botToken,
  chatId,
  messageId,
  fetchImpl = fetch,
}: DeleteTelegramMessageOptions): Promise<void> {
  const response = await fetchImpl(
    `https://api.telegram.org/bot${botToken}/deleteMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    },
  );
  const payload = await response.json().catch(() => null) as TelegramDeleteResponse | null;

  if (response.ok && payload?.ok === true && payload.result === true) return;

  // Deletion is idempotent from the application's perspective: if the message
  // is already absent, there is nothing left to clean up in Telegram.
  if (payload?.description?.toLowerCase().includes('message to delete not found')) return;

  throw new Error(payload?.description || `Telegram deleteMessage failed with HTTP ${response.status}`);
}
