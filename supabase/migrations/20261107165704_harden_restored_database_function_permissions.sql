revoke all on function public.create_company(text) from public, anon;
grant execute on function public.create_company(text) to authenticated;

revoke all on function public.add_company_member(uuid,uuid,text) from public, anon;
grant execute on function public.add_company_member(uuid,uuid,text) to authenticated;

revoke all on function public.is_company_member(uuid) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated;

revoke all on function public.has_company_role(uuid,text[]) from public, anon;
grant execute on function public.has_company_role(uuid,text[]) to authenticated;

revoke all on function public.can_manage_rental(uuid,uuid) from public, anon;
grant execute on function public.can_manage_rental(uuid,uuid) to authenticated;

revoke all on function public.ensure_team_group(uuid) from public, anon;
grant execute on function public.ensure_team_group(uuid) to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.set_marketing_updated_at() from public, anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
