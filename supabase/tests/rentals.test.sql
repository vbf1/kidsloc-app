begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('92000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rental-reservation-qa@example.test', '', now(), now());

insert into public.companies (id, name, created_by)
values ('93000000-0000-4000-8000-000000000001', 'Empresa QA reservas', '92000000-0000-4000-8000-000000000001');

insert into public.company_members (company_id, user_id, role)
values ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'owner');

insert into public.customers (id, company_id, name)
values ('94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'Cliente QA reservas');

insert into public.products (id, company_id, name, item_type, inventory_mode, total_quantity, daily_price)
values
  ('95000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'Unidade individual QA', 'toy', 'individual', 1, 100),
  ('97000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'Estoque por quantidade QA', 'toy', 'quantity', 1, 100);

insert into public.product_units (id, company_id, product_id, asset_code, status)
values ('96000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001', 'QA-UNIDADE-01', 'available');

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);
create temporary table rental_reservation_qa_ids (kind text primary key, rental_id uuid);

select lives_ok(
  $$ insert into rental_reservation_qa_ids
     select 'individual_first', public.create_rental_with_items(
       '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
       date '2035-04-10', date '2035-04-10', 'pending', 'customer_pickup', 100,
       '[{"product_id":"95000000-0000-4000-8000-000000000001","quantity":1,"unit_price":100}]'::jsonb,
       null, array[]::uuid[], time '09:00', time '12:00'
     ) $$,
  'individual inventory accepts the first reservation'
);

select throws_ok(
  $$ select public.create_rental_with_items(
       '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
       date '2035-04-10', date '2035-04-10', 'pending', 'customer_pickup', 100,
       '[{"product_id":"95000000-0000-4000-8000-000000000001","quantity":1,"unit_price":100}]'::jsonb,
       null, array[]::uuid[], time '11:00', time '13:00'
     ) $$,
  'P0001', null, 'individual inventory rejects an overlapping reservation'
);

select lives_ok(
  $$ insert into rental_reservation_qa_ids
     select 'individual_adjacent', public.create_rental_with_items(
       '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
       date '2035-04-10', date '2035-04-10', 'pending', 'customer_pickup', 100,
       '[{"product_id":"95000000-0000-4000-8000-000000000001","quantity":1,"unit_price":100}]'::jsonb,
       null, array[]::uuid[], time '12:00', time '18:00'
     ) $$,
  'individual inventory allows back-to-back reservations'
);

select throws_ok(
  $$ select public.update_rental_with_items(
       '93000000-0000-4000-8000-000000000001',
       (select rental_id from rental_reservation_qa_ids where kind = 'individual_adjacent'),
       '94000000-0000-4000-8000-000000000001',
       date '2035-04-10', date '2035-04-10', 'confirmed', 'customer_pickup', 100,
       '[{"product_id":"95000000-0000-4000-8000-000000000001","quantity":1,"unit_price":100}]'::jsonb,
       null, array[]::uuid[], time '10:00', time '11:00'
     ) $$,
  'P0001', null, 'editing an individual-unit reservation cannot create an overlap'
);

select lives_ok(
  $$ select public.update_rental_with_items(
       '93000000-0000-4000-8000-000000000001',
       (select rental_id from rental_reservation_qa_ids where kind = 'individual_first'),
       '94000000-0000-4000-8000-000000000001',
       date '2035-04-10', date '2035-04-10', 'cancelled', 'customer_pickup', 100,
       '[{"product_id":"95000000-0000-4000-8000-000000000001","quantity":1,"unit_price":100}]'::jsonb,
       null, array[]::uuid[], time '09:00', time '12:00'
     ) $$,
  'cancelling a rental succeeds'
);

select is(
  (select count(*)::integer from public.rental_item_units riu
   join public.rental_items ri on ri.id = riu.rental_item_id
   where ri.rental_id = (select rental_id from rental_reservation_qa_ids where kind = 'individual_first')),
  0,
  'cancelling a rental releases its physical-unit assignment'
);

select lives_ok(
  $$ select public.create_rental_with_items(
       '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
       date '2035-04-10', date '2035-04-10', 'pending', 'customer_pickup', 100,
       '[{"product_id":"95000000-0000-4000-8000-000000000001","quantity":1,"unit_price":100}]'::jsonb,
       null, array[]::uuid[], time '10:00', time '11:00'
     ) $$,
  'a released physical unit can be reserved again for the same period'
);

select lives_ok(
  $$ insert into rental_reservation_qa_ids
     select 'quantity_first', public.create_rental_with_items(
       '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
       date '2035-04-11', date '2035-04-11', 'pending', 'customer_pickup', 100,
       '[{"product_id":"97000000-0000-4000-8000-000000000001","quantity":1,"unit_price":100}]'::jsonb,
       null, array[]::uuid[], time '09:00', time '12:00'
     ) $$,
  'quantity inventory accepts a reservation within stock'
);

select throws_ok(
  $$ select public.create_rental_with_items(
       '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
       date '2035-04-11', date '2035-04-11', 'pending', 'customer_pickup', 100,
       '[{"product_id":"97000000-0000-4000-8000-000000000001","quantity":1,"unit_price":100}]'::jsonb,
       null, array[]::uuid[], time '11:00', time '13:00'
     ) $$,
  'P0001', null, 'quantity inventory rejects overlapping demand above total stock'
);

select lives_ok(
  $$ insert into rental_reservation_qa_ids
     select 'quantity_adjacent', public.create_rental_with_items(
       '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
       date '2035-04-11', date '2035-04-11', 'pending', 'customer_pickup', 100,
       '[{"product_id":"97000000-0000-4000-8000-000000000001","quantity":1,"unit_price":100}]'::jsonb,
       null, array[]::uuid[], time '12:00', time '18:00'
     ) $$,
  'quantity inventory allows back-to-back reservations'
);

select throws_ok(
  $$ select public.update_rental_with_items(
       '93000000-0000-4000-8000-000000000001',
       (select rental_id from rental_reservation_qa_ids where kind = 'quantity_adjacent'),
       '94000000-0000-4000-8000-000000000001',
       date '2035-04-11', date '2035-04-11', 'confirmed', 'customer_pickup', 100,
       '[{"product_id":"97000000-0000-4000-8000-000000000001","quantity":1,"unit_price":100}]'::jsonb,
       null, array[]::uuid[], time '10:00', time '11:00'
     ) $$,
  'P0001', null, 'editing quantity inventory cannot create an overlapping reservation'
);

select * from finish();
rollback;
