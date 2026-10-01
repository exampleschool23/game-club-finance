-- Prevent daily cash entries from being assigned to a future club business day.
-- The database-side guard protects against bypassing the client date picker.

create or replace function public.prevent_future_daily_cash_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.date > public.club_business_date(NEW.club_id) then
    raise exception 'Daily cash entries cannot use a future business date'
      using errcode = '22007';
  end if;

  return NEW;
end;
$$;

drop trigger if exists prevent_future_daily_cash_entry on public.daily_cash_entries;

create trigger prevent_future_daily_cash_entry
before insert or update of date, club_id on public.daily_cash_entries
for each row execute function public.prevent_future_daily_cash_entry();
