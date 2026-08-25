-- Daily cash corrections may be edited by admins during their edit window,
-- but deleting the underlying finance record is reserved for club owners.

drop policy if exists "owner_admin_delete_cash_entries" on public.daily_cash_entries;
drop policy if exists "club_owner_admin_delete_cash_entries" on public.daily_cash_entries;
drop policy if exists "club_owner_delete_cash_entries" on public.daily_cash_entries;

create policy "club_owner_delete_cash_entries" on public.daily_cash_entries
  for delete
  using (public.current_user_club_role(club_id) = 'owner');
