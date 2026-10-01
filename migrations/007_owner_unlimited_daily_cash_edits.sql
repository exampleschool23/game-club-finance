-- Owners can always edit/delete daily cash entries.
-- Admins keep the 15 minute edit/delete window.

drop policy if exists "admin_owner_update_cash_entries_15m" on daily_cash_entries;
drop policy if exists "admin_owner_delete_cash_entries_15m" on daily_cash_entries;

create policy "owner_admin_update_cash_entries" on daily_cash_entries
  for update
  using (
    public.current_user_role() = 'owner'
    or (
      public.current_user_role() = 'admin'
      and created_at > now() - interval '15 minutes'
    )
  )
  with check (
    public.current_user_role() = 'owner'
    or (
      public.current_user_role() = 'admin'
      and created_at > now() - interval '15 minutes'
    )
  );

create policy "owner_admin_delete_cash_entries" on daily_cash_entries
  for delete
  using (
    public.current_user_role() = 'owner'
    or (
      public.current_user_role() = 'admin'
      and created_at > now() - interval '15 minutes'
    )
  );
