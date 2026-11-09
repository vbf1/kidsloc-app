-- KidsLoc App | Foundation migration
-- Multi-tenant foundation. Apply to a disposable development project first.
create extension if not exists pgcrypto with schema extensions;

create type public.company_role as enum ('administrador', 'operador', 'financeiro');
create type public.company_status as enum ('ativa', 'suspensa', 'cancelada');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  legal_name text,
  document_number text,
  email text,
  phone text,
  whatsapp text,
  address jsonb not null default '{}'::jsonb,
  logo_path text,
  status public.company_status not null default 'ativa',
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_users (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.company_role not null default 'operador',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index company_users_user_idx on public.company_users(user_id, is_active);
-- MVP rule: one active company per account (multi-company is out of scope).
create unique index company_users_one_active_company_per_user_idx
  on public.company_users(user_id) where is_active = true;
create index companies_status_idx on public.companies(status);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger companies_set_updated_at before update on public.companies
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Transactional tenant onboarding: the authenticated creator becomes the first admin.
create or replace function public.create_company(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória' using errcode = '28000';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(trim(p_name)) > 160 then
    raise exception 'Nome da empresa inválido' using errcode = '22023';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*
  values (trim(p_name), p_slug)
  returning id into v_company_id;

  insert into public.company_users (company_id, user_id, role)
  values (v_company_id, v_user_id, 'administrador');

  return v_company_id;
end;
$$;

create or replace function public.is_company_member(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_users cu
    join public.companies c on c.id = cu.company_id
    where cu.company_id = p_company_id
      and cu.user_id = (select auth.uid())
      and cu.is_active = true
      and c.status = 'ativa'
  );
$$;

create or replace function public.has_company_role(p_company_id uuid, p_roles public.company_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_users cu
    join public.companies c on c.id = cu.company_id
    where cu.company_id = p_company_id
      and cu.user_id = (select auth.uid())
      and cu.is_active = true
      and c.status = 'ativa'
      and cu.role = any(p_roles)
  );
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_users enable row level security;

-- A pessoa pode consultar/editar somente o próprio perfil.
create policy profiles_select_self on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles
for update to authenticated using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Membros ativos podem consultar os dados básicos da própria empresa.
create policy companies_select_members on public.companies
for select to authenticated using (public.is_company_member(id));
create policy companies_update_admin on public.companies
for update to authenticated using (public.has_company_role(id, array['administrador']::public.company_role[]))
with check (public.has_company_role(id, array['administrador']::public.company_role[]));

create policy company_users_select_members on public.company_users
for select to authenticated using (public.is_company_member(company_id));
create policy company_users_admin_manage on public.company_users
for all to authenticated
using (public.has_company_role(company_id, array['administrador']::public.company_role[]))
with check (public.has_company_role(company_id, array['administrador']::public.company_role[]));

-- Restringe execução das funções auxiliares a usuários autenticados.
revoke all on function public.create_company(text, text) from public;
grant execute on function public.create_company(text, text) to authenticated;
revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.has_company_role(uuid, public.company_role[]) from public;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.has_company_role(uuid, public.company_role[]) to authenticated;

-- Authenticated clients may read/update their own profile. Company creation is
-- intentionally limited to the transactional onboarding function above.
grant select, update on public.profiles to authenticated;
grant select, update on public.companies to authenticated;
grant select, insert, update, delete on public.company_users to authenticated;
 then
    raise exception 'Identificador da empresa inválido' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.company_users
    where user_id = v_user_id and is_active = true
  ) then
    raise exception 'Esta conta já está vinculada a uma empresa' using errcode = '23505';
  end if;

  insert into public.companies (name, slug)
  values (trim(p_name), p_slug)
  returning id into v_company_id;

  insert into public.company_users (company_id, user_id, role)
  values (v_company_id, v_user_id, 'administrador');

  return v_company_id;
end;
$$;

create or replace function public.is_company_member(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_users cu
    join public.companies c on c.id = cu.company_id
    where cu.company_id = p_company_id
      and cu.user_id = (select auth.uid())
      and cu.is_active = true
      and c.status = 'ativa'
  );
$$;

create or replace function public.has_company_role(p_company_id uuid, p_roles public.company_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_users cu
    join public.companies c on c.id = cu.company_id
    where cu.company_id = p_company_id
      and cu.user_id = (select auth.uid())
      and cu.is_active = true
      and c.status = 'ativa'
      and cu.role = any(p_roles)
  );
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_users enable row level security;

-- A pessoa pode consultar/editar somente o próprio perfil.
create policy profiles_select_self on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles
for update to authenticated using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Membros ativos podem consultar os dados básicos da própria empresa.
create policy companies_select_members on public.companies
for select to authenticated using (public.is_company_member(id));
create policy companies_update_admin on public.companies
for update to authenticated using (public.has_company_role(id, array['administrador']::public.company_role[]))
with check (public.has_company_role(id, array['administrador']::public.company_role[]));

create policy company_users_select_members on public.company_users
for select to authenticated using (public.is_company_member(company_id));
create policy company_users_admin_manage on public.company_users
for all to authenticated
using (public.has_company_role(company_id, array['administrador']::public.company_role[]))
with check (public.has_company_role(company_id, array['administrador']::public.company_role[]));

-- Restringe execução das funções auxiliares a usuários autenticados.
revoke all on function public.create_company(text, text) from public;
grant execute on function public.create_company(text, text) to authenticated;
revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.has_company_role(uuid, public.company_role[]) from public;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.has_company_role(uuid, public.company_role[]) to authenticated;

-- Authenticated clients may read/update their own profile. Company creation is
-- intentionally limited to the transactional onboarding function above.
grant select, update on public.profiles to authenticated;
grant select, update on public.companies to authenticated;
grant select, insert, update, delete on public.company_users to authenticated;
