-- =============================================================
-- Multi-club support
-- =============================================================

create table if not exists public.clubs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_memberships (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role user_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

insert into public.clubs (name)
select 'Main Game Club'
where not exists (select 1 from public.clubs);

insert into public.club_memberships (club_id, user_id, role)
select
  (select id from public.clubs order by created_at asc limit 1),
  profiles.id,
  profiles.role
from public.profiles
on conflict (club_id, user_id) do nothing;

alter table public.products add column if not exists club_id uuid references public.clubs(id);
alter table public.daily_cash_entries add column if not exists club_id uuid references public.clubs(id);
alter table public.stock_purchases add column if not exists club_id uuid references public.clubs(id);
alter table public.daily_stock_counts add column if not exists club_id uuid references public.clubs(id);
alter table public.expenses add column if not exists club_id uuid references public.clubs(id);
alter table public.new_debts add column if not exists club_id uuid references public.clubs(id);
alter table public.debt_payments add column if not exists club_id uuid references public.clubs(id);
alter table public.balances add column if not exists club_id uuid references public.clubs(id);
alter table public.income_transactions add column if not exists club_id uuid references public.clubs(id);
alter table public.expense_transactions add column if not exists club_id uuid references public.clubs(id);
alter table public.cash_movements add column if not exists club_id uuid references public.clubs(id);
alter table public.debts add column if not exists club_id uuid references public.clubs(id);

do $$
declare
  default_club_id uuid;
begin
  select id into default_club_id from public.clubs order by created_at asc limit 1;

  update public.products set club_id = default_club_id where club_id is null;
  update public.daily_cash_entries set club_id = default_club_id where club_id is null;
  update public.expenses set club_id = default_club_id where club_id is null;
  update public.new_debts set club_id = default_club_id where club_id is null;
  update public.balances set club_id = default_club_id where club_id is null;
  update public.income_transactions set club_id = default_club_id where club_id is null;
  update public.expense_transactions set club_id = default_club_id where club_id is null;
  update public.cash_movements set club_id = default_club_id where club_id is null;
  update public.debts set club_id = default_club_id where club_id is null;

  update public.stock_purchases stock_purchases
  set club_id = products.club_id
  from public.products products
  where stock_purchases.product_id = products.id
    and stock_purchases.club_id is null;

  update public.daily_stock_counts daily_stock_counts
  set club_id = products.club_id
  from public.products products
  where daily_stock_counts.product_id = products.id
    and daily_stock_counts.club_id is null;

  update public.debt_payments debt_payments
  set club_id = new_debts.club_id
  from public.new_debts new_debts
  where debt_payments.debt_id = new_debts.id
    and debt_payments.club_id is null;

  update public.stock_purchases set club_id = default_club_id where club_id is null;
  update public.daily_stock_counts set club_id = default_club_id where club_id is null;
  update public.debt_payments set club_id = default_club_id where club_id is null;
end $$;

alter table public.products alter column club_id set not null;
alter table public.daily_cash_entries alter column club_id set not null;
alter table public.stock_purchases alter column club_id set not null;
alter table public.daily_stock_counts alter column club_id set not null;
alter table public.expenses alter column club_id set not null;
alter table public.new_debts alter column club_id set not null;
alter table public.debt_payments alter column club_id set not null;
alter table public.balances alter column club_id set not null;
alter table public.income_transactions alter column club_id set not null;
alter table public.expense_transactions alter column club_id set not null;
alter table public.cash_movements alter column club_id set not null;
alter table public.debts alter column club_id set not null;

alter table public.daily_cash_entries drop constraint if exists daily_cash_entries_date_key;
alter table public.balances drop constraint if exists balances_account_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'daily_cash_entries_club_date_key'
  ) then
    alter table public.daily_cash_entries
      add constraint daily_cash_entries_club_date_key unique (club_id, date);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'balances_club_account_key'
  ) then
    alter table public.balances
      add constraint balances_club_account_key unique (club_id, account);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'daily_stock_counts_club_date_product_key'
  ) then
    alter table public.daily_stock_counts
      add constraint daily_stock_counts_club_date_product_key unique (club_id, date, product_id);
  end if;
