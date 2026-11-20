begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'permissions-admin@example.test', '', now(), now()),
  ('a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'permissions-staff@example.test', '', now(), now());

insert into public.companies (id, name, created_by)
values ('a2000000-0000-4000-8000-000000000001', 'Empresa QA permissões', 'a1000000-0000-4000-8000-000000000001');

insert into public.company_members (company_id, user_id, role)
values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'admin'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'staff');

insert into public.products (id, company_id, name, item_type, inventory_mode, total_quantity, daily_price, event_price)
values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Produto protegido QA', 'toy', 'quantity', 1, 50, null),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'Produto do administrador QA', 'toy', 'quantity', 1, 50, null),
  ('a3000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'Máquina QA', 'machine', 'quantity', 0, 0, 150);

insert into public.customers (id, company_id, name)
values
  ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Cliente protegido QA');

select is(
  (select count(*)::integer from public.products
   where id = 'a3000000-0000-4000-8000-000000000003'
     and item_type = 'machine'),
  1,
  'machine catalog items are accepted by the unified catalog constraints'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
delete from public.products where id = 'a3000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.products where id = 'a3000000-0000-4000-8000-000000000001'),
  1,
  'employee cannot delete company products'
);

delete from public.customers where id = 'a4000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.customers where id = 'a4000000-0000-4000-8000-000000000001'),
  1,
  'employee cannot delete company customers'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
delete from public.products where id = 'a3000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.products where id = 'a3000000-0000-4000-8000-000000000001'),
  0,
  'company admin can delete company products'
);

delete from public.customers where id = 'a4000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.customers where id = 'a4000000-0000-4000-8000-000000000001'),
  0,
  'company admin can delete company customers'
);

reset role;
select * from finish();
rollback;
