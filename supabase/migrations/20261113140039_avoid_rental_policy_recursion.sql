
drop policy if exists rentals_scope_select on public.rentals;
create policy rentals_scope_select on public.rentals
as restrictive for select to authenticated
using (
  is_platform_owner()
  or (
    is_company_member(company_id)
    and (
      created_by = (select auth.uid())
      or public.can_manage_rental(company_id, id)
    )
  )
);

drop policy if exists rentals_select_creator_or_assigned on public.rentals;
create policy rentals_select_creator_or_assigned
on public.rentals for select to authenticated
using (
  is_company_member(company_id)
  and (
    created_by = (select auth.uid())
    or public.can_manage_rental(company_id, id)
  )
);
