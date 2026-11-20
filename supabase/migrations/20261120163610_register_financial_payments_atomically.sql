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
set search_path = public
as $$
declare
  v_transaction public.financial_transactions%rowtype;
  v_paid_total numeric(12,2);
  v_payment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'É necessário estar autenticado.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Informe um valor de recebimento maior que zero.';
  end if;

  select * into v_transaction
  from public.financial_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Lançamento financeiro não encontrado ou sem acesso.';
  end if;
  if not public.has_company_role(v_transaction.company_id, array['owner','admin']) then
    raise exception 'Somente proprietários e administradores podem registrar recebimentos.';
  end if;
  if v_transaction.transaction_type <> 'income' or v_transaction.status = 'cancelled' then
    raise exception 'Somente receitas em aberto podem receber pagamentos.';
  end if;

  select coalesce(sum(amount), 0) into v_paid_total
  from public.payments
  where transaction_id = p_transaction_id;

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
  if v_paid_total >= v_transaction.amount then
    update public.financial_transactions
    set status = 'paid', paid_at = coalesce(p_paid_at, current_date),
        payment_method = nullif(trim(p_payment_method), '')
    where id = p_transaction_id;
  end if;

  return v_payment_id;
end;
$$;

revoke all on function public.register_financial_payment(uuid, numeric, text, date, text) from public, anon;
grant execute on function public.register_financial_payment(uuid, numeric, text, date, text) to authenticated;
