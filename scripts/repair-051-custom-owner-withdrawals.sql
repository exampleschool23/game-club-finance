-- Manual SQL Editor repair for migration 051 when the withdrawal function already exists.
-- Run the entire script. Preserves ledger rows and applies both function definitions atomically.
-- Does not update Supabase CLI migration history.
begin;

create or replace function public.enforce_owner_withdrawal_month_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_month date := date_trunc(
    'month',
    now() at time zone 'Asia/Tashkent'
  )::date;
  withdrawn_in_month numeric := 0;
  available_in_month numeric := 0;
begin
  if NEW.period_month <> date_trunc('month', NEW.period_month)::date then
    raise exception 'Owner withdrawal period must be the first day of a calendar month'
      using errcode = '23514';
  end if;

  if NEW.period_month > current_month then
    raise exception 'Owner withdrawal month cannot be in the future'
      using errcode = '22008';
  end if;

  -- Serialize only the selected club/source/month bucket. Concurrent requests
  -- for unrelated sources or months remain independent.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      NEW.club_id::text || ':' || NEW.source || ':' || NEW.period_month::text,
      0
    )
  );

  select coalesce(sum(amount), 0)
  into withdrawn_in_month
  from public.owner_withdrawals
  where club_id = NEW.club_id
    and source = NEW.source
    and period_month = NEW.period_month;

  available_in_month := public.owner_source_earned_for_month(
    NEW.club_id,
    NEW.source,
    NEW.period_month
  ) - withdrawn_in_month;

  if available_in_month <= 0 then
    raise exception 'No positive % balance is available for %',
      NEW.source, NEW.period_month
      using errcode = '23514';
  end if;

  if NEW.amount is null or NEW.amount <= 0 or NEW.amount::text in ('NaN', 'Infinity', '-Infinity')
    or NEW.amount > available_in_month then
    raise exception 'Withdrawal (%) must be positive and not exceed the available % balance (%) for %',
      NEW.amount, NEW.source, available_in_month, NEW.period_month
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

revoke all on function public.enforce_owner_withdrawal_month_balance()
  from public, anon, authenticated;

-- Keep the take-all RPC for older clients. Custom withdrawals, including an
-- All-source allocation, commit in one transaction under the same bucket locks.
create or replace function public.withdraw_owner_money_for_month(
  p_club_id uuid,
  p_period_month date,
  p_source text,
  p_amount numeric,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  bucket text;
  available numeric;
  remaining numeric := p_amount;
  allocated numeric;
begin
  if auth.uid() is null
    or public.current_user_club_role(p_club_id) is distinct from 'owner'::public.user_role then
    raise exception 'Only a club owner can take owner money' using errcode = '42501';
  end if;
  if p_period_month is null or p_period_month <> date_trunc('month', p_period_month)::date
    or p_source is null or p_source not in ('all', 'game_club', 'bar')
    or p_amount is null or p_amount <= 0 or p_amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Invalid withdrawal month, source or amount' using errcode = '23514';
  end if;

  -- Always acquire multiple bucket locks in this order to avoid deadlocks.
  foreach bucket in array array['game_club', 'bar'] loop
    if p_source = 'all' or p_source = bucket then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        p_club_id::text || ':' || bucket || ':' || p_period_month::text, 0));
    end if;
  end loop;

  foreach bucket in array array['game_club', 'bar'] loop
    if (p_source = 'all' or p_source = bucket) and remaining > 0 then
      select public.owner_source_earned_for_month(p_club_id, bucket, p_period_month)
        - coalesce(sum(amount), 0) into available
      from public.owner_withdrawals
      where club_id = p_club_id and source = bucket and period_month = p_period_month;
      allocated := least(remaining, greatest(0, available));
      if allocated > 0 then
        insert into public.owner_withdrawals (club_id, period_month, source, amount, comment, created_by)
        values (p_club_id, p_period_month, bucket, allocated, nullif(btrim(p_comment), ''), auth.uid());
        remaining := remaining - allocated;
      end if;
    end if;
  end loop;
  if remaining > 0 then
    -- Raising rolls back every allocation, including the first source.
    raise exception 'Withdrawal exceeds available profit' using errcode = '23514';
  end if;
end;
$$;
revoke all on function public.withdraw_owner_money_for_month(uuid, date, text, numeric, text) from public, anon;
grant execute on function public.withdraw_owner_money_for_month(uuid, date, text, numeric, text) to authenticated;

commit;
