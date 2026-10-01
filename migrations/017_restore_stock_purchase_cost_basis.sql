-- =============================================================
-- Restore stock purchase cost basis after multi-club trigger rewrite
-- =============================================================

create or replace function public.update_stock_on_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_stock numeric;
  v_current_cost numeric;
  v_new_stock numeric;
  v_avg_cost numeric;
begin
  select current_stock, cost_price
  into v_current_stock, v_current_cost
  from public.products
  where id = NEW.product_id
    and club_id = NEW.club_id
  for update;

  if not found then
    raise exception 'Product does not exist for this club.';
  end if;

  v_current_stock := coalesce(v_current_stock, 0);
  v_current_cost := coalesce(v_current_cost, 0);
  v_new_stock := v_current_stock + coalesce(NEW.quantity, 0);

  if v_new_stock <= 0 then
    v_avg_cost := coalesce(nullif(NEW.cost_price, 0), v_current_cost, 0);
  elsif v_current_stock <= 0 then
    v_avg_cost := coalesce(NEW.cost_price, 0);
  elsif coalesce(NEW.quantity, 0) <= 0 then
    v_avg_cost := v_current_cost;
  else
    v_avg_cost := (
      (v_current_stock * v_current_cost) +
      (NEW.quantity * coalesce(NEW.cost_price, 0))
    ) / v_new_stock;
  end if;

  update public.products
  set
    current_stock = v_new_stock,
    cost_price = v_avg_cost,
    sale_price = coalesce(NEW.sale_price, sale_price),
    updated_at = now()
  where id = NEW.product_id
    and club_id = NEW.club_id;

  return NEW;
end;
$$;

drop trigger if exists trg_stock_purchase on public.stock_purchases;
create trigger trg_stock_purchase
  after insert on public.stock_purchases
  for each row execute function public.update_stock_on_purchase();

with purchase_costs as (
  select
    club_id,
    product_id,
    sum(quantity * cost_price) / nullif(sum(quantity), 0) as avg_cost
  from public.stock_purchases
  where quantity > 0
    and cost_price > 0
  group by club_id, product_id
)
update public.products products
set
  cost_price = purchase_costs.avg_cost,
  updated_at = now()
from purchase_costs
where products.club_id = purchase_costs.club_id
  and products.id = purchase_costs.product_id
  and coalesce(products.cost_price, 0) = 0;

with resolved_costs as (
  select
    products.club_id,
    products.id as product_id,
    products.cost_price
  from public.products products
  where products.cost_price > 0
)
update public.daily_stock_counts counts
set
  cost_price = resolved_costs.cost_price,
  bar_income = counts.sold_quantity * counts.sale_price,
  bar_cost = counts.sold_quantity * resolved_costs.cost_price,
  bar_profit = (counts.sold_quantity * counts.sale_price) - (counts.sold_quantity * resolved_costs.cost_price),
  updated_at = now()
from resolved_costs
where counts.club_id = resolved_costs.club_id
  and counts.product_id = resolved_costs.product_id
  and coalesce(counts.cost_price, 0) = 0;
