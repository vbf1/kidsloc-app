begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select has_table('public', 'lead_pipeline_stages', 'LeadFesta pipeline stages table exists');
select has_table('public', 'leads', 'LeadFesta leads table exists');
select has_table('public', 'lead_activities', 'LeadFesta activity history table exists');
select has_table('private', 'company_feature_entitlements', 'LeadFesta entitlements are stored in the private schema');

select ok((select relrowsecurity from pg_class where oid = 'public.lead_pipeline_stages'::regclass), 'pipeline stages have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.leads'::regclass), 'leads have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.lead_activities'::regclass), 'lead activities have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'private.company_feature_entitlements'::regclass), 'entitlements have RLS enabled');

select has_function('public', 'leadfesta_is_available', array['uuid'], 'availability is checked through a database function');
select has_function('public', 'set_leadfesta_entitlement', array['uuid','boolean'], 'platform owner has a dedicated entitlement RPC');
select has_function('public', 'convert_lead_to_customer', array['uuid','uuid'], 'lead conversion is transactional');

select ok(not has_function_privilege('anon', 'public.set_leadfesta_entitlement(uuid,boolean)', 'EXECUTE'), 'anonymous users cannot enable or suspend LeadFesta');
select ok(not has_table_privilege('anon', 'public.leads', 'SELECT'), 'anonymous users cannot read lead data');

select * from finish();
rollback;
