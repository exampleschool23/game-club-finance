-- Make daily stock counts auditable and save historical cascades atomically.

alter table public.daily_stock_counts
  add column if not exists adjustment_quantity numeric not null default 0,
  add column if not exists adjustment_reason text,
  add column if not exists adjustment_recorded_by uuid references auth.users(id),
  add column if not exists adjustment_recorded_at timestamptz;

comment on column public.daily_stock_counts.adjustment_quantity is
  'Signed, explicitly explained inventory correction. Sold = previous + added + adjustment - closing.';
comment on column public.daily_stock_counts.adjustment_reason is
  'Required explanation for a non-zero inventory adjustment.';
comment on column public.daily_stock_counts.adjustment_recorded_by is
  'User who most recently recorded or changed the inventory adjustment.';
comment on column public.daily_stock_counts.adjustment_recorded_at is
  'Time at which the inventory adjustment was most recently recorded or changed.';

-- Repair the historical chain without changing any saved sales or financial
-- amount. The signed adjustment is the balancing figure that makes each
-- already-saved sold_quantity explicit after previous_stock is canonicalized.
-- This also repairs adjacent-day previous_stock discontinuities.
with canonical as (
  select
    counts.id,
    coalesce(
      lag(counts.closing_stock) over (
        partition by counts.club_id, counts.product_id
        order by counts.date, counts.id
      ),
      counts.previous_stock
    ) as canonical_previous_stock
  from public.daily_stock_counts counts
  join public.products products
    on products.id = counts.product_id
   and products.club_id = counts.club_id
  where products.tracks_inventory
), balanced as (
  select
    counts.id,
    canonical.canonical_previous_stock,
    counts.closing_stock
      + counts.sold_quantity
      - canonical.canonical_previous_stock
      - counts.added_today as canonical_adjustment
  from public.daily_stock_counts counts
  join canonical on canonical.id = counts.id
)
update public.daily_stock_counts counts
set
  previous_stock = balanced.canonical_previous_stock,
  adjustment_quantity = balanced.canonical_adjustment,
  adjustment_reason = case
    when balanced.canonical_adjustment <> 0 then 'Legacy inventory reconciliation'
    else null
  end,
  adjustment_recorded_by = case
    when balanced.canonical_adjustment <> 0 then counts.created_by
    else null
  end,
  adjustment_recorded_at = case
    when balanced.canonical_adjustment <> 0 then now()
    else null
  end
from balanced
where counts.id = balanced.id
  and (
    counts.previous_stock is distinct from balanced.canonical_previous_stock
    or counts.adjustment_quantity is distinct from balanced.canonical_adjustment
    or (
      balanced.canonical_adjustment <> 0
      and nullif(btrim(counts.adjustment_reason), '') is null
    )
  );

-- Made-to-order products record direct sales only. Normalize legacy balance
-- fields that predate tracks_inventory without changing sold_quantity, prices,
-- bar_income, bar_cost, or bar_profit.
update public.daily_stock_counts counts
set
  previous_stock = 0,
  added_today = 0,
  adjustment_quantity = 0,
  adjustment_reason = null,
  adjustment_recorded_by = null,
  adjustment_recorded_at = null,
  closing_stock = 0
from public.products products
where products.id = counts.product_id
  and products.club_id = counts.club_id
  and not products.tracks_inventory
  and (
    counts.previous_stock <> 0
    or counts.added_today <> 0
    or counts.adjustment_quantity <> 0
    or counts.adjustment_reason is not null
    or counts.adjustment_recorded_by is not null
    or counts.adjustment_recorded_at is not null
    or counts.closing_stock <> 0
  );

do $$
begin
  if exists (
    select 1
    from public.daily_stock_counts counts
    join public.products products
      on products.id = counts.product_id
     and products.club_id = counts.club_id
    where not products.tracks_inventory
      and (
        counts.previous_stock <> 0
        or counts.added_today <> 0
        or counts.adjustment_quantity <> 0
        or counts.adjustment_reason is not null
        or counts.adjustment_recorded_by is not null
        or counts.adjustment_recorded_at is not null
        or counts.closing_stock <> 0
      )
  ) then
    raise exception 'Made-to-order stock balance normalization did not complete.';
  end if;
