alter table products
  add column if not exists sort_order integer;

with ordered_products as (
  select
    id,
    row_number() over (order by name asc, created_at asc, id asc) as next_sort_order
  from products
)
update products
set sort_order = ordered_products.next_sort_order,
    updated_at = now()
from ordered_products
where products.id = ordered_products.id
  and products.sort_order is null;

create index if not exists idx_products_sort_order
  on products (sort_order, name);
