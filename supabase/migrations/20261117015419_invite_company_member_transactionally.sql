-- Add a transactional invitation operation that locks the inviter's membership
-- while authorizing and inserting, preventing concurrent role removal/demotion.
-- This version follows the final company role model: admin and staff only.
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
  v_actor_is_platform_owner boolean := private.is_platform_owner();
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

  -- Lock the inviter's membership until this transaction commits. Concurrent
  -- removal or role changes must wait, so authorization cannot go stale mid-insert.
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
