-- Payroll is readable by every club member, independently of ledger feature grants.
-- Reuse the canonical earned-cash aggregate under a trusted role, exposing only
-- payroll inputs, never withdrawal records or payment-method details.
create function public.get_salary_profit_snapshot(p_club_id uuid, p_through_date date)
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
      'game_club_withdrawn', 0,
      'bar_withdrawn', 0
    )) from jsonb_array_elements(public.get_owner_profit_snapshot(p_club_id, p_through_date)->'monthlyBalances') row
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.get_salary_profit_snapshot(uuid,date) from public,anon;
grant execute on function public.get_salary_profit_snapshot(uuid,date) to authenticated;

-- Serialize deletion with term changes and retain at least one live rate.
create or replace function public.delete_salary_record(p_club_id uuid, p_id uuid, p_kind text)
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
