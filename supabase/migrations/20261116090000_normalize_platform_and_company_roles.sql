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

-- A platform owner is global and must not retain a company membership.
delete from public.company_members cm
using private.platform_owners po
where cm.user_id = po.user_id;

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

  if coalesce(private.is_platform_owner(), false) then
    raise exception 'O proprietário da plataforma não pode criar uma empresa.'
      using errcode = '42501';
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
  v_actor_is_platform_owner boolean := coalesce(private.is_platform_owner(), false);
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
  if exists (
    select 1 from private.platform_owners po where po.user_id = p_user_id
  ) then
    raise exception 'O proprietário da plataforma não pode ser vinculado a uma empresa.'
      using errcode = '42501';
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

-- Keep the deployed invitation RPC aligned with the normalized role model.
create or replace function public.invite_company_member(
  p_company_id uuid,
  p_user_id uuid,
  p_role text default 'staff'
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text;
  v_actor_is_platform_owner boolean := coalesce(private.is_platform_owner(), false);
begin
  if v_actor_id is null then
    raise exception 'Autenticação obrigatória' using errcode = '28000';
  end if;

  if p_company_id is null or p_user_id is null then
    raise exception 'Empresa e usuário são obrigatórios' using errcode = '22023';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'Você não pode convidar sua própria conta' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('admin', 'staff') then
    raise exception 'Cargo inválido' using errcode = '22023';
  end if;

  select cm.role
    into v_actor_role
    from public.company_members cm
   where cm.company_id = p_company_id
     and cm.user_id = v_actor_id
   for update;

  if not v_actor_is_platform_owner and (not found or v_actor_role <> 'admin') then
    raise exception 'Somente o proprietário da plataforma ou administrador pode convidar membros'
      using errcode = '42501';
  end if;

  if not v_actor_is_platform_owner and p_role <> 'staff' then
    raise exception 'Administradores só podem adicionar funcionários'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from private.platform_owners po where po.user_id = p_user_id
  ) then
    raise exception 'O proprietário da plataforma não pode ser vinculado a uma empresa.'
      using errcode = '42501';
  end if;

  insert into public.company_members (company_id, user_id, role)
  values (p_company_id, p_user_id, p_role);
exception
  when unique_violation then
    raise exception 'Este e-mail já está vinculado à equipe desta empresa'
      using errcode = '23505';
end;
$function$;

revoke all on function public.invite_company_member(uuid, uuid, text) from public, anon;
grant execute on function public.invite_company_member(uuid, uuid, text) to authenticated;

-- Manage a company membership with the caller's JWT and transactional role checks.
create or replace function public.manage_company_member(
  p_company_id uuid,
  p_user_id uuid,
  p_action text,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_is_platform_owner boolean := coalesce(private.is_platform_owner(), false);
  v_actor_role text;
  v_target_role text;
begin
  if v_actor_id is null then
    raise exception 'Autenticação obrigatória' using errcode = '28000';
  end if;

  if p_company_id is null or p_user_id is null then
    raise exception 'Empresa e usuário são obrigatórios' using errcode = '22023';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'Você não pode alterar ou remover seu próprio acesso' using errcode = '42501';
  end if;

  if p_action is null or p_action not in ('change_role', 'remove') then
    raise exception 'Ação de gerenciamento inválida' using errcode = '22023';
  end if;

  if p_action = 'change_role' and (p_role is null or p_role not in ('admin', 'staff')) then
    raise exception 'Cargo inválido' using errcode = '22023';
  end if;

  -- Lock the caller's membership so a concurrent demotion/removal cannot race
  -- with the authorization decision below.
  if not v_actor_is_platform_owner then
    select cm.role
      into v_actor_role
      from public.company_members cm
     where cm.company_id = p_company_id
       and cm.user_id = v_actor_id
     for update;

    if not found or v_actor_role <> 'admin' then
      raise exception 'Sem permissão para gerenciar funcionários desta empresa'
        using errcode = '42501';
    end if;
  end if;

  -- Serialize changes to the target membership as well.
  select cm.role
    into v_target_role
    from public.company_members cm
   where cm.company_id = p_company_id
     and cm.user_id = p_user_id
   for update;

  if not found then
    raise exception 'Funcionário não encontrado nesta empresa'
      using errcode = 'P0002';
  end if;

  if not v_actor_is_platform_owner
     and (v_target_role <> 'staff' or (p_action = 'change_role' and p_role <> 'staff')) then
    raise exception 'Administradores só podem gerenciar funcionários'
      using errcode = '42501';
  end if;

  if p_action = 'change_role' then
    update public.company_members
       set role = p_role
     where company_id = p_company_id
       and user_id = p_user_id;
  else
    delete from public.company_members
     where company_id = p_company_id
       and user_id = p_user_id;
  end if;
end;
$function$;

revoke all on function public.manage_company_member(uuid, uuid, text, text) from public, anon;
grant execute on function public.manage_company_member(uuid, uuid, text, text) to authenticated;

-- Membership changes must go through the transactional SECURITY DEFINER RPC.
-- Keep the platform-owner ALL policy; remove the direct company-admin DELETE path.
drop policy if exists company_members_delete_authorized_admins on public.company_members;

-- Reconcile company-wide operational policies to the deployed role model.
-- The initial foundation grants company_members_all on these tables; remove
-- those broad policies before applying explicit per-operation permissions.
do $
declare v_table text;
begin
  foreach v_table in array array['documents','financial_transactions','stock_movements','maintenance_records','product_units'] loop
    execute format('drop policy if exists company_members_all on public.%I', v_table);
  end loop;
end;
$;

drop policy if exists documents_select_company_members on public.documents;
create policy documents_select_company_members on public.documents
for select to authenticated using (public.is_company_member(company_id));
drop policy if exists documents_insert_company_members on public.documents;
create policy documents_insert_company_members on public.documents
for insert to authenticated with check (public.is_company_member(company_id));
drop policy if exists documents_update_company_members on public.documents;
create policy documents_update_company_members on public.documents
for update to authenticated using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));
drop policy if exists documents_delete_owner_admin on public.documents;
create policy documents_delete_owner_admin on public.documents
for delete to authenticated using (public.has_company_role(company_id, array['owner','admin']::text[]));

