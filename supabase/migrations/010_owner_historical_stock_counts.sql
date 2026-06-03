-- Owners can correct historical closing stock counts.
-- Admins may still work with today's closing stock, but historical rows are
-- owner-only. Historical corrections must not rewrite live product stock.

create or replace function update_stock_on_closing_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.date = (now() at time zone 'Asia/Tashkent')::date then
    update products
    set current_stock = NEW.closing_stock,
        updated_at = now()
    where id = NEW.product_id;
  end if;

  return NEW;
end;
$$;

drop policy if exists "admin_owner_write_stock_counts" on daily_stock_counts;
create policy "admin_owner_write_stock_counts" on daily_stock_counts
  for all
  using (
    current_user_role() = 'owner'
    or (
      current_user_role() = 'admin'
      and date = (now() at time zone 'Asia/Tashkent')::date
    )
  )
  with check (
    current_user_role() = 'owner'
    or (
      current_user_role() = 'admin'
      and date = (now() at time zone 'Asia/Tashkent')::date
    )
  );
