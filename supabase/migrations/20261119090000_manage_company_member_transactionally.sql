-- Transactional company-member role changes and removal.
-- Authorization is rechecked inside the same transaction that mutates membership.
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
    raise exception 'Ação inválida' using errcode = '22023';
  end if;

  if p_action = 'change_role' and (p_role is null or p_role not in ('admin', 'staff')) then
    raise exception 'Cargo inválido. Use admin ou staff.' using errcode = '22023';
  end if;

  if p_action = 'remove' and p_role is not null then
    raise exception 'A remoção não aceita um cargo' using errcode = '22023';
  end if;

  -- Lock the acting administrator's membership so a concurrent demotion/removal
  -- cannot race with this authorization check.
  if not v_actor_is_platform_owner then
    select cm.role
      into v_actor_role
      from public.company_members cm
     where cm.company_id = p_company_id
       and cm.user_id = v_actor_id
     for update;

    if not found or v_actor_role <> 'admin' then
      raise exception 'Sem permissão para gerenciar membros desta empresa'
        using errcode = '42501';
    end if;
  end if;

  -- The global platform owner is never a company member and cannot be managed here.
  if exists (
    select 1 from private.platform_owners po where po.user_id = p_user_id
  ) then
    raise exception 'O proprietário da plataforma não pode ser gerenciado como membro de uma empresa'
      using errcode = '42501';
  end if;

  select cm.role
    into v_target_role
    from public.company_members cm
   where cm.company_id = p_company_id
     and cm.user_id = p_user_id
   for update;

  if not found then
    raise exception 'O usuário não pertence a esta empresa'
      using errcode = 'P0002';
  end if;

  if not v_actor_is_platform_owner then
    if v_target_role <> 'staff' then
      raise exception 'Administradores só podem gerenciar funcionários'
        using errcode = '42501';
    end if;
    if p_action = 'change_role' and p_role <> 'staff' then
      raise exception 'Administradores só podem gerenciar funcionários'
        using errcode = '42501';
    end if;
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
