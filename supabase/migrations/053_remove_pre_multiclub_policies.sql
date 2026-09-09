-- Policies are permissive by default and combine with OR. These pre-multi-club
-- policies survived 014 because their names differed from the policies it
-- removed. They bypass the current club membership/feature checks.
-- Keep the club-scoped replacement policies and all ledger rows unchanged.

drop policy if exists "admin_owner_insert_cash_entries"
  on public.daily_cash_entries;
drop policy if exists "Viewer can view today income"
  on public.income_transactions;
drop policy if exists "Viewer can view own debts"
  on public.debts;
