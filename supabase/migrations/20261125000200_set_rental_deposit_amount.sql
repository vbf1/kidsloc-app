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

  select r.* into v_rental
  from public.rentals r
  where r.id = p_rental_id and r.company_id = p_company_id
  for update;
  if not found then
    raise exception 'Locação não encontrada nesta empresa.';
  end if;
  if not public.can_manage_rental(p_company_id, p_rental_id) then
    raise exception 'Você não tem permissão para editar esta locação.';
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
