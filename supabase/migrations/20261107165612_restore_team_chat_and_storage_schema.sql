create table if not exists public.team_conversations (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 conversation_type text not null check (conversation_type in ('team','direct')),
 title text,
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index if not exists team_conversations_company_created_idx on public.team_conversations(company_id, created_at desc);
alter table public.team_conversations enable row level security;
grant select, insert on public.team_conversations to authenticated;
drop policy if exists team_conversations_insert_creator on public.team_conversations;
create policy team_conversations_insert_creator on public.team_conversations
 for insert to authenticated with check (public.is_company_member(company_id) and created_by=(select auth.uid()));

create table if not exists public.team_conversation_members (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.team_conversations(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique (conversation_id,user_id)
);
create index if not exists team_conversation_members_company_user_idx on public.team_conversation_members(company_id,user_id);
alter table public.team_conversation_members enable row level security;
grant select, insert, delete on public.team_conversation_members to authenticated;
drop policy if exists team_members_insert_creator on public.team_conversation_members;
create policy team_members_insert_creator on public.team_conversation_members
 for insert to authenticated with check (
  public.is_company_member(company_id)
  and exists(select 1 from public.company_members cm where cm.company_id=team_conversation_members.company_id and cm.user_id=team_conversation_members.user_id)
  and exists(select 1 from public.team_conversations c where c.id=team_conversation_members.conversation_id and c.company_id=team_conversation_members.company_id and c.created_by=(select auth.uid()))
 );
drop policy if exists team_members_delete_creator on public.team_conversation_members;
create policy team_members_delete_creator on public.team_conversation_members
 for delete to authenticated using (
  public.is_company_member(company_id)
  and exists(select 1 from public.team_conversations c where c.id=team_conversation_members.conversation_id and c.company_id=team_conversation_members.company_id and c.created_by=(select auth.uid()))
 );

create table if not exists public.team_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.team_conversations(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 body text not null check (char_length(body) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index if not exists team_messages_conversation_created_idx on public.team_messages(conversation_id,created_at);
alter table public.team_messages enable row level security;
grant select, insert on public.team_messages to authenticated;

create or replace function private.is_team_conversation_member(p_conversation_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from public.team_conversation_members m
  where m.conversation_id=p_conversation_id and m.user_id=(select auth.uid())
 );
$$;
revoke all on function private.is_team_conversation_member(uuid) from public,anon;
grant execute on function private.is_team_conversation_member(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
 ('product-images','product-images',false,8388608,array['image/jpeg','image/png','image/webp']),
 ('company-branding','company-branding',true,5242880,array['image/jpeg','image/png'])
on conflict(id) do update set
 public=excluded.public,
 file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists company_branding_upload_owner_admin on storage.objects;
create policy company_branding_upload_owner_admin on storage.objects
 for insert to authenticated with check (
  bucket_id='company-branding'
  and public.has_company_role(((storage.foldername(name))[1])::uuid,array['owner','admin']::text[])
 );
drop policy if exists company_branding_update_owner_admin on storage.objects;
create policy company_branding_update_owner_admin on storage.objects
 for update to authenticated using (
  bucket_id='company-branding'
  and public.has_company_role(((storage.foldername(name))[1])::uuid,array['owner','admin']::text[])
 ) with check (
  bucket_id='company-branding'
  and public.has_company_role(((storage.foldername(name))[1])::uuid,array['owner','admin']::text[])
 );
drop policy if exists company_branding_delete_owner_admin on storage.objects;
create policy company_branding_delete_owner_admin on storage.objects
 for delete to authenticated using (
  bucket_id='company-branding'
  and public.has_company_role(((storage.foldername(name))[1])::uuid,array['owner','admin']::text[])
 );
