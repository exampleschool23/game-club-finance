drop policy if exists "admin_owner_write_products" on products;

create policy "admin_owner_insert_products" on products
  for insert with check (current_user_role() in ('admin', 'owner'));

create policy "admin_owner_update_products" on products
  for update using (current_user_role() in ('admin', 'owner'))
  with check (current_user_role() in ('admin', 'owner'));

create policy "owner_delete_products" on products
  for delete using (current_user_role() = 'owner');
