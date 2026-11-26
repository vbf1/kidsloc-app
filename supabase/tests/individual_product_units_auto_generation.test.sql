begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('e1000000-0000-4000-8000-000000000001','authenticated','authenticated','simple-stock@example.test','',now(),now());
insert into public.companies (id, name, created_by)
values ('e2000000-0000-4000-8000-000000000001','Empresa QA estoque simples','e1000000-0000-4000-8000-000000000001');
insert into public.company_members (company_id, user_id, role)
values ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','admin');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
select lives_ok(
 $$ insert into public.products (id,company_id,name,item_type,inventory_mode,total_quantity,daily_price,event_price,active)
    values ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Cama elástica QA','toy','individual',2,80,null,true) $$,
 'product saves without individual-unit registration'
);
select is((select inventory_mode from public.products where id='e3000000-0000-4000-8000-000000000001'),'quantity','individual mode is normalized to simple quantity');
select is((select total_quantity from public.products where id='e3000000-0000-4000-8000-000000000001'),2,'declared quantity is preserved');
select is((select count(*)::integer from public.product_units where product_id='e3000000-0000-4000-8000-000000000001'),0,'no physical units are generated');
update public.products set total_quantity=3 where id='e3000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.product_units where product_id='e3000000-0000-4000-8000-000000000001'),0,'changing quantity does not create physical units');
reset role;
select * from finish();
rollback;
