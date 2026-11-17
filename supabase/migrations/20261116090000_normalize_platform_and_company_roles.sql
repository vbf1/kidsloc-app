-- KidsLoc role model:
-- one platform owner, and only admin/staff memberships inside each company.
-- Existing company owners are preserved as company administrators.

alter table private.platform_owners
  add column if not exists singleton boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'private.platform_owners'::regclass
      and conname = 'platform_owners_singleton_check'
  ) then
    alter table private.platform_owners
      add constraint platform_owners_singleton_check check (singleton is true);
  end if;
end;
$$;

create unique index if not exists platform_owners_singleton_uidx
  on private.platform_owners (singleton);

alter table public.company_members
  drop constraint if exists company_members_role_check;

update public.company_members
set role = 'admin'
where role = 'owner';

update public.company_members
set role = 'staff'
where role = 'manager';

alter table public.company_members
  add constraint company_members_role_check
  check (role = any (array['admin', 'staff']::text[]));

create or replace function public.create_company(p_name text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if exists (
    select 1 from public.company_members where user_id = v_user_id
  ) then
    raise exception 'Esta conta já está vinculada a uma empresa.'
      using errcode = '23505';
  end if;

  insert into public.companies (name, created_by)
  values (v_name, v_user_id)
  returning id into v_company_id;

  insert into public.company_members (company_id, user_id, role)
  values (v_company_id, v_user_id, 'admin');

  return v_company_id;
end;
$function$;

create or replace function public.add_company_member(
  p_company_id uuid,
  p_user_id uuid,
  p_role text default 'staff'
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_existing_role text;
  v_actor_is_platform_owner boolean := private.is_platform_owner();
  v_actor_is_admin boolean;
begin
  v_actor_is_admin := public.has_company_role(p_company_id, array['admin']::text[]);

  if not (v_actor_is_platform_owner or v_actor_is_admin) then
    raise exception 'Sem permissão para gerenciar usuários desta empresa.';
  end if;

  if p_role not in ('admin', 'staff') then
    raise exception 'Perfil inválido. Use Administrador ou Funcionário.';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Usuário não encontrado em Authentication.';
  end if;

  select cm.role into v_existing_role
  from public.company_members cm
  where cm.company_id = p_company_id and cm.user_id = p_user_id
  for update;

  if v_actor_is_admin and not v_actor_is_platform_owner then
    if p_role = 'admin' then
      raise exception 'Somente o proprietário da plataforma pode atribuir outro administrador.';
    end if;
    if v_existing_role = 'admin' then
      raise exception 'O administrador da empresa não pode alterar o próprio perfil administrativo.';
    end if;
    if v_existing_role is not null and v_existing_role <> 'staff' then
      raise exception 'Administradores só podem gerenciar funcionários.';
    end if;
  end if;

  insert into public.company_members (company_id, user_id, role)
  values (p_company_id, p_user_id, p_role)
  on conflict (company_id, user_id)
  do update set role = excluded.role;
end;
$function$;

-- Company admins, not a separate company-owner role, administer team chat.
drop policy if exists team_members_delete_owner on public.team_conversation_members;
create policy team_members_delete_admin
on public.team_conversation_members
for delete to authenticated
using (
  not private.is_platform_owner()
  and is_company_member(company_id)
  and has_company_role(company_id, array['admin']::text[])
  and exists (
    select 1 from public.team_conversations c
    where c.id = team_conversation_members.conversation_id
      and c.company_id = team_conversation_members.company_id
  )
);

drop policy if exists team_members_insert_creator_or_owner on public.team_conversation_members;
create policy team_members_insert_creator_or_admin
on public.team_conversation_members
for insert to authenticated
with check (
  not private.is_platform_owner()
  and is_company_member(company_id)
  and exists (
    select 1 from public.company_members cm
    where cm.company_id = team_conversation_members.company_id
      and cm.user_id = team_conversation_members.user_id
  )
  and exists (
    select 1 from public.team_conversations c
    where c.id = team_conversation_members.conversation_id
      and c.company_id = team_conversation_members.company_id
      and (
        c.created_by = (select auth.uid())
        or has_company_role(team_conversation_members.company_id, array['admin']::text[])
      )
  )
);

drop policy if exists team_members_select_participants on public.team_conversation_members;
create policy team_members_select_participants
on public.team_conversation_members
for select to authenticated
using (
  not private.is_platform_owner()
  and is_company_member(company_id)
  and (
    private.is_team_conversation_member(conversation_id)
    or has_company_role(company_id, array['admin']::text[])
  )
);

drop policy if exists team_conversations_select on public.team_conversations;
create policy team_conversations_select
on public.team_conversations
for select to authenticated
using (
  not private.is_platform_owner()
  and is_company_member(company_id)
  and (
    created_by = (select auth.uid())
    or private.is_team_conversation_member(id)
    or has_company_role(company_id, array['admin']::text[])
  )
);

drop policy if exists team_messages_insert_participant on public.team_messages;
create policy team_messages_insert_participant
on public.team_messages
for insert to authenticated
with check (
  not private.is_platform_owner()
  and sender_id = (select auth.uid())
  and is_company_member(company_id)
  and char_length(body) between 1 and 4000
  and (
    exists (
      select 1 from public.team_conversation_members m
      where m.conversation_id = team_messages.conversation_id
        and m.user_id = (select auth.uid())
        and m.company_id = team_messages.company_id
    )
    or has_company_role(company_id, array['admin']::text[])
  )
);

drop policy if exists team_messages_select_participant on public.team_messages;
create policy team_messages_select_participant
on public.team_messages
for select to authenticated
using (
  not private.is_platform_owner()
  and is_company_member(company_id)
  and (
    exists (
      select 1 from public.team_conversation_members m
      where m.conversation_id = team_messages.conversation_id
        and m.user_id = (select auth.uid())
        and m.company_id = team_messages.company_id
    )
    or has_company_role(company_id, array['admin']::text[])
  )
);

create or replace function public.ensure_team_group(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_conversation_id uuid;
begin
  if v_user_id is null
     or private.is_platform_owner()
     or not exists (
       select 1 from public.company_members cm
       where cm.company_id = p_company_id
         and cm.user_id = v_user_id
     ) then
    raise exception 'Acesso negado à equipe.';
  end if;

  select c.id into v_conversation_id
  from public.team_conversations c
  where c.company_id = p_company_id
    and c.conversation_type = 'team'
  limit 1;

  if v_conversation_id is null then
    insert into public.team_conversations(company_id, conversation_type, title, created_by)
    values (p_company_id, 'team', 'Grupo da equipe', v_user_id)
    returning id into v_conversation_id;
  end if;

  insert into public.team_conversation_members(conversation_id, company_id, user_id)
  select v_conversation_id, p_company_id, cm.user_id
  from public.company_members cm
  where cm.company_id = p_company_id
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$function$;
