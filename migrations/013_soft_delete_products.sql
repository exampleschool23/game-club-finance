alter table products
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

create index if not exists idx_products_not_deleted
  on products (is_deleted, name);
