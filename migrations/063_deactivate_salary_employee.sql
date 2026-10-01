-- Deactivate using the latest saved terms under the employee lock.
create function public.deactivate_salary_employee(
  p_club_id uuid, p_employee_id uuid
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
  if not rate.active then return p_employee_id; end if;
  return public.save_salary_employee(p_club_id, p_employee_id, employee.name, employee.job_title,
    v_effective_date,
    rate.salary_type,
    rate.amount,
    rate.kpi_percent,
    false);
end;
$$;
revoke all on function public.deactivate_salary_employee(uuid,uuid) from public, anon;
grant execute on function public.deactivate_salary_employee(uuid,uuid) to authenticated;