end $$;

create index if not exists idx_club_memberships_user on public.club_memberships(user_id);
create index if not exists idx_products_club_active on public.products(club_id, is_active);
create index if not exists idx_cash_entries_club_date on public.daily_cash_entries(club_id, date);
create index if not exists idx_stock_purchases_club_date on public.stock_purchases(club_id, date);
create index if not exists idx_stock_counts_club_date on public.daily_stock_counts(club_id, date);
create index if not exists idx_expenses_club_date on public.expenses(club_id, date);
create index if not exists idx_new_debts_club_date on public.new_debts(club_id, date);
create index if not exists idx_debt_payments_club_date on public.debt_payments(club_id, date);
create index if not exists idx_balances_club on public.balances(club_id);

create or replace function public.user_has_club_access(p_club_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.club_memberships
    where club_id = p_club_id
      and user_id = auth.uid()
  )
$$;

create or replace function public.current_user_club_role(p_club_id uuid)
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.club_memberships
  where club_id = p_club_id
    and user_id = auth.uid()
$$;

create or replace function public.current_user_is_global_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'::user_role
  )
  or exists (
    select 1
    from public.club_memberships
    where user_id = auth.uid()
      and role = 'owner'::user_role
  )
$$;

create or replace function public.shares_club_with_current_user(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.club_memberships mine
    join public.club_memberships theirs on theirs.club_id = mine.club_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
  )
$$;

create or replace function public.current_user_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select role
      from public.club_memberships
      where user_id = auth.uid()
      order by case role when 'owner' then 1 when 'admin' then 2 else 3 end
      limit 1
    ),
    (select role from public.profiles where id = auth.uid())
  )
$$;

create or replace function public.seed_balances_for_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.balances (club_id, account, amount)
  values
    (NEW.id, 'cash', 0),
    (NEW.id, 'terminal', 0),
    (NEW.id, 'bank', 0),
    (NEW.id, 'debt', 0)
  on conflict (club_id, account) do nothing;

  return NEW;
end;
$$;

drop trigger if exists trg_seed_balances_for_club on public.clubs;
create trigger trg_seed_balances_for_club
  after insert on public.clubs
  for each row execute function public.seed_balances_for_club();

insert into public.balances (club_id, account, amount)
select clubs.id, accounts.account, 0
from public.clubs clubs
cross join (values ('cash'), ('terminal'), ('bank'), ('debt')) as accounts(account)
on conflict (club_id, account) do nothing;

create or replace function public.create_club_with_owner(p_name text, p_address text default null)
returns public.clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  created_club public.clubs;
begin
  if auth.uid() is null or not public.current_user_is_global_owner() then
    raise exception 'Only an owner can create clubs.';
  end if;

  insert into public.clubs (name, address)
  values (nullif(trim(p_name), ''), nullif(trim(p_address), ''))
  returning * into created_club;

  insert into public.club_memberships (club_id, user_id, role)
  values (created_club.id, auth.uid(), 'owner')
  on conflict (club_id, user_id) do update
    set role = 'owner',
        updated_at = now();

  return created_club;
end;
$$;

create or replace function public.ensure_product_club_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_club_id uuid;
begin
  select club_id into product_club_id
  from public.products
  where id = NEW.product_id;

  if product_club_id is null then
    raise exception 'Product does not exist.';
  end if;

  if NEW.club_id is null then
    NEW.club_id := product_club_id;
  end if;

  if NEW.club_id <> product_club_id then
    raise exception 'Product belongs to a different club.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_stock_purchase_product_club on public.stock_purchases;
create trigger trg_stock_purchase_product_club
  before insert or update on public.stock_purchases
  for each row execute function public.ensure_product_club_match();

drop trigger if exists trg_stock_count_product_club on public.daily_stock_counts;
create trigger trg_stock_count_product_club
  before insert or update on public.daily_stock_counts
  for each row execute function public.ensure_product_club_match();

