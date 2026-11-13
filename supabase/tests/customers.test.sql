begin;
create extension if not exists pgtap with schema extensions;
select plan(7);
select has_table('public', 'customers', 'customers table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.customers'::regclass), 'RLS is enabled on customers');
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'customers-owner@example.test', '', now(), now()),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'customers-outsider@example.test', '', now(), now());
insert into public.companies (id, name, created_by)
values
  ('30000000-0000-4000-8000-000000000001', 'Empresa dona', '20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', 'Outra empresa', '20000000-0000-4000-8000-000000000002');
insert into public.company_members (company_id, user_id, role)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'owner'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'owner');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ insert into public.customers (id, company_id, name, phone)
     values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Cliente da empresa dona', '31999990000') $$,
  'company member can create a customer for their own company'
);
select is((select count(*)::int from public.customers), 1, 'company member can read their own customer');
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.customers), 0, 'another company cannot read this company customer');
select throws_ok(
  $$ insert into public.customers (company_id, name)
     values ('30000000-0000-4000-8000-000000000001', 'Tentativa externa') $$,
  '42501', 'new row violates row-level security policy for table "customers"',
  'another company cannot create a customer for this company'
);
update public.customers
set name = 'Nome alterado indevidamente'
where id = '40000000-0000-4000-8000-000000000001';
reset role;
select is((select name from public.customers where id = '40000000-0000-4000-8000-000000000001'),
  'Cliente da empresa dona', 'another company cannot update this company customer');
select * from finish();
rollback;
