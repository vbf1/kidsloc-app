-- Official WhatsApp Business Platform integration foundation.
-- Tokens are encrypted by Edge Functions and are never selectable by app users.

create table public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  provider text not null default 'meta' check (provider = 'meta'),
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connected', 'needs_attention')),
  business_id text,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  verified_name text,
  is_on_biz_app boolean not null default false,
  platform_type text,
  contacts_sync_status text not null default 'not_requested'
    check (contacts_sync_status in ('not_requested', 'requested', 'received', 'failed')),
  contacts_sync_request_id text,
  contacts_sync_requested_at timestamptz,
  history_sync_preference text not null default 'do_not_import'
    check (history_sync_preference in ('do_not_import', 'import')),
  history_sync_status text not null default 'not_requested'
    check (history_sync_status in ('not_requested', 'declined', 'unexpected_data_ignored')),
  connected_at timestamptz,
  last_webhook_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create unique index whatsapp_connections_waba_uidx
  on public.whatsapp_connections(waba_id) where waba_id is not null;
create unique index whatsapp_connections_phone_uidx
  on public.whatsapp_connections(phone_number_id) where phone_number_id is not null;

create table public.whatsapp_connection_secrets (
  company_id uuid primary key,
  token_ciphertext text not null,
  token_iv text not null,
  token_expires_at timestamptz,
  encryption_key_version text not null default 'v1',
  updated_at timestamptz not null default now(),
  constraint whatsapp_connection_secrets_company_fk
    foreign key (company_id)
    references public.whatsapp_connections(company_id)
    on delete cascade
);

create table public.whatsapp_automation_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  quote_created boolean not null default false,
  rental_confirmed boolean not null default false,
  contract_sent boolean not null default false,
  event_reminder boolean not null default false,
  payment_reminder boolean not null default false,
  payment_received boolean not null default false,
  reminder_days_before integer not null default 1
    check (reminder_days_before between 0 and 30),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.whatsapp_message_consents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  customer_name_snapshot text,
  consent_scopes text[] not null
    check (
      cardinality(consent_scopes) > 0
      and consent_scopes <@ array['utility', 'marketing']::text[]
    ),
  consent_source text not null
    check (consent_source in ('website', 'paper', 'in_person', 'phone', 'other')),
  consent_evidence text,
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, id)
);
create index whatsapp_consents_phone_idx
  on public.whatsapp_message_consents(company_id, phone_e164, consented_at desc);

create table public.whatsapp_message_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_key text not null check (event_key in (
    'quote_created', 'rental_confirmed', 'contract_sent',
    'event_reminder', 'payment_reminder', 'payment_received'
  )),
  template_name text not null check (template_name ~ '^[a-z0-9_]{1,512}$'),
  language text not null default 'pt_BR',
  category text not null check (category in ('utility', 'marketing', 'authentication')),
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected', 'paused', 'disabled')),
  active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, event_key, language),
  unique (company_id, template_name, language),
  unique (company_id, id)
);

create table public.whatsapp_message_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  recipient_phone text not null check (recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  recipient_name text,
  event_key text not null check (event_key in (
    'quote_created', 'rental_confirmed', 'contract_sent',
    'event_reminder', 'payment_reminder', 'payment_received'
  )),
  category text not null check (category in ('utility', 'marketing')),
  template_name text not null,
  language text not null default 'pt_BR',
  template_variables jsonb not null default '[]'::jsonb
    check (jsonb_typeof(template_variables) = 'array'),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  meta_message_id text,
  error_code text,
  error_message text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  idempotency_key text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, idempotency_key),
  unique (company_id, meta_message_id)
);
create index whatsapp_outbox_queue_idx
  on public.whatsapp_message_outbox(status, scheduled_at)
  where status in ('queued', 'failed');
create index whatsapp_outbox_company_created_idx
  on public.whatsapp_message_outbox(company_id, created_at desc);