create or replace function public.ensure_debt_payment_club_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  debt_club_id uuid;
begin
  select club_id into debt_club_id
  from public.new_debts
  where id = NEW.debt_id;

  if debt_club_id is null then
    raise exception 'Debt does not exist.';
  end if;

  if NEW.club_id is null then
    NEW.club_id := debt_club_id;
  end if;

  if NEW.club_id <> debt_club_id then
    raise exception 'Debt belongs to a different club.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_debt_payment_club on public.debt_payments;
create trigger trg_debt_payment_club
  before insert or update on public.debt_payments
  for each row execute function public.ensure_debt_payment_club_match();

create or replace function public.update_stock_on_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
  set
    current_stock = current_stock + NEW.quantity,
    updated_at = now()
  where id = NEW.product_id
    and club_id = NEW.club_id;

  return NEW;
end;
$$;

create or replace function public.update_stock_on_closing_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.date = (now() at time zone 'Asia/Tashkent')::date then
    update public.products
    set current_stock = NEW.closing_stock,
        updated_at = now()
    where id = NEW.product_id
      and club_id = NEW.club_id;
  end if;

  return NEW;
end;
$$;

create or replace function public.update_debt_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.new_debts
  set
    paid_amount = paid_amount + NEW.amount,
    remaining_amount = amount - (paid_amount + NEW.amount),
    status = case
      when amount <= (paid_amount + NEW.amount) then 'paid'
      when paid_amount + NEW.amount > 0 then 'partial'
      else 'unpaid'
    end,
    updated_at = now()
  where id = NEW.debt_id
    and club_id = NEW.club_id;

  return NEW;
end;
$$;

create or replace function public.update_balance_on_income()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account text;
begin
  case NEW.payment_method
    when 'cash' then v_account := 'cash';
    when 'terminal' then v_account := 'terminal';
    when 'qr' then v_account := 'bank';
    when 'transfer' then v_account := 'bank';
    when 'debt' then v_account := 'debt';
  end case;

  update public.balances
  set amount = amount + NEW.amount,
      updated_at = now()
  where account = v_account
    and club_id = NEW.club_id;

  return NEW;
end;
$$;

create or replace function public.rollback_balance_on_income_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account text;
begin
  case OLD.payment_method
    when 'cash' then v_account := 'cash';
    when 'terminal' then v_account := 'terminal';
    when 'qr' then v_account := 'bank';
    when 'transfer' then v_account := 'bank';
    when 'debt' then v_account := 'debt';
  end case;

  update public.balances
  set amount = amount - OLD.amount,
      updated_at = now()
  where account = v_account
    and club_id = OLD.club_id;

  return OLD;
end;
$$;

create or replace function public.update_balance_on_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account text;
begin
  case NEW.payment_source
    when 'cash' then v_account := 'cash';
    when 'terminal' then v_account := 'terminal';
    when 'bank' then v_account := 'bank';
  end case;

  update public.balances
  set amount = amount - NEW.amount,
      updated_at = now()
  where account = v_account
    and club_id = NEW.club_id;

  return NEW;
end;
$$;

create or replace function public.rollback_balance_on_expense_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account text;
begin
  case OLD.payment_source
    when 'cash' then v_account := 'cash';
    when 'terminal' then v_account := 'terminal';
    when 'bank' then v_account := 'bank';
  end case;

  update public.balances
  set amount = amount + OLD.amount,
      updated_at = now()
  where account = v_account
    and club_id = OLD.club_id;

  return OLD;
end;
$$;

create or replace function public.apply_cash_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.balances
  set amount = amount + NEW.amount,
      updated_at = now()
  where account = NEW.account
    and club_id = NEW.club_id;

  return NEW;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role user_role;
  display_name text;
begin
  assigned_role := 'viewer'::user_role;

  display_name := coalesce(
    nullif(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'name'), ''),
    NEW.email,
    'User'
  );

  insert into public.profiles (id, full_name, role)
  values (NEW.id, display_name, assigned_role)
  on conflict (id) do update
    set full_name = coalesce(
      nullif(trim(excluded.full_name), ''),
      public.profiles.full_name
    );

  return NEW;
