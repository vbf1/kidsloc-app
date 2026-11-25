begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('d1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'core-admin@example.test', '', now(), now()),
  ('d1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'core-staff@example.test', '', now(), now());

insert into public.companies (id, name, created_by)
values ('d2000000-0000-4000-8000-000000000001', 'Empresa QA fluxos principais', 'd1000000-0000-4000-8000-000000000001');

insert into public.company_members (company_id, user_id, role)
values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'admin'),
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'staff');

insert into public.customers (id, company_id, name, phone)
values ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'Cliente QA', '31999990000');

insert into public.products (id, company_id, name, item_type, inventory_mode, total_quantity, daily_price, active)
values ('d4000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'Brinquedo QA', 'toy', 'quantity', 2, 50, true);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);

select set_config(
  'test.quote_id',
  public.create_rental_quote_with_items(
    'd2000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',
    current_date + 7,
    current_date + 10,
    time '09:00',
    time '18:00',
    'delivery',
    'Rua QA, 100',
    10,
    5,
    'Teste automatizado do orçamento',
    jsonb_build_array(jsonb_build_object(
      'product_id', 'd4000000-0000-4000-8000-000000000001',
      'quantity', 2,
      'unit_price', 50
    ))
  )::text,
  true
);

select ok(current_setting('test.quote_id', true) is not null, 'admin can create a quote with items');
select is(
  (select subtotal from public.rental_quotes where id = current_setting('test.quote_id')::uuid),
  100::numeric,
  'quote subtotal is calculated from its items'
);
select is(
  (select total_amount from public.rental_quotes where id = current_setting('test.quote_id')::uuid),
  105::numeric,
  'quote total includes delivery fee and discount'
);
select is(
  (select count(*)::integer from public.rental_quote_items where quote_id = current_setting('test.quote_id')::uuid),
  1,
  'quote item is stored with company scope'
);

update public.rental_quotes
set status = 'accepted'
where id = current_setting('test.quote_id')::uuid;

select set_config(
  'test.rental_id',
  public.convert_rental_quote_to_rental(current_setting('test.quote_id')::uuid)::text,
  true
);

select ok(current_setting('test.rental_id', true) is not null, 'accepted quote converts into a rental');
select is(
  (select status from public.rentals where id = current_setting('test.rental_id')::uuid),
  'pending',
  'converted rental starts in pending status'
);
select lives_ok(
  $ select public.set_rental_deposit_amount(
       'd2000000-0000-4000-8000-000000000001', current_setting('test.rental_id')::uuid, 25
     ) $,
  'company admin can record a rental deposit'
);
select is(
  (select deposit_amount from public.rentals where id = current_setting('test.rental_id')::uuid),
  25::numeric,
  'rental deposit amount is persisted'
);
select is(
  (public.get_rental_payment_summary(
    'd2000000-0000-4000-8000-000000000001', current_setting('test.rental_id')::uuid
  ) ->> 'deposit_remaining')::numeric,
  25::numeric,
  'payment summary exposes the pending deposit'
);
select is(
  (public.get_rental_payment_summary(
    'd2000000-0000-4000-8000-000000000001', current_setting('test.rental_id')::uuid
  ) ->> 'balance_remaining')::numeric,
  105::numeric,
  'payment summary exposes the full remaining balance'
);
select throws_ok(
  $ select public.set_rental_deposit_amount(
       'd2000000-0000-4000-8000-000000000001', current_setting('test.rental_id')::uuid, 106
     ) $,
  'P0001',
  'O sinal não pode ser maior que o valor total da locação.',
  'rental deposit cannot exceed the rental total'
);
select is(
  (select count(*)::integer from public.rental_items where rental_id = current_setting('test.rental_id')::uuid),
  1,
  'converted rental contains its reserved item'
);
select is(
  (select count(*)::integer from public.financial_transactions
   where rental_id = current_setting('test.rental_id')::uuid and transaction_type = 'income'),
  1,
  'rental creation automatically creates one financial income entry'
);
select is(
  (select amount from public.financial_transactions
   where rental_id = current_setting('test.rental_id')::uuid and transaction_type = 'income'),
  105::numeric,
  'automatic financial income matches the rental total'
);

select set_config(
  'test.transaction_id',
  (select id::text from public.financial_transactions
   where rental_id = current_setting('test.rental_id')::uuid and transaction_type = 'income'),
  true
);

select lives_ok(
  $$ select public.register_financial_payment(
       current_setting('test.transaction_id')::uuid, 40, 'Pix', current_date, 'Primeira parcela'
     ) $$,
  'company admin can register a partial payment'
);
select is(
  (select status from public.financial_transactions where id = current_setting('test.transaction_id')::uuid),
  'pending',
  'partial payment keeps the transaction pending'
);
select lives_ok(
  $$ select public.register_financial_payment(
       current_setting('test.transaction_id')::uuid, 65, 'Pix', current_date, 'Quitação'
     ) $$,
  'company admin can register the remaining payment'
);
select is(
  (select status from public.financial_transactions where id = current_setting('test.transaction_id')::uuid),
  'paid',
  'transaction becomes paid when all installments are received'
);
select is(
  (select count(*)::integer from public.payments where transaction_id = current_setting('test.transaction_id')::uuid),
  2,
  'each installment is preserved as a separate payment record'
);

select throws_ok(
  $$ select public.create_rental_with_items(
       'd2000000-0000-4000-8000-000000000001',
       'd3000000-0000-4000-8000-000000000001',
       current_date + 10,
       current_date + 10,
       'pending',
       'delivery',
       50,
       jsonb_build_array(jsonb_build_object(
         'product_id', 'd4000000-0000-4000-8000-000000000001',
         'quantity', 1,
         'unit_price', 50
       )),
       'Rua QA, 100',
       array[]::uuid[],
       time '10:00',
       time '11:00'
     ) $$,
  'P0001',
  'Estoque insuficiente para o brinquedo: Brinquedo QA.',
  'overlapping rental cannot exceed available quantity'
);

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $ select public.set_rental_deposit_amount(
       'd2000000-0000-4000-8000-000000000001', current_setting('test.rental_id')::uuid, 30
     ) $,
  'P0001',
  'Você não tem permissão para editar esta locação.',
  'staff without rental assignment cannot edit the deposit'
);
select throws_ok(
  $$ select public.register_financial_payment(
       current_setting('test.transaction_id')::uuid, 1, 'Pix', current_date, null
     ) $$,
  'P0001',
  'Lançamento financeiro não encontrado ou sem acesso.',
  'staff cannot register financial payments'
);

