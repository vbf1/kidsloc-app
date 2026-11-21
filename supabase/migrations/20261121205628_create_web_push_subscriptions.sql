-- Web Push subscriptions for authenticated company members.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_company_user_idx
  on public.push_subscriptions(company_id, user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
drop policy if exists "Members read own web push subscriptions" on public.push_subscriptions;
create policy "Members read own web push subscriptions"
on public.push_subscriptions for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.company_members cm
    where cm.company_id = push_subscriptions.company_id and cm.user_id = (select auth.uid()))
);
drop policy if exists "Members insert own web push subscriptions" on public.push_subscriptions;
create policy "Members insert own web push subscriptions"
on public.push_subscriptions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.company_members cm
    where cm.company_id = push_subscriptions.company_id and cm.user_id = (select auth.uid()))
);
drop policy if exists "Members update own web push subscriptions" on public.push_subscriptions;
create policy "Members update own web push subscriptions"
on public.push_subscriptions for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.company_members cm
    where cm.company_id = push_subscriptions.company_id and cm.user_id = (select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.company_members cm
    where cm.company_id = push_subscriptions.company_id and cm.user_id = (select auth.uid()))
);
drop policy if exists "Members delete own web push subscriptions" on public.push_subscriptions;
create policy "Members delete own web push subscriptions"
on public.push_subscriptions for delete to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.company_members cm
    where cm.company_id = push_subscriptions.company_id and cm.user_id = (select auth.uid()))
);