create table public.whatsapp_message_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  outbox_id uuid not null,
  direction text not null default 'outgoing' check (direction = 'outgoing'),
  recipient_phone text not null,
  event_key text not null,
  category text not null check (category in ('utility', 'marketing')),
  template_name text not null,
  status text not null check (status in ('sent', 'delivered', 'read', 'failed')),
  meta_message_id text,
  error_code text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint whatsapp_message_logs_outbox_fk
    foreign key (company_id, outbox_id)
    references public.whatsapp_message_outbox(company_id, id)
    on delete cascade
);
create index whatsapp_message_logs_company_created_idx
  on public.whatsapp_message_logs(company_id, created_at desc);

create table public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  waba_id text,
  event_key text not null unique,
  event_type text not null,
  payload_summary jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

-- RLS is enabled on every public table. App users receive only the minimum
-- privileges needed for administrator screens; service_role owns automation.
alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_connection_secrets enable row level security;
alter table public.whatsapp_automation_settings enable row level security;
alter table public.whatsapp_message_consents enable row level security;
alter table public.whatsapp_message_templates enable row level security;
alter table public.whatsapp_message_outbox enable row level security;
alter table public.whatsapp_message_logs enable row level security;
alter table public.whatsapp_webhook_events enable row level security;

revoke all privileges on table
  public.whatsapp_connections,
  public.whatsapp_connection_secrets,
  public.whatsapp_automation_settings,
  public.whatsapp_message_consents,
  public.whatsapp_message_templates,
  public.whatsapp_message_outbox,
  public.whatsapp_message_logs,
  public.whatsapp_webhook_events
from public, anon, authenticated;

grant select, insert, update on table
  public.whatsapp_connections,
  public.whatsapp_automation_settings,
  public.whatsapp_message_consents,
  public.whatsapp_message_templates
to authenticated;
grant select on table
  public.whatsapp_message_outbox,
  public.whatsapp_message_logs
to authenticated;

grant all privileges on table
  public.whatsapp_connections,
  public.whatsapp_connection_secrets,
  public.whatsapp_automation_settings,
  public.whatsapp_message_consents,
  public.whatsapp_message_templates,
  public.whatsapp_message_outbox,
  public.whatsapp_message_logs,
  public.whatsapp_webhook_events
to service_role;

create policy whatsapp_connections_admin_select
  on public.whatsapp_connections for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin']::text[]));
create policy whatsapp_connections_admin_insert
  on public.whatsapp_connections for insert to authenticated
  with check (public.has_company_role(company_id, array['owner', 'admin']::text[]));
create policy whatsapp_connections_admin_update
  on public.whatsapp_connections for update to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin']::text[]))
  with check (public.has_company_role(company_id, array['owner', 'admin']::text[]));

create policy whatsapp_automation_admin_select
  on public.whatsapp_automation_settings for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin']::text[]));
create policy whatsapp_automation_admin_insert
  on public.whatsapp_automation_settings for insert to authenticated
  with check (public.has_company_role(company_id, array['owner', 'admin']::text[]));
create policy whatsapp_automation_admin_update
  on public.whatsapp_automation_settings for update to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin']::text[]))
  with check (public.has_company_role(company_id, array['owner', 'admin']::text[]));

create policy whatsapp_consents_admin_select
  on public.whatsapp_message_consents for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin']::text[]));
create policy whatsapp_consents_admin_insert
  on public.whatsapp_message_consents for insert to authenticated
  with check (public.has_company_role(company_id, array['owner', 'admin']::text[]));
create policy whatsapp_consents_admin_update
  on public.whatsapp_message_consents for update to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin']::text[]))
  with check (public.has_company_role(company_id, array['owner', 'admin']::text[]));

create policy whatsapp_templates_admin_select
  on public.whatsapp_message_templates for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin']::text[]));
create policy whatsapp_templates_admin_insert
  on public.whatsapp_message_templates for insert to authenticated
  with check (public.has_company_role(company_id, array['owner', 'admin']::text[]));
create policy whatsapp_templates_admin_update
  on public.whatsapp_message_templates for update to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin']::text[]))
  with check (public.has_company_role(company_id, array['owner', 'admin']::text[]));

create policy whatsapp_outbox_admin_select
  on public.whatsapp_message_outbox for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin']::text[]));
create policy whatsapp_logs_admin_select
  on public.whatsapp_message_logs for select to authenticated
  using (public.has_company_role(company_id, array['owner', 'admin']::text[]));

-- Secrets and webhook receipts have no authenticated/anon policies or grants.
