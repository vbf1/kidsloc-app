-- LeadFesta: company-scoped CRM module with platform-controlled entitlement.
create table private.company_feature_entitlements (
  company_id uuid not null references public.companies(id) on delete cascade,
  feature_key text not null check (feature_key = 'leadfesta'),
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (company_id, feature_key)
);
alter table private.company_feature_entitlements enable row level security;
revoke all on private.company_feature_entitlements from public, anon, authenticated;

create table public.lead_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  color text not null default '#8054d8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position integer not null default 0 check (position >= 0),
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name),
  check (not (is_won and is_lost))
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stage_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 160),
  phone text,
  email text,
  contact_company text,
  source text not null default 'Não informado' check (length(source) <= 100),
  estimated_value numeric(12,2) check (estimated_value is null or estimated_value >= 0),
  expected_close_date date,
  next_contact_at timestamptz,
  notes text,
  converted_customer_id uuid references public.customers(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint leads_stage_company_fk
    foreign key (company_id, stage_id)
    references public.lead_pipeline_stages(company_id, id)
    on delete restrict
);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null,
  activity_type text not null default 'note'
    check (activity_type in ('note','call','email','whatsapp','meeting','status_change','conversion')),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint lead_activities_lead_company_fk
    foreign key (company_id, lead_id)
    references public.leads(company_id, id)
    on delete cascade
);

create index leads_company_stage_updated_idx
  on public.leads(company_id, stage_id, updated_at desc);
create index leads_company_created_idx
  on public.leads(company_id, created_at desc);
create index lead_activities_company_lead_created_idx
  on public.lead_activities(company_id, lead_id, created_at desc);
create index lead_stages_company_position_idx
  on public.lead_pipeline_stages(company_id, position);

