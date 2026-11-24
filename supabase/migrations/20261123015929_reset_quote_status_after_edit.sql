create or replace function public.update_rental_quote_document(
  p_quote_id uuid,p_customer_id uuid,p_event_date date,p_start_time time,p_end_time time,
  p_delivery_method text,p_delivery_address text,p_delivery_fee numeric,p_discount numeric,
  p_notes text,p_items jsonb,p_snapshot jsonb
)
returns boolean language plpgsql security invoker set search_path=public as $$
declare
  v_quote public.rental_quotes%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_price numeric(12,2);
  v_subtotal numeric(12,2):=0;
begin
  select * into v_quote from public.rental_quotes where id=p_quote_id for update;
  if not found or not public.is_company_member(v_quote.company_id)
     or not public.has_company_role(v_quote.company_id,array['owner','admin']) then
    raise exception 'Você não tem permissão para editar este orçamento.';
  end if;
  if v_quote.status in ('converted','cancelled') then raise exception 'Este orçamento não pode mais ser editado.'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers c where c.id=p_customer_id and c.company_id=v_quote.company_id) then
    raise exception 'Cliente não encontrado nesta empresa.';
  end if;
  if p_delivery_method not in ('delivery','customer_pickup') or p_delivery_fee<0 or p_discount<0 then
    raise exception 'Dados de entrega ou valores inválidos.';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Adicione pelo menos um item ao orçamento.';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and company_id=v_quote.company_id;
    if not found then raise exception 'Um dos produtos não pertence a esta empresa.'; end if;
    v_quantity:=(v_item->>'quantity')::integer; v_price:=(v_item->>'unit_price')::numeric;
    if v_quantity<1 or v_price<0 or nullif(trim(v_item->>'description'),'') is null then raise exception 'Confira a descrição, quantidade e preço dos itens.'; end if;
    v_subtotal:=v_subtotal+(v_quantity*v_price);
  end loop;
  delete from public.rental_quote_items where quote_id=p_quote_id and company_id=v_quote.company_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity:=(v_item->>'quantity')::integer; v_price:=(v_item->>'unit_price')::numeric;
    insert into public.rental_quote_items(company_id,quote_id,product_id,description,quantity,unit_price,subtotal)
    values(v_quote.company_id,p_quote_id,(v_item->>'product_id')::uuid,trim(v_item->>'description'),v_quantity,v_price,v_quantity*v_price);
  end loop;
  update public.rental_quotes set customer_id=p_customer_id,event_date=p_event_date,start_time=p_start_time,end_time=p_end_time,
    delivery_method=p_delivery_method,delivery_address=nullif(trim(p_delivery_address),''),delivery_fee=p_delivery_fee,discount=p_discount,
    subtotal=v_subtotal,total_amount=greatest(0,v_subtotal+p_delivery_fee-p_discount),notes=nullif(trim(p_notes),''),
    quote_snapshot=coalesce(p_snapshot,'{}'::jsonb),
    status=case when status in ('sent','accepted','rejected','expired') then 'draft' else status end
  where id=p_quote_id and company_id=v_quote.company_id;
  return true;
end; $$;
revoke all on function public.update_rental_quote_document(uuid,uuid,date,time,time,text,text,numeric,numeric,text,jsonb,jsonb) from public,anon;
grant execute on function public.update_rental_quote_document(uuid,uuid,date,time,time,text,text,numeric,numeric,text,jsonb,jsonb) to authenticated;
