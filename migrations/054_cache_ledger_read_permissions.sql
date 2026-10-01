-- Evaluate club/feature access once per statement, not once per ledger row.
-- Preserve the feature unions from 033 and the authoritative membership helper.
-- No ledger rows, grants on ledger tables, or financial formulas are changed.

begin;

create or replace function public.current_user_readable_clubs(p_feature_keys text[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select membership.club_id
  from public.club_memberships membership
  where membership.user_id = (select auth.uid())
    and public.current_user_can_access_club_feature_any(membership.club_id, p_feature_keys);
$$;

revoke all on function public.current_user_readable_clubs(text[]) from public, anon;
grant execute on function public.current_user_readable_clubs(text[]) to authenticated;

alter policy "club_read_products" on public.products
  to authenticated
  using (club_id in (select public.current_user_readable_clubs(array['dashboard', 'closing_stock', 'stock_purchase', 'reports', 'owner_profit', 'inventory']::text[])));

alter policy "club_read_cash_entries" on public.daily_cash_entries
  to authenticated
  using (club_id in (select public.current_user_readable_clubs(array['dashboard', 'daily_cash', 'reports', 'owner_profit']::text[])));

alter policy "club_read_stock_purchases" on public.stock_purchases
  to authenticated
  using (club_id in (select public.current_user_readable_clubs(array['dashboard', 'closing_stock', 'stock_purchase', 'reports', 'owner_profit']::text[])));

alter policy "club_read_stock_counts" on public.daily_stock_counts
  to authenticated
  using (club_id in (select public.current_user_readable_clubs(array['dashboard', 'closing_stock', 'reports', 'owner_profit']::text[])));

alter policy "club_read_expenses" on public.expenses
  to authenticated
  using (club_id in (select public.current_user_readable_clubs(array['dashboard', 'expenses', 'reports', 'owner_profit']::text[])));

alter policy "club_read_debts" on public.new_debts
  to authenticated
  using (club_id in (select public.current_user_readable_clubs(array['dashboard', 'debts', 'reports', 'owner_profit']::text[])));

alter policy "club_read_debt_payments" on public.debt_payments
  to authenticated
  using (club_id in (select public.current_user_readable_clubs(array['dashboard', 'debts', 'reports', 'owner_profit']::text[])));

alter policy "club_members_read_owner_withdrawals" on public.owner_withdrawals
  to authenticated
  using (club_id in (select public.current_user_readable_clubs(array['owner_profit']::text[])));

-- FOR ALL also participates in SELECT, even though this is a write policy.
-- Its read access is a subset of club_read_stock_counts (closing_stock feature).
-- Split it into the same three write operations so scans don't execute its
-- role and business-date checks on every historical row. Keep both USING and
-- WITH CHECK predicates identical to 033 for their applicable operations.
drop policy if exists "club_admin_write_stock_counts" on public.daily_stock_counts;

create policy "club_admin_insert_stock_counts" on public.daily_stock_counts
  for insert with check (
    public.current_user_can_access_club_feature(club_id, 'closing_stock')
    and (
      public.current_user_club_role(club_id) = 'owner'
      or (
        public.current_user_club_role(club_id) = 'admin'
        and date = public.club_business_date(club_id)
      )
    )
  );

create policy "club_admin_update_stock_counts" on public.daily_stock_counts
  for update using (
    public.current_user_can_access_club_feature(club_id, 'closing_stock')
    and (
      public.current_user_club_role(club_id) = 'owner'
      or (
        public.current_user_club_role(club_id) = 'admin'
        and date = public.club_business_date(club_id)
      )
    )
  ) with check (
    public.current_user_can_access_club_feature(club_id, 'closing_stock')
    and (
      public.current_user_club_role(club_id) = 'owner'
      or (
        public.current_user_club_role(club_id) = 'admin'
        and date = public.club_business_date(club_id)
      )
    )
  );

create policy "club_admin_delete_stock_counts" on public.daily_stock_counts
  for delete using (
    public.current_user_can_access_club_feature(club_id, 'closing_stock')
    and (
      public.current_user_club_role(club_id) = 'owner'
      or (
        public.current_user_club_role(club_id) = 'admin'
        and date = public.club_business_date(club_id)
      )
    )
  );

commit;
