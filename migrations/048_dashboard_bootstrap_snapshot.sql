-- Load the authenticated user's profile, memberships, and club settings in one
-- database request. Auth itself remains validated by auth.getUser() on the
-- server before this function is called.

create or replace function public.get_dashboard_bootstrap()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  return jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'full_name', profile.full_name,
        'role', profile.role
      )
      from public.profiles profile
      where profile.id = v_user_id
    ),
    'memberships', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'club_id', membership.club_id,
          'user_id', membership.user_id,
          'role', membership.role,
          'feature_access', membership.feature_access,
          'created_at', membership.created_at,
          'updated_at', membership.updated_at,
          'clubs', case when club.id is null then null else jsonb_build_object(
            'id', club.id,
            'name', club.name,
            'address', club.address,
            'business_day_start_hour', club.business_day_start_hour,
            'enabled_payment_methods', club.enabled_payment_methods,
            'is_active', club.is_active,
            'created_at', club.created_at,
            'updated_at', club.updated_at
          ) end
        ) order by membership.created_at
      )
      from public.club_memberships membership
      left join public.clubs club on club.id = membership.club_id
      where membership.user_id = v_user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_dashboard_bootstrap() from public, anon;
grant execute on function public.get_dashboard_bootstrap() to authenticated;
