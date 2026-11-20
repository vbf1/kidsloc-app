begin;

create extension if not exists pgtap with schema extensions;

select plan(36);


insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'lead-admin-one@example.test', '', now(), now()),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'lead-staff-one@example.test', '', now(), now()),
  ('20000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'lead-admin-two@example.test', '', now(), now()),
  ('20000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'lead-platform-owner@example.test', '', now(), now()),
  ('20000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'lead-company-owner@example.test', '', now(), now());

insert into public.companies (id, name, created_by)
values
  ('21000000-0000-4000-8000-000000000001', 'LeadFesta Empresa Um', '20000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000002', 'LeadFesta Empresa Dois', '20000000-0000-4000-8000-000000000003');

insert into public.company_members (company_id, user_id, role)
values
  ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'admin'),
  ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'staff'),
  ('21000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', 'admin'),
  ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', 'owner');

insert into private.platform_owners (user_id)
values ('20000000-0000-4000-8000-000000000004');

insert into private.company_feature_entitlements (company_id, feature_key, enabled)
values ('21000000-0000-4000-8000-000000000001', 'leadfesta', true);

insert into public.leads (company_id, stage_id, name, source)
select '21000000-0000-4000-8000-000000000001', s.id, 'Lead Empresa Um', 'Instagram'
from public.lead_pipeline_stages s
where s.company_id = '21000000-0000-4000-8000-000000000001' and s.name = 'Novo';

insert into public.leads (company_id, stage_id, name, source)
select '21000000-0000-4000-8000-000000000002', s.id, 'Lead Empresa Dois', 'Google'
from public.lead_pipeline_stages s
where s.company_id = '21000000-0000-4000-8000-000000000002' and s.name = 'Novo';

insert into public.lead_activities (company_id, lead_id, activity_type, body)
select l.company_id, l.id, 'note', 'Contato registrado na empresa um'
from public.leads l where l.company_id = '21000000-0000-4000-8000-000000000001';

insert into public.lead_activities (company_id, lead_id, activity_type, body)
select l.company_id, l.id, 'note', 'Contato registrado na empresa dois'
from public.leads l where l.company_id = '21000000-0000-4000-8000-000000000002';

select set_config('test.lead_stage_id', (
  select id::text from public.lead_pipeline_stages
  where company_id = '21000000-0000-4000-8000-000000000001' and name = 'Novo'
), true);

select is(
  (select count(*)::int from public.lead_pipeline_stages where company_id = '21000000-0000-4000-8000-000000000001'),
  6,
  'existing companies receive the six default pipeline stages'
);
select is(
  (select count(*)::int from public.lead_pipeline_stages where company_id = '21000000-0000-4000-8000-000000000002'),
  6,
  'each company receives an independent pipeline'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);

select ok(public.leadfesta_is_available('21000000-0000-4000-8000-000000000001'), 'company admin with active entitlement can use LeadFesta');
select is((select count(*)::int from public.leads where company_id = '21000000-0000-4000-8000-000000000001'), 1, 'admin can read leads from the entitled company');
select lives_ok(
  'select public.update_lead_stage(
    ''21000000-0000-4000-8000-000000000001'',
    (select id from public.leads where company_id = ''21000000-0000-4000-8000-000000000001'' limit 1),
    (select id from public.lead_pipeline_stages where company_id = ''21000000-0000-4000-8000-000000000001'' and name = ''Em contato'')
  )',
  'admin can change a lead stage through the transactional RPC'
);
select is(
  (select s.name from public.leads l join public.lead_pipeline_stages s on s.id = l.stage_id
   where l.company_id = '21000000-0000-4000-8000-000000000001' limit 1),
  'Em contato',
  'transactional stage change updates the lead'
);
select is(
  (select count(*)::int from public.lead_activities
   where company_id = '21000000-0000-4000-8000-000000000001' and activity_type = 'status_change'),
  1,
  'transactional stage change always records its history'
);

select is((select count(*)::int from public.leads where company_id = '21000000-0000-4000-8000-000000000002'), 0, 'admin cannot read another company leads');
insert into public.leads (company_id, stage_id, name, created_by, created_at)
values (
  '21000000-0000-4000-8000-000000000001',
  current_setting('test.lead_stage_id')::uuid,
  'Lead para teste de auditoria',
  '20000000-0000-4000-8000-000000000003',
  '2000-01-01 00:00:00+00'
);

select is(
  (select created_by from public.leads where name = 'Lead para teste de auditoria'),
  '20000000-0000-4000-8000-000000000001'::uuid,
  'lead creator is always taken from the authenticated session'
);
select ok(
  (select created_at > now() - interval '1 minute' from public.leads where name = 'Lead para teste de auditoria'),
  'lead creation timestamp cannot be backdated by the client'
);

update public.leads
set created_by = '20000000-0000-4000-8000-000000000003',
    created_at = '2000-01-01 00:00:00+00'
where name = 'Lead para teste de auditoria';

select ok(
  (select created_by = '20000000-0000-4000-8000-000000000001'::uuid
      and created_at > now() - interval '1 minute'
   from public.leads where name = 'Lead para teste de auditoria'),
  'lead creator and creation timestamp cannot be rewritten later'
);

