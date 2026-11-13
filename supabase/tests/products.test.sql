begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
select has_column('public', 'products', 'item_type', 'catalog item type exists');
select has_column('public', 'products', 'event_price', 'event price column exists');
select col_default_is('public', 'products', 'item_type', 'toy', 'existing and new products default to toy');
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
 ('20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'products-owner@example.test', '', now(), now()),
 ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'products-outsider@example.test', '', now(), now());
insert into public.companies (id, name, created_by)
values
 ('31000000-0000-4000-8000-000000000001', 'Empresa catálogo', '20000000-0000-4000-8000-000000000001'),
 ('31000000-0000-4000-8000-000000000002', 'Outra empresa', '20000000-0000-4000-8000-000000000002');
insert into public.company_members (company_id, user_id, role)
values
 ('31000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'owner'),
 ('31000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'owner');
select lives_ok(
  $$ insert into public.products (id, company_id, name, item_type, inventory_mode, total_quantity, daily_price, event_price)
     values ('41000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'Recreação', 'service', 'quantity', 0, 0, 150.00) $$,
  'service can be created with event price and without physical inventory'
);
select throws_ok(
  $$ insert into public.products (company_id, name, item_type, inventory_mode, total_quantity, daily_price, event_price)
     values ('31000000-0000-4000-8000-000000000001', 'Serviço com estoque', 'service', 'quantity', 2, 0, 150.00) $$,
  '23514', null, 'service cannot be created with physical inventory'
);
select throws_ok(
  $$ insert into public.products (company_id, name, item_type, inventory_mode, total_quantity, daily_price, event_price)
     values ('31000000-0000-4000-8000-000000000001', 'Brinquedo com preço de evento', 'toy', 'quantity', 1, 100, 150.00) $$,
  '23514', null, 'toy cannot use event pricing'
);
select lives_ok(
  $$ insert into public.products (id, company_id, name, item_type, inventory_mode, total_quantity, daily_price)
     values ('41000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000001', 'Cama elástica', 'toy', 'individual', 2, 80.00) $$,
  'toy can be created with daily pricing and individual inventory'
);
select lives_ok(
  $$ insert into public.product_units (company_id, product_id, asset_code, status)
     values ('31000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 'ELASTICA-01', 'available') $$,
  'physical unit can be registered for a toy'
);
select lives_ok(
  $ insert into public.products (id, company_id, name, item_type, inventory_mode, total_quantity, daily_price)
     values ('41000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000001', 'Mesa de jogos', 'toy', 'quantity', 2, 40.00) $,
  'toy can also use quantity inventory'
);
select throws_ok(
  $ insert into public.product_units (company_id, product_id, asset_code, status)
     values ('31000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000003', 'MESA-01', 'available') $,
  '23514', 'Unidades físicas exigem controle individual de estoque.',
  'physical units require individual inventory mode'
);
select throws_ok(
  $ insert into public.product_units (company_id, product_id, asset_code, status)
     values ('31000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 'SERVICO-01', 'available') $,
  '23514', 'Serviços não podem possuir unidades físicas.',
  'physical unit cannot be registered for a service'
);
select throws_ok(
  $$ update public.products set item_type = 'service', event_price = 50, daily_price = 0, total_quantity = 0
     where id = '41000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'item type cannot change after physical units exist'
);
select is((select count(*)::int from public.products where company_id = '31000000-0000-4000-8000-000000000001'), 2,
  'valid toy and service records remain stored');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ insert into public.products (company_id, name, item_type, inventory_mode, total_quantity, daily_price)
     values ('31000000-0000-4000-8000-000000000001', 'Piscina de bolinhas', 'toy', 'quantity', 1, 65.00) $$,
  'company member can create a product for their own company'
);
select is((select count(*)::int from public.products where company_id = '31000000-0000-4000-8000-000000000001'), 3,
  'company member can read products from their own company');
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.products where company_id = '31000000-0000-4000-8000-000000000001'), 0,
  'another company cannot read this company products');
select throws_ok(
  $$ insert into public.products (company_id, name, item_type, inventory_mode, total_quantity, daily_price)
     values ('31000000-0000-4000-8000-000000000001', 'Tentativa externa', 'toy', 'quantity', 1, 10) $$,
  '42501', 'new row violates row-level security policy for table "products"',
  'another company cannot create a product for this company'
);
reset role;
select * from finish();
rollback;
