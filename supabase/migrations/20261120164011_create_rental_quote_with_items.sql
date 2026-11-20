create or replace function public.create_rental_quote_with_items(
  p_company_id uuid,
  p_customer_id uuid,
  p_valid_until date,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_delivery_method text,
  p_delivery_address text,
  p_delivery_fee numeric,
  p_discount numeric,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quote_id uuid;
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2);
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_price numeric(12,2);
begin
  if auth.uid() is null or not public.is_company_member(p_company_id) then
    raise exception 'Você não tem acesso a esta empresa.';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.company_id = p_company_id
  ) then raise exception 'Cliente não encontrado nesta empresa.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione pelo menos um item ao orçamento.';
  end if;
  if p_valid_until is not null and p_valid_until < current_date then
    raise exception 'A validade do orçamento não pode estar no passado.';
  end if;
  if p_delivery_fee < 0 or p_discount < 0 then raise exception 'Valores inválidos.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid and company_id = p_company_id and active = true;
    if not found then raise exception 'Produto não encontrado ou inativo.'; end if;
    v_quantity := (v_item->>'quantity')::integer;
    v_price := (v_item->>'unit_price')::numeric;
    if v_quantity < 1 or v_price < 0 then raise exception 'Quantidade ou preço inválido.'; end if;
    v_subtotal := v_subtotal + (v_quantity * v_price);
  end loop;
  v_total := greatest(0, v_subtotal + coalesce(p_delivery_fee,0) - coalesce(p_discount,0));
  insert into public.rental_quotes (
    company_id, customer_id, valid_until, event_date, start_time, end_time,
    delivery_method, delivery_address, delivery_fee, discount, subtotal,
    total_amount, notes, created_by
  ) values (
    p_company_id, p_customer_id, p_valid_until, p_event_date, p_start_time, p_end_time,
    p_delivery_method, nullif(trim(p_delivery_address), ''),
    coalesce(p_delivery_fee,0), coalesce(p_discount,0), v_subtotal, v_total,
    nullif(trim(p_notes), ''), auth.uid()
  ) returning id into v_quote_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid and company_id = p_company_id;
    v_quantity := (v_item->>'quantity')::integer;
    v_price := (v_item->>'unit_price')::numeric;
    insert into public.rental_quote_items (
      company_id, quote_id, product_id, description, quantity, unit_price, subtotal
    ) values (
      p_company_id, v_quote_id, v_product.id, v_product.name,
      v_quantity, v_price, v_quantity * v_price
    );
  end loop;
  return v_quote_id;
end;
$$;
revoke all on function public.create_rental_quote_with_items(uuid,uuid,date,date,time,time,text,text,numeric,numeric,text,jsonb) from public, anon;
grant execute on function public.create_rental_quote_with_items(uuid,uuid,date,date,time,time,text,text,numeric,numeric,text,jsonb) to authenticated;