end;
$$;

alter table public.daily_stock_counts
  drop constraint if exists daily_stock_counts_nonnegative_quantities,
  add constraint daily_stock_counts_nonnegative_quantities
    check (
      previous_stock >= 0
      and added_today >= 0
      and closing_stock >= 0
      and sold_quantity >= 0
    ) not valid,
  drop constraint if exists daily_stock_counts_integer_quantities,
  add constraint daily_stock_counts_integer_quantities
    check (
      previous_stock = trunc(previous_stock)
      and added_today = trunc(added_today)
      and adjustment_quantity = trunc(adjustment_quantity)
      and closing_stock = trunc(closing_stock)
      and sold_quantity = trunc(sold_quantity)
    ) not valid,
  drop constraint if exists daily_stock_counts_adjustment_reason_required,
  add constraint daily_stock_counts_adjustment_reason_required
    check (
      adjustment_quantity = 0
      or nullif(btrim(adjustment_reason), '') is not null
    ) not valid,
  drop constraint if exists daily_stock_counts_available_stock_nonnegative,
  add constraint daily_stock_counts_available_stock_nonnegative
    check (previous_stock + added_today + adjustment_quantity >= 0) not valid,
  drop constraint if exists daily_stock_counts_closing_within_available,
  add constraint daily_stock_counts_closing_within_available
    check (closing_stock <= previous_stock + added_today + adjustment_quantity) not valid,
  drop constraint if exists daily_stock_counts_prices_nonnegative,
  add constraint daily_stock_counts_prices_nonnegative
    check (sale_price >= 0 and cost_price >= 0) not valid;

alter table public.daily_stock_counts
  validate constraint daily_stock_counts_nonnegative_quantities;
alter table public.daily_stock_counts
  validate constraint daily_stock_counts_integer_quantities;
alter table public.daily_stock_counts
  validate constraint daily_stock_counts_adjustment_reason_required;
alter table public.daily_stock_counts
  validate constraint daily_stock_counts_available_stock_nonnegative;
alter table public.daily_stock_counts
  validate constraint daily_stock_counts_closing_within_available;
alter table public.daily_stock_counts
  validate constraint daily_stock_counts_prices_nonnegative;

-- Legacy fractional purchases remain readable/deletable, but every new
-- purchase must use the same whole-unit domain as daily stock counts.
alter table public.stock_purchases
  drop constraint if exists stock_purchases_quantity_whole,
  add constraint stock_purchases_quantity_whole
    check (quantity = trunc(quantity)) not valid;

create or replace function public.validate_daily_stock_count_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tracks_inventory boolean;
  v_expected_sold numeric;
begin
  select products.tracks_inventory
  into v_tracks_inventory
  from public.products products
  where products.id = NEW.product_id
    and products.club_id = NEW.club_id;

  if not found then
    raise exception 'Product does not exist in this club.'
      using errcode = '23503';
  end if;

  if v_tracks_inventory then
    v_expected_sold := NEW.previous_stock
      + NEW.added_today
      + NEW.adjustment_quantity
      - NEW.closing_stock;

    if v_expected_sold < 0 then
      raise exception 'Closing stock exceeds available stock. Record an explicit inventory adjustment with a reason.'
        using errcode = '23514';
    end if;

    if NEW.sold_quantity <> v_expected_sold then
      raise exception 'Sold quantity does not match opening stock, purchases, adjustment, and closing stock.'
        using errcode = '23514';
    end if;
  elsif NEW.previous_stock <> 0
    or NEW.added_today <> 0
    or NEW.adjustment_quantity <> 0
    or NEW.closing_stock <> 0 then
    raise exception 'Made-to-order products cannot carry inventory quantities or adjustments.'
      using errcode = '23514';
  end if;

  if NEW.bar_income <> NEW.sold_quantity * NEW.sale_price
    or NEW.bar_cost <> NEW.sold_quantity * NEW.cost_price
    or NEW.bar_profit <> (NEW.sold_quantity * NEW.sale_price) - (NEW.sold_quantity * NEW.cost_price) then
    raise exception 'Saved bar amounts do not match sold quantity and prices.'
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

