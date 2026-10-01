-- Replace the uuid-ossp call inside the already-deployed claim function.
-- Supabase keeps uuid_generate_v4() in the extensions schema, but the
-- security-definer function intentionally uses a restricted search_path.
-- gen_random_uuid() is built into PostgreSQL and remains available there.

alter table public.telegram_report_deliveries
  alter column id set default gen_random_uuid();

do $migration$
declare
  v_signature regprocedure :=
    'public.claim_telegram_report_delivery(date,text,uuid,text,text,integer)'::regprocedure;
  v_definition text;
begin
  v_definition := pg_get_functiondef(v_signature);

  if position('uuid_generate_v4()' in v_definition) > 0 then
    execute replace(v_definition, 'uuid_generate_v4()', 'gen_random_uuid()');
  elsif position('gen_random_uuid()' in v_definition) = 0 then
    raise exception 'claim_telegram_report_delivery contains an unknown UUID generator';
  end if;
end;
$migration$;
