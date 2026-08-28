alter table public.clubs
  add column if not exists enabled_payment_methods text[]
  not null default array['terminal', 'cash', 'card']::text[];

alter table public.clubs
  drop constraint if exists clubs_enabled_payment_methods_check;

alter table public.clubs
  add constraint clubs_enabled_payment_methods_check
  check (
    cardinality(enabled_payment_methods) > 0
    and enabled_payment_methods <@ array['terminal', 'cash', 'card']::text[]
  );
