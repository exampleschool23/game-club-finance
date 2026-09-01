-- Add the game-club money-left breakdown to the compact owner-profit payload.

create or replace function public.get_owner_profit_snapshot(
  p_club_id uuid,
  p_through_date date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null or not public.user_has_club_access(p_club_id) then
    raise exception 'Not authorized for this club.';
  end if;

  return jsonb_build_object(
    'monthlyBalances', coalesce((
      with monthly_values as (
        select date_trunc('month', entries.date)::date as period_month,
          sum(coalesce(entries.cash_income, 0) + coalesce(entries.terminal_income, 0)
            + coalesce(entries.card_income, 0) + coalesce(entries.playstation_income, 0)) as game_club_earned,
          0::numeric as bar_earned, 0::numeric as game_club_withdrawn, 0::numeric as bar_withdrawn
        from public.daily_cash_entries entries
        where entries.club_id = p_club_id and entries.date <= p_through_date
        group by 1
        union all
        select date_trunc('month', payments.date)::date, sum(payments.amount), 0::numeric, 0::numeric, 0::numeric
        from public.debt_payments payments
        where payments.club_id = p_club_id and payments.date <= p_through_date
        group by 1
        union all
        select date_trunc('month', counts.date)::date, 0::numeric, sum(counts.bar_income), 0::numeric, 0::numeric
        from public.daily_stock_counts counts
        where counts.club_id = p_club_id and counts.date <= p_through_date
        group by 1
        union all
        select date_trunc('month', purchases.date)::date, 0::numeric,
          -sum(purchases.quantity * purchases.cost_price), 0::numeric, 0::numeric
        from public.stock_purchases purchases
        where purchases.club_id = p_club_id and purchases.date between date '2026-07-02' and p_through_date
        group by 1
        union all
        select date_trunc('month', expenses.date)::date,
          -sum(expenses.amount) filter (where expenses.payment_source = 'game_club'),
          -sum(expenses.amount) filter (where expenses.payment_source = 'bar'), 0::numeric, 0::numeric
        from public.expenses expenses
        where expenses.club_id = p_club_id and expenses.date <= p_through_date
        group by 1
        union all
        select withdrawals.period_month, 0::numeric, 0::numeric,
          sum(withdrawals.amount) filter (where withdrawals.source = 'game_club'),
          sum(withdrawals.amount) filter (where withdrawals.source = 'bar')
        from public.owner_withdrawals withdrawals
        where withdrawals.club_id = p_club_id
          and withdrawals.period_month <= date_trunc('month', p_through_date)::date
        group by 1
      ), balances as (
        select period_month, coalesce(sum(game_club_earned), 0) as game_club_earned,
          coalesce(sum(bar_earned), 0) as bar_earned,
          coalesce(sum(game_club_withdrawn), 0) as game_club_withdrawn,
          coalesce(sum(bar_withdrawn), 0) as bar_withdrawn
        from monthly_values group by period_month
      )
      select jsonb_agg(to_jsonb(balances) order by period_month) from balances
    ), '[]'::jsonb),
    'withdrawalRows', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.period_month desc, rows.created_at desc)
      from (
        select id, club_id, period_month, source, amount, comment, created_by, created_at, updated_at
        from public.owner_withdrawals
        where club_id = p_club_id and period_month <= date_trunc('month', p_through_date)::date
      ) rows
    ), '[]'::jsonb),
    'paymentMethodBalances', jsonb_build_object(
      'cash',
        coalesce((select sum(entries.cash_income) from public.daily_cash_entries entries
          where entries.club_id = p_club_id and entries.date <= p_through_date), 0)
        + coalesce((select sum(payments.amount) from public.debt_payments payments
          where payments.club_id = p_club_id and payments.date <= p_through_date and payments.payment_method = 'cash'), 0)
        - coalesce((select sum(expenses.amount) from public.expenses expenses
          where expenses.club_id = p_club_id and expenses.date <= p_through_date
            and expenses.payment_source = 'game_club' and expenses.payment_method = 'cash'), 0),
      'terminal',
        coalesce((select sum(entries.terminal_income) from public.daily_cash_entries entries
          where entries.club_id = p_club_id and entries.date <= p_through_date), 0)
        + coalesce((select sum(payments.amount) from public.debt_payments payments
          where payments.club_id = p_club_id and payments.date <= p_through_date and payments.payment_method = 'terminal'), 0)
        - coalesce((select sum(expenses.amount) from public.expenses expenses
          where expenses.club_id = p_club_id and expenses.date <= p_through_date
            and expenses.payment_source = 'game_club' and expenses.payment_method = 'terminal'), 0),
      'card',
        coalesce((select sum(entries.card_income) from public.daily_cash_entries entries
          where entries.club_id = p_club_id and entries.date <= p_through_date), 0)
        + coalesce((select sum(payments.amount) from public.debt_payments payments
          where payments.club_id = p_club_id and payments.date <= p_through_date
            and coalesce(payments.payment_method, 'card') not in ('cash', 'terminal')), 0)
        - coalesce((select sum(expenses.amount) from public.expenses expenses
          where expenses.club_id = p_club_id and expenses.date <= p_through_date
            and expenses.payment_source = 'game_club'
            and coalesce(expenses.payment_method, 'card') not in ('cash', 'terminal')), 0),
      'playstation', coalesce((select sum(entries.playstation_income) from public.daily_cash_entries entries
        where entries.club_id = p_club_id and entries.date <= p_through_date), 0)
    )
  );
end;
$$;

revoke all on function public.get_owner_profit_snapshot(uuid, date) from public, anon;
grant execute on function public.get_owner_profit_snapshot(uuid, date) to authenticated;
