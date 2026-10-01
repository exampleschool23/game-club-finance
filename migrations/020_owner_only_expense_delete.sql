drop policy if exists "admin_owner_write_expenses" on public.expenses;
drop policy if exists "club_admin_write_expenses" on public.expenses;
drop policy if exists "club_admin_insert_expenses" on public.expenses;
drop policy if exists "club_admin_update_expenses" on public.expenses;
drop policy if exists "club_owner_delete_expenses" on public.expenses;

create policy "club_admin_insert_expenses" on public.expenses
  for insert
  with check (public.current_user_club_role(club_id) in ('admin', 'owner'));

create policy "club_admin_update_expenses" on public.expenses
  for update
  using (public.current_user_club_role(club_id) in ('admin', 'owner'))
  with check (public.current_user_club_role(club_id) in ('admin', 'owner'));

create policy "club_owner_delete_expenses" on public.expenses
  for delete
  using (public.current_user_club_role(club_id) = 'owner');
