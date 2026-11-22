-- Enforce the user's explicit privacy choice at the database layer.
-- Historical WhatsApp conversations must never be imported for this integration.
update public.whatsapp_connections
set history_sync_preference = 'do_not_import'
where history_sync_preference <> 'do_not_import';

alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_history_sync_preference_check;

alter table public.whatsapp_connections
  add constraint whatsapp_connections_history_sync_preference_check
  check (history_sync_preference = 'do_not_import');
