-- Migration: 019_club_business_day_start.sql
-- Per-club business day start time.
-- Pixel Game Club starts its finance/bar day at 06:00 so admins can close cashier
-- and bar stock before the next business day begins.

alter table public.clubs
  add column if not exists business_day_start_hour smallint not null default 0;

alter table public.clubs
  drop constraint if exists clubs_business_day_start_hour_range;

alter table public.clubs
  add constraint clubs_business_day_start_hour_range
  check (business_day_start_hour between 0 and 23);

update public.clubs
set business_day_start_hour = 6,
    updated_at = now()
where lower(name) like '%pixel%';

create or replace function public.club_business_date(p_club_id uuid, p_at timestamptz default now())
returns date
language sql
security definer
stable
set search_path = public
as $$
  select (
    (p_at at time zone 'Asia/Tashkent')
    - make_interval(hours => coalesce((
        select clubs.business_day_start_hour::int
        from public.clubs
        where clubs.id = p_club_id
      ), 0))
  )::date
$$;

-- Repair Pixel rows that were saved after midnight but before 06:00 with the
-- calendar date. They belong to the previous business day.
with candidates as (
  select
    source.id,
    source.club_id,
    source.product_id,
    source.date - 1 as target_date,
    source.previous_stock,
    source.added_today,
    source.closing_stock,
    source.sold_quantity,
    source.sale_price,
    source.cost_price,
    source.bar_income,
    source.bar_cost,
    source.bar_profit,
    source.created_by,
    source.created_at,
    source.updated_at
  from public.daily_stock_counts source
  join public.clubs club on club.id = source.club_id
  where lower(club.name) like '%pixel%'
    and club.business_day_start_hour = 6
    and source.date = (source.created_at at time zone 'Asia/Tashkent')::date
    and extract(hour from source.created_at at time zone 'Asia/Tashkent') < club.business_day_start_hour
),
merged as (
  update public.daily_stock_counts target
  set previous_stock = source.previous_stock,
      added_today = source.added_today,
      closing_stock = source.closing_stock,
      sold_quantity = source.sold_quantity,
      sale_price = source.sale_price,
      cost_price = source.cost_price,
      bar_income = source.bar_income,
      bar_cost = source.bar_cost,
      bar_profit = source.bar_profit,
      created_by = coalesce(source.created_by, target.created_by),
      updated_at = greatest(source.updated_at, target.updated_at)
  from candidates source
  where target.club_id = source.club_id
    and target.product_id = source.product_id
    and target.date = source.target_date
  returning source.id
),
deleted as (
  delete from public.daily_stock_counts source
  using merged
  where source.id = merged.id
  returning source.id
)
update public.daily_stock_counts source
set date = candidates.target_date
from candidates
where source.id = candidates.id
  and not exists (
    select 1 from deleted where deleted.id = source.id
  );

with candidates as (
  select
    source.id,
    source.club_id,
    source.date - 1 as target_date,
    source.cash_income,
    source.terminal_income,
    source.card_income,
    source.playstation_income,
    source.comment,
    source.created_by,
    source.created_at,
    source.updated_at
  from public.daily_cash_entries source
  join public.clubs club on club.id = source.club_id
  where lower(club.name) like '%pixel%'
    and club.business_day_start_hour = 6
    and source.date = (source.created_at at time zone 'Asia/Tashkent')::date
    and extract(hour from source.created_at at time zone 'Asia/Tashkent') < club.business_day_start_hour
),
merged as (
  update public.daily_cash_entries target
  set cash_income = source.cash_income,
      terminal_income = source.terminal_income,
      card_income = source.card_income,
      playstation_income = source.playstation_income,
      comment = coalesce(source.comment, target.comment),
      created_by = coalesce(source.created_by, target.created_by),
      updated_at = greatest(source.updated_at, target.updated_at)
  from candidates source
  where target.club_id = source.club_id
    and target.date = source.target_date
  returning source.id
),
deleted as (
  delete from public.daily_cash_entries source
  using merged
  where source.id = merged.id
  returning source.id
)
update public.daily_cash_entries source
set date = candidates.target_date
from candidates
where source.id = candidates.id
  and not exists (
    select 1 from deleted where deleted.id = source.id
  );

update public.stock_purchases source
set date = source.date - 1
from public.clubs club
where club.id = source.club_id
  and lower(club.name) like '%pixel%'
  and club.business_day_start_hour = 6
  and source.date = (source.created_at at time zone 'Asia/Tashkent')::date
  and extract(hour from source.created_at at time zone 'Asia/Tashkent') < club.business_day_start_hour;

update public.expenses source
set date = source.date - 1
from public.clubs club
where club.id = source.club_id
  and lower(club.name) like '%pixel%'
  and club.business_day_start_hour = 6
  and source.date = (source.created_at at time zone 'Asia/Tashkent')::date
  and extract(hour from source.created_at at time zone 'Asia/Tashkent') < club.business_day_start_hour;

create or replace function public.update_stock_on_closing_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.date = public.club_business_date(NEW.club_id) then
    update public.products
    set current_stock = NEW.closing_stock,
        updated_at = now()
    where id = NEW.product_id
      and club_id = NEW.club_id;
  end if;

  return NEW;
end;
$$;

drop policy if exists "club_admin_write_stock_counts" on public.daily_stock_counts;
create policy "club_admin_write_stock_counts" on public.daily_stock_counts
  for all using (
    public.current_user_club_role(club_id) = 'owner'
    or (
      public.current_user_club_role(club_id) = 'admin'
      and date = public.club_business_date(club_id)
    )
  )
  with check (
    public.current_user_club_role(club_id) = 'owner'
    or (
      public.current_user_club_role(club_id) = 'admin'
      and date = public.club_business_date(club_id)
    )
  );