create or replace function public.record_stock_purchase(
  p_club_id uuid,
  p_date date,
  p_product_id uuid,
  p_quantity numeric,
  p_cost_price numeric,
  p_sale_price numeric default null,
  p_payment_method text default 'cash',
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_purchase_id uuid;
  v_business_date date;
begin
  if auth.uid() is null
    or public.current_user_club_role(p_club_id) not in ('admin', 'owner') then
    raise exception 'Not authorized to record purchases for this club.'
      using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity <> trunc(p_quantity) then
    raise exception 'Purchase quantity must be a positive whole number.'
      using errcode = '23514';
  end if;

  if p_cost_price is null or p_cost_price < 0 then
    raise exception 'Purchase cost price cannot be negative.'
      using errcode = '23514';
  end if;

  if p_sale_price is not null and p_sale_price < 0 then
    raise exception 'Purchase sale price cannot be negative.'
      using errcode = '23514';
  end if;

  if p_payment_method not in ('cash', 'terminal', 'card') then
    raise exception 'Unsupported purchase payment method.'
      using errcode = '23514';
  end if;

  v_business_date := public.club_business_date(p_club_id);
  if p_date is null or p_date > v_business_date then
    raise exception 'Purchase date cannot be in the future.'
      using errcode = '22008';
  end if;

  perform 1
  from public.products
  where id = p_product_id
    and club_id = p_club_id
    and is_active
    and tracks_inventory
  for update;

  if not found then
    raise exception 'Active inventory product does not exist for this club.'
      using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.daily_stock_counts
    where club_id = p_club_id
      and product_id = p_product_id
      and date >= p_date
  ) then
    raise exception 'Cannot add a purchase on or before a saved stock closing. Reopen the affected closing first.'
      using errcode = '55000';
  end if;

  insert into public.stock_purchases (
    club_id,
    date,
    product_id,
    quantity,
    cost_price,
    sale_price,
    payment_method,
    comment,
    created_by
  ) values (
    p_club_id,
    p_date,
    p_product_id,
    p_quantity,
    p_cost_price,
    p_sale_price,
    p_payment_method,
    nullif(btrim(p_comment), ''),
    auth.uid()
  )
  returning id into v_purchase_id;

  return v_purchase_id;
end;
$$;

drop trigger if exists trg_validate_daily_stock_count_integrity on public.daily_stock_counts;
create trigger trg_validate_daily_stock_count_integrity
  before insert or update on public.daily_stock_counts
  for each row execute function public.validate_daily_stock_count_integrity();

revoke all on function public.validate_daily_stock_count_integrity()
  from public, anon, authenticated;

