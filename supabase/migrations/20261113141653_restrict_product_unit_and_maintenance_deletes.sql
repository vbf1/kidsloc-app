-- Product units: company members may view, create and update; only owners/admins may delete.
drop policy if exists company_members_all on public.product_units;
create policy product_units_select_company_members
  on public.product_units for select to authenticated
  using (public.is_company_member(company_id));
create policy product_units_insert_company_members
  on public.product_units for insert to authenticated
  with check (public.is_company_member(company_id));
create policy product_units_update_company_members
  on public.product_units for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));
create policy product_units_delete_owner_admin
  on public.product_units for delete to authenticated
  using (public.has_company_role(company_id, array['owner','admin']));

-- Maintenance records: company members may view, create and update; only owners/admins may delete.
drop policy if exists company_members_all on public.maintenance_records;
create policy maintenance_records_select_company_members
  on public.maintenance_records for select to authenticated
  using (public.is_company_member(company_id));
create policy maintenance_records_insert_company_members
  on public.maintenance_records for insert to authenticated
  with check (public.is_company_member(company_id));
create policy maintenance_records_update_company_members
  on public.maintenance_records for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));
create policy maintenance_records_delete_owner_admin
  on public.maintenance_records for delete to authenticated
  using (public.has_company_role(company_id, array['owner','admin']));
