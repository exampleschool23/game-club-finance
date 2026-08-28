-- Make scheduled Telegram delivery observable and concurrency-safe. A row is
-- unique per business date, configured target, and idempotency key. Scheduled
-- runs use the fixed key `scheduled`; intentional resends use `force:<uuid>`.

create table public.telegram_report_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  target_key text not null,
  club_id uuid not null references public.clubs(id),
  chat_id text not null,
  delivery_key text not null,
  status text not null default 'pending',
  claim_token uuid,
  claim_expires_at timestamptz,
  dispatch_started_at timestamptz,
  claim_count integer not null default 0,
  telegram_attempt_count integer not null default 0,
  attempt_history jsonb not null default '[]'::jsonb,
  last_error jsonb,
  retry_not_before timestamptz,
  telegram_result jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_report_deliveries_target_key_check
    check (target_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  constraint telegram_report_deliveries_delivery_key_check
    check (
      delivery_key = 'scheduled'
      or delivery_key ~* '^force:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  constraint telegram_report_deliveries_status_check
    check (status in ('pending', 'claimed', 'dispatching', 'sent', 'failed', 'manual_review')),
  constraint telegram_report_deliveries_claim_count_check
    check (claim_count >= 0),
  constraint telegram_report_deliveries_attempt_count_check
    check (telegram_attempt_count >= 0),
  constraint telegram_report_deliveries_attempt_history_check
    check (jsonb_typeof(attempt_history) = 'array'),
  constraint telegram_report_deliveries_retry_state_check
    check (retry_not_before is null or status = 'failed'),
  constraint telegram_report_deliveries_claim_state_check
    check (
      (status in ('claimed', 'dispatching') and claim_token is not null and claim_expires_at is not null)
      or (status not in ('claimed', 'dispatching') and claim_token is null and claim_expires_at is null)
    ),
  constraint telegram_report_deliveries_dispatch_state_check
    check (
      (status in ('pending', 'claimed') and dispatch_started_at is null)
      or status = 'failed'
      or (status in ('dispatching', 'sent', 'manual_review') and dispatch_started_at is not null)
    ),
  constraint telegram_report_deliveries_sent_state_check
    check (
      (status = 'sent' and sent_at is not null and telegram_result is not null)
      or (status <> 'sent' and sent_at is null)
    ),
  unique (business_date, target_key, delivery_key)
);

create index telegram_report_deliveries_status_date_idx
  on public.telegram_report_deliveries (status, business_date desc);

alter table public.telegram_report_deliveries enable row level security;

-- The ledger contains operational delivery metadata and is only used by the
-- server-side service client. It must never be exposed to browser roles.
revoke all on table public.telegram_report_deliveries
  from public, anon, authenticated;
grant select, insert, update on table public.telegram_report_deliveries
  to service_role;

create or replace function public.claim_telegram_report_delivery(
  p_business_date date,
  p_target_key text,
  p_club_id uuid,
  p_chat_id text,
  p_delivery_key text,
  p_lease_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delivery public.telegram_report_deliveries%rowtype;
  v_claim_token uuid;
begin
  if p_business_date is null then
    raise exception 'Business date is required' using errcode = '22004';
  end if;

  if p_target_key is null or p_target_key !~ '^[a-z][a-z0-9_-]{0,63}$' then
    raise exception 'Invalid Telegram report target key' using errcode = '22023';
  end if;

  if p_club_id is null or p_chat_id is null or btrim(p_chat_id) = '' then
    raise exception 'Club and chat are required' using errcode = '22004';
  end if;

  if p_delivery_key is null or (
    p_delivery_key <> 'scheduled'
    and p_delivery_key !~* '^force:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'Invalid Telegram delivery idempotency key' using errcode = '22023';
  end if;

  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'Telegram delivery lease must be between 30 and 1800 seconds'
      using errcode = '22023';
  end if;

  -- INSERT ... ON CONFLICT serializes concurrent first claims through the
  -- unique index. The following row lock makes reclaim decisions atomic.
  insert into public.telegram_report_deliveries (
    business_date,
    target_key,
    club_id,
    chat_id,
    delivery_key
  ) values (
    p_business_date,
    p_target_key,
    p_club_id,
    p_chat_id,
    p_delivery_key
  )
  on conflict (business_date, target_key, delivery_key) do nothing;

  select delivery.*
  into v_delivery
  from public.telegram_report_deliveries delivery
  where delivery.business_date = p_business_date
    and delivery.target_key = p_target_key
    and delivery.delivery_key = p_delivery_key
  for update;

  if v_delivery.status = 'sent' then
    return jsonb_build_object(
      'outcome', 'already_sent',
      'deliveryId', v_delivery.id,
      'status', v_delivery.status,
      'claimCount', v_delivery.claim_count,
      'sentAt', v_delivery.sent_at,
      'telegramResult', v_delivery.telegram_result
    );
  end if;

  if v_delivery.status = 'manual_review' then
    return jsonb_build_object(
      'outcome', 'manual_review',
      'deliveryId', v_delivery.id,
      'status', v_delivery.status,
      'claimCount', v_delivery.claim_count,
      'dispatchStartedAt', v_delivery.dispatch_started_at,
      'lastError', v_delivery.last_error
    );
  end if;

  if v_delivery.status in ('claimed', 'dispatching') and v_delivery.claim_expires_at > now() then
    return jsonb_build_object(
      'outcome', 'in_progress',
      'deliveryId', v_delivery.id,
      'status', v_delivery.status,
      'claimCount', v_delivery.claim_count,
      'claimExpiresAt', v_delivery.claim_expires_at
    );
  end if;

  -- Once dispatch has started, absence of a Telegram response cannot prove
  -- that the message was not accepted. An expired dispatch is therefore
  -- quarantined for operator review instead of being sent a second time.
  if v_delivery.status = 'dispatching' then
    update public.telegram_report_deliveries
    set
      status = 'manual_review',
      claim_token = null,
      claim_expires_at = null,
      last_error = jsonb_build_object(
        'stage', 'dispatch',
        'message', 'Dispatch lease expired with an unknown Telegram outcome'
      ),
      attempt_history = attempt_history || jsonb_build_array(jsonb_build_object(
        'stage', 'dispatch',
        'outcome', 'manual_review',
        'timestamp', now(),
        'reason', 'dispatch_lease_expired'
      )),
      updated_at = now()
    where id = v_delivery.id
    returning * into v_delivery;

    return jsonb_build_object(
      'outcome', 'manual_review',
      'deliveryId', v_delivery.id,
      'status', v_delivery.status,
      'claimCount', v_delivery.claim_count,
      'dispatchStartedAt', v_delivery.dispatch_started_at,
      'lastError', v_delivery.last_error
    );
  end if;

  if v_delivery.status = 'failed' and v_delivery.retry_not_before > now() then
    return jsonb_build_object(
      'outcome', 'retry_deferred',
      'deliveryId', v_delivery.id,
      'status', v_delivery.status,
      'claimCount', v_delivery.claim_count,
      'retryNotBefore', v_delivery.retry_not_before
    );
  end if;

  v_claim_token := gen_random_uuid();

  update public.telegram_report_deliveries
  set
    club_id = p_club_id,
    chat_id = p_chat_id,
    status = 'claimed',
    claim_token = v_claim_token,
    claim_expires_at = now() + make_interval(secs => p_lease_seconds),
    claim_count = claim_count + 1,
    last_error = null,
    retry_not_before = null,
    dispatch_started_at = null,
    telegram_result = null,
    sent_at = null,
    updated_at = now()
  where id = v_delivery.id
  returning * into v_delivery;

  return jsonb_build_object(
    'outcome', 'claimed',
    'deliveryId', v_delivery.id,
    'status', v_delivery.status,
    'claimToken', v_claim_token,
    'claimCount', v_delivery.claim_count,
    'claimExpiresAt', v_delivery.claim_expires_at
  );
end;
$$;

create or replace function public.begin_telegram_report_dispatch(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delivery public.telegram_report_deliveries%rowtype;
begin
  if p_delivery_id is null or p_claim_token is null then
    raise exception 'Delivery and claim token are required' using errcode = '22004';
  end if;

  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'Telegram dispatch lease must be between 30 and 1800 seconds'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from public.telegram_report_deliveries delivery
  where delivery.id = p_delivery_id
  for update;

  if not found
    or v_delivery.claim_token is distinct from p_claim_token
    or v_delivery.claim_expires_at <= now()
  then
    return false;
  end if;

  -- Idempotent for the same active claim, making an RPC response failure safe
  -- to retry without creating a second dispatch.
  if v_delivery.status = 'dispatching' then
    return true;
  end if;

  if v_delivery.status <> 'claimed' then
    return false;
  end if;

  update public.telegram_report_deliveries
  set
    status = 'dispatching',
    dispatch_started_at = now(),
    claim_expires_at = now() + make_interval(secs => p_lease_seconds),
    updated_at = now()
  where id = p_delivery_id
    and status = 'claimed'
    and claim_token = p_claim_token;

  return found;
end;
$$;

create or replace function public.complete_telegram_report_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_telegram_attempt_count integer,
  p_attempt_history jsonb,
  p_telegram_result jsonb default null,
  p_error jsonb default null,
  p_retry_not_before timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated_count integer;
begin
  if p_delivery_id is null or p_claim_token is null then
    raise exception 'Delivery and claim token are required' using errcode = '22004';
  end if;

  if p_telegram_attempt_count is null or p_telegram_attempt_count < 0 then
    raise exception 'Telegram attempt count cannot be negative' using errcode = '22023';
  end if;

  if p_attempt_history is null or jsonb_typeof(p_attempt_history) <> 'array' then
    raise exception 'Attempt history must be a JSON array' using errcode = '22023';
  end if;

  if p_outcome is null or p_outcome not in ('sent', 'failed', 'manual_review') then
    raise exception 'Invalid Telegram delivery completion outcome' using errcode = '22023';
  end if;

  if p_outcome = 'sent' and p_telegram_result is null then
    raise exception 'A successful delivery requires a Telegram result' using errcode = '22004';
  end if;

  if p_outcome <> 'sent' and p_error is null then
    raise exception 'A failed delivery requires an error payload' using errcode = '22004';
  end if;

  if p_outcome <> 'failed' and p_retry_not_before is not null then
    raise exception 'Only a definite failed delivery can have a retry delay' using errcode = '22023';
  end if;

  update public.telegram_report_deliveries
  set
    status = p_outcome,
    claim_token = null,
    claim_expires_at = null,
    telegram_attempt_count = telegram_attempt_count + p_telegram_attempt_count,
    attempt_history = attempt_history || p_attempt_history,
    last_error = case when p_outcome = 'sent' then null else p_error end,
    retry_not_before = case when p_outcome = 'failed' then p_retry_not_before else null end,
    telegram_result = case when p_outcome = 'sent' then p_telegram_result else null end,
    sent_at = case when p_outcome = 'sent' then now() else null end,
    updated_at = now()
  where id = p_delivery_id
    and claim_token = p_claim_token
    and (
      (p_outcome = 'failed' and status in ('claimed', 'dispatching'))
      or (p_outcome in ('sent', 'manual_review') and status = 'dispatching')
    );

  get diagnostics v_updated_count = row_count;
  return v_updated_count = 1;
end;
$$;

revoke all on function public.claim_telegram_report_delivery(date, text, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_telegram_report_delivery(date, text, uuid, text, text, integer)
  to service_role;

revoke all on function public.begin_telegram_report_dispatch(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.begin_telegram_report_dispatch(uuid, uuid, integer)
  to service_role;

revoke all on function public.complete_telegram_report_delivery(uuid, uuid, text, integer, jsonb, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_telegram_report_delivery(uuid, uuid, text, integer, jsonb, jsonb, jsonb, timestamptz)
  to service_role;

comment on table public.telegram_report_deliveries is
  'Service-only ledger for idempotent, observable Telegram daily-report delivery.';
comment on function public.claim_telegram_report_delivery(date, text, uuid, text, text, integer) is
  'Atomically claims a scheduled or explicitly idempotent forced Telegram report delivery.';
comment on function public.begin_telegram_report_dispatch(uuid, uuid, integer) is
  'Durably marks the point after which an interrupted Telegram outcome is ambiguous.';
comment on function public.complete_telegram_report_delivery(uuid, uuid, text, integer, jsonb, jsonb, jsonb, timestamptz) is
  'Finalizes a claimed Telegram delivery and persists its structured attempt history.';
