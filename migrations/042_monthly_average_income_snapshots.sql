-- Persist finalized monthly average income so the dashboard does not repeatedly
-- scan historical finance ledgers. Only the open month is calculated live.

create table if not exists public.monthly_average_income_snapshots (
  club_id uuid not null references public.clubs(id) on delete cascade,
  month date not null,
  total_income numeric not null default 0,
  day_count integer not null,
  average_daily_income numeric not null default 0,
  finalized_at timestamptz not null default now(),
  primary key (club_id, month),
  constraint monthly_average_income_month_start_check
    check (month = date_trunc('month', month)::date),
  constraint monthly_average_income_day_count_check
    check (day_count between 1 and 31),
  constraint monthly_average_income_values_check
    check (total_income >= 0 and average_daily_income >= 0)
);

alter table public.monthly_average_income_snapshots enable row level security;

drop policy if exists "club_members_read_monthly_average_income"
  on public.monthly_average_income_snapshots;
create policy "club_members_read_monthly_average_income"
on public.monthly_average_income_snapshots
for select
to authenticated
using (public.user_has_club_access(club_id));

revoke all on table public.monthly_average_income_snapshots from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.monthly_average_income_snapshots from authenticated;
grant select on table public.monthly_average_income_snapshots to authenticated;

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
    coalesce(cash.total, 0) + coalesce(bar.total, 0) + coalesce(debt.total, 0),
    extract(day from v_month_end)::integer,
    (
      coalesce(cash.total, 0) + coalesce(bar.total, 0) + coalesce(debt.total, 0)
    ) / extract(day from v_month_end)::integer,
    now()
  from public.clubs clubs
  left join lateral (
    select sum(
      coalesce(entries.cash_income, 0)
      + coalesce(entries.terminal_income, 0)
      + coalesce(entries.card_income, 0)
      + coalesce(entries.playstation_income, 0)
    ) as total
    from public.daily_cash_entries entries
    where entries.club_id = clubs.id
      and entries.date between v_month and v_month_end
  ) cash on true
  left join lateral (
    select sum(coalesce(counts.bar_income, 0)) as total
    from public.daily_stock_counts counts
    where counts.club_id = clubs.id
      and counts.date between v_month and v_month_end
  ) bar on true
  left join lateral (
    select sum(coalesce(debts.amount, 0)) as total
    from public.new_debts debts
    where debts.club_id = clubs.id
      and debts.date between v_month and v_month_end
  ) debt on true
  on conflict (club_id, month) do update set
    total_income = excluded.total_income,
    day_count = excluded.day_count,
    average_daily_income = excluded.average_daily_income,
    finalized_at = excluded.finalized_at;
end;
$$;

revoke all on function public.refresh_monthly_average_income_snapshot(date)
  from public, anon, authenticated;

-- One-time historical backfill. Each completed month is scanned only once when
-- this migration is applied; later dashboard reads use the snapshot table.
do $$
declare
  month_to_finalize date;
  first_ledger_month date;
  current_month date := date_trunc('month', timezone('Asia/Tashkent', now()))::date;
begin
  select min(month_start)
  into first_ledger_month
  from (
    select date_trunc('month', min(date))::date as month_start from public.daily_cash_entries
    union all
    select date_trunc('month', min(date))::date from public.daily_stock_counts
    union all
    select date_trunc('month', min(date))::date from public.new_debts
  ) ledger_months
  where month_start is not null;

  if first_ledger_month is not null then
    for month_to_finalize in
      select generate_series(
        first_ledger_month::timestamp,
        (current_month - interval '1 month')::timestamp,
        interval '1 month'
      )::date
    loop
      perform public.refresh_monthly_average_income_snapshot(month_to_finalize);
    end loop;
  end if;
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

  select
    coalesce((
      select sum(
        coalesce(entries.cash_income, 0)
        + coalesce(entries.terminal_income, 0)
        + coalesce(entries.card_income, 0)
        + coalesce(entries.playstation_income, 0)
      )
      from public.daily_cash_entries entries
      where entries.club_id = p_club_id
        and entries.date between v_current_month and p_business_date
    ), 0)
    + coalesce((
      select sum(coalesce(counts.bar_income, 0))
      from public.daily_stock_counts counts
      where counts.club_id = p_club_id
        and counts.date between v_current_month and p_business_date
    ), 0)
    + coalesce((
      select sum(coalesce(debts.amount, 0))
      from public.new_debts debts
      where debts.club_id = p_club_id
        and debts.date between v_current_month and p_business_date
    ), 0)
  into v_live_total;

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

revoke all on function public.get_monthly_average_income_chart(uuid, date)
  from public, anon;
grant execute on function public.get_monthly_average_income_chart(uuid, date)
  to authenticated;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid from cron.job where jobname = 'finalize-monthly-average-income'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'finalize-monthly-average-income',
    '5 1 1 * *',
    $cron$select public.refresh_monthly_average_income_snapshot(
      (date_trunc('month', timezone('Asia/Tashkent', now())) - interval '1 month')::date
    );$cron$
  );
end;
$$;

