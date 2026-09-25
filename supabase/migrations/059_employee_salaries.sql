-- Payroll ledgers are owner-only. Payments and the corresponding expense commit together.
create table public.salary_employees (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  job_title text not null default '' check (length(job_title) <= 120),
  joined_on date not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (club_id, id)
);
create table public.salary_rates (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  employee_id uuid not null,
  effective_date date not null,
  salary_type text not null check (salary_type in ('daily', 'monthly')),
  amount numeric(16,2) not null check (amount >= 0 and amount < 100000000000000),
  kpi_percent numeric(5,2) not null check (kpi_percent between 0 and 100),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (club_id, employee_id) references public.salary_employees(club_id, id),
  unique (employee_id, effective_date)
);
create table public.salary_entries (
  id uuid primary key, -- caller's retry/idempotency key
  club_id uuid not null,
  employee_id uuid not null,
  date date not null,
  kind text not null check (kind in ('payment', 'bonus', 'fine')),
  amount numeric(16,2) not null check (amount > 0 and amount < 100000000000000),
  comment text not null default '' check (length(comment) <= 1000),
  payment_method text,
  payment_source text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (club_id, employee_id) references public.salary_employees(club_id, id),
  unique (club_id, id),
  check ((kind = 'payment' and payment_method is not null and payment_method in ('cash','terminal','card')
    and payment_source is not null and payment_source in ('game_club','bar'))
    or (kind <> 'payment' and payment_method is null and payment_source is null))
);
create index salary_employees_club on public.salary_employees(club_id);
create index salary_rates_club on public.salary_rates(club_id, employee_id, effective_date);
create index salary_entries_club on public.salary_entries(club_id, date);

alter table public.salary_employees enable row level security;
alter table public.salary_rates enable row level security;
alter table public.salary_entries enable row level security;
revoke all on public.salary_employees, public.salary_rates, public.salary_entries from public, anon, authenticated;
grant select on public.salary_employees, public.salary_rates, public.salary_entries to authenticated;
create policy salary_employees_owner_read on public.salary_employees for select to authenticated
  using (public.current_user_club_role(club_id) = 'owner');
create policy salary_rates_owner_read on public.salary_rates for select to authenticated
  using (public.current_user_club_role(club_id) = 'owner');
create policy salary_entries_owner_read on public.salary_entries for select to authenticated
  using (public.current_user_club_role(club_id) = 'owner');

alter table public.expenses add column salary_entry_id uuid unique;
alter table public.expenses add constraint expenses_salary_entry_club_fk
  foreign key (club_id, salary_entry_id) references public.salary_entries(club_id, id);

-- Keep payroll-linked expenses in sync forever; Telegram metadata can still update.
create function public.protect_salary_expense() returns trigger
language plpgsql security definer set search_path = public as $$
declare entry public.salary_entries;
begin
  if TG_OP = 'DELETE' then
    if OLD.salary_entry_id is not null then raise exception 'Salary payments cannot be deleted.'; end if;
    return OLD;
  end if;
  if TG_OP = 'UPDATE' and OLD.salary_entry_id is not null and (
    NEW.salary_entry_id is distinct from OLD.salary_entry_id or NEW.id is distinct from OLD.id
    or NEW.club_id is distinct from OLD.club_id or NEW.date is distinct from OLD.date
    or NEW.amount is distinct from OLD.amount or NEW.category is distinct from OLD.category
    or NEW.payment_method is distinct from OLD.payment_method or NEW.payment_source is distinct from OLD.payment_source
    or NEW.comment is distinct from OLD.comment or NEW.created_by is distinct from OLD.created_by
  ) then raise exception 'Salary payments cannot be edited.'; end if;
  if NEW.salary_entry_id is not null then
    select * into entry from public.salary_entries where id = NEW.salary_entry_id and club_id = NEW.club_id;
    if not found or entry.kind <> 'payment' or NEW.amount is distinct from entry.amount
      or NEW.date is distinct from entry.date or NEW.payment_method is distinct from entry.payment_method
      or NEW.payment_source is distinct from entry.payment_source or NEW.category <> 'salary'
      or NEW.created_by is distinct from entry.created_by then
      raise exception 'Invalid salary expense.';
    end if;
  end if;
  return NEW;
end;
$$;
create trigger protect_salary_expense before insert or update or delete on public.expenses
for each row execute function public.protect_salary_expense();
revoke all on function public.protect_salary_expense() from public, anon, authenticated;

create function public.save_salary_employee(
  p_club_id uuid, p_employee_id uuid, p_name text, p_job_title text,
  p_effective_date date, p_salary_type text, p_amount numeric, p_kpi_percent numeric, p_active boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare existing public.salary_employees; business_date date;
begin
  if auth.uid() is null or public.current_user_club_role(p_club_id) is distinct from 'owner' then
    raise exception 'Only the club owner can manage salaries.' using errcode = '42501';
  end if;
  business_date := public.club_business_date(p_club_id);
  if p_employee_id is null or p_effective_date is null or p_effective_date > business_date
    or p_effective_date < date '2000-01-01' or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_amount <> round(p_amount, 2) or p_kpi_percent <> round(p_kpi_percent, 2)
    or p_kpi_percent is null or p_kpi_percent::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Invalid salary settings.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));
  select * into existing from public.salary_employees where club_id = p_club_id and id = p_employee_id for update;
  if found then
    -- Historical rates cannot be rewritten; same-business-day corrections are allowed.
    if p_effective_date <> business_date then
      -- A lost response to an initial backdated setup can be safely retried.
      if existing.joined_on = p_effective_date and existing.name = btrim(p_name)
        and existing.job_title = btrim(coalesce(p_job_title,'')) and exists (
          select 1 from public.salary_rates where club_id = p_club_id and employee_id = p_employee_id
            and effective_date = p_effective_date and salary_type = p_salary_type
            and amount = p_amount and kpi_percent = p_kpi_percent and active = p_active
        ) then return p_employee_id; end if;
      raise exception 'Salary changes must start on the current business date.';
    end if;
    update public.salary_employees set name = btrim(p_name), job_title = btrim(coalesce(p_job_title,''))
      where club_id = p_club_id and id = p_employee_id;
  else
    insert into public.salary_employees(id, club_id, name, job_title, joined_on, created_by)
      values (p_employee_id, p_club_id, btrim(p_name), btrim(coalesce(p_job_title,'')), p_effective_date, auth.uid());
  end if;
  insert into public.salary_rates(club_id, employee_id, effective_date, salary_type, amount, kpi_percent, active, created_by)
    values (p_club_id,p_employee_id,p_effective_date,p_salary_type,p_amount,p_kpi_percent,p_active,auth.uid())
    on conflict (employee_id,effective_date) do update set salary_type = excluded.salary_type,
      amount = excluded.amount, kpi_percent = excluded.kpi_percent, active = excluded.active,
      created_by = excluded.created_by, created_at = now();
  return p_employee_id;
