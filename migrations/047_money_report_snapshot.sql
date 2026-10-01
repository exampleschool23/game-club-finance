-- Return the report ledgers in one request so the browser does not wait for
-- five REST reads followed by a profile lookup.

create or replace function public.get_money_report_snapshot(
  p_club_id uuid,
  p_range_from date,
  p_range_to date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_range_from > p_range_to then
    raise exception 'Invalid report date range.';
  end if;

  if auth.uid() is null
    or not public.current_user_can_access_club_feature(p_club_id, 'reports') then
    raise exception 'Not authorized for this club report.';
  end if;

  return jsonb_build_object(
    'cash', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date, rows.created_at)
      from (
        select entries.id, entries.date, entries.cash_income,
          entries.terminal_income, entries.card_income,
          entries.playstation_income, entries.comment, entries.created_by,
          entries.created_at, profiles.full_name as creator_name
        from public.daily_cash_entries entries
        left join public.profiles profiles on profiles.id = entries.created_by
        where entries.club_id = p_club_id
          and entries.date between p_range_from and p_range_to
      ) rows
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date, rows.id)
      from (
        select expenses.id, expenses.date, expenses.amount, expenses.category,
          expenses.payment_method, expenses.payment_source, expenses.comment,
          expenses.created_by, expenses.created_at,
          profiles.full_name as creator_name
        from public.expenses expenses
        left join public.profiles profiles on profiles.id = expenses.created_by
        where expenses.club_id = p_club_id
          and expenses.date between p_range_from and p_range_to
      ) rows
    ), '[]'::jsonb),
    'debtPayments', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date, rows.id)
      from (
        select payments.id, payments.date, payments.amount,
          payments.payment_method, payments.comment, payments.created_at
        from public.debt_payments payments
        where payments.club_id = p_club_id
          and payments.date between p_range_from and p_range_to
      ) rows
    ), '[]'::jsonb),
    'barSales', coalesce((
      select jsonb_agg(to_jsonb(rows))
      from (
        select counts.date, counts.bar_income
        from public.daily_stock_counts counts
        where counts.club_id = p_club_id
          and counts.date between p_range_from and p_range_to
      ) rows
    ), '[]'::jsonb),
    'stockPurchases', coalesce((
      select jsonb_agg(to_jsonb(rows))
      from (
        select purchases.date, purchases.quantity, purchases.cost_price
        from public.stock_purchases purchases
        where purchases.club_id = p_club_id
          and purchases.date between p_range_from and p_range_to
      ) rows
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_money_report_snapshot(uuid, date, date)
  from public, anon;
grant execute on function public.get_money_report_snapshot(uuid, date, date)
  to authenticated;
