-- =============================================================
-- Migration 008: Fix handle_new_user trigger
-- =============================================================
-- Problem: ON CONFLICT was missing, so if auth.users INSERT fires
-- for a user that already has a profiles row (e.g. after a partial
-- auth failure or account linking), the trigger threw a unique-
-- constraint violation → Supabase returned "Database error saving
-- new user" and blocked Google OAuth login.
--
-- Fix: use INSERT ... ON CONFLICT (id) DO UPDATE so the trigger
-- is idempotent: new users get a profile created, existing users
-- get their name refreshed from the OAuth provider metadata.
-- =============================================================

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  requested_role text;
  assigned_role  user_role;
begin
  requested_role := NEW.raw_user_meta_data->>'role';
  assigned_role  := case
    when requested_role in ('owner', 'admin', 'viewer') then requested_role::user_role
    else 'viewer'::user_role
  end;

  insert into profiles (id, full_name, role)
  values (
    NEW.id,
    coalesce(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',   -- Google provides 'name', not 'full_name'
      NEW.email
    ),
    assigned_role
  )
  on conflict (id) do update
    set full_name = coalesce(
      excluded.full_name,
      profiles.full_name  -- keep existing name if new value is null
    );

  return NEW;
end;
$$;
