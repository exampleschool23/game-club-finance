-- Move the Game Club daily-finance report's primary schedule to Supabase.
--
-- Before applying this migration, store the same CRON_SECRET used by Vercel:
--
--   select vault.create_secret(
--     '<the Vercel CRON_SECRET value>',
--     'game_club_daily_report_cron_secret',
--     'Bearer token used by the Game Club daily finance report cron'
--   );
--
-- pg_cron uses UTC. 01:00 UTC is 06:00 in Asia/Tashkent (UTC+05:00).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.telegram_report_deliveries
  add column if not exists attempted_at timestamptz,
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_message_id bigint,
  add column if not exists delivery_format text;

alter table public.telegram_report_deliveries
  drop constraint if exists telegram_report_deliveries_delivery_format_check;
alter table public.telegram_report_deliveries
  add constraint telegram_report_deliveries_delivery_format_check
  check (delivery_format is null or delivery_format in ('photo', 'text'));

create or replace function public.sync_telegram_report_delivery_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.dispatch_started_at is null then
    new.attempted_at := null;
  elsif new.attempted_at is null or new.dispatch_started_at is distinct from old.dispatch_started_at then
    new.attempted_at := new.dispatch_started_at;
  end if;

  if new.status = 'sent' then
    if nullif(new.telegram_result ->> 'messageId', '') is null then
      raise exception 'A sent Telegram delivery requires a message ID' using errcode = '22004';
    end if;

    new.telegram_message_id := (new.telegram_result ->> 'messageId')::bigint;
    new.telegram_chat_id := (new.telegram_result ->> 'chatId')::bigint;
    new.delivery_format := coalesce(new.telegram_result ->> 'deliveryType', new.delivery_format);

    if new.delivery_format not in ('photo', 'text') then
      raise exception 'A sent Telegram delivery requires its actual format' using errcode = '22023';
    end if;
  else
    new.telegram_message_id := null;
    new.telegram_chat_id := null;
    new.delivery_format := null;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_telegram_report_delivery_audit
  on public.telegram_report_deliveries;
create trigger sync_telegram_report_delivery_audit
before update on public.telegram_report_deliveries
for each row execute function public.sync_telegram_report_delivery_audit();

update public.telegram_report_deliveries
set
  attempted_at = dispatch_started_at,
  telegram_chat_id = case
    when status = 'sent' and nullif(telegram_result ->> 'chatId', '') is not null
      then (telegram_result ->> 'chatId')::bigint
    else null
  end,
  telegram_message_id = case
    when status = 'sent' and nullif(telegram_result ->> 'messageId', '') is not null
      then (telegram_result ->> 'messageId')::bigint
    else null
  end,
  delivery_format = case
    when status = 'sent' then coalesce(telegram_result ->> 'deliveryType', 'text')
    else null
  end;

revoke all on function public.sync_telegram_report_delivery_audit()
  from public, anon, authenticated;

create or replace function public.invoke_game_club_daily_finance_report()
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  cron_secret text;
  request_id bigint;
begin
  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'game_club_daily_report_cron_secret'
  order by created_at desc
  limit 1;

  if nullif(btrim(cron_secret), '') is null then
    raise exception 'Missing Vault secret: game_club_daily_report_cron_secret';
  end if;

  select net.http_get(
    url := 'https://game-club-finance.vercel.app/api/cron/daily-finance-report',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Accept', 'application/json',
      'User-Agent', 'Game-Club-Supabase-Cron/1.0'
    ),
    timeout_milliseconds := 60000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_game_club_daily_finance_report()
  from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'game-club-daily-finance-report'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'game-club-daily-finance-report',
    '0 1 * * *',
    'select public.invoke_game_club_daily_finance_report();'
  );
end;
$$;

comment on column public.telegram_report_deliveries.delivery_format is
  'Actual successful Telegram transport; message deletion in Telegram does not alter this ledger.';
