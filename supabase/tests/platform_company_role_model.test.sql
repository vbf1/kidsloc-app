begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'platform-owner-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'company-a-admin-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'company-b-admin-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'company-a-staff-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'new-staff-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'new-admin-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'new-company-admin-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'invite-staff-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'invite-admin-role-model@example.test', '', now(), now()),
  ('c1000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 'invite-denied-role-model@example.test', '', now(), now());

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
  (select count(*)::integer from public.company_members
   where user_id = 'c1000000-0000-4000-8000-000000000001'),
  0,
  'platform owner has no company membership'
);

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
  $q$ select public.add_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000006',
       'admin'
     ) $q$,
  'P0001',
  'Somente o proprietário da plataforma pode atribuir outro administrador.',
  'company admin cannot promote another user to admin'
);

select lives_ok(
  $q$ select public.invite_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000008',
       'staff'
     ) $q$,
  'company admin can invite an employee through the transactional function'
);

select throws_ok(
  $q$ select public.invite_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000009',
       'admin'
     ) $q$,
  '42501',
  'Administradores só podem adicionar funcionários',
  'company admin cannot invite another admin'
);


select throws_ok(
  $q$ select public.invite_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000001',
       'staff'
     ) $q$,
  '42501',
  'O proprietário da plataforma não pode ser vinculado a uma empresa.',
  'company admin cannot invite the platform owner into a company'
);

select throws_ok(
  $q$ select public.manage_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000004',
       'change_role',
       'admin'
     ) $q$,
  '42501',
  'Administradores só podem gerenciar funcionários',
  'company admin cannot promote an employee to admin'
);

select lives_ok(
  $q$ select public.manage_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000008',
       'remove',
       null
     ) $q$,
  'company admin can remove an employee transactionally'
);

select throws_ok(
  $q$ select public.manage_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000002',
       'remove',
       null
     ) $q$,
  '42501',
  'Você não pode alterar ou remover seu próprio acesso',
  'company admin cannot remove their own membership'
);

update public.company_members
set role = 'admin'
where company_id = 'c2000000-0000-4000-8000-000000000001'
  and user_id = 'c1000000-0000-4000-8000-000000000005';

select is(
  (select role from public.company_members
   where company_id = 'c2000000-0000-4000-8000-000000000001'
     and user_id = 'c1000000-0000-4000-8000-000000000005'),
  'staff',
  'company admin cannot bypass the role-management RPC with direct table UPDATE'
);

delete from public.company_members
where company_id = 'c2000000-0000-4000-8000-000000000001'
  and user_id = 'c1000000-0000-4000-8000-000000000005';

select is(
  (select count(*)::integer from public.company_members
   where company_id = 'c2000000-0000-4000-8000-000000000001'
     and user_id = 'c1000000-0000-4000-8000-000000000005'),
  1,
  'company admin cannot bypass transactional member removal with direct table DELETE'
);

select lives_ok(
  $sql$ select public.ensure_team_group('c2000000-0000-4000-8000-000000000001') $sql$,
  'company admin can create the internal team group'
);

select lives_ok(
  $sql$ insert into public.team_messages (company_id, conversation_id, sender_id, body)
     select c.company_id, c.id, (select auth.uid()), 'Mensagem interna de teste'
     from public.team_conversations c
     where c.company_id = 'c2000000-0000-4000-8000-000000000001'
       and c.conversation_type = 'team' $sql$,
  'company admin can send a team message'
);

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000004', true);

select throws_ok(
  $q$ select public.add_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000005',
       'staff'
     ) $q$,
  'P0001',
  'Sem permissão para gerenciar usuários desta empresa.',
  'employee cannot manage company members'
);

select throws_ok(
  $q$ select public.invite_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000010',
       'staff'
     ) $q$,
  '42501',
  'Somente o proprietário da plataforma ou administrador pode convidar membros',
  'employee cannot invite company members'
);

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $q$ insert into public.company_members (company_id, user_id, role)
     values (
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000001',
       'admin'
     ) $q$,
  '42501',
  'new row violates row-level security policy for table "company_members"',
  'platform owner cannot bypass membership RPCs with direct table INSERT'
);

