-- Keep rental payment reversals auditable and exclude reversed amounts from balances.
alter table public.payments
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users(id) on delete set null,
  add column if not exists reversal_reason text;

create index if not exists payments_active_rental_stage_idx
  on public.payments (company_id, rental_id, notes)
  where reversed_at is null;

create or replace function public.get_rental_payment_summary(
  p_company_id uuid,
  p_rental_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_rental public.rentals%rowtype;
  v_transaction public.financial_transactions%rowtype;
  v_paid_total numeric(12,2) := 0;
  v_total_amount numeric(12,2);
  v_default_percentage numeric(5,2) := 30;
  v_deposit_target numeric(12,2) := 0;
  v_deposit_registered boolean := false;
  v_balance_registered boolean := false;
begin
  if auth.uid() is null or not public.has_company_role(p_company_id, array['owner','admin']) then
    raise exception 'Somente proprietários e administradores podem consultar os pagamentos da locação.';
  end if;
  select r.* into v_rental from public.rentals r
  where r.id = p_rental_id and r.company_id = p_company_id;
  if not found then raise exception 'Locação não encontrada nesta empresa.'; end if;

  select coalesce(s.default_deposit_percentage, 30)
    into v_default_percentage
  from public.company_settings s where s.company_id = p_company_id;
  v_default_percentage := coalesce(v_default_percentage, 30);

  select f.* into v_transaction from public.financial_transactions f
  where f.rental_id = p_rental_id and f.company_id = p_company_id
    and f.transaction_type = 'income' and f.category = 'locacao'
  order by f.created_at limit 1;

  if found then
    v_total_amount := v_transaction.amount;
    select coalesce(sum(p.amount), 0) into v_paid_total
    from public.payments p
    where p.company_id = p_company_id and p.transaction_id = v_transaction.id
      and p.reversed_at is null;
    if v_paid_total = 0 and v_transaction.status = 'paid'
       and not exists (select 1 from public.payments p where p.transaction_id = v_transaction.id) then
      v_paid_total := v_transaction.amount;
    end if;
    select
      coalesce(bool_or(p.notes = 'Sinal da locação'), false),
      coalesce(bool_or(p.notes = 'Quitação do saldo restante'), false)
    into v_deposit_registered, v_balance_registered
    from public.payments p
    where p.company_id = p_company_id and p.transaction_id = v_transaction.id
      and p.reversed_at is null;
  else
    v_total_amount := v_rental.total_amount;
    select coalesce(sum(p.amount), 0) into v_paid_total
    from public.payments p
    where p.company_id = p_company_id and p.rental_id = p_rental_id
      and p.transaction_id is null and p.reversed_at is null;
  end if;

  v_deposit_target := v_rental.deposit_amount;
  if v_rental.deposit_percentage is null then
    v_deposit_target := round(v_total_amount * v_default_percentage / 100, 2);
  end if;

  return jsonb_build_object(
    'total_amount', v_total_amount,
    'deposit_amount', v_deposit_target,
    'deposit_target_amount', v_deposit_target,
    'paid_total', v_paid_total,
    'deposit_paid', least(v_deposit_target, v_paid_total),
    'deposit_remaining', greatest(0, v_deposit_target - v_paid_total),
    'balance_remaining', greatest(0, v_total_amount - v_paid_total),
    'deposit_percentage', v_rental.deposit_percentage,
    'legacy_deposit_missing', v_rental.deposit_percentage is null,
    'default_deposit_percentage', v_default_percentage,
    'has_financial_transaction', v_transaction.id is not null,
    'deposit_registered', v_deposit_registered,
    'balance_registered', v_balance_registered
  );
end;
$function$;

create or replace function public.register_financial_payment(
  p_transaction_id uuid,
  p_amount numeric,
  p_payment_method text default null,
  p_paid_at date default current_date,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_transaction public.financial_transactions%rowtype;
  v_paid_total numeric(12,2);
  v_payment_id uuid;
begin
  if auth.uid() is null then raise exception 'É necessário estar autenticado.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Informe um valor de recebimento maior que zero.'; end if;

  select * into v_transaction
  from public.financial_transactions
  where id = p_transaction_id
  for update;
  if not found then raise exception 'Lançamento financeiro não encontrado ou sem acesso.'; end if;
  if not public.has_company_role(v_transaction.company_id, array['owner','admin']) then
    raise exception 'Somente proprietários e administradores podem registrar recebimentos.';
  end if;
  if v_transaction.transaction_type <> 'income' or v_transaction.status = 'cancelled' then
    raise exception 'Somente receitas em aberto podem receber pagamentos.';
  end if;

  select coalesce(sum(amount), 0) into v_paid_total
  from public.payments
  where transaction_id = p_transaction_id and reversed_at is null;
  if p_amount > v_transaction.amount - v_paid_total then
    raise exception 'O recebimento ultrapassa o saldo pendente.';
  end if;

  insert into public.payments (
    company_id, rental_id, transaction_id, amount, payment_method, paid_at, notes, created_by
  ) values (
    v_transaction.company_id, v_transaction.rental_id, p_transaction_id,
    p_amount, nullif(trim(p_payment_method), ''), coalesce(p_paid_at, current_date),
    nullif(trim(p_notes), ''), auth.uid()
  ) returning id into v_payment_id;

  v_paid_total := v_paid_total + p_amount;
  update public.financial_transactions
  set status = case when v_paid_total >= v_transaction.amount then 'paid' else 'pending' end,
      paid_at = case when v_paid_total >= v_transaction.amount then coalesce(p_paid_at, current_date) else null end,
      payment_method = case when v_paid_total >= v_transaction.amount then nullif(trim(p_payment_method), '') else null end
  where id = p_transaction_id;

  return v_payment_id;
end;
$function$;

revoke all on function public.register_financial_payment(uuid, numeric, text, date, text) from public, anon;
grant execute on function public.register_financial_payment(uuid, numeric, text, date, text) to authenticated;

create or replace function public.register_rental_payment_stage(
  p_company_id uuid,
  p_rental_id uuid,
  p_stage text,
  p_payment_method text default null,
  p_paid_at date default current_date,
  p_apply_default_deposit boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_rental public.rentals%rowtype;
  v_transaction public.financial_transactions%rowtype;
  v_paid_total numeric(12,2) := 0;
  v_target numeric(12,2);
  v_amount numeric(12,2);
  v_payment_id uuid;
  v_notes text;
  v_default_percentage numeric(5,2) := 30;
begin
  if auth.uid() is null then raise exception 'É necessário estar autenticado.'; end if;
  if not public.has_company_role(p_company_id, array['owner','admin']) then
    raise exception 'Somente proprietários e administradores podem registrar recebimentos.';
  end if;
  if p_stage is null or p_stage not in ('deposit','balance') then
    raise exception 'Etapa de pagamento inválida.';
  end if;

  select r.* into v_rental from public.rentals r
  where r.id = p_rental_id and r.company_id = p_company_id
  for update;
  if not found then raise exception 'Locação não encontrada nesta empresa.'; end if;
  if v_rental.status = 'cancelled' then
    raise exception 'Não é possível registrar pagamento de uma locação cancelada.';
  end if;
  if v_rental.total_amount <= 0 then
    raise exception 'O valor total da locação precisa ser maior que zero.';
  end if;

  if p_stage = 'deposit' and v_rental.deposit_percentage is null then
    if not p_apply_default_deposit then
      raise exception 'Esta locação antiga ainda não tem sinal definido. Confirme a aplicação do percentual padrão nas configurações.';
    end if;
    select coalesce(s.default_deposit_percentage, 30)
      into v_default_percentage
    from public.company_settings s where s.company_id = p_company_id;
    v_default_percentage := coalesce(v_default_percentage, 30);
    update public.rentals
    set deposit_amount = round(v_rental.total_amount * v_default_percentage / 100, 2),
        deposit_percentage = v_default_percentage
    where id = p_rental_id and company_id = p_company_id
    returning * into v_rental;
  end if;

  select f.* into v_transaction from public.financial_transactions f
  where f.rental_id = p_rental_id and f.company_id = p_company_id
    and f.transaction_type = 'income' and f.category = 'locacao'
  order by f.created_at limit 1 for update;
  if not found then
    insert into public.financial_transactions(
      company_id, rental_id, transaction_type, category, description,
      amount, due_date, status, created_by
    ) values (
      p_company_id, p_rental_id, 'income', 'locacao',
      'Locação #' || v_rental.rental_number, v_rental.total_amount,
      v_rental.start_date, 'pending', auth.uid()
    ) returning * into v_transaction;
  end if;
  if v_transaction.status = 'cancelled' then
    raise exception 'O lançamento financeiro desta locação está cancelado.';
  end if;

  select coalesce(sum(p.amount), 0) into v_paid_total
  from public.payments p
  where p.company_id = p_company_id and p.transaction_id = v_transaction.id
    and p.reversed_at is null;

  if p_stage = 'deposit' then
    v_target := least(v_rental.deposit_amount, v_transaction.amount);
    v_amount := greatest(0, v_target - v_paid_total);
    v_notes := 'Sinal da locação';
    if v_target <= 0 then raise exception 'O percentual padrão está zerado. Não há sinal a registrar.'; end if;
    if v_amount <= 0 then raise exception 'O sinal desta locação já foi registrado.'; end if;
  else
    v_amount := greatest(0, v_transaction.amount - v_paid_total);
    v_notes := 'Quitação do saldo restante';
    if v_amount <= 0 then raise exception 'Esta locação já está totalmente quitada.'; end if;
  end if;

  v_payment_id := public.register_financial_payment(
    v_transaction.id, v_amount, p_payment_method, coalesce(p_paid_at, current_date), v_notes
  );
  return v_payment_id;
end;
$function$;

create or replace function public.reverse_rental_payment_stage(
  p_company_id uuid,
  p_rental_id uuid,
  p_stage text,
  p_reason text default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_transaction_id uuid;
  v_reversed_count integer;
  v_paid_total numeric(12,2);
  v_total_amount numeric(12,2);
begin
  if auth.uid() is null then raise exception 'É necessário estar autenticado.'; end if;
  if not public.has_company_role(p_company_id, array['owner','admin']) then
    raise exception 'Somente proprietários e administradores podem estornar recebimentos.';
  end if;
  if p_stage is null or p_stage not in ('deposit','balance') then raise exception 'Etapa de pagamento inválida.'; end if;

  perform 1 from public.rentals r
  where r.id = p_rental_id and r.company_id = p_company_id
  for update;
  if not found then raise exception 'Locação não encontrada nesta empresa.'; end if;

  select f.id, f.amount into v_transaction_id, v_total_amount
  from public.financial_transactions f
  where f.rental_id = p_rental_id and f.company_id = p_company_id
    and f.transaction_type = 'income' and f.category = 'locacao'
  order by f.created_at limit 1 for update;
  if v_transaction_id is null then raise exception 'Lançamento financeiro da locação não encontrado.'; end if;

  update public.payments p
  set reversed_at = now(),
      reversed_by = auth.uid(),
      reversal_reason = nullif(trim(p_reason), '')
  where p.company_id = p_company_id
    and p.transaction_id = v_transaction_id
    and p.reversed_at is null
    and p.notes = case when p_stage = 'deposit' then 'Sinal da locação' else 'Quitação do saldo restante' end;
  get diagnostics v_reversed_count = row_count;
  if v_reversed_count = 0 then raise exception 'Não há recebimento ativo desta etapa para estornar.'; end if;

  select coalesce(sum(p.amount), 0) into v_paid_total
  from public.payments p
  where p.company_id = p_company_id and p.transaction_id = v_transaction_id
    and p.reversed_at is null;

  update public.financial_transactions
  set status = case when v_paid_total >= v_total_amount then 'paid' else 'pending' end,
      paid_at = case when v_paid_total >= v_total_amount then paid_at else null end,
      payment_method = case when v_paid_total >= v_total_amount then payment_method else null end
  where id = v_transaction_id;

  return v_reversed_count;
end;
$function$;

revoke all on function public.reverse_rental_payment_stage(uuid, uuid, text, text) from public, anon;
grant execute on function public.reverse_rental_payment_stage(uuid, uuid, text, text) to authenticated;
