-- ============================================================
-- BRINQUE APP | Banco inicial multiusuário (Supabase/PostgreSQL)
-- Execute uma única vez no SQL Editor do projeto Supabase.
-- ============================================================

create extension if not exists pgcrypto;

-- 1) PERFIS E EMPRESAS
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
  updated_at timestamptz not null default now()
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff'
    check (role in ('owner','admin','manager','staff')),
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

-- 2) FUNÇÕES DE APOIO E AUTENTICAÇÃO
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_company_role(
  p_company_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.role = any(p_roles)
  );
$$;

-- O primeiro usuário autenticado cria a empresa e vira proprietário.
create or replace function public.create_company(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'É necessário estar autenticado.';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Informe o nome da empresa.';
  end if;

  if exists (
    select 1 from public.company_members
    where user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Este usuário já possui uma empresa como proprietário.';
  end if;

  insert into public.companies (name, created_by)
  values (trim(p_name), auth.uid())
  returning id into v_company_id;

  insert into public.company_members (company_id, user_id, role)
  values (v_company_id, auth.uid(), 'owner');

  return v_company_id;
end;
$$;

-- Depois de convidar/criar o usuário em Authentication > Users,
-- o proprietário/admin pode vinculá-lo à empresa por esta função.
create or replace function public.add_company_member(
  p_company_id uuid,
  p_user_id uuid,
  p_role text default 'staff'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_company_role(p_company_id, array['owner','admin']) then
    raise exception 'Sem permissão para gerenciar usuários desta empresa.';
  end if;

  if p_role not in ('admin','manager','staff') then
    raise exception 'Perfil inválido. O perfil owner não pode ser atribuído por esta função.';
  end if;

  if public.has_company_role(p_company_id, array['admin'])
     and not public.has_company_role(p_company_id, array['owner'])
     and p_role = 'admin' then
    raise exception 'Somente o proprietário pode promover outro administrador.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Usuário não encontrado em Authentication.';
  end if;

  insert into public.company_members (company_id, user_id, role)
  values (p_company_id, p_user_id, p_role)
  on conflict (company_id, user_id)
  do update set role = excluded.role;
end;
$$;

-- 3) CLIENTES
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) BRINQUEDOS / PRODUTOS
-- inventory_mode = 'quantity' para controle por quantidade
-- inventory_mode = 'individual' para controle por unidade identificada.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  inventory_mode text not null default 'quantity'
    check (inventory_mode in ('quantity','individual')),
  total_quantity integer not null default 1 check (total_quantity >= 0),
  daily_price numeric(12,2) not null default 0 check (daily_price >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  asset_code text,
  description text,
  status text not null default 'available'
    check (status in ('available','maintenance','inactive')),
  created_at timestamptz not null default now(),
  unique (product_id, asset_code)
);

-- 5) LOCAÇÕES E ITENS
create table if not exists public.rentals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  rental_number bigint generated by default as identity,
  start_date date not null,
  end_date date not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','ongoing','completed','cancelled')),
  delivery_method text not null default 'delivery'
    check (delivery_method in ('delivery','customer_pickup')),
  delivery_address text,
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  deposit_amount numeric(12,2) not null default 0 check (deposit_amount >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (company_id, rental_number)
);

create table if not exists public.rental_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.rental_item_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rental_item_id uuid not null references public.rental_items(id) on delete cascade,
  product_unit_id uuid not null references public.product_units(id),
  created_at timestamptz not null default now(),
  unique (rental_item_id, product_unit_id)
);

create table if not exists public.rental_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  event_type text not null,
  description text,
  event_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- 6) ESTOQUE E MANUTENÇÃO
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id),
  movement_type text not null
    check (movement_type in ('entry','exit','adjustment','maintenance')),
  quantity integer not null check (quantity > 0),
  reason text,
  movement_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_unit_id uuid references public.product_units(id) on delete set null,
  status text not null default 'open'
    check (status in ('open','in_progress','completed','cancelled')),
  description text not null,
  started_at date not null default current_date,
  completed_at date,
  cost numeric(12,2) not null default 0 check (cost >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7) FINANCEIRO
