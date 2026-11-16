begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'platform-owner-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'company-a-admin-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'company-b-admin-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'company-a-staff-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'new-staff-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'new-admin-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'new-company-admin-role-model@example.test', '', now(), now());

insert into private.platform_owners (user_id)
values ('c1000000-0000-4000-8000-000000000001');

insert into public.companies (id, name, created_by)
values
  ('c2000000-0000-4000-8000-000000000001', 'Empresa A - modelo de cargos', 'c1000000-0000-4000-8000-000000000002'),
  ('c2000000-0000-4000-8000-000000000002', 'Empresa B - modelo de cargos', 'c1000000-0000-4000-8000-000000000003');

insert into public.company_members (company_id, user_id, role)
values
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002', 'admin'),
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000004', 'staff'),
  ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003', 'admin');

select is(
  (select count(*)::integer from private.platform_owners),
  1,
  'only one platform owner exists in the test fixture'
);

select throws_ok(
  $$ insert into private.platform_owners (user_id)
     values ('c1000000-0000-4000-8000-000000000002') $$,
  '23505',
  null,
  'database prevents registering a second platform owner'
);

select is(
  (select role from public.company_members
   where company_id = 'c2000000-0000-4000-8000-000000000001'
     and user_id = 'c1000000-0000-4000-8000-000000000002'),
  'admin',
  'company owner is represented by the admin role'
);

select throws_ok(
  $sql$ insert into public.company_members (company_id, user_id, role)
     values ('c2000000-0000-4000-8000-000000000001',
             'c1000000-0000-4000-8000-000000000005', 'owner') $sql$,
  '23514',
  null,
  'company membership cannot use the platform owner role'
);

select throws_ok(
  $sql$ insert into public.company_members (company_id, user_id, role)
     values ('c2000000-0000-4000-8000-000000000001',
             'c1000000-0000-4000-8000-000000000005', 'manager') $sql$,
  '23514',
  null,
  'company membership is limited to admin and staff roles'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);

select is(
  (select public.is_platform_owner_for_company()),
  false,
  'company administrator is not the platform owner'
);


select lives_ok(
  $$ select public.add_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000005',
       'staff'
     ) $$,
  'company admin can add an employee to their own company'
);

select throws_ok(
  $$ select public.add_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000006',
       'admin'
     ) $$,
  'P0001',
  'Somente o proprietário da plataforma pode atribuir outro administrador.',
  'company admin cannot promote another user to admin'
);

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000004', true);

select throws_ok(
  $$ select public.add_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000005',
       'staff'
     ) $$,
  'P0001',
  'Sem permissão para gerenciar usuários desta empresa.',
  'employee cannot manage company members'
);

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ select public.add_company_member(
       'c2000000-0000-4000-8000-000000000002',
       'c1000000-0000-4000-8000-000000000006',
       'admin'
     ) $$,
  'platform owner can assign an administrator in any company'
);

select throws_ok(
  $$ select public.ensure_team_group('c2000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'Acesso negado à equipe.',
  'platform owner cannot access or manage internal team chat'
);

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000007', true);

select is(
  (select role from public.company_members
   where company_id = public.create_company('Empresa criada pelo onboarding')
     and user_id = 'c1000000-0000-4000-8000-000000000007'),
  'admin',
  'new company creator receives the admin role'
);

reset role;
select * from finish();
rollback;
