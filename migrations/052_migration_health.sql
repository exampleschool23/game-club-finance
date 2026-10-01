-- Owner-only diagnostics. Reads metadata, never runs financial RPCs or returns SQL bodies.
create or replace function public.get_migration_health(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  versions jsonb := '[]'::jsonb;
  history_available boolean := false;
  checks jsonb;
begin
  if auth.uid() is null
    or public.current_user_club_role(p_club_id) is distinct from 'owner'::public.user_role then
    raise exception 'Only a club owner can inspect migration health' using errcode = '42501';
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    begin
      execute 'select coalesce(jsonb_agg(version::text order by version), ''[]''::jsonb) from supabase_migrations.schema_migrations'
        into versions;
      history_available := true;
    exception when insufficient_privilege or undefined_column then
      history_available := false;
    end;
  end if;

  -- Exact bodies distinguish partially applied 051 from a matching installation.
  -- A different body requires review; it does not prove a migration is missing.
  with expected(version, name, signature, body_hash) as (
    values
      ('050', 'get_owner_profit_snapshot', 'public.get_owner_profit_snapshot(uuid,date)', '87f0285cffb3120db9052b91ecc423ab'),
      ('051', 'withdraw_owner_money_for_month', 'public.withdraw_owner_money_for_month(uuid,date,text,numeric,text)', 'd8046ece3f06f379d502dbb6f31e7506'),
      ('051', 'enforce_owner_withdrawal_month_balance', 'public.enforce_owner_withdrawal_month_balance()', 'b40fa8129d33f06c4d69868b07f23f8c')
  )
  select jsonb_agg(jsonb_build_object(
    'version', expected.version,
    'name', expected.name,
    'status', case when proc.oid is null then 'missing'
      when md5(proc.prosrc) <> expected.body_hash then 'different'
      when expected.name = 'enforce_owner_withdrawal_month_balance' and not exists (
        select 1 from pg_trigger
        where tgrelid = to_regclass('public.owner_withdrawals')
          and tgfoid = proc.oid and tgenabled in ('O', 'A') and not tgisinternal
          and tgtype = 7
      ) then 'different'
      when expected.name <> 'enforce_owner_withdrawal_month_balance'
        and not has_function_privilege('authenticated', proc.oid, 'EXECUTE') then 'different'
      else 'matching' end
  ) order by expected.version, expected.name)
  into checks
  from expected left join pg_proc proc on proc.oid = to_regprocedure(expected.signature);

  return jsonb_build_object('historyAvailable', history_available, 'recordedVersions', versions, 'checks', checks);
end;
$$;

revoke all on function public.get_migration_health(uuid) from public, anon;
grant execute on function public.get_migration_health(uuid) to authenticated;
