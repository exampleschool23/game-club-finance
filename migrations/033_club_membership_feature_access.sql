-- Per-member, per-club feature access. NULL preserves the role defaults so
-- existing memberships keep exactly the same access after this migration.

alter table public.club_memberships
  add column if not exists feature_access text[];

alter table public.club_memberships
  drop constraint if exists club_memberships_feature_access_valid;

alter table public.club_memberships
  add constraint club_memberships_feature_access_valid
  check (
    feature_access is null
    or feature_access <@ array[
      'dashboard',
      'daily_cash',
      'closing_stock',
      'stock_purchase',
      'expenses',
      'reports',
      'owner_profit',
      'debts',
      'inventory',
      'team',
      'settings'
    ]::text[]
  );

create or replace function public.current_user_can_access_club_feature(
  p_club_id uuid,
  p_feature_key text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select case
      when membership.role = 'owner'::user_role then true
      when p_feature_key = 'team' then false
      when membership.feature_access is not null then p_feature_key = any(membership.feature_access)
      when membership.role = 'admin'::user_role then p_feature_key = any(array[
        'dashboard', 'daily_cash', 'closing_stock', 'stock_purchase', 'expenses',
        'reports', 'owner_profit', 'debts', 'inventory', 'settings'
      ]::text[])
      when membership.role = 'viewer'::user_role then p_feature_key = any(array[
        'dashboard', 'reports', 'owner_profit', 'debts', 'inventory', 'settings'
      ]::text[])
      else false
    end
    from public.club_memberships membership
    where membership.club_id = p_club_id
      and membership.user_id = auth.uid()
  ), false);
$$;

revoke all on function public.current_user_can_access_club_feature(uuid, text)
  from public, anon;
grant execute on function public.current_user_can_access_club_feature(uuid, text)
  to authenticated;

create or replace function public.current_user_can_access_club_feature_any(
  p_club_id uuid,
  p_feature_keys text[]
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from unnest(p_feature_keys) requested(feature_key)
    where public.current_user_can_access_club_feature(p_club_id, requested.feature_key)
  );
$$;

revoke all on function public.current_user_can_access_club_feature_any(uuid, text[])
  from public, anon;
grant execute on function public.current_user_can_access_club_feature_any(uuid, text[])
  to authenticated;

-- Read policies use the union of pages that consume each ledger. This keeps a
-- directly entered URL or REST request aligned with the sidebar permissions.
drop policy if exists "club_read_products" on public.products;
create policy "club_read_products" on public.products
  for select using (public.current_user_can_access_club_feature_any(
    club_id,
    array['dashboard', 'closing_stock', 'stock_purchase', 'reports', 'owner_profit', 'inventory']::text[]
  ));

drop policy if exists "club_read_cash_entries" on public.daily_cash_entries;
create policy "club_read_cash_entries" on public.daily_cash_entries
  for select using (public.current_user_can_access_club_feature_any(
    club_id,
    array['dashboard', 'daily_cash', 'reports', 'owner_profit']::text[]
  ));

drop policy if exists "club_read_stock_purchases" on public.stock_purchases;
create policy "club_read_stock_purchases" on public.stock_purchases
  for select using (public.current_user_can_access_club_feature_any(
    club_id,
    array['dashboard', 'closing_stock', 'stock_purchase', 'reports', 'owner_profit']::text[]
  ));

drop policy if exists "club_read_stock_counts" on public.daily_stock_counts;
create policy "club_read_stock_counts" on public.daily_stock_counts
  for select using (public.current_user_can_access_club_feature_any(
    club_id,
    array['dashboard', 'closing_stock', 'reports', 'owner_profit']::text[]
  ));

drop policy if exists "club_read_expenses" on public.expenses;
create policy "club_read_expenses" on public.expenses
  for select using (public.current_user_can_access_club_feature_any(
    club_id,
    array['dashboard', 'expenses', 'reports', 'owner_profit']::text[]
  ));

drop policy if exists "club_read_debts" on public.new_debts;
create policy "club_read_debts" on public.new_debts
  for select using (public.current_user_can_access_club_feature_any(
    club_id,
    array['dashboard', 'debts', 'reports', 'owner_profit']::text[]
  ));

drop policy if exists "club_read_debt_payments" on public.debt_payments;
create policy "club_read_debt_payments" on public.debt_payments
  for select using (public.current_user_can_access_club_feature_any(
    club_id,
    array['dashboard', 'debts', 'reports', 'owner_profit']::text[]
  ));

drop policy if exists "club_members_read_owner_withdrawals" on public.owner_withdrawals;
create policy "club_members_read_owner_withdrawals" on public.owner_withdrawals
  for select using (public.current_user_can_access_club_feature(club_id, 'owner_profit'));

-- Feature access also gates writes. Existing role and edit-window rules stay
-- intact; this only adds the missing feature check.
drop policy if exists "club_admin_insert_products" on public.products;
create policy "club_admin_insert_products" on public.products
  for insert with check (
    public.current_user_club_role(club_id) in ('admin', 'owner')
    and public.current_user_can_access_club_feature(club_id, 'inventory')
  );

