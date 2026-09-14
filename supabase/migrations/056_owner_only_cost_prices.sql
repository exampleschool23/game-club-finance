-- Check the original authenticated actor even inside security-definer inventory
-- functions. This also covers purchase deletion that would change average cost.
create or replace function public.enforce_product_cost_price_owner()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if (case when TG_OP = 'INSERT' then NEW.cost_price <> 0
      else NEW.cost_price is distinct from OLD.cost_price end)
    and (auth.uid() is not null or current_user::text in ('authenticated', 'anon'))
    and (auth.uid() is null
      or public.current_user_club_role(NEW.club_id) is distinct from 'owner') then
    raise exception 'Only a club owner can change cost prices.' using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_product_cost_price_owner on public.products;
create trigger trg_enforce_product_cost_price_owner
  before insert or update on public.products
  for each row execute function public.enforce_product_cost_price_owner();
revoke all on function public.enforce_product_cost_price_owner() from public, anon, authenticated;

-- Admins may purchase at the existing cost but cannot supply a new cost,
-- including when rounding would leave the product's average cost unchanged.
create or replace function public.enforce_purchase_cost_price_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
begin
  select * into v_product from public.products
  where id = NEW.product_id and (NEW.club_id is null or club_id = NEW.club_id)
  for update;
  if not found then
    raise exception 'Product does not exist for this club.' using errcode = '23503';
  end if;
  if auth.uid() is not null
    and public.current_user_club_role(v_product.club_id) is distinct from 'owner'
    and (NEW.cost_price is distinct from v_product.cost_price
      or (TG_OP = 'UPDATE' and NEW.cost_price is distinct from OLD.cost_price)) then
    raise exception 'Only a club owner can change cost prices.' using errcode = '42501';
  end if;
  return NEW;
end;
$$;
create trigger trg_enforce_purchase_cost_price_owner
  before insert or update on public.stock_purchases
  for each row execute function public.enforce_purchase_cost_price_owner();
revoke all on function public.enforce_purchase_cost_price_owner() from public, anon, authenticated;
