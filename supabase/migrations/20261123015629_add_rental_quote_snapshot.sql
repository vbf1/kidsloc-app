alter table public.rental_quotes
  add column if not exists quote_snapshot jsonb not null default '{}'::jsonb;
