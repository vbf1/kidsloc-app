begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Isolated fixtures: one platform owner and two independent company owners.
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'platform-owner-rls@example.test', '', now(), now()),
  ('b1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'company-a-owner-rls@example.test', '', now(), now()),
  ('b1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'company-b-owner-rls@example.test', '', now(), now());

insert into private.platform_owners (user_id)
values ('b1000000-0000-4000-8000-000000000001');

insert into public.companies (id, name, created_by)
values
  ('b2000000-0000-4000-8000-000000000001', 'Empresa A QA plataforma', 'b1000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-000000000002', 'Empresa B QA plataforma', 'b1000000-0000-4000-8000-000000000003');

insert into public.company_members (company_id, user_id, role)
values
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'owner'),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000003', 'owner');

insert into public.products (id, company_id, name, item_type, inventory_mode, total_quantity, daily_price)
values
  ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Produto privado A', 'toy', 'quantity', 1, 50),
  ('b3000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'Produto B para editar', 'toy', 'quantity', 1, 50),
  ('b3000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000002', 'Produto B para excluir', 'toy', 'quantity', 1, 50);

-- The platform owner must be able to see and manage records across both companies.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.companies where id in (
    'b2000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000002'
  )),
  2,
  'platform owner can view companies across the platform'
);

select is(
  (select count(*)::integer from public.products where id like 'b3000000-0000-4000-8000-%'),
  3,
  'platform owner can view products from multiple companies'
);

select lives_ok(
  $$ update public.products
     set name = 'Produto B editado pelo proprietário da plataforma'
     where id = 'b3000000-0000-4000-8000-000000000002' $$,
  'platform owner can update a product belonging to another company'
);

select is(
  (select name from public.products where id = 'b3000000-0000-4000-8000-000000000002'),
  'Produto B editado pelo proprietário da plataforma',
  'platform owner update is persisted'
);

select lives_ok(
  $$ insert into public.products (id, company_id, name, item_type, inventory_mode, total_quantity, daily_price)
     values ('b3000000-0000-4000-8000-000000000004',
             'b2000000-0000-4000-8000-000000000002',
             'Produto B criado pela plataforma', 'toy', 'quantity', 1, 50) $$,
  'platform owner can create a product for another company'
);

select lives_ok(
  $$ delete from public.products
     where id = 'b3000000-0000-4000-8000-000000000003' $$,
  'platform owner can delete a product belonging to another company'
);

-- A regular company owner must remain isolated from the other company.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::integer from public.products),
  1,
  'company owner sees only products from their own company'
);

select lives_ok(
  $$ update public.products set name = 'Tentativa indevida'
     where id = 'b3000000-0000-4000-8000-000000000002' $$,
  'cross-company update attempt does not raise an error'
);

select is(
  (select name from public.products where id = 'b3000000-0000-4000-8000-000000000002'),
  null,
  'company owner cannot read or alter another company product'
);

select lives_ok(
  $$ delete from public.products
     where id = 'b3000000-0000-4000-8000-000000000002' $$,
  'cross-company delete attempt does not raise an error'
);

select is(
  (select count(*)::integer from public.products
   where id = 'b3000000-0000-4000-8000-000000000002'),
  0,
  'company owner cannot delete another company product'
);

-- Verify that the platform owner still sees the remaining cross-company records.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.products),
  3,
  'platform owner retains global visibility after company-isolation checks'
);

reset role;
select * from finish();
rollback;
