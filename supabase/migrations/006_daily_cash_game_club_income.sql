-- Daily cash entries now represent only Game Club income.
-- Bar income is calculated from daily_stock_counts / Closing Stock.

alter table daily_cash_entries
  add column if not exists card_income numeric not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_cash_entries'
      and column_name = 'game_income'
  ) then
    execute 'update daily_cash_entries set card_income = coalesce(game_income, 0) where card_income = 0';
  end if;
end $$;

alter table daily_cash_entries
  drop column if exists qr_income,
  drop column if exists transfer_income,
  drop column if exists debt_income,
  drop column if exists game_income,
  drop column if exists other_income;

drop policy if exists "auth_all_cash_entries" on daily_cash_entries;
drop policy if exists "team_read_cash_entries" on daily_cash_entries;
drop policy if exists "admin_owner_write_cash_entries" on daily_cash_entries;
drop policy if exists "admin_owner_insert_cash_entries" on daily_cash_entries;
drop policy if exists "admin_owner_update_cash_entries_15m" on daily_cash_entries;
drop policy if exists "admin_owner_delete_cash_entries_15m" on daily_cash_entries;

create policy "team_read_cash_entries" on daily_cash_entries
  for select
  using (auth.role() = 'authenticated');

create policy "admin_owner_insert_cash_entries" on daily_cash_entries
  for insert
  with check (public.current_user_role() in ('owner', 'admin'));

create policy "admin_owner_update_cash_entries_15m" on daily_cash_entries
  for update
  using (
    public.current_user_role() in ('owner', 'admin')
    and created_at > now() - interval '15 minutes'
  )
  with check (
    public.current_user_role() in ('owner', 'admin')
    and created_at > now() - interval '15 minutes'
  );

create policy "admin_owner_delete_cash_entries_15m" on daily_cash_entries
  for delete
  using (
    public.current_user_role() in ('owner', 'admin')
    and created_at > now() - interval '15 minutes'
  );
