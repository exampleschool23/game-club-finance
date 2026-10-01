-- Payroll terms (employees, salary, KPI, role, activation) are owner-only.
-- Salary editors keep payments, bonuses, fines and entry deletion.

create or replace function public.save_salary_employee(
  p_club_id uuid, p_employee_id uuid, p_name text, p_job_title text,
  p_effective_date date, p_salary_type text, p_amount numeric, p_kpi_percent numeric, p_active boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare existing public.salary_employees; business_date date;
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
  if found then
    if p_effective_date < existing.joined_on then raise exception 'Salary cannot start before the employee joins.'; end if;
    -- Historical rates cannot be rewritten; same-business-day corrections are allowed.
    if p_effective_date <> greatest(business_date, existing.joined_on) then
      -- A lost response to an initial backdated setup can be safely retried.
      if existing.joined_on = p_effective_date and existing.name = btrim(p_name)
        and existing.job_title = btrim(coalesce(p_job_title,'')) and exists (
          select 1 from public.salary_rates where club_id = p_club_id and employee_id = p_employee_id
            and deleted_at is null and effective_date = p_effective_date and salary_type = p_salary_type
            and amount = p_amount and kpi_percent = p_kpi_percent and active = p_active
        ) then return p_employee_id; end if;
      raise exception 'Salary changes must start on the current business date or the future joining date.';
    end if;
    update public.salary_employees set name = btrim(p_name), job_title = btrim(coalesce(p_job_title,''))
      where club_id = p_club_id and id = p_employee_id;
  else
    insert into public.salary_employees(id, club_id, name, job_title, joined_on, created_by)
      values (p_employee_id, p_club_id, btrim(p_name), btrim(coalesce(p_job_title,'')), p_effective_date, auth.uid());
  end if;
  insert into public.salary_rates(club_id, employee_id, effective_date, salary_type, amount, kpi_percent, active, created_by)
    values (p_club_id,p_employee_id,p_effective_date,p_salary_type,p_amount,p_kpi_percent,p_active,auth.uid())
    on conflict (employee_id,effective_date) where deleted_at is null do update set salary_type = excluded.salary_type,
      amount = excluded.amount, kpi_percent = excluded.kpi_percent, active = excluded.active,
      created_by = excluded.created_by, created_at = now();
  return p_employee_id;
end;
$$;

create or replace function public.change_salary_term(
  p_club_id uuid, p_employee_id uuid, p_kind text, p_amount numeric,
  p_salary_type text default null
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
    rate.active);
end;
$$;

create or replace function public.deactivate_salary_employee(
  p_club_id uuid, p_employee_id uuid
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
  if not rate.active then return p_employee_id; end if;
  return public.save_salary_employee(p_club_id, p_employee_id, employee.name, employee.job_title,
    v_effective_date,
    rate.salary_type,
    rate.amount,
    rate.kpi_percent,
    false);
end;
$$;

create or replace function public.change_salary_employee_role(p_club_id uuid, p_employee_id uuid, p_job_title text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.current_user_club_role(p_club_id) is distinct from 'owner' then
    raise exception 'Only a club owner can change payroll terms.' using errcode = '42501';
  end if;
  if p_job_title is null or p_job_title not in ('Manager','Admin','Cleaner') then
    raise exception 'Invalid employee role.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));
  update public.salary_employees set job_title=p_job_title
    where club_id=p_club_id and id=p_employee_id;
  if not found then raise exception 'Employee does not belong to this club.'; end if;
end;
$$;

-- Reactivate using the latest saved terms under the employee lock.
create or replace function public.activate_salary_employee(
  p_club_id uuid, p_employee_id uuid
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
  if rate.active then return p_employee_id; end if;
  return public.save_salary_employee(p_club_id, p_employee_id, employee.name, employee.job_title,
    v_effective_date,
    rate.salary_type,
    rate.amount,
    rate.kpi_percent,
    true);
end;
$$;
revoke all on function public.activate_salary_employee(uuid,uuid) from public, anon;
grant execute on function public.activate_salary_employee(uuid,uuid) to authenticated;


create or replace function public.delete_salary_record(p_club_id uuid, p_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare employee_id_value uuid;
begin
  if auth.uid() is null or not public.current_user_can_access_club_feature(p_club_id, 'salaries') then
    raise exception 'Salary editing access is required.' using errcode = '42501';
  end if;
  if p_kind = 'rate' and public.current_user_club_role(p_club_id) is distinct from 'owner' then
    raise exception 'Only a club owner can change payroll terms.' using errcode = '42501';
  end if;
  if p_kind = 'entry' then
    select employee_id into employee_id_value from public.salary_entries where club_id=p_club_id and id=p_id;
  elsif p_kind = 'rate' then
    select employee_id into employee_id_value from public.salary_rates where club_id=p_club_id and id=p_id;
  else raise exception 'Invalid salary record type.';
  end if;
  if employee_id_value is null then raise exception 'Record does not belong to this club.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(employee_id_value::text, 0));
  perform 1 from public.salary_employees where club_id=p_club_id and id=employee_id_value for update;
  if p_kind = 'entry' then
    update public.salary_entries set deleted_at=now(),deleted_by=auth.uid() where club_id=p_club_id and id=p_id and deleted_at is null;
    delete from public.expenses where club_id=p_club_id and salary_entry_id=p_id;
  else
    if exists (select 1 from public.salary_rates where club_id=p_club_id and id=p_id and deleted_at is null)
      and not exists (select 1 from public.salary_rates where club_id=p_club_id
        and employee_id=employee_id_value and id<>p_id and deleted_at is null) then
      raise exception 'The last salary rate cannot be deleted. Change salary settings or deactivate the employee instead.';
    end if;
    update public.salary_rates set deleted_at=now(),deleted_by=auth.uid() where club_id=p_club_id and id=p_id and deleted_at is null;
  end if;
end;
$$;

revoke all on function public.delete_salary_record(uuid,uuid,text) from public,anon;
grant execute on function public.delete_salary_record(uuid,uuid,text) to authenticated;
