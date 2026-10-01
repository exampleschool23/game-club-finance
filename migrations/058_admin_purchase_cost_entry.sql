-- Direct catalog cost changes remain owner-only. Authorized purchase RPCs may
-- change an admin's product average cost as stock enters or leaves inventory.
-- No ledger rows or existing cost prices are rewritten by this migration.
create or replace function public.enforce_product_cost_price_owner()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'UPDATE'
    and current_user::text not in ('authenticated', 'anon')
    and NEW.current_stock is distinct from OLD.current_stock
    and public.current_user_club_role(NEW.club_id) = 'admin'
    and public.current_user_can_access_club_feature(NEW.club_id, 'stock_purchase') then
    -- current_user is the trusted RPC/trigger owner here, not a caller-supplied
    -- flag. Direct browser writes cannot use this exception, even if they try
    -- to submit a changed stock balance alongside the cost.
    return NEW;
  end if;

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
revoke all on function public.enforce_product_cost_price_owner() from public, anon, authenticated;

-- New purchase costs describe the receipt and are entered by owners or admins
-- through record_stock_purchase. Existing receipt costs cannot be rewritten by
-- admins. Keep the ledger's RPC-only write grants and feature-access trigger.
create or replace function public.enforce_purchase_cost_price_owner()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if NEW.cost_price is distinct from OLD.cost_price
    and (auth.uid() is not null or current_user::text in ('authenticated', 'anon'))
    and (auth.uid() is null
      or public.current_user_club_role(NEW.club_id) is distinct from 'owner') then
    raise exception 'Only a club owner can change existing purchase cost prices.' using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_purchase_cost_price_owner on public.stock_purchases;
create trigger trg_enforce_purchase_cost_price_owner
  before update of cost_price on public.stock_purchases
  for each row execute function public.enforce_purchase_cost_price_owner();
revoke all on function public.enforce_purchase_cost_price_owner() from public, anon, authenticated;
