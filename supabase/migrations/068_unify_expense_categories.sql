-- Expense categories are a fixed list. Free-text categories typed in earlier
-- versions are folded into it; the original text is kept at the start of the
-- comment so no information is lost.
with mapping(original, target) as (
  values
    ('cola butilka','food_drinks'), ('ketchup mayonez','food_drinks'), ('non','food_drinks'),
    ('ovqat','food_drinks'), ('salatlar','food_drinks'), ('sasiska','food_drinks'),
    ('shakar','food_drinks'), ('suv','food_drinks'), ('xod dog salat','food_drinks'),
    ('musir','cleaning'), ('musur','cleaning'), ('quriqlash xizmati','cleaning'),
    ('internet tarif','internet'),
    ('ashibka','correction'), ('-3soat/p-ashibka','correction'), ('noch/p-oshipka','correction'), ('minus','correction'),
    ('bonus','discount'), ('skidka','discount')
), legacy as (
  select e.id, e.category as original, coalesce(m.target, 'other') as target
  from public.expenses e
  left join mapping m on m.original = lower(btrim(e.category))
  where e.category not in (
    'rent','salary','electricity','internet','repair','cleaning','food_drinks',
    'marketing','equipment','tax','correction','discount','other'
  )
)
update public.expenses e
set category = legacy.target,
    comment = case when coalesce(btrim(e.comment), '') = '' then legacy.original
                   else legacy.original || ': ' || e.comment end
from legacy
where e.id = legacy.id;

alter table public.expenses
  drop constraint if exists expenses_category_known,
  add constraint expenses_category_known check (category in (
    'rent','salary','electricity','internet','repair','cleaning','food_drinks',
    'marketing','equipment','tax','correction','discount','other'
  ));
