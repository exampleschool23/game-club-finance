-- Owner withdrawals belong to independent calendar-month buckets. A withdrawal
-- must take the full positive balance remaining for one source in that month;
-- earnings retained in a different month cannot cover it.

drop trigger if exists trg_owner_withdrawal_overdraft on public.owner_withdrawals;
drop function if exists public.prevent_owner_withdrawal_overdraft();

drop index if exists public.idx_owner_withdrawals_club_source_date;

alter table public.owner_withdrawals
  add column period_month date;

update public.owner_withdrawals
set period_month = date_trunc('month', date)::date;

alter table public.owner_withdrawals
  alter column period_month set not null,
  alter column period_month set default
    (date_trunc('month', now() at time zone 'Asia/Tashkent')::date),
  drop column date;

alter table public.owner_withdrawals
  add constraint owner_withdrawals_period_month_check
  check (period_month = date_trunc('month', period_month)::date);

create index idx_owner_withdrawals_club_source_period_month
  on public.owner_withdrawals(club_id, source, period_month, created_at);

drop function if exists public.owner_source_earned_through(uuid, text, date);

create function public.owner_source_earned_for_month(
  p_club_id uuid,
  p_source text,
  p_period_month date
)
returns numeric
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  month_start date := date_trunc('month', p_period_month)::date;
  next_month date := (date_trunc('month', p_period_month) + interval '1 month')::date;
  earned numeric := 0;
  source_costs numeric := 0;
begin
  if p_period_month <> month_start then
    raise exception 'Owner withdrawal period must be the first day of a calendar month'
      using errcode = '23514';
  end if;

  if p_source = 'game_club' then
    select coalesce(sum(
      coalesce(cash_income, 0)
      + coalesce(terminal_income, 0)
      + coalesce(card_income, 0)
      + coalesce(playstation_income, 0)
    ), 0)
    into earned
    from public.daily_cash_entries
    where club_id = p_club_id
      and date >= month_start
      and date < next_month;

    select earned + coalesce(sum(amount), 0)
    into earned
    from public.debt_payments
    where club_id = p_club_id
      and date >= month_start
      and date < next_month;

    select coalesce(sum(amount), 0)
    into source_costs
    from public.expenses
    where club_id = p_club_id
      and payment_source = 'game_club'
      and date >= month_start
      and date < next_month;
  elsif p_source = 'bar' then
    select coalesce(sum(bar_income), 0)
    into earned
    from public.daily_stock_counts
    where club_id = p_club_id
      and date >= month_start
      and date < next_month;

    -- Keep stock purchases and bar expenses as independent aggregates so bar
    -- expenses are deducted even when no purchase exists in this month.
    select coalesce(sum(quantity * cost_price), 0)
    into source_costs
    from public.stock_purchases
    where club_id = p_club_id
      and date >= greatest(month_start, date '2026-07-02')
      and date < next_month;

    select source_costs + coalesce(sum(amount), 0)
    into source_costs
    from public.expenses
    where club_id = p_club_id
      and payment_source = 'bar'
      and date >= month_start
      and date < next_month;
  else
    raise exception 'Unknown owner withdrawal source: %', p_source
      using errcode = '23514';
  end if;

  return earned - source_costs;
end;
$$;

-- Internal trigger helper only. It must not be callable as an RPC because that
-- would expose club financial aggregates outside table RLS.
revoke all on function public.owner_source_earned_for_month(uuid, text, date)
  from public, anon, authenticated;

create function public.enforce_owner_withdrawal_month_balance()
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

  if NEW.amount <> available_in_month then
    raise exception 'Withdrawal (%) must equal the full available % balance (%) for %',
      NEW.amount, NEW.source, available_in_month, NEW.period_month
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

revoke all on function public.enforce_owner_withdrawal_month_balance()
  from public, anon, authenticated;

create trigger trg_owner_withdrawal_month_balance
  before insert on public.owner_withdrawals
  for each row execute function public.enforce_owner_withdrawal_month_balance();

-- The client deliberately does not send an amount. PostgreSQL calculates and
-- inserts the exact numeric balance in one transaction, avoiding stale browser
-- values and floating-point rounding differences.
create function public.take_all_owner_money_for_month(
  p_club_id uuid,
  p_period_month date,
  p_source text,
  p_comment text default null
)
returns public.owner_withdrawals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  withdrawn_in_month numeric := 0;
  available_in_month numeric := 0;
  inserted_withdrawal public.owner_withdrawals%rowtype;
begin
  if auth.uid() is null
    or public.current_user_club_role(p_club_id) is distinct from 'owner'::public.user_role then
    raise exception 'Only a club owner can take owner money'
      using errcode = '42501';
  end if;

  if p_period_month <> date_trunc('month', p_period_month)::date then
    raise exception 'Owner withdrawal period must be the first day of a calendar month'
      using errcode = '23514';
  end if;

  if p_source not in ('game_club', 'bar') then
    raise exception 'Unknown owner withdrawal source: %', p_source
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_club_id::text || ':' || p_source || ':' || p_period_month::text,
      0
    )
  );

  select coalesce(sum(amount), 0)
  into withdrawn_in_month
  from public.owner_withdrawals
  where club_id = p_club_id
    and source = p_source
    and period_month = p_period_month;

  available_in_month := public.owner_source_earned_for_month(
    p_club_id,
    p_source,
    p_period_month
  ) - withdrawn_in_month;

  if available_in_month <= 0 then
    raise exception 'No positive % balance is available for %',
      p_source, p_period_month
      using errcode = '23514';
  end if;

  insert into public.owner_withdrawals (
    club_id,
    period_month,
    source,
    amount,
    comment,
    created_by
  ) values (
    p_club_id,
    p_period_month,
    p_source,
    available_in_month,
    nullif(btrim(p_comment), ''),
    auth.uid()
  )
  returning * into inserted_withdrawal;

  return inserted_withdrawal;
end;
$$;

revoke all on function public.take_all_owner_money_for_month(uuid, date, text, text)
  from public, anon;
grant execute on function public.take_all_owner_money_for_month(uuid, date, text, text)
  to authenticated;

-- Existing RLS policies and grants remain in force: club members can read,
-- only owners can insert/delete, and the immutable UPDATE trigger from 027
-- prevents existing ledger rows from being rewritten.
