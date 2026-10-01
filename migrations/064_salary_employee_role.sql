-- Job-title changes must not create a salary rate or modify payroll history.
create function public.change_salary_employee_role(p_club_id uuid, p_employee_id uuid, p_job_title text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.current_user_can_access_club_feature(p_club_id, 'salaries') then
    raise exception 'Salary editing access is required.' using errcode = '42501';
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
revoke all on function public.change_salary_employee_role(uuid,uuid,text) from public,anon;
grant execute on function public.change_salary_employee_role(uuid,uuid,text) to authenticated;
