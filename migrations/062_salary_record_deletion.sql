-- Keep deleted payroll records as an audit trail; remove their accounting effect atomically.
alter table public.salary_rates add column deleted_at timestamptz, add column deleted_by uuid references auth.users(id);
alter table public.salary_entries add column deleted_at timestamptz, add column deleted_by uuid references auth.users(id);
alter table public.salary_rates drop constraint salary_rates_employee_id_effective_date_key;
create unique index salary_rates_live_effective on public.salary_rates(employee_id,effective_date) where deleted_at is null;
create or replace function public.protect_salary_expense() returns trigger
language plpgsql security definer set search_path = public as $$
declare entry public.salary_entries;
begin
  if TG_OP = 'DELETE' then
    if OLD.salary_entry_id is not null and not exists (select 1 from public.salary_entries where id = OLD.salary_entry_id and club_id = OLD.club_id and deleted_at is not null) then raise exception 'Salary payments cannot be deleted.'; end if;
    return OLD;
  end if;
  if TG_OP = 'UPDATE' and OLD.salary_entry_id is not null and (
    NEW.salary_entry_id is distinct from OLD.salary_entry_id or NEW.id is distinct from OLD.id
    or NEW.club_id is distinct from OLD.club_id or NEW.date is distinct from OLD.date
    or NEW.amount is distinct from OLD.amount or NEW.category is distinct from OLD.category
    or NEW.payment_method is distinct from OLD.payment_method or NEW.payment_source is distinct from OLD.payment_source
    or NEW.comment is distinct from OLD.comment or NEW.created_by is distinct from OLD.created_by
  ) then raise exception 'Salary payments cannot be edited.'; end if;
  if NEW.salary_entry_id is not null then
    select * into entry from public.salary_entries where id = NEW.salary_entry_id and club_id = NEW.club_id;
    if not found or entry.deleted_at is not null or entry.kind <> 'payment' or NEW.amount is distinct from entry.amount
      or NEW.date is distinct from entry.date or NEW.payment_method is distinct from entry.payment_method
      or NEW.payment_source is distinct from entry.payment_source or NEW.category <> 'salary'
      or NEW.created_by is distinct from entry.created_by then
      raise exception 'Invalid salary expense.';
    end if;
  end if;
  return NEW;
end;
$$;
create or replace function public.save_salary_employee(
  p_club_id uuid, p_employee_id uuid, p_name text, p_job_title text,
  p_effective_date date, p_salary_type text, p_amount numeric, p_kpi_percent numeric, p_active boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare existing public.salary_employees; business_date date;
begin
  if auth.uid() is null or not public.current_user_can_access_club_feature(p_club_id, 'salaries') then
    raise exception 'Salary editing access is required.' using errcode = '42501';
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

-- Update just the requested term, preserving the other terms under the same lock.
create or replace function public.change_salary_term(
  p_club_id uuid, p_employee_id uuid, p_kind text, p_amount numeric,
  p_salary_type text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare employee public.salary_employees; rate public.salary_rates; v_effective_date date;
begin
  if auth.uid() is null or not public.current_user_can_access_club_feature(p_club_id, 'salaries') then
    raise exception 'Salary editing access is required.' using errcode = '42501';
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
revoke all on function public.change_salary_term(uuid,uuid,text,numeric,text) from public, anon;
grant execute on function public.change_salary_term(uuid,uuid,text,numeric,text) to authenticated;

create or replace function public.record_salary_entry(
  p_club_id uuid, p_employee_id uuid, p_request_id uuid, p_date date,
  p_kind text, p_amount numeric, p_comment text, p_payment_method text default null, p_payment_source text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare employee public.salary_employees; existing public.salary_entries; methods text[];
begin
  if auth.uid() is null or not public.current_user_can_access_club_feature(p_club_id, 'salaries') then
    raise exception 'Salary editing access is required.' using errcode = '42501';
  end if;
  select * into employee from public.salary_employees where club_id = p_club_id and id = p_employee_id for update;
  if not found then raise exception 'Employee does not belong to this club.'; end if;
  if p_request_id is null or p_date is null or p_date < employee.joined_on or p_date > public.club_business_date(p_club_id)
    or p_amount is null or p_amount <= 0 or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_amount <> round(p_amount, 2) then raise exception 'Invalid salary entry.'; end if;
  select * into existing from public.salary_entries where club_id = p_club_id and id = p_request_id;
  if found then
    if existing.employee_id is distinct from p_employee_id or existing.date is distinct from p_date
      or existing.kind is distinct from p_kind or existing.amount is distinct from p_amount
      or existing.comment is distinct from coalesce(p_comment,'')
      or existing.payment_method is distinct from p_payment_method or existing.payment_source is distinct from p_payment_source then
      raise exception 'This request has already been used for a different entry.';
    end if;
    return existing.id;
  end if;
  if p_kind = 'payment' then
    select enabled_payment_methods into methods from public.clubs where id = p_club_id;
    if p_payment_method is null or not (p_payment_method = any(methods)) then
      raise exception 'Payment method is not enabled for this club.';
    end if;
  end if;
  insert into public.salary_entries(id,club_id,employee_id,date,kind,amount,comment,payment_method,payment_source,created_by)
    values (p_request_id,p_club_id,p_employee_id,p_date,p_kind,p_amount,coalesce(p_comment,''),p_payment_method,p_payment_source,auth.uid());
  if p_kind = 'payment' then
    insert into public.expenses(club_id,date,amount,category,payment_method,payment_source,comment,created_by,salary_entry_id)
      values (p_club_id,p_date,p_amount,'salary',p_payment_method,p_payment_source,
        employee.name || case when coalesce(p_comment,'') = '' then '' else ': ' || p_comment end,auth.uid(),p_request_id);
  end if;
  return p_request_id;
end;
$$;

create function public.delete_salary_record(p_club_id uuid, p_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare employee_id_value uuid;
begin
  if auth.uid() is null or not public.current_user_can_access_club_feature(p_club_id, 'salaries') then
    raise exception 'Salary editing access is required.' using errcode = '42501';
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
    update public.salary_rates set deleted_at=now(),deleted_by=auth.uid() where club_id=p_club_id and id=p_id and deleted_at is null;
  end if;
end;
$$;
revoke all on function public.delete_salary_record(uuid,uuid,text) from public,anon;
grant execute on function public.delete_salary_record(uuid,uuid,text) to authenticated;
