alter table public.expenses
  add column if not exists payment_source text;

update public.expenses
set payment_source = 'game_club'
where payment_source is null;

alter table public.expenses
  alter column payment_source set default 'game_club',
  alter column payment_source set not null;

alter table public.expenses
  drop constraint if exists expenses_payment_source_check;

alter table public.expenses
  add constraint expenses_payment_source_check
  check (payment_source in ('game_club', 'bar'));
