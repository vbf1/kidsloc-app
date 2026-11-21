create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

create or replace function public.get_brq_push_secret(p_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.name = p_name
  limit 1;
$$;

revoke all on function public.get_brq_push_secret(text) from public, anon, authenticated;
grant execute on function public.get_brq_push_secret(text) to service_role;

create or replace function public.initialize_brq_push_secrets(
  p_vapid_private text,
  p_vapid_public text,
  p_webhook_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from vault.secrets where name = 'brinque_push_vapid_private') then
    perform vault.create_secret(p_vapid_private, 'brinque_push_vapid_private', 'KidsLoc web push VAPID private key');
  end if;
  if not exists (select 1 from vault.secrets where name = 'brinque_push_vapid_public') then
    perform vault.create_secret(p_vapid_public, 'brinque_push_vapid_public', 'KidsLoc web push VAPID public key');
  end if;
  if not exists (select 1 from vault.secrets where name = 'brinque_push_webhook_secret') then
    perform vault.create_secret(p_webhook_secret, 'brinque_push_webhook_secret', 'KidsLoc scheduled push webhook authentication');
  end if;
end;
$$;

revoke all on function public.initialize_brq_push_secrets(text,text,text) from public, anon, authenticated;
grant execute on function public.initialize_brq_push_secrets(text,text,text) to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'brinque_push_webhook_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'brinque_push_webhook_secret', 'KidsLoc scheduled push webhook authentication');
  end if;
end;
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'kidsloc-event-reminders-hourly';

select cron.schedule(
  'kidsloc-event-reminders-hourly',
  '0 * * * *',
  $job$
    select net.http_post(
      url := 'https://wfwohnssvftegnhwdzmt.supabase.co/functions/v1/send-employee-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-brinque-webhook-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'brinque_push_webhook_secret')
      ),
      body := '{"action":"event_reminders"}'::jsonb
    );
  $job$
);
