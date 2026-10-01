-- Keep the monthly average chart limited to game-club collections. Bar sales
-- and debt income belong to separate finance metrics and must not be included.

create or replace function public.refresh_monthly_average_income_snapshot(
  p_month date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_month_end date := (v_month + interval '1 month - 1 day')::date;
begin
  if v_month >= date_trunc('month', timezone('Asia/Tashkent', now()))::date then
    raise exception 'Only completed months can be finalized.';
  end if;

  insert into public.monthly_average_income_snapshots (
    club_id,
    month,
    total_income,
    day_count,
    average_daily_income,
    finalized_at
  )
  select
    clubs.id,
    v_month,
    coalesce(game_club.total, 0),
    extract(day from v_month_end)::integer,
    coalesce(game_club.total, 0) / extract(day from v_month_end)::integer,
    now()
  from public.clubs clubs
  left join lateral (
    select sum(
      coalesce(entries.cash_income, 0)
      + coalesce(entries.terminal_income, 0)
      + coalesce(entries.card_income, 0)
    ) as total
    from public.daily_cash_entries entries
    where entries.club_id = clubs.id
      and entries.date between v_month and v_month_end
  ) game_club on true
  on conflict (club_id, month) do update set
    total_income = excluded.total_income,
    day_count = excluded.day_count,
    average_daily_income = excluded.average_daily_income,
    finalized_at = excluded.finalized_at;
end;
$$;

create or replace function public.get_monthly_average_income_chart(
  p_club_id uuid,
  p_business_date date
)
returns table (
  month date,
  average_daily_income numeric,
  is_current boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_current_month date := date_trunc('month', p_business_date)::date;
  v_first_month date := (v_current_month - interval '11 months')::date;
  v_live_total numeric;
begin
  if auth.uid() is null or not public.user_has_club_access(p_club_id) then
    raise exception 'Not authorized for this club.';
  end if;

  select coalesce(sum(
    coalesce(entries.cash_income, 0)
    + coalesce(entries.terminal_income, 0)
    + coalesce(entries.card_income, 0)
  ), 0)
  into v_live_total
  from public.daily_cash_entries entries
  where entries.club_id = p_club_id
    and entries.date between v_current_month and p_business_date;

  return query
  select
    months.month_start,
    case
      when months.month_start = v_current_month
        then v_live_total / greatest(extract(day from p_business_date)::integer, 1)
      else coalesce(snapshots.average_daily_income, 0)
    end,
    months.month_start = v_current_month
  from (
    select generate_series(
      v_first_month::timestamp,
      v_current_month::timestamp,
      interval '1 month'
    )::date as month_start
  ) months
  left join public.monthly_average_income_snapshots snapshots
    on snapshots.club_id = p_club_id
   and snapshots.month = months.month_start
  order by months.month_start;
end;
$$;

-- Correct snapshots produced by migration 042 or the monthly cron job under
-- the former all-income definition.
update public.monthly_average_income_snapshots snapshots
set
  total_income = corrected.total_income,
  average_daily_income = corrected.total_income / snapshots.day_count,
  finalized_at = now()
from (
  select
    snapshots_to_fix.club_id,
    snapshots_to_fix.month,
    coalesce(sum(
      coalesce(entries.cash_income, 0)
      + coalesce(entries.terminal_income, 0)
      + coalesce(entries.card_income, 0)
    ), 0) as total_income
  from public.monthly_average_income_snapshots snapshots_to_fix
  left join public.daily_cash_entries entries
    on entries.club_id = snapshots_to_fix.club_id
   and entries.date >= snapshots_to_fix.month
   and entries.date < (snapshots_to_fix.month + interval '1 month')::date
  group by snapshots_to_fix.club_id, snapshots_to_fix.month
) corrected
where corrected.club_id = snapshots.club_id
  and corrected.month = snapshots.month;
