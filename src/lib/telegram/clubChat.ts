const TARGETS = [
  ['TELEGRAM_PIXEL_CLUB_ID', 'TELEGRAM_PIXEL_CHAT_ID'],
  ['TELEGRAM_MAIN_CLUB_ID', 'TELEGRAM_MAIN_CHAT_ID'],
  ['TELEGRAM_BUNKER_CLUB_ID', 'TELEGRAM_BUNKER_CHAT_ID'],
] as const;

/** Telegram group configured for a club, or null when the club has none. */
export function targetChatId(clubId: string): string | null {
  for (const [clubKey, chatKey] of TARGETS) {
    if (process.env[clubKey] === clubId) return process.env[chatKey] ?? null;
  }
  return null;
}