drop policy if exists financial_transactions_select_company_members on public.financial_transactions;
create policy financial_transactions_select_company_members on public.financial_transactions
for select to authenticated using (public.is_company_member(company_id));
drop policy if exists financial_transactions_insert_owner_admin on public.financial_transactions;
create policy financial_transactions_insert_owner_admin on public.financial_transactions
for insert to authenticated with check (public.has_company_role(company_id, array['owner','admin']::text[]));
drop policy if exists financial_transactions_update_owner_admin on public.financial_transactions;
create policy financial_transactions_update_owner_admin on public.financial_transactions
for update to authenticated using (public.has_company_role(company_id, array['owner','admin']::text[]))
with check (public.has_company_role(company_id, array['owner','admin']::text[]));
drop policy if exists financial_transactions_delete_owner_admin on public.financial_transactions;
create policy financial_transactions_delete_owner_admin on public.financial_transactions
for delete to authenticated using (public.has_company_role(company_id, array['owner','admin']::text[]));

drop policy if exists stock_movements_select_company_members on public.stock_movements;
create policy stock_movements_select_company_members on public.stock_movements
for select to authenticated using (public.is_company_member(company_id));
drop policy if exists stock_movements_insert_company_members on public.stock_movements;
create policy stock_movements_insert_company_members on public.stock_movements
for insert to authenticated with check (public.is_company_member(company_id));
drop policy if exists stock_movements_update_company_members on public.stock_movements;
create policy stock_movements_update_company_members on public.stock_movements
for update to authenticated using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));
drop policy if exists stock_movements_delete_owner_admin on public.stock_movements;
create policy stock_movements_delete_owner_admin on public.stock_movements
for delete to authenticated using (public.has_company_role(company_id, array['owner','admin']::text[]));

drop policy if exists maintenance_records_select_company_members on public.maintenance_records;
create policy maintenance_records_select_company_members on public.maintenance_records
for select to authenticated using (public.is_company_member(company_id));
drop policy if exists maintenance_records_insert_company_members on public.maintenance_records;
create policy maintenance_records_insert_company_members on public.maintenance_records
for insert to authenticated with check (public.is_company_member(company_id));
drop policy if exists maintenance_records_update_company_members on public.maintenance_records;
create policy maintenance_records_update_company_members on public.maintenance_records
for update to authenticated using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));
drop policy if exists maintenance_records_delete_owner_admin on public.maintenance_records;
create policy maintenance_records_delete_owner_admin on public.maintenance_records
for delete to authenticated using (public.has_company_role(company_id, array['owner','admin']::text[]));

drop policy if exists product_units_select_company_members on public.product_units;
create policy product_units_select_company_members on public.product_units
for select to authenticated using (public.is_company_member(company_id));
drop policy if exists product_units_insert_company_members on public.product_units;
create policy product_units_insert_company_members on public.product_units
for insert to authenticated with check (public.is_company_member(company_id));
drop policy if exists product_units_update_company_members on public.product_units;
create policy product_units_update_company_members on public.product_units
for update to authenticated using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));
drop policy if exists product_units_delete_owner_admin on public.product_units;
create policy product_units_delete_owner_admin on public.product_units
for delete to authenticated using (public.has_company_role(company_id, array['owner','admin']::text[]));

