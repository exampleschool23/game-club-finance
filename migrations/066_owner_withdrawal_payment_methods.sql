-- Game Club owner withdrawals can name the payment method the money was taken
-- from (cash drawer, terminal, card account or PlayStation takings), so Owner
-- Profit can show withdrawn and remaining money per method. Existing rows stay
-- unassigned (NULL) and are never reclassified; Bar withdrawals have no method.
--
-- The 050/051 functions tracked by migration health are left untouched: the
-- per-method check is a separate trigger and a separate RPC.

alter table public.owner_withdrawals
  add column if not exists payment_method text;

alter table public.owner_withdrawals
  drop constraint if exists owner_withdrawals_payment_method_check,
  add constraint owner_withdrawals_payment_method_check
    check (
      payment_method is null
      or (source = 'game_club' and payment_method in ('cash', 'terminal', 'card', 'playstation'))
    );

-- Game Club money left in one payment method for one calendar month, before
-- owner withdrawals. Matches paymentMethodBalancesByMonth in
-- get_owner_profit_snapshot (050): debt payments and expenses without a known
-- cash/terminal method count as card; PlayStation has income only.
create function public.owner_payment_method_earned_for_month(
  p_club_id uuid,
  p_payment_method text,
  p_period_month date
)
returns numeric
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  month_start date := date_trunc('month', p_period_month)::date;
  next_month date := (date_trunc('month', p_period_month) + interval '1 month')::date;
  earned numeric := 0;
begin
  if p_payment_method is null or p_payment_method not in ('cash', 'terminal', 'card', 'playstation') then
    raise exception 'Unknown owner withdrawal payment method: %', p_payment_method
      using errcode = '23514';
  end if;

  select coalesce(sum(case p_payment_method
      when 'cash' then coalesce(cash_income, 0)
      when 'terminal' then coalesce(terminal_income, 0)
      when 'card' then coalesce(card_income, 0)
      else coalesce(playstation_income, 0)
    end), 0)
  into earned
  from public.daily_cash_entries
  where club_id = p_club_id
    and date >= month_start
    and date < next_month;

  if p_payment_method <> 'playstation' then
    select earned + coalesce(sum(amount), 0)
    into earned
    from public.debt_payments
    where club_id = p_club_id
      and date >= month_start
      and date < next_month
      and case when payment_method in ('cash', 'terminal') then payment_method else 'card' end
        = p_payment_method;

    select earned - coalesce(sum(amount), 0)
    into earned
    from public.expenses
    where club_id = p_club_id
      and date >= month_start
      and date < next_month
      and coalesce(payment_source, 'game_club') = 'game_club'
      and case when payment_method in ('cash', 'terminal') then payment_method else 'card' end
        = p_payment_method;
  end if;

  return earned;
end;
$$;

-- Internal trigger helper only; exposing it would bypass table RLS.
revoke all on function public.owner_payment_method_earned_for_month(uuid, text, date)
  from public, anon, authenticated;

create function public.enforce_owner_withdrawal_payment_method_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  withdrawn_in_month numeric := 0;
  available_in_month numeric := 0;
begin
  if NEW.payment_method is null then
    return NEW;
  end if;

  -- Same bucket lock as enforce_owner_withdrawal_month_balance (re-entrant),
  -- so per-method checks are serialized with the Game Club month balance.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      NEW.club_id::text || ':' || NEW.source || ':' || NEW.period_month::text,
      0
    )
  );

  select coalesce(sum(amount), 0)
  into withdrawn_in_month
  from public.owner_withdrawals
  where club_id = NEW.club_id
    and source = 'game_club'
    and payment_method = NEW.payment_method
    and period_month = NEW.period_month;

  available_in_month := public.owner_payment_method_earned_for_month(
    NEW.club_id,
    NEW.payment_method,
    NEW.period_month
  ) - withdrawn_in_month;

  if NEW.amount > available_in_month then
    raise exception 'Withdrawal (%) exceeds the available % balance (%) for %',
      NEW.amount, NEW.payment_method, greatest(available_in_month, 0), NEW.period_month
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

revoke all on function public.enforce_owner_withdrawal_payment_method_balance()
  from public, anon, authenticated;

-- Fires after trg_owner_withdrawal_month_balance (triggers run in name order),
-- which validates the month and the overall Game Club balance first.
drop trigger if exists trg_owner_withdrawal_payment_method_balance on public.owner_withdrawals;
create trigger trg_owner_withdrawal_payment_method_balance
  before insert on public.owner_withdrawals
  for each row
  when (NEW.payment_method is not null)
  execute function public.enforce_owner_withdrawal_payment_method_balance();

create function public.withdraw_owner_game_club_money_by_method(
  p_club_id uuid,
  p_period_month date,
  p_payment_method text,
  p_amount numeric,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
    or public.current_user_club_role(p_club_id) is distinct from 'owner'::public.user_role then
    raise exception 'Only a club owner can take owner money' using errcode = '42501';
  end if;
  if p_period_month is null or p_period_month <> date_trunc('month', p_period_month)::date
    or p_payment_method is null or p_payment_method not in ('cash', 'terminal', 'card', 'playstation')
    or p_amount is null or p_amount <= 0 or p_amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Invalid withdrawal month, payment method or amount' using errcode = '23514';
  end if;

  -- Both insert triggers validate the Game Club and payment-method balances.
  insert into public.owner_withdrawals (club_id, period_month, source, payment_method, amount, comment, created_by)
  values (p_club_id, p_period_month, 'game_club', p_payment_method, p_amount, nullif(btrim(p_comment), ''), auth.uid());
end;
$$;

revoke all on function public.withdraw_owner_game_club_money_by_method(uuid, date, text, numeric, text)
  from public, anon;
grant execute on function public.withdraw_owner_game_club_money_by_method(uuid, date, text, numeric, text)
  to authenticated;
