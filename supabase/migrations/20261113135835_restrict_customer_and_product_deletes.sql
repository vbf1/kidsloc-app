drop policy if exists company_members_all on public.customers;
create policy customers_select_company_members on public.customers for select to authenticated using (is_company_member(company_id));
create policy customers_insert_company_members on public.customers for insert to authenticated with check (is_company_member(company_id));
create policy customers_update_company_members on public.customers for update to authenticated using (is_company_member(company_id)) with check (is_company_member(company_id));
drop policy if exists customers_prevent_delete_authenticated on public.customers;
create policy customers_delete_owner_admin on public.customers for delete to authenticated using (has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

drop policy if exists company_members_all on public.products;
create policy products_select_company_members on public.products for select to authenticated using (is_company_member(company_id));
create policy products_insert_company_members on public.products for insert to authenticated with check (is_company_member(company_id));
create policy products_update_company_members on public.products for update to authenticated using (is_company_member(company_id)) with check (is_company_member(company_id));
