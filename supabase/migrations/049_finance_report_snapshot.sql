-- Load only the finance ledgers a report screen needs in one database request.
-- Callers choose sections so detail pages do not download unrelated ledgers.

create or replace function public.get_finance_report_snapshot(
  p_club_id uuid,
  p_range_from date,
  p_range_to date,
  p_sections text[]
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_sections text[] := coalesce(p_sections, '{}'::text[]);
begin
  if p_range_from > p_range_to then
    raise exception 'Invalid report date range.';
  end if;

  if exists (
    select 1
    from unnest(v_sections) requested(section_name)
    where not requested.section_name = any(array[
      'cash', 'stock_totals', 'stock_counts', 'purchases', 'expenses',
      'debts', 'debt_payments'
    ]::text[])
  ) then
    raise exception 'Invalid finance report section.';
  end if;

  if auth.uid() is null
    or not public.current_user_can_access_club_feature_any(
      p_club_id,
      array['dashboard', 'reports']::text[]
    ) then
    raise exception 'Not authorized for this club report.';
  end if;

  return jsonb_build_object(
    'cashRows', case when 'cash' = any(v_sections) then coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date, rows.created_at)
      from (
        select entries.id, entries.club_id, entries.date,
          entries.cash_income, entries.terminal_income, entries.card_income,
          entries.playstation_income, entries.comment, entries.created_by,
          entries.created_at, entries.updated_at
        from public.daily_cash_entries entries
        where entries.club_id = p_club_id
          and entries.date between p_range_from and p_range_to
      ) rows
    ), '[]'::jsonb) else '[]'::jsonb end,
    'stockTotalRows', case when 'stock_totals' = any(v_sections) then coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date)
      from (
        select counts.date,
          sum(counts.bar_income) as bar_income,
          sum(counts.bar_cost) as bar_cost
        from public.daily_stock_counts counts
        where counts.club_id = p_club_id
          and counts.date between p_range_from and p_range_to
        group by counts.date
      ) rows
    ), '[]'::jsonb) else '[]'::jsonb end,
    'stockCountRows', case when 'stock_counts' = any(v_sections) then coalesce((
      select jsonb_agg(
        to_jsonb(rows)
        order by rows.sort_order nulls last, rows.product_name, rows.product_id
      )
      from (
        select counts.id, counts.club_id, counts.date, counts.product_id,
          counts.previous_stock, counts.added_today, counts.closing_stock,
          counts.sold_quantity, counts.sale_price, counts.cost_price,
          counts.bar_income, counts.bar_cost, counts.bar_profit,
          counts.created_by, counts.created_at, counts.updated_at,
          products.name as product_name,
          products.sort_order
        from public.daily_stock_counts counts
        left join public.products products on products.id = counts.product_id
        where counts.club_id = p_club_id
          and counts.date between p_range_from and p_range_to
      ) rows
    ), '[]'::jsonb) else '[]'::jsonb end,
    'purchaseRows', case when 'purchases' = any(v_sections) then coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date, rows.id)
      from (
        select purchases.id, purchases.club_id, purchases.date,
          purchases.product_id, purchases.quantity, purchases.cost_price,
          purchases.sale_price, purchases.payment_method, purchases.comment,
          purchases.created_by, purchases.created_at,
          products.name as product_name
        from public.stock_purchases purchases
        left join public.products products on products.id = purchases.product_id
        where purchases.club_id = p_club_id
          and purchases.date between p_range_from and p_range_to
      ) rows
    ), '[]'::jsonb) else '[]'::jsonb end,
    'expenseRows', case when 'expenses' = any(v_sections) then coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date, rows.id)
      from (
        select expenses.id, expenses.club_id, expenses.date, expenses.amount,
          expenses.payment_method, expenses.payment_source, expenses.category,
          expenses.comment, expenses.telegram_chat_id,
          expenses.telegram_message_id, expenses.created_by,
          expenses.created_at, expenses.updated_at
        from public.expenses expenses
        where expenses.club_id = p_club_id
          and expenses.date between p_range_from and p_range_to
      ) rows
    ), '[]'::jsonb) else '[]'::jsonb end,
    'debtRows', case when 'debts' = any(v_sections) then coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date, rows.id)
      from (
        select debts.id, debts.date, debts.amount
        from public.new_debts debts
        where debts.club_id = p_club_id
          and debts.date between p_range_from and p_range_to
      ) rows
    ), '[]'::jsonb) else '[]'::jsonb end,
    'debtPaymentRows', case when 'debt_payments' = any(v_sections) then coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date, rows.id)
      from (
        select payments.id, payments.date, payments.amount,
          payments.payment_method
        from public.debt_payments payments
        where payments.club_id = p_club_id
          and payments.date between p_range_from and p_range_to
      ) rows
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.get_finance_report_snapshot(uuid, date, date, text[])
  from public, anon;
grant execute on function public.get_finance_report_snapshot(uuid, date, date, text[])
  to authenticated;
