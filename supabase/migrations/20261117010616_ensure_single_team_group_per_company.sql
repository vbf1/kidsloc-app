
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

CREATE UNIQUE INDEX team_conversations_one_team_group_per_company_idx
ON public.team_conversations (company_id)
WHERE conversation_type = 'team';

CREATE OR REPLACE FUNCTION public.ensure_team_group(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Acesso negado à equipe.';
  end if;

  if not private.is_platform_owner()
     and not exists (
       select 1
       from public.company_members cm
       where cm.company_id = p_company_id
         and cm.user_id = v_user_id
     ) then
    raise exception 'Acesso negado à equipe.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text, 0)
  );

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

REVOKE ALL ON FUNCTION public.ensure_team_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_team_group(uuid) TO authenticated, service_role;
