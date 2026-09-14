-- Product deletion is archival only. Preserve catalog rows used by historical
-- joins, including legacy purchases whose sale price resolves from products.
create or replace function public.protect_product_history()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'Products must be archived, not permanently deleted.' using errcode = '23514';
  end if;
  if TG_OP = 'UPDATE' then
    if OLD.is_deleted and
      (to_jsonb(NEW) - 'current_stock' - 'updated_at') is distinct from
      (to_jsonb(OLD) - 'current_stock' - 'updated_at') then
      raise exception 'Archived product metadata is read-only.' using errcode = '23514';
    end if;
    if NEW.is_deleted is distinct from OLD.is_deleted
       and auth.uid() is not null
       and public.current_user_club_role(OLD.club_id) is distinct from 'owner' then
      raise exception 'Only a club owner can archive products.' using errcode = '42501';
    end if;
  end if;
  if NEW.is_deleted then
    NEW.is_active := false;
    NEW.current_stock := 0;
    NEW.deleted_at := coalesce(NEW.deleted_at, now());
  end if;
  return NEW;
end;
$$;

-- Replace the narrower 038 trigger: inventory repair must never repopulate an
-- archived balance, nor may an API caller reactivate an archived product.
drop trigger if exists trg_zero_archived_product_stock on public.products;
create trigger trg_protect_product_history
  before insert or update or delete on public.products
  for each row execute function public.protect_product_history();
revoke all on function public.protect_product_history() from public, anon, authenticated;

-- Cover direct PostgREST writes as well as RPCs. The product lock serializes
-- ledger writes with archival; no purchase/count may slip in after archival.
create or replace function public.reject_archived_product_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_archived boolean;
begin
  select is_deleted into v_archived from public.products
  where id = NEW.product_id
    -- The existing club-match trigger fills an omitted club_id later in the
    -- BEFORE-trigger sequence. Check that path too; it must not bypass archive.
    and (NEW.club_id is null or club_id = NEW.club_id)
  for update;
  if v_archived then
    raise exception 'Archived products cannot receive new stock operations.' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
create trigger trg_reject_archived_purchase
  before insert or update on public.stock_purchases
  for each row execute function public.reject_archived_product_write();
create trigger trg_reject_archived_count
  before insert or update on public.daily_stock_counts
  for each row execute function public.reject_archived_product_write();
revoke all on function public.reject_archived_product_write() from public, anon, authenticated;
