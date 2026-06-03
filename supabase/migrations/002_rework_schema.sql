-- =============================================================
-- Game Club Finance — Rework Schema (migration 002)
-- =============================================================

-- Products catalog
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  category text,
  sale_price numeric not null default 0,
  cost_price numeric not null default 0,
  current_stock numeric not null default 0,
  low_stock_threshold numeric default 5,
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Daily manual cash entries (one row per date)
create table if not exists daily_cash_entries (
  id uuid primary key default uuid_generate_v4(),
  date date not null unique,
  cash_income numeric not null default 0,
  terminal_income numeric not null default 0,
  qr_income numeric not null default 0,
  transfer_income numeric not null default 0,
  debt_income numeric not null default 0,
  game_income numeric not null default 0,
  other_income numeric not null default 0,
  comment text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Stock purchases (when admin buys products)
create table if not exists stock_purchases (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  product_id uuid not null references products(id),
  quantity numeric not null,
  cost_price numeric not null,
  sale_price numeric,
  payment_method text not null default 'cash',
  comment text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Daily stock closing counts (one row per product per date)
create table if not exists daily_stock_counts (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  product_id uuid not null references products(id),
  previous_stock numeric not null default 0,
  added_today numeric not null default 0,
  closing_stock numeric not null default 0,
  sold_quantity numeric not null default 0,
  sale_price numeric not null default 0,
  cost_price numeric not null default 0,
  bar_income numeric not null default 0,
  bar_cost numeric not null default 0,
  bar_profit numeric not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(date, product_id)
);

-- Expenses (new table separate from old expense_transactions)
create table if not exists expenses (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  amount numeric not null check (amount > 0),
  payment_method text not null default 'cash',
  category text not null,
  comment text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- New debts table (replaces old debts with partial payment support)
create table if not exists new_debts (
  id uuid primary key default uuid_generate_v4(),
  person_name text not null,
  date date not null default current_date,
  amount numeric not null check (amount > 0),
  paid_amount numeric not null default 0,
  remaining_amount numeric not null,
  category text default 'other',
  comment text,
  status text not null default 'unpaid',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Debt payments (partial payments)
create table if not exists debt_payments (
  id uuid primary key default uuid_generate_v4(),
  debt_id uuid not null references new_debts(id) on delete cascade,
  date date not null default current_date,
  amount numeric not null check (amount > 0),
  payment_method text not null default 'cash',
  comment text,
  created_at timestamptz not null default now()
);

-- Trigger to update product stock on purchase
create or replace function update_stock_on_purchase()
returns trigger language plpgsql security definer as $$
begin
  update products set current_stock = current_stock + NEW.quantity, updated_at = now()
  where id = NEW.product_id;
  return NEW;
end;
$$;

drop trigger if exists trg_stock_purchase on stock_purchases;
create trigger trg_stock_purchase
  after insert on stock_purchases
  for each row execute function update_stock_on_purchase();

-- Trigger to update product stock on closing count save
create or replace function update_stock_on_closing_count()
returns trigger language plpgsql security definer as $$
begin
  update products set current_stock = NEW.closing_stock, updated_at = now()
  where id = NEW.product_id;
  return NEW;
end;
$$;

drop trigger if exists trg_closing_count on daily_stock_counts;
create trigger trg_closing_count
  after insert or update on daily_stock_counts
  for each row execute function update_stock_on_closing_count();

-- Trigger to update debt remaining amount
create or replace function update_debt_on_payment()
returns trigger language plpgsql security definer as $$
begin
  update new_debts
  set
    paid_amount = paid_amount + NEW.amount,
    remaining_amount = amount - (paid_amount + NEW.amount),
    status = case
      when amount <= (paid_amount + NEW.amount) then 'paid'
      when paid_amount + NEW.amount > 0 then 'partial'
      else 'unpaid'
    end,
    updated_at = now()
  where id = NEW.debt_id;
  return NEW;
end;
$$;

drop trigger if exists trg_debt_payment on debt_payments;
create trigger trg_debt_payment
  after insert on debt_payments
  for each row execute function update_debt_on_payment();

-- Enable RLS
alter table products enable row level security;
alter table daily_cash_entries enable row level security;
alter table stock_purchases enable row level security;
alter table daily_stock_counts enable row level security;
alter table expenses enable row level security;
alter table new_debts enable row level security;
alter table debt_payments enable row level security;

-- RLS policies (authenticated users can do everything for now)
create policy "auth_all_products" on products for all using (auth.role() = 'authenticated');
create policy "auth_all_cash_entries" on daily_cash_entries for all using (auth.role() = 'authenticated');
create policy "auth_all_stock_purchases" on stock_purchases for all using (auth.role() = 'authenticated');
create policy "auth_all_stock_counts" on daily_stock_counts for all using (auth.role() = 'authenticated');
create policy "auth_all_expenses" on expenses for all using (auth.role() = 'authenticated');
create policy "auth_all_debts" on new_debts for all using (auth.role() = 'authenticated');
create policy "auth_all_debt_payments" on debt_payments for all using (auth.role() = 'authenticated');
