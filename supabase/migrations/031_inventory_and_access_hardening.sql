-- Make stock-purchase ledger changes atomic and harden privileged operations.

alter table public.stock_purchases
  add constraint stock_purchases_quantity_positive
    check (quantity > 0) not valid,
  add constraint stock_purchases_cost_price_nonnegative
    check (cost_price >= 0) not valid;

create or replace function public.record_stock_purchase(
  p_club_id uuid,
  p_date date,
  p_product_id uuid,
  p_quantity numeric,
  p_cost_price numeric,
  p_sale_price numeric default null,
  p_payment_method text default 'cash',
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_purchase_id uuid;
  v_business_date date;
begin
  if auth.uid() is null
    or public.current_user_club_role(p_club_id) not in ('admin', 'owner') then
    raise exception 'Not authorized to record purchases for this club.'
      using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Purchase quantity must be greater than zero.'
      using errcode = '23514';
  end if;

  if p_cost_price is null or p_cost_price < 0 then
    raise exception 'Purchase cost price cannot be negative.'
      using errcode = '23514';
  end if;

  if p_sale_price is not null and p_sale_price < 0 then
    raise exception 'Purchase sale price cannot be negative.'
      using errcode = '23514';
  end if;

  if p_payment_method not in ('cash', 'terminal', 'card') then
    raise exception 'Unsupported purchase payment method.'
      using errcode = '23514';
  end if;

  v_business_date := public.club_business_date(p_club_id);
  if p_date is null or p_date > v_business_date then
    raise exception 'Purchase date cannot be in the future.'
      using errcode = '22008';
  end if;

  -- The product row is the serialization point for all purchases of an item.
  perform 1
  from public.products
  where id = p_product_id
    and club_id = p_club_id
    and is_active
    and tracks_inventory
  for update;

  if not found then
    raise exception 'Active inventory product does not exist for this club.'
      using errcode = '23503';
  end if;

  -- Once a day has been counted, inserting an earlier purchase would require
  -- replaying every later stock closing. Keep closed history immutable instead.
  if exists (
    select 1
    from public.daily_stock_counts
    where club_id = p_club_id
      and product_id = p_product_id
      and date >= p_date
  ) then
    raise exception 'Cannot add a purchase on or before a saved stock closing. Reopen the affected closing first.'
      using errcode = '55000';
  end if;

  insert into public.stock_purchases (
    club_id,
    date,
    product_id,
    quantity,
    cost_price,
    sale_price,
    payment_method,
    comment,
    created_by
  ) values (
    p_club_id,
    p_date,
    p_product_id,
    p_quantity,
    p_cost_price,
    p_sale_price,
    p_payment_method,
    nullif(btrim(p_comment), ''),
    auth.uid()
  )
  returning id into v_purchase_id;

  return v_purchase_id;
end;
$$;

create or replace function public.delete_stock_purchase(
  p_club_id uuid,
  p_purchase_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_purchase public.stock_purchases%rowtype;
  v_current_stock numeric;
  v_current_cost numeric;
  v_remaining_stock numeric;
  v_remaining_value numeric;
begin
  if auth.uid() is null
    or public.current_user_club_role(p_club_id) not in ('admin', 'owner') then
    raise exception 'Not authorized to delete purchases for this club.'
      using errcode = '42501';
  end if;

  select *
  into v_purchase
  from public.stock_purchases
  where id = p_purchase_id
    and club_id = p_club_id
  for update;

  if not found then
    raise exception 'Stock purchase does not exist in this club.'
      using errcode = 'P0002';
  end if;

  select current_stock, cost_price
  into v_current_stock, v_current_cost
  from public.products
  where id = v_purchase.product_id
    and club_id = p_club_id
  for update;

  if not found then
    raise exception 'Product does not exist for this club.'
      using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.daily_stock_counts
    where club_id = p_club_id
      and product_id = v_purchase.product_id
      and date >= v_purchase.date
  ) then
    raise exception 'Cannot delete a purchase included in a saved stock closing. Reopen the affected closing first.'
      using errcode = '55000';
  end if;

  v_remaining_stock := coalesce(v_current_stock, 0) - v_purchase.quantity;
  if v_remaining_stock < 0 then
    raise exception 'Cannot delete purchase because current stock is lower than its quantity.'
      using errcode = '23514';
  end if;

  v_remaining_value := (coalesce(v_current_stock, 0) * coalesce(v_current_cost, 0))
    - (v_purchase.quantity * v_purchase.cost_price);

  delete from public.stock_purchases
  where id = v_purchase.id;

  update public.products
  set current_stock = v_remaining_stock,
      cost_price = case
        when v_remaining_stock = 0 then 0
        else greatest(v_remaining_value / v_remaining_stock, 0)
      end,
      updated_at = now()
  where id = v_purchase.product_id
    and club_id = p_club_id;
end;
$$;

-- Browser clients must use the atomic functions above. Service-role maintenance
-- scripts continue to bypass these grants when an explicit repair is required.
revoke insert, update, delete on table public.stock_purchases from authenticated;

revoke all on function public.record_stock_purchase(uuid, date, uuid, numeric, numeric, numeric, text, text)
  from public, anon;
revoke all on function public.delete_stock_purchase(uuid, uuid)
  from public, anon;
grant execute on function public.record_stock_purchase(uuid, date, uuid, numeric, numeric, numeric, text, text)
  to authenticated;
grant execute on function public.delete_stock_purchase(uuid, uuid)
  to authenticated;

-- PostgreSQL functions are executable by PUBLIC unless explicitly revoked.
revoke all on function public.get_latest_stock_closings(uuid, date)
  from public, anon;
revoke all on function public.get_dashboard_snapshot(uuid, date, date, date, date, date, date)
  from public, anon;
grant execute on function public.get_latest_stock_closings(uuid, date)
  to authenticated;
grant execute on function public.get_dashboard_snapshot(uuid, date, date, date, date, date, date)
  to authenticated;

create or replace function public.prevent_last_club_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_count integer;
begin
  if OLD.role <> 'owner'
    or (TG_OP = 'UPDATE' and NEW.role = 'owner') then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  -- Lock the club row so concurrent owner changes cannot both pass the count.
  perform 1
  from public.clubs
  where id = OLD.club_id
  for update;

  select count(*)
  into v_owner_count
  from public.club_memberships
  where club_id = OLD.club_id
    and role = 'owner'
    and user_id <> OLD.user_id;

  if v_owner_count = 0 then
    raise exception 'A club must always have at least one owner.'
      using errcode = '23514';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_prevent_last_club_owner_removal on public.club_memberships;
create trigger trg_prevent_last_club_owner_removal
  before delete or update of role on public.club_memberships
  for each row execute function public.prevent_last_club_owner_removal();

revoke all on function public.prevent_last_club_owner_removal()
  from public, anon, authenticated;
