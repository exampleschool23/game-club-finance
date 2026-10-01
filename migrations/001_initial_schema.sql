-- =============================================================
-- Game Club Finance — Initial Schema
-- =============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================================
-- ENUMS
-- =============================================================

create type user_role as enum ('owner', 'admin', 'cashier');
create type payment_method as enum ('cash', 'terminal', 'qr', 'transfer', 'debt');
create type payment_source as enum ('cash', 'terminal', 'bank');
create type income_category as enum ('game_time', 'food', 'drinks', 'other');
create type expense_category as enum (
  'rent', 'salary', 'electricity', 'internet', 'repair',
  'cleaning', 'food_drinks', 'marketing', 'equipment', 'tax', 'other'
);
create type movement_type as enum ('deposit', 'withdraw', 'correction');
create type debt_status as enum ('unpaid', 'paid');

-- =============================================================
-- PROFILES (extends auth.users)
-- =============================================================

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        user_role not null default 'cashier',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================
-- BALANCE ACCOUNTS (singleton row per account type)
-- =============================================================

create table balances (
  id          uuid primary key default uuid_generate_v4(),
  account     text not null unique,   -- 'cash' | 'terminal' | 'bank' | 'debt'
  amount      numeric(14,2) not null default 0,
  updated_at  timestamptz not null default now()
);

-- seed initial zero balances
insert into balances (account, amount) values
  ('cash',     0),
  ('terminal', 0),
  ('bank',     0),
  ('debt',     0);

-- =============================================================
-- INCOME TRANSACTIONS
-- =============================================================

create table income_transactions (
  id              uuid primary key default uuid_generate_v4(),
  amount          numeric(14,2) not null check (amount > 0),
  payment_method  payment_method not null,
  category        income_category not null default 'other',
  comment         text,
  transaction_date date not null default current_date,
  created_by      uuid not null references profiles(id),
  created_at      timestamptz not null default now()
);

-- =============================================================
-- EXPENSE TRANSACTIONS
-- =============================================================

create table expense_transactions (
  id              uuid primary key default uuid_generate_v4(),
  amount          numeric(14,2) not null check (amount > 0),
  category        expense_category not null default 'other',
  payment_source  payment_source not null default 'cash',
  comment         text,
  transaction_date date not null default current_date,
  created_by      uuid not null references profiles(id),
  created_at      timestamptz not null default now()
);

-- =============================================================
-- CASH MOVEMENTS (deposit / withdraw / correction)
-- =============================================================

create table cash_movements (
  id            uuid primary key default uuid_generate_v4(),
  movement_type movement_type not null,
  account       text not null,   -- which balance account
  amount        numeric(14,2) not null,  -- positive or negative
  comment       text,
  created_by    uuid not null references profiles(id),
  created_at    timestamptz not null default now()
);

-- =============================================================
-- DEBTS
-- =============================================================

create table debts (
  id              uuid primary key default uuid_generate_v4(),
  customer_name   text not null,
  amount          numeric(14,2) not null check (amount > 0),
  comment         text,
  debt_date       date not null default current_date,
  status          debt_status not null default 'unpaid',
  paid_at         timestamptz,
  paid_method     payment_method,  -- which method was used when paid
  created_by      uuid not null references profiles(id),
  created_at      timestamptz not null default now()
);

-- =============================================================
-- TRIGGERS — auto-update balances on income
-- =============================================================

create or replace function update_balance_on_income()
returns trigger language plpgsql security definer as $$
declare
  v_account text;
begin
  -- map payment method to balance account
  case NEW.payment_method
    when 'cash'     then v_account := 'cash';
    when 'terminal' then v_account := 'terminal';
    when 'qr'       then v_account := 'bank';
    when 'transfer' then v_account := 'bank';
    when 'debt'     then v_account := 'debt';
  end case;

  update balances set amount = amount + NEW.amount, updated_at = now()
  where account = v_account;

  return NEW;
end;
$$;

create trigger trg_income_balance
  after insert on income_transactions
  for each row execute function update_balance_on_income();

-- handle delete (rollback)
create or replace function rollback_balance_on_income_delete()
returns trigger language plpgsql security definer as $$
declare
  v_account text;
begin
  case OLD.payment_method
    when 'cash'     then v_account := 'cash';
    when 'terminal' then v_account := 'terminal';
    when 'qr'       then v_account := 'bank';
    when 'transfer' then v_account := 'bank';
    when 'debt'     then v_account := 'debt';
  end case;
  update balances set amount = amount - OLD.amount, updated_at = now()
  where account = v_account;
  return OLD;
end;
$$;

create trigger trg_income_balance_delete
  after delete on income_transactions
  for each row execute function rollback_balance_on_income_delete();

-- =============================================================
-- TRIGGERS — auto-update balances on expense
-- =============================================================

create or replace function update_balance_on_expense()
returns trigger language plpgsql security definer as $$
declare
  v_account text;
begin
  case NEW.payment_source
    when 'cash'     then v_account := 'cash';
    when 'terminal' then v_account := 'terminal';
    when 'bank'     then v_account := 'bank';
  end case;
  update balances set amount = amount - NEW.amount, updated_at = now()
  where account = v_account;
  return NEW;
end;
$$;

create trigger trg_expense_balance
  after insert on expense_transactions
  for each row execute function update_balance_on_expense();

