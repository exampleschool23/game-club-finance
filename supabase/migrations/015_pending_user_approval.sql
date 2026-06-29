-- =============================================================
-- Pending user approval
-- New auth users get a profile only. Owners approve club access later.
-- =============================================================

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

  insert into public.profiles (id, full_name, role)
  values (NEW.id, display_name, assigned_role)
  on conflict (id) do update
    set full_name = coalesce(
      nullif(trim(excluded.full_name), ''),
      public.profiles.full_name
    );

  return NEW;
end;
$$;
