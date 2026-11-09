begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'companies', 'companies table exists');
select has_table('public', 'company_members', 'company membership table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled on profiles'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.companies'::regclass),
  'RLS is enabled on companies'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.company_members'::regclass),
  'RLS is enabled on company_members'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'foundation-owner@example.test', '', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'foundation-staff@example.test', '', now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'foundation-outsider@example.test', '', now(), now());

select is(
  (select count(*)::int from public.profiles
   where id = '10000000-0000-4000-8000-000000000001'),
  1,
  'new auth user receives a profile'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ select public.create_company('Empresa de Teste') $$,
  'authenticated user can create the first company'
);

select is(
  (select count(*)::int from public.company_members
   where user_id = '10000000-0000-4000-8000-000000000001' and role = 'owner'),
  1,
  'company creator becomes owner'
);

select throws_ok(
  $$ select public.create_company('Segunda Empresa') $$,
  '23505',
  'Esta conta já está vinculada a uma empresa.',
  'same account cannot create a second company'
);

reset role;
insert into public.company_members (company_id, user_id, role)
select id, '10000000-0000-4000-8000-000000000002', 'staff'
from public.companies
where created_by = '10000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$ select public.create_company('Empresa do Funcionário') $$,
  '23505',
  'Esta conta já está vinculada a uma empresa.',
  'account already linked as staff cannot create another company'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);

select is(
  (select count(*)::int from public.companies),
  0,
  'user outside the company cannot read its data'
);

reset role;
set local role anon;
select throws_ok(
  $$ select public.create_company('Empresa Anônima') $$,
  '42501',
  null,
  'anonymous role cannot execute company creation'
);

select * from finish();
rollback;
