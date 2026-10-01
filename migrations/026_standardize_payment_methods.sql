-- New payment entries use Terminal, Cash, or Card only.
-- Legacy enum values remain so historical records continue to load.

alter type public.payment_method add value if not exists 'card';

create or replace function public.update_balance_on_income()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account text;
begin
  case NEW.payment_method
    when 'cash' then v_account := 'cash';
    when 'terminal' then v_account := 'terminal';
    when 'card' then v_account := 'bank';
    when 'qr' then v_account := 'bank';
    when 'transfer' then v_account := 'bank';
    when 'debt' then v_account := 'debt';
  end case;

  update public.balances
  set amount = amount + NEW.amount,
      updated_at = now()
  where account = v_account
    and club_id = NEW.club_id;

  return NEW;
end;
$$;

create or replace function public.rollback_balance_on_income_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account text;
begin
  case OLD.payment_method
    when 'cash' then v_account := 'cash';
    when 'terminal' then v_account := 'terminal';
    when 'card' then v_account := 'bank';
    when 'qr' then v_account := 'bank';
    when 'transfer' then v_account := 'bank';
    when 'debt' then v_account := 'debt';
  end case;

  update public.balances
  set amount = amount - OLD.amount,
      updated_at = now()
  where account = v_account
    and club_id = OLD.club_id;

  return OLD;
end;
$$;