reset role;
select set_config(
  'test.contract_token',
  'kidsloc-public-contract-test-token-2026-unique',
  true
);
insert into public.rental_contracts (
  company_id, rental_id, status, signature_method, contract_snapshot,
  token_hash, token_expires_at, sent_at, created_by
)
values (
  'd2000000-0000-4000-8000-000000000001',
  current_setting('test.rental_id')::uuid,
  'sent',
  'in_app',
  jsonb_build_object('test', true, 'company', 'Empresa QA fluxos principais'),
  encode(extensions.digest(convert_to(current_setting('test.contract_token'), 'UTF8'), 'sha256'), 'hex'),
  now() + interval '1 day',
  now(),
  'd1000000-0000-4000-8000-000000000001'
);

set local role anon;
select is(
  (public.get_public_rental_contract(current_setting('test.contract_token')) ->> 'status'),
  'viewed',
  'public token can retrieve a sent contract and mark it viewed'
);
select is(
  public.sign_public_rental_contract(
    current_setting('test.contract_token'),
    'Cliente QA',
    '12345678900',
    '31999990000',
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    'Li e aceito os termos do contrato.',
    'KidsLoc automated test'
  ),
  true,
  'public token can sign the contract with consent and signature evidence'
);

reset role;
select is(
  (select status from public.rental_contracts
   where token_hash = encode(extensions.digest(convert_to(current_setting('test.contract_token'), 'UTF8'), 'sha256'), 'hex')),
  'signed',
  'signed contract status is persisted'
);
select ok(
  (select signed_at is not null and signer_name = 'Cliente QA'
          and signer_document = '12345678900'
          and signature_svg like '<svg%'
          and consent_text = 'Li e aceito os termos do contrato.'
   from public.rental_contracts
   where token_hash = encode(extensions.digest(convert_to(current_setting('test.contract_token'), 'UTF8'), 'sha256'), 'hex')),
  'contract stores signer identity, consent, timestamp and signature evidence'
);

select * from finish();
rollback;
