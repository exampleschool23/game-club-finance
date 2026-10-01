-- Made-to-order products record direct sales but do not carry finished-goods stock.

alter table public.products
  add column if not exists tracks_inventory boolean not null default true;

update public.products
set tracks_inventory = false,
    current_stock = 0,
    updated_at = now()
where id in (
  'e8c3559b-41b4-4d96-88f3-6f95b272570a', -- XOT DOG
  'da221cef-647a-4df3-898a-7d5ad536ffd6'  -- XOT DOG KATTA
);

alter table public.products
  drop constraint if exists products_non_inventory_zero_stock;

alter table public.products
  add constraint products_non_inventory_zero_stock
  check (tracks_inventory or current_stock = 0);

create or replace function public.update_stock_on_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_stock numeric;
  v_current_cost numeric;
  v_tracks_inventory boolean;
  v_new_stock numeric;
  v_avg_cost numeric;
begin
  select current_stock, cost_price, tracks_inventory
  into v_current_stock, v_current_cost, v_tracks_inventory
  from public.products
  where id = NEW.product_id
    and club_id = NEW.club_id
  for update;

  if not found then
    raise exception 'Product does not exist for this club.';
  end if;

  if not v_tracks_inventory then
    raise exception 'Made-to-order products cannot receive stock purchases.';
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
  set current_stock = v_new_stock,
      cost_price = v_avg_cost,
      sale_price = coalesce(NEW.sale_price, sale_price),
      updated_at = now()
  where id = NEW.product_id
    and club_id = NEW.club_id;

  return NEW;
end;
$$;

create or replace function public.update_stock_on_closing_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.date = public.club_business_date(NEW.club_id) then
    update public.products
    set current_stock = NEW.closing_stock,
        updated_at = now()
    where id = NEW.product_id
      and club_id = NEW.club_id
      and tracks_inventory;
  end if;

  return NEW;
end;
$$;
