-- Track PlayStation income separately from computer/payment-method income.

alter table public.daily_cash_entries
  add column if not exists playstation_income numeric not null default 0;