create or replace function public.save_closing_stock_counts(
  p_club_id uuid,
  p_date date,
  p_counts jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_business_date date;
  v_item jsonb;
  v_product public.products%rowtype;
  v_existing public.daily_stock_counts%rowtype;
  v_has_existing boolean;
  v_product_id uuid;
  v_product_ids uuid[] := array[]::uuid[];
  v_previous numeric;
  v_added numeric;
  v_purchase_added numeric;
  v_adjustment numeric;
  v_adjustment_reason text;
  v_closing numeric;
  v_requested_sold numeric;
  v_sold numeric;
  v_sale_price numeric;
  v_cost_price numeric;
  v_adjustment_recorded_by uuid;
  v_adjustment_recorded_at timestamptz;
  v_future_date date;
  v_future_product_id uuid;
  v_updated_count integer := 0;
begin
  if v_actor is null then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  v_role := public.current_user_club_role(p_club_id);
  if v_role not in ('admin', 'owner')
    or not public.current_user_can_access_club_feature(p_club_id, 'closing_stock') then
    raise exception 'Not authorized to save stock counts for this club.'
      using errcode = '42501';
  end if;

  -- Serialize all authorized stock-count writes within a club. This gives
  -- overlapping historical cascades a deterministic lock order without
  -- reducing concurrency between clubs.
  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text, 0));

  v_business_date := public.club_business_date(p_club_id);
  if p_date is null or p_date > v_business_date then
    raise exception 'Stock count date cannot be in the future.'
      using errcode = '22008';
  end if;

  if v_role = 'admin' and p_date <> v_business_date then
    raise exception 'Admins can only save the current business day.'
      using errcode = '42501';
  end if;

  if p_counts is null
    or jsonb_typeof(p_counts) <> 'array'
    or jsonb_array_length(p_counts) = 0 then
    raise exception 'At least one stock count is required.'
      using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_counts)
  loop
    begin
      v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
      v_closing := nullif(v_item ->> 'closing_stock', '')::numeric;
      v_requested_sold := nullif(v_item ->> 'sold_quantity', '')::numeric;
      v_adjustment := coalesce(nullif(v_item ->> 'adjustment_quantity', '')::numeric, 0);
    exception when invalid_text_representation then
      raise exception 'Stock count contains an invalid product or numeric value.'
        using errcode = '22023';
    end;

    if v_product_id is null or v_product_id = any(v_product_ids) then
      raise exception 'Each product must appear exactly once in the stock count.'
        using errcode = '22023';
    end if;
    v_product_ids := array_append(v_product_ids, v_product_id);

    select products.*
    into v_product
    from public.products products
    where products.id = v_product_id
      and products.club_id = p_club_id
      and products.is_active
      and not products.is_deleted
    for update;

    if not found then
      raise exception 'Active product does not exist in this club.'
        using errcode = '23503';
    end if;

    select counts.*
    into v_existing
    from public.daily_stock_counts counts
    where counts.club_id = p_club_id
      and counts.product_id = v_product_id
      and counts.date = p_date
    for update;
    v_has_existing := found;

    select counts.closing_stock
    into v_previous
    from public.daily_stock_counts counts
    where counts.club_id = p_club_id
      and counts.product_id = v_product_id
      and counts.date < p_date
    order by counts.date desc
    limit 1;

    select sum(purchases.quantity)
    into v_purchase_added
    from public.stock_purchases purchases
    where purchases.club_id = p_club_id
      and purchases.product_id = v_product_id
      and purchases.date = p_date;

    v_adjustment_reason := nullif(btrim(v_item ->> 'adjustment_reason'), '');

    if not v_product.tracks_inventory then
      if v_adjustment <> 0
        or coalesce(v_closing, 0) <> 0
        or v_adjustment_reason is not null then
        raise exception 'Made-to-order products cannot carry inventory quantities or adjustments.'
          using errcode = '23514';
      end if;
      v_previous := 0;
      v_added := 0;
      v_adjustment := 0;
      v_closing := 0;
    else
      if v_previous is null then
        v_previous := case
          when v_has_existing then v_existing.previous_stock
          when p_date = v_business_date then greatest(v_product.current_stock - coalesce(v_purchase_added, 0), 0)
          else 0
        end;
      end if;

      -- A few legacy purchases used fractional quantities while old closing
      -- rows stored whole added_today values. Preserve the saved whole value
      -- when editing those rows; new fractional purchases are rejected below.
      if v_purchase_added is not null and v_purchase_added <> trunc(v_purchase_added) then
        if v_has_existing then
          v_added := v_existing.added_today;
        else
          raise exception 'Legacy fractional purchases require an existing reconciled stock count.'
            using errcode = '23514';
        end if;
      else
        v_added := coalesce(
          v_purchase_added,
          case when v_has_existing then v_existing.added_today else 0 end
        );
      end if;
    end if;

    if v_adjustment = 0 then
      v_adjustment_reason := null;
    end if;
    v_sale_price := case when v_has_existing then v_existing.sale_price else v_product.sale_price end;
    v_cost_price := case when v_has_existing then v_existing.cost_price else v_product.cost_price end;

    if v_previous < 0
      or v_added < 0
      or v_closing is null
      or v_closing < 0
      or v_requested_sold is null
      or v_requested_sold < 0
      or v_previous <> trunc(v_previous)
      or v_added <> trunc(v_added)
      or v_adjustment <> trunc(v_adjustment)
      or v_closing <> trunc(v_closing)
      or v_requested_sold <> trunc(v_requested_sold) then
      raise exception 'Stock quantities must be non-negative whole numbers; only adjustments may be signed.'
        using errcode = '23514';
    end if;

    if v_adjustment <> 0 and v_adjustment_reason is null then
      raise exception 'A non-zero inventory adjustment requires a reason.'
        using errcode = '23514';
    end if;

    if v_product.tracks_inventory then
      if v_previous + v_added + v_adjustment < 0 then
        raise exception 'Inventory adjustment makes available stock negative.'
          using errcode = '23514';
      end if;

      v_sold := v_previous + v_added + v_adjustment - v_closing;
      if v_sold < 0 then
        raise exception 'Closing stock exceeds available stock. Record an explicit inventory adjustment with a reason.'
          using errcode = '23514';
      end if;

      if v_requested_sold <> v_sold then
        raise exception 'Sold quantity does not match the stock movement.'
          using errcode = '23514';
      end if;
    else
      v_sold := v_requested_sold;
      v_adjustment_reason := null;
    end if;

    if v_role = 'admin' and (
      v_adjustment is distinct from case when v_has_existing then v_existing.adjustment_quantity else 0 end
      or v_adjustment_reason is distinct from case when v_has_existing then v_existing.adjustment_reason else null end
    ) then
      raise exception 'Only a club owner can create or change an inventory adjustment.'
        using errcode = '42501';
    end if;

    if v_has_existing
      and v_adjustment is not distinct from v_existing.adjustment_quantity
      and v_adjustment_reason is not distinct from v_existing.adjustment_reason then
      v_adjustment_recorded_by := v_existing.adjustment_recorded_by;
      v_adjustment_recorded_at := v_existing.adjustment_recorded_at;
    elsif v_adjustment = 0 then
      v_adjustment_recorded_by := null;
      v_adjustment_recorded_at := null;
    else
      v_adjustment_recorded_by := v_actor;
      v_adjustment_recorded_at := now();
    end if;

    insert into public.daily_stock_counts (
      club_id,
      date,
      product_id,
      previous_stock,
      added_today,
      adjustment_quantity,
      adjustment_reason,
      adjustment_recorded_by,
      adjustment_recorded_at,
      closing_stock,
      sold_quantity,
      sale_price,
      cost_price,
      bar_income,
      bar_cost,
      bar_profit,
      created_by,
      updated_at
    ) values (
      p_club_id,
      p_date,
      v_product_id,
      v_previous,
      v_added,
      v_adjustment,
      v_adjustment_reason,
      v_adjustment_recorded_by,
      v_adjustment_recorded_at,
      v_closing,
      v_sold,
      v_sale_price,
      v_cost_price,
      v_sold * v_sale_price,
      v_sold * v_cost_price,
      (v_sold * v_sale_price) - (v_sold * v_cost_price),
      v_actor,
      now()
    )
    on conflict on constraint daily_stock_counts_club_date_product_key do update
    set
      previous_stock = excluded.previous_stock,
      added_today = excluded.added_today,
      adjustment_quantity = excluded.adjustment_quantity,
      adjustment_reason = excluded.adjustment_reason,
      adjustment_recorded_by = excluded.adjustment_recorded_by,
      adjustment_recorded_at = excluded.adjustment_recorded_at,
      closing_stock = excluded.closing_stock,
      sold_quantity = excluded.sold_quantity,
      sale_price = excluded.sale_price,
      cost_price = excluded.cost_price,
      bar_income = excluded.bar_income,
      bar_cost = excluded.bar_cost,
      bar_profit = excluded.bar_profit,
      updated_at = excluded.updated_at;
  end loop;

  -- A historical change must remain valid for every already-saved later day.
  -- The selected row participates in lag(), then every future row is updated in
  -- one set-based statement within this RPC transaction.
  with timeline as (
    select
      counts.product_id,
      counts.date,
      counts.closing_stock,
      counts.added_today,
      counts.adjustment_quantity,
      products.tracks_inventory,
      lag(counts.closing_stock) over (
        partition by counts.product_id
        order by counts.date, counts.id
      ) as canonical_previous
    from public.daily_stock_counts counts
    join public.products products
      on products.id = counts.product_id
     and products.club_id = counts.club_id
    where counts.club_id = p_club_id
      and counts.product_id = any(v_product_ids)
      and counts.date >= p_date
  )
  select timeline.date, timeline.product_id
  into v_future_date, v_future_product_id
  from timeline
  where timeline.date > p_date
    and timeline.tracks_inventory
    and timeline.closing_stock > timeline.canonical_previous
      + timeline.added_today
      + timeline.adjustment_quantity
  order by timeline.date, timeline.product_id
  limit 1;

  if found then
    raise exception 'Historical change makes the saved stock count on % invalid for product %. Add an explicit adjustment to that later count first.',
      v_future_date, v_future_product_id
      using errcode = '23514';
  end if;

  with timeline as (
    select
      counts.id,
      counts.date,
      counts.closing_stock,
      counts.added_today,
      counts.adjustment_quantity,
      counts.sale_price,
      counts.cost_price,
      products.tracks_inventory,
      lag(counts.closing_stock) over (
        partition by counts.product_id
        order by counts.date, counts.id
      ) as canonical_previous
    from public.daily_stock_counts counts
    join public.products products
      on products.id = counts.product_id
     and products.club_id = counts.club_id
    where counts.club_id = p_club_id
      and counts.product_id = any(v_product_ids)
      and counts.date >= p_date
  ), recalculated as (
    select
      timeline.id,
      timeline.canonical_previous,
      timeline.canonical_previous
        + timeline.added_today
        + timeline.adjustment_quantity
        - timeline.closing_stock as canonical_sold,
      timeline.sale_price,
      timeline.cost_price
    from timeline
    where timeline.date > p_date
      and timeline.tracks_inventory
  )
  update public.daily_stock_counts counts
  set
    previous_stock = recalculated.canonical_previous,
    sold_quantity = recalculated.canonical_sold,
    bar_income = recalculated.canonical_sold * recalculated.sale_price,
    bar_cost = recalculated.canonical_sold * recalculated.cost_price,
    bar_profit = (recalculated.canonical_sold * recalculated.sale_price)
      - (recalculated.canonical_sold * recalculated.cost_price),
    updated_at = now()
  from recalculated
  where counts.id = recalculated.id;

  get diagnostics v_updated_count = row_count;
  return jsonb_array_length(p_counts) + v_updated_count;
