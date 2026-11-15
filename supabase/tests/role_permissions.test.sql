begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'permissions-owner@example.test', '', now(), now()),
  ('a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'permissions-admin@example.test', '', now(), now()),
  ('a1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'permissions-manager@example.test', '', now(), now()),
  ('a1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'permissions-staff@example.test', '', now(), now());

insert into public.companies (id, name, created_by)
values ('a2000000-0000-4000-8000-000000000001', 'Empresa QA permissões', 'a1000000-0000-4000-8000-000000000001');

insert into public.company_members (company_id, user_id, role)
values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'admin'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'manager'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'staff');

insert into public.products (id, company_id, name, item_type, inventory_mode, total_quantity, daily_price)
values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Produto protegido QA', 'toy', 'quantity', 1, 50),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'Produto do proprietário QA', 'toy', 'quantity', 1, 50);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
delete from public.products where id = 'a3000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.products where id = 'a3000000-0000-4000-8000-000000000001'),
  1,
  'staff cannot delete company products'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
delete from public.products where id = 'a3000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.products where id = 'a3000000-0000-4000-8000-000000000001'),
  1,
  'manager cannot delete company products'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
delete from public.products where id = 'a3000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.products where id = 'a3000000-0000-4000-8000-000000000001'),
  0,
  'administrator can delete company products'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
delete from public.products where id = 'a3000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::integer from public.products where id = 'a3000000-0000-4000-8000-000000000002'),
  0,
  'owner can delete company products'
);

reset role;
select * from finish();
rollback;