update public.company_members
set role = 'staff'
where company_id = 'c2000000-0000-4000-8000-000000000001'
  and user_id = 'c1000000-0000-4000-8000-000000000004';

select is(
  (select role from public.company_members
   where company_id = 'c2000000-0000-4000-8000-000000000001'
     and user_id = 'c1000000-0000-4000-8000-000000000004'),
  'staff',
  'platform owner cannot bypass membership RPCs with direct table UPDATE'
);

delete from public.company_members
where company_id = 'c2000000-0000-4000-8000-000000000001'
  and user_id = 'c1000000-0000-4000-8000-000000000004';

select is(
  (select count(*)::integer from public.company_members
   where company_id = 'c2000000-0000-4000-8000-000000000001'
     and user_id = 'c1000000-0000-4000-8000-000000000004'),
  1,
  'platform owner cannot bypass membership RPCs with direct table DELETE'
);

select is(
  (select count(*)::integer from public.team_conversations
   where company_id = 'c2000000-0000-4000-8000-000000000001'),
  0,
  'platform owner cannot read company team conversations'
);

select is(
  (select count(*)::integer from public.team_messages
   where company_id = 'c2000000-0000-4000-8000-000000000001'),
  0,
  'platform owner cannot read company team messages'
);

select is(
  (select count(*)::integer from public.team_conversation_members
   where company_id = 'c2000000-0000-4000-8000-000000000001'),
  0,
  'platform owner cannot read company team conversation participants'
);

select throws_ok(
  $q$ select public.add_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000001',
       'admin'
     ) $q$,
  '42501',
  'O proprietário da plataforma não pode ser vinculado a uma empresa.',
  'platform owner cannot add themselves as a company member'
);



select throws_ok(
  $q$ select public.create_company('Empresa indevida do proprietário global') $q$,
  '42501',
  'O proprietário da plataforma não pode criar uma empresa.',
  'platform owner cannot create a company'
);

select throws_ok(
  $q$ select public.add_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000005',
       'manager'
     ) $q$,
  'P0001',
  'Perfil inválido. Use Administrador ou Funcionário.',
  'legacy manager role is rejected by the direct membership RPC'
);

select throws_ok(
  $q$ select public.invite_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000005',
       'manager'
     ) $q$,
  '22023',
  'Cargo inválido',
  'legacy manager role is rejected by the invitation RPC'
);




select lives_ok(
  $q$ select public.manage_company_member(
       'c2000000-0000-4000-8000-000000000001',
       'c1000000-0000-4000-8000-000000000004',
       'change_role',
       'admin'
     ) $q$,
  'platform owner can promote an employee to company admin'
);


select lives_ok(
  $q$ select public.invite_company_member(
       'c2000000-0000-4000-8000-000000000002',
       'c1000000-0000-4000-8000-000000000009',
       'admin'
     ) $q$,
  'platform owner can invite an administrator in any company'
);

select lives_ok(
  $q$ select public.manage_company_member(
       'c2000000-0000-4000-8000-000000000002',
       'c1000000-0000-4000-8000-000000000009',
       'remove',
       null
     ) $q$,
  'platform owner can remove an administrator from any company'
);

select lives_ok(
  $q$ select public.add_company_member(
       'c2000000-0000-4000-8000-000000000002',
       'c1000000-0000-4000-8000-000000000006',
       'admin'
     ) $q$,
  'platform owner can assign an administrator in any company'
);

select throws_ok(
  $$ select public.ensure_team_group('c2000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'Acesso negado à equipe.',
  'platform owner cannot access or manage internal team chat'
);

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000007', true);

select lives_ok(
  $$ select public.create_company('Empresa criada pelo onboarding') $$,
  'new company creator can complete onboarding'
);

select is(
  (select cm.role
   from public.company_members cm
   join public.companies co on co.id = cm.company_id
   where co.name = 'Empresa criada pelo onboarding'
     and cm.user_id = 'c1000000-0000-4000-8000-000000000007'),
  'admin',
  'new company creator receives the admin role'
);

reset role;
select * from finish();
rollback;