end;
$$;

alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Owner can view all profiles" on public.profiles;
drop policy if exists "Owner can update profiles" on public.profiles;
drop policy if exists "profiles_read_self_or_shared_club" on public.profiles;
drop policy if exists "profiles_update_self_or_owner" on public.profiles;
drop policy if exists "profiles_update_owner_only" on public.profiles;

create policy "profiles_read_self_or_shared_club" on public.profiles
  for select using (
    id = auth.uid()
    or public.current_user_is_global_owner()
    or public.shares_club_with_current_user(id)
  );

create policy "profiles_update_owner_only" on public.profiles
  for update using (public.current_user_is_global_owner())
  with check (public.current_user_is_global_owner());

drop policy if exists "members_read_club" on public.club_memberships;
drop policy if exists "owners_manage_members" on public.club_memberships;
create policy "members_read_club" on public.club_memberships
  for select using (
    user_id = auth.uid()
    or public.current_user_is_global_owner()
    or public.user_has_club_access(club_id)
  );
create policy "owners_manage_members" on public.club_memberships
  for all using (
    public.current_user_is_global_owner()
    or public.current_user_club_role(club_id) = 'owner'
  )
  with check (
    public.current_user_is_global_owner()
    or public.current_user_club_role(club_id) = 'owner'
  );

drop policy if exists "members_read_clubs" on public.clubs;
drop policy if exists "owners_update_clubs" on public.clubs;
create policy "members_read_clubs" on public.clubs
  for select using (
    public.current_user_is_global_owner()
    or public.user_has_club_access(id)
  );
create policy "owners_update_clubs" on public.clubs
  for update using (
    public.current_user_is_global_owner()
    or public.current_user_club_role(id) = 'owner'
  )
  with check (
    public.current_user_is_global_owner()
    or public.current_user_club_role(id) = 'owner'
  );

drop policy if exists "auth_all_products" on public.products;
drop policy if exists "team_read_products" on public.products;
drop policy if exists "admin_owner_write_products" on public.products;
drop policy if exists "admin_owner_insert_products" on public.products;
drop policy if exists "admin_owner_update_products" on public.products;
drop policy if exists "owner_delete_products" on public.products;
drop policy if exists "club_read_products" on public.products;
drop policy if exists "club_admin_insert_products" on public.products;
drop policy if exists "club_admin_update_products" on public.products;
drop policy if exists "club_owner_delete_products" on public.products;
create policy "club_read_products" on public.products
  for select using (public.user_has_club_access(club_id));
create policy "club_admin_insert_products" on public.products
  for insert with check (public.current_user_club_role(club_id) in ('admin', 'owner'));
create policy "club_admin_update_products" on public.products
  for update using (public.current_user_club_role(club_id) in ('admin', 'owner'))
  with check (public.current_user_club_role(club_id) in ('admin', 'owner'));
create policy "club_owner_delete_products" on public.products
  for delete using (public.current_user_club_role(club_id) = 'owner');

drop policy if exists "auth_all_cash_entries" on public.daily_cash_entries;
drop policy if exists "team_read_cash_entries" on public.daily_cash_entries;
drop policy if exists "admin_owner_write_cash_entries" on public.daily_cash_entries;
drop policy if exists "owner_admin_update_cash_entries" on public.daily_cash_entries;
drop policy if exists "owner_admin_delete_cash_entries" on public.daily_cash_entries;
drop policy if exists "club_read_cash_entries" on public.daily_cash_entries;
drop policy if exists "club_admin_insert_cash_entries" on public.daily_cash_entries;
drop policy if exists "club_owner_admin_update_cash_entries" on public.daily_cash_entries;
drop policy if exists "club_owner_admin_delete_cash_entries" on public.daily_cash_entries;
create policy "club_read_cash_entries" on public.daily_cash_entries
  for select using (public.user_has_club_access(club_id));
create policy "club_admin_insert_cash_entries" on public.daily_cash_entries
  for insert with check (public.current_user_club_role(club_id) in ('admin', 'owner'));
