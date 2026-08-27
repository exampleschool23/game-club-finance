-- Preserve saved historical stock snapshots and close the remaining integrity
-- gaps around payment methods and archived product balances.

-- Existing production values were audited before this migration. Add the
-- constraints as NOT VALID first so the intent is explicit, then validate them
-- in the same transaction so no unverified legacy rows remain.
alter table public.expenses
  drop constraint if exists expenses_payment_method_check,
  add constraint expenses_payment_method_check
    check (payment_method in ('cash', 'terminal', 'card')) not valid;

alter table public.debt_payments
  drop constraint if exists debt_payments_payment_method_check,
  add constraint debt_payments_payment_method_check
    check (payment_method in ('cash', 'terminal', 'card')) not valid;

alter table public.stock_purchases
  drop constraint if exists stock_purchases_payment_method_check,
  add constraint stock_purchases_payment_method_check
    check (payment_method in ('cash', 'terminal', 'card')) not valid;

alter table public.expenses
  validate constraint expenses_payment_method_check;
alter table public.debt_payments
  validate constraint debt_payments_payment_method_check;
alter table public.stock_purchases
  validate constraint stock_purchases_payment_method_check;

-- Archived products are excluded from operational inventory. Clear the two
-- kinds of stale state (historical rows and future soft deletes) without
-- changing any stock-count, sales, cost, or profit ledger row.
update public.products
set
  current_stock = 0,
  updated_at = now()
where is_deleted
  and current_stock <> 0;

create or replace function public.zero_archived_product_stock()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if NEW.is_deleted then
    NEW.is_active := false;
    NEW.current_stock := 0;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_zero_archived_product_stock on public.products;
create trigger trg_zero_archived_product_stock
  before insert or update of is_deleted on public.products
  for each row execute function public.zero_archived_product_stock();

revoke all on function public.zero_archived_product_stock()
  from public, anon, authenticated;

-- Purchases are the live source of added_today while a business day is open.
-- Once a stock count belongs to a historical business day, however, its saved
-- added_today and closing_stock values are an accounting snapshot. Later edits
-- to old purchase metadata must be visible to operators, but must not silently
-- rewrite that snapshot or its financial result.
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

      if v_has_existing and p_date < v_business_date then
        v_added := v_existing.added_today;
      elsif v_purchase_added is not null and v_purchase_added <> trunc(v_purchase_added) then
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
  where counts.id = recalculated.id
    and (
      counts.previous_stock is distinct from recalculated.canonical_previous
      or counts.sold_quantity is distinct from recalculated.canonical_sold
      or counts.bar_income is distinct from recalculated.canonical_sold * recalculated.sale_price
      or counts.bar_cost is distinct from recalculated.canonical_sold * recalculated.cost_price
      or counts.bar_profit is distinct from
        (recalculated.canonical_sold * recalculated.sale_price)
        - (recalculated.canonical_sold * recalculated.cost_price)
    );

  get diagnostics v_updated_count = row_count;
  return jsonb_array_length(p_counts) + v_updated_count;
end;
$$;

revoke all on function public.save_closing_stock_counts(uuid, date, jsonb)
  from public, anon;
grant execute on function public.save_closing_stock_counts(uuid, date, jsonb)
  to authenticated;
