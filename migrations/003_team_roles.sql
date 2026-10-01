-- =============================================================
-- Team roles: owner, admin, viewer
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

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  requested_role text;
  assigned_role user_role;
begin
  requested_role := NEW.raw_user_meta_data->>'role';
  assigned_role := case
    when requested_role in ('owner', 'admin', 'viewer') then requested_role::user_role
    else 'viewer'::user_role
  end;

  insert into profiles (id, full_name, role)
  values (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.email),
    assigned_role
  );
  return NEW;
end;
$$;

drop policy if exists "Cashier can view today income" on income_transactions;
create policy "Viewer can view today income" on income_transactions
  for select using (
    (current_user_role() = 'viewer' and transaction_date = current_date)
    or current_user_role() in ('admin', 'owner')
  );

drop policy if exists "Cashier can view own debts" on debts;
create policy "Viewer can view own debts" on debts
  for select using (current_user_role() = 'viewer' and created_by = auth.uid());

-- Tighten the reworked tables. Viewers can read, admins and owners can write,
-- and only owners can update team roles through profiles.
drop policy if exists "auth_all_products" on products;
drop policy if exists "auth_all_cash_entries" on daily_cash_entries;
drop policy if exists "auth_all_stock_purchases" on stock_purchases;
drop policy if exists "auth_all_stock_counts" on daily_stock_counts;
drop policy if exists "auth_all_expenses" on expenses;
drop policy if exists "auth_all_debts" on new_debts;
drop policy if exists "auth_all_debt_payments" on debt_payments;

create policy "team_read_products" on products
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_products" on products
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));

create policy "team_read_cash_entries" on daily_cash_entries
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_cash_entries" on daily_cash_entries
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));

create policy "team_read_stock_purchases" on stock_purchases
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_stock_purchases" on stock_purchases
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));

create policy "team_read_stock_counts" on daily_stock_counts
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_stock_counts" on daily_stock_counts
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));

create policy "team_read_expenses" on expenses
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_expenses" on expenses
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));

create policy "team_read_debts" on new_debts
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_debts" on new_debts
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));

create policy "team_read_debt_payments" on debt_payments
  for select using (auth.role() = 'authenticated');
create policy "admin_owner_write_debt_payments" on debt_payments
  for all using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));