create policy "club_owner_admin_update_cash_entries" on public.daily_cash_entries
  for update using (
    public.current_user_club_role(club_id) = 'owner'
    or (
      public.current_user_club_role(club_id) = 'admin'
      and created_at > now() - interval '15 minutes'
    )
  )
  with check (
    public.current_user_club_role(club_id) = 'owner'
    or (
      public.current_user_club_role(club_id) = 'admin'
      and created_at > now() - interval '15 minutes'
    )
  );
create policy "club_owner_admin_delete_cash_entries" on public.daily_cash_entries
  for delete using (
    public.current_user_club_role(club_id) = 'owner'
    or (
      public.current_user_club_role(club_id) = 'admin'
      and created_at > now() - interval '15 minutes'
    )
  );

drop policy if exists "auth_all_stock_purchases" on public.stock_purchases;
drop policy if exists "team_read_stock_purchases" on public.stock_purchases;
drop policy if exists "admin_owner_write_stock_purchases" on public.stock_purchases;
drop policy if exists "club_read_stock_purchases" on public.stock_purchases;
drop policy if exists "club_admin_write_stock_purchases" on public.stock_purchases;
create policy "club_read_stock_purchases" on public.stock_purchases
  for select using (public.user_has_club_access(club_id));
create policy "club_admin_write_stock_purchases" on public.stock_purchases
  for all using (public.current_user_club_role(club_id) in ('admin', 'owner'))
  with check (public.current_user_club_role(club_id) in ('admin', 'owner'));

drop policy if exists "auth_all_stock_counts" on public.daily_stock_counts;
drop policy if exists "team_read_stock_counts" on public.daily_stock_counts;
drop policy if exists "admin_owner_write_stock_counts" on public.daily_stock_counts;
drop policy if exists "club_read_stock_counts" on public.daily_stock_counts;
drop policy if exists "club_admin_write_stock_counts" on public.daily_stock_counts;
create policy "club_read_stock_counts" on public.daily_stock_counts
  for select using (public.user_has_club_access(club_id));
create policy "club_admin_write_stock_counts" on public.daily_stock_counts
  for all using (
    public.current_user_club_role(club_id) = 'owner'
    or (
      public.current_user_club_role(club_id) = 'admin'
      and date = (now() at time zone 'Asia/Tashkent')::date
    )
  )
  with check (
    public.current_user_club_role(club_id) = 'owner'
    or (
      public.current_user_club_role(club_id) = 'admin'
      and date = (now() at time zone 'Asia/Tashkent')::date
    )
  );

drop policy if exists "auth_all_expenses" on public.expenses;
drop policy if exists "team_read_expenses" on public.expenses;
drop policy if exists "admin_owner_write_expenses" on public.expenses;
drop policy if exists "club_read_expenses" on public.expenses;
drop policy if exists "club_admin_write_expenses" on public.expenses;
create policy "club_read_expenses" on public.expenses
  for select using (public.user_has_club_access(club_id));
create policy "club_admin_write_expenses" on public.expenses
  for all using (public.current_user_club_role(club_id) in ('admin', 'owner'))
  with check (public.current_user_club_role(club_id) in ('admin', 'owner'));

drop policy if exists "auth_all_debts" on public.new_debts;
drop policy if exists "team_read_debts" on public.new_debts;
drop policy if exists "admin_owner_write_debts" on public.new_debts;
drop policy if exists "club_read_debts" on public.new_debts;
drop policy if exists "club_admin_write_debts" on public.new_debts;
create policy "club_read_debts" on public.new_debts
  for select using (public.user_has_club_access(club_id));
create policy "club_admin_write_debts" on public.new_debts
  for all using (public.current_user_club_role(club_id) in ('admin', 'owner'))
  with check (public.current_user_club_role(club_id) in ('admin', 'owner'));

drop policy if exists "auth_all_debt_payments" on public.debt_payments;
drop policy if exists "team_read_debt_payments" on public.debt_payments;
drop policy if exists "admin_owner_write_debt_payments" on public.debt_payments;
drop policy if exists "club_read_debt_payments" on public.debt_payments;
drop policy if exists "club_admin_write_debt_payments" on public.debt_payments;
create policy "club_read_debt_payments" on public.debt_payments
  for select using (public.user_has_club_access(club_id));
