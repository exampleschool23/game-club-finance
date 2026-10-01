-- =============================================================
-- Migration 009: Fix handle_new_user — set search_path = public
-- =============================================================
-- Root cause: The trigger fires from the auth schema context.
-- Without "set search_path = public", PostgreSQL cannot resolve
-- the unqualified table name "profiles" and throws
-- "Database error saving new user".
--
-- Fix 1: add "set search_path = public" to the function
-- Fix 2: use fully-qualified "public.profiles" in the INSERT
-- Fix 3: keep ON CONFLICT from migration 008
-- Fix 4: handle Google's 'name' metadata key (not 'full_name')
-- =============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  assigned_role  user_role;
  display_name   text;
begin
  requested_role := NEW.raw_user_meta_data->>'role';
  assigned_role  := case
    when requested_role in ('owner', 'admin', 'viewer') then requested_role::user_role
    else 'viewer'::user_role
  end;

  -- Google sends 'name', email/password sends 'full_name'
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
