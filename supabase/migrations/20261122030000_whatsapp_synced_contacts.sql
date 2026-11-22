-- Store only the contacts explicitly requested through Coexistence contact sync.
-- These rows are an address-book cache, never leads and never marketing consent.
-- Removed contacts retain a minimal tombstone so out-of-order webhook events
-- cannot silently restore a contact that the business removed.
create table public.whatsapp_synced_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  phone_number text not null check (phone_number ~ '^[0-9]{8,20}$'),
  display_name text,
  is_deleted boolean not null default false,
  last_change_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, phone_number)
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
