-- Reconcile the deployed customer policy model: company members can read,
-- create and update customers; only company owners/admins may delete them.
-- The initial foundation's company_members_all policy is too broad because
-- it also grants DELETE to ordinary staff.

drop policy if exists company_members_all on public.customers;
drop policy if exists customers_prevent_delete_authenticated on public.customers;

drop policy if exists customers_select_company_members on public.customers;
create policy customers_select_company_members
on public.customers for select to authenticated
using (public.is_company_member(company_id));

drop policy if exists customers_insert_company_members on public.customers;
create policy customers_insert_company_members
on public.customers for insert to authenticated
with check (public.is_company_member(company_id));

drop policy if exists customers_update_company_members on public.customers;
create policy customers_update_company_members
on public.customers for update to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists customers_delete_owner_admin on public.customers;
create policy customers_delete_owner_admin
on public.customers for delete to authenticated
using (public.has_company_role(company_id, array['owner'::text, 'admin'::text]));
