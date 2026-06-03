-- =============================================================
-- Weighted average product cost on stock purchase
-- Closing Stock uses products.cost_price, so purchases must keep
-- that field as the current weighted average buy price.
-- =============================================================

create or replace function update_stock_on_purchase()
returns trigger language plpgsql security definer as $$
declare
  v_current_stock numeric;
  v_current_cost numeric;
  v_new_stock numeric;
  v_avg_cost numeric;
begin
  select current_stock, cost_price
  into v_current_stock, v_current_cost
  from products
  where id = NEW.product_id
  for update;

  v_current_stock := coalesce(v_current_stock, 0);
  v_current_cost := coalesce(v_current_cost, 0);
  v_new_stock := v_current_stock + NEW.quantity;

  if v_new_stock <= 0 then
    v_avg_cost := coalesce(NEW.cost_price, v_current_cost, 0);
  elsif v_current_stock <= 0 then
    v_avg_cost := NEW.cost_price;
  elsif NEW.quantity <= 0 then
    v_avg_cost := v_current_cost;
  else
    v_avg_cost := (
      (v_current_stock * v_current_cost) +
      (NEW.quantity * NEW.cost_price)
    ) / v_new_stock;
  end if;

  update products
  set
    current_stock = v_new_stock,
    cost_price = v_avg_cost,
    sale_price = coalesce(NEW.sale_price, sale_price),
    updated_at = now()
  where id = NEW.product_id;

  return NEW;
end;
$$;

drop trigger if exists trg_stock_purchase on stock_purchases;
create trigger trg_stock_purchase
  after insert on stock_purchases
  for each row execute function update_stock_on_purchase();
