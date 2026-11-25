create or replace function public.set_rental_deposit_amount(
  p_company_id uuid,
  p_rental_id uuid,
  p_deposit_amount numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_rental public.rentals%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if not public.is_company_member(p_company_id) then
    raise exception 'Acesso negado à empresa.';
  end if;
  if p_deposit_amount is null or p_deposit_amount < 0 then
    raise exception 'Informe um valor de sinal válido.';
  end if;

  if not public.can_manage_rental(p_company_id, p_rental_id) then
    raise exception 'Você não tem permissão para editar esta locação.';
  end if;
  select r.* into v_rental
  from public.rentals r
  where r.id = p_rental_id and r.company_id = p_company_id
  for update;
  if not found then
    raise exception 'Locação não encontrada nesta empresa.';
  end if;
  if p_deposit_amount > v_rental.total_amount then
    raise exception 'O sinal não pode ser maior que o valor total da locação.';
  end if;

  update public.rentals
  set deposit_amount = p_deposit_amount
  where id = p_rental_id and company_id = p_company_id;
end;
$function$;

revoke all on function public.set_rental_deposit_amount(uuid, uuid, numeric) from public, anon;
grant execute on function public.set_rental_deposit_amount(uuid, uuid, numeric) to authenticated;

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
begin
  if auth.uid() is null or not public.has_company_role(p_company_id, array['owner','admin']) then
    raise exception 'Somente proprietários e administradores podem consultar os pagamentos da locação.';
  end if;
  select r.* into v_rental from public.rentals r
  where r.id = p_rental_id and r.company_id = p_company_id;
  if not found then raise exception 'Locação não encontrada nesta empresa.'; end if;

  select f.* into v_transaction from public.financial_transactions f
  where f.rental_id = p_rental_id and f.company_id = p_company_id
    and f.transaction_type = 'income' and f.category = 'locacao'
  order by f.created_at limit 1;

  if found then
    select coalesce(sum(p.amount), 0) into v_paid_total
    from public.payments p where p.transaction_id = v_transaction.id;
    v_total_amount := v_transaction.amount;
    if v_paid_total = 0 and v_transaction.status = 'paid' then
      v_paid_total := v_transaction.amount;
    end if;
  else
    v_total_amount := v_rental.total_amount;
  end if;

  return jsonb_build_object(
    'total_amount', v_total_amount,
    'deposit_amount', v_rental.deposit_amount,
    'paid_total', v_paid_total,
    'deposit_paid', least(v_rental.deposit_amount, v_paid_total),
    'deposit_remaining', greatest(0, v_rental.deposit_amount - v_paid_total),
    'balance_remaining', greatest(0, v_total_amount - v_paid_total)
  );
end;
$function$;

create or replace function public.register_rental_payment_stage(
  p_company_id uuid,
  p_rental_id uuid,
  p_stage text,
  p_payment_method text default null,
  p_paid_at date default current_date
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
begin
  if auth.uid() is null then raise exception 'É necessário estar autenticado.'; end if;
  if not public.has_company_role(p_company_id, array['owner','admin']) then
    raise exception 'Somente proprietários e administradores podem registrar recebimentos.';
  end if;
  if p_stage is null or p_stage not in ('deposit','balance') then raise exception 'Etapa de pagamento inválida.'; end if;

  select r.* into v_rental from public.rentals r
  where r.id = p_rental_id and r.company_id = p_company_id
  for update;
  if not found then raise exception 'Locação não encontrada nesta empresa.'; end if;

  select f.* into v_transaction from public.financial_transactions f
  where f.rental_id = p_rental_id and f.company_id = p_company_id
    and f.transaction_type = 'income' and f.category = 'locacao'
  order by f.created_at limit 1 for update;
  if not found then raise exception 'Lançamento financeiro da locação não encontrado.'; end if;
  if v_transaction.status = 'cancelled' then
    raise exception 'Não é possível registrar pagamento de uma locação cancelada.';
  end if;

  select coalesce(sum(p.amount), 0) into v_paid_total
  from public.payments p where p.transaction_id = v_transaction.id;
  if v_paid_total = 0 and v_transaction.status = 'paid' then
    v_paid_total := v_transaction.amount;
  end if;

  if p_stage = 'deposit' then
    v_target := least(v_rental.deposit_amount, v_transaction.amount);
    v_amount := greatest(0, v_target - v_paid_total);
    v_notes := 'Sinal da locação';
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

revoke all on function public.get_rental_payment_summary(uuid, uuid) from public, anon;
grant execute on function public.get_rental_payment_summary(uuid, uuid) to authenticated;
revoke all on function public.register_rental_payment_stage(uuid, uuid, text, text, date) from public, anon;
grant execute on function public.register_rental_payment_stage(uuid, uuid, text, text, date) to authenticated;
