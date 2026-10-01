-- Owner withdrawals are an immutable, source-specific ledger. Money that is
-- not withdrawn remains available across month boundaries without being counted
-- as income a second time.

create table if not exists public.owner_withdrawals (
  id uuid primary key default uuid_generate_v4(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  date date not null default ((now() at time zone 'Asia/Tashkent')::date),
  source text not null,
  amount numeric not null,
  payment_method text not null default 'cash',
  comment text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_withdrawals_source_check
    check (source in ('game_club', 'bar')),
  constraint owner_withdrawals_amount_check
    check (amount > 0),
  constraint owner_withdrawals_payment_method_check
    check (payment_method in ('terminal', 'cash', 'card'))
);

create index if not exists idx_owner_withdrawals_club_source_date
  on public.owner_withdrawals(club_id, source, date, created_at);

alter table public.owner_withdrawals enable row level security;

create policy "club_members_read_owner_withdrawals"
  on public.owner_withdrawals
  for select
  using (public.user_has_club_access(club_id));

create policy "club_owners_insert_owner_withdrawals"
  on public.owner_withdrawals
  for insert
  with check (
    public.current_user_club_role(club_id) = 'owner'
    and created_by = auth.uid()
  );

create policy "club_owners_delete_owner_withdrawals"
  on public.owner_withdrawals
  for delete
  using (public.current_user_club_role(club_id) = 'owner');

-- No UPDATE policy or grant is provided: corrections are delete-and-replace
-- ledger operations, so an existing entry cannot be silently rewritten.
revoke all on table public.owner_withdrawals from anon, authenticated;
grant select, insert, delete on table public.owner_withdrawals to authenticated;

create or replace function public.owner_source_earned_through(
  p_club_id uuid,
  p_source text,
  p_through_date date
)
returns numeric
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  earned numeric := 0;
  source_costs numeric := 0;
begin
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
      and date <= p_through_date;

    select earned + coalesce(sum(amount), 0)
    into earned
    from public.debt_payments
    where club_id = p_club_id
      and date <= p_through_date;

    select coalesce(sum(amount), 0)
    into source_costs
    from public.expenses
    where club_id = p_club_id
      and payment_source = 'game_club'
      and date <= p_through_date;
  elsif p_source = 'bar' then
    select coalesce(sum(bar_income), 0)
    into earned
    from public.daily_stock_counts
    where club_id = p_club_id
      and date <= p_through_date;

    -- Keep these as independent aggregates so bar expenses are deducted even
    -- when the club has never recorded a stock purchase.
    select coalesce(sum(quantity * cost_price), 0)
    into source_costs
    from public.stock_purchases
    where club_id = p_club_id
      and date >= date '2026-07-02'
      and date <= p_through_date;

    select source_costs + coalesce(sum(amount), 0)
    into source_costs
    from public.expenses
    where club_id = p_club_id
      and payment_source = 'bar'
      and date <= p_through_date;
  else
    raise exception 'Unknown owner withdrawal source: %', p_source
      using errcode = '23514';
  end if;

  return earned - source_costs;
end;
$$;

-- This is an internal consistency helper used by the insert trigger. Exposing
-- it as an RPC could bypass the table's club-membership visibility boundary.
revoke all on function public.owner_source_earned_through(uuid, text, date)
  from public, anon, authenticated;

create or replace function public.prevent_owner_withdrawal_overdraft()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  local_today date := (now() at time zone 'Asia/Tashkent')::date;
  withdrawn_through_date numeric := 0;
  withdrawn_current numeric := 0;
  available_through_date numeric := 0;
  available_current numeric := 0;
begin
  if NEW.date > local_today then
    raise exception 'Owner withdrawal date cannot be in the future'
      using errcode = '22008';
  end if;

  -- Serialize withdrawals for the same club and source so two concurrent
  -- requests cannot both spend the same available balance.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.club_id::text || ':' || NEW.source, 0)
  );

  select coalesce(sum(amount), 0)
  into withdrawn_through_date
  from public.owner_withdrawals
  where club_id = NEW.club_id
    and source = NEW.source
    and date <= NEW.date;

  available_through_date := public.owner_source_earned_through(
    NEW.club_id,
    NEW.source,
    NEW.date
  ) - withdrawn_through_date;

  if NEW.amount > available_through_date then
    raise exception 'Withdrawal (%) exceeds available % balance (%)',
      NEW.amount, NEW.source, greatest(available_through_date, 0)
      using errcode = '23514';
  end if;

  -- A backdated insert must not consume money that a later withdrawal has
  -- already used. Check the cumulative balance through today as well as the
  -- balance that existed on NEW.date.
  if NEW.date < local_today then
    select coalesce(sum(amount), 0)
    into withdrawn_current
    from public.owner_withdrawals
    where club_id = NEW.club_id
      and source = NEW.source
      and date <= local_today;

    available_current := public.owner_source_earned_through(
      NEW.club_id,
      NEW.source,
      local_today
    ) - withdrawn_current;

    if NEW.amount > available_current then
      raise exception 'Backdated withdrawal (%) exceeds current available % balance (%)',
        NEW.amount, NEW.source, greatest(available_current, 0)
        using errcode = '23514';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_owner_withdrawal_overdraft on public.owner_withdrawals;
create trigger trg_owner_withdrawal_overdraft
  before insert on public.owner_withdrawals
  for each row execute function public.prevent_owner_withdrawal_overdraft();

create or replace function public.prevent_owner_withdrawal_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Owner withdrawal ledger entries cannot be updated; delete and replace the entry'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_owner_withdrawal_immutable on public.owner_withdrawals;
create trigger trg_owner_withdrawal_immutable
  before update on public.owner_withdrawals
  for each row execute function public.prevent_owner_withdrawal_update();
