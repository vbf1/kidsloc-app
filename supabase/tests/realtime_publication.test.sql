begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='company_members'), 'company membership changes are published');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='customers'), 'customer changes are published');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='products'), 'product changes are published');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rentals'), 'rental changes are published');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rental_quotes'), 'quote changes are published');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rental_contracts'), 'contract changes are published');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='financial_transactions'), 'financial transaction changes are published');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='payments'), 'payment changes are published');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='leads'), 'LeadFesta lead changes are published');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='team_messages'), 'team conversation changes are published');
select ok((select relreplident = 'f' from pg_class where oid = 'public.rentals'::regclass), 'rental deletes retain company data for realtime authorization');
select ok((select relreplident = 'f' from pg_class where oid = 'public.team_messages'::regclass), 'message deletes retain company data for realtime authorization');

select * from finish();
rollback;
