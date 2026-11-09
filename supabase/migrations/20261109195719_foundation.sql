-- KidsLoc foundation baseline for a fresh Supabase environment.
-- This migration mirrors only the existing foundation schema used by Auth and
-- company onboarding. It does not alter the connected production database.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  contract_settings jsonb not null default '{}'::jsonb,
  contract_logo_url text
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff'
    check (role = any (array['owner', 'admin', 'manager', 'staff']::text[])),
  created_at timestamptz not null default now(),
  constraint company_members_company_id_user_id_key unique (company_id, user_id)
);

create index if not exists idx_members_user on public.company_members(user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Preserve platform-owner access on projects that already define the
-- private helper, while allowing this foundation to run on a clean local DB.
create or replace function public.is_platform_owner_for_company()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_platform_owner boolean := false;
begin
  if to_regprocedure('private.is_platform_owner()') is not null then
    execute 'select private.is_platform_owner()'
      into v_is_platform_owner;
  end if;
  return coalesce(v_is_platform_owner, false);
end;
$$;

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_owner_for_company()
    or exists (
      select 1
      from public.company_members m
      where m.company_id = p_company_id
        and m.user_id = (select auth.uid())
    );
$$;

create or replace function public.has_company_role(p_company_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
      public.is_platform_owner_for_company()
      and 'owner' = any (p_roles)
    )
    or exists (
      select 1
      from public.company_members m
      where m.company_id = p_company_id
        and m.user_id = (select auth.uid())
        and m.role = any (p_roles)
    );
$$;

create or replace function public.create_company(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
begin
  if v_user_id is null then
    raise exception 'É necessário estar autenticado.'
      using errcode = '28000';
  end if;

  if length(v_name) < 2 or length(v_name) > 160 then
    raise exception 'Nome da empresa inválido.'
      using errcode = '22023';
  end if;

  -- Serialize onboarding attempts for the same account to prevent races.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if exists (
    select 1
    from public.company_members
    where user_id = v_user_id
  ) then
    raise exception 'Esta conta já está vinculada a uma empresa.'
      using errcode = '23505';
  end if;

  insert into public.companies (name, created_by)
  values (v_name, v_user_id)
  returning id into v_company_id;

  insert into public.company_members (company_id, user_id, role)
  values (v_company_id, v_user_id, 'owner');

  return v_company_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;

drop policy if exists profile_select_self on public.profiles;
create policy profile_select_self on public.profiles
for select to authenticated
using (id = (select auth.uid()));

drop policy if exists profile_update_self on public.profiles;
create policy profile_update_self on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists profiles_select_company_members on public.profiles;
create policy profiles_select_company_members on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.company_members cm
    where cm.user_id = profiles.id
      and public.is_company_member(cm.company_id)
  )
);

drop policy if exists company_select_members on public.companies;
create policy company_select_members on public.companies
for select to authenticated
using (public.is_company_member(id));

drop policy if exists company_update_admins on public.companies;
create policy company_update_admins on public.companies
for update to authenticated
using (public.has_company_role(id, array['owner', 'admin']::text[]))
with check (public.has_company_role(id, array['owner', 'admin']::text[]));

drop policy if exists members_select_same_company on public.company_members;
create policy members_select_same_company on public.company_members
for select to authenticated
using (public.is_company_member(company_id));

-- RLS governs normal row access. Do not grant TRUNCATE, REFERENCES or TRIGGER
-- to client roles because those privileges are not protected by row policies.
revoke all on public.profiles, public.companies, public.company_members from anon;
revoke all on public.profiles, public.companies, public.company_members from authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.company_members to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_platform_owner_for_company() from public, anon, authenticated;
revoke all on function public.is_company_member(uuid) from public, anon;
revoke all on function public.has_company_role(uuid, text[]) from public, anon;
revoke all on function public.create_company(text) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.has_company_role(uuid, text[]) to authenticated;
grant execute on function public.create_company(text) to authenticated;
