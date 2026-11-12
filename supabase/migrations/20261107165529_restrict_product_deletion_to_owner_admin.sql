-- Only company owners and administrators may delete toys/products.
-- Keep the existing permissive company membership policy for other operations,
-- while this restrictive DELETE policy narrows deletion to privileged roles.
drop policy if exists product_delete_owner_admin_only on public.products;

create policy product_delete_owner_admin_only
on public.products
as restrictive
for delete
to authenticated
using (
  public.is_platform_owner()
  or public.has_company_role(company_id, array['owner', 'admin']::text[])
);
