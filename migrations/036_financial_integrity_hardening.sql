-- Retire the legacy finance ledgers and enforce temporal integrity for debts.
-- This migration is deliberately self-contained so it reaches the same final
-- state regardless of which historical migration was recorded as version 032.

-- Legacy routes formerly wrote to these tables, while current reports read
-- daily_cash_entries and expenses. Keep historical rows readable, but prevent
-- application users from creating a second, invisible financial ledger.
drop policy if exists "Admin and owner can manage cash movements" on public.cash_movements;
drop policy if exists "club_admin_write_cash_movements" on public.cash_movements;

drop policy if exists "Cashier can insert income" on public.income_transactions;
drop policy if exists "Admin and owner can update income" on public.income_transactions;
drop policy if exists "Owner can delete income" on public.income_transactions;
drop policy if exists "club_admin_write_income_transactions" on public.income_transactions;
drop policy if exists "club_owner_delete_income_transactions" on public.income_transactions;

drop policy if exists "Admin and owner can insert expense" on public.expense_transactions;
drop policy if exists "Admin and owner can update expenses" on public.expense_transactions;
drop policy if exists "Owner can delete expense" on public.expense_transactions;
drop policy if exists "club_admin_write_expense_transactions" on public.expense_transactions;
drop policy if exists "club_owner_delete_expense_transactions" on public.expense_transactions;

revoke insert, update, delete, truncate, references, trigger
  on table public.cash_movements, public.income_transactions, public.expense_transactions
  from PUBLIC, anon, authenticated;

comment on table public.cash_movements is
  'Retired legacy ledger. Historical rows are read-only; use current finance tables for new records.';
comment on table public.income_transactions is
  'Retired legacy ledger. Historical rows are read-only; use daily_cash_entries for new records.';
comment on table public.expense_transactions is
  'Retired legacy ledger. Historical rows are read-only; use expenses for new records.';

-- Remove every historical policy that could let an admin delete daily cash,
-- including broad FOR ALL policies from early schema versions.
drop policy if exists "auth_all_cash_entries" on public.daily_cash_entries;
drop policy if exists "admin_owner_write_cash_entries" on public.daily_cash_entries;
drop policy if exists "admin_owner_delete_cash_entries_15m" on public.daily_cash_entries;
drop policy if exists "owner_admin_delete_cash_entries" on public.daily_cash_entries;
drop policy if exists "club_owner_admin_delete_cash_entries" on public.daily_cash_entries;
drop policy if exists "club_owner_delete_cash_entries" on public.daily_cash_entries;

create policy "club_owner_delete_cash_entries" on public.daily_cash_entries
  for delete
  using (public.current_user_club_role(club_id) = 'owner');

-- Debts and their payments are append-only ledgers. Payment inserts update the
-- parent balance through the SECURITY DEFINER trigger below; application users
-- must not rewrite or erase either side of that history directly.
drop policy if exists "auth_all_debts" on public.new_debts;
drop policy if exists "admin_owner_write_debts" on public.new_debts;
drop policy if exists "club_admin_write_debts" on public.new_debts;
drop policy if exists "club_admin_insert_debts" on public.new_debts;

create policy "club_admin_insert_debts" on public.new_debts
  for insert with check (
    public.current_user_club_role(club_id) in ('admin', 'owner')
    and public.current_user_can_access_club_feature(club_id, 'debts')
  );

drop policy if exists "auth_all_debt_payments" on public.debt_payments;
drop policy if exists "admin_owner_write_debt_payments" on public.debt_payments;
drop policy if exists "club_admin_write_debt_payments" on public.debt_payments;

revoke update, delete, truncate, references, trigger
  on table public.new_debts, public.debt_payments
  from PUBLIC, anon, authenticated;

create or replace function public.enforce_new_debt_business_date()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'INSERT' and (
    NEW.paid_amount <> 0
    or NEW.remaining_amount <> NEW.amount
    or NEW.status <> 'unpaid'
  ) then
    raise exception 'A new debt must start unpaid with its full amount remaining'
      using errcode = '23514';
  end if;

  if NEW.date > public.club_business_date(NEW.club_id) then
    raise exception 'Debts cannot use a future business date'
      using errcode = '22007';
  end if;

  if TG_OP = 'UPDATE' and exists (
    select 1
    from public.debt_payments payment
    where payment.debt_id = NEW.id
      and payment.date < NEW.date
  ) then
    raise exception 'Debt date cannot be later than an existing payment date'
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

revoke execute on function public.enforce_new_debt_business_date()
  from PUBLIC, anon, authenticated;

drop trigger if exists trg_new_debt_date_guard on public.new_debts;
create trigger trg_new_debt_date_guard
  before insert or update of date, club_id on public.new_debts
  for each row execute function public.enforce_new_debt_business_date();

create or replace function public.enforce_debt_payment_business_date()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debt_date date;
  v_debt_club_id uuid;
begin
  select debt.date, debt.club_id
  into v_debt_date, v_debt_club_id
  from public.new_debts debt
  where debt.id = NEW.debt_id;

  if not found then
    raise exception 'Debt does not exist'
      using errcode = '23503';
  end if;

  if NEW.club_id <> v_debt_club_id then
    raise exception 'Debt belongs to a different club'
      using errcode = '23503';
  end if;

  if NEW.date > public.club_business_date(NEW.club_id) then
    raise exception 'Debt payments cannot use a future business date'
      using errcode = '22007';
  end if;

  if NEW.date < v_debt_date then
    raise exception 'Debt payment date cannot be earlier than the debt date'
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

revoke execute on function public.enforce_debt_payment_business_date()
  from PUBLIC, anon, authenticated;

drop trigger if exists trg_debt_payment_date_guard on public.debt_payments;
create trigger trg_debt_payment_date_guard
  before insert or update of date, club_id, debt_id on public.debt_payments
  for each row execute function public.enforce_debt_payment_business_date();

-- Harden the older trigger functions as well. They remain callable by their
-- triggers, but not as application RPCs.
alter function public.prevent_debt_overpayment()
  set search_path = public, pg_temp;
alter function public.update_debt_on_payment()
  set search_path = public, pg_temp;
revoke execute on function public.prevent_debt_overpayment()
  from PUBLIC, anon, authenticated;
revoke execute on function public.update_debt_on_payment()
  from PUBLIC, anon, authenticated;
