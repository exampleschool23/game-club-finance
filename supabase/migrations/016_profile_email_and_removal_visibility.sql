-- =============================================================
-- Profile email visibility
-- Owners need email addresses when approving or removing users.
-- =============================================================

alter table public.profiles
  add column if not exists email text;

update public.profiles as profile
set email = auth_user.email,
    updated_at = now()
from auth.users as auth_user
where auth_user.id = profile.id
  and profile.email is distinct from auth_user.email;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role user_role;
  display_name text;
begin
  assigned_role := 'viewer'::user_role;

  display_name := coalesce(
    nullif(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(NEW.raw_user_meta_data->>'name'), ''),
    NEW.email,
    'User'
  );

  insert into public.profiles (id, full_name, email, role)
  values (NEW.id, display_name, NEW.email, assigned_role)
  on conflict (id) do update
    set full_name = coalesce(
          nullif(trim(excluded.full_name), ''),
          public.profiles.full_name
        ),
        email = coalesce(excluded.email, public.profiles.email),
        updated_at = now();

  return NEW;
end;
$$;
