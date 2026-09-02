-- Keep the coordinates of each instant expense notification so deleting the
-- expense can delete the corresponding Telegram message as well.

alter table public.expenses
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_message_id bigint;

alter table public.expenses
  drop constraint if exists expenses_telegram_message_coordinates_check;
alter table public.expenses
  add constraint expenses_telegram_message_coordinates_check
  check (
    (telegram_chat_id is null and telegram_message_id is null)
    or (nullif(btrim(telegram_chat_id), '') is not null and telegram_message_id > 0)
  );