end;
$$;

-- Browser writes must pass through the atomic function above. SELECT remains
-- governed by the existing row-level policies.
revoke insert, update, delete on table public.daily_stock_counts
  from public, anon, authenticated;

-- Cost price remains owner-editable, while purchase RPCs update it through
-- their SECURITY DEFINER execution context. A direct PostgREST write runs as
-- authenticated/anon and must therefore pass the club-owner check.
create or replace function public.enforce_product_cost_price_owner()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if NEW.cost_price is distinct from OLD.cost_price
    and current_user::text in ('authenticated', 'anon')
    and (
      auth.uid() is null
      or public.current_user_club_role(OLD.club_id) is distinct from 'owner'
    ) then
    raise exception 'Only a club owner can change product cost price directly.'
      using errcode = '42501';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_product_cost_price_owner on public.products;
create trigger trg_enforce_product_cost_price_owner
  before update of cost_price on public.products
  for each row execute function public.enforce_product_cost_price_owner();

revoke all on function public.enforce_product_cost_price_owner()
  from public, anon, authenticated;

-- Existing product balances and tracking mode are ledger-controlled. Keep
-- INSERT and DELETE behavior unchanged, but limit ordinary browser UPDATEs to
-- catalog, pricing, ordering, activation, and soft-delete metadata.
revoke update on table public.products from public, anon, authenticated;
grant update (
  name,
  category,
  sale_price,
  cost_price,
  low_stock_threshold,
  sort_order,
  is_active,
  is_deleted,
  deleted_at,
  updated_at
) on table public.products to authenticated;

revoke all on function public.save_closing_stock_counts(uuid, date, jsonb)
  from public, anon;
grant execute on function public.save_closing_stock_counts(uuid, date, jsonb)
  to authenticated;

revoke all on function public.record_stock_purchase(uuid, date, uuid, numeric, numeric, numeric, text, text)
  from public, anon;
grant execute on function public.record_stock_purchase(uuid, date, uuid, numeric, numeric, numeric, text, text)
  to authenticated;
