-- Store only contacts explicitly requested through Coexistence contact sync.
-- This is an address-book cache, never leads and never marketing consent.
-- A keyed contact fingerprint preserves ordering for removals without retaining
-- the removed person's phone number or name.
create table public.whatsapp_synced_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_key text not null check (contact_key ~ '^[0-9a-f]{64}$'),
  phone_number text check (phone_number is null or phone_number ~ '^[0-9]{8,20}$'),
  display_name text,
  is_deleted boolean not null default false,
  last_change_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, contact_key),
  check (
    (is_deleted = false and phone_number is not null)
    or (is_deleted = true and phone_number is null and display_name is null)
  )
);
create index whatsapp_synced_contacts_company_name_idx
  on public.whatsapp_synced_contacts(company_id, display_name)
  where is_deleted = false;

alter table public.whatsapp_synced_contacts enable row level security;
revoke all privileges on table public.whatsapp_synced_contacts from public, anon, authenticated;
grant select on table public.whatsapp_synced_contacts to authenticated;
grant all privileges on table public.whatsapp_synced_contacts to service_role;
create policy whatsapp_synced_contacts_admin_select
  on public.whatsapp_synced_contacts for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin']::text[]));
