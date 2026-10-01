-- Per-rate KPI basis and profit pools.
--   kpi_basis 'overall_profit': profit earned every day (Owner Profit earned cash,
--             before withdrawals) - the behavior every existing rate already had.
--   kpi_basis 'owner_profit': only what the owner actually withdrew.
-- kpi_game_club / kpi_bar choose which pools the KPI percentage is taken from.
alter table public.salary_rates
  add column kpi_basis text not null default 'overall_profit'
    check (kpi_basis in ('owner_profit','overall_profit')),
  add column kpi_game_club boolean not null default true,
  add column kpi_bar boolean not null default true,
  add constraint salary_rates_kpi_pool_check check (kpi_game_club or kpi_bar);

drop function public.save_salary_employee(uuid,uuid,text,text,date,text,numeric,numeric,boolean);
create or replace function public.save_salary_employee(
  p_club_id uuid, p_employee_id uuid, p_name text, p_job_title text,
  p_effective_date date, p_salary_type text, p_amount numeric, p_kpi_percent numeric, p_active boolean,
  p_kpi_basis text default null, p_kpi_game_club boolean default null, p_kpi_bar boolean default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare existing public.salary_employees; business_date date; cur public.salary_rates;
  v_basis text; v_game_club boolean; v_bar boolean; v_known boolean;
begin
  if auth.uid() is null or public.current_user_club_role(p_club_id) is distinct from 'owner' then
    raise exception 'Only a club owner can change payroll terms.' using errcode = '42501';
  end if;
  business_date := public.club_business_date(p_club_id);
  if p_employee_id is null or p_effective_date is null
    or p_effective_date < date '2000-01-01' or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_amount <> round(p_amount, 2) or p_kpi_percent <> round(p_kpi_percent, 2)
    or p_kpi_percent is null or p_kpi_percent::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Invalid salary settings.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));
  select * into existing from public.salary_employees where club_id = p_club_id and id = p_employee_id for update;
  v_known := found; -- later selects overwrite FOUND
  -- Unspecified KPI settings keep the rate in force today (new employees get the defaults).
  select * into cur from public.salary_rates
    where club_id = p_club_id and employee_id = p_employee_id and deleted_at is null
      and effective_date <= greatest(business_date, coalesce(existing.joined_on, p_effective_date))
    order by effective_date desc limit 1;
  v_basis := coalesce(p_kpi_basis, cur.kpi_basis, 'overall_profit');
  v_game_club := coalesce(p_kpi_game_club, cur.kpi_game_club, true);
  v_bar := coalesce(p_kpi_bar, cur.kpi_bar, true);
  if v_basis not in ('owner_profit','overall_profit') or not (v_game_club or v_bar) then
    raise exception 'Invalid KPI settings.';
  end if;
  if v_known then
    if p_effective_date < existing.joined_on then raise exception 'Salary cannot start before the employee joins.'; end if;
    -- Historical rates cannot be rewritten; same-business-day corrections are allowed.
    if p_effective_date <> greatest(business_date, existing.joined_on) then
      -- A lost response to an initial backdated setup can be safely retried.
      if existing.joined_on = p_effective_date and existing.name = btrim(p_name)
        and existing.job_title = btrim(coalesce(p_job_title,'')) and exists (
          select 1 from public.salary_rates where club_id = p_club_id and employee_id = p_employee_id
            and deleted_at is null and effective_date = p_effective_date and salary_type = p_salary_type
            and amount = p_amount and kpi_percent = p_kpi_percent and active = p_active
            and kpi_basis = v_basis and kpi_game_club = v_game_club and kpi_bar = v_bar
        ) then return p_employee_id; end if;
      raise exception 'Salary changes must start on the current business date or the future joining date.';
    end if;
    update public.salary_employees set name = btrim(p_name), job_title = btrim(coalesce(p_job_title,''))
      where club_id = p_club_id and id = p_employee_id;
  else
    insert into public.salary_employees(id, club_id, name, job_title, joined_on, created_by)
      values (p_employee_id, p_club_id, btrim(p_name), btrim(coalesce(p_job_title,'')), p_effective_date, auth.uid());
  end if;
  insert into public.salary_rates(club_id, employee_id, effective_date, salary_type, amount, kpi_percent, active, kpi_basis, kpi_game_club, kpi_bar, created_by)
    values (p_club_id,p_employee_id,p_effective_date,p_salary_type,p_amount,p_kpi_percent,p_active,v_basis,v_game_club,v_bar,auth.uid())
    on conflict (employee_id,effective_date) where deleted_at is null do update set salary_type = excluded.salary_type,
      amount = excluded.amount, kpi_percent = excluded.kpi_percent, active = excluded.active,
      kpi_basis = excluded.kpi_basis, kpi_game_club = excluded.kpi_game_club, kpi_bar = excluded.kpi_bar,
      created_by = excluded.created_by, created_at = now();
  return p_employee_id;