create or replace function public.can_manage_rental(p_company_id uuid, p_rental_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.is_company_member(p_company_id)
    and exists (
      select 1 from public.rentals r
      where r.id = p_rental_id and r.company_id = p_company_id
        and (
          r.created_by = (select auth.uid())
          or public.has_company_role(p_company_id, array['owner','admin']::text[])
          or exists (
            select 1 from public.rental_responsibles rr
            where rr.company_id = r.company_id
              and rr.rental_id = r.id
              and rr.user_id = (select auth.uid())
          )
        )
    );
$function$;
revoke all on function public.can_manage_rental(uuid, uuid) from public, anon;
grant execute on function public.can_manage_rental(uuid, uuid) to authenticated;
-- Restore the creator/assignee policies missing from the local migration set.
drop policy if exists rentals_scope_select on public.rentals;
create policy rentals_scope_select on public.rentals as restrictive
for select to authenticated using (
  public.is_platform_owner() or
  (public.is_company_member(company_id) and
    (created_by = (select auth.uid()) or public.can_manage_rental(company_id, id)))
);
drop policy if exists rentals_select_creator_or_assigned on public.rentals;
create policy rentals_select_creator_or_assigned on public.rentals
for select to authenticated using (
  public.is_company_member(company_id) and
  (created_by = (select auth.uid()) or public.can_manage_rental(company_id, id))
);
drop policy if exists rentals_update_creator_assigned_admin on public.rentals;
create policy rentals_update_creator_assigned_admin on public.rentals
for update to authenticated using (
  public.is_company_member(company_id) and public.can_manage_rental(company_id, id)
) with check (
  public.is_company_member(company_id) and public.can_manage_rental(company_id, id)
);

drop policy if exists rental_items_scope_select on public.rental_items;
drop policy if exists rental_items_select_creator_or_assigned on public.rental_items;
create policy rental_items_select_creator_or_assigned on public.rental_items
for select to authenticated using (exists (
  select 1 from public.rentals r
  where r.id = rental_items.rental_id and r.company_id = rental_items.company_id
    and public.is_company_member(r.company_id)
    and (r.created_by = (select auth.uid()) or public.can_manage_rental(r.company_id, r.id))
));
drop policy if exists rental_items_delete_creator_assigned_admin on public.rental_items;
create policy rental_items_delete_creator_assigned_admin on public.rental_items
for delete to authenticated using (exists (
  select 1 from public.rentals r
  where r.id = rental_items.rental_id and r.company_id = rental_items.company_id
    and public.can_manage_rental(r.company_id, r.id)
));

drop policy if exists rental_item_units_scope_select on public.rental_item_units;
drop policy if exists rental_item_units_select_creator_or_assigned on public.rental_item_units;
create policy rental_item_units_select_creator_or_assigned on public.rental_item_units
for select to authenticated using (exists (
  select 1 from public.rental_items ri
  join public.rentals r on r.id = ri.rental_id and r.company_id = ri.company_id
  where ri.id = rental_item_units.rental_item_id and ri.company_id = rental_item_units.company_id
    and public.is_company_member(r.company_id)
    and (r.created_by = (select auth.uid()) or public.can_manage_rental(r.company_id, r.id))
));

drop policy if exists rental_events_scope_select on public.rental_events;
drop policy if exists rental_events_select_creator_or_assigned on public.rental_events;
create policy rental_events_select_creator_or_assigned on public.rental_events
for select to authenticated using (exists (
  select 1 from public.rentals r
  where r.id = rental_events.rental_id and r.company_id = rental_events.company_id
    and public.is_company_member(r.company_id)
    and (r.created_by = (select auth.uid()) or public.can_manage_rental(r.company_id, r.id))
));

drop policy if exists rental_responsibles_scope_select on public.rental_responsibles;
create policy rental_responsibles_scope_select on public.rental_responsibles
for select to authenticated using (
  public.is_platform_owner() or
  (public.is_company_member(company_id) and (
    user_id = (select auth.uid())
    or exists (select 1 from public.company_members cm where cm.company_id = rental_responsibles.company_id
      and cm.user_id = (select auth.uid()) and cm.role in ('owner','admin'))
    or exists (select 1 from public.rentals r where r.id = rental_responsibles.rental_id
      and r.company_id = rental_responsibles.company_id
      and (r.created_by = (select auth.uid()) or public.can_manage_rental(r.company_id, r.id)))
  ))
);
drop policy if exists rental_responsibles_select_creator_or_assigned on public.rental_responsibles;
create policy rental_responsibles_select_creator_or_assigned on public.rental_responsibles
for select to authenticated using (exists (
  select 1 from public.rentals r
  where r.id = rental_responsibles.rental_id and r.company_id = rental_responsibles.company_id
    and public.is_company_member(r.company_id)
    and (r.created_by = (select auth.uid()) or public.can_manage_rental(r.company_id, r.id))
));
drop policy if exists rental_responsibles_delete_creator_assigned_admin on public.rental_responsibles;
create policy rental_responsibles_delete_creator_assigned_admin on public.rental_responsibles
for delete to authenticated using (exists (
  select 1 from public.rentals r
  where r.id = rental_responsibles.rental_id and r.company_id = rental_responsibles.company_id
    and public.can_manage_rental(r.company_id, r.id)
));
-- Remove the broad platform-owner policies created by the earlier global-access migration.
-- The platform owner is not a company chat participant and must not inherit chat access.
drop policy if exists platform_owner_all on public.team_conversations;
drop policy if exists platform_owner_all on public.team_messages;
drop policy if exists platform_owner_all on public.team_conversation_members;

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
