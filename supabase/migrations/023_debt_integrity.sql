-- Keep the debt ledger internally consistent and reject overpayments atomically.

alter table public.new_debts
  add constraint new_debts_paid_amount_valid
    check (paid_amount >= 0 and paid_amount <= amount),
  add constraint new_debts_remaining_amount_valid
    check (remaining_amount >= 0 and remaining_amount = amount - paid_amount),
  add constraint new_debts_status_valid
    check (
      (paid_amount = 0 and status = 'unpaid')
      or (paid_amount > 0 and paid_amount < amount and status = 'partial')
      or (paid_amount = amount and status = 'paid')
    );

create or replace function public.prevent_debt_overpayment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_remaining numeric;
begin
  select remaining_amount
  into current_remaining
  from public.new_debts
  where id = NEW.debt_id
    and club_id = NEW.club_id
  for update;

  if not found then
    raise exception 'Debt does not exist in this club'
      using errcode = '23503';
  end if;

  if NEW.amount > current_remaining then
    raise exception 'Payment (%) exceeds remaining debt (%)', NEW.amount, current_remaining
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_debt_payment_limit on public.debt_payments;
create trigger trg_debt_payment_limit
  before insert on public.debt_payments
  for each row execute function public.prevent_debt_overpayment();

-- Payment rows are immutable ledger entries. Corrections should be explicit,
-- rather than silently desynchronizing new_debts totals through update/delete.
drop policy if exists "club_admin_write_debt_payments" on public.debt_payments;
drop policy if exists "club_admin_insert_debt_payments" on public.debt_payments;
create policy "club_admin_insert_debt_payments" on public.debt_payments
  for insert
  with check (public.current_user_club_role(club_id) in ('admin', 'owner'));