create or replace function rollback_balance_on_expense_delete()
returns trigger language plpgsql security definer as $$
declare
  v_account text;
begin
  case OLD.payment_source
    when 'cash'     then v_account := 'cash';
    when 'terminal' then v_account := 'terminal';
    when 'bank'     then v_account := 'bank';
  end case;
  update balances set amount = amount + OLD.amount, updated_at = now()
  where account = v_account;
  return OLD;
end;
$$;

create trigger trg_expense_balance_delete
  after delete on expense_transactions
  for each row execute function rollback_balance_on_expense_delete();

-- =============================================================
-- TRIGGERS — debt paid moves balance from debt → payment method
-- =============================================================

create or replace function handle_debt_payment()
returns trigger language plpgsql security definer as $$
declare
  v_account text;
begin
  -- only act when status flips to 'paid'
  if OLD.status = 'unpaid' and NEW.status = 'paid' then
    -- reduce debt balance
    update balances set amount = amount - NEW.amount, updated_at = now()
    where account = 'debt';

    -- increase target account
    case NEW.paid_method
      when 'cash'     then v_account := 'cash';
      when 'terminal' then v_account := 'terminal';
      when 'qr'       then v_account := 'bank';
      when 'transfer' then v_account := 'bank';
      else v_account := null;
    end case;

    if v_account is not null then
      update balances set amount = amount + NEW.amount, updated_at = now()
      where account = v_account;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_debt_payment
  after update on debts
  for each row execute function handle_debt_payment();

-- =============================================================
-- TRIGGERS — cash movements update balances
-- =============================================================

create or replace function apply_cash_movement()
returns trigger language plpgsql security definer as $$
begin
  update balances set amount = amount + NEW.amount, updated_at = now()
  where account = NEW.account;
  return NEW;
end;
$$;

create trigger trg_cash_movement
  after insert on cash_movements
  for each row execute function apply_cash_movement();

-- =============================================================
-- AUTO-CREATE PROFILE on new auth user
-- =============================================================

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, role)
  values (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.email),
    coalesce((NEW.raw_user_meta_data->>'role')::user_role, 'cashier')
  );
  return NEW;
end;
$$;

create trigger trg_new_user
  after insert on auth.users
  for each row execute function handle_new_user();

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table profiles              enable row level security;
alter table balances              enable row level security;
alter table income_transactions   enable row level security;
alter table expense_transactions  enable row level security;
alter table cash_movements        enable row level security;
alter table debts                 enable row level security;

-- Helper function to get current user role
create or replace function current_user_role()
returns user_role language sql security definer stable as $$
  select role from profiles where id = auth.uid()
$$;

-- PROFILES
create policy "Users can view own profile" on profiles
  for select using (id = auth.uid());
create policy "Owner can view all profiles" on profiles
  for select using (current_user_role() = 'owner');
create policy "Owner can update profiles" on profiles
  for update using (current_user_role() = 'owner');

-- BALANCES — everyone reads, only service/owner writes via triggers
create policy "Authenticated users can view balances" on balances
  for select using (auth.role() = 'authenticated');
create policy "Service role can update balances" on balances
  for all using (auth.role() = 'service_role');

-- INCOME TRANSACTIONS
create policy "Cashier can insert income" on income_transactions
  for insert with check (auth.uid() = created_by);
create policy "Cashier can view today income" on income_transactions
  for select using (
    (current_user_role() = 'cashier' and transaction_date = current_date)
    or current_user_role() in ('admin', 'owner')
  );
create policy "Admin and owner can update income" on income_transactions
  for update using (current_user_role() in ('admin', 'owner'));
create policy "Owner can delete income" on income_transactions
  for delete using (current_user_role() = 'owner');

-- EXPENSE TRANSACTIONS
create policy "Admin and owner can insert expense" on expense_transactions
  for insert with check (
    current_user_role() in ('admin', 'owner') and auth.uid() = created_by
  );
create policy "Admin and owner can view expenses" on expense_transactions
  for select using (current_user_role() in ('admin', 'owner'));
create policy "Admin and owner can update expenses" on expense_transactions
  for update using (current_user_role() in ('admin', 'owner'));
create policy "Owner can delete expense" on expense_transactions
  for delete using (current_user_role() = 'owner');

-- CASH MOVEMENTS
create policy "Admin and owner can manage cash movements" on cash_movements
  for all using (current_user_role() in ('admin', 'owner'));

-- DEBTS
create policy "All authenticated can insert debts" on debts
  for insert with check (auth.uid() = created_by);
create policy "Admin and owner can view all debts" on debts
  for select using (current_user_role() in ('admin', 'owner'));
create policy "Cashier can view own debts" on debts
  for select using (current_user_role() = 'cashier' and created_by = auth.uid());
create policy "Admin and owner can update debts" on debts
  for update using (current_user_role() in ('admin', 'owner'));
create policy "Owner can delete debts" on debts
  for delete using (current_user_role() = 'owner');

-- =============================================================
-- INDEXES
-- =============================================================

create index idx_income_date    on income_transactions(transaction_date);
create index idx_income_method  on income_transactions(payment_method);
create index idx_expense_date   on expense_transactions(transaction_date);
create index idx_expense_cat    on expense_transactions(category);
create index idx_debts_status   on debts(status);
