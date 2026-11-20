
-- Financial data: company members may view; only owners/admins may manage.
drop policy if exists company_members_all on public.financial_transactions;
create policy financial_transactions_select_company_members
  on public.financial_transactions for select to authenticated
  using (public.is_company_member(company_id));
create policy financial_transactions_insert_owner_admin
  on public.financial_transactions for insert to authenticated
  with check (public.has_company_role(company_id, array['owner','admin']));
create policy financial_transactions_update_owner_admin
  on public.financial_transactions for update to authenticated
  using (public.has_company_role(company_id, array['owner','admin']))
  with check (public.has_company_role(company_id, array['owner','admin']));
create policy financial_transactions_delete_owner_admin
  on public.financial_transactions for delete to authenticated
  using (public.has_company_role(company_id, array['owner','admin']));

-- Documents: members may view/create/update; only owners/admins may delete.
drop policy if exists company_members_all on public.documents;
create policy documents_select_company_members
  on public.documents for select to authenticated
  using (public.is_company_member(company_id));
create policy documents_insert_company_members
  on public.documents for insert to authenticated
  with check (public.is_company_member(company_id));
create policy documents_update_company_members
  on public.documents for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));
create policy documents_delete_owner_admin
  on public.documents for delete to authenticated
  using (public.has_company_role(company_id, array['owner','admin']));

-- Stock movements: members may view/create/update; only owners/admins may delete.
drop policy if exists company_members_all on public.stock_movements;
create policy stock_movements_select_company_members
  on public.stock_movements for select to authenticated
  using (public.is_company_member(company_id));
create policy stock_movements_insert_company_members
  on public.stock_movements for insert to authenticated
  with check (public.is_company_member(company_id));
create policy stock_movements_update_company_members
  on public.stock_movements for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));
create policy stock_movements_delete_owner_admin
  on public.stock_movements for delete to authenticated
  using (public.has_company_role(company_id, array['owner','admin']));
