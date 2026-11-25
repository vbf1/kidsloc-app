begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  'e1000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'individual-units@example.test',
  '',
  now(),
  now()
);

insert into public.companies (id, name, created_by)
values (
  'e2000000-0000-4000-8000-000000000001',
  'Empresa QA unidades individuais',
  'e1000000-0000-4000-8000-000000000001'
);

insert into public.company_members (company_id, user_id, role)
values (
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'admin'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ insert into public.products (
       id, company_id, name, item_type, inventory_mode,
       total_quantity, daily_price, event_price, active
     ) values (
       'e3000000-0000-4000-8000-000000000001',
       'e2000000-0000-4000-8000-000000000001',
       'Máquina de algodão doce QA',
       'machine',
       'individual',
       2,
       0,
       100,
       true
     ) $$,
  'creating an individual-inventory machine automatically creates its missing units'
);

select is(
  (select count(*)::integer from public.product_units
   where product_id = 'e3000000-0000-4000-8000-000000000001'),
  2,
  'automatic generation creates exactly the declared number of units'
);

select is(
  (select count(*)::integer from public.product_units
   where product_id = 'e3000000-0000-4000-8000-000000000001'
     and status = 'available'),
  2,
  'newly generated units start as available'
);

select ok(
  (select bool_and(asset_code like 'AUTO-%')
   from public.product_units
   where product_id = 'e3000000-0000-4000-8000-000000000001'),
  'automatically generated units receive identifiable asset codes'
);

update public.products
set total_quantity = 3
where id = 'e3000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from public.product_units
   where product_id = 'e3000000-0000-4000-8000-000000000001'),
  3,
  'increasing declared stock creates only the missing unit'
);

update public.product_units
set status = 'maintenance'
where id = (
  select id from public.product_units
  where product_id = 'e3000000-0000-4000-8000-000000000001'
  order by id
  limit 1
);

update public.products
set total_quantity = 3
where id = 'e3000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from public.product_units
   where product_id = 'e3000000-0000-4000-8000-000000000001'),
  3,
  'maintenance units count toward declared stock and are not replaced with extra units'
);

select is(
  (select count(*)::integer from public.product_units
   where product_id = 'e3000000-0000-4000-8000-000000000001'
     and status = 'available'),
  2,
  'reconciliation preserves the maintenance status and available-unit count'
);

reset role;
select * from finish();
rollback;
