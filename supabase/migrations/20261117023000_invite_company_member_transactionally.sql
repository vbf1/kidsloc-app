-- Add a transactional, non-upserting invitation operation.
-- Authorization is checked in the same database transaction as the membership insert.
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
  v_is_owner boolean;
  v_is_admin boolean;
begin
  if v_actor_id is null then
    raise exception 'Autenticação obrigatória' using errcode = '28000';
  end if;

  if p_user_id is null or p_company_id is null then
    raise exception 'Empresa e usuário são obrigatórios' using errcode = '22023';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'Você não pode convidar sua própria conta' using errcode = '42501';
  end if;

  if p_role not in ('admin', 'manager', 'staff') then
    raise exception 'Cargo inválido' using errcode = '22023';
  end if;

  v_is_owner := public.has_company_role(p_company_id, array['owner']::text[]);
  v_is_admin := public.has_company_role(p_company_id, array['admin']::text[]);

  if not v_is_owner and not v_is_admin then
    raise exception 'Somente proprietário ou administrador pode convidar membros' using errcode = '42501';
  end if;

  if not v_is_owner and p_role <> 'staff' then
    raise exception 'Administradores só podem adicionar funcionários' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.company_members
    where company_id = p_company_id
      and user_id = p_user_id
  ) then
    raise exception 'Este e-mail já está vinculado à equipe desta empresa' using errcode = '23505';
  end if;

  insert into public.company_members (company_id, user_id, role)
  values (p_company_id, p_user_id, p_role);
end;
$function$;

revoke all on function public.invite_company_member(uuid, uuid, text) from public, anon;
grant execute on function public.invite_company_member(uuid, uuid, text) to authenticated;
