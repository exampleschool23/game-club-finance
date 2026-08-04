-- Taking money always withdraws the full available source balance, so a
-- payment-method classification is not meaningful for this owner ledger.

alter table public.owner_withdrawals
  drop column if exists payment_method;