insert into public.lead_activities (company_id, lead_id, activity_type, body, created_by, created_at)
select company_id, id, 'note', 'Teste de autoria protegida',
       '20000000-0000-4000-8000-000000000003',
       '2000-01-01 00:00:00+00'
from public.leads where name = 'Lead para teste de auditoria';

select is(
  (select created_by from public.lead_activities where body = 'Teste de autoria protegida'),
  '20000000-0000-4000-8000-000000000001'::uuid,
  'activity author is always taken from the authenticated session'
);
select ok(
  (select created_at > now() - interval '1 minute' from public.lead_activities where body = 'Teste de autoria protegida'),
  'activity creation timestamp cannot be backdated by the client'
);

select is((select count(*)::int from public.lead_activities where company_id = '21000000-0000-4000-8000-000000000001'), 2, 'admin can read own company activity history including the stage-change audit');
select is((select count(*)::int from public.lead_activities where company_id = '21000000-0000-4000-8000-000000000002'), 0, 'admin cannot read another company activity history');
select throws_ok(
  'select public.set_leadfesta_entitlement(''21000000-0000-4000-8000-000000000002'', true)',
  '42501',
  'Somente o proprietário da plataforma pode ativar ou suspender o LeadFesta.',
  'company admin cannot grant itself or another company the paid module'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);

select ok(not public.leadfesta_is_available('21000000-0000-4000-8000-000000000001'), 'staff does not inherit the admin entitlement');
select throws_ok(
  $sql$select public.update_lead_stage(
    '21000000-0000-4000-8000-000000000001',
    (select id from public.leads where company_id = '21000000-0000-4000-8000-000000000001' limit 1),
    current_setting('test.lead_stage_id')::uuid
  )$sql$,
  '42501',
  'Você não tem acesso ao LeadFesta desta empresa.',
  'staff cannot bypass LeadFesta access through the transactional stage RPC'
);

select is((select count(*)::int from public.leads where company_id = '21000000-0000-4000-8000-000000000001'), 0, 'staff cannot read leads even when the company has the module');
select is((select count(*)::int from public.lead_activities where company_id = '21000000-0000-4000-8000-000000000001'), 0, 'staff cannot read LeadFesta contact history');
select throws_ok(
  $sql$insert into public.leads (company_id, stage_id, name)
     values ('21000000-0000-4000-8000-000000000001', current_setting('test.lead_stage_id')::uuid, 'Tentativa de funcionário')$sql$,
  '42501',
  'new row violates row-level security policy for table "leads"',
  'staff cannot insert leads directly through the Data API'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000005', true);

select ok(public.leadfesta_is_available('21000000-0000-4000-8000-000000000001'), 'company owner with active entitlement can use LeadFesta');
select is((select count(*)::int from public.leads where company_id = '21000000-0000-4000-8000-000000000001'), 2, 'company owner can read leads from its entitled company');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);

select ok(not public.leadfesta_is_available('21000000-0000-4000-8000-000000000002'), 'company admin without an active entitlement is denied');
select is((select count(*)::int from public.leads where company_id = '21000000-0000-4000-8000-000000000002'), 0, 'disabled company cannot read its stored leads');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);

select ok(public.leadfesta_is_available('21000000-0000-4000-8000-000000000002'), 'platform owner has default LeadFesta access without company entitlement');
select is((select count(*)::int from public.leads where company_id = '21000000-0000-4000-8000-000000000002'), 1, 'platform owner can administer LeadFesta data globally');
select lives_ok(
  'select public.set_leadfesta_entitlement(''21000000-0000-4000-8000-000000000002'', true)',
  'platform owner can activate LeadFesta for a company'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);

select ok(public.leadfesta_is_available('21000000-0000-4000-8000-000000000002'), 'company admin gains access after platform owner activates the module');
select lives_ok(
  'select public.convert_lead_to_customer(''21000000-0000-4000-8000-000000000002'', (select id from public.leads where company_id = ''21000000-0000-4000-8000-000000000002'' limit 1))',
  'lead converts transactionally into a KidsLoc customer'
);

select is(
  (select count(*)::int from public.customers where company_id = '21000000-0000-4000-8000-000000000002' and name = 'Lead Empresa Dois'),
  1,
  'converted lead creates a customer in the same company'
);
select is(
  (select count(*)::int from public.leads where company_id = '21000000-0000-4000-8000-000000000002' and converted_customer_id is not null),
  1,
  'converted customer is linked back to the original lead'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select lives_ok(
  'select public.set_leadfesta_entitlement(''21000000-0000-4000-8000-000000000002'', false)',
  'platform owner can suspend LeadFesta without deleting data'
);

reset role;
select is(
  (select count(*)::int from public.leads where company_id = '21000000-0000-4000-8000-000000000002'),
  1,
  'suspension preserves the company lead record'
);
select is(
  (select count(*)::int from public.lead_activities where company_id = '21000000-0000-4000-8000-000000000002'),
  2,
  'suspension preserves the contact history'
);

insert into public.companies (id, name, created_by)
values ('21000000-0000-4000-8000-000000000003', 'LeadFesta Empresa Nova', '20000000-0000-4000-8000-000000000001');

select is(
  (select count(*)::int from public.lead_pipeline_stages where company_id = '21000000-0000-4000-8000-000000000003'),
  6,
  'new companies automatically receive default pipeline stages'
);

select * from finish();
rollback;