end;
$$;
revoke all on function public.save_salary_employee(uuid,uuid,text,text,date,text,numeric,numeric,boolean,text,boolean,boolean) from public, anon;
grant execute on function public.save_salary_employee(uuid,uuid,text,text,date,text,numeric,numeric,boolean,text,boolean,boolean) to authenticated;

drop function public.change_salary_term(uuid,uuid,text,numeric,text);
create or replace function public.change_salary_term(
  p_club_id uuid, p_employee_id uuid, p_kind text, p_amount numeric,
  p_salary_type text default null, p_kpi_basis text default null,
  p_kpi_game_club boolean default null, p_kpi_bar boolean default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare employee public.salary_employees; rate public.salary_rates; v_effective_date date;
begin
  if auth.uid() is null or public.current_user_club_role(p_club_id) is distinct from 'owner' then
    raise exception 'Only a club owner can change payroll terms.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));
  select * into employee from public.salary_employees
    where club_id = p_club_id and id = p_employee_id for update;
  if not found then raise exception 'Employee does not belong to this club.'; end if;
  v_effective_date := greatest(public.club_business_date(p_club_id), employee.joined_on);
  select * into rate from public.salary_rates
    where club_id = p_club_id and employee_id = p_employee_id
      and deleted_at is null and salary_rates.effective_date <= v_effective_date
    order by salary_rates.effective_date desc limit 1;
  if not found then raise exception 'Employee salary settings are missing.'; end if;
  if p_kind is null or p_kind not in ('salary','kpi') then raise exception 'Invalid salary change.'; end if;
  return public.save_salary_employee(p_club_id, p_employee_id, employee.name, employee.job_title,
    v_effective_date,
    case when p_kind = 'salary' then p_salary_type else rate.salary_type end,
    case when p_kind = 'salary' then p_amount else rate.amount end,
    case when p_kind = 'kpi' then p_amount else rate.kpi_percent end,
    rate.active,
    case when p_kind = 'kpi' then p_kpi_basis end,
    case when p_kind = 'kpi' then p_kpi_game_club end,
    case when p_kind = 'kpi' then p_kpi_bar end);
end;
$$;
revoke all on function public.change_salary_term(uuid,uuid,text,numeric,text,text,boolean,boolean) from public, anon;
grant execute on function public.change_salary_term(uuid,uuid,text,numeric,text,text,boolean,boolean) to authenticated;

-- Payroll KPI on the owner-profit basis needs monthly withdrawn totals per pool.
-- Only monthly aggregates are exposed, never individual withdrawal records.
create or replace function public.get_salary_profit_snapshot(p_club_id uuid, p_through_date date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.current_user_club_role(p_club_id) is null then
    raise exception 'Not authorized for this club payroll.' using errcode = '42501';
  end if;
  if p_through_date is null or p_through_date > public.club_business_date(p_club_id) then
    raise exception 'Invalid payroll date.';
  end if;
  return jsonb_build_object('monthlyBalances', coalesce((
    select jsonb_agg(jsonb_build_object(
      'period_month', row->'period_month',
      'game_club_earned', row->'game_club_earned',
      'bar_earned', row->'bar_earned',
      'game_club_withdrawn', row->'game_club_withdrawn',
      'bar_withdrawn', row->'bar_withdrawn'
    )) from jsonb_array_elements(public.get_owner_profit_snapshot(p_club_id, p_through_date)->'monthlyBalances') row
  ), '[]'::jsonb));
end;
$$;

