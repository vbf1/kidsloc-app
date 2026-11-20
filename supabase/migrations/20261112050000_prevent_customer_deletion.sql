-- Preserve the deployed customer-deletion rule: only company owners/admins
-- may delete customer records. Ordinary staff remain read/write scoped by the
-- existing company policies, but cannot delete customers.
-- This replaces the earlier local-only blanket deny, which diverged from the
-- final remote policy and blocked administrators in a clean database.

drop policy if exists customers_prevent_delete_authenticated on public.customers;
drop policy if exists customers_delete_owner_admin on public.customers;

create policy customers_delete_owner_admin
on public.customers
for delete
to authenticated
using (
  public.has_company_role(company_id, array['owner'::text, 'admin'::text])
);