create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rental_id uuid references public.rentals(id) on delete set null,
  transaction_type text not null
    check (transaction_type in ('income','expense')),
  category text,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_date date,
  paid_at date,
  payment_method text,
  status text not null default 'pending'
    check (status in ('pending','paid','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rental_id uuid references public.rentals(id) on delete set null,
  transaction_id uuid references public.financial_transactions(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text,
  paid_at timestamptz not null default now(),
  notes text,
  created_by uuid references auth.users(id) on delete set null
);

-- 8) CONTRATOS / RECIBOS (metadados; arquivos podem ficar no Supabase Storage)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rental_id uuid references public.rentals(id) on delete set null,
  document_type text not null
    check (document_type in ('contract','receipt','other')),
  file_path text,
  file_name text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- 9) ÍNDICES
create index if not exists idx_members_user on public.company_members(user_id);
create index if not exists idx_customers_company on public.customers(company_id);
create index if not exists idx_products_company on public.products(company_id);
create index if not exists idx_units_product on public.product_units(product_id);
create index if not exists idx_rentals_company_dates on public.rentals(company_id, start_date, end_date);
create index if not exists idx_rentals_customer on public.rentals(customer_id);
create index if not exists idx_rental_items_rental on public.rental_items(rental_id);
create index if not exists idx_finance_company_date on public.financial_transactions(company_id, due_date);
create index if not exists idx_maintenance_company on public.maintenance_records(company_id);

-- 10) UPDATED_AT AUTOMÁTICO
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','companies','customers','products','rentals',
    'maintenance_records','financial_transactions'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t
    );
  end loop;
end $$;

-- 11) ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.product_units enable row level security;
alter table public.rentals enable row level security;
alter table public.rental_items enable row level security;
alter table public.rental_item_units enable row level security;
alter table public.rental_events enable row level security;
alter table public.stock_movements enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.payments enable row level security;
alter table public.documents enable row level security;

-- Perfis: cada usuário lê/edita apenas seu próprio perfil.
drop policy if exists "profile_select_self" on public.profiles;
create policy "profile_select_self" on public.profiles
for select to authenticated using (id = auth.uid());
drop policy if exists "profile_update_self" on public.profiles;
create policy "profile_update_self" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Empresas e membros.
drop policy if exists "company_select_members" on public.companies;
create policy "company_select_members" on public.companies
for select to authenticated using (public.is_company_member(id));
drop policy if exists "company_update_admins" on public.companies;
create policy "company_update_admins" on public.companies
for update to authenticated
using (public.has_company_role(id, array['owner','admin']))
with check (public.has_company_role(id, array['owner','admin']));

drop policy if exists "members_select_same_company" on public.company_members;
create policy "members_select_same_company" on public.company_members
for select to authenticated using (public.is_company_member(company_id));

-- Políticas padrão para dados operacionais: membros podem ler e operar.
-- Gestão de usuários e da empresa permanece restrita pelas políticas acima.
do $$
declare t text;
begin
  foreach t in array array[
    'customers','products','product_units','rentals','rental_items',
    'rental_item_units','rental_events','stock_movements',
    'maintenance_records','financial_transactions','payments','documents'
  ] loop
    execute format('drop policy if exists "company_members_all" on public.%I', t);
    execute format(
      'create policy "company_members_all" on public.%I
       for all to authenticated
       using (public.is_company_member(company_id))
       with check (public.is_company_member(company_id))', t
    );
  end loop;
end $$;

-- 12) PERMISSÕES DE EXECUÇÃO DAS FUNÇÕES
revoke all on function public.create_company(text) from public;
grant execute on function public.create_company(text) to authenticated;

revoke all on function public.add_company_member(uuid, uuid, text) from public;
grant execute on function public.add_company_member(uuid, uuid, text) to authenticated;

revoke all on function public.is_company_member(uuid) from public;
grant execute on function public.is_company_member(uuid) to authenticated;

revoke all on function public.has_company_role(uuid, text[]) from public;
grant execute on function public.has_company_role(uuid, text[]) to authenticated;


-- 13) PERMISSÕES PARA A API DO SUPABASE
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.companies, public.company_members,
  public.customers, public.products, public.product_units,
  public.rentals, public.rental_items, public.rental_item_units,
  public.rental_events, public.stock_movements,
  public.maintenance_records, public.financial_transactions,
  public.payments, public.documents
to authenticated;

-- FIM: após executar, crie a empresa chamando create_company()
-- a partir do app autenticado. Não compartilhe service_role ou senha do banco.