end;
$$;

create function public.record_salary_entry(
  p_club_id uuid, p_employee_id uuid, p_request_id uuid, p_date date,
  p_kind text, p_amount numeric, p_comment text, p_payment_method text default null, p_payment_source text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare employee public.salary_employees; existing public.salary_entries; methods text[];
begin
  if auth.uid() is null or public.current_user_club_role(p_club_id) is distinct from 'owner' then
    raise exception 'Only the club owner can manage salaries.' using errcode = '42501';
  end if;
  select * into employee from public.salary_employees where club_id = p_club_id and id = p_employee_id for update;
  if not found then raise exception 'Employee does not belong to this club.'; end if;
  if p_request_id is null or p_date is null or p_date < employee.joined_on or p_date > public.club_business_date(p_club_id)
    or p_amount is null or p_amount <= 0 or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_amount <> round(p_amount, 2) then raise exception 'Invalid salary entry.'; end if;
  select * into existing from public.salary_entries where club_id = p_club_id and id = p_request_id;
  if found then
    if existing.employee_id is distinct from p_employee_id or existing.date is distinct from p_date
      or existing.kind is distinct from p_kind or existing.amount is distinct from p_amount
      or existing.comment is distinct from coalesce(p_comment,'')
      or existing.payment_method is distinct from p_payment_method or existing.payment_source is distinct from p_payment_source then
      raise exception 'This request has already been used for a different entry.';
    end if;
    return existing.id;
  end if;
  if p_kind = 'payment' then
    select enabled_payment_methods into methods from public.clubs where id = p_club_id;
    if p_payment_method is null or not (p_payment_method = any(methods)) then
      raise exception 'Payment method is not enabled for this club.';
    end if;
  end if;
  insert into public.salary_entries(id,club_id,employee_id,date,kind,amount,comment,payment_method,payment_source,created_by)
    values (p_request_id,p_club_id,p_employee_id,p_date,p_kind,p_amount,coalesce(p_comment,''),p_payment_method,p_payment_source,auth.uid());
  if p_kind = 'payment' then
    insert into public.expenses(club_id,date,amount,category,payment_method,payment_source,comment,created_by,salary_entry_id)
      values (p_club_id,p_date,p_amount,'salary',p_payment_method,p_payment_source,
        employee.name || case when coalesce(p_comment,'') = '' then '' else ': ' || p_comment end,auth.uid(),p_request_id);
  end if;
  return p_request_id;
end;
$$;
revoke all on function public.save_salary_employee(uuid,uuid,text,text,date,text,numeric,numeric,boolean) from public, anon;
grant execute on function public.save_salary_employee(uuid,uuid,text,text,date,text,numeric,numeric,boolean) to authenticated;
revoke all on function public.record_salary_entry(uuid,uuid,uuid,date,text,numeric,text,text,text) from public, anon;
grant execute on function public.record_salary_entry(uuid,uuid,uuid,date,text,numeric,text,text,text) to authenticated;

alter table public.club_memberships
  drop constraint if exists club_memberships_feature_access_valid;

alter table public.club_memberships
  add constraint club_memberships_feature_access_valid
  check (
    feature_access is null
    or feature_access <@ array[
      'dashboard',
      'daily_cash',
      'closing_stock',
      'stock_purchase',
      'expenses',
      'reports',
      'owner_profit',
      'debts',
      'inventory',
      'salaries',
      'team',
      'settings'
    ]::text[]
  );

create or replace function public.current_user_can_access_club_feature(
  p_club_id uuid,
  p_feature_key text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select case
      when membership.role = 'owner'::user_role then true
      when p_feature_key in ('team', 'salaries') then false
      when membership.feature_access is not null then p_feature_key = any(membership.feature_access)
      when membership.role = 'admin'::user_role then p_feature_key = any(array[
        'dashboard', 'daily_cash', 'closing_stock', 'stock_purchase', 'expenses',
        'reports', 'owner_profit', 'debts', 'inventory', 'settings'
      ]::text[])
      when membership.role = 'viewer'::user_role then p_feature_key = any(array[
        'dashboard', 'reports', 'owner_profit', 'debts', 'inventory', 'settings'
      ]::text[])
      else false
    end
    from public.club_memberships membership
    where membership.club_id = p_club_id
      and membership.user_id = auth.uid()
  ), false);
$$;

revoke all on function public.current_user_can_access_club_feature(uuid, text)
  from public, anon;
grant execute on function public.current_user_can_access_club_feature(uuid, text)
  to authenticated;