create or replace function public.leadfesta_is_available(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and (
      coalesce(private.is_platform_owner(), false)
      or exists (
        select 1
        from public.company_members cm
        join private.company_feature_entitlements e
          on e.company_id = cm.company_id
         and e.feature_key = 'leadfesta'
         and e.enabled
        where cm.company_id = p_company_id
          and cm.user_id = (select auth.uid())
          and cm.role = 'admin'
      )
    );
$function$;
revoke all on function public.leadfesta_is_available(uuid) from public, anon;
grant execute on function public.leadfesta_is_available(uuid) to authenticated;

create or replace function public.can_access_leadfesta(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null and public.leadfesta_is_available(p_company_id);
$function$;
revoke all on function public.can_access_leadfesta(uuid) from public, anon;
grant execute on function public.can_access_leadfesta(uuid) to authenticated;

create or replace function public.get_leadfesta_entitlements()
returns table (
  company_id uuid,
  company_name text,
  enabled boolean,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(private.is_platform_owner(), false) then
    raise exception 'Somente o proprietário da plataforma pode consultar as ativações do LeadFesta.'
      using errcode = '42501';
  end if;

  return query
  select c.id, c.name, coalesce(e.enabled, false), e.updated_at, e.updated_by
  from public.companies c
  left join private.company_feature_entitlements e
    on e.company_id = c.id and e.feature_key = 'leadfesta'
  order by c.name;
end;
$function$;
revoke all on function public.get_leadfesta_entitlements() from public, anon;
grant execute on function public.get_leadfesta_entitlements() to authenticated;

create or replace function public.set_leadfesta_entitlement(
  p_company_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not coalesce(private.is_platform_owner(), false) then
    raise exception 'Somente o proprietário da plataforma pode ativar ou suspender o LeadFesta.'
      using errcode = '42501';
  end if;
  if p_company_id is null or p_enabled is null then
    raise exception 'Empresa e estado da ativação são obrigatórios.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;

  insert into private.company_feature_entitlements
    (company_id, feature_key, enabled, updated_by, updated_at)
  values (p_company_id, 'leadfesta', p_enabled, (select auth.uid()), now())
  on conflict (company_id, feature_key)
  do update set enabled = excluded.enabled,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at;
end;
$function$;
revoke all on function public.set_leadfesta_entitlement(uuid, boolean) from public, anon;
grant execute on function public.set_leadfesta_entitlement(uuid, boolean) to authenticated;

create or replace function private.create_default_leadfesta_stages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.lead_pipeline_stages (company_id, name, color, position, is_won, is_lost)
  values
    (new.id, 'Novo', '#8054d8', 0, false, false),
    (new.id, 'Em contato', '#4f8bd8', 1, false, false),
    (new.id, 'Qualificado', '#0d9488', 2, false, false),
    (new.id, 'Proposta enviada', '#d97706', 3, false, false),
    (new.id, 'Ganho', '#16a34a', 4, true, false),
    (new.id, 'Perdido', '#dc2626', 5, false, true);
  return new;
end;
$function$;
revoke all on function private.create_default_leadfesta_stages() from public, anon, authenticated;

create trigger companies_create_leadfesta_stages
after insert on public.companies
for each row execute function private.create_default_leadfesta_stages();

insert into public.lead_pipeline_stages (company_id, name, color, position, is_won, is_lost)
select c.id, s.name, s.color, s.position, s.is_won, s.is_lost
from public.companies c
cross join (values
  ('Novo', '#8054d8', 0, false, false),
  ('Em contato', '#4f8bd8', 1, false, false),
  ('Qualificado', '#0d9488', 2, false, false),
  ('Proposta enviada', '#d97706', 3, false, false),
  ('Ganho', '#16a34a', 4, true, false),
  ('Perdido', '#dc2626', 5, false, true)
) as s(name, color, position, is_won, is_lost)
on conflict (company_id, name) do nothing;

create or replace function private.guard_lead_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_lead_audit_fields() from public, anon, authenticated;

create trigger leads_guard_audit_fields
before insert or update on public.leads
for each row execute function private.guard_lead_audit_fields();

create trigger lead_activities_guard_audit_fields
before insert on public.lead_activities
for each row execute function private.guard_lead_audit_fields();

create or replace function private.guard_lead_customer_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.converted_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = new.converted_customer_id
      and c.company_id = new.company_id
  ) then
    raise exception 'O cliente convertido deve pertencer à mesma empresa do lead.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_lead_customer_company() from public, anon, authenticated;
create trigger leads_guard_customer_company
before insert or update of company_id, converted_customer_id on public.leads
for each row execute function private.guard_lead_customer_company();

create or replace function public.convert_lead_to_customer(
  p_company_id uuid,
  p_lead_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lead public.leads%rowtype;
  v_customer_id uuid;
begin
  if not public.can_access_leadfesta(p_company_id) then
    raise exception 'Você não tem acesso ao LeadFesta desta empresa.'
      using errcode = '42501';
  end if;

  select * into v_lead
  from public.leads l
  where l.id = p_lead_id and l.company_id = p_company_id
  for update;

  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;
  if v_lead.converted_customer_id is not null then
    return v_lead.converted_customer_id;
  end if;

  insert into public.customers (company_id, name, phone, email, notes)
  values (
    p_company_id,
    v_lead.name,
    v_lead.phone,
    v_lead.email,
    concat_ws(E'\n\n', nullif(v_lead.notes, ''), 'Origem: LeadFesta — ' || v_lead.source)
  )
  returning id into v_customer_id;

  update public.leads
  set converted_customer_id = v_customer_id, updated_at = now()
  where id = p_lead_id and company_id = p_company_id;

  insert into public.lead_activities (company_id, lead_id, activity_type, body)
  values (p_company_id, p_lead_id, 'conversion', 'Lead convertido em cliente no cadastro do KidsLoc.');

  return v_customer_id;
end;
$function$;
revoke all on function public.convert_lead_to_customer(uuid, uuid) from public, anon;
grant execute on function public.convert_lead_to_customer(uuid, uuid) to authenticated;

alter table public.lead_pipeline_stages enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;

revoke all on public.lead_pipeline_stages, public.leads, public.lead_activities from public, anon;
revoke all on public.leads, public.lead_activities from authenticated;
grant select, insert, update, delete on public.lead_pipeline_stages to authenticated;
grant select, insert, update on public.leads to authenticated;
grant select, insert on public.lead_activities to authenticated;

create policy lead_pipeline_stages_access
on public.lead_pipeline_stages for all to authenticated
using (public.can_access_leadfesta(company_id))
with check (public.can_access_leadfesta(company_id));

create policy leads_select_access
on public.leads for select to authenticated
using (public.can_access_leadfesta(company_id));

create policy leads_insert_access
on public.leads for insert to authenticated
with check (public.can_access_leadfesta(company_id));

create policy leads_update_access
on public.leads for update to authenticated
using (public.can_access_leadfesta(company_id))
with check (public.can_access_leadfesta(company_id));

-- Contact history is append-only. Prevent updates/deletes so the audit trail
-- survives ordinary CRM workflows and module suspension.
create policy lead_activities_select_access
on public.lead_activities for select to authenticated
using (public.can_access_leadfesta(company_id));

create policy lead_activities_insert_access
on public.lead_activities for insert to authenticated
with check (
  public.can_access_leadfesta(company_id)
  and exists (
    select 1 from public.leads l
    where l.id = lead_activities.lead_id and l.company_id = lead_activities.company_id
  )
);

create trigger lead_pipeline_stages_updated_at
before update on public.lead_pipeline_stages
for each row execute function public.set_updated_at();

create trigger leads_updated_at
before update on public.leads
for each row execute function public.set_updated_at();
