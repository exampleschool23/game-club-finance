-- =============================================================
-- Repair team access after role migration
-- Ensures the app is not left with only viewer users, which would
-- make every save/update fail under owner/admin write policies.
-- =============================================================

do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'cashier'
  ) and not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'viewer'
  ) then
    alter type user_role rename value 'cashier' to 'viewer';
  end if;
end $$;

alter table profiles alter column role set default 'viewer'::user_role;

-- If all existing users ended up as viewer, promote the oldest profile.
-- After that, the owner can use the Team page to assign proper access.
update profiles
set role = 'owner'::user_role,
    updated_at = now()
where id = (
  select id
  from profiles
  order by created_at asc
  limit 1
)
and not exists (
  select 1
  from profiles
  where role = 'owner'::user_role
);

-- Keep the helper explicit and stable for RLS checks.
create or replace function current_user_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

-- Recreate write policies in case migration 003 was partially applied.
drop policy if exists "auth_all_products" on products;
drop policy if exists "auth_all_cash_entries" on daily_cash_entries;
drop policy if exists "auth_all_stock_purchases" on stock_purchases;
drop policy if exists "auth_all_stock_counts" on daily_stock_counts;
drop policy if exists "auth_all_expenses" on expenses;
drop policy if exists "auth_all_debts" on new_debts;
drop policy if exists "auth_all_debt_payments" on debt_payments;

drop policy if exists "team_read_products" on products;
drop policy if exists "admin_owner_write_products" on products;
create policy "team_read_products" on products
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_products" on products
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));

drop policy if exists "team_read_cash_entries" on daily_cash_entries;
drop policy if exists "admin_owner_write_cash_entries" on daily_cash_entries;
create policy "team_read_cash_entries" on daily_cash_entries
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_cash_entries" on daily_cash_entries
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));

drop policy if exists "team_read_stock_purchases" on stock_purchases;
drop policy if exists "admin_owner_write_stock_purchases" on stock_purchases;
create policy "team_read_stock_purchases" on stock_purchases
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_stock_purchases" on stock_purchases
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));

drop policy if exists "team_read_stock_counts" on daily_stock_counts;
drop policy if exists "admin_owner_write_stock_counts" on daily_stock_counts;
create policy "team_read_stock_counts" on daily_stock_counts
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_stock_counts" on daily_stock_counts
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));

drop policy if exists "team_read_expenses" on expenses;
drop policy if exists "admin_owner_write_expenses" on expenses;
create policy "team_read_expenses" on expenses
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_expenses" on expenses
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));

drop policy if exists "team_read_debts" on new_debts;
drop policy if exists "admin_owner_write_debts" on new_debts;
create policy "team_read_debts" on new_debts
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_debts" on new_debts
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));

drop policy if exists "team_read_debt_payments" on debt_payments;
drop policy if exists "admin_owner_write_debt_payments" on debt_payments;
create policy "team_read_debt_payments" on debt_payments
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_debt_payments" on debt_payments
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));