create policy "club_admin_write_debt_payments" on public.debt_payments
  for all using (public.current_user_club_role(club_id) in ('admin', 'owner'))
  with check (public.current_user_club_role(club_id) in ('admin', 'owner'));

drop policy if exists "Authenticated users can view balances" on public.balances;
drop policy if exists "Service role can update balances" on public.balances;
drop policy if exists "club_read_balances" on public.balances;
drop policy if exists "service_manage_balances" on public.balances;
create policy "club_read_balances" on public.balances
  for select using (public.user_has_club_access(club_id));
create policy "service_manage_balances" on public.balances
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Admin and owner can manage cash movements" on public.cash_movements;
drop policy if exists "club_read_cash_movements" on public.cash_movements;
drop policy if exists "club_admin_write_cash_movements" on public.cash_movements;
create policy "club_read_cash_movements" on public.cash_movements
  for select using (public.user_has_club_access(club_id));
create policy "club_admin_write_cash_movements" on public.cash_movements
  for all using (public.current_user_club_role(club_id) in ('admin', 'owner'))
  with check (public.current_user_club_role(club_id) in ('admin', 'owner'));

drop policy if exists "Cashier can insert income" on public.income_transactions;
drop policy if exists "Cashier can view today income" on public.income_transactions;
drop policy if exists "Admin and owner can update income" on public.income_transactions;
drop policy if exists "Owner can delete income" on public.income_transactions;
drop policy if exists "club_read_income_transactions" on public.income_transactions;
drop policy if exists "club_admin_write_income_transactions" on public.income_transactions;
drop policy if exists "club_owner_delete_income_transactions" on public.income_transactions;
create policy "club_read_income_transactions" on public.income_transactions
  for select using (public.user_has_club_access(club_id));
create policy "club_admin_write_income_transactions" on public.income_transactions
  for insert with check (public.current_user_club_role(club_id) in ('admin', 'owner'));
create policy "club_owner_delete_income_transactions" on public.income_transactions
  for delete using (public.current_user_club_role(club_id) = 'owner');

drop policy if exists "Admin and owner can insert expense" on public.expense_transactions;
drop policy if exists "Admin and owner can view expenses" on public.expense_transactions;
drop policy if exists "Admin and owner can update expenses" on public.expense_transactions;
drop policy if exists "Owner can delete expense" on public.expense_transactions;
drop policy if exists "club_read_expense_transactions" on public.expense_transactions;
drop policy if exists "club_admin_write_expense_transactions" on public.expense_transactions;
drop policy if exists "club_owner_delete_expense_transactions" on public.expense_transactions;
create policy "club_read_expense_transactions" on public.expense_transactions
  for select using (public.user_has_club_access(club_id));
create policy "club_admin_write_expense_transactions" on public.expense_transactions
  for insert with check (public.current_user_club_role(club_id) in ('admin', 'owner'));
create policy "club_owner_delete_expense_transactions" on public.expense_transactions
  for delete using (public.current_user_club_role(club_id) = 'owner');

drop policy if exists "All authenticated can insert debts" on public.debts;
drop policy if exists "Admin and owner can view all debts" on public.debts;
drop policy if exists "Cashier can view own debts" on public.debts;
drop policy if exists "Admin and owner can update debts" on public.debts;
drop policy if exists "Owner can delete debts" on public.debts;
drop policy if exists "club_read_legacy_debts" on public.debts;
drop policy if exists "club_admin_write_legacy_debts" on public.debts;
drop policy if exists "club_owner_delete_legacy_debts" on public.debts;
create policy "club_read_legacy_debts" on public.debts
  for select using (public.user_has_club_access(club_id));
create policy "club_admin_write_legacy_debts" on public.debts
  for insert with check (public.current_user_club_role(club_id) in ('admin', 'owner'));
create policy "club_owner_delete_legacy_debts" on public.debts
  for delete using (public.current_user_club_role(club_id) = 'owner');