drop policy if exists "club_admin_update_products" on public.products;
create policy "club_admin_update_products" on public.products
  for update using (
    public.current_user_club_role(club_id) in ('admin', 'owner')
    and public.current_user_can_access_club_feature(club_id, 'inventory')
  )
  with check (
    public.current_user_club_role(club_id) in ('admin', 'owner')
    and public.current_user_can_access_club_feature(club_id, 'inventory')
  );

drop policy if exists "club_admin_insert_cash_entries" on public.daily_cash_entries;
create policy "club_admin_insert_cash_entries" on public.daily_cash_entries
  for insert with check (
    public.current_user_club_role(club_id) in ('admin', 'owner')
    and public.current_user_can_access_club_feature(club_id, 'daily_cash')
  );

drop policy if exists "club_owner_admin_update_cash_entries" on public.daily_cash_entries;
create policy "club_owner_admin_update_cash_entries" on public.daily_cash_entries
  for update using (
    public.current_user_can_access_club_feature(club_id, 'daily_cash')
    and (
      public.current_user_club_role(club_id) = 'owner'
      or (
        public.current_user_club_role(club_id) = 'admin'
        and created_at > now() - interval '15 minutes'
      )
    )
  )
  with check (
    public.current_user_can_access_club_feature(club_id, 'daily_cash')
    and (
      public.current_user_club_role(club_id) = 'owner'
      or (
        public.current_user_club_role(club_id) = 'admin'
        and created_at > now() - interval '15 minutes'
      )
    )
  );

drop policy if exists "club_owner_admin_delete_cash_entries" on public.daily_cash_entries;
create policy "club_owner_admin_delete_cash_entries" on public.daily_cash_entries
  for delete using (
    public.current_user_can_access_club_feature(club_id, 'daily_cash')
    and (
      public.current_user_club_role(club_id) = 'owner'
      or (
        public.current_user_club_role(club_id) = 'admin'
        and created_at > now() - interval '15 minutes'
      )
    )
  );

drop policy if exists "club_admin_write_stock_counts" on public.daily_stock_counts;
create policy "club_admin_write_stock_counts" on public.daily_stock_counts
  for all using (
    public.current_user_can_access_club_feature(club_id, 'closing_stock')
    and (
      public.current_user_club_role(club_id) = 'owner'
      or (
        public.current_user_club_role(club_id) = 'admin'
        and date = public.club_business_date(club_id)
      )
    )
  )
  with check (
    public.current_user_can_access_club_feature(club_id, 'closing_stock')
    and (
      public.current_user_club_role(club_id) = 'owner'
      or (
        public.current_user_club_role(club_id) = 'admin'
        and date = public.club_business_date(club_id)
      )
    )
  );

drop policy if exists "club_admin_insert_expenses" on public.expenses;
create policy "club_admin_insert_expenses" on public.expenses
  for insert with check (
    public.current_user_club_role(club_id) in ('admin', 'owner')
    and public.current_user_can_access_club_feature(club_id, 'expenses')
  );

drop policy if exists "club_admin_update_expenses" on public.expenses;
create policy "club_admin_update_expenses" on public.expenses
  for update using (
    public.current_user_club_role(club_id) in ('admin', 'owner')
    and public.current_user_can_access_club_feature(club_id, 'expenses')
  )
  with check (
    public.current_user_club_role(club_id) in ('admin', 'owner')
    and public.current_user_can_access_club_feature(club_id, 'expenses')
  );

drop policy if exists "club_admin_write_debts" on public.new_debts;
create policy "club_admin_write_debts" on public.new_debts
  for all using (
    public.current_user_club_role(club_id) in ('admin', 'owner')
    and public.current_user_can_access_club_feature(club_id, 'debts')
  )
  with check (
    public.current_user_club_role(club_id) in ('admin', 'owner')
    and public.current_user_can_access_club_feature(club_id, 'debts')
  );

drop policy if exists "club_admin_insert_debt_payments" on public.debt_payments;
create policy "club_admin_insert_debt_payments" on public.debt_payments
  for insert with check (
    public.current_user_club_role(club_id) in ('admin', 'owner')
    and public.current_user_can_access_club_feature(club_id, 'debts')
  );

create or replace function public.enforce_stock_purchase_feature_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club_id uuid := case when TG_OP = 'DELETE' then OLD.club_id else NEW.club_id end;
begin
  if auth.uid() is not null
    and not public.current_user_can_access_club_feature(v_club_id, 'stock_purchase') then
    raise exception 'Stock Purchase access is not enabled for this account.'
      using errcode = '42501';
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

drop trigger if exists trg_stock_purchase_feature_access on public.stock_purchases;
create trigger trg_stock_purchase_feature_access
  before insert or delete on public.stock_purchases
  for each row execute function public.enforce_stock_purchase_feature_access();
