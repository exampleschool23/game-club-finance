-- "Other" is too vague for reporting. Existing rows move to a concrete
-- category (their descriptive text, if any, stays in the comment) and new
-- entries must pick a specific category. `salary` stays valid because the
-- payroll flow writes it; people cannot choose it by hand (POST /api/expenses
-- rejects it).
alter table public.expenses drop constraint if exists expenses_category_known;

update public.expenses set category = 'supplies' where category = 'other';

alter table public.expenses
  add constraint expenses_category_known check (category in (
    'rent','salary','electricity','internet','repair','cleaning','food_drinks',
    'marketing','equipment','tax','correction','discount','supplies'
  ));
