-- Reduce dashboard network round trips and avoid loading all historical stock
-- rows just to find the latest closing value for each product.

create index if not exists idx_stock_counts_club_product_date_desc
  on public.daily_stock_counts (club_id, product_id, date desc);

create or replace function public.get_latest_stock_closings(
  p_club_id uuid,
  p_before_date date
)
returns table (
  product_id uuid,
  closing_stock numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (counts.product_id)
    counts.product_id,
    counts.closing_stock
  from public.daily_stock_counts counts
  where counts.club_id = p_club_id
    and counts.date < p_before_date
  order by counts.product_id, counts.date desc, counts.updated_at desc;
$$;

grant execute on function public.get_latest_stock_closings(uuid, date) to authenticated;

create or replace function public.get_dashboard_snapshot(
  p_club_id uuid,
  p_range_from date,
  p_range_to date,
  p_previous_from date,
  p_previous_to date,
  p_inventory_from date,
  p_inventory_to date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_finance_from date := least(p_range_from, p_previous_from);
  v_finance_to date := greatest(p_range_to, p_previous_to);
  v_stock_from date := least(v_finance_from, p_inventory_from);
  v_stock_to date := greatest(v_finance_to, p_inventory_to);
begin
  if auth.uid() is null or not public.user_has_club_access(p_club_id) then
    raise exception 'Not authorized for this club.';
  end if;

  return jsonb_build_object(
    'cashRows', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date, rows.created_at)
      from (
        select date, cash_income, terminal_income, card_income, playstation_income, created_at
        from public.daily_cash_entries
        where club_id = p_club_id and date between v_finance_from and v_finance_to
      ) rows
    ), '[]'::jsonb),
    'stockRows', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date, rows.product_id)
      from (
        select
          counts.product_id,
          counts.date,
          counts.bar_income,
          counts.bar_profit,
          counts.bar_cost,
          counts.sold_quantity,
          counts.closing_stock,
          counts.cost_price,
          counts.updated_at,
          jsonb_build_object('tracks_inventory', products.tracks_inventory) as products
        from public.daily_stock_counts counts
        left join public.products products on products.id = counts.product_id
        where counts.club_id = p_club_id and counts.date between v_stock_from and v_stock_to
      ) rows
    ), '[]'::jsonb),
    'purchaseRows', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date, rows.id)
      from (
        select id, date, quantity, cost_price, comment, created_at
        from public.stock_purchases
        where club_id = p_club_id and date between v_finance_from and v_finance_to
      ) rows
    ), '[]'::jsonb),
    'expenseRows', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date, rows.id)
      from (
        select id, date, amount, category, payment_method, payment_source, comment, created_at
        from public.expenses
        where club_id = p_club_id and date between v_finance_from and v_finance_to
      ) rows
    ), '[]'::jsonb),
    'debtRows', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.created_at desc, rows.id)
      from (
        select id, person_name, date, amount, remaining_amount, status, created_at
        from public.new_debts
        where club_id = p_club_id
      ) rows
    ), '[]'::jsonb),
    'debtPaymentRows', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.date, rows.id)
      from (
        select id, date, amount, payment_method
        from public.debt_payments
        where club_id = p_club_id and date between v_finance_from and v_finance_to
      ) rows
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.sort_order nulls last, rows.name, rows.id)
      from (
        select *
        from public.products
        where club_id = p_club_id and is_active = true
      ) rows
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_dashboard_snapshot(uuid, date, date, date, date, date, date) to authenticated;
