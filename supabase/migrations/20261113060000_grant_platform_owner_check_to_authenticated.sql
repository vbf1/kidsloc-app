-- Expose a narrow, signed-in RPC for workspace routing without requiring a company membership.
create or replace function public.is_platform_owner_for_company()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_is_platform_owner boolean := false;
begin
  if to_regprocedure('private.is_platform_owner()') is not null then
    execute 'select private.is_platform_owner()' into v_is_platform_owner;
  end if;
  return coalesce(v_is_platform_owner, false);
end;
$function$;

revoke all on function public.is_platform_owner_for_company() from public, anon;
grant execute on function public.is_platform_owner_for_company() to authenticated;
